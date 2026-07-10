// Service worker：簽到主流程、每日定時、補簽、訊息調度

importScripts("weibo-api.js");

const ALARM_NAME = "dailyCheckin";

// 執行狀態只存在記憶體：流程進行中 SW 必然存活；SW 重啟即代表沒有進行中的流程
let runState = { running: false, phase: "idle", done: 0, total: 0, current: "" };

function broadcast(type, payload) {
  chrome.runtime.sendMessage(Object.assign({ type }, payload || {})).catch(() => {
    // popup 未開啟時沒有接收端，屬正常情況
  });
}

function setState(patch) {
  runState = Object.assign({}, runState, patch);
  broadcast("progress", { state: runState });
}

function localDateString() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function randomDelayMs() {
  return 3000 + Math.random() * 5000; // 3–8 秒
}

// ===== 每日定時與補簽 =====

function nextOccurrence(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

async function rescheduleAlarm() {
  const { settings } = await chrome.storage.local.get("settings");
  await chrome.alarms.clear(ALARM_NAME);
  if (settings && settings.enableDaily && settings.dailyTime) {
    chrome.alarms.create(ALARM_NAME, {
      when: nextOccurrence(settings.dailyTime),
      periodInMinutes: 24 * 60,
    });
  }
}

// 瀏覽器在設定時間未開啟時，啟動後補跑（簽到冪等，重跑無害）
async function catchUpIfMissed() {
  const { settings, lastRunDate } = await chrome.storage.local.get(["settings", "lastRunDate"]);
  if (!(settings && settings.enableDaily && settings.dailyTime)) return;
  if (lastRunDate === localDateString()) return;
  const [h, m] = settings.dailyTime.split(":").map(Number);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return; // 今天的設定時間還沒到
  runCheckinAll();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runCheckinAll();
});

chrome.runtime.onStartup.addListener(() => {
  rescheduleAlarm();
  catchUpIfMissed();
});

chrome.runtime.onInstalled.addListener(() => {
  rescheduleAlarm();
});

// ===== 圖示徽章：一眼看到今天的執行結果 =====

function setBadge(result, error) {
  if (error || (result && result.failed > 0)) {
    chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
    chrome.action.setBadgeText({ text: "!" });
  } else if (result) {
    chrome.action.setBadgeBackgroundColor({ color: "#188038" });
    chrome.action.setBadgeText({ text: String(result.success + result.alreadyChecked) });
  }
}

// ===== 簽到主流程 =====

async function runCheckinAll() {
  if (runState.running) return;
  setState({ running: true, phase: "prepare", done: 0, total: 0, current: "", error: null });

  let createdTabId = null;
  try {
    const { tab, created } = await ensureWeiboTab();
    if (created) createdTabId = tab.id;

    const login = await getLoginState(tab.id);
    if (!login.login) {
      setState({ running: false, phase: "idle", error: "not_logged_in" });
      setBadge(null, "not_logged_in");
      broadcast("finished", { error: "not_logged_in" });
      return;
    }

    setState({ phase: "list" });
    const topics = await fetchAllTopics(tab.id);
    const toSign = topics.filter((t) => t.canSign);
    const details = topics
      .filter((t) => t.signed)
      .map((t) => ({ name: t.name, status: "already", message: "已签" }));

    setState({ phase: "sign", total: topics.length, done: details.length });

    let st = login.st; // st 會在流程中被伺服器輪換，驗簽失敗時需重取
    for (let i = 0; i < toSign.length; i++) {
      const topic = toSign[i];
      setState({ current: topic.name });
      let record;
      try {
        record = await checkinTopic(tab.id, topic, st);
        if (record.status === "failed" && record.message.includes("验签")) {
          await sleep(1000);
          const fresh = await getLoginState(tab.id);
          if (fresh.st) st = fresh.st;
          record = await checkinTopic(tab.id, topic, st);
        }
      } catch (e) {
        record = { name: topic.name, status: "failed", message: e.message };
      }
      details.push(record);
      setState({ done: runState.done + 1 });
      if (i < toSign.length - 1) await sleep(randomDelayMs()); // 最後一個不需等待
    }

    const result = {
      ts: Date.now(),
      total: topics.length,
      success: details.filter((d) => d.status === "success").length,
      alreadyChecked: details.filter((d) => d.status === "already").length,
      failed: details.filter((d) => d.status === "failed").length,
      failures: details
        .filter((d) => d.status === "failed")
        .map((d) => ({ name: d.name, reason: d.message })),
      details,
    };
    await chrome.storage.local.set({ lastResult: result, lastRunDate: localDateString() });

    setState({ running: false, phase: "idle", current: "" });
    setBadge(result, null);
    broadcast("finished", { result });
  } catch (e) {
    setState({ running: false, phase: "idle", error: e.message });
    setBadge(null, e.message);
    broadcast("finished", { error: e.message });
  } finally {
    if (createdTabId != null) {
      try { await chrome.tabs.remove(createdTabId); } catch (e) { /* 已被用戶關閉 */ }
    }
  }
}

// ===== 訊息調度（popup ↔ background）=====

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.cmd) return;

  if (msg.cmd === "getState") {
    chrome.action.setBadgeText({ text: "" }); // 用戶點開彈窗即視為已讀，清掉徽章
    chrome.storage.local
      .get(["lastResult", "lastRunDate"])
      .then(({ lastResult, lastRunDate }) => {
        sendResponse({ state: runState, lastResult, lastRunDate });
      });
    return true;
  }

  if (msg.cmd === "rescheduleAlarm") {
    rescheduleAlarm().then(() => sendResponse({}));
    return true;
  }

  if (msg.cmd === "checkLogin") {
    checkLoginDirect()
      .then(sendResponse)
      .catch((e) => sendResponse({ login: false, error: e.message }));
    return true;
  }

  if (msg.cmd === "startCheckin") {
    if (runState.running) {
      sendResponse({ started: false, reason: "running" });
      return;
    }
    runCheckinAll();
    sendResponse({ started: true });
    return;
  }

  if (msg.cmd === "openLogin") {
    chrome.tabs.create({ url: "https://m.weibo.cn/" });
    sendResponse({});
  }
});
