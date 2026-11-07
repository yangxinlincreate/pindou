const series = require('./data/mard-221.js');

App({
  globalData: {
    /** 当前色卡（MARD 221） */
    series,
    /** 生成好的图纸，在页面之间传递（含 Uint8Array，不能走 setData） */
    pattern: null,
    /** 用户选中的套装 id，空表示不限 */
    setCodes: null,
  },

  onLaunch() {
    // 记住上次的色卡与套装选择
    try {
      const saved = wx.getStorageSync('pindou.prefs');
      if (saved && saved.setId) {
        const set = (series.sets || []).find((s) => s.id === saved.setId);
        if (set) this.globalData.setCodes = set.codes;
      }
    } catch (e) {
      // 忽略
    }
  },
});
