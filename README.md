# 空气哨兵 AirSentinel

iPhone 常亮实时空气质量看板（个人项目）。公网地址：**https://vincent2652.github.io/air-sentinel/**

## 背景与目标

- 痛点：常用 App（Air Matters）只能手动下拉刷新，没法把一台 iPhone 一直开着当空气质量展示屏。
- 目标：加到主屏幕后**全自动**——定时取数重绘、失败自动重试、数据过期明确警示、屏幕常亮、防烧屏，全程不需要任何下拉或手动刷新。
- 展示参考 Air Matters 的信息结构：超大 AQI 数字 + 六级配色 + 首要污染物 + 六项污染物分项 + 过去 24 小时曲线 + 逐日区间预报 + 现场气象 + 健康建议。
- 数据诉求：尽量使用中国环境监测总站（国控站）官方实测值；拿不到官方原始值时降级并**在页面上明确标注**来源与口径，绝不混充。

## 架构：纯静态 + 定时快照，无常开服务器

```
iPhone 网页 ──每5分钟轮询──> 同源 data/cities.json + data/city/<城市码>.json（静态快照）
快照生产者（自动互补）：
  ① 能直连 cnemc 的机器（如家里 Mac）：scripts/snapshot-push.sh，可装 launchd 每小时自动
     → 官方原始浓度，零换算
  ② GitHub Actions 每小时：云端出口到不了 cnemc → 自动降级 WAQI 官方转发
     → 国标为换算值，页面标注"换算值"
     保护规则：仓库里已有 90 分钟内的 cnemc 快照时 Actions 跳过，不覆盖原始数据
```

为什么不让浏览器直接请求 cnemc：cnemc 不返回 CORS 头，浏览器跨域请求一律被拒——这与"手机能不能打开政府网站"无关，是浏览器安全模型限制。所以官方数据必须由服务端/CI 代取后落成静态 JSON。

## 数据时效：每一环慢多少

| 环节 | 额外延迟 | 说明 |
| --- | --- | --- |
| 国控站 → cnemc 官方发布平台 | 约 20-60 分钟 | 官方每小时发布一次，发布值本身就比真实时间旧 |
| cnemc → 官方快照（能直连的机器） | +0-60 分钟 | launchd 每小时抓一次并发布；页面显示快照生成时间 |
| cnemc → WAQI 官方转发 | +约 60 分钟 | WAQI 是官方数据的转发方，比官方发布再慢约 1 小时 |
| WAQI → 云端快照（Actions 兜底） | +0-60 分钟 | Actions 每小时跑一次；仓库里 90 分钟内有官方快照时跳过不覆盖 |
| 快照 → 手机页面 | +0-5 分钟 | 页面每 5 分钟（设置里可调）轮询一次同源 JSON |

合计：官方快照链路通常比真实时间旧 1-2 小时（其中约 1 小时是官方发布本身的滞后）；WAQI 兜底链路通常旧 2-3 小时；模式兜底（Open-Meteo）旧 1-3 小时且非实测。页面在三处实时展示时效：大数字下方"观测时间 … · N 前"；最下方"数据获取路径"面板中每条链路的"时效"说明；以及当前生效链路的"观测值时间 / 快照生成 / 本页取数"三个时间戳。

当前谁在取 cnemc：GitHub Actions 的云端出口连不上 cnemc（连接被拒），它只承担 WAQI 兜底；真正取官方原始数据的是"能直连官方的机器"。此刻仓库里的官方快照由公司 Mac 手工生产过一次；家里接管后由家里 Mac 的 launchd 每小时自动生产（scripts/snapshot-push.sh，安装见 scripts/snapshot-push-install.sh）。没有生产者在线时，页面不会断——Actions 的 WAQI 兜底会继续每小时更新，只是标注为换算值。

## 数据源与口径标注规则

| 来源 | 接口 | 给出内容 | 页面标注 |
| --- | --- | --- | --- |
| cnemc 官方原始 | `air.cnemc.cn:18007`（全国城市空气质量实时发布） | 站点级六项浓度、国标 AQI、等级、首要污染物、健康建议、逐小时历史 | 官方实测，零换算 |
| WAQI 官方转发 | `api.waqi.info`（需 token，存 Actions Secret） | 美标分指数 | 反算浓度→国标换算，标注"换算值" |
| Open-Meteo 模式兜底 | `air-quality-api.open-meteo.com`（免 Key、CORS 开放） | 浓度 | 标注"模式推算值" |

- 美标视图一律由浓度按 US EPA 断点表**正向**计算；国标在 cnemc 路径下取官方原值。
- 子项完整度：cnemc 路径含 1h 浓度 + 24h 均值 + O₃-8h + 官方健康建议 + 逐小时历史（界面六宫格第二行显示 24h/8h）；WAQI 路径只有美标分指数，缺的子项行自动隐藏；Open-Meteo 含 1h 浓度但无 24h/O₃-8h。
- 交叉验算：cnemc 与 WAQI 同城市同小时读数同量级、首要污染物一致；某天气网接口字段自相矛盾，已弃用。
- 官方源约每小时更新一次；5 分钟轮询只为尽快拿到新小时数据。

## 自动刷新 / 常亮 / 自愈机制

- 轮询默认 5 分钟（设置里 1/5/10/30 可调），顶栏倒计时环可见；失败按 20s→40s→80s 退避重试。
- 超过 2.5 个周期未取数成功：红字横幅保留最后一次数据，不清屏不错乱。
- 看门狗：主循环停摆 2 分钟自动 reload；渲染异常被隔离，不杀死循环。
- 常亮：Screen Wake Lock（iOS Safari 16.4+；主屏幕 PWA 需 18.4+）→ 不支持时无声循环视频兜底；另有每分钟防烧屏微位移。
- 代码自更新：每 10 分钟比对 `version.json`，发布新版后手机自动重载。

## iPhone 装机

1. Safari 打开 https://vincent2652.github.io/air-sentinel/ ，允许定位
2. 分享 → 添加到主屏幕
3. 设置 → 显示与亮度 → 自动锁定 → 永不
4. 从主屏幕图标打开，点一次"点按启动监控台"，之后全自动

## 家里接管（Mac）

```bash
git clone https://github.com/vincent2652/air-sentinel.git && cd air-sentinel
bash scripts/snapshot-push.sh            # 立刻推一次官方原始快照（需本机能连 cnemc）
bash scripts/snapshot-push-install.sh    # 可选：每小时自动推送（launchd；卸载见 -uninstall）
```

其他运行面（都在本仓库内）：

- 局域网免登录面（同网手机，含官方代理 `/cnemc`）：
  `WEB_DIR=. HOST=0.0.0.0 node source/dev/serve.mjs 5177`
- 公网隧道（家庭宽带一般不封隧道出口；零注册）：
  `bash source/tools/public-tunnel.sh`（需 `brew install cloudflared`）
- 改前端：编辑 `source/web/*` → `node source/tools/build-standalone.mjs` →
  `cp source/web-standalone/index.html index.html && cp source/web-standalone/version.json .` → commit + push（push 会触发 Actions 重发布 Pages）

## 目录结构

```
index.html            单文件 PWA（构建产物，勿手改）
version.json          构建戳（代码自更新比对用）
data/                 快照：cities.json + city/<城市码>.json
scripts/              快照生成(build-snapshot.mjs)、城市清单、推送与 launchd 安装
.github/workflows/    每小时 Actions：WAQI 兜底 + 90 分钟新鲜度保护 + orphan pages 发布
source/web            前端源码（index/styles/app.js/manifest/图标）
source/tools          单文件打包、图标生成、公网隧道脚本
source/functions      Deno Edge Function（Qoder Sites 私有版的服务端代理，含 cnemc/WAQI/Open-Meteo 三适配器）
source/dev            本地联调服务器（静态 + /cnemc 代理 + 401 模拟）
```

## 安全与隐私

- 仓库只含本个人项目代码与公开空气质量数据，无工作相关内容、无内网地址、无密钥明文。
- WAQI token 仅存于 GitHub Actions Secret；该 token 曾在聊天中明文出现，建议到 aqicn.org 轮换。
- 无后端服务、无数据库、无账号体系；地理定位只在设备端完成，上传的只有城市级公开数据请求。

## 已知限制

- iOS 真机的常亮/主屏幕/定位弹窗行为未做真机验收（缺设备）；实现按 WebKit 公开文档约束并做了双保险。
- 部分网络（如某些公司网络）封锁隧道出口与境外 CI 到 cnemc 的访问；家庭宽带通常两者都通。
- GitHub Actions 免费定时任务要求仓库 public。
