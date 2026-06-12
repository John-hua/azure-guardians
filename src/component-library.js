// 自定义组件库 — 玩家上传图片 / 精灵序列,变成可放置的编辑器件
// 存储:
//   tinyswords.component.library.v1  → [{ id, key, name, type, dataUrl, frameW?, frameH?, frameCount?, frameRate? }]
//   大数据 (sheet dataURL > 3MB) 自动走 IDB,通过 storage.js 的 saveKV

const LIB_KEY = 'tinyswords.component.library.v1';
const _mem = {};

function _safeRead(k, fb) {
  if (k in _mem) return _mem[k];
  try { const raw = localStorage.getItem(k); if (raw) { const v = JSON.parse(raw); _mem[k] = v; return v; } } catch (e) {}
  return fb;
}

function _safeWrite(k, v) {
  _mem[k] = v;
  const json = JSON.stringify(v);
  try { localStorage.setItem(k, json); }
  catch (e) {
    import('./storage.js?v=3').then(({ saveKV }) => saveKV(k, json)).catch(() => {});
  }
  import('./storage.js?v=3').then(({ saveKV }) => saveKV(k, json)).catch(() => {});
  return true;
}

export function getLibrary() { return _safeRead(LIB_KEY, []); }

export async function hydrate() {
  const { loadKV } = await import('./storage.js?v=3');
  if (!localStorage.getItem(LIB_KEY)) {
    const raw = await loadKV(LIB_KEY);
    if (raw) {
      try { _mem[LIB_KEY] = (typeof raw === 'string') ? JSON.parse(raw) : raw; } catch (e) {}
    }
  }
}

// 加载所有已存组件到当前 scene 的 textures + anims
// 同时清理"孤儿纹理"(textures 里还残留但 library 已删除的 custom-comp-*)
export async function ensureAllLoaded(scene) {
  const lib = getLibrary();
  const validKeys = new Set(lib.map((e) => e.key));
  // 清孤儿
  if (scene.textures && scene.textures.list) {
    Object.keys(scene.textures.list).forEach((k) => {
      if (!k.startsWith('custom-comp-')) return;
      if (validKeys.has(k)) return;
      // 孤儿:删纹理 + 动画 + 视频句柄
      const animKey = `${k}-anim`;
      if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
      // 找到可能的视频句柄 (key 末段是 id)
      const id = k.replace('custom-comp-', '');
      const h = _videoHandles.get(id);
      if (h) {
        try { h.scene.events.off('postupdate', h.refresh); } catch (e) {}
        try { h.vid.pause(); h.vid.removeAttribute('src'); h.vid.load(); } catch (e) {}
        if (h.url) URL.revokeObjectURL(h.url);
        _videoHandles.delete(id);
      }
      try { scene.textures.remove(k); } catch (e) {}
    });
  }
  // 再加载库里的
  for (const entry of lib) {
    if (scene.textures.exists(entry.key)) continue;
    try {
      if (entry.type === 'video') await _registerVideoComponent(scene, entry);
      else await _registerComponent(scene, entry);
    } catch (e) { console.warn('component load failed', entry.id, e); }
  }
}

// 单张图片 → 静态组件 (画质完全保留,直接拿 dataURL)
export async function addStaticComponent(scene, file, name) {
  const dataUrl = await _readFileAsDataURL(file);
  const id = `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const entry = {
    id, key: `custom-comp-${id}`, name: name || file.name.replace(/\.[^.]+$/, ''),
    type: 'static', dataUrl,
  };
  return _saveAndRegister(scene, entry);
}

// 多张精灵图 → 拼无损 sheet + 注册动画
// 文件按名字字典序排列 (frame_001 / 002 / ... 这种命名自动按顺序)
export async function addSpriteSeqComponent(scene, files, name, frameRate = 12) {
  if (!files || !files.length) throw new Error('需要至少 1 张图');
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  // 加载全部
  const imgs = await Promise.all(sorted.map((f) => _loadImageFromFile(f)));
  // 各帧最大边 = sheet 单元尺寸 (居中放置,小帧周围 padding)
  const fw = Math.max(...imgs.map((i) => i.naturalWidth));
  const fh = Math.max(...imgs.map((i) => i.naturalHeight));
  // 自适应行列 (近正方形布局,避免横长条超 GPU 4096 上限)
  const cols = Math.ceil(Math.sqrt(imgs.length));
  const rows = Math.ceil(imgs.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * fw; canvas.height = rows * fh;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; // 像素风零模糊
  imgs.forEach((img, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    // 居中放置帧 (小帧四周保留透明 padding)
    const dx = c * fw + Math.floor((fw - img.naturalWidth) / 2);
    const dy = r * fh + Math.floor((fh - img.naturalHeight) / 2);
    ctx.drawImage(img, dx, dy);
  });
  // GPU 上限检查
  const MAX_TEX = (scene.sys.game.renderer && scene.sys.game.renderer.gl
    && scene.sys.game.renderer.gl.getParameter(scene.sys.game.renderer.gl.MAX_TEXTURE_SIZE)) || 4096;
  if (canvas.width > MAX_TEX || canvas.height > MAX_TEX) {
    throw new Error(`合成 sheet ${canvas.width}×${canvas.height} 超 GPU 上限 ${MAX_TEX}。请减少帧数或降低单帧分辨率`);
  }
  // 输出无损 PNG dataURL
  const dataUrl = canvas.toDataURL('image/png');
  const id = `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const entry = {
    id, key: `custom-comp-${id}`,
    name: name || `序列${id.split('-')[1]}`,
    type: 'animated',
    dataUrl, frameW: fw, frameH: fh, frameCount: imgs.length, frameRate,
  };
  return _saveAndRegister(scene, entry);
}

// 视频组件 (MP4 / MOV / WebM) — Blob 存 IDB,共享 video element + canvas texture
// 多个放置实例同步播放;可选绿幕自动抠图
export async function addVideoComponent(scene, file, name, opts = {}) {
  const id = `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const key = `custom-comp-${id}`;
  const blobKey = `video-comp:${id}`;
  // 大文件存 IDB
  const { saveBlob } = await import('./storage.js?v=3');
  await saveBlob(blobKey, file);
  // 读取尺寸
  const probeUrl = URL.createObjectURL(file);
  const probe = document.createElement('video');
  probe.muted = true; probe.playsInline = true; probe.src = probeUrl;
  await new Promise((res, rej) => {
    probe.addEventListener('loadedmetadata', res, { once: true });
    probe.addEventListener('error', () => rej(new Error('视频解码失败,格式可能不被浏览器支持')), { once: true });
  });
  const natW = probe.videoWidth || 256;
  const natH = probe.videoHeight || 256;
  // 抓首帧作 poster (调色板缩略图用,因为视频 Blob 不能直接当 <img src>)
  let posterUrl = null;
  try {
    probe.currentTime = 0.05;
    await new Promise((res) => { probe.addEventListener('seeked', res, { once: true }); setTimeout(res, 500); });
    const pc = document.createElement('canvas');
    const pw = Math.min(natW, 256);
    const ph = Math.round(pw * (natH / natW));
    pc.width = pw; pc.height = ph;
    pc.getContext('2d').drawImage(probe, 0, 0, pw, ph);
    posterUrl = pc.toDataURL('image/png');
  } catch (e) { /* poster 可选 */ }
  URL.revokeObjectURL(probeUrl);
  const entry = {
    id, key, name: name || file.name.replace(/\.[^.]+$/, ''),
    type: 'video',
    blobKey, natW, natH,
    chromaKey: !!opts.chromaKey,
    sizeMB: +(file.size / 1048576).toFixed(2),
    posterUrl,
  };
  const lib = getLibrary();
  lib.push(entry);
  _safeWrite(LIB_KEY, lib);
  await _registerVideoComponent(scene, entry);
  return entry;
}

const _videoHandles = new Map(); // entry.id -> { vid, canvas, refresh, url }

async function _registerVideoComponent(scene, entry) {
  if (scene.textures.exists(entry.key) || _videoHandles.has(entry.id)) return;
  const { loadBlob } = await import('./storage.js?v=3');
  const blob = await loadBlob(entry.blobKey);
  if (!blob) throw new Error(`视频 Blob 找不到 (id=${entry.id})`);
  const url = URL.createObjectURL(blob);
  const vid = document.createElement('video');
  vid.muted = true; vid.loop = true; vid.playsInline = true; vid.autoplay = true; vid.preload = 'auto';
  vid.src = url;
  await new Promise((res, rej) => {
    vid.addEventListener('loadedmetadata', res, { once: true });
    vid.addEventListener('error', () => rej(new Error(`视频解码失败 (id=${entry.id})`)), { once: true });
  });
  try { await vid.play(); } catch (e) { /* 静音 autoplay 应被允许 */ }
  const canvas = document.createElement('canvas');
  canvas.width = entry.natW; canvas.height = entry.natH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(vid, 0, 0, entry.natW, entry.natH);
  if (scene.textures.exists(entry.key)) scene.textures.remove(entry.key);
  scene.textures.addCanvas(entry.key, canvas);
  // 绿幕自动检测 (entry.chromaKey 开关)
  let chromaOpts = null;
  if (entry.chromaKey) {
    const { detectKeyColor, isLikelyChromaKey } = await import('./chromakey.js?v=1');
    const k = detectKeyColor(ctx, entry.natW, entry.natH);
    if (isLikelyChromaKey(k)) chromaOpts = { ...k, tolerance: 120, smooth: 60, despill: true };
  }
  // 每帧 video → canvas → texture
  const refresh = async () => {
    if (vid.readyState >= 2) {
      ctx.drawImage(vid, 0, 0, entry.natW, entry.natH);
      if (chromaOpts) {
        const { applyChromaKey } = await import('./chromakey.js?v=1');
        applyChromaKey(ctx, entry.natW, entry.natH, chromaOpts);
      }
      const tex = scene.textures.get(entry.key);
      if (tex && tex.refresh) tex.refresh();
    }
    if (vid.ended) { try { vid.currentTime = 0; vid.play().catch(() => {}); } catch (e) {} }
  };
  scene.events.on('postupdate', refresh);
  _videoHandles.set(entry.id, { vid, canvas, refresh, url, scene });
}

export function removeComponent(scene, id) {
  const lib = getLibrary();
  const entry = lib.find((e) => e.id === id);
  if (!entry) return false;
  const next = lib.filter((e) => e.id !== id);
  _safeWrite(LIB_KEY, next);
  // 视频:停 video + 清 blob + 摘 postupdate
  if (entry.type === 'video') {
    const h = _videoHandles.get(id);
    if (h) {
      try { h.scene.events.off('postupdate', h.refresh); } catch (e) {}
      try { h.vid.pause(); h.vid.removeAttribute('src'); h.vid.load(); } catch (e) {}
      if (h.url) URL.revokeObjectURL(h.url);
      _videoHandles.delete(id);
    }
    import('./storage.js?v=3').then(({ deleteBlob }) => deleteBlob(entry.blobKey)).catch(() => {});
  }
  if (scene) {
    const animKey = `${entry.key}-anim`;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    if (scene.textures.exists(entry.key)) scene.textures.remove(entry.key);
  }
  return true;
}

export function renameComponent(id, name) {
  const lib = getLibrary();
  const e = lib.find((x) => x.id === id);
  if (!e) return false;
  e.name = name;
  _safeWrite(LIB_KEY, lib);
  return true;
}

// ===== 内部 =====
async function _saveAndRegister(scene, entry) {
  const lib = getLibrary();
  lib.push(entry);
  _safeWrite(LIB_KEY, lib);
  await _registerComponent(scene, entry);
  return entry;
}

async function _registerComponent(scene, entry) {
  const img = await _loadImageFromDataURL(entry.dataUrl);
  if (entry.type === 'animated') {
    if (scene.textures.exists(entry.key)) scene.textures.remove(entry.key);
    scene.textures.addSpriteSheet(entry.key, img, {
      frameWidth: entry.frameW, frameHeight: entry.frameH,
    });
    const animKey = `${entry.key}-anim`;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(entry.key, { start: 0, end: entry.frameCount - 1 }),
      frameRate: entry.frameRate || 12, repeat: -1,
    });
  } else {
    if (scene.textures.exists(entry.key)) scene.textures.remove(entry.key);
    scene.textures.addImage(entry.key, img);
  }
}

function _loadImageFromFile(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(`解码失败: ${file.name}`)); };
    img.src = url;
  });
}

function _loadImageFromDataURL(dataUrl) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('dataURL 解码失败'));
    img.src = dataUrl;
  });
}

function _readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target.result);
    r.onerror = () => rej(new Error('文件读取失败'));
    r.readAsDataURL(file);
  });
}
