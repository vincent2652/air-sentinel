/**
 * 官方数据静态快照生成器（GitHub Actions 与本地通用，零依赖）。
 *
 * 抓取中国环境监测总站"全国城市空气质量实时发布"（air.cnemc.cn:18007，免密钥）：
 *   - 全国 338 城实时 AQI/等级/首要污染物/经纬度  -> data/cities.json
 *   - 每城最近站点六项浓度+官方建议 + 逐小时历史   -> data/city/<CityCode>.json
 * 产物为纯静态 JSON，供 GitHub Pages 上的网页同源读取（绕开 cnemc 无 CORS 的限制）。
 *
 * 运行：node scripts/build-snapshot.mjs   （可用 SNAP_OUT 改输出目录）
 */
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://air.cnemc.cn:18007";
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

async function get(path, opts = {}) {
  const headers = {
    "user-agent": UA,
    "x-requested-with": "XMLHttpRequest",
    referer: BASE + "/",
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "zh-CN,zh;q=0.9",
  };
  if (opts.body) headers["content-type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  const r = await fetch(BASE + path, { method: opts.body ? "POST" : "GET", headers, body: opts.body });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  });
  await Promise.all(workers);
  return out;
}

function concOf(o, coScale = 1) {
  const co = num(o.CO);
  return {
    pm25: num(o.PM2_5), pm10: num(o.PM10), o3: num(o.O3),
    no2: num(o.NO2), so2: num(o.SO2), co: co === null ? null : co * coScale,
  };
}

async function main() {
  const t0 = Date.now();
  const all = await get("/CityData/GetAllCityRealTimeAQIModels");
  if (!Array.isArray(all) || !all.length) throw new Error("官方城市列表为空");

  const cities = [];
  const details = new Map();

  await mapLimit(all, CONCURRENCY, async (c) => {
    const code = String(c.CityCode);
    const cl = num(c.Latitude), co = num(c.Longitude);
    let live = null, hist = null;
    try { live = await get("/CityData/GetAQIDataPublishLive?cityName=" + encodeURIComponent(c.Area)); } catch { /* 单城失败不阻塞整体 */ }
    try { hist = await get("/HourChangesPublish/GetCityRealTimeAqiHistoryByCondition", { body: "citycode=" + code }); } catch { /* 同上 */ }
    await sleep(POLITE_MS);

    let st = null;
    if (Array.isArray(live) && live.length) {
      st = live[0];
      let best = Infinity;
      for (const s of live) {
        const sl = num(s.Latitude), so = num(s.Longitude);
        if (sl === null || so === null) continue;
        const d = hav(cl ?? 0, co ?? 0, sl, so);
        if (d < best) { best = d; st = s; }
      }
    }

    cities.push({
      code, name: c.Area, lat: cl, lon: co,
      aqi: num(c.AQI), quality: c.Quality, primary: mapPP(c.PrimaryPollutant), time: c.TimePoint,
    });

    details.set(code, {
      generatedAt: new Date().toISOString(),
      city: { code, name: c.Area },
      station: st
        ? {
            PositionName: st.PositionName || null,
            StationCode: st.StationCode || null,
            lat: num(st.Latitude), lon: num(st.Longitude),
            AQI: num(st.AQI), Quality: st.Quality,
            PrimaryPollutant: st.PrimaryPollutant, primary: mapPP(st.PrimaryPollutant),
            Measure: st.Measure || null, TimePoint: st.TimePoint,
            conc: concOf(st, 1000), // CO 官方为 mg/m³，统一转 μg/m³
          }
        : null,
      history: Array.isArray(hist)
        ? hist
            .map((r) => {
              const m = /\/Date\((\d+)\)\//.exec(String(r.TimePoint || ""));
              const t = m ? Number(m[1]) : NaN;
              return Number.isFinite(t) ? { t, cn: num(r.AQI), conc: concOf(r, 1000) } : null;
            })
            .filter(Boolean)
        : [],
    });
  });

  mkdirSync(OUT + "/city", { recursive: true });
  writeFileSync(OUT + "/cities.json", JSON.stringify({ generatedAt: new Date().toISOString(), cities }));
  for (const [code, d] of details) writeFileSync(`${OUT}/city/${code}.json`, JSON.stringify(d));

  const withStation = [...details.values()].filter((d) => d.station).length;
  const withHist = [...details.values()].filter((d) => d.history.length >= 12).length;
  console.log(`snapshot ok: ${cities.length} cities, ${withStation} with station, ${withHist} with >=12h history, ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}/`);
}

main().catch((e) => { console.error("snapshot failed:", e.message); process.exit(1); });
