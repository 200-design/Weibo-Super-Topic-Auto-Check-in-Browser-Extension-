# Weibo Super Topic Auto Check-in (Browser Extension)

A Chrome / Edge extension that automatically checks in to all the Weibo Super Topics (超话) you follow, every day.

**Zero backend, zero cost, zero configuration** — no server, no cookie extraction, no config files. Install, log in to Weibo, done. All data stays in your own browser.

[简体中文](README.md)

## Features

- **Auto-discovers your topics**: fetches the full list of Super Topics you follow (with pagination) — no manual list to maintain
-**One-click check-in**: iterates through all topics with a random 3–8s delay between requests (human-like behavior)
- **Daily schedule**: set a time and it runs automatically every day
- **Catch-up runs**: browser was closed at the scheduled time? It catches up on next launch (already-checked topics are skipped, so re-runs are harmless)
- **At-a-glance results**: badge on the extension icon (green number = done, red ! = failures), with a detailed per-topic table in the popup
- **Bilingual UI**: Simplified / Traditional Chinese, auto-detected and switchable

## Install

### From the store (recommended)

> Edge Add-ons listing is under review; link coming soon

### Manual (load unpacked)

1. [Download](https://github.com/200-design/Weibo-Super-Topic-Auto-Check-in-Browser-Extension-/archive/refs/heads/main.zip) and unzip this repository
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked** and select the unzipped folder

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Saves your settings and the latest run result locally |
| `alarms` | Daily scheduled trigger |
| `scripting` + `tabs` | Weibo validates the origin of check-in requests, so they must be sent from a m.weibo.cn page context. If no Weibo tab exists, a background tab is opened and closed automatically |
| Host permissions (`m.weibo.cn`, `passport.weibo.com`) | Weibo domains only, for the topic list and check-in requests |

## Privacy

- No data collection, no uploads, no external server communication
- Your cookies are never read, stored, or transmitted — login state is handled entirely by the browser
- Everything lives in your browser's local extension storage; uninstalling removes it all
- Fully open source

## Limitations

- The browser must be running for scheduled check-ins; missed days (browser never opened) cannot be recovered
- Weibo may change its APIs at any time — please file an issue if something breaks
- Use at your own risk

## License

[MIT](LICENSE)
