# 天道有BUG：众生劫

## 发布网页

1. 将本工程文件（包括隐藏的 `.github`）推送到 GitHub 公开仓库的 `main` 分支。
2. 在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。
3. 在 **Actions → Publish game** 运行工作流，成功后从 **Settings → Pages** 打开公开地址。此时可玩本地模拟。

## 开通共享 AI

1. 在 `worker/wrangler.toml` 设置 `GAME_ORIGIN`。例如游戏地址是 `https://alice.github.io/tiandao/`，来源填 `https://alice.github.io`。按服务商要求填写 `AI_BASE_URL` 和 `AI_MODEL`。服务须支持 Chat Completions 与 `max_completion_tokens`。
2. 进入 `worker` 目录，运行以下命令并按提示登录 Cloudflare 和输入 API Key。

   ```sh
   npx wrangler@4 login
   npx wrangler@4 deploy
   npx wrangler@4 secret put AI_API_KEY
   ```

3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 添加 `GAME_API_URL`，值为 Worker 公开地址加 `/play`。重新运行 **Publish game**。
4. 打开游戏，验证 AI 开局、传音和第一轮推演。访客可以在接口不可用时改用本地模拟并重开。

API Key 只填入 Worker Secret。公开 AI 由部署者承担费用。代理配置了来源检查、请求频率限制和请求大小、输出长度上限。Cloudflare 请求频率按节点近似计算，来源检查也没有用户认证。公开前请使用专用密钥和服务商可执行的用量上限。

- [GitHub Pages 发布设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Worker 限流](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
