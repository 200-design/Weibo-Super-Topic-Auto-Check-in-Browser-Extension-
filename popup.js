// 彈窗邏輯：狀態展示、手動簽到、進度與結果、語言切換

let lang = "zh-CN";
let t = makeT(lang);

const el = (id) => document.getElementById(id);

function send(msg) {
  return chrome.runtime.sendMessage(msg).catch(() => null);
}

// ===== 語言 =====

async function initLang() {
  const { settings } = await chrome.storage.local.get("settings");
  lang = (settings && settings.lang) || detectLang();
  applyLang();
}

async function setLang(next) {
  lang = next;
  const { settings } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({ settings: Object.assign({}, settings, { lang }) });
  applyLang();
  refreshAll();
}

function applyLang() {
  t = makeT(lang);
  el("appTitle").textContent = t("appTitle");
  el("signNow").textContent = t("signNow");
  el("openLogin").textContent = t("openLogin");
  el("colTopic").textContent = t("colTopic");
  el("colStatus").textContent = t("colStatus");
  el("colMsg").textContent = t("colMsg");
  el("enableDailyLabel").textContent = t("enableDaily");
  document.querySelectorAll(".lang-toggle button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
  renderDailyHint();
}

// ===== 每日自動簽到設定 =====

function renderDailyHint() {
  el("dailyHint").textContent = el("enableDaily").checked
    ? t("dailyOn", { time: el("dailyTime").value })
    : t("dailyOff");
}

async function initDaily() {
  const { settings } = await chrome.storage.local.get("settings");
  el("enableDaily").checked = !!(settings && settings.enableDaily);
  if (settings && settings.dailyTime) el("dailyTime").value = settings.dailyTime;
  renderDailyHint();
}

async function saveDaily() {
  const { settings } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({
    settings: Object.assign({}, settings, {
      enableDaily: el("enableDaily").checked,
      dailyTime: el("dailyTime").value || "09:00",
    }),
  });
  await send({ cmd: "rescheduleAlarm" });
  renderDailyHint();
}

// ===== 登入狀態 =====

async function refreshLogin() {
  const box = el("loginStatus");
  box.className = "status";
  box.textContent = t("statusChecking");
  const res = await send({ cmd: "checkLogin" });
  if (res && res.login) {
    box.className = "status ok";
    box.textContent = t("loggedIn");
    el("openLogin").hidden = true;
    el("signNow").disabled = false;
  } else {
    box.className = "status warn";
    box.textContent = t("notLoggedIn");
    el("openLogin").hidden = false;
    el("signNow").disabled = true;
  }
}

// ===== 進度與結果 =====

function renderProgress(state) {
  const running = state && state.running;
  el("progress").hidden = !running;
  el("signNow").disabled = !!running;
  if (!running) return;

  el("signNow").textContent = t("signRunning");
  let text = t("phasePrepare");
  let pct = 0;
  if (state.phase === "list") {
    text = t("phaseList");
    pct = 5;
  } else if (state.phase === "sign") {
    text = t("phaseSign", {
      current: state.current || "…",
      done: state.done,
      total: state.total,
    });
    pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
  }
  el("progressText").textContent = text;
  el("progressBar").style.width = pct + "%";
}

function renderResult(lastResult) {
  const summary = el("summary");
  const table = el("resultTable");
  const body = el("resultBody");

  if (!lastResult) {
    summary.textContent = t("neverRun");
    table.hidden = true;
    return;
  }

  const time = new Date(lastResult.ts).toLocaleString(
    lang === "zh-TW" ? "zh-TW" : "zh-CN"
  );
  summary.textContent =
    t("doneSummary", {
      total: lastResult.total,
      success: lastResult.success,
      already: lastResult.alreadyChecked,
      failed: lastResult.failed,
    }) + "　" + t("lastRun", { time });

  const stText = { success: t("stSuccess"), already: t("stAlready"), failed: t("stFailed") };
  body.textContent = "";
  for (const d of lastResult.details || []) {
    const tr = document.createElement("tr");
    for (const v of [d.name, stText[d.status] || d.status, d.message || ""]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.hidden = !(lastResult.details || []).length;
}

async function refreshAll() {
  const res = await send({ cmd: "getState" });
  if (!res) return;
  renderProgress(res.state);
  if (res.state && res.state.error === "not_logged_in") {
    el("summary").textContent = t("errNotLoggedIn");
  } else if (res.state && res.state.error) {
    el("summary").textContent = t("errGeneric", { msg: res.state.error });
  }
  if (!(res.state && res.state.running)) {
    el("signNow").textContent = t("signNow");
    renderResult(res.lastResult);
  }
}

// ===== 事件 =====

el("signNow").addEventListener("click", async () => {
  el("signNow").disabled = true;
  el("summary").textContent = "";
  await send({ cmd: "startCheckin" });
  refreshAll();
});

el("openLogin").addEventListener("click", () => send({ cmd: "openLogin" }));

el("enableDaily").addEventListener("change", saveDaily);
el("dailyTime").addEventListener("change", saveDaily);

document.querySelectorAll(".lang-toggle button").forEach((b) => {
  b.addEventListener("click", () => setLang(b.dataset.lang));
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "progress") renderProgress(msg.state);
  if (msg.type === "finished") {
    el("signNow").textContent = t("signNow");
    el("signNow").disabled = false;
    el("progress").hidden = true;
    if (msg.error === "not_logged_in") {
      el("summary").textContent = t("errNotLoggedIn");
      refreshLogin();
    } else if (msg.error) {
      el("summary").textContent = t("errGeneric", { msg: msg.error });
    } else if (msg.result) {
      renderResult(msg.result);
    }
  }
});

// ===== 啟動 =====

(async function init() {
  await initLang();
  await initDaily();
  refreshAll();
  refreshLogin();
})();
