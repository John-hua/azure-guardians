// 英雄/形态库 —— 内建条目 + 用户上传的任意自定义角色 (GIF)
// 每条 entry 都用统一前缀 `${entry.prefix}-idle/run/attack`。
//   - 内建:prefix 固定 (BootScene 已加载这些贴图/动画)
//   - 自定义:prefix = `hero-${id}`,纹理 + 动画在 ensureHeroLoaded 时注册到 scene
//
// 存档:
//   tinyswords.hero.library.v1 → [{ id, name, kind:'builtin'|'custom', prefix, preview?,
//                                    dataUrl?, frameWidth?, frameHeight?, frameCount?, frameRate? }]
//   tinyswords.hero.current.v1 → id (字符串)
//
// 注意:dataUrl 较大,放 localStorage 时可能触发 quota → 抛错让 UI 提示。

const LIB_KEY = 'tinyswords.hero.library.v1';
const CUR_KEY = 'tinyswords.hero.current.v1';
const OLD_KEY = 'tinyswords.hero.v1'; // 迁移用
const FRAME_SIZE = 192;
const MAX_FRAMES = 32;

// 内建英雄表 (永远在库里,不可删,但可被自定义覆盖前缀)
const BUILTINS = [
  { id: 'b-warrior-blue', name: '蓝甲战士', kind: 'builtin',
    prefix: 'warrior-blue', preview: 'assets/units/warrior-blue-idle.png' },
  { id: 'b-warrior-red',  name: '红甲战士', kind: 'builtin',
    prefix: 'warrior-red',  preview: 'assets/units/warrior-red-idle.png' },
];

// 内存缓存 — 装不下 localStorage 的大库走这条 + IDB 备份
const _mem = {};

function _safeReadJson(k, fallback) {
  if (k in _mem) return _mem[k];
  try { const raw = localStorage.getItem(k); if (raw) { const v = JSON.parse(raw); _mem[k] = v; return v; } } catch (e) {}
  return fallback;
}
function _safeWriteJson(k, v) {
  _mem[k] = v;
  const json = JSON.stringify(v);
  try { localStorage.setItem(k, json); }
  catch (e) {
    import('../storage.js?v=3').then(({ saveKV }) => saveKV(k, json)).catch(() => {});
  }
  // 顺手同步到 IDB 备份(防 LS 被清 / 浏览器换设备)
  import('../storage.js?v=3').then(({ saveKV }) => saveKV(k, json)).catch(() => {});
  return true;
}

// 启动时 await — 从 IDB 拉回内存,localStorage 装不下的大库走这条恢复
export async function hydrate() {
  const { loadKV } = await import('../storage.js?v=3');
  for (const k of [LIB_KEY, CUR_KEY]) {
    if (localStorage.getItem(k)) continue;
    const raw = await loadKV(k);
    if (!raw) continue;
    try { _mem[k] = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) {}
  }
}

// 一次性把旧版 single-custom 存档迁移到 library 数组
function _migrateOld() {
  const raw = _safeReadJson(OLD_KEY, null);
  if (!raw) return;
  if (raw.type === 'custom' && raw.dataUrl) {
    const lib = _safeReadJson(LIB_KEY, []);
    if (!lib.some((e) => e.id === 'c-legacy')) {
      lib.push({
        id: 'c-legacy', name: '我的英雄 (旧版迁移)', kind: 'custom', prefix: 'hero-c-legacy',
        dataUrl: raw.dataUrl, frameWidth: raw.frameWidth, frameHeight: raw.frameHeight,
        frameCount: raw.frameCount, frameRate: raw.frameRate,
      });
      _safeWriteJson(LIB_KEY, lib);
    }
    _safeWriteJson(CUR_KEY, 'c-legacy');
  } else if (raw.type === 'builtin' && raw.prefix) {
    _safeWriteJson(CUR_KEY, raw.prefix === 'warrior-red' ? 'b-warrior-red' : 'b-warrior-blue');
  }
  try { localStorage.removeItem(OLD_KEY); } catch (e) {}
}
_migrateOld();

export function getLibrary() {
  const custom = _safeReadJson(LIB_KEY, []);
  // 内建恒在前,自定义在后
  return [...BUILTINS, ...custom.filter((e) => e && e.kind === 'custom' && e.id)];
}

export function getCurrentId() {
  const id = _safeReadJson(CUR_KEY, null);
  if (id && typeof id === 'string') return id;
  return BUILTINS[0].id;
}

export function setCurrent(id) {
  const lib = getLibrary();
  if (!lib.some((e) => e.id === id)) return false;
  _safeWriteJson(CUR_KEY, id);
  return true;
}

export function getCurrentEntry() {
  const id = getCurrentId();
  return getLibrary().find((e) => e.id === id) || BUILTINS[0];
}

export function getEntry(id) {
  return getLibrary().find((e) => e.id === id) || null;
}

// 删除某条自定义 (内建不可删)
export function removeEntry(scene, id) {
  if (BUILTINS.some((b) => b.id === id)) return false;
  const custom = _safeReadJson(LIB_KEY, []);
  const next = custom.filter((e) => e.id !== id);
  _safeWriteJson(LIB_KEY, next);
  // 注销 scene 中的纹理/动画 (不强求,下一次刷新即可)
  if (scene) {
    const pfx = `hero-${id}`;
    ['idle', 'run', 'attack'].forEach((s) => {
      const ak = `${pfx}-${s}`;
      if (scene.anims.exists(ak)) scene.anims.remove(ak);
    });
    const tk = `${pfx}-idle`;
    if (scene.textures.exists(tk)) scene.textures.remove(tk);
  }
  if (getCurrentId() === id) _safeWriteJson(CUR_KEY, BUILTINS[0].id);
  return true;
}

export function renameEntry(id, newName) {
  if (BUILTINS.some((b) => b.id === id)) return false;
  const custom = _safeReadJson(LIB_KEY, []);
  const e = custom.find((x) => x.id === id);
  if (!e) return false;
  e.name = newName;
  _safeWriteJson(LIB_KEY, custom);
  return true;
}

// 用 dataURL 把某条自定义贴图 + 3 动画注册到 scene
async function _registerCustom(scene, entry) {
  const { dataUrl, frameWidth, frameHeight, frameCount, frameRate } = entry;
  const texKey = `${entry.prefix}-idle`;
  if (scene.textures.exists(texKey)) return; // 已注册过
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = (e) => reject(new Error('图片解码失败'));
    i.src = dataUrl;
  });
  scene.textures.addSpriteSheet(texKey, img, { frameWidth, frameHeight });
  const variants = [
    { suffix: 'idle',   rate: Math.max(4, Math.round(frameRate || 8)),       repeat: -1 },
    { suffix: 'run',    rate: Math.max(8, Math.round((frameRate || 10) * 1.2)), repeat: -1 },
    { suffix: 'attack', rate: Math.max(10, Math.round((frameRate || 12) * 1.4)), repeat: 0 },
  ];
  variants.forEach((v) => {
    const ak = `${entry.prefix}-${v.suffix}`;
    if (scene.anims.exists(ak)) scene.anims.remove(ak);
    scene.anims.create({
      key: ak,
      frames: scene.anims.generateFrameNumbers(texKey, { start: 0, end: frameCount - 1 }),
      frameRate: v.rate,
      repeat: v.repeat,
    });
  });
}

// 把当前选中的英雄加载好,返回 animPrefix
export async function ensureHeroLoaded(scene) {
  const entry = getCurrentEntry();
  if (entry.kind === 'builtin') return entry.prefix;
  if (!entry.dataUrl) return BUILTINS[0].prefix;
  try {
    await _registerCustom(scene, entry);
    return entry.prefix;
  } catch (e) {
    console.warn('hero load failed', e);
    return BUILTINS[0].prefix;
  }
}

// 把所有已知自定义英雄全注册到 scene (用于换英雄弹窗预览)
export async function ensureAllCustomLoaded(scene) {
  const lib = getLibrary();
  for (const entry of lib) {
    if (entry.kind !== 'custom') continue;
    if (!entry.dataUrl) continue;
    try { await _registerCustom(scene, entry); } catch (e) { /* skip */ }
  }
}

// 处理上传的 GIF File → 注册 + 入库
export async function addCustomFromGif(scene, file, displayName) {
  if (typeof ImageDecoder === 'undefined') {
    throw new Error('浏览器不支持 GIF 拆帧 (需 Chrome 99+/Firefox 120+/Safari 17+)');
  }
  const decoder = new ImageDecoder({ data: file.stream ? file.stream() : file, type: 'image/gif' });
  await decoder.tracks.ready;
  const track = decoder.tracks.selectedTrack;
  const total = track.frameCount || 1;
  const frameCount = Math.min(total, MAX_FRAMES);
  const frames = [];
  let avgDur = 100;
  for (let i = 0; i < frameCount; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    frames.push(image);
    if (image.duration) avgDur = Math.max(20, Math.round(image.duration / 1000));
  }
  const srcW = frames[0].displayWidth || frames[0].width;
  const srcH = frames[0].displayHeight || frames[0].height;
  const fw = FRAME_SIZE; const fh = FRAME_SIZE;
  const scale = Math.min(fw / srcW, fh / srcH);
  const dw = Math.round(srcW * scale);
  const dh = Math.round(srcH * scale);
  const sheet = document.createElement('canvas');
  sheet.width = fw * frameCount; sheet.height = fh;
  const ctx = sheet.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  frames.forEach((bm, i) => {
    const dx = i * fw + Math.floor((fw - dw) / 2);
    const dy = Math.floor((fh - dh) / 2);
    ctx.drawImage(bm, dx, dy, dw, dh);
  });
  const dataUrl = sheet.toDataURL('image/png');
  const frameRate = Math.max(4, Math.round(1000 / avgDur));

  // 生成 id (顺序累加,避免长串 dataURL 当 key)
  const lib = _safeReadJson(LIB_KEY, []);
  const usedNums = new Set(lib.map((e) => parseInt((e.id || '').replace(/^c-/, ''), 10)).filter((n) => !isNaN(n)));
  let n = 1; while (usedNums.has(n)) n++;
  const id = `c-${n}`;
  const name = (displayName && displayName.trim()) || `自定义 ${n}`;
  const entry = {
    id, name, kind: 'custom', prefix: `hero-${id}`,
    dataUrl, frameWidth: fw, frameHeight: fh, frameCount, frameRate,
  };
  lib.push(entry);
  if (!_safeWriteJson(LIB_KEY, lib)) {
    // 配额满 → 回滚,不入库
    throw new Error(`localStorage 配额不足 — 已存 ${lib.length - 1} 个自定义,无法再加;先删除几个`);
  }
  await _registerCustom(scene, entry);
  return { entry, totalFrames: total };
}

// 取某条 entry 的预览 (CSS background-image 用)
export function getPreviewSource(entry) {
  if (!entry) return null;
  if (entry.kind === 'builtin') return { url: entry.preview, sheetW: 0 };
  // 自定义:dataUrl 是横向 sheet,sheet 宽 = frameWidth * frameCount
  return { url: entry.dataUrl, sheetW: entry.frameWidth };
}
