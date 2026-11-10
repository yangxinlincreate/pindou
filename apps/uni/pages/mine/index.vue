<template>
  <view class="page">
    <view class="card">
      <view class="row">
        <text class="k">当前色卡</text>
        <text class="v">{{ brandName }} {{ colorCount }} 色</text>
      </view>
      <view class="row">
        <text class="k">数据版本</text>
        <text class="v">{{ version }}</text>
      </view>
      <view class="row">
        <text class="k">色值来源</text>
        <text class="v">社区采样</text>
      </view>
    </view>

    <view class="section" style="margin-top: 30rpx">
      <view class="label">我的套装</view>
      <picker :range="setNames" :value="setIndex" @change="onSetChange">
        <view class="picker">
          <text>{{ setNames[setIndex] }}</text>
          <text class="picker-arrow">›</text>
        </view>
      </picker>
      <view class="sub">选好后，做图时会只用套装内的颜色，套装外需求在用量清单标「需补货」。</view>
    </view>

    <view class="notice">
      色值与色号来自公开资料整理，非品牌官方测量。屏幕显示与实物豆存在色差，不同批次亦有轻微差异。大批量采购前建议先查看商家实物色卡。
    </view>

    <view class="source">
      色卡数据：Craft Color Codes（CC BY 4.0）· 上游来源 peiseka.com、pixel-beads.com · 社区采样，非仪器实测
    </view>

    <view class="section" style="margin-top: 34rpx">
      <view class="label">帮助与反馈</view>

      <!-- #ifdef MP-WEIXIN -->
      <button class="btn-ghost wide" open-type="contact">色号纠错 / 意见反馈</button>
      <!-- #endif -->

      <!-- #ifdef H5 -->
      <button class="btn-ghost wide" @tap="copyContact">复制反馈邮箱</button>
      <!-- #endif -->
    </view>

    <view class="section">
      <view class="label">其他</view>
      <view class="linkrow" @tap="clearCache">
        <text>清除本地设置</text>
        <text class="arrow">›</text>
      </view>
    </view>

    <view class="footer">
      <text>拼豆图纸 v0.1 · 原图不出设备</text>
    </view>
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
.card {
  background: #fff;
  border: 1rpx solid #e7e1d7;
  border-radius: 22rpx;
  padding: 6rpx 28rpx;
}
.row {
  display: flex;
  align-items: center;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #f2ede4;
}
.row:last-child {
  border-bottom: none;
}
.row .k {
  font-size: 26rpx;
  color: #6b6760;
}
.row .v {
  margin-left: auto;
  font-size: 26rpx;
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
}
.picker-arrow {
  margin-left: auto;
  color: #9c978e;
  font-size: 32rpx;
}

.btn-ghost.wide {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
}

.linkrow {
  height: 92rpx;
  background: #fff;
  border: 1rpx solid #e7e1d7;
  border-radius: 18rpx;
  padding: 0 26rpx;
  display: flex;
  align-items: center;
  font-size: 26rpx;
}
.linkrow .arrow {
  margin-left: auto;
  color: #9c978e;
}

.source {
  margin-top: 18rpx;
  font-size: 19rpx;
  color: #b4afa6;
  line-height: 1.7;
  padding: 0 8rpx;
}

.footer {
  margin-top: 60rpx;
  text-align: center;
  font-size: 20rpx;
  color: #c4bfb6;
}
</style>
