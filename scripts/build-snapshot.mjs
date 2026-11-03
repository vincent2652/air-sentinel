/**
 * 官方数据静态快照生成器（GitHub Actions 与本地通用，零依赖）。
 *
 * 数据源优先级：
 *   1) 中国环境监测总站"全国城市空气质量实时发布"（air.cnemc.cn:18007，免密钥）
 *      —— 仅在中国大陆出口可达；本地/局域网运行走这条，含站点浓度与逐小时历史
 *   2) WAQI 项目转发的同一官方平台（api.waqi.info，需 WAQI_TOKEN 环境变量）
 *      —— 全球可达；GitHub Actions 走这条（云端 runner 访问不到 cnemc）
 * 产物为纯静态 JSON，供 GitHub Pages 上的网页同源读取（绕开无 CORS 限制）：
 *   data/cities.json            全国城市实时 AQI/等级/首要污染物/经纬度
 *   data/city/<CityCode>.json   该城最近站点六项浓度 + 官方建议 + 逐小时历史（cnemc 模式）
 *
 * 运行：node scripts/build-snapshot.mjs   （SNAP_OUT 可改输出目录）
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CNEMC = "https://air.cnemc.cn:18007";
const WAQI = "https://api.waqi.info";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const OUT = process.env.SNAP_OUT || "data";
const CONCURRENCY = 8;
const POLITE_MS = 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const hav = (a, b, c, d) => {
  const x = (c - a) * 111.0;
  const y = (d - b) * 111.0 * Math.cos((a * Math.PI) / 180);
  return Math.hypot(x, y);
};

function mapPP(text) {
  const p = String(text || "");
  if (p.indexOf("PM10") >= 0) return "pm10";
  if (p.indexOf("PM2.5") >= 0) return "pm25";
  if (p.indexOf("O3") >= 0) return "o3";
  if (p.indexOf("NO2") >= 0) return "no2";
  if (p.indexOf("SO2") >= 0) return "so2";
  if (p.indexOf("CO") >= 0) return "co";
  return "pm25";
}

// ---------- 双口径断点表（WAQI 降级路径用：美标分指数 -> 浓度 -> 国标分指数） ----------
const US_BP = {
  pm25: [[0, 12.0, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 350.4, 301, 400], [350.5, 500.4, 401, 500]],
  pm10: [[0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150], [255, 354, 151, 200], [355, 424, 201, 300], [425, 504, 301, 400], [505, 604, 401, 500]],
  co: [[0, 4.4, 0, 50], [4.5, 9.4, 51, 100], [9.5, 12.4, 101, 150], [12.5, 15.4, 151, 200], [15.5, 30.4, 201, 300], [30.5, 40.4, 301, 400], [40.5, 50.4, 401, 500]],
  so2: [[0, 35, 0, 50], [36, 75, 51, 100], [76, 185, 101, 150], [186, 304, 151, 200], [305, 604, 201, 300], [605, 804, 301, 400], [805, 1004, 401, 500]],
  no2: [[0, 53, 0, 50], [54, 100, 51, 100], [101, 360, 101, 150], [361, 649, 151, 200], [650, 1249, 201, 300], [1250, 1649, 301, 400], [1650, 2049, 401, 500]],
  o3: [[0, 54, 0, 50], [55, 70, 51, 100], [71, 85, 101, 150], [86, 105, 151, 200], [106, 200, 201, 300], [201, 404, 301, 400], [405, 604, 401, 500]],
};
const CN_BP = {
  pm25: [[0, 35, 0, 50], [35, 75, 50, 100], [75, 115, 100, 150], [115, 150, 150, 200], [150, 250, 200, 300], [250, 350, 300, 400], [350, 500, 400, 500]],
  pm10: [[0, 50, 0, 50], [50, 150, 50, 100], [150, 250, 100, 150], [250, 350, 150, 200], [350, 420, 200, 300], [420, 500, 300, 400], [500, 600, 400, 500]],
  so2: [[0, 50, 0, 50], [50, 150, 50, 100], [150, 475, 100, 150], [475, 800, 150, 200], [800, 1600, 200, 300], [1600, 2100, 300, 400], [2100, 2620, 400, 500]],
  no2: [[0, 40, 0, 50], [40, 80, 50, 100], [80, 180, 100, 150], [180, 280, 150, 200], [280, 565, 200, 300], [565, 750, 300, 400], [750, 940, 400, 500]],
  co: [[0, 2, 0, 50], [2, 4, 50, 100], [4, 14, 100, 150], [14, 24, 150, 200], [24, 36, 200, 300], [36, 48, 300, 400], [48, 90, 400, 500]],
  o3: [[0, 160, 0, 50], [160, 200, 50, 100], [200, 300, 100, 150], [300, 400, 150, 200], [400, 800, 200, 300], [800, 1000, 300, 400], [1000, 1200, 400, 500]],
};
const US_UNIT_DIV = { pm25: 1, pm10: 1, o3: 48 / 24.45, no2: 46.01 / 24.45, so2: 64.06 / 24.45, co: (28.01 / 24.45) * 1000 };
const CN_LEVELS = ["优", "良", "轻度污染", "中度污染", "重度污染", "严重污染"];
const cnLevel = (aqi) => CN_LEVELS[aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : aqi <= 200 ? 3 : aqi <= 300 ? 4 : 5];

function invUS(key, index) {
  const t = US_BP[key];
  for (const [cLo, cHi, iLo, iHi] of t) if (index >= iLo && index <= iHi) return iHi === iLo ? cLo : cLo + ((index - iLo) * (cHi - cLo)) / (iHi - iLo);
  const l = t[t.length - 1];
  return l[1] + ((index - l[3]) * (l[1] - l[0])) / Math.max(1, l[3] - l[2]);
}
function fwdCN(key, conc) {
  const t = CN_BP[key];
  for (const [cLo, cHi, iLo, iHi] of t) if (conc >= cLo && conc <= cHi) return Math.round(iLo + ((conc - cLo) * (iHi - iLo)) / (cHi - cLo));
  return Math.round(t[t.length - 1][3]);
}
/** WAQI 美标分指数 -> μg/m³ 浓度（CO 亦统一为 μg/m³，与前端约定一致） */
function concFromWaqi(iaqi) {
  const out = {};
  for (const k of ["pm25", "pm10", "o3", "no2", "so2", "co"]) {
    const v = iaqi && iaqi[k] ? num(iaqi[k].v) : null;
    if (v === null) { out[k] = null; continue; }
    const usConc = invUS(k, v); // 单位：pm=μg/m³、o3/no2/so2=ppb、co=ppm
    out[k] = Number((usConc * US_UNIT_DIV[k]).toFixed(1)); // 统一换算为 μg/m³
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  });
  await Promise.all(workers);
  return out;
}

async function cnemcGet(path, opts = {}) {
  const headers = {
    "user-agent": UA, "x-requested-with": "XMLHttpRequest",
    referer: CNEMC + "/", accept: "application/json, text/javascript, */*; q=0.01", "accept-language": "zh-CN,zh;q=0.9",
  };
  if (opts.body) headers["content-type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  const r = await fetch(CNEMC + path, { method: opts.body ? "POST" : "GET", headers, body: opts.body, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

// ---------- 路径 1：CNEMC 官方直连 ----------
async function buildFromCnemc() {
  const all = await cnemcGet("/CityData/GetAllCityRealTimeAQIModels");
  if (!Array.isArray(all) || !all.length) throw new Error("官方城市列表为空");
  const cities = [];
  const details = new Map();
  await mapLimit(all, CONCURRENCY, async (c) => {
    const code = String(c.CityCode);
    const cl = num(c.Latitude), co = num(c.Longitude);
    let live = null, hist = null;
    try { live = await cnemcGet("/CityData/GetAQIDataPublishLive?cityName=" + encodeURIComponent(c.Area)); } catch { /* 单城失败不阻塞 */ }
    try { hist = await cnemcGet("/HourChangesPublish/GetCityRealTimeAqiHistoryByCondition", { body: "citycode=" + code }); } catch { /* 同上 */ }
    await sleep(POLITE_MS);
    let st = null;
    if (Array.isArray(live) && live.length) {
      st = live[0]; let best = Infinity;
      for (const s of live) {
        const sl = num(s.Latitude), so = num(s.Longitude);
        if (sl === null || so === null) continue;
        const d = hav(cl ?? 0, co ?? 0, sl, so);
        if (d < best) { best = d; st = s; }
      }
    }
    const conc = (o) => { const cm = num(o.CO); return { pm25: num(o.PM2_5), pm10: num(o.PM10), o3: num(o.O3), no2: num(o.NO2), so2: num(o.SO2), co: cm === null ? null : cm * 1000 }; };
    cities.push({ code, name: c.Area, lat: cl, lon: co, aqi: num(c.AQI), quality: c.Quality, primary: mapPP(c.PrimaryPollutant), time: c.TimePoint });
    details.set(code, {
      generatedAt: new Date().toISOString(), mode: "cnemc",
      city: { code, name: c.Area },
      station: st ? {
        PositionName: st.PositionName || null, StationCode: st.StationCode || null,
        lat: num(st.Latitude), lon: num(st.Longitude), AQI: num(st.AQI), Quality: st.Quality,
        PrimaryPollutant: st.PrimaryPollutant, primary: mapPP(st.PrimaryPollutant),
        Measure: st.Measure || null, TimePoint: st.TimePoint, conc: conc(st),
      } : null,
      history: Array.isArray(hist) ? hist.map((r) => {
        const m = /\/Date\((\d+)\)\//.exec(String(r.TimePoint || ""));
        const t = m ? Number(m[1]) : NaN;
        return Number.isFinite(t) ? { t, cn: num(r.AQI), conc: conc(r) } : null;
      }).filter(Boolean) : [],
    });
  });
  return { cities, details, mode: "cnemc" };
}

// ---------- 路径 2：WAQI 官方转发（全球可达） ----------
async function buildFromWaqi(token) {
  const list = JSON.parse(readFileSync(join(HERE, "cities.json"), "utf8"));
  const cities = [];
  const details = new Map();
  await mapLimit(list, 6, async (c) => {
    let d = null;
    try {
      const r = await fetch(`${WAQI}/feed/geo:${c.lat};${c.lon}/?token=${encodeURIComponent(token)}`, {
        headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(15000),
      });
      if (r.ok) { const j = await r.json(); if (j.status === "ok") d = j.data; }
    } catch { /* 单城失败不阻塞 */ }
    await sleep(40);
    if (!d) { cities.push({ code: c.code, name: c.name, lat: c.lat, lon: c.lon, aqi: null, quality: null, primary: null, time: null }); details.set(c.code, { generatedAt: new Date().toISOString(), mode: "waqi", city: { code: c.code, name: c.name }, station: null, history: [] }); return; }
    const concUG = concFromWaqi(d.iaqi);
    const coMg = concUG.co;
    const cnConc = { ...concUG, co: coMg === null ? null : coMg / 1000 };
    let cnMax = -1, primary = mapPP(d.dominentpol);
    for (const k of ["pm25", "pm10", "o3", "no2", "so2", "co"]) {
      const v = cnConc[k];
      if (v === null) continue;
      const idx = fwdCN(k, v);
      if (idx > cnMax) { cnMax = idx; primary = k; }
    }
    const cnAqi = cnMax >= 0 ? cnMax : null;
    cities.push({ code: c.code, name: c.name, lat: c.lat, lon: c.lon, aqi: cnAqi, quality: cnAqi === null ? null : cnLevel(cnAqi), primary, time: d.time && d.time.iso ? d.time.iso : null });
    details.set(c.code, {
      generatedAt: new Date().toISOString(), mode: "waqi",
      city: { code: c.code, name: c.name },
      station: {
        PositionName: d.city && d.city.name ? String(d.city.name) : null,
        StationCode: d.idx ? String(d.idx) : null,
        lat: d.city && Array.isArray(d.city.geo) ? d.city.geo[0] : c.lat,
        lon: d.city && Array.isArray(d.city.geo) ? d.city.geo[1] : c.lon,
        AQI: cnAqi, Quality: cnAqi === null ? null : cnLevel(cnAqi),
        PrimaryPollutant: primary, primary,
        Measure: null, TimePoint: d.time && d.time.iso ? d.time.iso : null,
        conc: concUG,
      },
      history: [],
    });
  });
  return { cities, details, mode: "waqi" };
}

async function main() {
  const t0 = Date.now();
  // Actions 兜底保护：若仓库里已有 90 分钟内的 cnemc 原始快照（由能直连官方源的机器推送），不覆盖
  if (process.env.SKIP_IF_FRESH) {
    try {
      const prev = JSON.parse(readFileSync(join(OUT, "cities.json"), "utf8"));
      const ageMin = (Date.now() - Date.parse(prev.generatedAt)) / 60000;
      if (prev.mode === "cnemc" && ageMin < 90) {
        console.log(`skip: fresh cnemc snapshot ${ageMin.toFixed(0)} min old`);
        return;
      }
    } catch { /* 无历史快照则继续 */ }
  }
  let result = null;
  try {
    result = await buildFromCnemc();
  } catch (e) {
    console.log(`cnemc unreachable (${e.message}); falling back to WAQI`);
    const token = process.env.WAQI_TOKEN;
    if (!token) throw new Error("cnemc 不可达且未配置 WAQI_TOKEN");
    result = await buildFromWaqi(token);
  }
  const { cities, details, mode } = result;
  mkdirSync(OUT + "/city", { recursive: true });
  writeFileSync(OUT + "/cities.json", JSON.stringify({ generatedAt: new Date().toISOString(), mode, cities }));
  for (const [code, d] of details) writeFileSync(`${OUT}/city/${code}.json`, JSON.stringify(d));
  const ok = cities.filter((c) => c.aqi !== null).length;
  console.log(`snapshot ok [${mode}]: ${cities.length} cities, ${ok} with aqi, ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}/`);
}

main().catch((e) => { console.error("snapshot failed:", e.message); process.exit(1); });
