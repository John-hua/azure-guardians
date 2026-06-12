// 敌人库 — 内建条目(已在 BootScene 加载) + 自定义条目(上传 GIF/WebP/APNG)
// 玩家可在敌人面板:
//   - 开关每种敌人是否参与刷怪
//   - 上传新角色作为额外敌人(idle/run/attack 同一组帧)
//
// 存储:
//   tinyswords.enemy.disabled.v1 → [key, ...] 被禁用的(内建+自定义)
//   tinyswords.enemy.library.v1  → 自定义 entry 数组

const DISABLED_KEY = 'tinyswords.enemy.disabled.v1';
const LIB_KEY      = 'tinyswords.enemy.library.v1';
const FRAME_SIZE = 192;
const MAX_FRAMES = 32;

// 内建敌人 — key 对应 WorldScene 的 ENEMY_TYPES,preview 用第一帧贴图
export const BUILTIN_ENEMIES = [
  { key: 'imp',     label: '🔥 小哥布林',     kind: 'melee',  preview: 'assets/goblins/torch.png',     prefix: 'goblin-torch' },
  { key: 'torch',   label: '🔥 火把哥布林',   kind: 'melee',  preview: 'assets/goblins/torch.png',     prefix: 'goblin-torch' },
  { key: 'tnt',     label: '💣 投弹哥布林',   kind: 'ranged', preview: 'assets/goblins/tnt.png',       prefix: 'goblin-tnt' },
  { key: 'warrior', label: '⚔ 红甲战士',      kind: 'melee',  preview: 'assets/units/warrior-red-idle.png', prefix: 'warrior-red' },
  { key: 'archer',  label: '🏹 红甲弓手',      kind: 'ranged', preview: 'assets/units/archer-red-idle.png',  prefix: 'archer-red' },
  { key: 'lancer',  label: '🗡 长矛兵',        kind: 'melee',  preview: 'assets/units/lancer-red-idle.png',  prefix: 'lancer-red' },
  { key: 'pawn',    label: '👷 红甲工兵',      kind: 'melee',  preview: 'assets/units/pawn-red-idle.png',    prefix: 'pawn-red' },
  { key: 'bone',    label: '💀 骷髅持盾',      kind: 'melee',  preview: 'assets/generated/enemies/bone-buckler-idle-strip.png',     prefix: 'bone' },
  { key: 'boom',    label: '🐡 河豚刺爆',      kind: 'melee',  preview: 'assets/generated/enemies/boomspike-puffer-idle-strip.png', prefix: 'boom' },
  { key: 'oar',     label: '🦈 鱼人壮汉',      kind: 'melee',  preview: 'assets/generated/enemies/oarfin-bruiser-idle-strip.png',   prefix: 'oar' },
];
const BUILTIN_KEYS = new Set(BUILTIN_ENEMIES.map((e) => e.key));

// 内存缓存 — 大库(超 5MB)只能在内存 + IDB 之间往返,LS 装不下
const _mem = {};

function _safeRead(k, fb) {
  if (k in _mem) return _mem[k];
  try { const raw = localStorage.getItem(k); if (raw) { const v = JSON.parse(raw); _mem[k] = v; return v; } } catch (e) {}
  return fb;
}
function _safeWrite(k, v) {
  _mem[k] = v;
  const json = JSON.stringify(v);
  // 先试 LS;装不下落 IDB(异步,不阻塞)
  try { localStorage.setItem(k, json); }
  catch (e) {
    import('../storage.js?v=3').then(({ saveKV }) => saveKV(k, json)).catch(() => {});
  }
  // 不论是否 LS 成功,都顺手同步一份到 IDB 备份(防 LS 被清)
  import('../storage.js?v=3').then(({ saveKV }) => saveKV(k, json)).catch(() => {});
  return true; // 内存写入永远成功
}

// 启动时调用 — 把 IDB 里的库灌到内存(localStorage 装不下的大库走这条)
export async function hydrate() {
  const { loadKV } = await import('../storage.js?v=3');
  for (const k of [LIB_KEY, DISABLED_KEY]) {
    if (localStorage.getItem(k)) continue;     // LS 有就用 LS 的(sync 快)
    const raw = await loadKV(k);
    if (!raw) continue;
    try { _mem[k] = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) {}
  }
}

export function getDisabledSet() { return new Set(_safeRead(DISABLED_KEY, [])); }
export function isEnabled(key) { return !getDisabledSet().has(key); }
export function setEnabled(key, on) {
  const s = getDisabledSet();
  if (on) s.delete(key); else s.add(key);
  _safeWrite(DISABLED_KEY, [...s]);
}

export function getCustomLibrary() { return _safeRead(LIB_KEY, []); }
export function getLibrary() { return [...BUILTIN_ENEMIES, ...getCustomLibrary()]; }
export function getEntry(key) { return getLibrary().find((e) => e.key === key) || null; }
export function isBuiltin(key) { return BUILTIN_KEYS.has(key); }

// 过滤后的可用 spawn 池 — WorldScene.spawnTick 用
export function filterSpawnPool(originalPool) {
  const disabled = getDisabledSet();
  const filtered = originalPool.filter((k) => !disabled.has(k));
  // 全部禁用 → 兜底用第一个内建,防止 spawn 死循环
  return filtered.length ? filtered : [BUILTIN_ENEMIES[0].key];
}

// 把全部自定义敌人在场景上注册纹理+动画(每场景开始时调一次)
export async function ensureCustomEnemiesLoaded(scene) {
  const lib = getCustomLibrary();
  for (const entry of lib) {
    if (!entry.dataUrl) continue;
    if (scene.textures.exists(`${entry.prefix}-idle`)) continue;
    try { await _registerCustom(scene, entry); } catch (e) { /* skip */ }
  }
}

// 注入到 ENEMY_TYPES (WorldScene 调用时把自定义条目合进运行时表)
export function injectCustomTypes(ENEMY_TYPES) {
  const lib = getCustomLibrary();
  lib.forEach((e) => {
    if (!ENEMY_TYPES[e.key]) {
      ENEMY_TYPES[e.key] = {
        kind: e.kind || 'melee',
        texture: `${e.prefix}-idle`,
        anim: e.prefix,
        hp: e.hp || 30,
        dmg: e.dmg || 8,
        speed: e.speed || 100,
        scale: e.scale || 0.9,
        attackDist: e.attackDist || 50,
      };
    }
  });
}

async function _registerCustom(scene, entry) {
  const { dataUrl, frameWidth, frameHeight, frameCount, frameRate, prefix } = entry;
  const texKey = `${prefix}-idle`;
  if (scene.textures.exists(texKey)) return;
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i); i.onerror = reject; i.src = dataUrl;
  });
  scene.textures.addSpriteSheet(texKey, img, { frameWidth, frameHeight });
  const variants = [
    { suffix: 'idle',   rate: Math.max(4, Math.round(frameRate || 8)),       repeat: -1 },
    { suffix: 'run',    rate: Math.max(8, Math.round((frameRate || 10) * 1.2)), repeat: -1 },
    { suffix: 'attack', rate: Math.max(10, Math.round((frameRate || 12) * 1.4)), repeat: 0 },
  ];
  variants.forEach((v) => {
    const ak = `${prefix}-${v.suffix}`;
    if (scene.anims.exists(ak)) scene.anims.remove(ak);
    scene.anims.create({
      key: ak,
      frames: scene.anims.generateFrameNumbers(texKey, { start: 0, end: frameCount - 1 }),
      frameRate: v.rate, repeat: v.repeat,
    });
  });
}

// 上传 GIF/WebP/APNG → 注册到当前场景 + 入库
export async function addCustomEnemyFromAnimatedFile(scene, file, displayName, opts = {}) {
  if (typeof ImageDecoder === 'undefined') {
    throw new Error('浏览器不支持拆帧 (需 Chrome 99+/Firefox 120+/Safari 17+)');
  }
  const ext = (file.name || '').toLowerCase().match(/\.(gif|apng|webp|png)$/);
  let mime = file.type || 'image/gif';
  if (ext) {
    if (ext[1] === 'apng') mime = 'image/apng';
    if (ext[1] === 'webp') mime = 'image/webp';
    if (ext[1] === 'gif')  mime = 'image/gif';
  }
  const buffer = await file.arrayBuffer();
  const decoder = new ImageDecoder({ data: buffer, type: mime });
  await decoder.tracks.ready;
  try { await decoder.completed; } catch (e) {}
  const track = decoder.tracks.selectedTrack;
  let total = track.frameCount || 0;
  if ((!total || total <= 1) && track.animated) {
    total = 0;
    try { while (total < 120) { await decoder.decode({ frameIndex: total, completeFramesOnly: true }); total++; } } catch (e) {}
  }
  if (!total) total = 1;
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
  const fw = FRAME_SIZE, fh = FRAME_SIZE;
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
  // 生成 key
  const lib = getCustomLibrary();
  const usedNums = new Set(lib.map((e) => parseInt((e.key || '').replace(/^enemy-c-/, ''), 10)).filter((n) => !isNaN(n)));
  let n = 1; while (usedNums.has(n)) n++;
  const key = `enemy-c-${n}`;
  const prefix = `enemy-${n}`;
  const name = (displayName && displayName.trim()) || `自定义敌人 ${n}`;
  const entry = {
    key, label: name, prefix, kind: opts.kind || 'melee', preview: dataUrl,
    dataUrl, frameWidth: fw, frameHeight: fh, frameCount, frameRate,
    hp: opts.hp || 30, dmg: opts.dmg || 8, speed: opts.speed || 100, scale: opts.scale || 0.9,
  };
  lib.push(entry);
  if (!_safeWrite(LIB_KEY, lib)) {
    throw new Error(`localStorage 配额不足,无法保存 (当前已存 ${lib.length - 1} 个自定义)`);
  }
  await _registerCustom(scene, entry);
  return { entry, totalFrames: total };
}

export function removeCustomEnemy(scene, key) {
  if (isBuiltin(key)) return false;
  const lib = getCustomLibrary();
  const entry = lib.find((e) => e.key === key);
  if (!entry) return false;
  const next = lib.filter((e) => e.key !== key);
  _safeWrite(LIB_KEY, next);
  if (scene) {
    ['idle', 'run', 'attack'].forEach((s) => {
      const ak = `${entry.prefix}-${s}`;
      if (scene.anims.exists(ak)) scene.anims.remove(ak);
    });
    const tk = `${entry.prefix}-idle`;
    if (scene.textures.exists(tk)) scene.textures.remove(tk);
  }
  // 同步清禁用集中的残留
  const dis = getDisabledSet();
  if (dis.has(key)) { dis.delete(key); _safeWrite(DISABLED_KEY, [...dis]); }
  return true;
}
