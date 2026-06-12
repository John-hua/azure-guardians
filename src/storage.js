// 混合 KV 存储 — 小数据走 localStorage(同步快读),大数据(>3MB)走 IndexedDB(配额几 GB)
// 编辑器布局含底图 dataUrl 时常超 5MB localStorage 上限 → 自动落 IDB
// 读取时先查 localStorage(向后兼容旧档),没命中再查 IDB

const DB_NAME = 'tinyswords';
const DB_VER = 1;
const STORE = 'kv';
const LS_BUDGET_BYTES = 3 * 1024 * 1024; // 单条 > 3MB 直接走 IDB

let _dbPromise = null;
function _openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function _idbOp(mode, fn) {
  return _openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  }));
}

export async function idbGet(key) {
  try { return await _idbOp('readonly', (s) => s.get(key)); } catch (e) { return null; }
}
export async function idbSet(key, value) {
  return _idbOp('readwrite', (s) => s.put(value, key));
}
export async function idbDel(key) {
  try { await _idbOp('readwrite', (s) => s.delete(key)); } catch (e) {}
}
export async function idbKeys() {
  try { return await _idbOp('readonly', (s) => s.getAllKeys()); } catch (e) { return []; }
}

// 读 KV:先 localStorage(向后兼容/快路径),否则 IDB
export async function loadKV(key) {
  try {
    const v = localStorage.getItem(key);
    if (v != null) return v;
  } catch (e) {}
  return await idbGet(key);
}

// 写 KV:小走 localStorage(并清掉 IDB 残留),大走 IDB(并清掉 localStorage 残留)
// 返回 { backend, sizeMB }
export async function saveKV(key, value) {
  const sizeBytes = value.length;
  const sizeMB = sizeBytes / 1048576;
  if (sizeBytes <= LS_BUDGET_BYTES) {
    try {
      localStorage.setItem(key, value);
      idbDel(key); // 异步即可,失败也无伤
      return { backend: 'localStorage', sizeMB };
    } catch (e) { /* 配额满 → 退路 IDB */ }
  }
  await idbSet(key, value);
  try { localStorage.removeItem(key); } catch (e) {}
  return { backend: 'IndexedDB', sizeMB };
}

// 删除某 key (两边都清)
export async function deleteKV(key) {
  try { localStorage.removeItem(key); } catch (e) {}
  await idbDel(key);
}

// 同步快读 (用于场景启动等不便 async 的场合) — 只能拿 localStorage 里的
// 大底图不会在这条路径上,无大碍
export function loadKVSync(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

// ===== Blob 直存通道 (视频/大二进制) =====
// MP4 这种大文件不要 base64 进 JSON — 直接以 Blob 形态写 IDB,省 33% 空间 + 大幅加速序列化
export async function saveBlob(key, blob) {
  return _idbOp('readwrite', (s) => s.put(blob, key));
}
export async function loadBlob(key) {
  try { return await _idbOp('readonly', (s) => s.get(key)); } catch (e) { return null; }
}
export async function deleteBlob(key) {
  try { await _idbOp('readwrite', (s) => s.delete(key)); } catch (e) {}
}
