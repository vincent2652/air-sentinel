/**
 * 打包便携单文件版：把 styles.css / app.js / 图标内联进一个 HTML。
 * 该版本浏览器直连 Open-Meteo（免 Key、CORS 开放），无任何服务端依赖，
 * 可放到任意匿名 HTTPS 静态托管上，实现免登录常亮展示。
 *
 * 运行：node tools/build-standalone.mjs
 * 输出：web-standalone/index.html
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WEB = join(ROOT, "web");
const OUT = join(ROOT, "web-standalone");

const html = await readFile(join(WEB, "index.html"), "utf8");
const css = await readFile(join(WEB, "styles.css"), "utf8");
const js = await readFile(join(WEB, "app.js"), "utf8");
const icon192 = readFileSync(join(WEB, "icon-192.png")).toString("base64");

let out = html;

// 内联样式
out = out.replace(
  /<link rel="stylesheet" href="styles\.css">/,
  `<style>\n${css}\n</style>`,
);

// 图标改为 data URI（单文件不依赖外部资源）；去掉 manifest（单文件无独立 manifest 文件）
out = out.replace(/<link rel="apple-touch-icon" href="icon-192\.png">/, `<link rel="apple-touch-icon" href="data:image/png;base64,${icon192}">`);
out = out.replace(/<link rel="icon" type="image\/png" sizes="192x192" href="icon-192\.png">/, "");
out = out.replace(/<link rel="icon" type="image\/svg\+xml" href="icon\.svg">/, "");
out = out.replace(/<link rel="manifest" href="manifest\.webmanifest">/, "");

// 内联脚本并开启直连模式；注入构建戳用于版本自检自动重载
const BUILD_STAMP = new Date().toISOString();
out = out.replace(
  /<script src="app\.js"><\/script>/,
  `<script>window.__AIRSENTINEL_DIRECT__=true;window.__BUILD__="${BUILD_STAMP}";<\/script>\n<script>\n${js}\n<\/script>`,
);

// 标题保持中性：实际数据源由运行时决定（官方代理/官方快照/模式兜底），页面内会明确标注
out = out.replace("<title>空气哨兵 · 实时空气质量</title>", "<title>空气哨兵 · 实时空气质量</title>");

await mkdir(OUT, { recursive: true });
const target = join(OUT, "index.html");
await writeFile(target, out, "utf8");
await writeFile(join(OUT, "version.json"), JSON.stringify({ build: BUILD_STAMP }, null, 2), "utf8");
console.log(`written: ${target} (${out.length} bytes), version.json build=${BUILD_STAMP}`);
