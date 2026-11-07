/**
 * 把色卡 JSON 转成小程序可直接 require 的 JS 模块。
 * 小程序对 JSON require 的支持视基础库版本而定，用 JS 模块最稳。
 */
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('apps/web/public/data/mard-221.json');
const outDir = path.resolve('miniprogram/data');
fs.mkdirSync(outDir, { recursive: true });

const doc = JSON.parse(fs.readFileSync(src, 'utf8'));

const body = `// 自动生成，勿手改。源数据：apps/web/public/data/mard-221.json
// 当前为空位示例色值（confidence: placeholder），需替换为真实采集数据。
module.exports = ${JSON.stringify(doc, null, 1)};
`;

fs.writeFileSync(path.join(outDir, 'mard-221.js'), body, 'utf8');

const kb = (fs.statSync(path.join(outDir, 'mard-221.js')).size / 1024).toFixed(1);
console.log(`色号 ${doc.colors.length} 个 → miniprogram/data/mard-221.js (${kb} KB)`);
