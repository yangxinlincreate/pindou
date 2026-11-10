var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
const EMPTY_CELL = 255;
const BOARD_SIZE = 29;
const D65 = { Xn: 0.95047, Yn: 1, Zn: 1.08883 };
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v) {
  const s = v <= 31308e-7 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return s * 255;
}
function rgbToXyz(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return {
    X: 0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
    Y: 0.2126729 * R + 0.7151522 * G + 0.072175 * B,
    Z: 0.0193339 * R + 0.119192 * G + 0.9503041 * B
  };
}
function f(t) {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}
function fInv(t) {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
}
function xyzToLab(X, Y, Z) {
  const fx = f(X / D65.Xn);
  const fy = f(Y / D65.Yn);
  const fz = f(Z / D65.Zn);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}
function labToXyz(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  return {
    X: D65.Xn * fInv(fx),
    Y: D65.Yn * fInv(fy),
    Z: D65.Zn * fInv(fz)
  };
}
function rgbToLab(r, g, b) {
  const { X, Y, Z } = rgbToXyz(r, g, b);
  return xyzToLab(X, Y, Z);
}
function labToRgb(L, a, b) {
  const { X, Y, Z } = labToXyz(L, a, b);
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return {
    r: clamp255(linearToSrgb(R)),
    g: clamp255(linearToSrgb(G)),
    b: clamp255(linearToSrgb(B))
  };
}
function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
function hexToRgb(hex) {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`非法色值: ${hex}`);
  const n = parseInt(h, 16);
  return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  const to = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}
function hexToLab(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToLab(r, g, b);
}
function labDistanceSq(a, b) {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dL * dL + da * da + db * db;
}
function relativeLuminance(r, g, b) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
const POW25_7 = Math.pow(25, 7);
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
function deltaE2000Raw(L1, a1, b1, L2, a2, b2) {
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : (Math.atan2(b1, a1p) * DEG + 360) % 360;
  const h2p = C2p === 0 ? 0 : (Math.atan2(b2, a2p) * DEG + 360) % 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * RAD / 2);
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbarp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbarp = (h1p + h2p + 360) / 2;
  } else {
    hbarp = (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbarp - 30) * RAD) + 0.24 * Math.cos(2 * hbarp * RAD) + 0.32 * Math.cos((3 * hbarp + 6) * RAD) - 0.2 * Math.cos((4 * hbarp - 63) * RAD);
  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));
  const SL = 1 + 0.015 * Math.pow(Lbarp - 50, 2) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * RAD) * RC;
  const tL = dLp / SL;
  const tC = dCp / SC;
  const tH = dHp / SH;
  return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
}
function deltaE2000(c1, c2) {
  return deltaE2000Raw(c1.L, c1.a, c1.b, c2.L, c2.a, c2.b);
}
function describeDelta(dE) {
  if (dE < 1) return "几乎无法分辨";
  if (dE < 2.3) return "训练后可分辨";
  if (dE < 5) return "明显能看出不同";
  if (dE < 10) return "差异较大";
  return "完全不同";
}
function resampleBox(src, dw, dh) {
  const { width: sw, height: sh, data } = src;
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xr = sw / dw;
  const yr = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor(dy * yr);
    const y1 = Math.max(y0 + 1, Math.min(sh, Math.ceil((dy + 1) * yr)));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor(dx * xr);
      const x1 = Math.max(x0 + 1, Math.min(sw, Math.ceil((dx + 1) * xr)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wsum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        let p = (y * sw + x0) * 4;
        for (let x = x0; x < x1; x++, p += 4) {
          const alpha = data[p + 3] / 255;
          r += data[p] * alpha;
          g += data[p + 1] * alpha;
          b += data[p + 2] * alpha;
          a += data[p + 3];
          wsum += alpha;
          count++;
        }
      }
      const o = (dy * dw + dx) * 4;
      if (wsum > 0) {
        out[o] = r / wsum;
        out[o + 1] = g / wsum;
        out[o + 2] = b / wsum;
      }
      out[o + 3] = count > 0 ? a / count : 0;
    }
  }
  return { width: dw, height: dh, data: out };
}
function resampleNearest(src, dw, dh) {
  const { width: sw, height: sh, data } = src;
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xr = sw / dw;
  const yr = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(sh - 1, Math.floor(dy * yr));
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(sw - 1, Math.floor(dx * xr));
      const si = (sy * sw + sx) * 4;
      const oi = (dy * dw + dx) * 4;
      out[oi] = data[si];
      out[oi + 1] = data[si + 1];
      out[oi + 2] = data[si + 2];
      out[oi + 3] = data[si + 3];
    }
  }
  return { width: dw, height: dh, data: out };
}
function sharpen(src, amount = 0.4) {
  const { width: w, height: h, data } = src;
  if (w < 3 || h < 3 || amount <= 0) return src;
  const out = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const p = i + c;
        const blur = (data[p - 4] + data[p + 4] + data[p - w * 4] + data[p + w * 4]) / 4;
        out[p] = data[p] + amount * (data[p] - blur);
      }
    }
  }
  return { width: w, height: h, data: out };
}
function cropToRatio(src, aw, ah) {
  const targetRatio = aw / ah;
  const curRatio = src.width / src.height;
  let cw = src.width;
  let ch = src.height;
  if (curRatio > targetRatio) cw = Math.round(src.height * targetRatio);
  else ch = Math.round(src.width / targetRatio);
  const x0 = Math.floor((src.width - cw) / 2);
  const y0 = Math.floor((src.height - ch) / 2);
  return cropRect(src, x0, y0, cw, ch);
}
function cropRect(src, x, y, w, h) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(y)));
  const cw = Math.max(1, Math.min(src.width - x0, Math.floor(w)));
  const ch = Math.max(1, Math.min(src.height - y0, Math.floor(h)));
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let row = 0; row < ch; row++) {
    const from = ((y0 + row) * src.width + x0) * 4;
    const to = row * cw * 4;
    out.set(src.data.subarray(from, from + cw * 4), to);
  }
  return { width: cw, height: ch, data: out };
}
function flattenOnColor(src, hex = "#FFFFFF") {
  const n = parseInt(hex.replace("#", ""), 16);
  const br = n >> 16 & 255;
  const bg = n >> 8 & 255;
  const bb = n & 255;
  const out = new Uint8ClampedArray(src.data);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255;
    if (a >= 1) continue;
    out[i] = out[i] * a + br * (1 - a);
    out[i + 1] = out[i + 1] * a + bg * (1 - a);
    out[i + 2] = out[i + 2] * a + bb * (1 - a);
    out[i + 3] = 255;
  }
  return { width: src.width, height: src.height, data: out };
}
function qkey(data, i) {
  if (data[i + 3] < 128) return -1;
  return data[i] >> 3 << 10 | data[i + 1] >> 3 << 5 | data[i + 2] >> 3;
}
function countColors(img, maxSamples = 2e5) {
  const { data } = img;
  const total = data.length / 4;
  const step = Math.max(4, Math.floor(total / maxSamples)) * 4;
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < data.length; i += step) {
    seen.add(qkey(data, i));
    if (seen.size > 4096) break;
  }
  return seen.size;
}
function gcd(a, b) {
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}
function detectGridSize(img) {
  const { width: w, height: h, data } = img;
  if (w < 8 || h < 8) return null;
  const hist = /* @__PURE__ */ new Map();
  const collect = (len) => {
    var _a;
    if (len >= 2 && len <= 128) hist.set(len, ((_a = hist.get(len)) != null ? _a : 0) + 1);
  };
  const rowStep = Math.max(1, Math.floor(h / 300));
  for (let y = 0; y < h; y += rowStep) {
    let runStart = 0;
    let prev = qkey(data, y * w * 4);
    for (let x = 1; x < w; x++) {
      const cur = qkey(data, (y * w + x) * 4);
      if (cur !== prev) {
        collect(x - runStart);
        runStart = x;
        prev = cur;
      }
    }
  }
  const colStep = Math.max(1, Math.floor(w / 300));
  for (let x = 0; x < w; x += colStep) {
    let runStart = 0;
    let prev = qkey(data, x * 4);
    for (let y = 1; y < h; y++) {
      const cur = qkey(data, (y * w + x) * 4);
      if (cur !== prev) {
        collect(y - runStart);
        runStart = y;
        prev = cur;
      }
    }
  }
  if (hist.size === 0) {
    return countColors(img) <= 96 ? { gridSize: 1, width: w, height: h, confidence: 0.3 } : null;
  }
  let total = 0;
  for (const c of hist.values()) total += c;
  const strong = [...hist.entries()].filter(([, c]) => c / total >= 0.03);
  if (!strong.length) return null;
  let g = 0;
  for (const [len] of strong) g = gcd(g, len);
  const fits = (cand) => cand >= 2 && cand <= Math.min(w, h) && (w % cand === 0 || Math.abs(w % cand - cand) <= 1) && (h % cand === 0 || Math.abs(h % cand - cand) <= 1) && Math.floor(w / cand) >= 4 && Math.floor(w / cand) <= 256 && Math.floor(h / cand) >= 4;
  if (!fits(g)) {
    const sorted = [...strong].sort((a, b) => b[1] - a[1]);
    const fallback = sorted[0][0];
    if (!fits(fallback)) return null;
    g = fallback;
  }
  let covered = 0;
  for (const [len, c] of hist) if (len % g === 0) covered += c;
  return {
    gridSize: g,
    width: Math.floor(w / g),
    height: Math.floor(h / g),
    confidence: covered / total
  };
}
function analyzeImage(img) {
  const colorCount = countColors(img);
  const grid = detectGridSize(img);
  if (grid && colorCount <= 96 && grid.confidence >= 0.45) {
    return {
      colorCount,
      grid,
      suggestMode: "import",
      reason: `检测到像素图（每格 ${grid.gridSize} px，共 ${grid.width} × ${grid.height}）`
    };
  }
  if (colorCount <= 32 && grid) {
    return {
      colorCount,
      grid,
      suggestMode: "import",
      reason: `颜色很少（${colorCount} 色），可能是像素图或图标`
    };
  }
  return {
    colorCount,
    grid,
    suggestMode: "photo",
    reason: colorCount > 96 ? `颜色较多（${colorCount}+ 色），按照片处理效果更好` : "未识别出规则网格，按照片处理"
  };
}
function detectAntiAlias(img) {
  var _a;
  const { width: w, height: h, data } = img;
  const counts = /* @__PURE__ */ new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = qkey(data, (y * w + x) * 4);
      counts.set(k, ((_a = counts.get(k)) != null ? _a : 0) + 1);
    }
  }
  const totalPixels = w * h;
  let rare = 0;
  for (const c of counts.values()) {
    if (c / totalPixels < 5e-3) rare += c;
  }
  return rare / totalPixels > 0.12;
}
function removeBackground(img, opts = {}) {
  var _a, _b, _c;
  const tol = (_a = opts.tolerance) != null ? _a : 16;
  const tolSq = tol * tol;
  const maxRatio = (_b = opts.maxRatio) != null ? _b : 0.85;
  const minRatio = (_c = opts.minRatio) != null ? _c : 0.02;
  const { width: w, height: h, data } = img;
  const n = w * h;
  if (n === 0) return { mask: new Uint8Array(0), ratio: 0, ok: false, reason: "空图" };
  const labs = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const lab = rgbToLab(data[p], data[p + 1], data[p + 2]);
    labs[i * 3] = lab.L;
    labs[i * 3 + 1] = lab.a;
    labs[i * 3 + 2] = lab.b;
  }
  const buckets = /* @__PURE__ */ new Map();
  const sampleEdge = (x, y) => {
    const i = y * w + x;
    if (data[i * 4 + 3] < 128) return;
    const L = labs[i * 3];
    const a = labs[i * 3 + 1];
    const b = labs[i * 3 + 2];
    const key = (Math.round(L / 8) & 63) * 4096 + (Math.round((a + 128) / 8) & 63) * 64 + (Math.round((b + 128) / 8) & 63);
    const cur = buckets.get(key);
    if (cur) {
      cur.count++;
      cur.L += L;
      cur.a += a;
      cur.b += b;
    } else {
      buckets.set(key, { count: 1, L, a, b });
    }
  };
  const bandW = Math.max(6, Math.floor(w * 0.14));
  const bandH = Math.max(6, Math.floor(h * 0.14));
  const stepX = Math.max(1, Math.floor(bandW / 24));
  const stepY = Math.max(1, Math.floor(bandH / 24));
  for (let y = 0; y < bandH; y += stepY) {
    for (let x = 0; x < bandW; x += stepX) {
      sampleEdge(x, y);
      sampleEdge(w - 1 - x, y);
      sampleEdge(x, h - 1 - y);
      sampleEdge(w - 1 - x, h - 1 - y);
    }
  }
  if (buckets.size === 0) {
    return { mask: new Uint8Array(n), ratio: 0, ok: false, reason: "边缘全是透明像素" };
  }
  const seeds = [...buckets.values()].sort((x, y) => y.count - x.count).slice(0, 2).map((c) => ({ L: c.L / c.count, a: c.a / c.count, b: c.b / c.count }));
  const mask = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const nearSeed = (i) => {
    const L = labs[i * 3];
    const a = labs[i * 3 + 1];
    const b = labs[i * 3 + 2];
    for (let s = 0; s < seeds.length; s++) {
      const dL = L - seeds[s].L;
      const da = a - seeds[s].a;
      const db = b - seeds[s].b;
      if (dL * dL + da * da + db * db <= tolSq) return true;
    }
    return false;
  };
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = y * w + x;
      if (!mask[i] && data[i * 4 + 3] >= 128 && nearSeed(i)) {
        mask[i] = 1;
        queue[tail++] = i;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const i = y * w + x;
      if (!mask[i] && data[i * 4 + 3] >= 128 && nearSeed(i)) {
        mask[i] = 1;
        queue[tail++] = i;
      }
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = i / w | 0;
    if (x + 1 < w && !mask[i + 1] && nearSeed(i + 1)) {
      mask[i + 1] = 1;
      queue[tail++] = i + 1;
    }
    if (x > 0 && !mask[i - 1] && nearSeed(i - 1)) {
      mask[i - 1] = 1;
      queue[tail++] = i - 1;
    }
    if (y + 1 < h && !mask[i + w] && nearSeed(i + w)) {
      mask[i + w] = 1;
      queue[tail++] = i + w;
    }
    if (y > 0 && !mask[i - w] && nearSeed(i - w)) {
      mask[i - w] = 1;
      queue[tail++] = i - w;
    }
  }
  let bg = 0;
  for (let i = 0; i < n; i++) bg += mask[i];
  const ratio = bg / n;
  if (ratio < minRatio) {
    return { mask: new Uint8Array(n), ratio, ok: false, reason: "没找到明显背景" };
  }
  if (ratio > maxRatio) {
    return { mask: new Uint8Array(n), ratio, ok: false, reason: "背景占比过高，可能是主体贴边或纯色图" };
  }
  return { mask, ratio, ok: true };
}
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296;
  };
}
function distSq(labs, i, c) {
  const dL = labs[i * 3] - c.L;
  const da = labs[i * 3 + 1] - c.a;
  const db = labs[i * 3 + 2] - c.b;
  return dL * dL + da * da + db * db;
}
function kmeansLab(labs, weights, k, maxIter = 24, seed = 20261107) {
  const n = weights.length;
  if (n === 0) return [];
  const kk = Math.max(1, Math.min(k, n));
  const rand = makeRandom(seed);
  const centers = [];
  const first = Math.floor(rand() * n);
  centers.push({ L: labs[first * 3], a: labs[first * 3 + 1], b: labs[first * 3 + 2] });
  const minDist = new Float64Array(n).fill(Infinity);
  for (let c = 1; c < kk; c++) {
    let sum = 0;
    const last = centers[c - 1];
    for (let i = 0; i < n; i++) {
      const d = distSq(labs, i, last);
      if (d < minDist[i]) minDist[i] = d;
      sum += minDist[i] * weights[i];
    }
    if (sum <= 0) break;
    let r = rand() * sum;
    let acc = 0;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      acc += minDist[i] * weights[i];
      if (acc >= r) {
        chosen = i;
        break;
      }
    }
    centers.push({
      L: labs[chosen * 3],
      a: labs[chosen * 3 + 1],
      b: labs[chosen * 3 + 2]
    });
  }
  const K = centers.length;
  if (K === 1) return centers;
  const assign = new Int32Array(n).fill(-1);
  const sumL = new Float64Array(K);
  const sumA = new Float64Array(K);
  const sumB = new Float64Array(K);
  const sumW = new Float64Array(K);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const L = labs[i * 3];
      const a = labs[i * 3 + 1];
      const b = labs[i * 3 + 2];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < K; c++) {
        const ct = centers[c];
        const dL = L - ct.L;
        const da = a - ct.a;
        const db = b - ct.b;
        const d = dL * dL + da * da + db * db;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed++;
      }
    }
    sumL.fill(0);
    sumA.fill(0);
    sumB.fill(0);
    sumW.fill(0);
    for (let i = 0; i < n; i++) {
      const c = assign[i];
      const w = weights[i];
      sumL[c] += labs[i * 3] * w;
      sumA[c] += labs[i * 3 + 1] * w;
      sumB[c] += labs[i * 3 + 2] * w;
      sumW[c] += w;
    }
    for (let c = 0; c < K; c++) {
      if (sumW[c] > 0) {
        centers[c] = {
          L: sumL[c] / sumW[c],
          a: sumA[c] / sumW[c],
          b: sumB[c] / sumW[c]
        };
      }
    }
    if (changed / n < 0.01) break;
  }
  return centers;
}
function buildWeights(img, opts = {}) {
  var _a, _b, _c;
  const skinBoost = (_a = opts.skinBoost) != null ? _a : 2;
  const edgeBoost = (_b = opts.edgeBoost) != null ? _b : 1.5;
  const { width: w, height: h, data } = img;
  const n = w * h;
  const weights = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = -0.169 * r - 0.331 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.419 * g - 0.081 * b + 128;
    if (y > 60 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
      weights[i] = skinBoost;
    }
  }
  const grad = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lum = (px) => {
        const p = px * 4;
        return 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      };
      const gx = -lum(i - w - 1) - 2 * lum(i - 1) - lum(i + w - 1) + lum(i - w + 1) + 2 * lum(i + 1) + lum(i + w + 1);
      const gy = -lum(i - w - 1) - 2 * lum(i - w) - lum(i - w + 1) + lum(i + w - 1) + 2 * lum(i + w) + lum(i + w + 1);
      grad[i] = Math.abs(gx) + Math.abs(gy);
    }
  }
  const sorted = Array.from(grad).sort((a, b) => b - a);
  const threshold = (_c = sorted[Math.floor(n * 0.3)]) != null ? _c : 0;
  if (threshold > 0) {
    for (let i = 0; i < n; i++) {
      if (grad[i] >= threshold) weights[i] = Math.max(weights[i], edgeBoost);
    }
  }
  return weights;
}
function toLabArray(img) {
  const n = img.width * img.height;
  const out = new Float32Array(n * 3);
  const { data } = img;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = data[p] / 255;
    const g = data[p + 1] / 255;
    const b = data[p + 2] / 255;
    const R = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const G = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const B = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
    const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
    const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
    const fx = fLab(X / 0.95047);
    const fy = fLab(Y / 1);
    const fz = fLab(Z / 1.08883);
    out[i * 3] = 116 * fy - 16;
    out[i * 3 + 1] = 500 * (fx - fy);
    out[i * 3 + 2] = 200 * (fy - fz);
  }
  return out;
}
const LAB_EPS = 216 / 24389;
const LAB_KAPPA = 24389 / 27;
function fLab(t) {
  return t > LAB_EPS ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}
function mapCentroidsToCatalog(centers, catalog, mergeThreshold = 1) {
  if (!catalog.length) return [];
  const picked = [];
  const byId = /* @__PURE__ */ new Map();
  for (const c of centers) {
    let best = null;
    let bestD = Infinity;
    for (const col of catalog) {
      const d = deltaE2000Raw(c.L, c.a, c.b, col.lab.L, col.lab.a, col.lab.b);
      if (d < bestD) {
        bestD = d;
        best = col;
      }
    }
    if (!best) continue;
    const exist = byId.get(best.id);
    if (exist) {
      if (bestD < exist.deltaE) exist.deltaE = bestD;
      continue;
    }
    const item = {
      colorId: best.id,
      code: best.code,
      name: best.name,
      hex: best.hex,
      lab: best.lab,
      deltaE: bestD
    };
    picked.push(item);
    byId.set(best.id, item);
  }
  return mergeSimilar(picked, mergeThreshold);
}
function mergeSimilar(picked, threshold = 1) {
  if (picked.length <= 1) return picked;
  const result = [];
  const sorted = [...picked].sort((a, b) => a.deltaE - b.deltaE);
  for (const item of sorted) {
    const dup = result.find((r) => deltaE2000(r.lab, item.lab) < threshold);
    if (!dup) result.push(item);
  }
  return result;
}
function createNearestFinder(candidates, topK = 4) {
  const K = Math.min(topK, candidates.length);
  const cL = new Float64Array(candidates.length);
  const ca = new Float64Array(candidates.length);
  const cb = new Float64Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    cL[i] = candidates[i].lab.L;
    ca[i] = candidates[i].lab.a;
    cb[i] = candidates[i].lab.b;
  }
  const bestIdx = new Int32Array(K);
  const bestD = new Float64Array(K);
  return function findNearest(L, a, b) {
    bestD.fill(Infinity);
    bestIdx.fill(0);
    for (let i = 0; i < candidates.length; i++) {
      const dL = L - cL[i];
      const da = a - ca[i];
      const db = b - cb[i];
      const d = dL * dL + da * da + db * db;
      if (d < bestD[K - 1]) {
        let pos = K - 1;
        while (pos > 0 && bestD[pos - 1] > d) {
          bestD[pos] = bestD[pos - 1];
          bestIdx[pos] = bestIdx[pos - 1];
          pos--;
        }
        bestD[pos] = d;
        bestIdx[pos] = i;
      }
    }
    let winner = bestIdx[0];
    let winnerD = Infinity;
    for (let j = 0; j < K; j++) {
      const c = candidates[bestIdx[j]];
      const dE = deltaE2000Raw(L, a, b, c.lab.L, c.lab.a, c.lab.b);
      if (dE < winnerD) {
        winnerD = dE;
        winner = bestIdx[j];
      }
    }
    return winner;
  };
}
function assignPhotoCells(labs, candidates) {
  const n = labs.length / 3;
  const cells = new Uint8Array(n);
  const counts = new Array(candidates.length).fill(0);
  const findNearest = createNearestFinder(candidates, 4);
  for (let i = 0; i < n; i++) {
    const idx = findNearest(labs[i * 3], labs[i * 3 + 1], labs[i * 3 + 2]);
    cells[i] = idx;
    counts[idx]++;
  }
  return { cells, counts };
}
function despeckle(cells, w, h, palette, maxDelta = 6) {
  var _a;
  if (w < 3 || h < 3) return 0;
  const labs = palette.map((p) => hexToLab(p.hex));
  const src = cells.slice();
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = src[i];
      let sameNeighbors = 0;
      const counts = /* @__PURE__ */ new Map();
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const nc = src[ny * w + nx];
          if (nc === c) sameNeighbors++;
          counts.set(nc, ((_a = counts.get(nc)) != null ? _a : 0) + 1);
        }
      }
      if (sameNeighbors !== 0) continue;
      let topColor = -1;
      let topCount = 0;
      for (const [color, count] of counts) {
        if (count > topCount) {
          topCount = count;
          topColor = color;
        }
      }
      if (topColor < 0 || topCount < 3) continue;
      const a = labs[c];
      const b = labs[topColor];
      if (!a || !b) continue;
      const dE = deltaE2000Raw(a.L, a.a, a.b, b.L, b.a, b.b);
      if (dE <= maxDelta) {
        cells[i] = topColor;
        changed++;
      }
    }
  }
  return changed;
}
function importPixelArt(img, gridSize, catalog, opts = {}) {
  var _a, _b, _c;
  const maxColors = Math.min(254, (_a = opts.maxColors) != null ? _a : 254);
  const g = Math.max(1, Math.floor(gridSize));
  const { width: W, height: H, data } = img;
  const w = Math.max(1, Math.floor(W / g));
  const h = Math.max(1, Math.floor(H / g));
  const ox = Math.floor((W - w * g) / 2);
  const oy = Math.floor((H - h * g) / 2);
  const keyOf = new Int32Array(w * h);
  const usage = /* @__PURE__ */ new Map();
  let emptyCells = 0;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(H - 1, oy + y * g + (g >> 1));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(W - 1, ox + x * g + (g >> 1));
      const p = (sy * W + sx) * 4;
      const i = y * w + x;
      if (data[p + 3] < 128) {
        keyOf[i] = -1;
        emptyCells++;
        continue;
      }
      const key = (data[p] << 16 | data[p + 1] << 8 | data[p + 2]) + 1;
      keyOf[i] = key;
      usage.set(key, ((_b = usage.get(key)) != null ? _b : 0) + 1);
    }
  }
  const originalColorCount = usage.size;
  const keyToCatalog = /* @__PURE__ */ new Map();
  const colorUsage = /* @__PURE__ */ new Map();
  let deltaSum = 0;
  let deltaCount = 0;
  for (const [key, count] of usage) {
    const k = key - 1;
    const r = k >> 16 & 255;
    const gg = k >> 8 & 255;
    const b = k & 255;
    const lab = rgbToLab(r, gg, b);
    let best = catalog[0];
    let bestD = Infinity;
    for (const c of catalog) {
      const d = deltaE2000Raw(lab.L, lab.a, lab.b, c.lab.L, c.lab.a, c.lab.b);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    deltaSum += bestD * count;
    deltaCount += count;
    keyToCatalog.set(key, best);
    const rec = colorUsage.get(best.id);
    if (rec) rec.count += count;
    else colorUsage.set(best.id, { color: best, count });
  }
  let finalColors = [...colorUsage.values()].sort((a, b) => b.count - a.count);
  let mergedColorCount = 0;
  if (finalColors.length > maxColors) {
    const kept = finalColors.slice(0, maxColors);
    const dropped = finalColors.slice(maxColors);
    mergedColorCount = dropped.length;
    const keptColors = kept.map((k) => k.color);
    for (const d of dropped) {
      let best = keptColors[0];
      let bestD = Infinity;
      for (const c of keptColors) {
        const de = deltaE2000Raw(
          d.color.lab.L,
          d.color.lab.a,
          d.color.lab.b,
          c.lab.L,
          c.lab.a,
          c.lab.b
        );
        if (de < bestD) {
          bestD = de;
          best = c;
        }
      }
      const rec = kept.find((k) => k.color.id === best.id);
      if (rec) rec.count += d.count;
    }
    finalColors = kept;
  }
  const palette = finalColors.map(({ color }) => ({
    colorId: color.id,
    code: color.code,
    name: color.name,
    hex: color.hex,
    lab: color.lab,
    deltaE: 0
  }));
  const idToIndex = /* @__PURE__ */ new Map();
  palette.forEach((p, i) => idToIndex.set(p.colorId, i));
  const counts = finalColors.map((f2) => f2.count);
  const cells = new Uint8Array(w * h);
  const keyToIndex = /* @__PURE__ */ new Map();
  for (const [key, color] of keyToCatalog) {
    const idx = idToIndex.get(color.id);
    keyToIndex.set(key, idx != null ? idx : 0);
  }
  for (let i = 0; i < keyOf.length; i++) {
    const k = keyOf[i];
    cells[i] = k === -1 ? EMPTY_CELL : (_c = keyToIndex.get(k)) != null ? _c : 0;
  }
  return {
    width: w,
    height: h,
    cells,
    palette,
    counts,
    emptyCells,
    originalColorCount,
    mergedColorCount,
    avgDelta: deltaCount ? +(deltaSum / deltaCount).toFixed(2) : 0
  };
}
function compactPalette(cells, palette) {
  const counts = new Array(palette.length).fill(0);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c !== EMPTY_CELL) counts[c]++;
  }
  const keep = [];
  for (let i = 0; i < palette.length; i++) if (counts[i] > 0) keep.push(i);
  if (keep.length === palette.length) {
    const next = palette.map((p, i) => __spreadProps(__spreadValues({}, p), { count: counts[i] }));
    return { cells, palette: next };
  }
  const remap = new Int32Array(palette.length).fill(-1);
  keep.forEach((oldIdx, newIdx) => {
    remap[oldIdx] = newIdx;
  });
  const nextCells = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    nextCells[i] = c === EMPTY_CELL ? EMPTY_CELL : remap[c];
  }
  const nextPalette = keep.map((oldIdx) => __spreadProps(__spreadValues({}, palette[oldIdx]), {
    count: counts[oldIdx]
  }));
  return { cells: nextCells, palette: nextPalette };
}
function sortPaletteByUsage(palette) {
  return [...palette].sort((a, b) => b.count - a.count);
}
function buildStats(width, height, cells, palette, beadSize) {
  let total = 0;
  let emptyCells = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === EMPTY_CELL) emptyCells++;
    else total++;
  }
  const boardsX = Math.ceil(width / BOARD_SIZE);
  const boardsY = Math.ceil(height / BOARD_SIZE);
  return {
    total,
    colorCount: palette.length,
    emptyCells,
    boardsX,
    boardsY,
    boardsTotal: boardsX * boardsY,
    widthCm: +(width * beadSize / 10).toFixed(1),
    heightCm: +(height * beadSize / 10).toFixed(1),
    restockCount: palette.filter((p) => p.owned === false).length,
    avgDelta: 0
  };
}
function createPattern(width, height, cells, palette, meta) {
  const compacted = compactPalette(cells, palette);
  const sorted = sortPaletteByUsage(compacted.palette);
  compacted.palette.map((p) => p.code);
  const sortedIndex = /* @__PURE__ */ new Map();
  sorted.forEach((p, i) => sortedIndex.set(p.code, i));
  const remap = new Int32Array(compacted.palette.length);
  compacted.palette.forEach((p, oldIdx) => {
    var _a;
    remap[oldIdx] = (_a = sortedIndex.get(p.code)) != null ? _a : oldIdx;
  });
  const finalCells = new Uint8Array(cells.length);
  for (let i = 0; i < finalCells.length; i++) {
    const c = compacted.cells[i];
    finalCells[i] = c === EMPTY_CELL ? EMPTY_CELL : remap[c];
  }
  return {
    width,
    height,
    mode: meta.mode,
    beadSize: meta.beadSize,
    seriesId: meta.seriesId,
    palette: sorted,
    cells: finalCells,
    stats: buildStats(width, height, finalCells, sorted, meta.beadSize)
  };
}
function removeSpeckles(cells, w, h, palette, opts = {}) {
  var _a, _b, _c, _d, _e, _f;
  const minArea = (_a = opts.minArea) != null ? _a : 6;
  const maxDelta = (_b = opts.maxDelta) != null ? _b : 12;
  const n = w * h;
  const labs = palette.map((p) => hexToLab(p.hex));
  const before = countColorsIn(cells);
  const visited = new Uint8Array(n);
  const stack = new Int32Array(n);
  const region = new Int32Array(n);
  let changed = 0;
  let regions = 0;
  for (let start = 0; start < n; start++) {
    if (visited[start]) continue;
    const color = cells[start];
    visited[start] = 1;
    let sp = 0;
    let rp = 0;
    stack[sp++] = start;
    region[rp++] = start;
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % w;
      const y = idx / w | 0;
      if (x + 1 < w) {
        const ni = idx + 1;
        if (!visited[ni] && cells[ni] === color) {
          visited[ni] = 1;
          stack[sp++] = ni;
          region[rp++] = ni;
        }
      }
      if (x > 0) {
        const ni = idx - 1;
        if (!visited[ni] && cells[ni] === color) {
          visited[ni] = 1;
          stack[sp++] = ni;
          region[rp++] = ni;
        }
      }
      if (y + 1 < h) {
        const ni = idx + w;
        if (!visited[ni] && cells[ni] === color) {
          visited[ni] = 1;
          stack[sp++] = ni;
          region[rp++] = ni;
        }
      }
      if (y > 0) {
        const ni = idx - w;
        if (!visited[ni] && cells[ni] === color) {
          visited[ni] = 1;
          stack[sp++] = ni;
          region[rp++] = ni;
        }
      }
    }
    if (rp >= minArea) continue;
    if (color === EMPTY_CELL) continue;
    const counts = /* @__PURE__ */ new Map();
    for (let t = 0; t < rp; t++) {
      const idx = region[t];
      const x = idx % w;
      const y = idx / w | 0;
      if (x + 1 < w && cells[idx + 1] !== color) {
        const c = cells[idx + 1];
        counts.set(c, ((_c = counts.get(c)) != null ? _c : 0) + 1);
      }
      if (x > 0 && cells[idx - 1] !== color) {
        const c = cells[idx - 1];
        counts.set(c, ((_d = counts.get(c)) != null ? _d : 0) + 1);
      }
      if (y + 1 < h && cells[idx + w] !== color) {
        const c = cells[idx + w];
        counts.set(c, ((_e = counts.get(c)) != null ? _e : 0) + 1);
      }
      if (y > 0 && cells[idx - w] !== color) {
        const c = cells[idx - w];
        counts.set(c, ((_f = counts.get(c)) != null ? _f : 0) + 1);
      }
    }
    let best = -1;
    let bestCount = 0;
    for (const [c, cnt] of counts) {
      if (c === EMPTY_CELL) continue;
      if (cnt > bestCount) {
        bestCount = cnt;
        best = c;
      }
    }
    if (best < 0) continue;
    const a = labs[color];
    const b = labs[best];
    if (!a || !b) continue;
    if (deltaE2000Raw(a.L, a.a, a.b, b.L, b.a, b.b) > maxDelta) continue;
    for (let t = 0; t < rp; t++) cells[region[t]] = best;
    changed += rp;
    regions++;
  }
  return {
    changed,
    regions,
    colorsBefore: before,
    colorsAfter: countColorsIn(cells)
  };
}
function countColorsIn(cells) {
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== EMPTY_CELL) seen.add(cells[i]);
  }
  return seen.size;
}
function convertPhoto(img, opts) {
  var _a, _b, _c;
  const { targetWidth, targetHeight, colorCount, series } = opts;
  const catalog = pickCatalog(series, opts.setCodes);
  if (!catalog.length) throw new Error("色卡为空：检查系列或套装配置");
  const flat = flattenOnColor(img, (_a = opts.background) != null ? _a : "#FFFFFF");
  const small = resampleBox(flat, targetWidth, targetHeight);
  const sharp = sharpen(small, (_b = opts.sharpenAmount) != null ? _b : 0.4);
  const labs = toLabArray(sharp);
  const weights = buildWeights(sharp);
  const k = Math.max(2, Math.min(colorCount, catalog.length, targetWidth * targetHeight));
  const centers = kmeansLab(labs, weights, k, 24);
  const picked = mapCentroidsToCatalog(centers, catalog, 1);
  const { cells } = assignPhotoCells(labs, picked);
  if (opts.bgMask && opts.bgMask.length === img.width * img.height) {
    const smallMask = downscaleMask(opts.bgMask, img.width, img.height, targetWidth, targetHeight);
    for (let i = 0; i < cells.length; i++) {
      if (smallMask[i]) cells[i] = EMPTY_CELL;
    }
  }
  const palette = picked.map((p) => ({
    colorId: p.colorId,
    code: p.code,
    name: p.name,
    hex: p.hex,
    count: 0,
    owned: opts.setCodes ? opts.setCodes.includes(p.code) : void 0
  }));
  if (opts.doDespeckle !== false) {
    despeckle(cells, targetWidth, targetHeight, palette, (_c = opts.despeckleMaxDelta) != null ? _c : 6);
  }
  const pattern = createPattern(targetWidth, targetHeight, cells, palette, {
    mode: "photo",
    beadSize: series.beadSize,
    seriesId: series.id
  });
  pattern.stats.avgDelta = measureAvgDelta(labs, pattern.cells, picked);
  return pattern;
}
function measureAvgDelta(labs, cells, picked) {
  const n = cells.length;
  if (!n) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const idx = cells[i];
    const c = picked[idx];
    if (!c) continue;
    sum += deltaE2000Raw(
      labs[i * 3],
      labs[i * 3 + 1],
      labs[i * 3 + 2],
      c.lab.L,
      c.lab.a,
      c.lab.b
    );
    count++;
  }
  return count ? +(sum / count).toFixed(2) : 0;
}
function autoTune(img, opts) {
  var _a, _b;
  const target = (_a = opts.targetDelta) != null ? _a : 6.5;
  const cap = opts.setCodes ? opts.setCodes.length : opts.series.colors.length;
  let cands = ((_b = opts.candidates) != null ? _b : [10, 12, 16, 20, 24, 32, 40, 48, 64]).filter((k) => k <= cap);
  if (!cands.length) cands = [Math.min(16, cap)];
  const tried = [];
  let best = null;
  let prevDelta = Infinity;
  for (const k of cands) {
    const p = convertPhoto(img, {
      targetWidth: opts.targetWidth,
      targetHeight: opts.targetHeight,
      colorCount: k,
      series: opts.series,
      setCodes: opts.setCodes
    });
    const rec = { colorCount: k, avgDelta: p.stats.avgDelta };
    tried.push(rec);
    if (!best || rec.avgDelta < best.avgDelta) best = rec;
    if (rec.avgDelta <= target) break;
    if (prevDelta < Infinity && (prevDelta - rec.avgDelta) / prevDelta < 0.08) break;
    prevDelta = rec.avgDelta;
  }
  return {
    colorCount: best ? best.colorCount : cands[0],
    avgDelta: best ? best.avgDelta : 0,
    tried
  };
}
function convertImport(img, opts) {
  const catalog = pickCatalog(opts.series, opts.setCodes);
  if (!catalog.length) throw new Error("色卡为空：检查系列或套装配置");
  const result = importPixelArt(img, opts.gridSize, catalog);
  const palette = result.palette.map((p, i) => {
    var _a;
    return {
      colorId: p.colorId,
      code: p.code,
      name: p.name,
      hex: p.hex,
      count: (_a = result.counts[i]) != null ? _a : 0,
      owned: opts.setCodes ? opts.setCodes.includes(p.code) : void 0
    };
  });
  const pattern = createPattern(result.width, result.height, result.cells, palette, {
    mode: "import",
    beadSize: opts.series.beadSize,
    seriesId: opts.series.id
  });
  pattern.stats.avgDelta = result.avgDelta;
  return pattern;
}
function pickCatalog(series, setCodes) {
  if (!setCodes || !setCodes.length) return series.colors;
  const allowed = new Set(setCodes);
  return series.colors.filter((c) => allowed.has(c.code));
}
function downscaleMask(mask, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh);
  const xr = sw / dw;
  const yr = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor(dy * yr);
    const y1 = Math.max(y0 + 1, Math.min(sh, Math.ceil((dy + 1) * yr)));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor(dx * xr);
      const x1 = Math.max(x0 + 1, Math.min(sw, Math.ceil((dx + 1) * xr)));
      let total = 0;
      let bg = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          if (mask[y * sw + x]) bg++;
        }
      }
      out[dy * dw + dx] = total > 0 && bg / total > 0.5 ? 1 : 0;
    }
  }
  return out;
}
export {
  BOARD_SIZE,
  EMPTY_CELL,
  analyzeImage,
  assignPhotoCells,
  autoTune,
  buildStats,
  buildWeights,
  compactPalette,
  convertImport,
  convertPhoto,
  countColors,
  createNearestFinder,
  createPattern,
  cropRect,
  cropToRatio,
  deltaE2000,
  deltaE2000Raw,
  describeDelta,
  despeckle,
  detectAntiAlias,
  detectGridSize,
  flattenOnColor,
  hexToLab,
  hexToRgb,
  importPixelArt,
  kmeansLab,
  labDistanceSq,
  labToRgb,
  labToXyz,
  linearToSrgb,
  mapCentroidsToCatalog,
  mergeSimilar,
  relativeLuminance,
  removeBackground,
  removeSpeckles,
  resampleBox,
  resampleNearest,
  rgbToHex,
  rgbToLab,
  rgbToXyz,
  sharpen,
  sortPaletteByUsage,
  srgbToLinear,
  toLabArray,
  xyzToLab
};
