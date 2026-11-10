<template>
  <view class="wrap">
    <view class="detail">
      <template v-if="selected">
        <view class="bigsw" :style="{ background: selected.hex }"></view>
        <view class="dinfo">
          <view class="dcode">{{ selected.code }}</view>
          <view class="dname">{{ selected.name }}</view>
          <view class="dhex">{{ selected.hex }}</view>
        </view>
      </template>
      <view v-else class="dempty">点下方色块查看色号</view>
    </view>

    <scroll-view scroll-y class="scroll">
      <view class="grid">
        <view class="cell" v-for="(c, i) in colors" :key="c.code" @tap="pick(i)">
          <view class="sw" :style="{ background: c.hex }"></view>
          <text class="code">{{ c.code }}</text>
        </view>
      </view>

      <view class="disclose">
        色值与色号来自公开资料整理，非品牌官方测量。屏幕显示与实物豆存在色差，且不同批次会有轻微差异。
      </view>
    </scroll-view>
  </view>
</template>

<script>
import store from '@/common/store.js';

export default {
  data() {
    return {
      colors: [],
      selected: null,
    };
  },

  onLoad() {
    const s = store.series;
    this.colors = s.colors.map((c) => ({
      code: c.code,
      hex: c.hex,
      name: c.name || '',
    }));
  },

  methods: {
    pick(i) {
      this.selected = this.colors[i];
    },
  },
};
</script>

<style>
.wrap {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #faf7f2;
}

.detail {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background: #fff;
  border-bottom: 1rpx solid #f2ede4;
  padding: 24rpx 30rpx;
  min-height: 150rpx;
}
.bigsw {
  width: 104rpx;
  height: 104rpx;
  border-radius: 20rpx;
  border: 1rpx solid rgba(0, 0, 0, 0.1);
  margin-right: 26rpx;
}
.dinfo {
  display: flex;
  flex-direction: column;
}
.dcode {
  font-size: 38rpx;
  font-weight: 500;
  line-height: 1.2;
}
.dname {
  font-size: 24rpx;
  color: #6b6760;
  margin-top: 4rpx;
}
.dhex {
  font-size: 21rpx;
  color: #9c978e;
  margin-top: 4rpx;
}
.dempty {
  font-size: 24rpx;
  color: #9c978e;
}

.scroll {
  flex: 1;
  min-height: 0;
  padding: 20rpx 24rpx 40rpx;
  box-sizing: border-box;
}

.grid {
  display: flex;
  flex-wrap: wrap;
}
.cell {
  width: 16.66%;
  padding: 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}
.sw {
  width: 100%;
  padding-top: 100%;
  border-radius: 12rpx;
  border: 1rpx solid rgba(0, 0, 0, 0.08);
}
.code {
  font-size: 19rpx;
  color: #6b6760;
  margin-top: 6rpx;
}

.disclose {
  margin: 30rpx 8rpx 0;
  font-size: 20rpx;
  color: #9c978e;
  line-height: 1.7;
}
</style>
