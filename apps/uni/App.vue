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
/* 全局样式：各页面共用，避免每个页面重复一遍 */
page {
  background-color: #faf7f2;
  color: #2c2c2a;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
  font-size: 28rpx;
  -webkit-font-smoothing: antialiased;
}

view,
text,
button,
input,
scroll-view {
  box-sizing: border-box;
}

.page {
  min-height: 100vh;
  padding: 24rpx 30rpx 40rpx;
}

.section {
  margin-bottom: 30rpx;
}

.label {
  display: flex;
  align-items: center;
  font-size: 22rpx;
  color: #9c978e;
  margin-bottom: 14rpx;
}
.label .val {
  margin-left: auto;
  color: #2c2c2a;
  font-size: 26rpx;
  font-weight: 500;
}

.sub {
  font-size: 21rpx;
  color: #9c978e;
  line-height: 1.55;
  margin-top: 10rpx;
}

.notice {
  font-size: 22rpx;
  line-height: 1.55;
  background: #faeeda;
  color: #7a4e0c;
  border-radius: 16rpx;
  padding: 18rpx 22rpx;
  margin-top: 16rpx;
}
.notice.ok {
  background: #e1f5ee;
  color: #0f6e56;
}

.btn-primary {
  width: 100%;
  height: 94rpx;
  line-height: 94rpx;
  border-radius: 22rpx;
  background: #ff7a45;
  color: #fff;
  font-size: 30rpx;
  font-weight: 500;
  border: none;
  padding: 0;
  text-align: center;
}
.btn-primary.disabled {
  background: #e9e4db;
  color: #a9a39a;
}
.btn-primary::after {
  border: none;
}

.btn-ghost {
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 20rpx;
  background: #fff;
  border: 1rpx solid #e7e1d7;
  color: #6b6760;
  font-size: 27rpx;
  padding: 0;
  margin: 0;
  text-align: center;
}
.btn-ghost::after {
  border: none;
}

.slider-row {
  display: flex;
  align-items: center;
  margin-top: 12rpx;
}
.slider-row .sl {
  flex: 1;
  margin: 0 20rpx 0 0;
}
.slider-val {
  width: 76rpx;
  text-align: right;
  font-size: 27rpx;
  font-weight: 500;
}
</style>
