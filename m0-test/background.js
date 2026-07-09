// M0 技術驗證 service worker
// 兩個測試函式（testRouteA / testRouteB）刻意寫成「自足函式」：
// 不引用任何外部變數，因此同一份程式碼既能在 service worker 直接呼叫，
// 也能原封不動透過 chrome.scripting.executeScript 注入微博頁面執行。

// ===== 路線 A：m.weibo.cn（行動端 H5）=====
async function testRouteA() {
  const lines = [];
  try {
    // 第 1 層：登入偵測
    const cfgRes = await fetch("https://m.weibo.cn/api/config", { credentials: "include" });
    const cfgText = await cfgRes.text();
    let cfg;
    try { cfg = JSON.parse(cfgText); } catch (e) {
      lines.push(`❌ 登入偵測：回應不是 JSON（HTTP ${cfgRes.status}），開頭：${cfgText.slice(0, 80)}`);
      return lines;
    }
    if (!(cfg && cfg.data && cfg.data.login)) {
      lines.push("❌ 登入偵測：微博回報未登入（Cookie 沒帶上，或你尚未登入 m.weibo.cn）");
      return lines;
    }
    lines.push("✅ 登入偵測 OK（Cookie 有帶上）");
    const st = cfg.data.st;

    // 第 2 層：超話列表第一頁
    const listRes = await fetch(
      "https://m.weibo.cn/api/container/getIndex?containerid=100803_-_followsuper",
      { credentials: "include" }
    );
    const listText = await listRes.text();
    let list;
    try { list = JSON.parse(listText); } catch (e) {
      lines.push(`❌ 超話列表：回應不是 JSON（HTTP ${listRes.status}），開頭：${listText.slice(0, 80)}`);
      return lines;
    }
    if (!list || list.ok !== 1) {
      lines.push(`❌ 超話列表：ok=${list && list.ok}，msg=${(list && list.msg) || "無"}`);
      return lines;
    }
    const items = [];
    for (const card of (list.data && list.data.cards) || []) {
      for (const it of card.card_group || [card]) {
        if (it.title_sub) items.push(it);
      }
    }
    const sample = items.slice(0, 3).map((i) => i.title_sub).join("、");
    lines.push(`✅ 超話列表 OK：第一頁 ${items.length} 個（例：${sample || "解析不出名稱"}）`);
    const sinceId = list.data && list.data.cardlistInfo && list.data.cardlistInfo.since_id;
    lines.push(sinceId ? `✅ 翻頁參數 since_id 存在：${sinceId}` : "ℹ️ 沒有 since_id（可能超話只有一頁）");

    // 第 3 層：對「一個」超話實際簽到（只測一個，避免批量請求）
    let target = null, scheme = null;
    for (const it of items) {
      const btn = (it.buttons || []).find((b) => (b.name || "").includes("签到"));
      if (btn && btn.scheme) { target = it; scheme = btn.scheme; break; }
    }
    if (!scheme) {
      lines.push("ℹ️ 簽到：列表裡找不到「签到」按鈕（可能今天全簽過了，或按鈕結構不同）— 請把上面列表結果貼回來即可");
      return lines;
    }
    let url = scheme.startsWith("http") ? scheme : "https://m.weibo.cn" + scheme;
    if (st && !url.includes("st=")) url += (url.includes("?") ? "&" : "?") + "st=" + st;

    // 先試 GET，不行再試 POST（哪種能通就是 M0 要的答案）
    for (const method of ["GET", "POST"]) {
      const sRes = await fetch(url, {
        method,
        credentials: "include",
        headers: { "x-xsrf-token": st || "" },
      });
      const sText = await sRes.text();
      let sJson = null;
      try { sJson = JSON.parse(sText); } catch (e) { /* 保持 null */ }
      if (sJson && sJson.ok === 1) {
        const msg = (sJson.data && (sJson.data.msg || (sJson.data.button && sJson.data.button.name))) || "成功";
        lines.push(`✅ 簽到 OK（${target.title_sub}，用 ${method}）：${msg}`);
        return lines;
      }
      lines.push(`ℹ️ 簽到用 ${method} 未成功：HTTP ${sRes.status}，回應開頭：${sText.slice(0, 100)}`);
    }
    lines.push(`❌ 簽到：GET / POST 都未成功（目標超話：${target.title_sub}）`);
  } catch (e) {
    lines.push(`❌ 發生例外：${e.message}`);
  }
  return lines;
}

// ===== 路線 B：weibo.com（桌面端）=====
async function testRouteB() {
  const lines = [];
  try {
    // 列表 API 本身就能兼作登入偵測（未登入時拿不到資料）
    const listRes = await fetch(
      "https://weibo.com/ajax/profile/topicContent?tabid=231093_-_chaohua&page=1",
      { credentials: "include" }
    );
    const listText = await listRes.text();
    let list;
    try { list = JSON.parse(listText); } catch (e) {
      lines.push(`❌ 超話列表：回應不是 JSON（HTTP ${listRes.status}），開頭：${listText.slice(0, 80)}`);
      return lines;
    }
    if (!list || list.ok !== 1) {
      lines.push(`❌ 超話列表：ok=${list && list.ok}，訊息：${(list && (list.msg || list.message)) || listText.slice(0, 80)}`);
      return lines;
    }
    const arr = (list.data && (list.data.list || list.data.cards)) || [];
    const names = arr.slice(0, 3).map((x) => x.topic_name || x.title || x.name).filter(Boolean);
    lines.push(`✅ 超話列表 OK：第一頁 ${arr.length} 個（例：${names.join("、") || "解析不出名稱，結構需人工確認"}）`);
    if (list.data && list.data.total_number != null) {
      lines.push(`ℹ️ 超話總數 total_number=${list.data.total_number}`);
    }

    // 對第一個超話實際簽到
    const first = arr[0];
    const pageId = first && (first.id || first.pageId || first.oid);
    if (!pageId) {
      lines.push("ℹ️ 簽到：解析不出 pageid，略過（請把列表結果貼回來）");
      return lines;
    }
    const signUrl =
      "https://weibo.com/p/aj/general/button?ajwvr=6&api=http://i.huati.weibo.com/aj/super/checkin&id=" +
      pageId + "&location=page_100808_super_index&_=" + Date.now();
    const sRes = await fetch(signUrl, { credentials: "include" });
    const sText = await sRes.text();
    let sJson = null;
    try { sJson = JSON.parse(sText); } catch (e) { /* 保持 null */ }
    if (sJson && (sJson.code === "100000" || sJson.ok === 1)) {
      const name = first.topic_name || first.title || pageId;
      lines.push(`✅ 簽到 OK（${name}）：${(sJson.data && sJson.data.tipMessage) || sJson.msg || "成功"}`);
    } else {
      lines.push(`❌ 簽到：HTTP ${sRes.status}，回應開頭：${sText.slice(0, 100)}`);
    }
  } catch (e) {
    lines.push(`❌ 發生例外：${e.message}`);
  }
  return lines;
}

// ===== 診斷 5：傾印超話卡片的原始結構（找出簽到按鈕藏在哪）=====
async function inspectRouteA() {
  const lines = [];
  try {
    const listRes = await fetch(
      "https://m.weibo.cn/api/container/getIndex?containerid=100803_-_followsuper",
      { credentials: "include" }
    );
    const list = JSON.parse(await listRes.text());
    const items = [];
    for (const card of (list.data && list.data.cards) || []) {
      for (const it of card.card_group || [card]) {
        if (it.title_sub) items.push(it);
      }
    }
    if (!items.length) {
      lines.push("❌ 列表沒有解析出任何超話項目");
      return lines;
    }
    // 所有項目上出現過的按鈕名稱
    const btnNames = [];
    for (const it of items) {
      for (const b of it.buttons || []) btnNames.push(`${it.title_sub}:「${b.name}」`);
    }
    lines.push(btnNames.length
      ? `按鈕總覽：${btnNames.join("；")}`
      : "所有項目都沒有 buttons 欄位");
    // 傾印第一個項目的完整 JSON（截斷）
    lines.push("―― 第 1 個項目的原始結構（截 1500 字）――");
    lines.push(JSON.stringify(items[0]).slice(0, 1500));
  } catch (e) {
    lines.push(`❌ 發生例外：${e.message}`);
  }
  return lines;
}

// ===== 診斷 6：直接呼叫已知的行動端簽到端點（不依賴按鈕解析）=====
async function checkinRouteA2() {
  const lines = [];
  try {
    const cfg = JSON.parse(
      await (await fetch("https://m.weibo.cn/api/config", { credentials: "include" })).text()
    );
    if (!(cfg && cfg.data && cfg.data.login)) {
      lines.push("❌ 未登入，中止");
      return lines;
    }
    const st = cfg.data.st;
    const list = JSON.parse(
      await (await fetch(
        "https://m.weibo.cn/api/container/getIndex?containerid=100803_-_followsuper",
        { credentials: "include" }
      )).text()
    );
    const items = [];
    for (const card of (list.data && list.data.cards) || []) {
      for (const it of card.card_group || [card]) {
        if (it.title_sub) items.push(it);
      }
    }
    const first = items[0];
    if (!first) { lines.push("❌ 列表為空，中止"); return lines; }
    const m = (first.scheme || "").match(/containerid=(\w+)/);
    if (!m) {
      lines.push(`❌ 從 scheme 解析不出 containerid：${(first.scheme || "無").slice(0, 120)}`);
      return lines;
    }
    const pageid = m[1];
    lines.push(`目標超話：${first.title_sub}（containerid=${pageid}）`);
    const requestUrl = encodeURIComponent(
      `http://i.huati.weibo.com/mobile/super/active_checkin?pageid=${pageid}`
    );
    const url = `https://m.weibo.cn/api/container/button?type=original&request_url=${requestUrl}&st=${st}`;
    for (const method of ["GET", "POST"]) {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "x-xsrf-token": st || "" },
      });
      const text = await res.text();
      lines.push(`${method} → HTTP ${res.status}，回應：${text.slice(0, 200)}`);
      let j = null;
      try { j = JSON.parse(text); } catch (e) { /* 保持 null */ }
      if (j && j.ok === 1) {
        lines.push(`✅ 簽到端點可用（用 ${method}）`);
        return lines;
      }
    }
    lines.push("ℹ️ 兩種方法都沒有回 ok=1，請把上面原始回應貼回來");
  } catch (e) {
    lines.push(`❌ 發生例外：${e.message}`);
  }
  return lines;
}

// ===== 測試調度 =====
const ORIGINS = { A: "https://m.weibo.cn", B: "https://weibo.com" };
const FUNCS = { A: testRouteA, B: testRouteB, inspectA: inspectRouteA, checkinA2: checkinRouteA2 };

async function ensureTab(origin) {
  const tabs = await chrome.tabs.query({ url: origin + "/*" });
  if (tabs.length) return tabs[0];
  const tab = await chrome.tabs.create({ url: origin + "/", active: false });
  await new Promise((resolve) => {
    const timer = setTimeout(done, 15000); // 最多等 15 秒
    function done() {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    }
    function onUpdated(id, info) {
      if (id === tab.id && info.status === "complete") done();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  return tab;
}

async function runTest(route, method) {
  if (method === "sw") {
    return FUNCS[route]();
  }
  // 注入模式：找到（或開啟）對應網域的分頁，把測試函式丟進去執行
  const tab = await ensureTab(ORIGINS[route]);
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: FUNCS[route],
  });
  return (results && results[0] && results[0].result) || ["❌ 注入後沒有拿到回傳結果"];
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.cmd === "test") {
    runTest(msg.route, msg.method)
      .then((lines) => sendResponse({ lines }))
      .catch((e) => sendResponse({ lines: ["❌ 測試執行失敗：" + e.message] }));
    return true; // 非同步回應
  }
});
