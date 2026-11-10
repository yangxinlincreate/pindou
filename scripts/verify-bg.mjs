/**
 * 背景剔除算法验证。
 * 用几类典型图片检查：是否能正确剔除、保护是否生效。
 */
import * as Core from '../tmp/core.mjs';

function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const c = fn(x, y);
      data[p] = c[0];
      data[p + 1] = c[1];
      data[p + 2] = c[2];
      data[p + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  return { width: w, height: h, data };
}

function report(name, res, expect) {
  const pct = (res.ratio * 100).toFixed(1);
  const flag = res.ok ? 'OK ' : 'SKIP';
  console.log(`  ${flag} ${name.padEnd(28)} 背景 ${pct.padStart(5)}%   ${res.reason || ''}   ${expect}`);
}

console.log('\n背景剔除测试\n');

// 1. 白底 + 红色圆（最理想情况）
{
  const img = makeImage(240, 240, (x, y) => {
    const d = Math.hypot(x - 120, y - 120);
    return d < 70 ? [226, 58, 46] : [255, 255, 255];
  });
  const r = Core.removeBackground(img);
  report('白底 + 红圆', r, `期望 ~74%`);
  // 检查圆心没被误判
  const center = 120 * 240 + 120;
  console.log(`     圆心是否被误判为背景: ${r.mask[center] === 1 ? '是（错误）' : '否（正确）'}`);
}

// 2. 渐变背景 + 主体
{
  const img = makeImage(240, 240, (x, y) => {
    const d = Math.hypot(x - 120, y - 120);
    if (d < 70) return [40, 90, 160];
    const t = y / 240;
    return [Math.round(180 + t * 60), Math.round(200 + t * 45), Math.round(230 + t * 25)];
  });
  const r = Core.removeBackground(img);
  report('渐变背景 + 主体', r, '期望部分剔除');
}

// 3. 纯色图（不应剔除）
{
  const img = makeImage(240, 240, () => [200, 200, 200]);
  const r = Core.removeBackground(img);
  report('整图纯色', r, '期望跳过（保护生效）');
}

// 4. 无背景（满图主体）
{
  const img = makeImage(240, 240, (x, y) => [x % 256, y % 256, 128]);
  const r = Core.removeBackground(img);
  report('满图渐变（无主体）', r, '期望跳过');
}

// 5. 主体贴边（白底但圆碰到边缘）
{
  const img = makeImage(240, 240, (x, y) => {
    const d = Math.hypot(x - 120, y - 120);
    return d < 120 ? [226, 58, 46] : [255, 255, 255];
  });
  const r = Core.removeBackground(img);
  report('主体几乎占满', r, '期望跳过（防误删）');
}

// 6. 带掩码的完整转换
{
  const img = makeImage(240, 240, (x, y) => {
    const d = Math.hypot(x - 120, y - 120);
    return d < 70 ? [226, 58, 46] : [255, 255, 255];
  });
  const bg = Core.removeBackground(img);
  const series = JSON.parse(
    (await import('node:fs')).readFileSync('apps/web/public/data/mard-221.json', 'utf8'),
  );

  const without = Core.convertPhoto(img, { targetWidth: 40, targetHeight: 40, colorCount: 8, series });
  const withMask = Core.convertPhoto(img, {
    targetWidth: 40,
    targetHeight: 40,
    colorCount: 8,
    series,
    bgMask: bg.mask,
  });

  console.log('\n  带掩码转换对比：');
  console.log(`     不去背景：${without.stats.total} 颗 / ${without.stats.colorCount} 色 / 空格 ${without.stats.emptyCells}`);
  console.log(`     去背景后：${withMask.stats.total} 颗 / ${withMask.stats.colorCount} 色 / 空格 ${withMask.stats.emptyCells}`);
  console.log(`     用豆量减少：${(((without.stats.total - withMask.stats.total) / without.stats.total) * 100).toFixed(1)}%`);
}
