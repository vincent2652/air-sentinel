// 本地联调用静态服务器 + 同源代理。
// 把 web/ 当站点根，把 /functions/v1/app 转发到本地 Deno Function（127.0.0.1:8000）。
// 运行：node dev/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", process.env.WEB_DIR || "web");
const FN_PORT = Number(process.env.FN_PORT || 8000);
const FN = `http://127.0.0.1:${FN_PORT}`;
const PORT = Number(process.argv[2] || 5173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
};

// 中国环境监测总站 · 全国城市空气质量实时发布（官方，免密钥，无 CORS → 需本代理）
const CNEMC_BASE = "https://air.cnemc.cn:18007";
const CNEMC_ALLOWED = new Set([
  "/CityData/GetAllCityRealTimeAQIModels",
  "/CityData/GetAQIDataPublishLive",
  "/CityData/GetProvince",
  "/CityData/GetCitiesByPid",
  "/HourChangesPublish/GetCityRealTimeAqiHistoryByCondition",
]);

async function readBody(req) {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => resolve(s));
  });
}

async function cnemcProxy(req, res, url) {
  const path = url.pathname.replace(/^\/cnemc/, "") || "/";
  if (!CNEMC_ALLOWED.has(path)) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: { code: "path_not_allowed", message: path } }));
    return;
  }
  try {
    const body = req.method === "POST" ? await readBody(req) : undefined;
    const r = await fetch(CNEMC_BASE + path + url.search, {
      method: req.method,
      body,
      headers: {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "x-requested-with": "XMLHttpRequest",
        referer: "https://air.cnemc.cn:18007/",
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "zh-CN,zh;q=0.9",
        "content-type": req.headers["content-type"] || "application/x-www-form-urlencoded; charset=UTF-8",
      },
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, {
      "content-type": r.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: { code: "cnemc_proxy_failed", message: String(e) } }));
  }
}

async function proxy(req, res) {
  const upstream = FN + req.url;
  try {
    const r = await fetch(upstream);
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, {
      "content-type": r.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    });
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: { code: "proxy_failed", message: String(e) } }));
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith("/functions/v1/app")) return proxy(req, res);
  if (url.pathname.startsWith("/cnemc/") && process.env.CNEMC_PROXY !== "off") return cnemcProxy(req, res, url);

  let p = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  if (p === "/" || p === "") p = "/index.html";
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("404 " + p);
  }
}).listen(PORT, process.env.HOST || "127.0.0.1", () => {
  console.log(`static + proxy on http://${process.env.HOST || "127.0.0.1"}:${PORT}  (function -> ${FN})`);
});
