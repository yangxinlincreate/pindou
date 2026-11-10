<template>
  <view class="wrap">
    <view class="bar">
      <text class="info">{{ info }}</text>
      <view class="denoise" :class="{ on: denoised }" @tap="toggleDenoise">
        {{ denoised ? '撤销' : '去杂质' }}
      </view>
    </view>

    <view class="stage" id="stage">
      <canvas type="2d" id="cv" class="cv"></canvas>
    </view>

    <!-- 导出专用的离屏画布 -->
    <canvas type="2d" id="exp" class="exp-canvas"></canvas>

    <view class="tools">
      <view class="tool" :class="{ on: showBoard }" @tap="toggleBoard">
        <text class="tico">▦</text>
        <text class="tlabel">分板</text>
      </view>
      <view class="tool" :class="{ on: showCode }" @tap="toggleCode">
        <text class="tico">A1</text>
        <text class="tlabel">色号</text>
      </view>
      <view class="tool" @tap="goUsage">
        <text class="tico">≡</text>
        <text class="tlabel">用量</text>
      </view>
      <view class="tool save" @tap="saveImage">
        <text class="tico">↓</text>
        <text class="tlabel">保存</text>
      </view>
    </view>
  </view>
</template>

<script>
import * as Core from '@/common/core.js';
import store from '@/common/store.js';
import { getBoxSize, getCanvasNode, getPixelRatio } from '@/common/canvas.js';

const EMPTY_CELL = 255;

let pattern = null;
let backup = null;
let canvasReady = false;

export default {
  data() {
    return {
      info: '',
      showCode: true,
      showBoard: false,
      denoised: false,
      empty: false,
    };
  },

  onLoad() {
    pattern = store.pattern;
    backup = null;
    canvasReady = false;

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
        const canvas = await getCanvasNode('#cv');
        const box = await getBoxSize('#stage');
        const ctx = canvas.getContext('2d');

        const pad = 16;
        const maxW = Math.max(160, box.width - pad * 2);
        const maxH = Math.max(160, box.height - pad * 2);
        const w = pattern.width;
        const h = pattern.height;
        const cell = Math.max(2, Math.floor(Math.min(maxW / w, maxH / h)));

        const cw = cell * w;
        const ch = cell * h;
        const dpr = getPixelRatio();

        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPattern(ctx, pattern, cell, this.showCode, this.showBoard);
        canvasReady = true;
      } catch (e) {
        console.error('render failed', e);
      }
    },

    toggleCode() {
      this.showCode = !this.showCode;
      this.render();
    },

    toggleBoard() {
      this.showBoard = !this.showBoard;
      this.render();
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

        const canvas = await getCanvasNode('#exp');
        const ctx = canvas.getContext('2d');
        canvas.width = w * cell;
        canvas.height = h * cell;
        drawPattern(ctx, pattern, cell, this.showCode, this.showBoard);

        // #ifdef MP-WEIXIN
        await new Promise((resolve, reject) => {
          uni.canvasToTempFilePath({
            canvas,
            x: 0,
            y: 0,
            width: w * cell,
            height: h * cell,
            destWidth: w * cell,
            destHeight: h * cell,
            success: resolve,
            fail: reject,
          });
        }).then((r) => {
          return new Promise((resolve, reject) => {
            uni.saveImageToPhotosAlbum({
              filePath: r.tempFilePath,
              success: resolve,
              fail: reject,
            });
          });
        });

        uni.hideLoading();
        uni.showToast({ title: '已保存到相册' });
        // #endif

        // #ifdef H5
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
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

function drawPattern(ctx, p, cell, showCode, showBoard) {
  const w = p.width;
  const h = p.height;
  const cw = w * cell;
  const ch = h * cell;
  const palette = p.palette;
  const cells = p.cells;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cw, ch);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = cells[y * w + x];
      if (idx === EMPTY_CELL) continue;
      ctx.fillStyle = palette[idx].hex;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  if (cell >= 5) {
    ctx.strokeStyle = 'rgba(0,0,0,.07)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      ctx.moveTo(x * cell + 0.25, 0);
      ctx.lineTo(x * cell + 0.25, ch);
    }
    for (let y = 0; y <= h; y++) {
      ctx.moveTo(0, y * cell + 0.25);
      ctx.lineTo(cw, y * cell + 0.25);
    }
    ctx.stroke();
  }

  if (showBoard && cell >= 3) {
    ctx.strokeStyle = 'rgba(255,122,69,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 29; x < w; x += 29) {
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, ch);
    }
    for (let y = 29; y < h; y += 29) {
      ctx.moveTo(0, y * cell);
      ctx.lineTo(cw, y * cell);
    }
    ctx.stroke();
  }

  if (showCode && cell >= 14) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.max(7, Math.min(cell * 0.42, 11));
    ctx.font = '500 ' + fs + 'px monospace';
    const colorCache = {};
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = cells[y * w + x];
        if (idx === EMPTY_CELL) continue;
        let tc = colorCache[idx];
        if (!tc) {
          tc = isDark(palette[idx].hex) ? 'rgba(255,255,255,.82)' : 'rgba(0,0,0,.62)';
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
  background: #faf7f2;
}

.bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 16rpx 30rpx;
  font-size: 22rpx;
  color: #6b6760;
  border-bottom: 1rpx solid #f2ede4;
  background: #fff;
}
.bar .info {
  flex: 1;
}
.denoise {
  flex-shrink: 0;
  margin-left: 16rpx;
  padding: 8rpx 20rpx;
  border-radius: 20rpx;
  background: #fff;
  border: 1rpx solid #e7e1d7;
  color: #c9501f;
  font-size: 21rpx;
}
.denoise.on {
  background: #ffede5;
  border-color: #ffc9b3;
}

.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 16rpx;
}
.cv {
  box-shadow: 0 4rpx 24rpx rgba(70, 50, 30, 0.1);
  border-radius: 8rpx;
}

.exp-canvas {
  position: fixed;
  left: -9999rpx;
  top: 0;
  width: 100px;
  height: 100px;
}

.tools {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 14rpx 20rpx calc(14rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #f2ede4;
}
.tool {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8rpx 0;
  color: #6b6760;
}
.tool.on {
  color: #c9501f;
}
.tool.on .tico {
  background: #ffede5;
  color: #c9501f;
}
.tico {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  background: #f3efe7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: #6b6760;
  margin-bottom: 6rpx;
}
.tlabel {
  font-size: 20rpx;
}
.tool.save .tico {
  background: #ff7a45;
  color: #fff;
}
.tool.save {
  color: #c9501f;
  font-weight: 500;
}
</style>
