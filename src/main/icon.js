'use strict';
/**
 * 运行时生成 PNG 图标（不依赖任何二进制资源文件）。
 * 用一个极小的 PNG 编码器把像素画成应用/托盘图标：蓝色圆角方块 + 白色字母 H。
 */
const zlib = require('zlib');

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * 生成图标 PNG Buffer
 * @param {number} size 边长像素
 */
function createTrayIconPng(size) {
  const s = size || 32;
  const rgba = Buffer.alloc(s * s * 4);
  const pad = Math.max(1, Math.round(s * 0.06));
  const radius = Math.max(3, Math.round(s * 0.2));
  const x0 = pad;
  const y0 = pad;
  const x1 = s - pad - 1;
  const y1 = s - pad - 1;

  // 字母 H 的三个笔画（按比例定位）
  const barW = Math.max(2, Math.round(s * 0.11));
  const gap = Math.max(2, Math.round(s * 0.16));
  const lx1 = Math.round(s * 0.29);
  const lx2 = lx1 + barW;
  const rx2 = Math.round(s * 0.71);
  const rx1 = rx2 - barW;
  const ty1 = Math.round(s * 0.28);
  const ty2 = Math.round(s * 0.72);
  const hy1 = Math.round(s * 0.465);
  const hy2 = Math.round(s * 0.535);
  void gap;

  const inRounded = (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const nearLeft = x < x0 + radius;
    const nearRight = x > x1 - radius;
    const nearTop = y < y0 + radius;
    const nearBottom = y > y1 - radius;
    if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
      const cx = nearLeft ? x0 + radius : x1 - radius;
      const cy = nearTop ? y0 + radius : y1 - radius;
      const dx = x - cx;
      const dy = y - cy;
      return dx * dx + dy * dy <= radius * radius;
    }
    return true;
  };

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      if (!inRounded(x, y)) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
        continue;
      }
      const inLeftBar = x >= lx1 && x < lx2 && y >= ty1 && y < ty2;
      const inRightBar = x >= rx1 && x < rx2 && y >= ty1 && y < ty2;
      const inCross = y >= hy1 && y < hy2 && x >= lx1 && x < rx2;
      if (inLeftBar || inRightBar || inCross) {
        rgba[i] = 255;
        rgba[i + 1] = 255;
        rgba[i + 2] = 255;
      } else {
        rgba[i] = 31;
        rgba[i + 1] = 111;
        rgba[i + 2] = 178;
      }
      rgba[i + 3] = 255;
    }
  }
  return encodePng(s, s, rgba);
}

module.exports = { createTrayIconPng, encodePng };