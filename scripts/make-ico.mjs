// 把 public/favicon.svg 转成 public/favicon.ico（多尺寸 16/32/48）
// 用法：node scripts/make-ico.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SVG = join(ROOT, 'public', 'favicon.svg');
const OUT = join(ROOT, 'public', 'favicon.ico');

const SIZES = [16, 32, 48];

async function main() {
  const svg = readFileSync(SVG);
  const pngs = await Promise.all(SIZES.map((s) => sharp(svg).resize(s, s).png().toBuffer()));
  const ico = await toIco(pngs);
  writeFileSync(OUT, ico);
  console.log(`生成 ${OUT}（尺寸 ${SIZES.join('/')}）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
