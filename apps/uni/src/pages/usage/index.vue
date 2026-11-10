<template>
  <view class="page" v-if="!empty">
    <view class="stats">
      <view class="stat" v-for="s in statList" :key="s.k">
        <text class="k">{{ s.k }}</text>
        <text class="v">{{ s.v }}<text class="u">{{ s.u }}</text></text>
      </view>
    </view>

    <view class="label" style="margin-top: 34rpx">
      <text>{{ summary }}</text>
      <text class="flag" v-if="restock > 0">{{ restock }} 色需补货</text>
    </view>

    <view class="list">
      <view class="row" v-for="item in items" :key="item.code">
        <view class="sw" :style="{ background: item.hex }"></view>
        <text class="code">{{ item.code }}</text>
        <text class="name">{{ item.name }}</text>
        <text class="need" v-if="item.owned === false">补</text>
        <text class="cnt">{{ item.count }}</text>
      </view>
    </view>

    <view class="disclose">
      色值与色号来自公开资料整理，非品牌官方测量。屏幕显示与实物豆存在色差，不同批次亦有轻微差异。大批量采购前建议先看商家实物色卡。
    </view>

    <button class="btn-primary copybtn" @tap="copyList">复制清单</button>
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

    this.items = pattern.palette;
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
  border: 1rpx solid #e7e1d7;
  border-radius: 20rpx;
  padding: 22rpx 24rpx;
  display: flex;
  flex-direction: column;
}
.stat .k {
  font-size: 21rpx;
  color: #9c978e;
  margin-bottom: 8rpx;
}
.stat .v {
  font-size: 40rpx;
  font-weight: 500;
  line-height: 1.1;
}
.stat .u {
  font-size: 22rpx;
  font-weight: 400;
  color: #9c978e;
  margin-left: 6rpx;
}

.label .flag {
  margin-left: auto;
  color: #c9501f;
  font-size: 22rpx;
}

.list {
  background: #fff;
  border: 1rpx solid #e7e1d7;
  border-radius: 22rpx;
  overflow: hidden;
}
.row {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  border-bottom: 1rpx solid #f2ede4;
}
.row:last-child {
  border-bottom: none;
}
.sw {
  width: 44rpx;
  height: 44rpx;
  border-radius: 10rpx;
  border: 1rpx solid rgba(0, 0, 0, 0.1);
  margin-right: 18rpx;
}
.code {
  width: 80rpx;
  font-size: 26rpx;
  font-weight: 500;
}
.name {
  flex: 1;
  font-size: 23rpx;
  color: #6b6760;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.need {
  font-size: 19rpx;
  color: #854f0b;
  background: #faeeda;
  border-radius: 8rpx;
  padding: 2rpx 10rpx;
  margin-right: 12rpx;
}
.cnt {
  font-size: 26rpx;
  font-weight: 500;
  min-width: 70rpx;
  text-align: right;
}

.disclose {
  margin-top: 28rpx;
  font-size: 20rpx;
  color: #9c978e;
  line-height: 1.7;
  background: #f7f4ee;
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
}

.copybtn {
  margin-top: 30rpx;
}

.empty {
  padding: 200rpx 0;
  text-align: center;
  color: #9c978e;
  font-size: 26rpx;
}
</style>
