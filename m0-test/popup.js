const out = document.getElementById("out");
const buttons = Array.from(document.querySelectorAll("button[data-route]"));

function log(line) {
  if (out.textContent === "（結果會顯示在這裡）") out.textContent = "";
  out.textContent += line + "\n";
  out.scrollTop = out.scrollHeight;
}

function setBusy(busy) {
  document.querySelectorAll("button").forEach((b) => (b.disabled = busy));
}

async function runOne(route, method, label) {
  log(`—— ${label} ——`);
  try {
    const res = await chrome.runtime.sendMessage({ cmd: "test", route, method });
    const lines = (res && res.lines) || ["❌ 背景沒有回應"];
    lines.forEach((l) => log("  " + l));
  } catch (e) {
    log("  ❌ 呼叫失敗：" + e.message);
  }
}

buttons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    setBusy(true);
    await runOne(btn.dataset.route, btn.dataset.method, btn.textContent);
    setBusy(false);
  });
});

document.getElementById("runAll").addEventListener("click", async () => {
  setBusy(true);
  for (const btn of buttons) {
    if (btn.dataset.solo) continue; // 診斷測試不納入「全部執行」
    await runOne(btn.dataset.route, btn.dataset.method, btn.textContent);
  }
  log("—— 全部完成，請按「複製全部結果」貼回給 Claude ——");
  setBusy(false);
});

document.getElementById("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(out.textContent);
    log("（已複製到剪貼簿）");
  } catch (e) {
    log("（自動複製失敗，請手動反白上面文字後 Ctrl+C）");
  }
});

document.getElementById("clear").addEventListener("click", () => {
  out.textContent = "（結果會顯示在這裡）";
});
