// 微博 API 封裝（在 background service worker 中以 importScripts 載入）
//
// M0 驗證結論：簽到請求必須從 m.weibo.cn 頁面上下文發出（SW 直發帶不了
// Referer 會被拒 errno 100015），因此所有請求統一透過
// chrome.scripting.executeScript 注入微博分頁執行，只維護一條程式路徑。

const WEIBO_ORIGIN = "https://m.weibo.cn";
const LIST_URL = WEIBO_ORIGIN + "/api/container/getIndex?containerid=100803_-_followsuper";
const CONFIG_URL = WEIBO_ORIGIN + "/api/config";
const MAX_LIST_PAGES = 30; // 翻頁保險上限，防止 since_id 異常時無限迴圈

// ===== 分頁管理 =====

async function ensureWeiboTab() {
  const tabs = await chrome.tabs.query({ url: WEIBO_ORIGIN + "/*" });
  if (tabs.length) return { tab: tabs[0], created: false };
  const tab = await chrome.tabs.create({ url: WEIBO_ORIGIN + "/", active: false });
  await waitTabComplete(tab.id, 20000);
  return { tab, created: true };
}

function waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function done() {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    }
    function onUpdated(id, info) {
      if (id === tabId && info.status === "complete") done();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

// ===== 底層：在微博分頁中執行一次 fetch =====

async function pageFetch(tabId, url, options) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (url, options) => {
      const res = await fetch(url, Object.assign({ credentials: "include" }, options || {}));
      return { status: res.status, body: await res.text() };
    },
    args: [url, options || null],
  });
  const r = results && results[0] && results[0].result;
  if (!r) throw new Error("页面注入执行失败（微博标签页可能已关闭）");
  let json = null;
  try { json = JSON.parse(r.body); } catch (e) { /* 回應非 JSON 時保持 null */ }
  return { status: r.status, json, body: r.body };
}

// ===== 登入偵測（SW 直發即可，M0 驗證可行；不需開分頁）=====

async function checkLoginDirect() {
  const res = await fetch(CONFIG_URL, { credentials: "include" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* 保持 null */ }
  return { login: !!(json && json.data && json.data.login) };
}

// 簽到流程用：從頁面上下文取得登入狀態 + st（XSRF token）
async function getLoginState(tabId) {
  const { json } = await pageFetch(tabId, CONFIG_URL);
  return {
    login: !!(json && json.data && json.data.login),
    st: (json && json.data && json.data.st) || "",
  };
}

// ===== 超話列表（since_id 自動翻頁）=====
// 回傳 [{ name, id, canSign, signed, scheme }]

async function fetchAllTopics(tabId) {
  const topics = [];
  const seen = new Set();
  let sinceId = "";

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const url = sinceId ? LIST_URL + "&since_id=" + encodeURIComponent(sinceId) : LIST_URL;
    const { json } = await pageFetch(tabId, url);
    if (!json || json.ok !== 1) {
      if (topics.length) break; // 後續頁失敗時，用已取得的部分繼續
      throw new Error("超话列表获取失败：" + ((json && json.msg) || "非预期响应"));
    }

    let added = 0;
    for (const card of (json.data && json.data.cards) || []) {
      for (const it of card.card_group || [card]) {
        if (!it.title_sub) continue;
        const m = (it.scheme || "").match(/containerid=(\w+)/);
        const id = m ? m[1] : it.itemid || it.title_sub;
        if (seen.has(id)) continue;
        seen.add(id);
        const btn = (it.buttons || [])[0] || {};
        topics.push({
          name: it.title_sub,
          id,
          canSign: !!(btn.scheme && (btn.name || "").includes("签到")),
          signed: (btn.name || "").includes("已签"),
          scheme: btn.scheme || null,
        });
        added++;
      }
    }

    const next = json.data && json.data.cardlistInfo && json.data.cardlistInfo.since_id;
    if (!next || next === sinceId || !added) break;
    sinceId = next;
    await sleep(800 + Math.random() * 700); // 翻頁間小延遲，模擬正常瀏覽
  }
  return topics;
}

// ===== 簽到單一超話 =====
// 直接呼叫列表按鈕自帶的 scheme（M0 驗證：GET + st 參數即可成功）

async function checkinTopic(tabId, topic, st) {
  let url = topic.scheme.startsWith("http") ? topic.scheme : WEIBO_ORIGIN + topic.scheme;
  if (st && !url.includes("st=")) url += (url.includes("?") ? "&" : "?") + "st=" + st;

  const { status, json, body } = await pageFetch(tabId, url, {
    headers: { "x-xsrf-token": st || "" },
  });

  if (json && json.ok === 1) {
    const msg =
      (json.data && (json.data.msg || (json.data.button && json.data.button.name))) || "已签到";
    return { name: topic.name, status: "success", message: msg };
  }
  const msg = (json && json.msg) || `HTTP ${status}: ${body.slice(0, 80)}`;
  if (msg.includes("已签")) {
    return { name: topic.name, status: "already", message: msg };
  }
  return { name: topic.name, status: "failed", message: msg };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
