<template>
  <view class="page" v-if="!empty">
    <view class="stats">
      <view class="stat" v-for="s in statList" :key="s.k">
        <text class="stat-v num">{{ s.v }}<text class="stat-u">{{ s.u }}</text></text>
        <text class="stat-k">{{ s.k }}</text>
      </view>
    </view>

    <view class="list-head">
      <text class="list-title">色号清单</text>
      <text class="list-sub">{{ summary }}</text>
    </view>

    <view class="list">
      <view class="row" v-for="item in items" :key="item.code">
        <view class="sw" :style="{ background: item.hex }"></view>
        <view class="row-main">
          <view class="row-top">
            <text class="code num">{{ item.code }}</text>
            <text class="name">{{ item.name }}</text>
            <text class="need" v-if="item.owned === false">补</text>
            <text class="cnt num">{{ item.count }}</text>
          </view>
          <view class="bar">
            <view class="bar-in" :style="{ width: item.pct + '%', background: item.hex }"></view>
          </view>
        </view>
      </view>
    </view>

    <view class="disclose">
      色值与色号来自公开资料整理，非品牌官方测量。屏幕显示与实物豆存在色差，不同批次亦有轻微差异。
    </view>

    <button class="btn-primary copy" @tap="copyList">复制清单</button>
  </view>

  <view class="page" v-else>
    <view class="empty">还没有生成的图纸</view>
  </view>
</template>

<script>
import store from '@/common/store.js';

let pattern = null;

export default {
  data() {
    return {
      items: [],
      statList: [],
      summary: '',
      restock: 0,
      empty: false,
    };
  },

  onLoad() {
    pattern = store.pattern;
    if (!pattern) {
      this.empty = true;
      return;
    }

    const s = pattern.stats;

    const maxCount = pattern.palette.reduce((m, p) => Math.max(m, p.count), 1);
    this.items = pattern.palette.map((p) => ({
      code: p.code,
      name: p.name,
      hex: p.hex,
      count: p.count,
      owned: p.owned,
      pct: Math.max(6, Math.round((p.count / maxCount) * 100)),
    }));
    this.restock = s.restockCount;
    this.summary = pattern.width + ' × ' + pattern.height + ' 格 · ' + s.colorCount + ' 色';
    this.statList = [
      { k: '总颗数', v: s.total.toLocaleString(), u: '颗' },
      { k: '用色', v: s.colorCount, u: '色' },
      { k: '底板', v: s.boardsTotal, u: '块' },
      { k: '成品', v: s.widthCm, u: 'cm' },
    ];
  },

  methods: {
    copyList() {
      if (!pattern) return;

      const brand = store.series.brandName;
      const lines = [
        brand + ' · ' + pattern.width + '×' + pattern.height + ' · 共 ' + pattern.stats.total + ' 颗',
        '',
      ];
      pattern.palette.forEach((p) => {
        lines.push(p.code + '\t' + p.count + ' 颗' + (p.owned === false ? ' (需补货)' : ''));
      });

      uni.setClipboardData({
        data: lines.join('\n'),
        success: () => {
          uni.showToast({ title: '清单已复制' });
        },
      });
    },
  },
};
</script>

<style>
.stats {
  display: flex;
  flex-wrap: wrap;
  margin: -8rpx;
}
.stat {
  width: calc(50% - 16rpx);
  margin: 8rpx;
  background: #fff;
  border-radius: 28rpx;
  padding: 28rpx 30rpx;
  display: flex;
  flex-direction: column-reverse;
  gap: 6rpx;
  box-shadow: 0 2rpx 16rpx rgba(28, 27, 26, 0.05);
}
.stat-v {
  font-size: 52rpx;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.stat-u {
  font-size: 24rpx;
  font-weight: 400;
  color: var(--ink-3);
  margin-left: 6rpx;
  letter-spacing: 0;
}
.stat-k {
  font-size: 23rpx;
  color: var(--ink-3);
}

.list-head {
  display: flex;
  align-items: baseline;
  padding: 40rpx 8rpx 18rpx;
}
.list-title {
  font-size: 32rpx;
  font-weight: 600;
}
.list-sub {
  margin-left: auto;
  font-size: 22rpx;
  color: var(--ink-3);
}

.list {
  background: #fff;
  border-radius: 32rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 16rpx rgba(28, 27, 26, 0.05);
}
.row {
  display: flex;
  align-items: center;
  padding: 24rpx 28rpx;
  border-bottom: 1rpx solid var(--line);
}
.row:last-child {
  border-bottom: none;
}
.sw {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  margin-right: 22rpx;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1rpx rgba(0, 0, 0, 0.06);
}
.row-main {
  flex: 1;
  min-width: 0;
}
.row-top {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}
.code {
  font-size: 28rpx;
  font-weight: 600;
  width: 76rpx;
}
.name {
  flex: 1;
  font-size: 23rpx;
  color: var(--ink-3);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.need {
  font-size: 19rpx;
  color: #8a5a03;
  background: var(--warn-soft);
  border-radius: 8rpx;
  padding: 3rpx 10rpx;
}
.cnt {
  font-size: 28rpx;
  font-weight: 600;
}
.bar {
  height: 8rpx;
  background: #f2efe9;
  border-radius: 4rpx;
  margin-top: 14rpx;
  overflow: hidden;
}
.bar-in {
  height: 100%;
  border-radius: 4rpx;
  opacity: 0.85;
}

.disclose {
  margin-top: 32rpx;
  font-size: 21rpx;
  color: var(--ink-3);
  line-height: 1.7;
  background: #f0ece6;
  border-radius: 20rpx;
  padding: 22rpx 26rpx;
}

.copy {
  margin-top: 32rpx;
}

.empty {
  padding: 240rpx 0;
  text-align: center;
  color: var(--ink-3);
  font-size: 26rpx;
}
</style>
