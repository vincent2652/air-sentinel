/**
 * AQI 分级与双口径换算。
 *
 * WAQI（World Air Quality Index Project）转发的中国数据，署名来源是
 * "全国城市空气质量实时发布平台"，即国控站官方发布平台。
 * 它对外发布的是 US EPA 口径的 AQI 与各分项指数（iaqi），并不直接给国标值。
 *
 * 因此国标 AQI 是推导值：US 分项指数 -> 反算浓度 -> 按 HJ 633-2012 重算分项指数 -> 取最大。
 * 反算与正算都是分段线性插值，各自在自己的断点表内是精确的；
 * 误差只来自两套断点表本身的定义差异，以及 WAQI 臭氧分项采用 8 小时口径。
 */

export type Bp = [number, number, number, number]; // [concLow, concHigh, indexLow, indexHigh]

/** US EPA 断点表。浓度单位：PM μg/m³、CO ppm(8h)、SO2/NO2/O3 ppb。 */
export const US_BP: Record<string, Bp[]> = {
  pm25: [[0, 12.0, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 350.4, 301, 400], [350.5, 500.4, 401, 500]],
  pm10: [[0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150], [255, 354, 151, 200], [355, 424, 201, 300], [425, 504, 301, 400], [505, 604, 401, 500]],
  co: [[0, 4.4, 0, 50], [4.5, 9.4, 51, 100], [9.5, 12.4, 101, 150], [12.5, 15.4, 151, 200], [15.5, 30.4, 201, 300], [30.5, 40.4, 301, 400], [40.5, 50.4, 401, 500]],
  so2: [[0, 35, 0, 50], [36, 75, 51, 100], [76, 185, 101, 150], [186, 304, 151, 200], [305, 604, 201, 300], [605, 804, 301, 400], [805, 1004, 401, 500]],
  no2: [[0, 53, 0, 50], [54, 100, 51, 100], [101, 360, 101, 150], [361, 649, 151, 200], [650, 1249, 201, 300], [1250, 1649, 301, 400], [1650, 2049, 401, 500]],
  o3: [[0, 54, 0, 50], [55, 70, 51, 100], [71, 85, 101, 150], [86, 105, 151, 200], [106, 200, 201, 300], [201, 404, 301, 400], [405, 604, 401, 500]],
};

/** 中国 HJ 633-2012 断点表。浓度单位：PM/SO2/NO2/O3 μg/m³、CO mg/m³。 */
export const CN_BP: Record<string, Bp[]> = {
  pm25: [[0, 35, 0, 50], [35, 75, 50, 100], [75, 115, 100, 150], [115, 150, 150, 200], [150, 250, 200, 300], [250, 350, 300, 400], [350, 500, 400, 500]],
  pm10: [[0, 50, 0, 50], [50, 150, 50, 100], [150, 250, 100, 150], [250, 350, 150, 200], [350, 420, 200, 300], [420, 500, 300, 400], [500, 600, 400, 500]],
  so2: [[0, 50, 0, 50], [50, 150, 50, 100], [150, 475, 100, 150], [475, 800, 150, 200], [800, 1600, 200, 300], [1600, 2100, 300, 400], [2100, 2620, 400, 500]],
  no2: [[0, 40, 0, 50], [40, 80, 50, 100], [80, 180, 100, 150], [180, 280, 150, 200], [280, 565, 200, 300], [565, 750, 300, 400], [750, 940, 400, 500]],
  co: [[0, 2, 0, 50], [2, 4, 50, 100], [4, 14, 100, 150], [14, 24, 150, 200], [24, 36, 200, 300], [36, 48, 300, 400], [48, 90, 400, 500]],
  o3: [[0, 160, 0, 50], [160, 200, 50, 100], [200, 300, 100, 150], [300, 400, 150, 200], [400, 800, 200, 300], [800, 1000, 300, 400], [1000, 1200, 400, 500]],
};

/** US 单位 -> 国标单位 的浓度换算系数（25°C / 101.325 kPa，摩尔体积 24.45 L/mol）。 */
const US_TO_CN_CONC: Record<string, { factor: number; unit: string }> = {
  pm25: { factor: 1, unit: "μg/m³" },
  pm10: { factor: 1, unit: "μg/m³" },
  co: { factor: 28.01 / 24.45, unit: "mg/m³" },
  so2: { factor: 64.06 / 24.45, unit: "μg/m³" },
  no2: { factor: 46.01 / 24.45, unit: "μg/m³" },
  o3: { factor: 48.0 / 24.45, unit: "μg/m³" },
};

const US_UNITS: Record<string, string> = {
  pm25: "μg/m³", pm10: "μg/m³", co: "ppm", so2: "ppb", no2: "ppb", o3: "ppb",
};

/** 由分项指数反算浓度（US 断点表的逆运算）。超出表上界时按比例外推。 */
export function indexToConcUS(key: string, index: number): number | null {
  const table = US_BP[key];
  if (!table || !Number.isFinite(index) || index < 0) return null;
  for (const [cLo, cHi, iLo, iHi] of table) {
    if (index >= iLo && index <= iHi) {
      if (iHi === iLo) return cLo;
      return cLo + ((index - iLo) * (cHi - cLo)) / (iHi - iLo);
    }
  }
  const last = table[table.length - 1];
  return last[1] + ((index - last[3]) * (last[1] - last[0])) / Math.max(1, last[3] - last[2]);
}

/** 由浓度正算分项指数（中国 HJ 633-2012）。 */
export function concToIndexCN(key: string, conc: number): number | null {
  const table = CN_BP[key];
  if (!table || !Number.isFinite(conc) || conc < 0) return null;
  for (const [cLo, cHi, iLo, iHi] of table) {
    if (conc >= cLo && conc <= cHi) {
      if (cHi === cLo) return iLo;
      return Math.round(iLo + ((conc - cLo) * (iHi - iLo)) / (cHi - cLo));
    }
  }
  const last = table[table.length - 1];
  return Math.round(last[3] + ((conc - last[1]) * (last[3] - last[2])) / Math.max(1e-9, last[1] - last[0]));
}

const CN_LEVELS = [
  { max: 50, name: "优", en: "Good" },
  { max: 100, name: "良", en: "Moderate" },
  { max: 150, name: "轻度污染", en: "Lightly Polluted" },
  { max: 200, name: "中度污染", en: "Moderately Polluted" },
  { max: 300, name: "重度污染", en: "Heavily Polluted" },
  { max: Infinity, name: "严重污染", en: "Severely Polluted" },
];

const US_LEVELS = [
  { max: 50, name: "Good", cn: "优" },
  { max: 100, name: "Moderate", cn: "良" },
  { max: 150, name: "Unhealthy for Sensitive Groups", cn: "对敏感人群不健康" },
  { max: 200, name: "Unhealthy", cn: "不健康" },
  { max: 300, name: "Very Unhealthy", cn: "非常不健康" },
  { max: Infinity, name: "Hazardous", cn: "危险" },
];

export function levelCN(aqi: number): { index: number; name: string } {
  for (let i = 0; i < CN_LEVELS.length; i++) {
    if (aqi <= CN_LEVELS[i].max) return { index: i, name: CN_LEVELS[i].name };
  }
  return { index: 5, name: CN_LEVELS[5].name };
}

export function levelUS(aqi: number): { index: number; name: string; cn: string } {
  for (let i = 0; i < US_LEVELS.length; i++) {
    if (aqi <= US_LEVELS[i].max) return { index: i, name: US_LEVELS[i].name, cn: US_LEVELS[i].cn };
  }
  return { index: 5, name: US_LEVELS[5].name, cn: US_LEVELS[5].cn };
}

export type PollutantView = {
  index: number | null;
  conc: number | null;
  unit: string;
  is_primary: boolean;
};

export type AqiView = {
  std: "us" | "cn";
  aqi: number | null;
  level: string;
  level_index: number;
  level_alt: string;
  pollutants: Record<string, PollutantView>;
};

const ROUND = (n: number | null, d: number): number | null =>
  n === null || !Number.isFinite(n) ? null : Number(n.toFixed(d));

/**
 * 由 WAQI 的 iaqi（美标分项指数）同时构造美标视图与国标视图。
 * primary 为 WAQI 给出的 dominentpol。
 */
export function buildViews(iaqi: Record<string, number>, primary: string): { us: AqiView; cn: AqiView } {
  const keys = ["pm25", "pm10", "o3", "no2", "so2", "co"];

  const usPollutants: Record<string, PollutantView> = {};
  const cnPollutants: Record<string, PollutantView> = {};
  let cnMax = -1;
  let cnPrimary = primary;

  for (const k of keys) {
    const raw = iaqi[k];
    const usIdx = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : null;
    const concUS = usIdx === null ? null : indexToConcUS(k, usIdx);
    const conv = US_TO_CN_CONC[k];
    const concCN = concUS === null ? null : concUS * conv.factor;
    const cnIdx = concCN === null ? null : concToIndexCN(k, concCN);

    usPollutants[k] = {
      index: usIdx,
      conc: ROUND(concUS, k === "co" ? 2 : 1),
      unit: US_UNITS[k],
      is_primary: k === primary,
    };
    cnPollutants[k] = {
      index: cnIdx,
      conc: ROUND(concCN, k === "co" ? 2 : 1),
      unit: conv.unit,
      is_primary: k === primary,
    };

    if (cnIdx !== null && cnIdx > cnMax) {
      cnMax = cnIdx;
      cnPrimary = k;
    }
  }

  const usAqiRaw = usIdxOf(iaqi, primary, keys);
  const usLevel = levelUS(usAqiRaw);
  const cnAqi = cnMax >= 0 ? cnMax : null;
  const cnLevel = levelCN(cnAqi ?? 0);

  // 国标下首要污染物按国标分项指数最大值重新判定
  if (cnAqi !== null) {
    for (const k of keys) cnPollutants[k].is_primary = k === cnPrimary;
  }

  return {
    us: {
      std: "us",
      aqi: usAqiRaw,
      level: usLevel.name,
      level_index: usLevel.index,
      level_alt: usLevel.cn,
      pollutants: usPollutants,
    },
    cn: {
      std: "cn",
      aqi: cnAqi,
      level: cnLevel.name,
      level_index: cnAqi === null ? -1 : cnLevel.index,
      level_alt: "换算值",
      pollutants: cnPollutants,
    },
  };
}

/** WAQI 的 data.aqi 是整体美标 AQI；缺失时退回各分项最大值。 */
function usIdxOf(iaqi: Record<string, number>, primary: string, keys: string[]): number {
  const p = iaqi[primary];
  if (typeof p === "number" && Number.isFinite(p)) {
    let m = Math.round(p);
    for (const k of keys) {
      const v = iaqi[k];
      if (typeof v === "number" && Number.isFinite(v)) m = Math.max(m, Math.round(v));
    }
    return m;
  }
  let m = 0;
  for (const k of keys) {
    const v = iaqi[k];
    if (typeof v === "number" && Number.isFinite(v)) m = Math.max(m, Math.round(v));
  }
  return m;
}

export const PRIMARY_LABEL: Record<string, string> = {
  pm25: "PM2.5", pm10: "PM10", o3: "臭氧 O₃", no2: "二氧化氮 NO₂",
  so2: "二氧化硫 SO₂", co: "一氧化碳 CO",
};
