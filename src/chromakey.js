// 绿幕/蓝幕抠图 — Canvas 2D 实现
// 参考思路: github.com/brianchirls/Seriously.js + chromakey-video,简化为单文件
// 直接对一帧 canvas 做 chroma key,支持平滑边缘 + 自动检测主色
//
// 用法:
//   import { applyChromaKey, detectKeyColor } from './chromakey.js';
//   const key = detectKeyColor(ctx, w, h);     // 从四角取色
//   applyChromaKey(ctx, w, h, { keyR, keyG, keyB, tolerance: 80, smooth: 30 });

// 把 ctx 当前帧的所有"接近 key 色"的像素 alpha 置 0,边缘平滑过渡
export function applyChromaKey(ctx, w, h, opts = {}) {
  const keyR = opts.keyR ?? 0;
  const keyG = opts.keyG ?? 200;
  const keyB = opts.keyB ?? 0;
  const tol = opts.tolerance ?? 80;   // 完全透明阈值
  const smooth = opts.smooth ?? 30;   // 平滑过渡宽度
  const despill = opts.despill ?? true; // 抑制绿色溢色
  const tol2 = tol * tol;
  const smoothMax = (tol + smooth) * (tol + smooth);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const dr = r - keyR, dg = g - keyG, db = b - keyB;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 < tol2) {
      d[i + 3] = 0; // 完全透明
      continue;
    }
    if (dist2 < smoothMax) {
      // 边缘平滑: alpha 按距离线性递增
      const dist = Math.sqrt(dist2);
      const t = (dist - tol) / smooth;
      d[i + 3] = Math.round(d[i + 3] * t);
    }
    // Despill: 主体里若绿(key)通道过强,压回
    if (despill && keyG > keyR && keyG > keyB) {
      // 绿幕场景:G 比 R/B 都高时,把多余的 G 压成 (R+B)/2
      const maxRB = Math.max(r, b);
      if (g > maxRB + 10) d[i + 1] = maxRB + 10;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// 从四个角各采 8×8 一块,取平均色作为 key 色
// 假定四角都是背景(常见绿幕拍摄)
export function detectKeyColor(ctx, w, h) {
  const pickBlock = (x, y) => {
    const block = ctx.getImageData(x, y, 8, 8).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < block.length; i += 4) {
      r += block[i]; g += block[i + 1]; b += block[i + 2]; n++;
    }
    return [r / n, g / n, b / n];
  };
  const corners = [
    pickBlock(0, 0),
    pickBlock(w - 8, 0),
    pickBlock(0, h - 8),
    pickBlock(w - 8, h - 8),
  ];
  // 取四角平均
  let R = 0, G = 0, B = 0;
  corners.forEach((c) => { R += c[0]; G += c[1]; B += c[2]; });
  return { keyR: Math.round(R / 4), keyG: Math.round(G / 4), keyB: Math.round(B / 4) };
}

// 判断是不是绿幕(G 显著高于 R 和 B → 是)/蓝幕(B 显著高)
export function isLikelyChromaKey(keyColor) {
  const { keyR, keyG, keyB } = keyColor;
  // 绿幕: G 比 max(R,B) 高至少 60
  if (keyG > Math.max(keyR, keyB) + 60) return 'green';
  // 蓝幕: B 比 max(R,G) 高至少 60
  if (keyB > Math.max(keyR, keyG) + 60) return 'blue';
  return null;
}
