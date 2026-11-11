<script>
import store from './common/store.js';

export default {
  onLaunch() {
    // 记住上次选的套装
    try {
      const saved = uni.getStorageSync('pindou.prefs');
      if (saved && saved.setId) {
        store.setId = saved.setId;
      }
    } catch (e) {
      // 忽略
    }
  },
};
</script>

<style>
/* ============ 设计变量 ============ */
page {
  --ink: #1c1b1a;
  --ink-2: #5c5852;
  --ink-3: #9a948c;
  --line: #efeae3;
  --bg: #f6f4f0;
  --card: #ffffff;
  --brand: #ff6b35;
  --brand-deep: #e1541f;
  --brand-soft: #fff0ea;
  --ok: #0ea47a;
  --ok-soft: #e7f7f1;
  --warn: #d97706;
  --warn-soft: #fdf3e3;

  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 28rpx;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

view,
text,
button,
input,
scroll-view,
slider,
picker {
  box-sizing: border-box;
}

/* ============ H5 端宽度约束 ============ */
/* #ifdef H5 */
html,
body,
uni-app,
uni-page,
uni-page-body {
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
}
/* #endif */

/* ============ 布局 ============ */
.page {
  width: 100%;
  min-height: 100vh;
  padding: 32rpx 32rpx 48rpx;
  overflow-x: hidden;
}

.card {
  background: var(--card);
  border-radius: 32rpx;
  padding: 8rpx 32rpx;
  box-shadow: 0 2rpx 16rpx rgba(28, 27, 26, 0.05);
}

.section {
  margin-top: 32rpx;
}

.section-title {
  font-size: 24rpx;
  color: var(--ink-3);
  padding: 0 8rpx 16rpx;
  letter-spacing: 0.02em;
}

/* ============ 文字 ============ */
.t-hero {
  font-size: 52rpx;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.t-title {
  font-size: 34rpx;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.t-sub {
  font-size: 24rpx;
  color: var(--ink-3);
  line-height: 1.6;
}
.num {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

/* ============ 按钮 ============ */
.btn-primary {
  width: 100%;
  height: 104rpx;
  line-height: 104rpx;
  border-radius: 28rpx;
  background: linear-gradient(135deg, #ff7d4d 0%, #ff5f28 100%);
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: none;
  padding: 0;
  text-align: center;
  box-shadow: 0 12rpx 28rpx rgba(255, 107, 53, 0.3);
}
.btn-primary::after {
  border: none;
}
.btn-primary.disabled {
  background: #e6e1d9;
  color: #b3aca2;
  box-shadow: none;
}

.btn-ghost {
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 24rpx;
  background: #fff;
  color: var(--ink-2);
  font-size: 28rpx;
  padding: 0;
  margin: 0;
  text-align: center;
  box-shadow: 0 2rpx 12rpx rgba(28, 27, 26, 0.05);
}
.btn-ghost::after {
  border: none;
}

/* ============ 分段控件 ============ */
.seg {
  display: flex;
  background: #ece8e1;
  border-radius: 24rpx;
  padding: 6rpx;
  gap: 4rpx;
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  border-radius: 19rpx;
  font-size: 26rpx;
  color: var(--ink-2);
  transition: all 0.18s ease;
}
.seg-item.on {
  background: #fff;
  color: var(--ink);
  font-weight: 600;
  box-shadow: 0 2rpx 8rpx rgba(28, 27, 26, 0.09);
}

/* ============ 参数行 ============ */
.param {
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--line);
}
.param:last-child {
  border-bottom: none;
}
.param-head {
  display: flex;
  align-items: baseline;
  margin-bottom: 8rpx;
}
.param-label {
  font-size: 28rpx;
  color: var(--ink);
  font-weight: 500;
}
.param-value {
  margin-left: auto;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.param-hint {
  font-size: 22rpx;
  color: var(--ink-3);
  line-height: 1.5;
  margin-top: 4rpx;
}

/* ============ 滑块 ============ */
.slider-row {
  display: flex;
  align-items: center;
  margin: 8rpx 0 0;
}
.slider-row .sl {
  flex: 1;
  margin: 0;
}

/* ============ 选择器 ============ */
.picker {
  height: 96rpx;
  background: #faf8f5;
  border-radius: 20rpx;
  padding: 0 26rpx;
  display: flex;
  align-items: center;
  font-size: 27rpx;
  color: var(--ink);
}
.chev {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 34rpx;
  line-height: 1;
}

/* ============ 提示条 ============ */
.notice {
  font-size: 23rpx;
  line-height: 1.6;
  background: var(--warn-soft);
  color: #8a5a03;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  margin-top: 20rpx;
}
.notice.ok {
  background: var(--ok-soft);
  color: #0a6b50;
}
</style>
