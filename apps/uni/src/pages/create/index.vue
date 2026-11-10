<template>
  <view class="page">
    <!-- 未选图 -->
    <block v-if="!imagePath">
      <view class="hero">
        <view class="t-hero">把照片</view>
        <view class="t-hero">变成拼豆图纸</view>
        <view class="hero-sub">自动配色 · 出色号 · 算用量</view>
      </view>

      <view class="upload" @tap="chooseImage">
        <view class="upload-plus">
          <view class="plus-h"></view>
          <view class="plus-v"></view>
        </view>
        <view class="upload-title">选择一张图片</view>
        <view class="upload-sub">照片或像素图都行</view>
      </view>

      <view class="features">
        <view class="feature">
          <view class="dot"></view>
          <view class="feature-body">
            <text class="feature-t">照片模式</text>
            <text class="feature-s">自动配色，适合人像、宠物、风景</text>
          </view>
        </view>
        <view class="feature">
          <view class="dot dot-alt"></view>
          <view class="feature-body">
            <text class="feature-t">直接导入</text>
            <text class="feature-s">像素图 1:1 还原，不改一个像素</text>
          </view>
        </view>
        <view class="feature">
          <view class="dot dot-ok"></view>
          <view class="feature-body">
            <text class="feature-t">全程本地</text>
            <text class="feature-s">图片不上传、不联网</text>
          </view>
        </view>
      </view>
    </block>

    <!-- 已选图 -->
    <block v-else>
      <view class="preview" @tap="chooseImage">
        <image class="preview-img" :src="imagePath" mode="aspectFill" />
        <view class="preview-top">
          <view class="preview-badge">{{ imgW }} × {{ imgH }}</view>
          <view class="preview-change">换一张</view>
        </view>
      </view>

      <view class="ratio-row">
        <view class="ratio" :class="{ on: ratio === 'orig' }" data-r="orig" @tap="selectRatio">原图</view>
        <view class="ratio" :class="{ on: ratio === '1:1' }" data-r="1:1" @tap="selectRatio">1:1</view>
        <view class="ratio" :class="{ on: ratio === '4:3' }" data-r="4:3" @tap="selectRatio">4:3</view>
        <view class="ratio" :class="{ on: ratio === '3:4' }" data-r="3:4" @tap="selectRatio">3:4</view>
      </view>

      <view v-if="notice" class="notice" :class="noticeType">{{ notice }}</view>

      <view class="seg" style="margin-top: 24rpx">
        <view class="seg-item" :class="{ on: mode === 'auto' }" data-mode="auto" @tap="setMode">自动</view>
        <view class="seg-item" :class="{ on: mode === 'photo' }" data-mode="photo" @tap="setMode">照片</view>
        <view class="seg-item" :class="{ on: mode === 'import' }" data-mode="import" @tap="setMode">导入</view>
      </view>

      <view class="card section">
        <view class="param">
          <view class="param-head">
            <text class="param-label">格数</text>
            <text class="param-value">{{ gridW }} × {{ gridH }}</text>
          </view>
          <view class="slider-row">
            <slider class="sl" :min="12" :max="300" :value="gridSize" :disabled="importLocked" activeColor="#FF6B35" backgroundColor="#EDE8E1" block-size="20" @changing="onGridChanging" @change="onGridChange" />
          </view>
          <view class="param-hint">{{ sizeHint }}</view>
        </view>

        <view class="param">
          <view class="param-head">
            <text class="param-label">色数</text>
            <text class="param-value">{{ colorCount }}</text>
          </view>
          <view class="slider-row">
            <slider class="sl" :min="2" :max="colorMax" :value="colorCount" :disabled="importLocked" activeColor="#FF6B35" backgroundColor="#EDE8E1" block-size="20" @changing="onColorChanging" @change="onColorChange" />
          </view>
          <view class="param-hint">{{ colorHint }}</view>
        </view>

        <view class="param">
          <view class="param-head">
            <text class="param-label">去除背景</text>
            <switch class="sw" :checked="removeBg" color="#FF6B35" @change="onToggleBg" />
          </view>
          <view class="param-hint">{{ bgHint }}</view>
        </view>

        <view class="param">
          <view class="param-head">
            <text class="param-label">套装</text>
          </view>
          <picker :range="setNames" :value="setIndex" @change="onSetChange">
            <view class="picker">
              <text>{{ setNames[setIndex] }}</text>
              <text class="chev">›</text>
            </view>
          </picker>
          <view class="param-hint">只在套装内选色，套装外的会在用量里标「补」</view>
        </view>
      </view>

      <button class="btn-primary section" :class="{ disabled: generating }" :disabled="generating" @tap="generate">
        {{ generating ? '生成中…' : '生成图纸' }}
      </button>
      <view v-if="timing" class="timing">{{ timing }}</view>
    </block>
  </view>
</template>

<script>
import * as Core from '@/common/core.js';
import store from '@/common/store.js';
import { createOffscreenCanvas } from '@/common/canvas.js';

const DEFAULT_GRID = 58;
const DEFAULT_COLORS = 24;
const MAX_SIDE = 2048;

// 非响应式数据：图上有几万个像素，放进 data 会被 Vue 代理，卡到不能用
let raster = null;
let analysis = null;
let detectedGrid = 0;
let originalRaster = null;
let bgMask = null;

export default {
  data() {
    return {
      imagePath: '',
      ratio: 'orig',
      removeBg: true,
      bgHint: '',
      imgW: 0,
      imgH: 0,

      mode: 'auto',
      notice: '',
      noticeType: '',

      gridSize: DEFAULT_GRID,
      gridW: DEFAULT_GRID,
      gridH: DEFAULT_GRID,
      colorCount: DEFAULT_COLORS,
      colorMax: 221,
      colorHint: '目标色数。照片本身没有那么多可分辨色调时，实际会更少',
      importLocked: false,
      sizeHint: '',

      setIndex: 0,
      setNames: ['不限（全部色号）'],

      generating: false,
      timing: '',
    };
  },

  onLoad() {
    raster = null;
    analysis = null;
    detectedGrid = 0;

    const s = store.series;
    const names = ['不限（全部 ' + s.colors.length + ' 色）'];
    (s.sets || []).forEach((x) => {
      names.push(x.name + '（' + x.codes.length + ' 色）');
    });

    // 恢复上次选的套装
    let idx = 0;
    if (store.setId) {
      const i = (s.sets || []).findIndex((x) => x.id === store.setId);
      if (i >= 0) idx = i + 1;
    }

    this.setNames = names;
    this.setIndex = idx;
    this.colorMax = s.colors.length;
    this.updateSizeHint();
  },

  methods: {
    // ---------- 选图 ----------

    chooseImage() {
      uni.chooseImage({
        count: 1,
        sizeType: ['original'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const path = res.tempFilePaths[0];
          this.imagePath = path;
          this.decodeImage(path);
        },
      });
    },

    async decodeImage(path) {
      uni.showLoading({ title: '读取中', mask: true });
      try {
        const canvas = createOffscreenCanvas(1, 1);
        if (!canvas) throw new Error('当前微信基础库不支持离屏画布，请在开发者工具里把调试基础库调到 2.16.1 以上');

        const ctx = canvas.getContext('2d');
        const img = canvas.createImage ? canvas.createImage() : new Image();

        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('图片解码超时（8 秒）')), 8000);
          img.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timer);
            reject(new Error('图片解码失败，换一张试试'));
          };
          img.src = path;
        });

        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        let imgData;
        try {
          imgData = ctx.getImageData(0, 0, w, h);
        } catch (err) {
          throw new Error('读取像素失败：' + (err && err.message ? err.message : 'getImageData 异常'));
        }
        if (!imgData || !imgData.data || imgData.data.length === 0) {
          throw new Error('像素数据为空，图片可能未真正解码');
        }

        raster = { width: w, height: h, data: imgData.data };
        originalRaster = raster;

        try {
          analysis = Core.analyzeImage(raster);
        } catch (e) {
          analysis = { colorCount: 0, grid: null, suggestMode: 'photo', reason: '分析失败，按照片处理' };
        }
        detectedGrid = analysis.grid ? analysis.grid.gridSize : 0;

        this.imgW = w;
        this.imgH = h;

        if (analysis.suggestMode === 'import' && analysis.grid) {
          this.gridSize = analysis.grid.width;
        }

        this.applyMode();
        this.updateSizeHint();
        uni.hideLoading();
      } catch (e) {
        uni.hideLoading();
        uni.showModal({
          title: '读取图片失败',
          content: (e && e.message ? e.message : String(e)) || '未知错误',
          showCancel: false,
        });
      }
    },

    // ---------- 模式 ----------

    setMode(e) {
      this.mode = e.currentTarget.dataset.mode;
      this.applyMode();
    },

    realMode() {
      if (this.mode !== 'auto') return this.mode;
      if (analysis && analysis.suggestMode) return analysis.suggestMode;
      return 'photo';
    },

    selectRatio(e) {
      const r = e.currentTarget.dataset.r;
      if (r === this.ratio) return;
      this.ratio = r;
      this.applyRatio();
    },

    applyRatio() {
      if (!originalRaster) return;
      const src = originalRaster;

      let img;
      if (this.ratio === 'orig') {
        img = src;
      } else {
        const map = { '1:1': [1, 1], '4:3': [4, 3], '3:4': [3, 4] };
        const pair = map[this.ratio] || [1, 1];
        img = Core.cropToRatio(src, pair[0], pair[1]);
      }

      raster = img;
      try {
        analysis = Core.analyzeImage(raster);
      } catch (err) {
        analysis = { colorCount: 0, grid: null, suggestMode: 'photo', reason: '分析失败，按照片处理' };
      }
      detectedGrid = analysis.grid ? analysis.grid.gridSize : 0;

      this.imgW = img.width;
      this.imgH = img.height;
      this.applyMode();
      this.updateSizeHint();
    },

    applyMode() {
      const real = this.realMode();
      let notice = '';
      let noticeType = '';

      if (analysis) {
        if (real === 'import') {
          const g = analysis.grid;
          const where = g ? g.width + ' × ' + g.height + ' 格（每格 ' + g.gridSize + 'px）' : '未能识别格数';
          notice = '像素图 1:1 还原：' + where + '。不改色、不去噪、不抖动。';
          noticeType = 'ok';
        } else {
          notice = '按照片处理：' + analysis.reason;
          noticeType = '';
        }
      }

      // 导入模式下格数由识别结果决定，滑块锁住
      const locked = real === 'import' && !!detectedGrid;
      if (locked && analysis.grid) {
        this.gridSize = analysis.grid.width;
      }

      this.notice = notice;
      this.noticeType = noticeType;
      this.importLocked = locked;
      this.updateSizeHint();
      this.computeBgMask();
    },

    computeBgMask() {
      bgMask = null;
      if (!this.removeBg || !raster) {
        this.bgHint = this.removeBg ? '' : '已关闭，背景会照常生成';
        return;
      }
      try {
        const r = Core.removeBackground(raster);
        if (r.ok) {
          bgMask = r.mask;
          this.bgHint = '已剔除 ' + Math.round(r.ratio * 100) + '% 的背景，这些格子不摆豆';
        } else {
          this.bgHint = (r.reason || '没识别出背景') + '，保留完整画面';
        }
      } catch (e) {
        this.bgHint = '背景识别失败，保留完整画面';
      }
    },

    onToggleBg(e) {
      this.removeBg = e.detail.value;
      this.computeBgMask();
    },

    // ---------- 参数 ----------

    onGridChanging(e) {
      this.gridSize = e.detail.value;
    },

    onGridChange(e) {
      this.gridSize = e.detail.value;
      this.updateSizeHint();
    },

    onColorChanging(e) {
      this.colorCount = e.detail.value;
    },

    onColorChange(e) {
      this.colorCount = e.detail.value;
    },

    onSetChange(e) {
      const idx = Number(e.detail.value);
      const sets = store.series.sets || [];
      const set = idx > 0 ? sets[idx - 1] : null;
      const size = set ? set.codes.length : 0;

      this.setIndex = idx;
      this.colorMax = size ? Math.min(221, size) : store.series.colors.length;
      if (size && this.colorCount > size) this.colorCount = size;

      store.setId = set ? set.id : '';
      try {
        uni.setStorageSync('pindou.prefs', { setId: store.setId });
      } catch (e) {
        // 忽略
      }
    },

    updateSizeHint() {
      const real = this.realMode();
      let w = this.gridSize;
      let h = w;

      if (real === 'import' && analysis && analysis.grid) {
        w = analysis.grid.width;
        h = analysis.grid.height;
      } else {
        const ratio = raster ? raster.height / raster.width : 1;
        h = Math.max(1, Math.round(w * ratio));
      }

      const cmW = ((w * 5) / 10).toFixed(1);
      const cmH = ((h * 5) / 10).toFixed(1);
      const rec = Math.max(4, Math.min(64, Math.round(w * 0.4)));

      this.gridW = w;
      this.gridH = h;
      this.sizeHint = '5mm 豆 · 成品约 ' + cmW + ' × ' + cmH + ' cm · 建议 ' + rec + ' 色';
    },

    // ---------- 生成 ----------

    getSetCodes() {
      const idx = this.setIndex;
      if (idx <= 0) return undefined;
      const set = (store.series.sets || [])[idx - 1];
      return set ? set.codes : undefined;
    },

    generate() {
      if (!raster || this.generating) return;

      this.generating = true;
      this.timing = '';

      // 延迟一帧，先让「生成中」渲染出来
      setTimeout(() => {
        const t0 = Date.now();
        try {
          const real = this.realMode();
          let pattern;

          if (real === 'import') {
            const gs =
              detectedGrid || Math.max(1, Math.round(raster.width / this.gridSize));
            pattern = Core.convertImport(raster, {
              gridSize: gs,
              series: store.series,
              setCodes: this.getSetCodes(),
            });
          } else {
            const ratio = raster.height / raster.width;
            const w = this.gridSize;
            const h = Math.max(1, Math.round(w * ratio));
            pattern = Core.convertPhoto(raster, {
              targetWidth: w,
              targetHeight: h,
              colorCount: this.colorCount,
              series: store.series,
              setCodes: this.getSetCodes(),
            });
          }

          store.pattern = pattern;
          store.raster = raster;
          store.params = {
            mode: real,
            gridSize: this.gridSize,
            colorCount: this.colorCount,
            setCodes: this.getSetCodes(),
            detectedGrid: detectedGrid,
          };
          this.timing = '生成完成 · 耗时 ' + (Date.now() - t0) + ' ms';
          uni.navigateTo({ url: '/pages/preview/index' });
        } catch (err) {
          this.timing = '生成失败：' + (err && err.message ? err.message : '未知错误');
        } finally {
          this.generating = false;
        }
      }, 60);
    },
  },
};
</script>

<style>
.hero {
  padding: 48rpx 8rpx 44rpx;
}
.hero-sub {
  margin-top: 18rpx;
  font-size: 26rpx;
  color: var(--ink-3);
}

.upload {
  height: 400rpx;
  background: #fff;
  border-radius: 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 28rpx rgba(28, 27, 26, 0.06);
}
.upload-plus {
  width: 112rpx;
  height: 112rpx;
  border-radius: 36rpx;
  background: var(--brand-soft);
  position: relative;
  margin-bottom: 26rpx;
}
.plus-h,
.plus-v {
  position: absolute;
  background: var(--brand);
  border-radius: 4rpx;
}
.plus-h {
  width: 40rpx;
  height: 5rpx;
  left: 36rpx;
  top: 53rpx;
}
.plus-v {
  width: 5rpx;
  height: 40rpx;
  left: 53rpx;
  top: 36rpx;
}
.upload-title {
  font-size: 32rpx;
  font-weight: 600;
}
.upload-sub {
  font-size: 24rpx;
  color: var(--ink-3);
  margin-top: 8rpx;
}

.features {
  margin-top: 36rpx;
}
.feature {
  display: flex;
  align-items: flex-start;
  padding: 22rpx 8rpx;
}
.dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--brand);
  margin: 13rpx 20rpx 0 0;
  flex-shrink: 0;
}
.dot-alt {
  background: #4f8ef7;
}
.dot-ok {
  background: var(--ok);
}
.feature-body {
  display: flex;
  flex-direction: column;
}
.feature-t {
  font-size: 27rpx;
  font-weight: 500;
}
.feature-s {
  font-size: 23rpx;
  color: var(--ink-3);
  margin-top: 4rpx;
}

.preview {
  position: relative;
  height: 420rpx;
  border-radius: 36rpx;
  overflow: hidden;
  background: #e8e4dd;
  box-shadow: 0 6rpx 28rpx rgba(28, 27, 26, 0.08);
}
.preview-img {
  width: 100%;
  height: 100%;
}
.preview-top {
  position: absolute;
  left: 20rpx;
  right: 20rpx;
  top: 20rpx;
  display: flex;
  justify-content: space-between;
}
.preview-badge,
.preview-change {
  background: rgba(28, 27, 26, 0.55);
  color: #fff;
  font-size: 21rpx;
  padding: 8rpx 18rpx;
  border-radius: 20rpx;
}

.ratio-row {
  display: flex;
  gap: 12rpx;
  margin-top: 20rpx;
}
.ratio {
  flex: 1;
  text-align: center;
  padding: 17rpx 0;
  border-radius: 18rpx;
  background: #fff;
  font-size: 25rpx;
  color: var(--ink-2);
  box-shadow: 0 1rpx 8rpx rgba(28, 27, 26, 0.05);
}
.ratio.on {
  background: var(--brand-soft);
  color: var(--brand-deep);
  font-weight: 600;
}

.timing {
  text-align: center;
  font-size: 22rpx;
  color: var(--ink-3);
  margin-top: 20rpx;
}
</style>
