Page({
  data: {
    items: [],
    stats: null,
    summary: '',
    empty: false,
  },

  pattern: null,

  onLoad() {
    const pattern = getApp().globalData.pattern;
    if (!pattern) {
      this.setData({ empty: true });
      return;
    }
    this.pattern = pattern;

    const s = pattern.stats;
    this.setData({
      stats: s,
      items: pattern.palette,
      summary: `${pattern.width} × ${pattern.height} 格 · ${s.colorCount} 色`,
    });
  },

  copyList() {
    const pattern = this.pattern;
    if (!pattern) return;

    const app = getApp();
    const brand = app.globalData.series.brandName;
    const lines = [
      `${brand} · ${pattern.width}×${pattern.height} · 共 ${pattern.stats.total} 颗`,
      '',
    ];
    pattern.palette.forEach((p) => {
      const flag = p.owned === false ? ' (需补货)' : '';
      lines.push(`${p.code}\t${p.count} 颗${flag}`);
    });

    wx.setClipboardData({
      data: lines.join('\n'),
      success() {
        wx.showToast({ title: '清单已复制' });
      },
    });
  },
});
