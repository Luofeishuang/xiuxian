# 你也来修仙？

游戏网页在 `site/index.html`。推送到 `main` 后，GitHub Actions 会发布到 [游戏页面](https://luofeishuang.github.io/xiuxian/)。

线上 AI 由 Cloudflare Worker `tiandao-game-api` 提供。Worker 源码在 `worker/`，密钥放在 Cloudflare 的 `GPTGOD_API_KEY` Secret 中。默认使用 `gpt-6-sol`，可用 Worker 变量 `SHEJU_MODEL` 覆盖。页面顶部可测试连接，未配置 AI 时会进入模拟模式。
