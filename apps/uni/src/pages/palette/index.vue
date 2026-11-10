<template>
  <view class="wrap">
    <view class="detail">
      <block v-if="selected">
        <view class="bigsw" :style="{ background: selected.hex }"></view>
        <view class="dinfo">
          <view class="dcode num">{{ selected.code }}</view>
          <view class="dname">{{ selected.name || '未命名' }}</view>
          <view class="dhex num">{{ selected.hex }}</view>
        </view>
      </block>
      <view v-else class="hint">点下方色块查看色号</view>
    </view>

    <scroll-view scroll-y class="scroll">
      <view class="grid">
        <view class="cell" v-for="(c, i) in colors" :key="c.code" @tap="pick(i)">
          <view class="sw" :class="{ active: selected && selected.code === c.code }" :style="{ background: c.hex }"></view>
          <text class="code num">{{ c.code }}</text>
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
  background: var(--bg);
}

.detail {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 28rpx 32rpx 32rpx;
  min-height: 200rpx;
}
.bigsw {
  width: 120rpx;
  height: 120rpx;
  border-radius: 32rpx;
  margin-right: 28rpx;
  box-shadow: inset 0 0 0 1rpx rgba(0, 0, 0, 0.06), 0 6rpx 20rpx rgba(28, 27, 26, 0.1);
}
.dinfo {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.dcode {
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
}
.dname {
  font-size: 25rpx;
  color: var(--ink-2);
}
.dhex {
  font-size: 22rpx;
  color: var(--ink-3);
}
.hint {
  font-size: 25rpx;
  color: var(--ink-3);
}

.scroll {
  flex: 1;
  min-height: 0;
  padding: 0 26rpx 40rpx;
}

.grid {
  display: flex;
  flex-wrap: wrap;
}
.cell {
  width: 20%;
  padding: 7rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.sw {
  width: 100%;
  padding-top: 100%;
  border-radius: 18rpx;
  box-shadow: inset 0 0 0 1rpx rgba(0, 0, 0, 0.06);
  transition: transform 0.15s ease;
}
.sw.active {
  box-shadow: inset 0 0 0 1rpx rgba(0, 0, 0, 0.06), 0 0 0 4rpx var(--brand);
}
.code {
  font-size: 19rpx;
  color: var(--ink-3);
  margin-top: 8rpx;
}

.disclose {
  margin: 28rpx 8rpx 0;
  font-size: 21rpx;
  color: var(--ink-3);
  line-height: 1.7;
}
</style>
