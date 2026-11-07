import {
  analyzeImage,
  autoTune,
  convertImport,
  convertPhoto,
  createPattern,
  flattenOnColor,
  removeSpeckles,
  resampleBox,
  sharpen,
  type ColorSeries,
  type ImageAnalysis,
  type Pattern,
  type PatternColor,
  type RasterImage,
} from '@pindou/core';
import { exportPatternPng, renderPattern, renderRaster, renderRasterFit } from './render';
import { makePhotoSample, makeSampleRaster } from './sample';

type Mode = 'auto' | 'photo' | 'import';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const el = {
  drop: $('drop'),
  file: $<HTMLInputElement>('file'),
  filemeta: $('filemeta'),
  fileName: $('fileName'),
  btnClear: $('btnClear'),
  modeSeg: $('modeSeg'),
  modeNotice: $('modeNotice'),
  gridSection: $('gridSection'),
  gridSize: $<HTMLInputElement>('gridSize'),
  gridVal: $('gridVal'),
  gridPresets: $('gridPresets'),
  sizeHint: $('sizeHint'),
  colorCount: $<HTMLInputElement>('colorCount'),
  colorVal: $('colorVal'),
  colorHint: $('colorHint'),
  setSelect: $<HTMLSelectElement>('setSelect'),
  btnRun: $<HTMLButtonElement>('btnRun'),
  timing: $('timing'),
  stageInfo: $('stageInfo'),
  showCode: $<HTMLInputElement>('showCode'),
  showBoard: $<HTMLInputElement>('showBoard'),
  btnDenoise: $<HTMLButtonElement>('btnDenoise'),
  btnExport: $<HTMLButtonElement>('btnExport'),
  btnSample: $<HTMLButtonElement>('btnSample'),
  btnSample2: $<HTMLButtonElement>('btnSample2'),
  canvasWrap: $('canvasWrap'),
  cv: $<HTMLCanvasElement>('cv'),
  ref: $<HTMLCanvasElement>('ref'),
  refSelect: $<HTMLSelectElement>('refSelect'),
  paneRef: $('paneRef'),
  paneMain: $('paneMain'),
  empty: $('empty'),
  stats: $('stats'),
  ulist: $('ulist'),
  usageCount: $('usageCount'),
  catalogPill: $('catalogPill'),
};

let series: ColorSeries | null = null;
let raster: RasterImage | null = null;
let analysis: ImageAnalysis | null = null;
let pattern: Pattern | null = null;
/** 算法实际看到的图（照片模式=降采样后，导入模式=逐格采样后） */
let sampled: RasterImage | null = null;
let mode: Mode = 'auto';
let running = false;

// ---------------- 初始化 ----------------

async function init() {
  try {
    // 必须绕开缓存：色卡 JSON 会被浏览器缓存，换了数据但页面还显示旧套装，
    // 这种「明明更新了却没生效」的问题排查起来很费劲
    const res = await fetch(`/data/mard-221.json?v=${Date.now()}`, { cache: 'no-store' });
    series = (await res.json()) as ColorSeries;
    fillSets();
    applySetLimit();
    el.catalogPill.textContent = `${series.brandName} ${series.colors.length} 色 · v${series.version ?? '?'}`;
  } catch (e) {
    console.error(e);
    el.catalogPill.textContent = '色卡加载失败';
  }

  loadPhotoSample();
  bindEvents();
  updateSizeHint();
}

function fillSets() {
  if (!series?.sets) return;
  for (const s of series.sets) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name}（${s.codes.length} 色）`;
    el.setSelect.appendChild(opt);
  }
}

// ---------------- 图片载入 ----------------

async function loadFile(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const img = bitmapToRaster(bitmap);
    bitmap.close();
    setRaster(img, file.name);
    autoConfigure();
  } catch (e) {
    console.error(e);
    alert('这张图读不出来，换一张试试');
  }
}

function bitmapToRaster(bitmap: ImageBitmap): RasterImage {
  const MAX = 2048;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  // 缩小大图时保持硬边缘，像素图不被插值糊掉
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: img.data };
}

function setRaster(img: RasterImage, name: string) {
  raster = img;
  pattern = null;
  sampled = null;
  analysis = analyzeImage(img);

  el.empty.hidden = true;
  el.filemeta.hidden = false;
  el.fileName.textContent = `${name} · ${img.width}×${img.height}`;
  el.btnRun.disabled = false;
  el.btnExport.disabled = true;

  applyDetectedGrid();
  updateModeNotice();

  // 自动模式：如果识别为像素图，直接把格数设成识别的值
  if (analysis.suggestMode === 'import' && analysis.grid) {
    el.gridSize.value = String(analysis.grid.width);
    el.gridVal.textContent = `${analysis.grid.width}`;
  }
  updateSizeHint();
}

function applyDetectedGrid() {
  const isImport = effectiveMode() === 'import';
  el.gridSize.disabled = isImport && !!analysis?.grid;
  for (const b of el.gridPresets.querySelectorAll('button')) {
    (b as HTMLButtonElement).disabled = isImport;
  }
  el.colorCount.disabled = isImport;
  el.colorHint.textContent = isImport ? '直接导入不改色数' : '目标色数';
}

function loadPhotoSample() {
  const img = makePhotoSample();
  setRaster(img, '照片示例 · 测试人像');
  // 照片示例用 58 格，接近人像的实用规格
  el.gridSize.value = '58';
  el.gridVal.textContent = '58';
  setMode('photo');
  updateSizeHint();
  autoConfigure();
}

function loadPixelSample() {
  const img = makeSampleRaster();
  setRaster(img, '像素图示例 · 猫脸 32×32');
  setMode('import');
  run();
}

// ---------------- 模式 ----------------

function effectiveMode(): 'photo' | 'import' {
  if (mode !== 'auto') return mode;
  return analysis?.suggestMode ?? 'photo';
}

function setMode(m: Mode) {
  mode = m;
  for (const b of el.modeSeg.querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.mode === m);
  }

  // 导入模式下格数由识别结果决定，同步到滑块
  const real = effectiveMode();
  if (real === 'import' && analysis?.grid) {
    el.gridSize.value = String(analysis.grid.width);
    el.gridVal.textContent = String(analysis.grid.width);
  }

  updateModeNotice();
  applyDetectedGrid();
  updateSizeHint();
}

function updateModeNotice() {
  if (!analysis) {
    el.modeNotice.hidden = true;
    return;
  }

  const real = effectiveMode();
  const g = analysis.grid;

  if (real === 'import') {
    const gs = g ? `${g.width} × ${g.height} 格（每格 ${g.gridSize}px）` : '未能识别格数';
    el.modeNotice.className = 'notice ok';
    el.modeNotice.textContent = `像素图 1:1 还原：${gs}。不改色、不去噪、不抖动。`;
  } else {
    el.modeNotice.className = 'notice';
    el.modeNotice.textContent = `按照片处理：${analysis.reason}`;
  }
  el.modeNotice.hidden = false;
}

// ---------------- 生成 ----------------

function run() {
  if (!raster || !series || running) return;
  running = true;
  el.btnRun.disabled = true;
  el.btnRun.textContent = '生成中…';

  // 让浏览器先把 loading 状态画出来，再跑重计算
  requestAnimationFrame(() => {
    setTimeout(() => {
      const t0 = performance.now();
      denoiseBackup = null;
      el.btnDenoise.textContent = '去杂质';
      try {
        const setCodes = getSetCodes();
        const real = effectiveMode();

        if (real === 'import') {
          const n = Number(el.gridSize.value);
          const gs = analysis?.grid?.gridSize ?? Math.max(1, Math.round(raster!.width / n));
          pattern = convertImport(raster!, { gridSize: gs, series: series!, setCodes });
          sampled = makeImportInput(raster!, gs);
        } else {
          const n = Number(el.gridSize.value);
          const ratio = raster!.height / raster!.width;
          const w = n;
          const h = Math.max(1, Math.round(n * ratio));
          pattern = convertPhoto(raster!, {
            targetWidth: w,
            targetHeight: h,
            colorCount: Number(el.colorCount.value),
            series: series!,
            setCodes,
            sharpenAmount: 0.4,
          });
          sampled = makePhotoInput(raster!, w, h);
        }

        const ms = performance.now() - t0;
        el.timing.textContent = `耗时 ${ms.toFixed(0)} ms`;

        render();
        // 布局可能刚变化，下一帧按真实尺寸再画一次，避免图画得很小
        requestAnimationFrame(() => render());
        updateUsage();
        el.btnExport.disabled = false;
        el.btnDenoise.disabled = false;
      } catch (e) {
        console.error(e);
        el.timing.textContent = `失败：${(e as Error).message}`;
      } finally {
        running = false;
        el.btnRun.disabled = false;
        el.btnRun.textContent = '生成图纸';
      }
    }, 0);
  });
}

function getSetCodes(): string[] | undefined {
  const id = el.setSelect.value;
  if (!id || !series?.sets) return undefined;
  return series.sets.find((s) => s.id === id)?.codes;
}

/** 当前所选套装的色数（未选套装返回 null） */
function currentSetSize(): number | null {
  const id = el.setSelect.value;
  if (!id || !series?.sets) return null;
  const s = series.sets.find((x) => x.id === id);
  return s ? s.codes.length : null;
}

/**
 * 格数与色数的经验配比。
 *
 * 29 格配 40 色是浪费——格子太少，色差根本看不出来；
 * 96 格只给 8 色又会显得粗糙。大约每格 0.4 色是比较平衡的比例。
 */
function recommendColors(grid: number): number {
  return Math.max(4, Math.min(64, Math.round(grid * 0.4)));
}

/** 色数越多，摆豆的分拣成本上升得越快，给个直白的话 */
function complexityHint(n: number): string {
  if (n <= 16) return '简单，摆豆快';
  if (n <= 32) return '中等，常见档位';
  if (n <= 64) return '偏多，分拣要花时间';
  return '很多，建议先备分色盘';
}

/**
 * 套装变了要收紧色数上限。
 * 上限不写死 64——色卡有 221 色，用户想用更多是他的自由，
 * 界面只负责把代价说清楚。
 */
function applySetLimit() {
  const size = currentSetSize();
  const cap = size ?? series?.colors.length ?? 221;
  const max = Math.max(4, Math.min(cap, 221));
  el.colorCount.max = String(max);

  if (Number(el.colorCount.value) > max) {
    el.colorCount.value = String(max);
    el.colorVal.textContent = String(max);
  }
}

// ---------------- 渲染 ----------------

function render() {
  if (!pattern) return;

  // 右：成品图纸
  const mainBox = el.paneMain;
  const maxW = Math.max(80, mainBox.clientWidth - 20);
  const maxH = Math.max(80, mainBox.clientHeight - 20);

  renderPattern(el.cv, pattern, {
    showCode: el.showCode.checked,
    showBoard: el.showBoard.checked,
    maxWidth: maxW,
    maxHeight: maxH,
  });

  renderRef();

  const s = pattern.stats;
  const parts = [
    `${pattern.width} × ${pattern.height}`,
    `${s.colorCount} 色`,
    `${s.total.toLocaleString()} 颗`,
    `${s.widthCm} × ${s.heightCm} cm`,
    `${s.boardsTotal} 块板`,
  ];
  if (s.emptyCells > 0) parts.push(`${s.emptyCells} 空格`);
  el.stageInfo.textContent = parts.join(' · ');
}

/** 左：对比基准 */
function renderRef() {
  if (!raster) return;

  const box = el.paneRef;
  const maxW = Math.max(80, box.clientWidth - 20);
  const maxH = Math.max(80, box.clientHeight - 20);

  const kind = el.refSelect.value;

  if (kind === 'source') {
    renderRasterFit(el.ref, raster, maxW, maxH);
    return;
  }

  if (sampled) {
    renderRaster(el.ref, sampled, maxW, maxH);
  } else {
    renderRasterFit(el.ref, raster, maxW, maxH);
  }
}

/**
 * 照片模式的「算法输入」：合成底色 → 面积平均降采样 → 锐化。
 * 必须和 core 内部完全一致，否则对比会失真。
 */
function makePhotoInput(img: RasterImage, w: number, h: number): RasterImage {
  const flat = flattenOnColor(img, '#FFFFFF');
  const small = resampleBox(flat, w, h);
  return sharpen(small, 0.4);
}

/** 导入模式的「算法输入」：逐格取中心像素，不平均 */
function makeImportInput(img: RasterImage, g: number): RasterImage {
  const W = img.width;
  const H = img.height;
  const w = Math.max(1, Math.floor(W / g));
  const h = Math.max(1, Math.floor(H / g));
  const ox = Math.floor((W - w * g) / 2);
  const oy = Math.floor((H - h * g) / 2);
  const data = new Uint8ClampedArray(w * h * 4);

  for (let y = 0; y < h; y++) {
    const sy = Math.min(H - 1, oy + y * g + (g >> 1));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(W - 1, ox + x * g + (g >> 1));
      const s = (sy * W + sx) * 4;
      const d = (y * w + x) * 4;
      data[d] = img.data[s];
      data[d + 1] = img.data[s + 1];
      data[d + 2] = img.data[s + 2];
      data[d + 3] = img.data[s + 3];
    }
  }

  return { width: w, height: h, data };
}

function updateUsage() {
  if (!pattern) return;
  const s = pattern.stats;

  el.stats.innerHTML = `
    <div class="stat"><div class="k">总颗数</div><div class="v">${s.total.toLocaleString()}<small>颗</small></div></div>
    <div class="stat"><div class="k">用色</div><div class="v">${s.colorCount}<small>色</small></div></div>
    <div class="stat"><div class="k">底板</div><div class="v">${s.boardsTotal}<small>块</small></div></div>
    <div class="stat"><div class="k">成品</div><div class="v">${s.widthCm}<small>cm</small></div></div>
  `;

  el.usageCount.textContent = `${pattern.palette.length} 色`;

  // 告诉用户「目标色数」和「实际用色」的差别：
  // 照片本身没有那么多种可分辨的颜色时，实际会少于目标，这是正常的
  if (effectiveMode() === 'photo') {
    const target = Number(el.colorCount.value);
    el.colorHint.textContent =
      pattern.palette.length < target
        ? `实际用了 ${pattern.palette.length} 色（目标 ${target}）`
        : `实际 ${pattern.palette.length} 色`;
  }

  el.ulist.innerHTML = pattern.palette
    .map((p) => {
      const need = p.owned === false ? '<span class="tag need">补</span>' : '';
      return `<div class="urow">
        <div class="sw" style="background:${p.hex}"></div>
        <div class="ucode">${p.code}</div>
        <div class="uname">${p.name ?? ''}</div>
        ${need}
        <div class="ucnt">${p.count}</div>
      </div>`;
    })
    .join('');
}

// ---------------- 去杂质 ----------------

/** 去杂质前的快照，用于撤销 */
let denoiseBackup: { cells: Uint8Array; palette: PatternColor[]; avgDelta: number } | null = null;

/** 用新的 cells/palette 重建图纸（会重新压缩调色板、重算用量） */
function rebuildPattern(cells: Uint8Array, palette: PatternColor[], avgDelta: number): Pattern {
  if (!pattern) throw new Error('no pattern');
  const p = createPattern(
    pattern.width,
    pattern.height,
    cells,
    palette.map((x) => ({ ...x })),
    { mode: pattern.mode, beadSize: pattern.beadSize, seriesId: pattern.seriesId },
  );
  p.stats.avgDelta = avgDelta;
  return p;
}

function toggleDenoise() {
  if (!pattern) return;

  // 第二次点击 = 撤销
  if (denoiseBackup) {
    pattern = rebuildPattern(denoiseBackup.cells.slice(), denoiseBackup.palette, denoiseBackup.avgDelta);
    denoiseBackup = null;
    el.btnDenoise.textContent = '去杂质';
    el.timing.textContent = '已恢复原图';
    render();
    updateUsage();
    return;
  }

  const t0 = performance.now();
  const snapshot = {
    cells: pattern.cells.slice(),
    palette: pattern.palette.map((p) => ({ ...p })),
    avgDelta: pattern.stats.avgDelta,
  };

  const r = removeSpeckles(pattern.cells, pattern.width, pattern.height, pattern.palette, {
    minArea: 6,
    maxDelta: 12,
  });

  pattern = rebuildPattern(pattern.cells, pattern.palette, snapshot.avgDelta);
  denoiseBackup = snapshot;

  const ms = performance.now() - t0;
  if (r.changed > 0) {
    el.btnDenoise.textContent = '撤销';
    el.timing.textContent = `清掉 ${r.regions} 处杂色，合并 ${r.colorsBefore - r.colorsAfter} 色 · ${ms.toFixed(0)}ms`;
  } else {
    el.timing.textContent = `没找到需要清理的杂色 · ${ms.toFixed(0)}ms`;
  }

  render();
  updateUsage();
}

// ---------------- 自动调参 ----------------

/**
 * 载入图片后自动挑色数。
 *
 * 不是「选最像的」——那会永远选最大色数，摆豆累死人。
 * 而是从少到多试，第一个达到可接受还原度的就停。
 */
function autoConfigure() {
  if (!raster || !series) return;

  if (effectiveMode() !== 'photo') {
    run();
    return;
  }

  const n = Number(el.gridSize.value);
  const ratio = raster.height / raster.width;
  const w = n;
  const h = Math.max(1, Math.round(n * ratio));

  el.timing.textContent = '正在试参数，找最合适的色数…';
  el.btnRun.disabled = true;

  setTimeout(() => {
    try {
      const r = autoTune(raster!, {
        targetWidth: w,
        targetHeight: h,
        series: series!,
        setCodes: getSetCodes(),
      });

      // 自动调参容易过于保守（只看色差，不看观感），
      // 给它一个下限：不低于「格数推荐值」的 70%
      const rec = recommendColors(n);
      const finalCount = Math.max(r.colorCount, Math.round(rec * 0.7));

      el.colorCount.value = String(finalCount);
      el.colorVal.textContent = String(finalCount);
      el.colorHint.textContent = `自动推荐 ${finalCount} 色（色差 ${r.avgDelta}）`;
      el.timing.textContent = '';
    } catch (e) {
      console.error(e);
      el.timing.textContent = '';
    } finally {
      el.btnRun.disabled = false;
      run();
    }
  }, 40);
}

// ---------------- 尺寸提示 ----------------

function updateSizeHint() {
  const n = Number(el.gridSize.value);
  el.gridVal.textContent = String(n);

  const ratio = raster ? raster.height / raster.width : 1;
  const h = Math.max(1, Math.round(n * ratio));
  const cmW = ((n * 5) / 10).toFixed(1);
  const cmH = ((h * 5) / 10).toFixed(1);
  const rec = recommendColors(n);

  let hint = `5mm 豆 · 成品约 ${cmW} × ${cmH} cm · 建议 ${rec} 色`;

  // 格数超过原图分辨率时，再高的格数也只是把像素放大，不会产生新细节
  if (raster) {
    const shortSide = Math.min(raster.width, raster.height);
    if (n > shortSide) {
      hint += ` · 已超过原图 ${shortSide}px，不会更细`;
    }
  }

  el.sizeHint.textContent = hint;
}

// ---------------- 导出 ----------------

async function doExport() {
  if (!pattern) return;
  try {
    const blob = await exportPatternPng(pattern, {
      showCode: el.showCode.checked,
      showBoard: el.showBoard.checked,
      cellSize: 14,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pindou-${pattern.width}x${pattern.height}-${pattern.palette.length}c.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (e) {
    console.error(e);
    alert('导出失败');
  }
}

// ---------------- 事件 ----------------

function bindEvents() {
  el.drop.onclick = () => el.file.click();
  el.btnClear.onclick = () => el.file.click();

  el.file.onchange = () => {
    const f = el.file.files?.[0];
    if (f) loadFile(f);
    el.file.value = '';
  };

  ['dragenter', 'dragover'].forEach((ev) =>
    el.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      el.drop.classList.add('over');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    el.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      el.drop.classList.remove('over');
    }),
  );
  el.drop.addEventListener('drop', (e) => {
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });

  for (const b of el.modeSeg.querySelectorAll('button')) {
    (b as HTMLButtonElement).onclick = () => {
      setMode((b as HTMLButtonElement).dataset.mode as Mode);
      // 切模式必须重算，否则图纸不变，用户会以为「模式没用」
      if (raster) run();
    };
  }

  el.refSelect.onchange = renderRef;

  // 参数一改就自动重算，这样拖滑块能直接看到「格数如何影响细节」
  let autoTimer: number | undefined;
  const scheduleRun = () => {
    if (!raster) return;
    window.clearTimeout(autoTimer);
    autoTimer = window.setTimeout(() => run(), 220);
  };

  el.gridSize.oninput = () => {
    updateSizeHint();
    for (const b of el.gridPresets.querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.v === el.gridSize.value);
    }
    if (effectiveMode() === 'photo') scheduleRun();
  };

  for (const b of el.gridPresets.querySelectorAll('button')) {
    (b as HTMLButtonElement).onclick = () => {
      el.gridSize.value = (b as HTMLButtonElement).dataset.v!;
      el.gridSize.oninput!(new Event('input'));
    };
  }

  el.colorCount.oninput = () => {
    const v = Number(el.colorCount.value);
    el.colorVal.textContent = String(v);
    if (effectiveMode() === 'photo') {
      el.colorHint.textContent = `目标 ${v} 色 · ${complexityHint(v)}`;
    }
    scheduleRun();
  };

  el.setSelect.onchange = () => {
    applySetLimit();
    scheduleRun();
  };

  el.btnRun.onclick = run;
  el.btnExport.onclick = doExport;
  el.btnDenoise.onclick = toggleDenoise;
  el.btnSample.onclick = loadPhotoSample;
  el.btnSample2.onclick = loadPixelSample;

  el.showCode.onchange = render;
  el.showBoard.onchange = render;

  let t: number | undefined;
  window.addEventListener('resize', () => {
    window.clearTimeout(t);
    t = window.setTimeout(render, 150);
  });
}

init();
