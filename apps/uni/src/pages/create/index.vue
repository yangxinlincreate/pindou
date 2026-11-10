<template>
  <view class="page">
    <!-- 未选图 -->
    <view v-if="!imagePath" class="section">
      <view class="up" @tap="chooseImage">
        <view class="upico"><text class="uparrow">↑</text></view>
        <view class="uptit">选择图片</view>
        <view class="upsub">照片或像素图都行 · 图片不会上传</view>
      </view>

      <view class="tips">
        <view class="tip">· 照片模式：自动配色，适合人像、宠物、风景</view>
        <view class="tip">· 直接导入：像素图 1:1 还原，不改变任何一个像素</view>
      </view>
    </view>

    <!-- 已选图 -->
    <view v-else>
      <view class="preview" @tap="chooseImage">
        <image class="pvimg" :src="imagePath" mode="aspectFit" />
        <view class="pvinfo">{{ imgW }} × {{ imgH }} px · 点击换图</view>
      </view>

      <view v-if="notice" class="notice" :class="noticeType">{{ notice }}</view>

      <view class="section" style="margin-top: 26rpx">
        <view class="label">转换模式</view>
        <view class="seg">
          <view class="segitem" :class="{ on: mode === 'auto' }" data-mode="auto" @tap="setMode">自动判断</view>
          <view class="segitem" :class="{ on: mode === 'photo' }" data-mode="photo" @tap="setMode">照片</view>
          <view class="segitem" :class="{ on: mode === 'import' }" data-mode="import" @tap="setMode">直接导入</view>
        </view>
      </view>

      <view class="section">
        <view class="label">
          <text>格数</text>
          <text class="val">{{ gridW }} × {{ gridH }}</text>
        </view>
        <view class="slider-row">
          <slider
            class="sl"
            :min="12"
            :max="300"
            :value="gridSize"
            :disabled="importLocked"
            activeColor="#FF7A45"
            backgroundColor="#EDE7DD"
            block-size="18"
            @changing="onGridChanging"
            @change="onGridChange"
          />
          <text class="slider-val">{{ gridSize }}</text>
        </view>
        <view class="sub">{{ sizeHint }}</view>
      </view>

      <view class="section">
        <view class="label">
          <text>色数</text>
          <text class="val">{{ colorCount }}</text>
        </view>
        <view class="slider-row">
          <slider
            class="sl"
            :min="2"
            :max="colorMax"
            :value="colorCount"
            :disabled="importLocked"
            activeColor="#FF7A45"
            backgroundColor="#EDE7DD"
            block-size="18"
            @changing="onColorChanging"
            @change="onColorChange"
          />
          <text class="slider-val">{{ colorCount }}</text>
        </view>
        <view class="sub">{{ colorHint }}</view>
      </view>

      <view class="section">
        <view class="label"><text>套装限制</text></view>
        <picker :range="setNames" :value="setIndex" @change="onSetChange">
          <view class="picker">
            <text>{{ setNames[setIndex] }}</text>
            <text class="picker-arrow">›</text>
          </view>
        </picker>
        <view class="sub">选了套装，生成时只会用套装里的颜色</view>
      </view>

      <button class="btn-primary" :class="{ disabled: generating }" :disabled="generating" @tap="generate">
        {{ generating ? '生成中…' : '生成图纸' }}
      </button>
      <view v-if="timing" class="timing">{{ timing }}</view>
    </view>
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

export default {
  data() {
    return {
      imagePath: '',
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
.work-canvas {
  position: fixed;
  left: -9999rpx;
  top: 0;
  width: 300px;
  height: 300px;
}

.up {
  height: 420rpx;
  border: 3rpx dashed #dcd5c9;
  border-radius: 26rpx;
  background: #fcfaf6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.upico {
  width: 96rpx;
  height: 96rpx;
  border-radius: 26rpx;
  background: #fff;
  border: 1rpx solid #e7e1d7;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
}
.uparrow {
  font-size: 44rpx;
  color: #ff7a45;
  line-height: 1;
}
.uptit {
  font-size: 29rpx;
  font-weight: 500;
  color: #2c2c2a;
}
.upsub {
  font-size: 22rpx;
  color: #9c978e;
  margin-top: 8rpx;
}

.tips {
  margin-top: 34rpx;
  padding: 0 8rpx;
}
.tip {
  font-size: 22rpx;
  color: #9c978e;
  line-height: 1.9;
}

.preview {
  position: relative;
  height: 380rpx;
  border-radius: 22rpx;
  overflow: hidden;
  background: #efe9e0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pvimg {
  width: 100%;
  height: 100%;
}
.pvinfo {
  position: absolute;
  left: 16rpx;
  bottom: 16rpx;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 10rpx;
  padding: 6rpx 14rpx;
  font-size: 20rpx;
  color: #6b6760;
}

.seg {
  display: flex;
  background: #f3efe7;
  border-radius: 18rpx;
  padding: 6rpx;
}
.segitem {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 14rpx;
  font-size: 24rpx;
  color: #6b6760;
}
.segitem.on {
  background: #fff;
  color: #2c2c2a;
  font-weight: 500;
}

.picker {
  height: 88rpx;
  background: #fff;
  border: 1rpx solid #e7e1d7;
  border-radius: 18rpx;
  padding: 0 26rpx;
  display: flex;
  align-items: center;
  font-size: 26rpx;
  color: #2c2c2a;
}
.picker-arrow {
  margin-left: auto;
  color: #9c978e;
  font-size: 32rpx;
}

.timing {
  text-align: center;
  font-size: 21rpx;
  color: #9c978e;
  margin-top: 20rpx;
}
</style>
