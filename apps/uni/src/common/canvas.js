/**
 * 跨端 canvas 工具。
 *
 * 小程序端用 type="2d" 的 node（支持 getImageData），
 * H5 端直接从 DOM 拿 canvas 元素。两个平台写法不同，用条件编译分开。
 */

/**
 * 创建一个不依赖页面渲染的离屏 canvas。
 *
 * 为什么必须用它：微信小程序里，完全移出视口的 canvas（比如 left:-9999px）
 * 可能根本不渲染，getImageData 会拿到空数据，整个解码流程静默卡死。
 * 离屏 canvas 不受页面布局影响，是目前最稳的取像素方式。
 */
export function createOffscreenCanvas(width, height) {
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
    return wx.createOffscreenCanvas({ type: '2d', width, height });
  }
  // 老基础库兜底：用页面内的 canvas（调用方需保证它在视口内）
  // #endif

  // #ifdef H5
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
  // #endif
}

/**
 * 拿到原生 canvas 对象。
 * @param {string} selector 形如 '#work'
 * @returns {Promise<any>}
 */
export function getCanvasNode(selector) {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni
      .createSelectorQuery()
      .select(selector)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0] && res[0].node) {
          resolve(res[0].node);
        } else {
          reject(new Error('canvas 节点获取失败'));
        }
      });
    // #endif

    // #ifdef H5
    const host = document.querySelector(selector);
    if (!host) {
      reject(new Error('canvas 节点获取失败'));
      return;
    }
    const el = host.tagName === 'CANVAS' ? host : host.querySelector('canvas');
    if (el) resolve(el);
    else reject(new Error('canvas 节点获取失败'));
    // #endif
  });
}

/** 设备像素比，封顶 2——再高只是白烧内存 */
export function getPixelRatio() {
  // #ifdef MP-WEIXIN
  try {
    if (uni.getWindowInfo) return Math.min(2, uni.getWindowInfo().pixelRatio || 1);
    return Math.min(2, uni.getSystemInfoSync().pixelRatio || 1);
  } catch (e) {
    return 2;
  }
  // #endif

  // #ifdef H5
  return Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  // #endif
}

/** 容器尺寸（用作绘制的可用区域） */
export function getBoxSize(selector) {
  return new Promise((resolve) => {
    uni
      .createSelectorQuery()
      .select(selector)
      .boundingClientRect((rect) => {
        resolve(rect || { width: 300, height: 300 });
      })
      .exec();
  });
}
