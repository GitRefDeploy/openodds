/**
 * Generates `app-icon.png` (1024x1024) used as the source for `tauri icon`.
 * Hand-rolled PNG encoder so the repo needs no image tooling.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 1024;
const px = Buffer.alloc(SIZE * SIZE * 4);

function setPixel(x, y, r, g, b, a = 255) {
  const i = (y * SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

function inRoundedRect(x, y, rx, ry, rw, rh, radius) {
  if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false;
  const cx = Math.min(Math.max(x, rx + radius), rx + rw - radius);
  const cy = Math.min(Math.max(y, ry + radius), ry + rh - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function draw() {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Vertical emerald gradient background, transparent outside a rounded square.
      if (!inRoundedRect(x, y, 0, 0, SIZE, SIZE, 180)) {
        setPixel(x, y, 0, 0, 0, 0);
        continue;
      }
      const t = y / SIZE;
      const r = Math.round(6 + (5 - 6) * t);
      const g = Math.round(150 + (185 - 150) * t);
      const b = Math.round(120 + (129 - 120) * t);
      setPixel(x, y, r, g, b);
    }
  }

  // Three ascending bars, like a P/L chart.
  const bars = [
    { x: 250, h: 220 },
    { x: 440, h: 360 },
    { x: 630, h: 520 },
  ];
  const baseY = 760;
  for (const bar of bars) {
    for (let x = bar.x; x < bar.x + 140; x++) {
      for (let y = baseY - bar.h; y < baseY; y++) {
        if (inRoundedRect(x, y, bar.x, baseY - bar.h, 140, bar.h, 28)) {
          setPixel(x, y, 15, 23, 42, 235);
        }
      }
    }
  }
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePng() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0; // filter: none
    px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

draw();
writeFileSync(new URL("../app-icon.png", import.meta.url), encodePng());
console.log("wrote app-icon.png");
