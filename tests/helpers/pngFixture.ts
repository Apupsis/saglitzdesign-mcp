import zlib from "node:zlib";

// Test-only PNG *encoder*. It exists so every fixture has pixels we chose
// ourselves — which is what lets the decoder and measurement tests assert exact
// values rather than "looks about right".

const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

/** Apply a PNG filter to one scanline. `bpp` is bytes per complete pixel, min 1. */
function applyFilter(type: number, line: number[], prev: number[], bpp: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const x = line[i];
    const a = i >= bpp ? line[i - bpp] : 0;
    const b = prev[i] ?? 0;
    const c = i >= bpp ? prev[i - bpp] ?? 0 : 0;
    let v: number;
    if (type === 0) v = x;
    else if (type === 1) v = x - a;
    else if (type === 2) v = x - b;
    else if (type === 3) v = x - ((a + b) >> 1);
    else {
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      v = x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
    }
    out.push(v & 255);
  }
  return out;
}

export function encodePng(opts: {
  width: number; height: number; colorType: 0 | 2 | 3 | 4 | 6; bitDepth: number;
  rows: number[][]; filter?: 0 | 1 | 2 | 3 | 4; palette?: number[]; trns?: number[]; interlace?: 0 | 1;
}): Buffer {
  const { width, height, colorType, bitDepth, rows } = opts;
  const filter = opts.filter ?? 0;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  const bpp = Math.max(1, Math.ceil((channels * bitDepth) / 8));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = opts.interlace ?? 0;

  let prev: number[] = new Array(rows[0]?.length ?? 0).fill(0);
  const raw: Buffer[] = [];
  for (const row of rows) {
    raw.push(Buffer.from([filter, ...applyFilter(filter, row, prev, bpp)]));
    prev = row;
  }

  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
  if (opts.palette) parts.push(chunk("PLTE", Buffer.from(opts.palette)));
  if (opts.trns) parts.push(chunk("tRNS", Buffer.from(opts.trns)));
  parts.push(chunk("IDAT", zlib.deflateSync(Buffer.concat(raw))), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/**
 * Build an RGB canvas of a known background with coloured rectangles drawn on
 * it, so every measured number has a known correct answer.
 */
export function canvasRows(
  width: number,
  height: number,
  bg: [number, number, number],
  rects: Array<{ x: number; y: number; w: number; h: number; rgb: [number, number, number] }> = [],
): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const hit = rects.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      row.push(...(hit ? hit.rgb : bg));
    }
    rows.push(row);
  }
  return rows;
}
