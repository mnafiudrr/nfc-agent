/**
 * Draws a status dot onto the tray icon.
 *
 * The badged variants are produced at runtime from the supplied brand icon
 * rather than committed as extra binaries, so replacing assets/asliv.ico is
 * enough to restyle the tray.
 *
 * Only uncompressed 32bpp icons are supported, which is what asliv.ico is. A
 * PNG-compressed icon returns null and the caller falls back to the unbadged
 * icon rather than failing.
 */

export interface Rgba {
  width: number;
  height: number;
  /** RGBA, top-down. */
  pixels: Uint8Array;
}

const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;
const BITMAPINFOHEADER_SIZE = 40;

export const CONNECTED_COLOR = { r: 0x22, g: 0xc5, b: 0x5e };
export const DISCONNECTED_COLOR = { r: 0xef, g: 0x44, b: 0x44 };

export function decodeIco(buffer: Buffer): Rgba | null {
  if (buffer.length < ICONDIR_SIZE + ICONDIRENTRY_SIZE) {
    return null;
  }
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    return null;
  }
  const count = buffer.readUInt16LE(4);
  if (count < 1) {
    return null;
  }

  // Pick the largest entry so a multi-size icon still badges cleanly.
  let best = -1;
  let bestArea = -1;
  for (let i = 0; i < count; i += 1) {
    const entry = ICONDIR_SIZE + i * ICONDIRENTRY_SIZE;
    if (entry + ICONDIRENTRY_SIZE > buffer.length) {
      return null;
    }
    const w = buffer[entry] === 0 ? 256 : (buffer[entry] ?? 0);
    const h = buffer[entry + 1] === 0 ? 256 : (buffer[entry + 1] ?? 0);
    if (w * h > bestArea) {
      bestArea = w * h;
      best = entry;
    }
  }
  if (best < 0) {
    return null;
  }

  const offset = buffer.readUInt32LE(best + 12);
  if (offset + BITMAPINFOHEADER_SIZE > buffer.length) {
    return null;
  }
  // PNG-compressed entry: not supported.
  if (buffer.readUInt32BE(offset) === 0x89504e47) {
    return null;
  }

  const headerSize = buffer.readUInt32LE(offset);
  const width = buffer.readInt32LE(offset + 4);
  const height = Math.trunc(buffer.readInt32LE(offset + 8) / 2);
  const bitCount = buffer.readUInt16LE(offset + 14);
  if (headerSize !== BITMAPINFOHEADER_SIZE || bitCount !== 32 || width <= 0 || height <= 0) {
    return null;
  }

  const dataStart = offset + BITMAPINFOHEADER_SIZE;
  if (dataStart + width * height * 4 > buffer.length) {
    return null;
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const srcRow = height - 1 - y; // stored bottom-up
    for (let x = 0; x < width; x += 1) {
      const src = dataStart + (srcRow * width + x) * 4;
      const dst = (y * width + x) * 4;
      pixels[dst] = buffer[src + 2] ?? 0; // R
      pixels[dst + 1] = buffer[src + 1] ?? 0; // G
      pixels[dst + 2] = buffer[src] ?? 0; // B
      pixels[dst + 3] = buffer[src + 3] ?? 0; // A
    }
  }
  return { width, height, pixels };
}

export function encodeIco(image: Rgba): Buffer {
  const { width, height, pixels } = image;
  const xorSize = width * height * 4;
  const maskStride = Math.ceil(width / 32) * 4;
  const andSize = maskStride * height;

  const dib = Buffer.alloc(BITMAPINFOHEADER_SIZE + xorSize + andSize);
  dib.writeUInt32LE(BITMAPINFOHEADER_SIZE, 0);
  dib.writeInt32LE(width, 4);
  dib.writeInt32LE(height * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16);
  dib.writeUInt32LE(xorSize, 20);

  for (let y = 0; y < height; y += 1) {
    const srcRow = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const src = (srcRow * width + x) * 4;
      const dst = BITMAPINFOHEADER_SIZE + (y * width + x) * 4;
      dib[dst] = pixels[src + 2] ?? 0; // B
      dib[dst + 1] = pixels[src + 1] ?? 0; // G
      dib[dst + 2] = pixels[src] ?? 0; // R
      dib[dst + 3] = pixels[src + 3] ?? 0; // A
    }
  }
  // AND mask stays zero: the alpha channel carries transparency.

  const header = Buffer.alloc(ICONDIR_SIZE + ICONDIRENTRY_SIZE);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(width >= 256 ? 0 : width, 6);
  header.writeUInt8(height >= 256 ? 0 : height, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(dib.length, 14);
  header.writeUInt32LE(header.length, 18);

  return Buffer.concat([header, dib]);
}

function blend(
  image: Rgba,
  x: number,
  y: number,
  color: { r: number; g: number; b: number },
  alpha: number,
): void {
  if (alpha <= 0 || x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return;
  }
  const i = (y * image.width + x) * 4;
  const a = Math.min(1, alpha);
  const prevA = (image.pixels[i + 3] ?? 0) / 255;
  const outA = a + prevA * (1 - a);
  if (outA <= 0) {
    return;
  }
  const mix = (channel: number, value: number): number =>
    Math.round((value * a + channel * prevA * (1 - a)) / outA);
  image.pixels[i] = mix(image.pixels[i] ?? 0, color.r);
  image.pixels[i + 1] = mix(image.pixels[i + 1] ?? 0, color.g);
  image.pixels[i + 2] = mix(image.pixels[i + 2] ?? 0, color.b);
  image.pixels[i + 3] = Math.round(outA * 255);
}

/**
 * Draws a filled dot in the bottom-right corner with a contrasting ring, so it
 * stays readable against both light and dark icons and taskbars.
 */
export function drawStatusDot(image: Rgba, color: { r: number; g: number; b: number }): Rgba {
  // Big enough to read at the 16x16 the tray actually renders, small enough to
  // leave the brand mark recognisable.
  const size = Math.min(image.width, image.height);
  const radius = Math.max(2.5, size * 0.19);
  const ring = Math.max(1, size * 0.05);
  const cx = image.width - radius - ring;
  const cy = image.height - radius - ring;

  const white = { r: 255, g: 255, b: 255 };
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      // Ring first, then the fill on top of it.
      blend(image, x, y, white, Math.min(1, Math.max(0, radius + ring - d)));
      blend(image, x, y, color, Math.min(1, Math.max(0, radius - d)));
    }
  }
  return image;
}

export function buildBadgedIcon(
  source: Buffer,
  color: { r: number; g: number; b: number },
): Buffer | null {
  const decoded = decodeIco(source);
  if (!decoded) {
    return null;
  }
  return encodeIco(drawStatusDot(decoded, color));
}
