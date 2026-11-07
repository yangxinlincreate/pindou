Page({
  data: {
    colors: [],
    selected: null,
  },

  onLoad() {
    const series = getApp().globalData.series;
    this.setData({
      colors: series.colors.map((c) => ({
        code: c.code,
        hex: c.hex,
        name: c.name || '',
      })),
    });
  },

  pick(e) {
    const i = e.currentTarget.dataset.i;
    this.setData({ selected: this.data.colors[i] });
  },
});
