<template>
  <view class="page">
    <view class="head">
      <view class="head-title">{{ brandName }} {{ colorCount }} 色</view>
      <view class="head-sub">数据版本 {{ version }} · 社区采样</view>
    </view>

    <view class="section-title">我的套装</view>
    <view class="card">
      <picker :range="setNames" :value="setIndex" @change="onSetChange">
        <view class="line">
          <text class="line-label">当前套装</text>
          <text class="line-value">{{ setNames[setIndex] }}</text>
          <text class="chev">›</text>
        </view>
      </picker>
      <view class="tip">做图时只会用套装内的颜色，套装外需求会在用量里标「补」</view>
    </view>

    <view class="section-title">数据说明</view>
    <view class="card">
      <view class="line">
        <text class="line-label">色卡来源</text>
        <text class="line-value dim">Craft Color Codes</text>
      </view>
      <view class="line">
        <text class="line-label">许可协议</text>
        <text class="line-value dim">CC BY 4.0</text>
      </view>
      <view class="line last">
        <text class="line-label">采集方式</text>
        <text class="line-value dim">社区采样，非仪器实测</text>
      </view>
    </view>

    <view class="notice">
      色值与色号来自公开资料整理，非品牌官方测量。屏幕显示与实物豆存在色差，不同批次亦有轻微差异。大批量采购前建议先看商家实物色卡。
    </view>

    <!-- #ifdef MP-WEIXIN -->
    <button class="btn-ghost wide" style="margin-top: 32rpx" open-type="contact">色号纠错 / 意见反馈</button>
    <!-- #endif -->
    <!-- #ifdef H5 -->
    <button class="btn-ghost wide" style="margin-top: 32rpx" @tap="copyContact">复制反馈邮箱</button>
    <!-- #endif -->

    <button class="btn-ghost wide" style="margin-top: 20rpx" @tap="clearCache">清除本地设置</button>

    <view class="footer">拼豆图纸 v0.1 · 原图不出设备</view>
  </view>
</template>

<script>
import store from '@/common/store.js';

export default {
  data() {
    return {
      brandName: '',
      colorCount: 0,
      version: '',
      setNames: ['不限（全部色号）'],
      setIndex: 0,
    };
  },

  onLoad() {
    const s = store.series;

    const names = ['不限（全部 ' + s.colors.length + ' 色）'];
    (s.sets || []).forEach((x) => {
      names.push(x.name + '（' + x.codes.length + ' 色）');
    });

    let idx = 0;
    if (store.setId) {
      const i = (s.sets || []).findIndex((x) => x.id === store.setId);
      if (i >= 0) idx = i + 1;
    }

    this.brandName = s.brandName;
    this.colorCount = s.colors.length;
    this.version = s.version;
    this.setNames = names;
    this.setIndex = idx;
  },

  methods: {
    onSetChange(e) {
      const idx = Number(e.detail.value);
      const sets = store.series.sets || [];
      const set = idx > 0 ? sets[idx - 1] : null;

      this.setIndex = idx;
      store.setId = set ? set.id : '';

      try {
        uni.setStorageSync('pindou.prefs', { setId: store.setId });
      } catch (err) {
        // 忽略
      }
    },

    copyContact() {
      uni.setClipboardData({
        data: 'feedback@pindou.local',
        success: () => uni.showToast({ title: '邮箱已复制' }),
      });
    },

    clearCache() {
      try {
        uni.removeStorageSync('pindou.prefs');
        store.setId = '';
        this.setIndex = 0;
        uni.showToast({ title: '已清除' });
      } catch (e) {
        // 忽略
      }
    },
  },
};
</script>

<style>
.head {
  padding: 40rpx 8rpx 16rpx;
}
.head-title {
  font-size: 48rpx;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.head-sub {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--ink-3);
}

.line {
  display: flex;
  align-items: center;
  min-height: 104rpx;
  border-bottom: 1rpx solid var(--line);
}
.line.last,
.line:last-child {
  border-bottom: none;
}
.line-label {
  font-size: 28rpx;
  color: var(--ink);
}
.line-value {
  margin-left: auto;
  font-size: 28rpx;
  font-weight: 500;
  max-width: 62%;
  text-align: right;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.line-value.dim {
  font-size: 25rpx;
  font-weight: 400;
  color: var(--ink-3);
}
.tip {
  font-size: 22rpx;
  color: var(--ink-3);
  line-height: 1.55;
  padding: 0 0 24rpx;
}

.btn-ghost.wide {
  width: 100%;
}

.footer {
  margin-top: 56rpx;
  text-align: center;
  font-size: 21rpx;
  color: #bdb6ac;
}
</style>
