Page({
  data: {
    info: '',
    showCode: true,
    showBoard: false,
    empty: false,
  },

  pattern: null,
  canvas: null,
  ctx: null,
  dpr: 1,

  onLoad() {
    const app = getApp();
    const pattern = app.globalData.pattern;
    if (!pattern) {
      this.setData({ empty: true });
      return;
    }
    this.pattern = pattern;

    const s = pattern.stats;
    const parts = [
      pattern.width + ' × ' + pattern.height,
      s.colorCount + ' 色',
      s.total.toLocaleString() + ' 颗',
      s.widthCm + ' × ' + s.heightCm + ' cm',
      s.boardsTotal + ' 块板',
    ];
    this.setData({ info: parts.join(' · ') });

    const info = wx.getWindowInfo();
    this.dpr = Math.min(2, info.pixelRatio || 2);

    // 等布局完成再画
    setTimeout(() => this.render(), 60);
  },

  render() {
    const that = this;
    const pattern = this.pattern;
    if (!pattern) return;

    const query = wx.createSelectorQuery();
    query.select('#stage').boundingClientRect();
    query.select('#cv').fields({ node: true });
    query.exec(function (res) {
      if (!res[0] || !res[1] || !res[1].node) return;

      const box = res[0];
      const canvas = res[1].node;
      that.canvas = canvas;
      const ctx = canvas.getContext('2d');
      that.ctx = ctx;

      const pad = 16;
      const maxW = Math.max(160, box.width - pad * 2);
      const maxH = Math.max(160, box.height - pad * 2);
      const w = pattern.width;
      const h = pattern.height;
      const cell = Math.max(2, Math.floor(Math.min(maxW / w, maxH / h)));

      const cw = cell * w;
      const ch = cell * h;
      const dpr = that.dpr;

      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cw, ch);

      const palette = pattern.palette;
      const cells = pattern.cells;
      const EMPTY = 255;

      // 1. 色块
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = cells[y * w + x];
          if (idx === EMPTY) continue;
          ctx.fillStyle = palette[idx].hex;
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }

      // 2. 网格线
      if (cell >= 5) {
        ctx.strokeStyle = 'rgba(0,0,0,.07)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = 0; x <= w; x++) {
          ctx.moveTo(x * cell + 0.25, 0);
          ctx.lineTo(x * cell + 0.25, ch);
        }
        for (let y = 0; y <= h; y++) {
          ctx.moveTo(0, y * cell + 0.25);
          ctx.lineTo(cw, y * cell + 0.25);
        }
        ctx.stroke();
      }

      // 3. 分板线
      if (that.data.showBoard && cell >= 3) {
        ctx.strokeStyle = 'rgba(255,122,69,.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 29; x < w; x += 29) {
          ctx.moveTo(x * cell, 0);
          ctx.lineTo(x * cell, ch);
        }
        for (let y = 29; y < h; y += 29) {
          ctx.moveTo(0, y * cell);
          ctx.lineTo(cw, y * cell);
        }
        ctx.stroke();
      }

      // 4. 色号
      if (that.data.showCode && cell >= 14) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fs = Math.max(7, Math.min(cell * 0.42, 11));
        ctx.font = '500 ' + fs + 'px monospace';

        const colorCache = {};
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = cells[y * w + x];
            if (idx === EMPTY) continue;

            let tc = colorCache[idx];
            if (!tc) {
              tc = isDark(palette[idx].hex) ? 'rgba(255,255,255,.82)' : 'rgba(0,0,0,.62)';
              colorCache[idx] = tc;
            }
            ctx.fillStyle = tc;
            ctx.fillText(palette[idx].code, x * cell + cell / 2, y * cell + cell / 2 + 0.5);
          }
        }
      }
    });
  },

  toggleCode() {
    this.setData({ showCode: !this.data.showCode }, () => this.render());
  },

  toggleBoard() {
    this.setData({ showBoard: !this.data.showBoard }, () => this.render());
  },

  goUsage() {
    wx.navigateTo({ url: '/pages/usage/index' });
  },

  saveImage() {
    const that = this;
    const pattern = this.pattern;
    if (!pattern || !this.canvas) {
      wx.showToast({ title: '图纸还没画好', icon: 'none' });
      return;
    }

    // 用离屏画布按固定格宽重绘，保证导出分辨率够打印
    const cell = 14;
    const w = pattern.width;
    const h = pattern.height;
    const W = w * cell;
    const H = h * cell;

    wx.showLoading({ title: '导出中', mask: true });

    wx.createSelectorQuery()
      .select('#exp')
      .fields({ node: true })
      .exec(function (res) {
        if (!res[0] || !res[0].node) {
          wx.hideLoading();
          wx.showToast({ title: '导出失败', icon: 'none' });
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        canvas.width = W;
        canvas.height = H;

        drawPattern(ctx, pattern, cell, w, h, that.data.showCode, that.data.showBoard);

        wx.canvasToTempFilePath({
          canvas: canvas,
          x: 0,
          y: 0,
          width: W,
          height: H,
          destWidth: W,
          destHeight: H,
          success(r) {
            wx.saveImageToPhotosAlbum({
              filePath: r.tempFilePath,
              success() {
                wx.hideLoading();
                wx.showToast({ title: '已保存到相册' });
              },
              fail(err) {
                wx.hideLoading();
                if (err && err.errMsg && err.errMsg.indexOf('auth') >= 0) {
                  wx.showModal({
                    title: '需要相册权限',
                    content: '保存图纸需要写入相册权限，请在设置里打开',
                    confirmText: '去设置',
                    success(m) {
                      if (m.confirm) wx.openSetting();
                    },
                  });
                } else {
                  wx.showToast({ title: '保存失败', icon: 'none' });
                }
              },
            });
          },
          fail() {
            wx.hideLoading();
            wx.showToast({ title: '导出失败', icon: 'none' });
          },
        });
      });
  },
});

// ---------- 工具 ----------

const EMPTY_CELL = 255;

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

function drawPattern(ctx, pattern, cell, w, h, showCode, showBoard) {
  const cw = w * cell;
  const ch = h * cell;
  const palette = pattern.palette;
  const cells = pattern.cells;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cw, ch);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = cells[y * w + x];
      if (idx === EMPTY_CELL) continue;
      ctx.fillStyle = palette[idx].hex;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  if (cell >= 5) {
    ctx.strokeStyle = 'rgba(0,0,0,.07)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      ctx.moveTo(x * cell + 0.25, 0);
      ctx.lineTo(x * cell + 0.25, ch);
    }
    for (let y = 0; y <= h; y++) {
      ctx.moveTo(0, y * cell + 0.25);
      ctx.lineTo(cw, y * cell + 0.25);
    }
    ctx.stroke();
  }

  if (showBoard && cell >= 3) {
    ctx.strokeStyle = 'rgba(255,122,69,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 29; x < w; x += 29) {
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, ch);
    }
    for (let y = 29; y < h; y += 29) {
      ctx.moveTo(0, y * cell);
      ctx.lineTo(cw, y * cell);
    }
    ctx.stroke();
  }

  if (showCode && cell >= 14) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.max(7, Math.min(cell * 0.42, 11));
    ctx.font = '500 ' + fs + 'px monospace';
    const colorCache = {};
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = cells[y * w + x];
        if (idx === EMPTY_CELL) continue;
        let tc = colorCache[idx];
        if (!tc) {
          tc = isDark(palette[idx].hex) ? 'rgba(255,255,255,.82)' : 'rgba(0,0,0,.62)';
          colorCache[idx] = tc;
        }
        ctx.fillStyle = tc;
        ctx.fillText(palette[idx].code, x * cell + cell / 2, y * cell + cell / 2 + 0.5);
      }
    }
  }
}
