<template>
  <view class="wrap">
    <view class="topbar">
      <view class="info">{{ info }}</view>
      <view class="tbtn" @tap="openParams">参数</view>
      <view class="denoise" :class="{ on: denoised }" @tap="toggleDenoise">
        {{ denoised ? '撤销' : '去杂质' }}
      </view>
    </view>

    <view v-if="viewMode === 'board'" class="boardbar">
      <view class="bbtn" :class="{ dis: boardIndex === 0 }" @tap="prevBoard">‹</view>
      <text class="binfo">第 {{ boardIndex + 1 }} 块，共 {{ boardCount }} 块</text>
      <view class="bbtn" :class="{ dis: boardIndex === boardCount - 1 }" @tap="nextBoard">›</view>
    </view>

    <view class="stage" id="stage">
      <movable-area class="ma">
        <movable-view
        class="mv"
        direction="all"
        :scale="true"
        :scale-min="1"
        :scale-max="4"
        :out-of-bounds="false"
        :x="mvX"
        :y="mvY"
        :style="cvStyle"
      >
          <image v-if="previewSrc" class="cv" :src="previewSrc" :style="cvStyle" mode="scaleToFill"></image>
          <view v-else class="cv-holder">绘制中…</view>
        </movable-view>
      </movable-area>
    </view>

    <view class="tools">
      <view class="tool" :class="{ on: viewMode === 'board' }" @tap="toggleViewMode">
        <view class="tool-ico">▦</view>
        <text class="tool-t">{{ viewMode === 'board' ? '整图' : '单板' }}</text>
      </view>
      <view class="tool" :class="{ on: showCode }" @tap="toggleCode">
        <view class="tool-ico">A1</view>
        <text class="tool-t">色号</text>
      </view>
      <view class="tool" @tap="goUsage">
        <view class="tool-ico">≡</view>
        <text class="tool-t">用量</text>
      </view>
      <view class="tool primary" @tap="saveImage">
        <view class="tool-ico">↓</view>
        <text class="tool-t">保存</text>
      </view>
    </view>

    <!-- 参数面板 -->
    <view v-if="showParams" class="mask" @tap="closeParams"></view>
    <view class="sheet" :class="{ open: showParams }">
      <view class="sheet-grip"></view>
      <view class="sheet-head">
        <text class="sheet-title">参数</text>
        <text class="sheet-done" @tap="closeParams">完成</text>
      </view>

      <view class="sheet-body">
        <view class="sp">
          <view class="sp-row">
            <text class="sp-label">格数</text>
            <view class="stepper">
              <view class="step-btn" :class="{ dis: gridSize === 12 }" @tap="stepGrid(-4)">−</view>
              <text class="step-val num">{{ gridSize }}</text>
              <view class="step-btn" :class="{ dis: gridSize === 300 }" @tap="stepGrid(4)">+</view>
            </view>
          </view>
          <view class="sp-hint">{{ sizeHint }}</view>
        </view>

        <view class="sp">
          <view class="sp-row">
            <text class="sp-label">色数</text>
            <view class="stepper">
              <view class="step-btn" :class="{ dis: colorCount === 2 }" @tap="stepColor(-1)">−</view>
              <text class="step-val num">{{ colorCount }}</text>
              <view class="step-btn" :class="{ dis: colorCount === colorMax }" @tap="stepColor(1)">+</view>
            </view>
          </view>
          <view class="sp-hint">{{ colorHint }}</view>
        </view>

        <view class="sp-tip">拖动即重新生成，不需要返回上一页</view>
      </view>
    </view>
  </view>
</template>

<script>
import * as Core from '@/common/core.js';
import store from '@/common/store.js';
import { createOffscreenCanvas, getBoxSize, getPixelRatio } from '@/common/canvas.js';

const EMPTY_CELL = 255;

let pattern = null;
let backup = null;
let canvasReady = false;
let applyTimer = null;

export default {
  computed: {
    cvStyle() {
      return { width: this.cvW + 'px', height: this.cvH + 'px' };
    },
  },

  data() {
    return {
      info: '',
      showCode: true,
      showBoard: false,
      previewSrc: '',
      cvW: 0,
      mvX: 0,
      mvY: 0,
      cvH: 0,
      denoised: false,
      empty: false,
      showParams: false,
      viewMode: 'full',
      boardIndex: 0,
      boardCount: 1,
      gridSize: 58,
      colorCount: 24,
      colorMax: 221,
      sizeHint: '',
      colorHint: '',
      busy: false,
    };
  },

  onLoad() {
    pattern = store.pattern;
    backup = null;
    canvasReady = false;


    const params = store.params;
    if (params) {
      this.gridSize = params.gridSize;
      this.colorCount = params.colorCount;
      this.colorMax = params.setCodes ? params.setCodes.length : store.series.colors.length;
      this.updateHints();
    }

    if (!pattern) {
      this.empty = true;
      return;
    }

    const s = pattern.stats;
    const parts = [
      pattern.width + ' × ' + pattern.height,
      s.colorCount + ' 色',
      s.total.toLocaleString() + ' 颗',
      s.widthCm + ' × ' + s.heightCm + ' cm',
      s.boardsTotal + ' 块板',
    ];
    this.info = parts.join(' · ');
  },


  onReady() {
    if (!pattern) return;
    setTimeout(() => this.render(), 80);
  },

  methods: {
    async render() {
      if (!pattern) return;
      try {
        const box = await getBoxSize('#stage');
        const pad = 16;
        const maxW = Math.max(160, box.width - pad * 2);
        const maxH = Math.max(160, box.height - pad * 2);

        let region = null;
        let cell;

        if (this.viewMode === 'board') {
          // 单板视图：只画一块底板（29×29），每格能分到 10px 以上，色号才写得下
          region = this.currentBoard();
          cell = Math.max(8, Math.floor(Math.min(maxW / region.w, maxH / region.h)));
        } else {
          cell = Math.max(2, Math.floor(Math.min(maxW / pattern.width, maxH / pattern.height)));
        }

        const rw = region ? region.w : pattern.width;
        const rh = region ? region.h : pattern.height;
        const cw = cell * rw;
        const ch = cell * rh;
        const dpr = getPixelRatio();

        const pxW = Math.round(cw * dpr);
        const pxH = Math.round(ch * dpr);

        const canvas = createOffscreenCanvas(pxW, pxH);
        if (!canvas) throw new Error('离屏画布不可用');
        canvas.width = pxW;
        canvas.height = pxH;

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPattern(ctx, pattern, cell, this.showCode, this.showBoard, region);

        const src = await exportCanvas(canvas, pxW, pxH);
        this.previewSrc = src;
        this.cvW = cw;
        this.cvH = ch;
        // 内容比容器小就居中，比容器大就从左上角开始（可拖拽查看）
        this.mvX = Math.max(0, Math.round((box.width - cw) / 2));
        this.mvY = Math.max(0, Math.round((box.height - ch) / 2));
        canvasReady = true;
      } catch (e) {
        console.error('render failed', e);
      }
    },

    boardCols() {
      return Math.max(1, Math.ceil(pattern.width / 29));
    },

    boardRows() {
      return Math.max(1, Math.ceil(pattern.height / 29));
    },

    currentBoard() {
      const B = 29;
      const cols = this.boardCols();
      const total = cols * this.boardRows();
      const idx = Math.min(this.boardIndex, total - 1);
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = col * B;
      const y = row * B;
      return {
        x,
        y,
        w: Math.min(B, pattern.width - x),
        h: Math.min(B, pattern.height - y),
      };
    },

    toggleViewMode() {
      this.viewMode = this.viewMode === 'full' ? 'board' : 'full';
      this.boardIndex = 0;
      this.render();
    },

    prevBoard() {
      if (this.boardIndex <= 0) return;
      this.boardIndex--;
      this.render();
    },

    nextBoard() {
      if (this.boardIndex >= this.boardCount - 1) return;
      this.boardIndex++;
      this.render();
    },

    toggleCode() {
      this.showCode = !this.showCode;
      this.render();
    },

    toggleBoard() {
      this.showBoard = !this.showBoard;
      this.render();
    },

    // ---------- 参数面板 ----------

    updateHints() {
      const ratio = store.raster ? store.raster.height / store.raster.width : 1;
      const h = Math.max(1, Math.round(this.gridSize * ratio));
      const cmW = ((this.gridSize * 5) / 10).toFixed(1);
      const cmH = ((h * 5) / 10).toFixed(1);
      this.sizeHint = cmW + ' × ' + cmH + ' cm · ' + this.gridSize + ' × ' + h + ' 格';
      this.colorHint = '目标 ' + this.colorCount + ' 色';
    },

    stepGrid(delta) {
      const v = Math.max(12, Math.min(300, this.gridSize + delta));
      if (v === this.gridSize) return;
      this.gridSize = v;
      this.updateHints();
      this.scheduleApply();
    },

    stepColor(delta) {
      const v = Math.max(2, Math.min(this.colorMax, this.colorCount + delta));
      if (v === this.colorCount) return;
      this.colorCount = v;
      this.updateHints();
      this.scheduleApply();
    },

    openParams() {
      this.showParams = true;
    },

    closeParams() {
      this.showParams = false;
      // canvas 隐藏过，关闭后补画一次，避免出现空白
      setTimeout(() => this.render(), 80);
    },

    onGridChanging(e) {
      this.gridSize = e.detail.value;
      this.updateHints();
      this.scheduleApply();
    },

    onGridChange(e) {
      this.gridSize = e.detail.value;
      this.updateHints();
      this.scheduleApply();
    },

    onColorChanging(e) {
      this.colorCount = e.detail.value;
      this.updateHints();
      this.scheduleApply();
    },

    onColorChange(e) {
      this.colorCount = e.detail.value;
      this.updateHints();
      this.scheduleApply();
    },

    scheduleApply() {
      if (applyTimer) clearTimeout(applyTimer);
      applyTimer = setTimeout(() => this.applyParams(), 280);
    },

    async applyParams() {
      if (this.busy || !store.raster) return;
      const params = store.params || {};
      // 直接导入模式不吃色数参数，格数也由图片决定，不重算
      if (params.mode === 'import') return;

      this.busy = true;
      try {
        const ratio = store.raster.height / store.raster.width;
        const w = this.gridSize;
        const h = Math.max(1, Math.round(w * ratio));

        const p = Core.convertPhoto(store.raster, {
          targetWidth: w,
          targetHeight: h,
          colorCount: this.colorCount,
          series: store.series,
          setCodes: params.setCodes,
        });

        pattern = p;
        store.pattern = p;
        store.params = {
          mode: params.mode,
          gridSize: w,
          colorCount: this.colorCount,
          setCodes: params.setCodes,
          detectedGrid: params.detectedGrid,
        };

        backup = null;
        this.denoised = false;
        this.refreshInfo();
        await this.render();
      } catch (err) {
        uni.showToast({ title: '重新生成失败', icon: 'none' });
      } finally {
        this.busy = false;
      }
    },

    // ---------- 去杂质 ----------

    async toggleDenoise() {
      if (!pattern) return;

      if (backup) {
        pattern = rebuild(backup.cells.slice(), backup.palette, backup.avgDelta);
        backup = null;
        this.denoised = false;
        this.refreshInfo();
        this.render();
        uni.showToast({ title: '已恢复', icon: 'none' });
        return;
      }

      uni.showLoading({ title: '清理中', mask: true });
      setTimeout(() => {
        try {
          const snapshot = {
            cells: pattern.cells.slice(),
            palette: pattern.palette.map((p) => ({ ...p })),
            avgDelta: pattern.stats.avgDelta,
          };

          const r = Core.removeSpeckles(pattern.cells, pattern.width, pattern.height, pattern.palette, {
            minArea: 6,
            maxDelta: 12,
          });

          pattern = rebuild(pattern.cells, pattern.palette, snapshot.avgDelta);
          backup = snapshot;
          this.denoised = true;
          this.refreshInfo();
          this.render();

          uni.hideLoading();
          uni.showToast({
            title: r.changed > 0 ? '清掉 ' + r.regions + ' 处杂色' : '没发现杂色',
            icon: 'none',
          });
        } catch (e) {
          uni.hideLoading();
          uni.showToast({ title: '清理失败', icon: 'none' });
        }
      }, 50);
    },

    refreshInfo() {
      const s = pattern.stats;
      this.boardCount = Math.max(
        1,
        Math.ceil(pattern.width / 29) * Math.ceil(pattern.height / 29),
      );
      this.info = [
        pattern.width + ' × ' + pattern.height,
        s.colorCount + ' 色',
        s.total.toLocaleString() + ' 颗',
        s.widthCm + ' × ' + s.heightCm + ' cm',
        s.boardsTotal + ' 块板',
      ].join(' · ');
    },

    goUsage() {
      uni.navigateTo({ url: '/pages/usage/index' });
    },

    // ---------- 保存 ----------

    async saveImage() {
      if (!pattern) return;
      uni.showLoading({ title: '导出中', mask: true });

      try {
        const cell = 14;
        const w = pattern.width;
        const h = pattern.height;
        const pxW = w * cell;
        const pxH = h * cell;

        const canvas = createOffscreenCanvas(pxW, pxH);
        if (!canvas) throw new Error('离屏画布不可用');
        canvas.width = pxW;
        canvas.height = pxH;

        const ctx = canvas.getContext('2d');
        drawPattern(ctx, pattern, cell, this.showCode, this.showBoard);

        const src = await exportCanvas(canvas, pxW, pxH);

        // #ifdef MP-WEIXIN
        await new Promise((resolve, reject) => {
          uni.saveImageToPhotosAlbum({
            filePath: src,
            success: resolve,
            fail: reject,
          });
        });
        uni.hideLoading();
        uni.showToast({ title: '已保存到相册' });
        // #endif

        // #ifdef H5
        const a = document.createElement('a');
        a.href = src;
        a.download = 'pindou-' + w + 'x' + h + '.png';
        a.click();
        uni.hideLoading();
        // #endif
      } catch (e) {
        uni.hideLoading();
        uni.showToast({ title: '保存失败', icon: 'none' });
      }
    },
  },
};

// ---------- 导出 ----------

/** 把 canvas 转成可直接给 <image> 用的地址 */
function exportCanvas(canvas, w, h) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: w,
      height: h,
      destWidth: w,
      destHeight: h,
      success: (r) => resolve(r.tempFilePath),
      fail: reject,
    });
    // #endif

    // #ifdef H5
    resolve(canvas.toDataURL('image/png'));
    // #endif
  });
}

// ---------- 绘制 ----------

function rebuild(cells, palette, avgDelta) {
  const p = Core.createPattern(
    pattern.width,
    pattern.height,
    cells,
    palette.map((x) => ({ ...x })),
    { mode: pattern.mode, beadSize: pattern.beadSize, seriesId: pattern.seriesId },
  );
  p.stats.avgDelta = avgDelta;
  return p;
}

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

function drawPattern(ctx, p, cell, showCode, showBoard, region) {
  const rx = region ? region.x : 0;
  const ry = region ? region.y : 0;
  const rw = region ? region.w : p.width;
  const rh = region ? region.h : p.height;

  const cw = rw * cell;
  const ch = rh * cell;
  const palette = p.palette;
  const cells = p.cells;
  const W = p.width;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cw, ch);

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const idx = cells[(ry + y) * W + (rx + x)];
      if (idx === EMPTY_CELL) continue;
      ctx.fillStyle = palette[idx].hex;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  if (cell >= 5) {
    ctx.strokeStyle = 'rgba(0,0,0,.07)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= rw; x++) {
      ctx.moveTo(x * cell + 0.25, 0);
      ctx.lineTo(x * cell + 0.25, ch);
    }
    for (let y = 0; y <= rh; y++) {
      ctx.moveTo(0, y * cell + 0.25);
      ctx.lineTo(cw, y * cell + 0.25);
    }
    ctx.stroke();
  }

  // 分板线只在整图模式画：单板模式本身只显示一块，再画线没意义
  if (showBoard && !region && cell >= 3) {
    ctx.strokeStyle = 'rgba(255,122,69,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 29; x < W; x += 29) {
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, ch);
    }
    for (let y = 29; y < p.height; y += 29) {
      ctx.moveTo(0, y * cell);
      ctx.lineTo(cw, y * cell);
    }
    ctx.stroke();
  }

  // 阈值从 14 降到 9：单板视图下每格 10px 左右，刚好能看清
  if (showCode && cell >= 9) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.max(6, Math.min(cell * 0.46, 11));
    ctx.font = '600 ' + fs + 'px monospace';
    const colorCache = {};
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const idx = cells[(ry + y) * W + (rx + x)];
        if (idx === EMPTY_CELL) continue;
        let tc = colorCache[idx];
        if (!tc) {
          tc = isDark(palette[idx].hex) ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.68)';
          colorCache[idx] = tc;
        }
        ctx.fillStyle = tc;
        ctx.fillText(palette[idx].code, x * cell + cell / 2, y * cell + cell / 2 + 0.5);
      }
    }
  }
}
</script>

<style>
.wrap {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 32rpx;
  background: #fff;
}
.info {
  flex: 1;
  font-size: 22rpx;
  color: var(--ink-2);
  line-height: 1.5;
}
.denoise {
  flex-shrink: 0;
  padding: 12rpx 26rpx;
  border-radius: 24rpx;
  background: var(--brand-soft);
  color: var(--brand-deep);
  font-size: 24rpx;
  font-weight: 500;
}
.denoise.on {
  background: #f0ece6;
  color: var(--ink-2);
}

.stage {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
  overflow: hidden;
  background: var(--bg);
}
.ma {
  width: 100%;
  height: 100%;
}
.mv {
  display: flex;
  align-items: center;
  justify-content: center;
}
.cv {
  width: 100%;
  height: 100%;
  border-radius: 16rpx;
  background: #fff;
  box-shadow: 0 8rpx 32rpx rgba(28, 27, 26, 0.1);
}
/* 小程序 canvas 是原生组件，z-index 管不住它，弹窗时只能把它挪走 */
.cv-hidden {
  opacity: 0;
  visibility: hidden;
  transform: translateY(-140%);
  pointer-events: none;
}

.exp-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 100px;
  height: 100px;
}

.tools {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 20rpx rgba(28, 27, 26, 0.05);
}
.tool {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.tool-ico {
  width: 68rpx;
  height: 68rpx;
  border-radius: 22rpx;
  background: #f4f1ec;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  color: var(--ink-2);
  transition: all 0.18s ease;
}
.tool-t {
  font-size: 21rpx;
  color: var(--ink-3);
}
.tool.on .tool-ico {
  background: var(--brand-soft);
  color: var(--brand-deep);
}
.tool.on .tool-t {
  color: var(--brand-deep);
  font-weight: 500;
}
.tool.primary .tool-ico {
  background: linear-gradient(135deg, #ff7d4d 0%, #ff5f28 100%);
  color: #fff;
  box-shadow: 0 6rpx 16rpx rgba(255, 107, 53, 0.3);
}
.tool.primary .tool-t {
  color: var(--brand-deep);
  font-weight: 500;
}
/* ---- 板号切换 ---- */
.boardbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28rpx;
  padding: 16rpx 32rpx;
  background: #fff;
  border-top: 1rpx solid var(--line);
}
.bbtn {
  width: 60rpx;
  height: 60rpx;
  border-radius: 18rpx;
  background: #f4f1ec;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 38rpx;
  line-height: 1;
  color: var(--ink-2);
}
.bbtn.dis {
  color: #d8d2c9;
}
.binfo {
  font-size: 25rpx;
  color: var(--ink-2);
  min-width: 200rpx;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* ---- 顶栏按钮 ---- */
.tbtn {
  flex-shrink: 0;
  padding: 12rpx 24rpx;
  border-radius: 24rpx;
  background: #f4f1ec;
  color: var(--ink-2);
  font-size: 24rpx;
}

/* ---- 参数面板 ---- */
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(28, 27, 26, 0.38);
  z-index: 100;
}
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 101;
  background: #fff;
  border-radius: 36rpx 36rpx 0 0;
  padding: 16rpx 32rpx calc(28rpx + env(safe-area-inset-bottom));
  min-height: 520rpx;
  transform: translateY(110%);
  transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
}
.sheet.open {
  transform: translateY(0);
}
.sheet-grip {
  width: 72rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background: #e2ddd5;
  margin: 0 auto 22rpx;
}
.sheet-head {
  display: flex;
  align-items: center;
  margin-bottom: 6rpx;
}
.sheet-title {
  font-size: 32rpx;
  font-weight: 600;
}
.sheet-done {
  margin-left: auto;
  font-size: 26rpx;
  color: var(--brand-deep);
  font-weight: 500;
}
.sp {
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--line);
}
.sp:last-of-type {
  border-bottom: none;
}
.sp-row {
  display: flex;
  align-items: center;
  min-height: 96rpx;
}
.sp-label {
  font-size: 28rpx;
  color: var(--ink);
  font-weight: 500;
}
.stepper {
  margin-left: auto;
  display: flex;
  align-items: center;
  background: #f4f1ec;
  border-radius: 22rpx;
  padding: 5rpx;
}
.step-btn {
  width: 68rpx;
  height: 68rpx;
  border-radius: 18rpx;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  line-height: 1;
  color: var(--ink-2);
  box-shadow: 0 1rpx 4rpx rgba(28, 27, 26, 0.08);
}
.step-btn.dis {
  color: #d8d2c9;
  box-shadow: none;
}
.step-val {
  min-width: 104rpx;
  text-align: center;
  font-size: 30rpx;
  font-weight: 600;
}
.sp-hint {
  font-size: 22rpx;
  color: var(--ink-3);
}
.sp-tip {
  font-size: 21rpx;
  color: var(--ink-3);
  text-align: center;
  padding: 20rpx 0 4rpx;
}
</style>
