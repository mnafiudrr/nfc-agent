// Generates assets/tray.ico - a 32x32 32bpp icon drawn in code so the binary
// asset stays reproducible and reviewable. Run with: node scripts/make-tray-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 32;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO_ROOT, 'assets', 'tray.ico');

const BG = { r: 30, g: 111, b: 217 };
const FG = { r: 255, g: 255, b: 255 };

const pixels = new Uint8Array(SIZE * SIZE * 4); // RGBA, top-down while drawing

function set(x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || alpha <= 0) return;
  const i = (y * SIZE + x) * 4;
  const a = Math.min(1, alpha);
  const prevA = pixels[i + 3] / 255;
  const outA = a + prevA * (1 - a);
  if (outA <= 0) return;
  pixels[i] = Math.round((color.r * a + pixels[i] * prevA * (1 - a)) / outA);
  pixels[i + 1] = Math.round((color.g * a + pixels[i + 1] * prevA * (1 - a)) / outA);
  pixels[i + 2] = Math.round((color.b * a + pixels[i + 2] * prevA * (1 - a)) / outA);
  pixels[i + 3] = Math.round(outA * 255);
}

// Rounded-square background with a 1px antialiased edge.
const RADIUS = 7;
function roundedRectCoverage(x, y) {
  const inset = 1;
  const min = inset;
  const max = SIZE - 1 - inset;
  const cx = Math.min(Math.max(x, min + RADIUS), max - RADIUS);
  const cy = Math.min(Math.max(y, min + RADIUS), max - RADIUS);
  const d = Math.hypot(x - cx, y - cy);
  return Math.min(1, Math.max(0, RADIUS + 0.5 - d));
}

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    set(x, y, BG, roundedRectCoverage(x, y));
  }
}

// Three NFC waves radiating from the left, plus the emitter dot.
const ORIGIN_X = 9.5;
const ORIGIN_Y = 16;
const HALF_ANGLE = (52 * Math.PI) / 180;
const THICKNESS = 1.4;

for (const radius of [6, 10.5, 15]) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = x - ORIGIN_X;
      const dy = y - ORIGIN_Y;
      if (dx <= 0) continue;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      if (Math.abs(angle) > HALF_ANGLE) continue;
      const edge = Math.abs(dist - radius);
      set(x, y, FG, Math.min(1, Math.max(0, THICKNESS - edge)));
    }
  }
}

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const d = Math.hypot(x - ORIGIN_X, y - ORIGIN_Y);
    set(x, y, FG, Math.min(1, Math.max(0, 2.6 - d)));
  }
}

// --- encode as .ico (single 32bpp BMP image, bottom-up BGRA) ---------------

const xorSize = SIZE * SIZE * 4;
const andSize = (SIZE / 8) * SIZE; // 1bpp mask, rows padded to 4 bytes (32/8 = 4)
const dib = Buffer.alloc(40 + xorSize + andSize);

dib.writeUInt32LE(40, 0); // biSize
dib.writeInt32LE(SIZE, 4); // biWidth
dib.writeInt32LE(SIZE * 2, 8); // biHeight (XOR + AND)
dib.writeUInt16LE(1, 12); // biPlanes
dib.writeUInt16LE(32, 14); // biBitCount
dib.writeUInt32LE(0, 16); // biCompression = BI_RGB
dib.writeUInt32LE(xorSize, 20); // biSizeImage

for (let y = 0; y < SIZE; y += 1) {
  const srcRow = SIZE - 1 - y; // bottom-up
  for (let x = 0; x < SIZE; x += 1) {
    const src = (srcRow * SIZE + x) * 4;
    const dst = 40 + (y * SIZE + x) * 4;
    dib[dst] = pixels[src + 2]; // B
    dib[dst + 1] = pixels[src + 1]; // G
    dib[dst + 2] = pixels[src]; // R
    dib[dst + 3] = pixels[src + 3]; // A
  }
}
// AND mask stays all-zero: the alpha channel carries transparency.

const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(1, 4); // image count
header.writeUInt8(SIZE, 6); // width
header.writeUInt8(SIZE, 7); // height
header.writeUInt8(0, 8); // palette colours
header.writeUInt8(0, 9); // reserved
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(dib.length, 14); // bytes in resource
header.writeUInt32LE(header.length, 18); // offset

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([header, dib]));
console.log(`wrote ${OUT} (${header.length + dib.length} bytes)`);
