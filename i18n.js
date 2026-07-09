// 簡繁雙語文案字典（popup 使用）
// 預設依 navigator.language 自動選擇，用戶可在彈窗切換並記住於 settings.lang

const I18N = {
  "zh-CN": {
    appTitle: "微博超话自动签到",
    statusChecking: "正在检测登录状态…",
    loggedIn: "✅ 已登录微博",
    notLoggedIn: "⚠️ 未登录，请先登录微博",
    openLogin: "打开微博登录页",
    signNow: "立即签到",
    signRunning: "签到进行中…",
    phasePrepare: "正在准备…",
    phaseList: "正在获取超话列表…",
    phaseSign: "正在签到：{current}（{done}/{total}）",
    doneSummary: "共 {total} 个超话：成功 {success}，已签 {already}，失败 {failed}",
    lastRun: "上次执行：{time}",
    neverRun: "还没有执行过签到",
    errNotLoggedIn: "未登录，签到已中止",
    errGeneric: "执行失败：{msg}",
    colTopic: "超话",
    colStatus: "状态",
    colMsg: "说明",
    stSuccess: "✅ 成功",
    stAlready: "⏭ 已签",
    stFailed: "❌ 失败",
    enableDaily: "每天自动签到",
    dailyOn: "已开启，每天 {time} 自动执行；当天错过会在浏览器启动时补签",
    dailyOff: "自动签到已关闭",
  },
  "zh-TW": {
    appTitle: "微博超話自動簽到",
    statusChecking: "正在偵測登入狀態…",
    loggedIn: "✅ 已登入微博",
    notLoggedIn: "⚠️ 未登入，請先登入微博",
    openLogin: "開啟微博登入頁",
    signNow: "立即簽到",
    signRunning: "簽到進行中…",
    phasePrepare: "正在準備…",
    phaseList: "正在取得超話列表…",
    phaseSign: "正在簽到：{current}（{done}/{total}）",
    doneSummary: "共 {total} 個超話：成功 {success}，已簽 {already}，失敗 {failed}",
    lastRun: "上次執行：{time}",
    neverRun: "還沒有執行過簽到",
    errNotLoggedIn: "未登入，簽到已中止",
    errGeneric: "執行失敗：{msg}",
    colTopic: "超話",
    colStatus: "狀態",
    colMsg: "說明",
    stSuccess: "✅ 成功",
    stAlready: "⏭ 已簽",
    stFailed: "❌ 失敗",
    enableDaily: "每天自動簽到",
    dailyOn: "已開啟，每天 {time} 自動執行；當天錯過會在瀏覽器啟動時補簽",
    dailyOff: "自動簽到已關閉",
  },
};

function detectLang() {
  const l = (navigator.language || "").toLowerCase();
  return l.startsWith("zh-tw") || l.startsWith("zh-hk") || l.startsWith("zh-mo")
    ? "zh-TW"
    : "zh-CN";
}

// t("phaseSign", { current: "xx", done: 1, total: 24 })
function makeT(lang) {
  const dict = I18N[lang] || I18N["zh-CN"];
  return function t(key, vars) {
    let s = dict[key] || key;
    for (const k of Object.keys(vars || {})) {
      s = s.replaceAll("{" + k + "}", String(vars[k]));
    }
    return s;
  };
}
