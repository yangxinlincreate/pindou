Page({
  data: {
    brandName: '',
    colorCount: 0,
    version: '',
    setNames: ['不限（全部色号）'],
    setIndex: 0,
  },

  onLoad() {
    const app = getApp();
    const series = app.globalData.series;

    const names = ['不限（全部 ' + series.colors.length + ' 色）'];
    (series.sets || []).forEach(function (s) {
      names.push(s.name + '（' + s.codes.length + ' 色）');
    });

    let idx = 0;
    try {
      const saved = wx.getStorageSync('pindou.prefs');
      if (saved && saved.setId) {
        const i = (series.sets || []).findIndex((s) => s.id === saved.setId);
        if (i >= 0) idx = i + 1;
      }
    } catch (e) {
      // 忽略
    }

    this.setData({
      brandName: series.brandName,
      colorCount: series.colors.length,
      version: series.version,
      setNames: names,
      setIndex: idx,
    });
  },

  onSetChange(e) {
    const idx = Number(e.detail.value);
    const series = getApp().globalData.series;
    this.setData({ setIndex: idx });

    const set = idx > 0 ? (series.sets || [])[idx - 1] : null;
    getApp().globalData.setCodes = set ? set.codes : null;

    try {
      wx.setStorageSync('pindou.prefs', { setId: set ? set.id : '' });
    } catch (e) {
      // 忽略
    }
  },

  clearCache() {
    wx.removeStorage({ key: 'pindou.prefs' });
    wx.showToast({ title: '已清除' });
  },
});
