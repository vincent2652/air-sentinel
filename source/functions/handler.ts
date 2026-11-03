/**
 * 空气哨兵 · 数据代理
 *
 * 浏览器不能直连国控站发布平台（无 CORS，且 air.cnemc.cn 对外端口已不可达），
 * 所以由这个 Edge Function 服务端取数：数据来自 WAQI 项目转发的
 * "全国城市空气质量实时发布平台"（国控站官方实时发布），token 只存在于服务端。
 */

import { buildViews, PRIMARY_LABEL, type AqiView } from "./aqi.ts";
import { fetchOpenMeteo, PRIMARY_LABEL as OM_LABEL, type OpenMeteoResult } from "./openmeteo.ts";

const WAQI_BASE = "https://api.waqi.info";
const UPSTREAM_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 90_000; // 上游本身约每小时更新，90 秒缓存只为挡住并发与频繁重刷

type CacheEntry = { at: number; body: unknown };
const cache = new Map<string, CacheEntry>();

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function fail(code: string, message: string, status = 502): Response {
  return json({ ok: false, error: { code, message } }, status);
}

/** 去掉网关前缀 /functions/v1/<upstream-name>，只保留业务子路径。 */
function routeOf(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  let start = 0;
  if (parts[0] === "functions" && parts[1] === "v1") start = 3;
  return "/" + parts.slice(start).join("/");
}

function parseCoord(raw: string | null, limit: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < -limit || n > limit) return null;
  return Number(n.toFixed(4));
}

/** 只允许安全字符，避免把任意字符串拼进取数地址。 */
function parseQuery(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().slice(0, 40);
  if (!s) return null;
  if (!/^[\p{L}\p{N}\s\-.,()（）·]+$/u.test(s)) return null;
  return s;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function iaqiOf(data: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  const raw = data.iaqi;
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      const inner = (v as Record<string, unknown>).v;
      const n = num(inner);
      if (n !== null) out[k] = n;
    }
  }
  return out;
}

function forecastOf(data: Record<string, unknown>) {
  const fc = (data.forecast as Record<string, unknown> | undefined)?.daily;
  const out: Record<string, Array<{ day: string; min: number; avg: number; max: number }>> = {};
  if (!fc || typeof fc !== "object") return out;

  // 上游数组里混有历史日和个别脏值（实测出现过 day=2025-04-05、avg=1 的臭氧条目），
  // 这里统一按"今天起、未来 7 天、avg 必须为正"过滤，避免把陈旧值当预报展示。
  const todayIso = new Date().toISOString().slice(0, 10);

  for (const key of ["pm25", "pm10", "o3"]) {
    const arr = (fc as Record<string, unknown>)[key];
    if (!Array.isArray(arr)) continue;
    const list: Array<{ day: string; min: number; avg: number; max: number }> = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const day = typeof o.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.day) ? o.day : null;
      const min = num(o.min);
      const avg = num(o.avg);
      const max = num(o.max);
      if (!day || avg === null || avg <= 0) continue;
      if (day < todayIso) continue;
      list.push({ day, min: min ?? avg, avg, max: max ?? avg });
    }
    // 上游返回的数组不保证有序，按日期排序后再截取未来 7 天
    list.sort((a, b) => a.day.localeCompare(b.day));
    out[key] = list.slice(0, 7);
  }
  return out;
}

async function fetchWaqi(path: string, token: string): Promise<Record<string, unknown>> {
  const url = `${WAQI_BASE}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { accept: "application/json", "user-agent": "AirSentinel/1.0 (+iphone-dashboard)" },
  });
  if (!res.ok) throw new Error(`upstream_http_${res.status}`);
  const payload = (await res.json()) as Record<string, unknown>;
  if (payload.status !== "ok" || !payload.data || typeof payload.data !== "object") {
    const reason = String(payload.status ?? "unknown");
    throw new Error(`upstream_status_${reason}`);
  }
  return payload.data as Record<string, unknown>;
}

function transform(data: Record<string, unknown>, requestedStd: string): unknown {
  const iaqi = iaqiOf(data);
  const primaryRaw = typeof data.dominentpol === "string" ? data.dominentpol : "";
  const primary = primaryRaw in iaqi ? primaryRaw : "pm25";

  const views = buildViews(iaqi, primary);

  // WAQI 的 data.aqi 是它自己算的整体美标 AQI，以它为准
  const overall = num(data.aqi);
  if (overall !== null) views.us.aqi = Math.round(overall);

  const city = (data.city ?? {}) as Record<string, unknown>;
  const geo = Array.isArray(city.geo) ? (city.geo as unknown[]) : [];
  const time = (data.time ?? {}) as Record<string, unknown>;

  const payload: Record<string, unknown> = {
    ok: true,
    requested_std: requestedStd === "cn" ? "cn" : "us",
    station: {
      name: typeof city.name === "string" ? city.name : null,
      location: typeof city.location === "string" && city.location ? city.location : null,
      idx: num(data.idx),
      lat: num(geo[0]),
      lon: num(geo[1]),
      url: typeof city.url === "string" ? city.url : null,
      attributions: Array.isArray(data.attributions)
        ? (data.attributions as Array<Record<string, unknown>>)
            .map((a) => ({ name: String(a.name ?? ""), url: typeof a.url === "string" ? a.url : null }))
            .filter((a) => a.name)
            .slice(0, 6)
        : [],
    },
    primary,
    primary_label: PRIMARY_LABEL[primary] ?? primary.toUpperCase(),
    observed_at: typeof time.iso === "string" ? time.iso : null,
    observed_tz: typeof time.tz === "string" ? time.tz : null,
    views: { us: views.us, cn: views.cn } as Record<string, AqiView>,
    weather: {
      temperature_c: num(iaqi.t),
      humidity_pct: num(iaqi.h),
      wind_ms: num(iaqi.w),
      pressure_hpa: num(iaqi.p),
      dewpoint_c: num(iaqi.d),
    },
    forecast: forecastOf(data),
    fetched_at: new Date().toISOString(),
    derivation:
      "国标 AQI 为换算值：由 WAQI 发布的美标分项指数反算浓度，再按 HJ 633-2012 断点表重算。美标 AQI 为上游原值。",
  };
  return payload;
}

function transformOpenMeteo(r: OpenMeteoResult, lat: number, lon: number, std: string): Record<string, unknown> {
  return {
    ok: true,
    requested_std: std === "cn" ? "cn" : "us",
    source: {
      kind: "openmeteo",
      official: false,
      label: "Open-Meteo · CAMS 模式数据（备用源，非国控站实测）",
    },
    station: {
      name: "附近区域（模式网格）",
      location: null,
      idx: null,
      lat,
      lon,
      url: null,
      attributions: [{ name: "Open-Meteo / Copernicus CAMS（备用源）", url: "https://open-meteo.com/" }],
    },
    primary: r.primary,
    primary_label: OM_LABEL[r.primary] ?? r.primary.toUpperCase(),
    observed_at: r.observed_at,
    observed_tz: null,
    views: r.views,
    weather: r.weather,
    forecast: r.forecast,
    history24h: r.history24h,
    fetched_at: new Date().toISOString(),
    derivation:
      "备用源为卫星+模式同化推算值，与国控站实测读数可能存在偏差。美标/国标 AQI 均由浓度按各自断点表正向计算。",
  };
}

async function handleAq(url: URL): Promise<Response> {
  const token = Deno.env.get("WAQI_TOKEN");
  const allowFallback = url.searchParams.get("fallback") === "1";

  const lat = parseCoord(url.searchParams.get("lat"), 90);
  const lon = parseCoord(url.searchParams.get("lon"), 180);
  const q = parseQuery(url.searchParams.get("q"));
  const std = url.searchParams.get("std") === "cn" ? "cn" : "us";

  // 1) 官方链路优先：WAQI 转发的国控站实时发布
  if (token) {
    let upstreamPath: string;
    if (lat !== null && lon !== null) {
      upstreamPath = `/feed/geo:${lat};${lon}/`;
    } else if (q) {
      upstreamPath = `/feed/${q.split("").map((c) => (/[A-Za-z0-9]/.test(c) ? c : encodeURIComponent(c))).join("")}/`;
    } else {
      return fail("invalid_params", "需要 lat+lon 或 q（城市名）其中一组。", 400);
    }

    const cacheKey = `waqi|${upstreamPath}|${std}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return json({ ...(hit.body as Record<string, unknown>), cached: true });
    }

    let data: Record<string, unknown>;
    try {
      data = await fetchWaqi(upstreamPath, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("upstream_http_4")) return fail("upstream_rejected", "上游拒绝了请求（token 无效或超额）。", 502);
      if (msg.startsWith("upstream_status_error")) return fail("upstream_error", "上游返回错误，可能是该地点没有覆盖。", 502);
      if (msg.includes("TimeoutError") || msg.includes("timeout")) return fail("upstream_timeout", "上游响应超时。", 504);
      return fail("upstream_unavailable", "无法连接上游数据源。", 502);
    }

    const body = transform(data, std) as Record<string, unknown>;
    body.source = {
      kind: "waqi",
      official: true,
      label: "全国城市空气质量实时发布平台（国控站官方实时发布）",
    };
    body.history24h = [];
    cache.set(cacheKey, { at: Date.now(), body });
    trimCache();
    return json(body);
  }

  // 2) 免密钥备用源：仅当调用方显式允许（前端设置开关）且官方不可用时
  if (allowFallback) {
    if (lat === null || lon === null) {
      return fail(
        "fallback_needs_coords",
        "免密钥备用源需要经纬度定位。请允许定位，或配置官方 token 后改用城市名。",
        400,
      );
    }
    const cacheKey = `om|${lat},${lon}|${std}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return json({ ...(hit.body as Record<string, unknown>), cached: true });
    }
    let result: OpenMeteoResult;
    try {
      result = await fetchOpenMeteo(lat, lon);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("TimeoutError") || msg.includes("timeout")) return fail("upstream_timeout", "备用源响应超时。", 504);
      return fail("upstream_unavailable", "无法连接备用数据源。", 502);
    }
    const body = transformOpenMeteo(result, lat, lon, std);
    cache.set(cacheKey, { at: Date.now(), body });
    trimCache();
    return json(body);
  }

  return fail(
    "service_not_configured",
    "服务端还没有配置 WAQI_TOKEN，无法读取国控站发布数据。请在站点设置的 Secrets 里填入。",
    503,
  );
}

function trimCache() {
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export async function handler(req: Request): Promise<Response> {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return fail("invalid_params", "无法解析请求地址。", 400);
  }

  const route = routeOf(url.pathname);

  if (req.method !== "GET" && req.method !== "HEAD") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "只接受 GET。" } }, 405);
  }

  try {
    if (route === "/" || route === "/health") {
      return json({
        ok: true,
        service: "airsentinel-aq-proxy",
        version: 1,
        configured: Boolean(Deno.env.get("WAQI_TOKEN")),
        source: "WAQI Project / 全国城市空气质量实时发布平台（国控站官方实时发布）",
      });
    }
    if (route === "/aq") return await handleAq(url);
    return json({ ok: false, error: { code: "not_found", message: `没有这个接口：${route}` } }, 404);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return fail("internal_error", `服务端异常：${msg}`, 500);
  }
}
