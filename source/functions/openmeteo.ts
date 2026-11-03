/**
 * 免密钥备用数据源：Open-Meteo 空气质量 API（CAMS 卫星+模式同化数据）。
 *
 * 定位：仅当官方国控站链路（WAQI 转发的"全国城市空气质量实时发布平台"）不可用时启用，
 * 页面上会明确标注"模式推算值，非国控站实测"。它直接返回浓度，因此可以
 * 正向、精确地同时算出美标与国标两套 AQI（不需要反算），并且自带逐小时历史与预报。
 *
 * 单位约定：Open-Meteo 所有污染物浓度均为 μg/m³（含 CO）。
 *   - 国标断点表：PM/O3/NO2/SO2 用 μg/m³，CO 用 mg/m³（= μg/m³ ÷ 1000）
 *   - 美标断点表：PM 用 μg/m³，O3/NO2/SO2 用 ppb，CO 用 ppm（由 μg/m³ 换算）
 */

import { US_BP, CN_BP, levelCN, levelUS, type AqiView, type PollutantView } from "./aqi.ts";

const AQ_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";
const WX_BASE = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 12_000;

/** μg/m³ -> 美标单位 的除数。
 *  注意 CO：1 ppm = 1.1456 mg/m³ = 1145.6 μg/m³，Open-Meteo 给的是 μg/m³，
 *  所以换算到 ppm 必须除以 1145.6（此前误用 1.1456 导致美标 CO 分指数爆表）。 */
const UG_TO_US: Record<string, { div: number; unit: string }> = {
  pm25: { div: 1, unit: "μg/m³" },
  pm10: { div: 1, unit: "μg/m³" },
  o3: { div: 48.0 / 24.45, unit: "ppb" },
  no2: { div: 46.01 / 24.45, unit: "ppb" },
  so2: { div: 64.06 / 24.45, unit: "ppb" },
  co: { div: (28.01 / 24.45) * 1000, unit: "ppm" },
};

const KEYS = ["pm25", "pm10", "o3", "no2", "so2", "co"] as const;
type Key = (typeof KEYS)[number];

/** Open-Meteo 字段名 -> 内部 key */
const FIELD: Record<Key, string> = {
  pm25: "pm2_5",
  pm10: "pm10",
  o3: "ozone",
  no2: "nitrogen_dioxide",
  so2: "sulphur_dioxide",
  co: "carbon_monoxide",
};

function forward(table: Record<string, Array<[number, number, number, number]>>, key: string, conc: number): number | null {
  const t = table[key];
  if (!t || !Number.isFinite(conc) || conc < 0) return null;
  for (const [cLo, cHi, iLo, iHi] of t) {
    if (conc >= cLo && conc <= cHi) {
      if (cHi === cLo) return Math.round(iLo);
      return Math.round(iLo + ((conc - cLo) * (iHi - iLo)) / (cHi - cLo));
    }
  }
  const last = t[t.length - 1];
  if (conc > last[1]) return Math.round(last[3]);
  return 0;
}

const rnd = (n: number | null, d: number): number | null =>
  n === null || !Number.isFinite(n) ? null : Number(n.toFixed(d));

/** 由一组 μg/m³ 浓度同时构造美标/国标视图，各自独立判定首要污染物。 */
export function viewsFromConcUG(concUG: Record<string, number | null>): { us: AqiView; cn: AqiView } {
  const usPol: Record<string, PollutantView> = {};
  const cnPol: Record<string, PollutantView> = {};
  let usMax = -1, cnMax = -1, usPrimary = "pm25", cnPrimary = "pm25";

  for (const k of KEYS) {
    const ug = concUG[k];
    if (ug === null || ug === undefined || !Number.isFinite(ug)) {
      usPol[k] = { index: null, conc: null, unit: UG_TO_US[k].unit, is_primary: false };
      cnPol[k] = { index: null, conc: null, unit: k === "co" ? "mg/m³" : "μg/m³", is_primary: false };
      continue;
    }
    const usConc = ug / UG_TO_US[k].div;
    const cnConc = k === "co" ? ug / 1000 : ug;
    const usIdx = forward(US_BP, k, usConc);
    const cnIdx = forward(CN_BP, k, cnConc);

    usPol[k] = { index: usIdx, conc: rnd(usConc, k === "co" ? 2 : 1), unit: UG_TO_US[k].unit, is_primary: false };
    cnPol[k] = { index: cnIdx, conc: rnd(cnConc, k === "co" ? 2 : 1), unit: k === "co" ? "mg/m³" : "μg/m³", is_primary: false };

    if (usIdx !== null && usIdx > usMax) { usMax = usIdx; usPrimary = k; }
    if (cnIdx !== null && cnIdx > cnMax) { cnMax = cnIdx; cnPrimary = k; }
  }

  for (const k of KEYS) {
    usPol[k].is_primary = k === usPrimary;
    cnPol[k].is_primary = k === cnPrimary;
  }

  const usAqi = usMax >= 0 ? usMax : null;
  const cnAqi = cnMax >= 0 ? cnMax : null;
  const ul = levelUS(usAqi ?? 0);
  const cl = levelCN(cnAqi ?? 0);

  return {
    us: { std: "us", aqi: usAqi, level: ul.name, level_index: usAqi === null ? -1 : ul.index, level_alt: ul.cn, pollutants: usPol },
    cn: { std: "cn", aqi: cnAqi, level: cl.name, level_index: cnAqi === null ? -1 : cl.index, level_alt: "", pollutants: cnPol },
  };
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`openmeteo_http_${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function concFromBlock(block: Record<string, unknown>): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const k of KEYS) out[k] = num(block[FIELD[k]]);
  return out;
}

export interface OpenMeteoResult {
  views: { us: AqiView; cn: AqiView };
  primary: string;
  observed_at: string | null;
  history24h: Array<{ t: number; us: number | null; cn: number | null }>;
  forecast: Record<string, Array<{ day: string; min: number; avg: number; max: number }>>;
  weather: { temperature_c: number | null; humidity_pct: number | null; wind_ms: number | null; pressure_hpa: number | null };
}

export async function fetchOpenMeteo(lat: number, lon: number): Promise<OpenMeteoResult> {
  const fields = KEYS.map((k) => FIELD[k]).join(",");
  const aqUrl =
    `${AQ_BASE}?latitude=${lat}&longitude=${lon}` +
    `&current=us_aqi,${fields}` +
    `&hourly=${fields}` +
    `&past_days=1&forecast_days=7` +
    `&timezone=auto`;

  const wxUrl =
    `${WX_BASE}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure` +
    `&timezone=auto`;

  // 气象为辅助信息，失败不阻塞主数据；瞬时抖动重试一次
  const wx = await getJson(wxUrl).catch(() =>
    getJson(wxUrl).catch(() => ({} as Record<string, unknown>)),
  );
  const [aq] = await Promise.all([getJson(aqUrl), Promise.resolve(wx)]);

  const current = (aq.current ?? {}) as Record<string, unknown>;
  const views = viewsFromConcUG(concFromBlock(current));

  // 首要污染物：以国标分指数最大者为准（与页面默认口径一致）
  let primary = "pm25";
  let best = -1;
  for (const k of KEYS) {
    const idx = views.cn.pollutants[k].index;
    if (idx !== null && idx > best) { best = idx; primary = k; }
  }

  // 逐小时历史 + 预报：hourly 数组覆盖 past_days=1 .. forecast_days=7
  const hourly = (aq.hourly ?? {}) as Record<string, unknown>;
  const times = Array.isArray(hourly.time) ? (hourly.time as unknown[]) : [];
  const series: Array<{ t: number; day: string; conc: Record<string, number | null> }> = [];
  for (let i = 0; i < times.length; i++) {
    const raw = times[i];
    const ts = typeof raw === "string" ? Date.parse(raw) : NaN;
    if (!Number.isFinite(ts)) continue;
    const block: Record<string, unknown> = {};
    for (const k of KEYS) {
      const arr = hourly[FIELD[k]];
      block[FIELD[k]] = Array.isArray(arr) ? arr[i] : null;
    }
    series.push({ t: ts, day: typeof raw === "string" ? raw.slice(0, 10) : "", conc: concFromBlock(block) });
  }

  const now = Date.now();
  const cutoff = now - 24 * 3600 * 1000;
  const history24h = series
    .filter((p) => p.t <= now && p.t >= cutoff)
    .map((p) => {
      const v = viewsFromConcUG(p.conc);
      return { t: p.t, us: v.us.aqi, cn: v.cn.aqi };
    });

  // 分日必须用上游返回的本地日期串（timezone=auto），不能用 epoch 转 UTC，否则会跨日错并
  const forecast: Record<string, Array<{ day: string; min: number; avg: number; max: number }>> = {};
  const byDay = new Map<string, Record<string, number[]>>();
  for (const p of series) {
    if (p.t < now) continue;
    const day = p.day;
    if (!byDay.has(day)) byDay.set(day, { pm25: [], pm10: [], o3: [] });
    const bucket = byDay.get(day)!;
    for (const k of ["pm25", "pm10", "o3"] as const) {
      const v = p.conc[k];
      if (v !== null) bucket[k].push(v);
    }
  }
  const days = Array.from(byDay.keys()).sort().slice(0, 7);
  for (const k of ["pm25", "pm10", "o3"] as const) {
    forecast[k] = days.map((day) => {
      const arr = byDay.get(day)![k];
      if (!arr.length) return { day, min: 0, avg: 0, max: 0 };
      const min = Math.round(Math.min(...arr));
      const max = Math.round(Math.max(...arr));
      const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      return { day, min, avg, max };
    }).filter((d) => d.avg > 0);
  }

  const wxc = (wx.current ?? {}) as Record<string, unknown>;
  const windKmh = num(wxc.wind_speed_10m);

  return {
    views,
    primary,
    observed_at: typeof current.time === "string" ? (current.time as string) : null,
    history24h,
    forecast,
    weather: {
      temperature_c: num(wxc.temperature_2m),
      humidity_pct: num(wxc.relative_humidity_2m),
      wind_ms: windKmh === null ? null : Number((windKmh / 3.6).toFixed(1)),
      pressure_hpa: num(wxc.surface_pressure),
    },
  };
}

export const PRIMARY_LABEL: Record<string, string> = {
  pm25: "PM2.5", pm10: "PM10", o3: "臭氧 O₃", no2: "二氧化氮 NO₂",
  so2: "二氧化硫 SO₂", co: "一氧化碳 CO",
};
