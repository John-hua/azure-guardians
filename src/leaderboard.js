// 排行榜数据层。
// 抽象出 Adapter 接口；现在默认 LocalAdapter（localStorage，只在自己浏览器内排名）。
// 联网实时切换：实例化 Leaderboard 时把 adapter 换成 RemoteAdapter（已写好骨架）。
//
// 综合分数公式： level × 1000 + kills × 10 + survivalSec
//
// 一条记录形如：{ name, level, kills, survivalMs, score, ts }

export function computeScore({ level = 1, kills = 0, survivalMs = 0 }) {
  return level * 1000 + kills * 10 + Math.floor(survivalMs / 1000);
}

const NAME_KEY = 'tinyswords.player-name';

export function getStoredName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
}
export function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* ignore */ }
}

// —— 本地适配器：localStorage，立刻可用，只在本机有效 ——
class LocalAdapter {
  constructor(key = 'tinyswords.leaderboard.v1') { this.key = key; }
  _load() {
    try {
      const raw = localStorage.getItem(this.key);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  _save(list) {
    try { localStorage.setItem(this.key, JSON.stringify(list.slice(0, 100))); } catch (e) { /* ignore */ }
  }
  async submit(entry) {
    const list = this._load();
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    this._save(list);
    return entry;
  }
  async getTop(n = 10) {
    return this._load().slice(0, n);
  }
}

// —— 远程适配器骨架：联网实时（需要后端 URL）——
// 推荐配置：dreamlo.com / Firebase Firestore / Supabase / 任何能 GET+POST 的端点。
// 把 endpoint 改成实际地址即可。默认 null → 自动回退到本地。
//
// 协议约定（最简）：
//   POST {endpoint}/submit  body=JSON entry  → 返回 entry
//   GET  {endpoint}/top?n=10                → 返回 entry 数组（按 score 降序）
class RemoteAdapter {
  constructor(endpoint) { this.endpoint = endpoint; }
  async submit(entry) {
    try {
      const r = await fetch(`${this.endpoint}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      return r.ok ? r.json() : entry;
    } catch (e) { return entry; }
  }
  async getTop(n = 10) {
    try {
      const r = await fetch(`${this.endpoint}/top?n=${n}`);
      if (!r.ok) return [];
      const list = await r.json();
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
}

// —— 主类：组合本地 + 可选远程 ——
// 联网时：远程优先，失败回退本地；提交时双写（远程主、本地备份）。
export class Leaderboard {
  constructor({ remoteEndpoint = null } = {}) {
    this.local = new LocalAdapter();
    this.remote = remoteEndpoint ? new RemoteAdapter(remoteEndpoint) : null;
  }
  async submit(entry) {
    // 本地一定写（离线也保留记录）
    await this.local.submit(entry);
    if (this.remote) await this.remote.submit(entry);
    return entry;
  }
  async getTop(n = 10) {
    if (this.remote) {
      const list = await this.remote.getTop(n);
      if (list && list.length) return list;
    }
    return this.local.getTop(n);
  }
  // 计算 entry 在 Top 列表中的排名（1 起算），不在 Top 内返回 null
  rankOf(entry, list) {
    if (!entry || !list) return null;
    const idx = list.findIndex((x) => x.ts === entry.ts && x.name === entry.name);
    return idx >= 0 ? idx + 1 : null;
  }
}
