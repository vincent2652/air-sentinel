/* 空气哨兵 AirSentinel — iPhone 常亮实时空气质量监控台
 *
 * 与 Air Matters 的关键差别：不需要手动下拉。
 * 页面自己按设定间隔取数、自己重绘、自己处理失败与数据过期，
 * 并用 Wake Lock（或无声视频兜底）阻止 iOS 熄屏，保证定时器不被冻结。
 */
(() => {
  'use strict';

  // ============================================================
  // 常量
  // ============================================================

  // 16x16、1 秒、无声、H.264 baseline 的极小视频，用于 iOS 常亮兜底（内联，不依赖网络）
  const SILENT_MP4_B64 =
    'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAM/bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAABXgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAml0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAABXgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAV4AAAAAAABAAAAAAHhbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAOABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABjG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAUxzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAe/+EAFmdCwB7ZHsBEAAADAAQAAAMAKDxYuSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAA+aAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAHAAAIAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAHAAAAAQAAADBzdHN6AAAAAAAAAAAAAAAHAAACgwAAAAoAAAAKAAAACQAAAAkAAAAJAAAACQAAABRzdGNvAAAAAAAAAAEAAANvAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2Mi4xMi4xMDIAAAAIZnJlZQAAAsNtZGF0AAACcAYF//9s3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49NSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAtliIQEfJigADYjgAAAAAZBmjgI+oAAAAAGQZpUAj6gAAAABUGaYBH1AAAABUGagBH1AAAABUGaoBD1AAAABUGawD/U';

  const LEVEL_COLORS = ['#2ee06a', '#f2d024', '#ff8f3c', '#ff4d4f', '#c45cff', '#a03054'];

  const ADVICE = [
    '空气质量令人满意，基本无空气污染，各类人群可正常活动。',
    '空气质量可接受，但某些污染物可能对极少数异常敏感人群的健康有较弱影响。',
    '易感人群症状有轻度加剧，健康人群可能出现刺激症状。儿童、老年人以及心脏病、呼吸系统疾病患者应减少长时间、高强度的户外锻炼。',
    '进一步加剧易感人群症状，可能对健康人群的心脏、呼吸系统有影响。疾病患者应避免长时间、高强度户外锻炼，一般人群适量减少户外运动。',
    '心脏病和肺病患者症状显著加剧，运动耐受力降低，健康人群普遍出现症状。儿童、老年人和病人应停留在室内并停止户外运动，一般人群减少户外活动。',
    '健康人群运动耐受力降低，有明显强烈症状。儿童、老年人和病人应留在室内、避免体力消耗，一般人群应避免户外活动。',
  ];

  const POLLUTANTS = [
    { key: 'pm25', label: 'PM2.5', digits: 0 },
    { key: 'pm10', label: 'PM10', digits: 0 },
    { key: 'o3', label: 'O₃', digits: 0 },
    { key: 'no2', label: 'NO₂', digits: 0 },
    { key: 'so2', label: 'SO₂', digits: 1 },
    { key: 'co', label: 'CO', digits: 1 },
  ];

  const FC_LABEL = { pm25: 'PM2.5', pm10: 'PM10', o3: '臭氧 O₃' };
  const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const RING_C = 2 * Math.PI * 16;
  const MAX_POINTS = 240;

  const K = {
    settings: 'airsentinel.settings.v2',
    geo: 'airsentinel.geo.v2',
    series: 'airsentinel.series.v2',
    booted: 'airsentinel.booted.v2',
  };

  const DEFAULTS = { interval: 300, std: 'cn', keepAwake: true, pixelShift: true, showWeather: true, fcKey: 'pm25', allowFallback: true };

  // ============================================================
  // 小工具
  // ============================================================

  const $ = (id) => document.getElementById(id);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function readStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 隐私模式下静默降级 */ }
  }

  function fmtNum(v, digits) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    return Number(v).toFixed(digits).replace(/\.0+$/, '');
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function hhmm(date) { return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`; }

  function mmss(sec) {
    sec = Math.max(0, Math.round(sec));
    return `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
  }

  function agoText(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return `${s} 秒前`;
    if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
    if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
    return `${Math.floor(s / 86400)} 天前`;
  }

  function dayLabel(isoDay, todayIso) {
    if (isoDay === todayIso) return '今天';
    const d = new Date(`${isoDay}T12:00:00`);
    if (Number.isNaN(d.getTime())) return isoDay.slice(5);
    const diff = Math.round((new Date(`${todayIso}T12:00:00`) - d) / 86400000);
    if (diff === -1) return '明天';
    if (diff === 1) return '昨天';
    return `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAY[d.getDay()]}`;
  }

  function levelColorOf(idx) { return LEVEL_COLORS[clamp(idx, 0, 5)]; }

  function levelIndexOf(aqi) {
    if (aqi === null || aqi === undefined) return -1;
    if (aqi <= 50) return 0;
    if (aqi <= 100) return 1;
    if (aqi <= 150) return 2;
    if (aqi <= 200) return 3;
    if (aqi <= 300) return 4;
    return 5;
  }

  // ============================================================
  // 运行状态
  // ============================================================

  const S = {
    settings: Object.assign({}, DEFAULTS, readStore(K.settings, {})),
    geo: readStore(K.geo, null),
    data: null,
    series: [],
    lastOkAt: 0,
    lastTryAt: 0,
    lastError: null,
    failStreak: 0,
    nextAt: 0,
    inflight: false,
    wakeLock: null,
    wakeMode: 'none',
    shiftTimer: null,
    cfgTimer: null,
    configured: null,
    lastErrorCode: null,
    lastCnemcErr: null,
    demo: new URLSearchParams(location.search).has('demo'),
  };

  function saveSettings() { writeStore(K.settings, S.settings); }

  // ============================================================
  // 24 小时序列：本机累积
  //
  // 国控站发布接口不提供干净的逐小时历史（aqicn 的历史端点是压缩增量编码的
  // SSE 流，不适合做依赖），所以曲线由本机每次成功取数后累积。
  // 手机长期挂着，一天之内就会补满 24 小时。
  // ============================================================

  function seriesKey() {
    const st = S.data && S.data.station;
    return st && st.idx ? `idx-${st.idx}` : 'manual';
  }

  function loadSeries() {
    const all = readStore(K.series, {});
    S.series = Array.isArray(all[seriesKey()]) ? all[seriesKey()] : [];
  }

  function saveSeries() {
    const all = readStore(K.series, {});
    all[seriesKey()] = S.series.slice(-MAX_POINTS);
    // 只保留最近 3 个站点，避免 localStorage 无限膨胀
    const keys = Object.keys(all);
    if (keys.length > 3) keys.slice(0, keys.length - 3).forEach((k) => delete all[k]);
    writeStore(K.series, all);
  }

  function appendSeries() {
    // 上游已提供逐小时历史时不再本机累积，避免重复存储
    if (S.data && Array.isArray(S.data.history24h) && S.data.history24h.length >= 2) return;
    const v = S.data && S.data.views;
    if (!v) return;
    const usA = v.us.aqi, cnA = v.cn.aqi;
    const observed = S.data.observed_at ? Date.parse(S.data.observed_at) : Date.now();
    const t = Number.isFinite(observed) ? observed : Date.now();
    const last = S.series[S.series.length - 1];
    // 上游约每小时才出新值：观测时间没变就只更新数值，不新增点
    if (last && Math.abs(last.t - t) < 10 * 60 * 1000) {
      last.us = usA; last.cn = cnA; last.at = Date.now();
    } else {
      S.series.push({ t, us: usA, cn: cnA, at: Date.now() });
    }
    if (S.series.length > MAX_POINTS) S.series = S.series.slice(-MAX_POINTS);
    saveSeries();
  }

  // ============================================================
  // 取数
  // ============================================================

  async function fetchAQ() {
    // 还没有位置时不计失败、不覆盖定位指引横幅，只让倒计时继续走
    if (!S.geo && !S.demo) {
      scheduleNext();
      return;
    }
    if (S.inflight) return;
    S.inflight = true;
    S.lastTryAt = Date.now();
    const btn = $('refresh-btn');
    if (btn) btn.classList.add('spin');

    try {
      const payload = S.demo ? demoPayload() : await fetchRemote();
      S.data = payload;
      S.lastOkAt = Date.now();
      S.failStreak = 0;
      S.lastError = null;
      loadSeries();
      appendSeries();
      try {
        renderAll();
      } catch (renderErr) {
        tickErrors += 1;
        S.lastError = '渲染异常: ' + (renderErr && renderErr.message ? renderErr.message : String(renderErr));
      }
      clearBanner();
    } catch (err) {
      S.failStreak += 1;
      S.lastError = err && err.message ? err.message : String(err);
      S.lastErrorCode = err && err.code ? String(err.code) : null;
      renderErrorState();
    } finally {
      S.inflight = false;
      if (btn) btn.classList.remove('spin');
      scheduleNext();
      renderDiag();
    }
  }

  /** 健康检查：不需要位置就能知道服务端数据源是否已配置。 */
  async function checkConfig() {
    try {
      const r = await fetch('/functions/v1/app/', { cache: 'no-store' });
      const b = await r.json();
      S.configured = Boolean(b && b.configured);
    } catch {
      S.configured = null;
    }
    renderDiag();
    return S.configured;
  }

  // ============================================================
  // 本地直连模式（单文件便携版）
  //
  // 当页面注入 window.__AIRSENTINEL_DIRECT__ = true 时，不经过服务端代理，
  // 浏览器直接调用 Open-Meteo（免 Key、CORS 开放）。用于把整个应用打包成
  // 单个 HTML 文件放到任意匿名 HTTPS 静态托管上，实现免登录常亮展示。
  // 该模式只有模式推算数据；官方国控站链路必须走服务端代理版本。
  // ============================================================

  const DIRECT = Boolean(window.__AIRSENTINEL_DIRECT__);

  const D_US_BP = {
    pm25: [[0, 12.0, 0, 50], [12.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 150.4, 151, 200], [150.5, 250.4, 201, 300], [250.5, 350.4, 301, 400], [350.5, 500.4, 401, 500]],
    pm10: [[0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150], [255, 354, 151, 200], [355, 424, 201, 300], [425, 504, 301, 400], [505, 604, 401, 500]],
    co: [[0, 4.4, 0, 50], [4.5, 9.4, 51, 100], [9.5, 12.4, 101, 150], [12.5, 15.4, 151, 200], [15.5, 30.4, 201, 300], [30.5, 40.4, 301, 400], [40.5, 50.4, 401, 500]],
    so2: [[0, 35, 0, 50], [36, 75, 51, 100], [76, 185, 101, 150], [186, 304, 151, 200], [305, 604, 201, 300], [605, 804, 301, 400], [805, 1004, 401, 500]],
    no2: [[0, 53, 0, 50], [54, 100, 51, 100], [101, 360, 101, 150], [361, 649, 151, 200], [650, 1249, 201, 300], [1250, 1649, 301, 400], [1650, 2049, 401, 500]],
    o3: [[0, 54, 0, 50], [55, 70, 51, 100], [71, 85, 101, 150], [86, 105, 151, 200], [106, 200, 201, 300], [201, 404, 301, 400], [405, 604, 401, 500]],
  };
  const D_CN_BP = {
    pm25: [[0, 35, 0, 50], [35, 75, 50, 100], [75, 115, 100, 150], [115, 150, 150, 200], [150, 250, 200, 300], [250, 350, 300, 400], [350, 500, 400, 500]],
    pm10: [[0, 50, 0, 50], [50, 150, 50, 100], [150, 250, 100, 150], [250, 350, 150, 200], [350, 420, 200, 300], [420, 500, 300, 400], [500, 600, 400, 500]],
    so2: [[0, 50, 0, 50], [50, 150, 50, 100], [150, 475, 100, 150], [475, 800, 150, 200], [800, 1600, 200, 300], [1600, 2100, 300, 400], [2100, 2620, 400, 500]],
    no2: [[0, 40, 0, 50], [40, 80, 50, 100], [80, 180, 100, 150], [180, 280, 150, 200], [280, 565, 200, 300], [565, 750, 300, 400], [750, 940, 400, 500]],
    co: [[0, 2, 0, 50], [2, 4, 50, 100], [4, 14, 100, 150], [14, 24, 150, 200], [24, 36, 200, 300], [36, 48, 300, 400], [48, 90, 400, 500]],
    o3: [[0, 160, 0, 50], [160, 200, 50, 100], [200, 300, 100, 150], [300, 400, 150, 200], [400, 800, 200, 300], [800, 1000, 300, 400], [1000, 1200, 400, 500]],
  };
  // μg/m³ -> 美标单位 的除数（CO：1 ppm = 1145.6 μg/m³）
  const D_UG_TO_US = { pm25: 1, pm10: 1, o3: 48 / 24.45, no2: 46.01 / 24.45, so2: 64.06 / 24.45, co: (28.01 / 24.45) * 1000 };
  const D_US_UNIT = { pm25: 'μg/m³', pm10: 'μg/m³', o3: 'ppb', no2: 'ppb', so2: 'ppb', co: 'ppm' };
  const D_KEYS = ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co'];
  const D_FIELD = { pm25: 'pm2_5', pm10: 'pm10', o3: 'ozone', no2: 'nitrogen_dioxide', so2: 'sulphur_dioxide', co: 'carbon_monoxide' };

  function dFwd(table, key, conc) {
    const t = table[key];
    if (!t || !Number.isFinite(conc) || conc < 0) return null;
    for (const [cLo, cHi, iLo, iHi] of t) {
      if (conc >= cLo && conc <= cHi) return cHi === cLo ? Math.round(iLo) : Math.round(iLo + ((conc - cLo) * (iHi - iLo)) / (cHi - cLo));
    }
    return conc > t[t.length - 1][1] ? Math.round(t[t.length - 1][3]) : 0;
  }

  function dViewsFromConc(concUG) {
    const usPol = {}, cnPol = {};
    let usMax = -1, cnMax = -1, usPrimary = 'pm25', cnPrimary = 'pm25';
    D_KEYS.forEach((k) => {
      const ug = concUG[k];
      if (ug === null || ug === undefined || !Number.isFinite(ug)) {
        usPol[k] = { index: null, conc: null, unit: D_US_UNIT[k], is_primary: false };
        cnPol[k] = { index: null, conc: null, unit: k === 'co' ? 'mg/m³' : 'μg/m³', is_primary: false };
        return;
      }
      const usConc = ug / D_UG_TO_US[k];
      const cnConc = k === 'co' ? ug / 1000 : ug;
      const usIdx = dFwd(D_US_BP, k, usConc);
      const cnIdx = dFwd(D_CN_BP, k, cnConc);
      usPol[k] = { index: usIdx, conc: Number(usConc.toFixed(k === 'co' ? 2 : 1)), unit: D_US_UNIT[k], is_primary: false };
      cnPol[k] = { index: cnIdx, conc: Number(cnConc.toFixed(k === 'co' ? 2 : 1)), unit: k === 'co' ? 'mg/m³' : 'μg/m³', is_primary: false };
      if (usIdx !== null && usIdx > usMax) { usMax = usIdx; usPrimary = k; }
      if (cnIdx !== null && cnIdx > cnMax) { cnMax = cnIdx; cnPrimary = k; }
    });
    D_KEYS.forEach((k) => { usPol[k].is_primary = k === usPrimary; cnPol[k].is_primary = k === cnPrimary; });
    const usAqi = usMax >= 0 ? usMax : null;
    const cnAqi = cnMax >= 0 ? cnMax : null;
    const ul = levelIndexOf(usAqi === null ? -1 : usAqi);
    const cl = levelIndexOf(cnAqi === null ? -1 : cnAqi);
    const US_NAMES = ['Good', 'Moderate', 'Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy', 'Hazardous'];
    const US_CN = ['优', '良', '对敏感人群不健康', '不健康', '非常不健康', '危险'];
    const CN_NAMES = ['优', '良', '轻度污染', '中度污染', '重度污染', '严重污染'];
    return {
      us: { std: 'us', aqi: usAqi, level: US_NAMES[ul], level_index: usAqi === null ? -1 : ul, level_alt: US_CN[ul], pollutants: usPol },
      cn: { std: 'cn', aqi: cnAqi, level: CN_NAMES[cl], level_index: cnAqi === null ? -1 : cl, level_alt: '', pollutants: cnPol },
    };
  }

  async function dFetchJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`direct_http_${r.status}`);
    return r.json();
  }

  async function dPostJSON(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
    });
    if (!r.ok) throw new Error(`direct_http_${r.status}`);
    return r.json();
  }

  /** 官方主源：中国环境监测总站"全国城市空气质量实时发布"（免密钥，经同源 /cnemc 代理）。
   *  直接给出国标 AQI、等级、首要污染物、站点级六项浓度与健康建议，并带逐小时历史。 */
  async function fetchCnemc() {
    const g0 = S.geo;
    if (!g0) throw new Error('还没有位置信息');
    let lat = g0.lat, lon = g0.lon;
    if ((lat === null || lat === undefined) && g0.q) {
      const gc = await dFetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(g0.q)}&count=1&language=zh&format=json`);
      const r0 = gc && gc.results && gc.results[0];
      if (!r0) throw new Error(`找不到城市：${g0.q}`);
      lat = Number(Number(r0.latitude).toFixed(4));
      lon = Number(Number(r0.longitude).toFixed(4));
      S.geo = { lat, lon, q: g0.q, source: 'manual', at: Date.now() };
      writeStore(K.geo, S.geo);
    }
    if (lat === null || lat === undefined || lon === null || lon === undefined) throw new Error('官方源需要经纬度');

    const all = await dFetchJSON('/cnemc/CityData/GetAllCityRealTimeAQIModels');
    if (!Array.isArray(all) || !all.length) throw new Error('官方源返回为空');
    const hav = (a, b, c, d) => {
      const x = (c - a) * 111.0;
      const y = (d - b) * 111.0 * Math.cos((a * Math.PI) / 180);
      return Math.hypot(x, y);
    };
    let city = null, best = Infinity;
    all.forEach((c) => {
      const cl = parseFloat(c.Latitude), co = parseFloat(c.Longitude);
      if (!Number.isFinite(cl) || !Number.isFinite(co)) return;
      const dd = hav(lat, lon, cl, co);
      if (dd < best) { best = dd; city = c; }
    });
    if (!city) throw new Error('官方源未匹配到城市');

    const live = await dFetchJSON(`/cnemc/CityData/GetAQIDataPublishLive?cityName=${encodeURIComponent(city.Area)}`);
    const stations = Array.isArray(live) ? live : [];
    if (!stations.length) throw new Error('官方源无站点实况');
    let st = stations[0], sb = Infinity;
    stations.forEach((s) => {
      const sl = parseFloat(s.Latitude), so = parseFloat(s.Longitude);
      if (!Number.isFinite(sl) || !Number.isFinite(so)) return;
      const dd = hav(lat, lon, sl, so);
      if (dd < sb) { sb = dd; st = s; }
    });

    const numF = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    const coMg = numF(st.CO);
    const concUG = {
      pm25: numF(st.PM2_5), pm10: numF(st.PM10), o3: numF(st.O3),
      no2: numF(st.NO2), so2: numF(st.SO2), co: coMg === null ? null : coMg * 1000,
    };
    const views = dViewsFromConc(concUG);
    const officialAqi = numF(st.AQI);
    const CN_NAMES = ['优', '良', '轻度污染', '中度污染', '重度污染', '严重污染'];
    if (officialAqi !== null) {
      views.cn.aqi = officialAqi;
      views.cn.level_index = levelIndexOf(officialAqi);
      views.cn.level = CN_NAMES[views.cn.level_index] || views.cn.level;
    }

    const pp = String(st.PrimaryPollutant || city.PrimaryPollutant || '');
    let primary = 'pm25';
    if (pp.indexOf('PM10') >= 0) primary = 'pm10';
    else if (pp.indexOf('PM2.5') >= 0) primary = 'pm25';
    else if (pp.indexOf('O3') >= 0) primary = 'o3';
    else if (pp.indexOf('NO2') >= 0) primary = 'no2';
    else if (pp.indexOf('SO2') >= 0) primary = 'so2';
    else if (pp.indexOf('CO') >= 0) primary = 'co';
    D_KEYS.forEach((k) => {
      views.cn.pollutants[k].is_primary = k === primary;
      views.us.pollutants[k].is_primary = k === primary;
    });

    let history24h = [];
    try {
      // 官方逐小时历史：必须 POST + 表单 body；TimePoint 为 /Date(ms)/ 形式
      const hist = await dPostJSON('/cnemc/HourChangesPublish/GetCityRealTimeAqiHistoryByCondition', 'citycode=' + encodeURIComponent(city.CityCode));
      const rows = Array.isArray(hist) ? hist : [];
      const now = Date.now();
      history24h = rows
        .map((r) => {
          let ts = NaN;
          const m = /\/Date\((\d+)\)\//.exec(String(r.TimePoint || ''));
          if (m) ts = Number(m[1]);
          else if (r.TimePoint) ts = Date.parse(r.TimePoint);
          const coMg = numF(r.CO);
          const v = dViewsFromConc({
            pm25: numF(r.PM2_5), pm10: numF(r.PM10), o3: numF(r.O3),
            no2: numF(r.NO2), so2: numF(r.SO2), co: coMg === null ? null : coMg * 1000,
          });
          const cnAqi = numF(r.AQI);
          return Number.isFinite(ts) ? { t: ts, cn: cnAqi !== null ? cnAqi : v.cn.aqi, us: v.us.aqi } : null;
        })
        .filter(Boolean)
        .filter((p) => p.t <= now && p.t >= now - 24 * 3600 * 1000);
    } catch { history24h = []; }

    let wx = null;
    try {
      wx = await dFetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure&timezone=auto`);
    } catch { /* 气象为辅助，失败不阻塞官方主数据 */ }
    const wxc = (wx && wx.current) || {};
    const windKmh = numF(wxc.wind_speed_10m);

    return {
      ok: true,
      requested_std: S.settings.std,
      source: { kind: 'cnemc', official: true, label: '中国环境监测总站 · 全国城市空气质量实时发布（官方实测）' },
      station: {
        name: `${city.Area}${st.PositionName ? ' · ' + st.PositionName : ''}`,
        location: st.PositionName || null,
        idx: st.StationCode || null,
        lat: numF(st.Latitude), lon: numF(st.Longitude),
        url: 'https://air.cnemc.cn:18007/',
        attributions: [{ name: '中国环境监测总站（全国城市空气质量实时发布平台）', url: 'https://air.cnemc.cn:18007/' }],
      },
      primary,
      primary_label: PRIMARY_LABEL_D[primary] || primary.toUpperCase(),
      observed_at: st.TimePoint || city.TimePoint || null,
      observed_tz: '+08:00',
      views,
      weather: {
        temperature_c: numF(wxc.temperature_2m),
        humidity_pct: numF(wxc.relative_humidity_2m),
        wind_ms: windKmh === null ? null : Number((windKmh / 3.6).toFixed(1)),
        pressure_hpa: numF(wxc.surface_pressure),
      },
      forecast: {},
      history24h,
      advice: st.Measure || null,
      fetched_at: new Date().toISOString(),
      derivation: '国标 AQI/等级/首要污染物为官方原值；美标视图由官方浓度按 US EPA 断点表正向计算。',
    };
  }

  /** GitHub Pages 快照源：Actions 每小时抓官方数据提交为静态 JSON，
   *  使纯静态公网托管也能展示官方实测值（无服务端时的官方通道）。 */
  async function fetchSnapshot() {
    const g0 = S.geo;
    if (!g0) throw new Error('还没有位置信息');
    let lat = g0.lat, lon = g0.lon;
    if ((lat === null || lat === undefined) && g0.q) {
      const gc = await dFetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(g0.q)}&count=1&language=zh&format=json`);
      const r0 = gc && gc.results && gc.results[0];
      if (!r0) throw new Error(`找不到城市：${g0.q}`);
      lat = Number(Number(r0.latitude).toFixed(4));
      lon = Number(Number(r0.longitude).toFixed(4));
      S.geo = { lat, lon, q: g0.q, source: 'manual', at: Date.now() };
      writeStore(K.geo, S.geo);
    }
    if (lat === null || lat === undefined) throw new Error('快照源需要经纬度');

    const snap = await dFetchJSON(`./data/cities.json?_=${Date.now()}`);
    const list = snap && Array.isArray(snap.cities) ? snap.cities : null;
    if (!list || !list.length) throw new Error('快照为空');
    const hav = (a, b, c, d) => {
      const x = (c - a) * 111.0;
      const y = (d - b) * 111.0 * Math.cos((a * Math.PI) / 180);
      return Math.hypot(x, y);
    };
    let city = null, best = Infinity;
    list.forEach((c) => {
      const dd = hav(lat, lon, c.lat, c.lon);
      if (dd < best) { best = dd; city = c; }
    });
    const det = await dFetchJSON(`./data/city/${city.code}.json?_=${Date.now()}`);
    const st = det.station || {};
    const numF = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    const concUG = st.conc || {};
    const views = dViewsFromConc(concUG);
    const officialAqi = numF(st.AQI);
    const CN_NAMES = ['优', '良', '轻度污染', '中度污染', '重度污染', '严重污染'];
    if (officialAqi !== null) {
      views.cn.aqi = officialAqi;
      views.cn.level_index = levelIndexOf(officialAqi);
      views.cn.level = CN_NAMES[views.cn.level_index] || views.cn.level;
    }
    const primary = st.primary || 'pm25';
    D_KEYS.forEach((k) => {
      views.cn.pollutants[k].is_primary = k === primary;
      views.us.pollutants[k].is_primary = k === primary;
    });
    const now = Date.now();
    const history24h = (Array.isArray(det.history) ? det.history : [])
      .map((h) => {
        const v = dViewsFromConc(h.conc || {});
        return { t: h.t, cn: h.cn !== null && h.cn !== undefined ? h.cn : v.cn.aqi, us: v.us.aqi };
      })
      .filter((p) => p.t <= now && p.t >= now - 24 * 3600 * 1000);

    return {
      ok: true,
      requested_std: S.settings.std,
      source: {
        kind: 'snapshot',
        official: snap.mode === 'cnemc',
        label: snap.mode === 'cnemc'
          ? `中国环境监测总站官方实测（快照 ${snap.generatedAt ? snap.generatedAt.slice(11, 16) : ''} 更新）`
          : `国控站官方转发（WAQI）快照 ${snap.generatedAt ? snap.generatedAt.slice(11, 16) : ''} 更新 · 国标为换算值`,
      },
      station: {
        name: `${city.name}${st.PositionName ? ' · ' + st.PositionName : ''}`,
        location: st.PositionName || null,
        idx: st.StationCode || null,
        lat: numF(st.lat), lon: numF(st.lon),
        url: 'https://air.cnemc.cn:18007/',
        attributions: [{ name: '中国环境监测总站（全国城市空气质量实时发布平台）', url: 'https://air.cnemc.cn:18007/' }],
      },
      primary,
      primary_label: PRIMARY_LABEL_D[primary] || primary.toUpperCase(),
      observed_at: st.TimePoint || null,
      observed_tz: '+08:00',
      views,
      weather: { temperature_c: null, humidity_pct: null, wind_ms: null, pressure_hpa: null },
      forecast: {},
      history24h,
      advice: st.Measure || null,
      fetched_at: new Date().toISOString(),
      derivation: snap.mode === 'cnemc'
        ? '国标 AQI/等级/首要污染物为官方原值；美标视图由官方浓度按 US EPA 断点表正向计算。'
        : '快照由 WAQI 转发的美标分项指数反算浓度后按 HJ 633-2012 换算国标；美标视图同浓度正向计算。',
    };
  }

  /** 直连取数：官方代理优先 → GitHub 快照 → Open-Meteo 模式数据兜底（页面会标注）。 */
  async function fetchDirect() {
    try {
      return await fetchCnemc();
    } catch (e) {
      S.lastCnemcErr = e && e.message ? e.message : String(e);
    }
    try {
      return await fetchSnapshot();
    } catch (e) {
      S.lastSnapErr = e && e.message ? e.message : String(e);
    }
    return fetchOmDirect();
  }

  async function fetchOmDirect() {
    const g0 = S.geo;
    if (!g0) throw new Error('还没有位置信息');
    let lat = g0.lat, lon = g0.lon;
    // 手动城市（含局域网 HTTP 下 iOS 拒绝定位的场景）：用 Open-Meteo 免费地理编码换经纬度
    if ((lat === null || lat === undefined) && g0.q) {
      const gc = await dFetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(g0.q)}&count=1&language=zh&format=json`);
      const r0 = gc && gc.results && gc.results[0];
      if (!r0) throw new Error(`找不到城市：${g0.q}`);
      lat = Number(Number(r0.latitude).toFixed(4));
      lon = Number(Number(r0.longitude).toFixed(4));
      S.geo = { lat, lon, q: g0.q, source: 'manual', at: Date.now() };
      writeStore(K.geo, S.geo);
    }
    if (lat === null || lat === undefined || lon === null || lon === undefined) {
      throw new Error('本地直连模式需要经纬度定位');
    }
    const g = { lat, lon };
    const fields = D_KEYS.map((k) => D_FIELD[k]).join(',');
    const aq = await dFetchJSON(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${g.lat}&longitude=${g.lon}&current=us_aqi,${fields}&hourly=${fields}&past_days=1&forecast_days=5&timezone=auto`,
    );
    let wx = null;
    try {
      wx = await dFetchJSON(
        `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure&timezone=auto`,
      );
    } catch { /* 气象为辅助，失败不阻塞 */ }

    const cur = aq.current || {};
    const concUG = {};
    D_KEYS.forEach((k) => { const v = cur[D_FIELD[k]]; concUG[k] = typeof v === 'number' ? v : null; });
    const views = dViewsFromConc(concUG);

    let primary = 'pm25', best = -1;
    D_KEYS.forEach((k) => { const i = views.cn.pollutants[k].index; if (i !== null && i > best) { best = i; primary = k; } });

    const hourly = aq.hourly || {};
    const times = Array.isArray(hourly.time) ? hourly.time : [];
    const now = Date.now();
    const cutoff = now - 24 * 3600 * 1000;
    const history24h = [];
    const byDay = {};
    for (let i = 0; i < times.length; i++) {
      const raw = times[i];
      const ts = typeof raw === 'string' ? Date.parse(raw) : NaN;
      if (!Number.isFinite(ts)) continue;
      const c = {};
      D_KEYS.forEach((k) => { const arr = hourly[D_FIELD[k]]; const v = Array.isArray(arr) ? arr[i] : null; c[k] = typeof v === 'number' ? v : null; });
      if (ts <= now && ts >= cutoff) {
        const v = dViewsFromConc(c);
        history24h.push({ t: ts, us: v.us.aqi, cn: v.cn.aqi });
      }
      if (ts >= now) {
        const day = typeof raw === 'string' ? raw.slice(0, 10) : '';
        if (!byDay[day]) byDay[day] = { pm25: [], pm10: [], o3: [] };
        ['pm25', 'pm10', 'o3'].forEach((k) => { if (c[k] !== null) byDay[day][k].push(c[k]); });
      }
    }
    const forecast = {};
    const days = Object.keys(byDay).sort().slice(0, 7);
    ['pm25', 'pm10', 'o3'].forEach((k) => {
      forecast[k] = days.map((day) => {
        const arr = byDay[day][k];
        if (!arr.length) return null;
        const min = Math.round(Math.min.apply(null, arr));
        const max = Math.round(Math.max.apply(null, arr));
        const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
        return avg > 0 ? { day, min, avg, max } : null;
      }).filter(Boolean);
    });

    const wxc = (wx && wx.current) || {};
    const windKmh = typeof wxc.wind_speed_10m === 'number' ? wxc.wind_speed_10m : null;

    return {
      ok: true,
      requested_std: S.settings.std,
      source: { kind: 'openmeteo', official: false, label: 'Open-Meteo · CAMS 模式数据（本地直连，备用源，非国控站实测）' },
      station: { name: '附近区域（模式网格）', location: null, idx: null, lat: g.lat, lon: g.lon, url: null, attributions: [{ name: 'Open-Meteo / Copernicus CAMS（备用源）', url: 'https://open-meteo.com/' }] },
      primary,
      primary_label: (PRIMARY_LABEL_D[primary] || primary.toUpperCase()),
      observed_at: typeof cur.time === 'string' ? cur.time : null,
      observed_tz: null,
      views,
      weather: {
        temperature_c: typeof wxc.temperature_2m === 'number' ? wxc.temperature_2m : null,
        humidity_pct: typeof wxc.relative_humidity_2m === 'number' ? wxc.relative_humidity_2m : null,
        wind_ms: windKmh === null ? null : Number((windKmh / 3.6).toFixed(1)),
        pressure_hpa: typeof wxc.surface_pressure === 'number' ? wxc.surface_pressure : null,
      },
      forecast,
      history24h,
      fetched_at: new Date().toISOString(),
      derivation: '便携单文件版：浏览器直连 Open-Meteo 模式数据，无服务端。官方国控站链路请使用服务端代理版本。',
    };
  }

  const PRIMARY_LABEL_D = { pm25: 'PM2.5', pm10: 'PM10', o3: '臭氧 O₃', no2: '二氧化氮 NO₂', so2: '二氧化硫 SO₂', co: '一氧化碳 CO' };

  async function fetchRemote() {
    if (DIRECT) return fetchDirect();
    const g = S.geo;
    if (!g) throw new Error('还没有位置信息，正在等待定位');
    const qs = new URLSearchParams();
    if (g.lat !== null && g.lon !== null) {
      qs.set('lat', String(g.lat));
      qs.set('lon', String(g.lon));
    } else if (g.q) {
      qs.set('q', g.q);
    } else {
      throw new Error('位置信息不完整');
    }
    qs.set('std', S.settings.std);
    if (S.settings.allowFallback) qs.set('fallback', '1');

    const res = await fetch(`/functions/v1/app/aq?${qs.toString()}`, { cache: 'no-store' });

    // 私有站点会话过期时，网关会返回 401/403 或登录页 HTML。
    // 无人值守的展示屏必须明确提示，而不是静默冻住或显示错乱内容。
    if (res.status === 401 || res.status === 403) {
      const e = new Error('登录会话已过期');
      e.code = 'auth_expired';
      throw e;
    }

    let body = null;
    try { body = await res.json(); } catch {
      const e = new Error(`接口返回了非 JSON 内容（HTTP ${res.status}），通常是登录页`);
      e.code = 'auth_expired';
      throw e;
    }

    if (!res.ok || !body || body.ok !== true) {
      const code = body && body.error && body.error.code ? body.error.code : `http_${res.status}`;
      const msg = body && body.error && body.error.message ? body.error.message : res.statusText;
      const e = new Error(`${code}: ${msg}`);
      e.code = code;
      throw e;
    }
    return body;
  }

  /** 本地演示数据，仅在 ?demo=1 时使用，页面上会明确标注。 */
  function demoPayload() {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19) + '+08:00';
    const mk = (p) => ({ index: p, conc: Math.round(p * 0.55 * 10) / 10, unit: 'μg/m³', is_primary: false });
    const days = [];
    for (let i = 0; i < 8; i++) {
      const d = new Date(now.getTime() + i * 86400000);
      days.push(d.toISOString().slice(0, 10));
    }
    const fc = (base) => days.map((day, i) => {
      const avg = Math.max(3, Math.round(base + Math.sin(i * 1.1) * base * 0.35));
      return { day, min: Math.round(avg * 0.62), avg, max: Math.round(avg * 1.38) };
    });
    return {
      ok: true, demo: true, requested_std: 'us',
      station: { name: '演示数据（Demo）', idx: 0, lat: null, lon: null, url: null, attributions: [{ name: '本机内置样例，非真实观测', url: null }] },
      primary: 'pm25', primary_label: 'PM2.5',
      observed_at: iso, observed_tz: '+08:00',
      views: {
        us: { std: 'us', aqi: 74, level: 'Moderate', level_index: 1, level_alt: '良',
          pollutants: { pm25: mk(74), pm10: mk(57), o3: mk(32), no2: mk(17), so2: mk(5), co: { index: 6, conc: 0.5, unit: 'ppm', is_primary: false } } },
        cn: { std: 'cn', aqi: 33, level: '优', level_index: 0, level_alt: '换算值',
          pollutants: { pm25: { index: 33, conc: 23.0, unit: 'μg/m³', is_primary: true }, pm10: { index: 31, conc: 31.0, unit: 'μg/m³', is_primary: false }, o3: { index: 16, conc: 51.0, unit: 'μg/m³', is_primary: false }, no2: { index: 16, conc: 12.0, unit: 'μg/m³', is_primary: false }, so2: { index: 6, conc: 6.0, unit: 'μg/m³', is_primary: false }, co: { index: 3, conc: 0.6, unit: 'mg/m³', is_primary: false } } },
      },
      weather: { temperature_c: 19, humidity_pct: 59, wind_ms: 0.5, pressure_hpa: 1026, dewpoint_c: null },
      forecast: { pm25: fc(45), pm10: fc(58), o3: fc(70) },
      fetched_at: new Date().toISOString(),
      derivation: '演示数据，不反映真实空气质量。',
    };
  }

  // ============================================================
  // 渲染
  // ============================================================

  function setBanner(kind, html) {
    const b = $('banner');
    b.className = `banner ${kind}`;
    b.innerHTML = html;
    b.hidden = false;
  }

  /** 成功取数后的常驻横幅：演示 > 备用源标注 > 无。 */
  function persistentBanner() {
    if (S.demo) {
      setBanner('info', '<span><b>演示模式</b>（?demo=1）：屏幕上是内置样例数据，不是真实观测值。</span>');
      return;
    }
    const src = S.data && S.data.source;
    if (src && src.official === false) {
      if (src.kind === 'snapshot') {
        setBanner('warn', '<span><b>换算值提示</b>：本快照源自国控站官方转发（WAQI），国标 AQI 由浓度换算得出，与官方发布值可能有 1-2 点差异。</span>');
      } else {
        setBanner('warn', '<span><b>备用源</b>：当前显示的是模式推算值，不是国控站实测，数值可能与官方读数有偏差。官方数据接通后会自动切换。</span>');
      }
      return;
    }
    const b = $('banner');
    b.hidden = true;
    b.className = 'banner';
    b.innerHTML = '';
  }

  function clearBanner() {
    persistentBanner();
  }

  function setTheme(levelIdx) {
    const c = levelIdx >= 0 ? levelColorOf(levelIdx) : '#4a5060';
    document.documentElement.style.setProperty('--aqi', c);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#08090b');
  }

  function renderAll() {
    const d = S.data;
    if (!d) return;
    const view = d.views[S.settings.std] || d.views.us;
    const other = S.settings.std === 'cn' ? d.views.us : d.views.cn;
    const aqi = view.aqi;
    const lvIdx = view.level_index >= 0 ? view.level_index : levelIndexOf(aqi);

    setTheme(lvIdx);
    renderHeader();
    renderHero(view, other, aqi, lvIdx);
    renderPollutants(view, aqi);
    renderChart();
    renderForecast();
    renderWeather();
    renderFooter();
    renderDiag();
  }

  function renderHeader() {
    const d = S.data;
    const st = d.station || {};
    $('loc-name').textContent = st.name || (S.geo && S.geo.q) || '未知站点';
    const bits = [];
    if (st.location) bits.push(st.location);
    if (S.geo && S.geo.lat !== null && S.geo.source === 'geo') bits.push(`${S.geo.lat.toFixed(3)}, ${S.geo.lon.toFixed(3)}`);
    if (st.idx) bits.push(`站点 #${st.idx}`);
    const isBackup = S.data && S.data.source && S.data.source.official === false;
    $('loc-sub').textContent = bits.join(' · ') || (isBackup ? '模式网格 · 备用源' : '国控站实时发布');
  }

  function renderHero(view, other, aqi, lvIdx) {
    const d = S.data;
    const numEl = $('aqi-num');
    const shown = numEl.textContent;
    const next = aqi === null || aqi === undefined ? '--' : String(aqi);
    if (shown !== next) {
      numEl.textContent = next;
      numEl.classList.remove('tick');
      void numEl.offsetWidth;
      numEl.classList.add('tick');
    }

    const isCN = view.std === 'cn';
    $('std-label').textContent = isCN ? '中国标准 AQI · HJ 633-2012' : 'US AQI · EPA';
    $('aqi-level').textContent = view.aqi === null ? '无数据' : view.level;

    const altBits = [];
    if (other && other.aqi !== null && other.aqi !== undefined) {
      altBits.push(other.std === 'cn' ? `国标换算 <b>${other.aqi}</b> ${other.level}` : `美标原值 <b>${other.aqi}</b> ${other.level_alt || other.level}`);
    }
    if (isCN && view.level_alt) altBits.push(`<span title="国标值由美标分项指数换算得到">${view.level_alt}</span>`);
    $('aqi-alt').innerHTML = altBits.join(' · ');

    const pl = d.primary_label || (d.primary ? d.primary.toUpperCase() : '');
    $('aqi-primary').innerHTML = pl ? `首要污染物 <span class="chip">${pl}</span>` : '';

    const scale = $('aqi-scale');
    Array.from(scale.children).forEach((el) => {
      el.classList.toggle('on', Number(el.dataset.lv) === lvIdx);
    });

    $('aqi-advice').textContent = (S.data && S.data.advice) ? S.data.advice : (lvIdx >= 0 ? ADVICE[lvIdx] : '当前没有可用的观测数据。');

    const obs = d.observed_at ? new Date(d.observed_at) : null;
    const stampParts = [];
    if (obs && !Number.isNaN(obs.getTime())) {
      stampParts.push(`观测时间 ${pad2(obs.getMonth() + 1)}-${pad2(obs.getDate())} ${hhmm(obs)}`);
      stampParts.push(agoText(obs.getTime()));
    }
    stampParts.push(`本页取数 ${agoText(S.lastOkAt)}`);
    if (d.demo) stampParts.push('演示数据');
    $('aqi-stamp').textContent = stampParts.join(' · ');
  }

  function renderPollutants(view, aqi) {
    const box = $('grid6');
    const ps = view.pollutants || {};
    const maxIdx = Math.max(150, aqi || 0);

    if (!box.childElementCount) {
      box.innerHTML = POLLUTANTS.map((p) => `
        <div class="pcell" data-k="${p.key}">
          <div class="pcell-label"><span>${p.label}</span><span class="pcell-iaqi"></span></div>
          <div class="pcell-val">—</div>
          <div class="pcell-unit"></div>
          <div class="pcell-bar"><i></i></div>
        </div>`).join('');
    }

    POLLUTANTS.forEach((p) => {
      const cell = box.querySelector(`[data-k="${p.key}"]`);
      if (!cell) return;
      const item = ps[p.key];
      const valEl = cell.querySelector('.pcell-val');
      const unitEl = cell.querySelector('.pcell-unit');
      const iaqiEl = cell.querySelector('.pcell-iaqi');
      const barEl = cell.querySelector('.pcell-bar i');

      if (!item || item.index === null || item.index === undefined) {
        cell.classList.remove('hot');
        cell.style.removeProperty('--pc');
        valEl.textContent = '无数据';
        valEl.classList.add('na');
        unitEl.textContent = '';
        iaqiEl.textContent = '';
        barEl.style.width = '0%';
        return;
      }

      const li = levelIndexOf(item.index);
      const color = levelColorOf(li);
      valEl.classList.remove('na');
      cell.style.setProperty('--pc', color);
      cell.classList.toggle('hot', Boolean(item.is_primary));
      valEl.textContent = fmtNum(item.conc, p.digits);
      unitEl.textContent = `${item.unit || ''} · 分指数 ${item.index}`;
      iaqiEl.textContent = item.is_primary ? '首要' : '';
      iaqiEl.style.color = item.is_primary ? color : '';
      barEl.style.width = `${clamp((item.index / maxIdx) * 100, 2, 100)}%`;
    });
  }

  // ---------- 24 小时曲线（canvas，无外部依赖） ----------

  function renderChart() {
    const cv = $('chart24');
    if (!cv) return;
    const box = cv.parentElement;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = box.clientWidth || 320;
    const h = box.clientHeight || 148;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const std = S.settings.std;
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const server = S.data && Array.isArray(S.data.history24h) && S.data.history24h.length >= 2 ? S.data.history24h : null;
    const pts = server
      ? server.filter((p) => p[std] !== null && p[std] !== undefined).map((p) => ({ t: p.t, us: p.us, cn: p.cn }))
      : S.series.filter((p) => p.t >= cutoff && p[std] !== null && p[std] !== undefined);
    const note = $('note-24');

    if (pts.length < 2) {
      if (note) note.textContent = `本机累积中 · ${pts.length}/2 点`;
      drawChartEmpty(ctx, w, h, pts.length);
      return;
    }
    if (note) {
      const span = (pts[pts.length - 1].t - pts[0].t) / 3600000;
      note.textContent = server
        ? `上游逐小时 · 已覆盖 ${span.toFixed(1)} 小时 · ${pts.length} 点`
        : `本机累积 · 已覆盖 ${span.toFixed(1)} 小时 · ${pts.length} 点`;
    }
    drawChart(ctx, w, h, pts, std);
  }

  function drawChartEmpty(ctx, w, h, n) {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 22.5);
    ctx.lineTo(w, h - 22.5);
    ctx.stroke();
    ctx.fillStyle = '#626a78';
    ctx.font = '11.5px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(n === 0 ? '曲线由本机每次取数累积，暂无数据点' : '已记录 1 个点，继续挂机后自动连成曲线', w / 2, h / 2 - 4);
    ctx.fillText('国控站发布接口不提供逐小时历史，因此不做跨设备回填', w / 2, h / 2 + 14);
  }

  function drawChart(ctx, w, h, pts, std) {
    const padL = 30, padR = 8, padT = 12, padB = 24;
    const iw = w - padL - padR;
    const ih = h - padT - padB;

    const t0 = Date.now() - 24 * 3600 * 1000;
    const t1 = Date.now();
    const vals = pts.map((p) => p[std]);
    const yMax = Math.max(150, Math.ceil(Math.max.apply(null, vals) / 50) * 50);
    const X = (t) => padL + ((t - t0) / (t1 - t0)) * iw;
    const Y = (v) => padT + ih - (clamp(v, 0, yMax) / yMax) * ih;

    // 分级底色带
    const bands = [[0, 50, 0], [50, 100, 1], [100, 150, 2], [150, 200, 3], [200, 300, 4], [300, yMax, 5]];
    bands.forEach(([lo, hi, li]) => {
      if (lo >= yMax) return;
      const y1 = Y(Math.min(hi, yMax));
      const y2 = Y(lo);
      ctx.fillStyle = levelColorOf(li);
      ctx.globalAlpha = 0.07;
      ctx.fillRect(padL, y1, iw, Math.max(0, y2 - y1));
      ctx.globalAlpha = 1;
    });

    // 网格与 Y 轴刻度
    ctx.font = '9.5px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const step = yMax > 300 ? 100 : 50;
    for (let v = 0; v <= yMax; v += step) {
      const y = Y(v);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillStyle = '#626a78';
      ctx.fillText(String(v), padL - 6, y);
    }

    // X 轴时间刻度
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 6; i++) {
      const t = t0 + (i / 6) * (t1 - t0);
      const d = new Date(t);
      if (d.getHours() % 4 !== 0 && i !== 6) continue;
      ctx.fillStyle = '#626a78';
      ctx.fillText(i === 6 ? '现在' : `${pad2(d.getHours())}:00`, X(t), h - padB + 7);
    }

    // 面积 + 折线
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = X(p.t), y = Y(p[std]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    const linePath = new Path2D();
    pts.forEach((p, i) => {
      const x = X(p.t), y = Y(p[std]);
      if (i === 0) linePath.moveTo(x, y); else linePath.lineTo(x, y);
    });

    ctx.lineTo(X(pts[pts.length - 1].t), padT + ih);
    ctx.lineTo(X(pts[0].t), padT + ih);
    ctx.closePath();
    const lastLv = levelIndexOf(pts[pts.length - 1][std]);
    const grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
    grad.addColorStop(0, hexA(levelColorOf(lastLv), 0.30));
    grad.addColorStop(1, hexA(levelColorOf(lastLv), 0.02));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = levelColorOf(lastLv);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(linePath);

    // 数据点
    pts.forEach((p, i) => {
      const isLast = i === pts.length - 1;
      ctx.beginPath();
      ctx.arc(X(p.t), Y(p[std]), isLast ? 3.6 : 2, 0, Math.PI * 2);
      ctx.fillStyle = isLast ? levelColorOf(levelIndexOf(p[std])) : hexA(levelColorOf(levelIndexOf(p[std])), 0.75);
      ctx.fill();
      if (isLast) {
        ctx.strokeStyle = 'rgba(8,9,11,0.9)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    });
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  // ---------- 未来 7 天 ----------

  function renderForecast() {
    const box = $('trend7');
    if (!box) return;
    const fc = (S.data && S.data.forecast) || {};
    const key = S.settings.fcKey;
    const list = Array.isArray(fc[key]) ? fc[key] : [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const days = list.slice(0, 7);

    const fcTitle = $('fc-title');
    if (fcTitle) fcTitle.textContent = days.length ? `未来 ${days.length} 天` : '未来几天';

    const fcFoot = $('fc-foot');
    if (fcFoot) {
      const kind = S.data && S.data.source ? S.data.source.kind : '';
      fcFoot.textContent = kind === 'cnemc'
        ? '官方实时发布只含实测、不含预报，因此官方源下本面板不展示。'
        : (kind === 'waqi'
          ? '这是 WAQI 项目发布的逐日区间预报（min / avg / max），不是国控站实测值。国控站只发布已发生的实测数据，本身不提供预报。'
          : '这是备用源（Open-Meteo 模式）的逐日区间预报（min / avg / max），为卫星+模式推算值，不是国控站实测。');
    }

    Array.from(document.querySelectorAll('#seg-fc button')).forEach((b) => {
      b.classList.toggle('on', b.dataset.v === key);
    });

    if (!days.length) {
      box.innerHTML = '<div class="t7-row"><div class="t7-day">无预报</div><div class="t7-track"></div><div class="t7-val"><span class="t7-lv">上游未返回该污染物预报</span></div></div>';
      return;
    }

    const maxV = Math.max(75, ...days.map((d) => d.max));
    box.innerHTML = days.map((d) => {
      const lv = levelIndexOf(concLevel(key, d.avg));
      const c = levelColorOf(lv);
      const label = dayLabel(d.day, todayIso);
      return `
        <div class="t7-row">
          <div class="t7-day${label === '今天' ? ' today' : ''}">${label}</div>
          <div class="t7-track" title="min ${d.min} / max ${d.max}">
            <i style="width:${clamp((d.avg / maxV) * 100, 2, 100)}%;background:${c}"></i>
          </div>
          <div class="t7-val">
            <span class="t7-num" style="color:${c}">${Math.round(d.avg)}</span>
            <span class="t7-lv">${Math.round(d.min)}-${Math.round(d.max)}</span>
          </div>
        </div>`;
    }).join('');
  }

  /** 预报给的是浓度（μg/m³），用国标断点粗分档只为配色，不当作 AQI 数值展示。 */
  function concLevel(key, conc) {
    const bp = {
      pm25: [35, 75, 115, 150, 250, 350],
      pm10: [50, 150, 250, 350, 420, 500],
      o3: [160, 200, 300, 400, 800, 1000],
    }[key];
    if (!bp) return 0;
    for (let i = 0; i < bp.length; i++) if (conc <= bp[i]) return i;
    return 5;
  }

  // ---------- 气象 ----------

  function renderWeather() {
    const panel = $('wx-panel');
    const box = $('wx-grid');
    if (!panel || !box) return;
    if (!S.settings.showWeather) { panel.hidden = true; return; }
    const wx = (S.data && S.data.weather) || {};
    const cells = [
      { k: '气温', v: wx.temperature_c, u: '°C', d: 0 },
      { k: '湿度', v: wx.humidity_pct, u: '%', d: 0 },
      { k: '风速', v: wx.wind_ms, u: 'm/s', d: 1 },
      { k: '气压', v: wx.pressure_hpa, u: 'hPa', d: 0 },
    ];
    const has = cells.some((c) => c.v !== null && c.v !== undefined);
    if (!has) { panel.hidden = true; return; }
    panel.hidden = false;
    const wxFoot = $('wx-foot');
    if (wxFoot) {
      const kind = S.data && S.data.source ? S.data.source.kind : '';
      wxFoot.textContent = kind === 'cnemc'
        ? '官方实时发布不含气象要素，此处气象来自 Open-Meteo，仅供解释污染扩散条件。'
        : '现场气象与空气质量同一路数据，用于解释污染的扩散与累积条件。';
    }
    box.innerHTML = cells.map((c) => `
      <div class="wx-cell">
        <div class="wx-k">${c.k}</div>
        <div class="wx-v">${fmtNum(c.v, c.d)}<span class="wx-u">${c.v === null || c.v === undefined ? '' : c.u}</span></div>
      </div>`).join('');
  }

  // ---------- 页脚 ----------

  function renderFooter() {
    const d = S.data || {};
    const attrs = Array.isArray(d.station && d.station.attributions) ? d.station.attributions : [];
    const names = attrs.map((a) => a.name).filter(Boolean).slice(0, 3).join(' / ');
    const srcLabel = d.source && d.source.label ? d.source.label : '';
    $('src-line').textContent = srcLabel ? `数据来源：${srcLabel}` : `数据来源：${names || '—'}`;
    const bits = [];
    if (d.demo) bits.push('演示数据');
    bits.push(d.derivation || '美标为上游原值，国标为换算值');
    bits.push(`本页每 ${Math.round(S.settings.interval / 60)} 分钟自动取数，无需下拉`);
    $('meta-line').textContent = bits.join(' ｜ ');
  }

  // ---------- 错误与过期 ----------

  /** 数据源未配置：不给任何空气质量数字，只给可操作的接入步骤，避免误导。 */
  function renderNotConfigured() {
    setTheme(-1);
    $('aqi-num').textContent = '--';
    $('aqi-level').textContent = '待接入';
    $('aqi-alt').innerHTML = '';
    $('aqi-primary').innerHTML = '';
    $('aqi-advice').textContent = '官方数据源还没有接通。接通前本页不显示任何空气质量数字。';
    $('aqi-stamp').textContent = '';
    setBanner('info',
      '<span><b>还差最后一步：接入官方数据源</b><br>' +
      '本部署未配置服务端代理，页面已自动改用免密钥数据通道。<br>' +
      '若你看到本提示，说明所有通道均不可达，请检查网络后等待自动重试。</span>');
    renderDiag();
  }

  /** 会话过期：保留最后数据，红字提示重新登录，避免展示屏静默冻住。 */
  function renderAuthExpired() {
    setBanner('err',
      '<span><b>登录会话已过期</b><br>屏幕保留的是最后一次成功取到的数据。<br>' +
      '请在手机上重新打开本页并登录一次，随后会自动恢复自动刷新。</span>');
    renderDiag();
  }

  function renderErrorState() {
    const code = S.lastError || '未知错误';
    if (String(code).indexOf('auth_expired') === 0 || (S.lastErrorCode === 'auth_expired')) {
      renderAuthExpired();
      return;
    }
    if (String(code).indexOf('service_not_configured') === 0) {
      renderNotConfigured();
      return;
    }
    if (!S.data) {
      setBanner('err', `<span><b>取数失败</b>（第 ${S.failStreak} 次）<br>${escapeHtml(code)}<br>将在 ${mmss(retryDelay() / 1000)} 后自动重试。</span>`);
      $('aqi-num').textContent = '--';
      $('aqi-level').textContent = '无数据';
      $('aqi-advice').textContent = '还没拿到观测数据。检查一下网络，或在设置里看运行状态。';
      setTheme(-1);
      if (!S.settings.silent) { /* 首屏失败也保留骨架，不额外处理 */ }
    } else {
      const age = agoText(S.lastOkAt);
      setBanner('warn', `<span><b>刷新失败，正在显示 ${age}的数据</b><br>${escapeHtml(code)}<br>会在 ${mmss(retryDelay() / 1000)} 后自动重试，不会清空屏幕。</span>`);
    }
    renderDiag();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function retryDelay() {
    // 失败后指数退避：20s → 40s → 80s，最多不超过设定间隔
    const base = 20000 * Math.pow(2, Math.min(3, S.failStreak - 1));
    return Math.min(base, S.settings.interval * 1000);
  }

  // ============================================================
  // 刷新循环
  // ============================================================

  function scheduleNext() {
    const delay = S.failStreak > 0 ? retryDelay() : S.settings.interval * 1000;
    S.nextAt = Date.now() + delay;
  }

  function tickBody() {
    const now = Date.now();

    // 倒计时环
    const total = (S.failStreak > 0 ? retryDelay() : S.settings.interval * 1000) || 1;
    const remain = Math.max(0, S.nextAt - now);
    const prog = clamp(1 - remain / total, 0, 1);
    const ring = $('ring-fg');
    if (ring) {
      ring.style.strokeDasharray = String(RING_C);
      ring.style.strokeDashoffset = String(RING_C * (1 - prog));
    }
    const cnt = $('live-count');
    if (cnt) cnt.textContent = S.inflight ? '取数中' : mmss(remain / 1000);
    const lbl = $('live-label');
    if (lbl) lbl.textContent = S.failStreak > 0 ? '重试中' : `每 ${Math.round(S.settings.interval / 60)} 分钟`;

    if (remain <= 0 && !S.inflight) fetchAQ();

    // 数据过期判定：超过 2.5 个周期没成功过就算过期
    if (S.lastOkAt && now - S.lastOkAt > S.settings.interval * 1000 * 2.5 && S.failStreak === 0) {
      S.failStreak = 1;
      renderErrorState();
    }

    // 观测时间本身的陈旧度提示（上游约每小时更新）
    if (S.data && S.data.observed_at && S.failStreak === 0) {
      const obsAge = now - Date.parse(S.data.observed_at);
      if (obsAge > 3.2 * 3600 * 1000) {
        setBanner('info', `<span>上游发布的是 <b>${agoText(Date.parse(S.data.observed_at))}</b>的观测值。国控站实时发布本身有延迟，本页刷新正常。</span>`);
      }
    }
  }

  let tickTimer = null;
  let lastTickAt = Date.now();
  let tickErrors = 0;

  /** 主循环外壳：任何渲染/计时异常都不允许杀死循环，只记录并继续。 */
  function tick() {
    lastTickAt = Date.now();
    try {
      tickBody();
    } catch (err) {
      tickErrors += 1;
      S.lastError = '主循环异常: ' + (err && err.message ? err.message : String(err));
      renderDiag();
    }
  }

  /** 看门狗：主循环停摆超过 2 分钟（异常或浏览器冻结）就自重启，保证无人值守不断流。 */
  function startWatchdog() {
    setInterval(() => {
      if (Date.now() - lastTickAt > 120000) {
        try { localStorage.setItem(K.booted, String(Date.now())); } catch { /* 忽略 */ }
        location.reload();
      }
    }, 60000);
  }

  /** 代码版本自检：发布新版后手机在 10 分钟内自动重载，无需手动刷新。 */
  async function checkCodeUpdate() {
    if (!window.__BUILD__) return;
    try {
      const r = await fetch(`./version.json?_=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const v = await r.json();
      if (v && v.build && v.build !== window.__BUILD__) {
        location.reload();
      }
    } catch { /* 无 version.json 的环境（如 Sites 版）静默跳过 */ }
  }

  function startLoop() {
    if (tickTimer) clearInterval(tickTimer);
    scheduleNext();
    tickTimer = setInterval(tick, 500);
    startWatchdog();
    setInterval(checkCodeUpdate, 10 * 60 * 1000);
    fetchAQ();
    // 每 30 分钟重新定位一次，防止手机被挪走后仍盯旧站点
    setInterval(() => { if (S.geo && S.geo.source === 'geo') locate(false); }, 30 * 60 * 1000);
  }

  // ============================================================
  // 定位
  // ============================================================

  function locate(announce) {
    // 非 HTTPS（如局域网 HTTP 展示）下 iOS 直接拒绝网页定位，别浪费一次超时，直接给指引
    if (!window.isSecureContext) {
      setBanner('warn',
        '<span><b>当前是非 HTTPS 环境</b>，iOS 不允许网页自动定位。<br>' +
        '点右下角齿轮 → 手动指定城市（如"杭州"），即可开始显示并自动刷新。</span>');
      $('loc-name').textContent = '未定位';
      $('loc-sub').textContent = '非 HTTPS 环境，请手动指定城市';
      renderDiag();
      return;
    }
    if (!('geolocation' in navigator)) {
      onLocateFail(announce, '这台设备的浏览器不支持定位');
      return;
    }
    if (announce) {
      $('loc-name').textContent = '定位中…';
      $('loc-sub').textContent = '请在弹窗里允许获取位置';
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        S.geo = {
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          q: null, source: 'geo', at: Date.now(),
          accuracy: Math.round(pos.coords.accuracy || 0),
        };
        writeStore(K.geo, S.geo);
        if (announce) setBanner('info', `<span>定位成功，精度约 ${S.geo.accuracy} 米。正在取数…</span>`);
        loadSeries();
        fetchAQ();
        renderDiag();
      },
      (err) => onLocateFail(announce, err && err.message ? err.message : '定位失败'),
      { enableHighAccuracy: false, timeout: 18000, maximumAge: 10 * 60 * 1000 },
    );
  }

  function onLocateFail(announce, msg) {
    if (S.geo && S.geo.lat !== null) {
      if (announce) setBanner('warn', `<span><b>定位失败</b>：${escapeHtml(msg)}<br>已回退到上次成功的位置：${S.geo.lat}, ${S.geo.lon}</span>`);
      fetchAQ();
      return;
    }
    setBanner('err', `<span><b>拿不到位置</b>：${escapeHtml(msg)}<br>iPhone 需要在「设置 → Safari → 位置」里允许，且页面必须是 HTTPS。<br>也可以点右下角齿轮 → 手动指定城市。</span>`);
    $('loc-name').textContent = '未定位';
    $('loc-sub').textContent = '请在设置里手动指定城市';
    renderDiag();
  }

  // ============================================================
  // 屏幕常亮
  // ============================================================

  let wakeVideo = null;

  async function enableWake(withGesture) {
    if (!S.settings.keepAwake) { disableWake(); return false; }

    // 1) 优先原生 Screen Wake Lock（iOS Safari 16.4+；主屏幕 PWA 需 iOS 18.4+）
    if ('wakeLock' in navigator) {
      try {
        S.wakeLock = await navigator.wakeLock.request('screen');
        S.wakeMode = 'native';
        S.wakeLock.addEventListener('release', () => {
          S.wakeLock = null;
          if (S.settings.keepAwake && document.visibilityState === 'visible') enableWake(false);
        });
        updateWakeStatus();
        return true;
      } catch { /* 无用户手势或版本不支持，走兜底 */ }
    }

    // 2) 兜底：无声循环视频。iOS 上这是唯一能让网页保持常亮的通用办法。
    try {
      if (!wakeVideo) {
        wakeVideo = $('wake-video');
        const bin = atob(SILENT_MP4_B64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        wakeVideo.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
        wakeVideo.muted = true;
        wakeVideo.loop = true;
        wakeVideo.playsInline = true;
        wakeVideo.setAttribute('playsinline', '');
        wakeVideo.setAttribute('webkit-playsinline', '');
      }
      await wakeVideo.play();
      S.wakeMode = wakeVideo.paused ? 'failed' : 'video';
      if (S.wakeMode === 'video' && !withGesture) {
        // 部分 iOS 版本会在无手势时暂停，监听并尝试续播
        wakeVideo.addEventListener('pause', () => {
          if (S.settings.keepAwake && document.visibilityState === 'visible') wakeVideo.play().catch(() => {});
        });
      }
    } catch {
      S.wakeMode = 'failed';
    }
    updateWakeStatus();
    return S.wakeMode === 'video' || S.wakeMode === 'native';
  }

  function disableWake() {
    try { if (S.wakeLock) S.wakeLock.release(); } catch { /* 忽略 */ }
    S.wakeLock = null;
    if (wakeVideo) { try { wakeVideo.pause(); } catch { /* 忽略 */ } }
    S.wakeMode = 'off';
    updateWakeStatus();
  }

  function updateWakeStatus() {
    const el = $('wake-status');
    if (!el) return;
    const txt = {
      native: '已启用 · 系统常亮接口',
      video: '已启用 · 无声视频保活',
      failed: '启用失败，请在「设置 → 显示与亮度 → 自动锁定」选「永不」',
      off: '已关闭',
      none: '未启用',
    };
    el.textContent = txt[S.wakeMode] || txt.none;
    el.style.color = S.wakeMode === 'failed' ? '#ff8b8c' : '';
  }

  // ============================================================
  // 防烧屏微位移
  // ============================================================

  function startPixelShift() {
    if (S.shiftTimer) clearInterval(S.shiftTimer);
    if (!S.settings.pixelShift) {
      $('app').style.transform = '';
      return;
    }
    let n = 0;
    S.shiftTimer = setInterval(() => {
      n++;
      const a = (n * 137.508 * Math.PI) / 180; // 黄金角，位移不重复
      const dx = Math.cos(a) * 2.5;
      const dy = Math.sin(a) * 2.5;
      $('app').style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
    }, 60 * 1000);
  }

  // ============================================================
  // 诊断面板
  // ============================================================

  function renderDiag() {
    const el = $('diag');
    if (!el) return;
    const wake = { native: '系统接口', video: '无声视频', failed: '<span class="bad">失败</span>', off: '已关', none: '未启用' }[S.wakeMode] || '未启用';
    const rows = [
      ['数据源', S.configured === true ? '<span class="ok">已配置</span>' : (S.configured === false ? '<span class="bad">未配置</span>' : '探测中')],
      ['常亮', wake],
      ['刷新间隔', `${S.settings.interval} 秒`],
      ['口径', S.settings.std === 'cn' ? '国标（换算）' : '美标（原值）'],
      ['位置', S.geo ? (S.geo.q ? `城市：${S.geo.q}` : `${S.geo.lat}, ${S.geo.lon}`) : '<span class="bad">无</span>'],
      ['上次成功', S.lastOkAt ? `<span class="ok">${new Date(S.lastOkAt).toLocaleTimeString('zh-CN')}</span>` : '<span class="bad">从未</span>'],
      ['连续失败', S.failStreak ? `<span class="bad">${S.failStreak} 次</span>` : '<span class="ok">0</span>'],
      ['主循环异常', tickErrors ? `<span class="bad">${tickErrors} 次</span>` : '<span class="ok">0</span>'],
      ['最近错误', S.lastError ? `<span class="bad">${escapeHtml(S.lastError).slice(0, 160)}</span>` : '—'],
      ['曲线点数', String(S.series.length)],
      ['iOS', /iPhone|iPad|iPod/.test(navigator.userAgent) ? '是' : '否'],
    ];
    el.innerHTML = rows.map(([k, v]) => `<div><b>${k}</b>　${v}</div>`).join('');
  }

  // ============================================================
  // 设置面板
  // ============================================================

  function syncControls() {
    document.querySelectorAll('#seg-interval button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === S.settings.interval));
    document.querySelectorAll('#seg-std button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.settings.std));
    document.querySelectorAll('#seg-fc button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.settings.fcKey));
    const sw = (id, on) => { const e = $(id); if (e) e.setAttribute('aria-checked', on ? 'true' : 'false'); };
    sw('sw-wake', S.settings.keepAwake);
    sw('sw-shift', S.settings.pixelShift);
    sw('sw-wx', S.settings.showWeather);
    sw('sw-fallback', S.settings.allowFallback);
    updateWakeStatus();
  }

  function wireSettings() {
    $('gear').addEventListener('click', () => { $('sheet').hidden = false; renderDiag(); });
    $('sheet').querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => { $('sheet').hidden = true; }));

    $('seg-interval').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      S.settings.interval = Number(b.dataset.v);
      saveSettings(); syncControls(); scheduleNext(); renderFooter(); renderDiag();
    });

    $('seg-std').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      S.settings.std = b.dataset.v;
      saveSettings(); syncControls();
      if (S.data) { loadSeries(); renderAll(); } else { fetchAQ(); }
    });

    $('seg-fc').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      S.settings.fcKey = b.dataset.v;
      saveSettings(); syncControls(); renderForecast();
    });

    $('sw-wake').addEventListener('click', async () => {
      S.settings.keepAwake = !S.settings.keepAwake;
      saveSettings(); syncControls();
      if (S.settings.keepAwake) await enableWake(true); else disableWake();
      renderDiag();
    });

    $('sw-shift').addEventListener('click', () => {
      S.settings.pixelShift = !S.settings.pixelShift;
      saveSettings(); syncControls(); startPixelShift(); renderDiag();
    });

    $('sw-wx').addEventListener('click', () => {
      S.settings.showWeather = !S.settings.showWeather;
      saveSettings(); syncControls(); renderWeather(); renderDiag();
    });

    $('sw-fallback').addEventListener('click', () => {
      S.settings.allowFallback = !S.settings.allowFallback;
      saveSettings(); syncControls(); renderDiag();
      fetchAQ();
    });

    $('btn-relocate').addEventListener('click', () => locate(true));

    $('btn-manual').addEventListener('click', () => {
      const box = $('manual-box');
      box.hidden = !box.hidden;
      if (!box.hidden) $('manual-input').focus();
    });

    const applyManual = () => {
      const v = $('manual-input').value.trim();
      if (!v) return;
      S.geo = { lat: null, lon: null, q: v.slice(0, 40), source: 'manual', at: Date.now() };
      writeStore(K.geo, S.geo);
      $('manual-box').hidden = true;
      setBanner('info', `<span>已切到手动位置：<b>${escapeHtml(v)}</b>，正在取数…</span>`);
      loadSeries();
      fetchAQ();
      renderDiag();
    };
    $('btn-manual-go').addEventListener('click', applyManual);
    $('manual-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyManual(); });

    $('refresh-btn').addEventListener('click', () => fetchAQ());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $('sheet').hidden = true;
      if (e.key === 'r' && !e.metaKey && !e.ctrlKey && $('sheet').hidden) fetchAQ();
    });

    // 回到前台时，若已过期立即补一次
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (S.settings.keepAwake && !S.wakeLock && S.wakeMode !== 'video') enableWake(false);
      if (Date.now() > S.nextAt) fetchAQ();
    });

    window.addEventListener('resize', () => { if (S.data) renderChart(); });
  }

  // ============================================================
  // 启动
  // ============================================================

  async function start() {
    $('boot').hidden = true;
    writeStore(K.booted, Date.now());
    startPixelShift();
    loadSeries();
    if (S.demo) {
      // 演示模式不请求定位，直接用内置样例
      S.geo = { lat: null, lon: null, q: '演示站点', source: 'manual', at: Date.now() };
      fetchAQ();
    } else if (!S.geo) {
      locate(true);
    } else {
      setBanner('info', `<span>使用${S.geo.source === 'manual' ? '手动指定的位置' : '上次定位结果'}：${escapeHtml(S.geo.q || `${S.geo.lat}, ${S.geo.lon}`)}</span>`);
      fetchAQ();
    }
    startLoop();
  }

  /** 数据源未配置时的待机态：显示接入步骤，并轮询配置状态，配置好自动接管。 */
  function enterSetupMode() {
    $('boot').hidden = true;
    startPixelShift();
    renderNotConfigured();
    S.cfgTimer = setInterval(async () => {
      const c = await checkConfig();
      if (c === true) {
        clearInterval(S.cfgTimer);
        S.cfgTimer = null;
        clearBanner();
        locate(true);
        startLoop();
      }
    }, 20000);
  }

  async function boot() {
    syncControls();
    wireSettings();
    renderDiag();
    renderPollutants({ pollutants: {} }, 0);

    // 先静默尝试常亮：成功就直接进主界面，失败才要求点按（iOS 需要用户手势）
    const ok = await enableWake(false);

    // 仅当用户关掉备用源且官方未配置时，才进入"等待配置"待机态
    if (!S.demo) {
      const cfg = await checkConfig();
      if (cfg === false && !S.settings.allowFallback) {
        enterSetupMode();
        return;
      }
    }

    if (ok) {
      await start();
    } else {
      $('boot').hidden = false;
      $('boot-btn').addEventListener('click', async () => {
        await enableWake(true);
        await start();
      });
    }

    if (S.demo) {
      setBanner('info', '<span><b>演示模式</b>（?demo=1）：屏幕上是内置样例数据，不是真实观测值。</span>');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
