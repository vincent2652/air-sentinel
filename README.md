# 空气哨兵 · GitHub 公网部署包

纯静态公网托管 + 官方数据快照，**不需要任何常开服务器、不需要任何 API key**。

- 网页：`index.html`（单文件 PWA，自动刷新/常亮/防烧屏/国标美标双口径）
- 数据：GitHub Actions 每小时抓中国环境监测总站官方实时发布（免密钥），提交为静态 JSON 快照（`data/`），网页同源读取，绕开 cnemc 无 CORS 的限制
- 刷新节奏：Actions 每小时重抓 → 网页每 5 分钟轮询快照（带缓存穿透参数）→ 代码版本每 10 分钟自检自动重载。全程无需手动刷新

## 启用路径 A（推荐）：在本机授权后交给 agent

```bash
brew install gh && gh auth login   # 浏览器里确认你自己的 GitHub 账号
```
然后告诉 agent"gh 登录好了"，由其完成建仓、推送、启用 Pages、触发首次快照与验收。

## 启用路径 B：手动三步

1. github.com/new 建一个 **public** 仓库（免费 Actions 定时任务要求 public），名字如 `air-sentinel`
2. 推送本目录内容：
   ```bash
   cd github-deploy
   git init && git add -A && git commit -m "air sentinel"
   git branch -M main
   git remote add origin git@github.com:<你的用户名>/air-sentinel.git
   git push -u origin main
   ```
3. 仓库 Actions 页手动 Run 一次 `air-snapshot`（之后每小时自动）；再 Settings → Pages → Source 选 **Branch: pages / (root)**。地址即 `https://<你的用户名>.github.io/air-sentinel/`

## 说明

- `pages` 分支由工作流以 orphan + force-push 方式生成，不积累历史、仓库不膨胀；Pages 只从该分支发布
- 仓库内容仅为前端代码与空气质量公开数据，不含任何密钥或个人信息
- 本地复现快照：`node scripts/build-snapshot.mjs`（可用 `SNAP_OUT` 改输出目录）
- 快照接口（免密钥）：`air.cnemc.cn:18007` 的 `CityData/GetAllCityRealTimeAQIModels`、`CityData/GetAQIDataPublishLive`、`HourChangesPublish/GetCityRealTimeAqiHistoryByCondition`
