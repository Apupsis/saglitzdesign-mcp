// Minimal, correct PNG decoder built on node:zlib — no dependencies.
// It decodes what real screenshots actually are (8/16-bit truecolour, greyscale
// and palette, non-interlaced) and refuses everything else with a named code,
// because a wrong pixel silently poisons every measurement downstream.

import zlib from "node:zlib";

export interface DecodedImage { width: number; height: number; data: Uint8Array }

export class PngError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PngError";
    this.code = code;
  }
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
export const MAX_PIXELS = 40_000_000;
export const MAX_BYTES = 25 * 1024 * 1024;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Extract the x-th sample of a sub-byte-packed scanline (bit depths 1, 2, 4). */
function readSubByte(raw: Buffer, rowStart: number, x: number, bitDepth: number): number {
  if (bitDepth === 8) return raw[rowStart + x];
  const perByte = 8 / bitDepth;
  const byte = raw[rowStart + Math.floor(x / perByte)];
  const shift = 8 - bitDepth * ((x % perByte) + 1);
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

export function decodePng(buffer: Buffer): DecodedImage {
  if (buffer.length > MAX_BYTES) {
    throw new PngError("too-large", `Image is ${(buffer.length / 1048576).toFixed(1)} MB; the limit is 25 MB.`);
  }
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    throw new PngError("jpeg-unsupported", "This is a JPEG. Only PNG is supported — re-save or export the screenshot as PNG.");
  }
  if (buffer.length < 8 || SIGNATURE.some((b, i) => buffer[i] !== b)) {
    throw new PngError("not-png", "This file is not a PNG (the PNG signature is missing).");
  }

  let ihdr: Buffer | null = null, plte: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  let off = 8;
  while (off + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(off);
    const type = buffer.toString("ascii", off + 4, off + 8);
    const start = off + 8;
    if (start + len + 4 > buffer.length) throw new PngError("corrupt", "The PNG is truncated.");
    const data = buffer.subarray(start, start + len);
    if (type === "IHDR") ihdr = Buffer.from(data);
    else if (type === "PLTE") plte = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    off = start + len + 4;
  }
  if (!ihdr || ihdr.length < 13) throw new PngError("corrupt", "The PNG has no valid header chunk.");
  if (idat.length === 0) throw new PngError("corrupt", "The PNG has no image data.");

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];

  if (width <= 0 || height <= 0) throw new PngError("corrupt", "The PNG reports a zero dimension.");
  if (width * height > MAX_PIXELS) {
    throw new PngError("too-large", `Image is ${width}×${height}; the limit is 40 megapixels.`);
  }
  if (interlace !== 0) {
    throw new PngError("interlace-unsupported", "Interlaced (Adam7) PNGs are not supported — re-save without interlacing.");
  }
  const channels = CHANNELS[colorType];
  if (!channels) throw new PngError("corrupt", `Unknown PNG colour type ${colorType}.`);
  const depthOk = colorType === 3 ? [1, 2, 4, 8].includes(bitDepth) : [8, 16].includes(bitDepth);
  if (!depthOk) {
    throw new PngError("bitdepth-unsupported", `Bit depth ${bitDepth} is not supported for colour type ${colorType}.`);
  }
  if (colorType === 3 && !plte) throw new PngError("corrupt", "A palette PNG is missing its palette chunk.");

  let inflated: Buffer;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    throw new PngError("corrupt", "The PNG image data could not be decompressed.");
  }

  const bitsPerPixel = channels * bitDepth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  if (inflated.length < height * (stride + 1)) {
    throw new PngError("corrupt", "The PNG image data is shorter than its header claims.");
  }

  // Un-filter, scanline by scanline.
  const raw = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const ft = inflated[y * (stride + 1)];
    const line = Buffer.from(inflated.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (ft === 1) line[i] = (line[i] + a) & 255;
      else if (ft === 2) line[i] = (line[i] + b) & 255;
      else if (ft === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (ft === 4) line[i] = (line[i] + paeth(a, b, c)) & 255;
      else if (ft !== 0) throw new PngError("corrupt", `Unknown PNG filter type ${ft}.`);
    }
    line.copy(raw, y * stride);
    prev = line;
  }

  // Expand to RGBA8.
  const data = new Uint8Array(width * height * 4);
  const step = bitDepth === 16 ? 2 : 1; // 16-bit: keep the high byte
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r = 0, g = 0, b = 0, a = 255;
      if (colorType === 3) {
        const idx = readSubByte(raw, rowStart, x, bitDepth);
        r = plte![idx * 3] ?? 0; g = plte![idx * 3 + 1] ?? 0; b = plte![idx * 3 + 2] ?? 0;
        a = trns && idx < trns.length ? trns[idx] : 255;
      } else {
        const base = rowStart + x * channels * step;
        if (colorType === 0) { r = g = b = raw[base]; }
        else if (colorType === 4) { r = g = b = raw[base]; a = raw[base + step]; }
        else if (colorType === 2) { r = raw[base]; g = raw[base + step]; b = raw[base + 2 * step]; }
        else { r = raw[base]; g = raw[base + step]; b = raw[base + 2 * step]; a = raw[base + 3 * step]; }
      }
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
    }
  }
  return { width, height, data };
}
