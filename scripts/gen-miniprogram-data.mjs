/**
 * 把色卡 JSON 转成可被直接引用的模块。
 *
 * 两个目标：
 *   miniprogram/data/mard-221.js  → CommonJS，原生小程序 require
 *   apps/uni/common/mard-221.js   → ESM，uni-app import
 */
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('apps/web/public/data/mard-221.json');
const doc = JSON.parse(fs.readFileSync(src, 'utf8'));
const json = JSON.stringify(doc, null, 1);

const header = `// 自动生成，勿手改。源数据：apps/web/public/data/mard-221.json
// 数据来源：makebead/craft-color-codes（CC BY 4.0）
`;

// --- 原生小程序（CommonJS）---
const mpDir = path.resolve('miniprogram/data');
fs.mkdirSync(mpDir, { recursive: true });
fs.writeFileSync(
  path.join(mpDir, 'mard-221.js'),
  `${header}module.exports = ${json};\n`,
  'utf8',
);

// --- uni-app（ESM）---
const uniDir = path.resolve('apps/uni/common');
fs.mkdirSync(uniDir, { recursive: true });
fs.writeFileSync(
  path.join(uniDir, 'mard-221.js'),
  `${header}export default ${json};\n`,
  'utf8',
);

const kb = (fs.statSync(path.join(uniDir, 'mard-221.js')).size / 1024).toFixed(1);
console.log(`色号 ${doc.colors.length} 个，套装 ${doc.sets.length} 组`);
console.log(`  → miniprogram/data/mard-221.js (CJS)`);
console.log(`  → apps/uni/common/mard-221.js (ESM, ${kb} KB)`);
