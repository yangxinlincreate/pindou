const core = require('../../core/core.js');

const DEFAULT_GRID = 58;
const DEFAULT_COLORS = 24;
const MAX_SIDE = 2048;

Page({
  data: {
    imagePath: '',
    imgW: 0,
    imgH: 0,

    mode: 'auto',
    realMode: 'photo',
    notice: '',
    noticeType: '',

    gridSize: DEFAULT_GRID,
    gridW: DEFAULT_GRID,
    gridH: DEFAULT_GRID,
    colorCount: DEFAULT_COLORS,
    colorMax: 64,
    importLocked: false,
    sizeHint: '',

    setIndex: 0,
    setNames: ['不限（全部色号）'],

    generating: false,
    timing: '',
  },

  /** 非响应式数据放 this 上，避免大数组走 setData */
  raster: null,
  analysis: null,
  detectedGrid: 0,

  onLoad() {
    const app = getApp();
    const series = app.globalData.series;
    const names = ['不限（全部 ' + series.colors.length + ' 色）'];
    (series.sets || []).forEach(function (s) {
      names.push(s.name + '（' + s.codes.length + ' 色）');
    });
    this.setData({ setNames: names });
    this.updateSizeHint();
  },

  // ---------- 选图 ----------

  chooseImage() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original'],
      success(res) {
        const path = res.tempFiles[0].tempFilePath;
        that.setData({ imagePath: path });
        that.decodeImage(path);
      },
    });
  },

  decodeImage(path) {
    const that = this;
    wx.showLoading({ title: '读取中', mask: true });

    const query = wx.createSelectorQuery();
    query
      .select('#work')
      .fields({ node: true })
      .exec(function (res) {
        if (!res[0] || !res[0].node) {
          wx.hideLoading();
          wx.showToast({ title: '画布初始化失败', icon: 'none' });
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const img = canvas.createImage();

        img.onload = function () {
          const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));

          canvas.width = w;
          canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          let imageData;
          try {
            imageData = ctx.getImageData(0, 0, w, h);
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '像素读取失败', icon: 'none' });
            return;
          }

          const raster = { width: w, height: h, data: imageData.data };
          that.raster = raster;

          let analysis;
          try {
            analysis = core.analyzeImage(raster);
          } catch (err) {
            analysis = { colorCount: 0, grid: null, suggestMode: 'photo', reason: '分析失败，按照片处理' };
          }
          that.analysis = analysis;
          that.detectedGrid = analysis.grid ? analysis.grid.gridSize : 0;

          const patch = {
            imgW: w,
            imgH: h,
          };

          // 识别成像素图时，把格数设成识别的值
          if (analysis.suggestMode === 'import' && analysis.grid) {
            patch.gridSize = analysis.grid.width;
          }

          that.setData(patch, function () {
            that.applyMode();
            that.updateSizeHint();
            wx.hideLoading();
          });
        };

        img.onerror = function () {
          wx.hideLoading();
          wx.showToast({ title: '图片读取失败', icon: 'none' });
        };

        img.src = path;
      });
  },

  // ---------- 模式 ----------

  setMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ mode: mode }, () => this.applyMode());
  },

  realMode() {
    if (this.data.mode !== 'auto') return this.data.mode;
    if (this.analysis && this.analysis.suggestMode) return this.analysis.suggestMode;
    return 'photo';
  },

  applyMode() {
    const real = this.realMode();
    const a = this.analysis;
    let notice = '';
    let noticeType = '';

    if (a) {
      if (real === 'import') {
        const g = a.grid;
        const where = g ? g.width + ' × ' + g.height + ' 格（每格 ' + g.gridSize + 'px）' : '未能识别格数';
        notice = '像素图 1:1 还原：' + where + '。不改色、不去噪、不抖动。';
        noticeType = 'ok';
      } else {
        notice = '按照片处理：' + a.reason;
        noticeType = '';
      }
    }

    this.setData({
      realMode: real,
      notice: notice,
      noticeType: noticeType,
      importLocked: real === 'import' && !!this.detectedGrid,
    });
    this.updateSizeHint();
  },

  // ---------- 参数 ----------

  onGridChanging(e) {
    this.setData({ gridSize: e.detail.value });
  },

  onGridChange(e) {
    this.setData({ gridSize: e.detail.value }, () => this.updateSizeHint());
  },

  onColorChanging(e) {
    this.setData({ colorCount: e.detail.value });
  },

  onColorChange(e) {
    this.setData({ colorCount: e.detail.value });
  },

  onSetChange(e) {
    const idx = Number(e.detail.value);
    const series = getApp().globalData.series;
    const set = idx > 0 ? (series.sets || [])[idx - 1] : null;
    const size = set ? set.codes.length : 0;

    const patch = {
      setIndex: idx,
      colorMax: size ? Math.min(221, size) : 221,
    };
    // 套装色数少于当前设定时，收紧到套装上限
    if (size && this.data.colorCount > size) {
      patch.colorCount = size;
    }

    this.setData(patch);
  },

  updateSizeHint() {
    const real = this.realMode();
    let w = this.data.gridSize;
    let h = w;

    if (real === 'import' && this.analysis && this.analysis.grid) {
      w = this.analysis.grid.width;
      h = this.analysis.grid.height;
    } else {
      const ratio = this.raster ? this.raster.height / this.raster.width : 1;
      h = Math.max(1, Math.round(w * ratio));
    }

    const cmW = ((w * 5) / 10).toFixed(1);
    const cmH = ((h * 5) / 10).toFixed(1);
    // 格数与色数的经验配比：大约每格 0.4 色
    const rec = Math.max(4, Math.min(64, Math.round(w * 0.4)));

    this.setData({
      gridW: w,
      gridH: h,
      sizeHint: '5mm 豆 · 成品约 ' + cmW + ' × ' + cmH + ' cm · 建议 ' + rec + ' 色',
    });
  },

  // ---------- 生成 ----------

  getSetCodes() {
    const series = getApp().globalData.series;
    const idx = this.data.setIndex;
    if (idx <= 0) return undefined;
    const set = (series.sets || [])[idx - 1];
    return set ? set.codes : undefined;
  },

  generate() {
    if (!this.raster || this.data.generating) return;

    const that = this;
    const series = getApp().globalData.series;
    const setCodes = this.getSetCodes();
    const real = this.realMode();

    this.setData({ generating: true, timing: '' });

    // 延迟一帧，先让「生成中」渲染出来
    setTimeout(function () {
      const t0 = Date.now();
      try {
        let pattern;

        if (real === 'import') {
          const gs =
            that.detectedGrid ||
            Math.max(1, Math.round(that.raster.width / that.data.gridSize));
          pattern = core.convertImport(that.raster, {
            gridSize: gs,
            series: series,
            setCodes: setCodes,
          });
        } else {
          const ratio = that.raster.height / that.raster.width;
          const w = that.data.gridSize;
          const h = Math.max(1, Math.round(w * ratio));
          pattern = core.convertPhoto(that.raster, {
            targetWidth: w,
            targetHeight: h,
            colorCount: that.data.colorCount,
            series: series,
            setCodes: setCodes,
          });
        }

        getApp().globalData.pattern = pattern;
        const ms = Date.now() - t0;

        that.setData({ generating: false, timing: '生成完成 · 耗时 ' + ms + ' ms' });
        wx.navigateTo({ url: '/pages/preview/index' });
      } catch (err) {
        that.setData({
          generating: false,
          timing: '生成失败：' + (err && err.message ? err.message : '未知错误'),
        });
      }
    }, 60);
  },
});
