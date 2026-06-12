// HTML-based HUD overlay. 用 DOM 而不是 Phaser 画布渲染 HUD，
// 元素直接 position:fixed 锚定在浏览器视口上，不受 Phaser 画布坐标系/缩放影响。
// 不会再有「跑出可见区」或「跟不上 resize」的问题。

const SLOT_COUNT = 6;

function el(id) { return document.getElementById(id); }
function pct(ratio) {
  const r = Math.max(0, Math.min(1, ratio || 0));
  return `${(r * 100).toFixed(1)}%`;
}
function formatTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class HudOverlay {
  constructor() {
    this.root = document.getElementById('hud');
    if (!this.root) {
      // eslint-disable-next-line no-console
      console.warn('HudOverlay: #hud not found in DOM');
      return;
    }
    // 战斗启动:强制恢复 HUD 所有 panel + 强制让 #hud 整体可见
    // bossbar/corebar 走 .show class 控制可见,不动它们的 display
    if (this.root) { this.root.style.display = ''; this.root.style.visibility = 'visible'; }
    document.querySelectorAll('#hud .panel').forEach((p) => {
      if (p.classList.contains('bossbar') || p.classList.contains('corebar')) return;
      p.style.display = '';
      p.style.visibility = 'visible';
      p.style.opacity = '1';
    });
    this.portrait = el('hud-portrait');
    this.hp = el('hud-hp');
    this.hpLabel = el('hud-hp-label');
    this.xp = el('hud-xp');
    this.xpLabel = el('hud-xp-label');
    this.lvl = el('hud-lvl');
    this.gold = el('hud-gold');
    this.time = el('hud-time');
    this.kills = el('hud-kills');
    this.bossbar = el('hud-bossbar');
    this.bossname = el('hud-bossname');
    this.bossfill = el('hud-bossfill');
    this.corebar = el('hud-corebar');
    this.corename = el('hud-corename');
    this.corefill = el('hud-corefill');
    this.hotbar = el('hud-hotbar');

    // 用主角头像贴图（同一张 spritesheet 的第 0 帧）作为 portrait 背景
    this.portrait.style.backgroundImage = "url('assets/units/warrior-blue-idle.png')";
    this.portrait.style.backgroundSize = '192px 192px';
    this.portrait.style.backgroundPosition = '50% 30%'; // 把脸放在圆心

    // 生成 6 个槽位
    this.slots = [];
    this.hotbar.innerHTML = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const div = document.createElement('div');
      div.className = 'slot';
      div.innerHTML = `<div class="icon"></div><div class="cd"></div><div class="key"></div><div class="lvl"></div>`;
      this.hotbar.appendChild(div);
      this.slots.push({
        root: div,
        icon: div.querySelector('.icon'),
        cd: div.querySelector('.cd'),
        key: div.querySelector('.key'),
        lvl: div.querySelector('.lvl'),
      });
    }
  }

  // 一次性配置槽位（K + 各武器图标）。
  // entries: [{ icon: 'dash', key: 'K', lvl: '' }, { icon: 'dmg', key: '', lvl: '1' }, ...]
  setSlots(entries) {
    if (!this.slots) return;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = this.slots[i];
      const e = entries[i];
      if (!e || !e.icon) {
        s.icon.style.backgroundImage = '';
        s.key.textContent = '';
        s.lvl.textContent = '';
        s.cd.style.setProperty('--cd', 0);
        continue;
      }
      s.icon.style.backgroundImage = `url('assets/ui/icons/${e.icon}.png')`;
      s.key.textContent = e.key || '';
      s.lvl.textContent = e.lvl || '';
    }
  }

  // 设置某个槽位的冷却比例（0 = 就绪, 1 = 刚释放还剩满冷却）
  setCooldown(i, ratio) {
    const s = this.slots && this.slots[i];
    if (!s) return;
    s.cd.style.setProperty('--cd', Math.max(0, Math.min(1, ratio || 0)) * 100);
  }

  // 每帧更新动态数据
  update(state) {
    if (!this.root) return;
    // 每帧暴力强制显示 — 防止任何后置代码再次 hide 关键面板
    // 性能微乎其微 (3 个查询 + 设 3 个属性)
    if (!this._panelHandles) {
      this._panelHandles = {
        bars: document.querySelector('.panel.hpcluster.bars') || document.querySelector('.panel.bars'),
        xpbar: document.querySelector('.panel.xpbar'),
        bottomstats: document.querySelector('.panel.bottomstats'),
      };
    }
    Object.values(this._panelHandles).forEach((p) => {
      if (!p) return;
      p.style.display = '';
      p.style.visibility = 'visible';
      p.style.opacity = '1';
    });
    if (state.hp != null && state.maxHp) {
      this.hp.style.width = pct(state.hp / state.maxHp);
      this.hpLabel.textContent = `${Math.ceil(state.hp)} / ${state.maxHp}`;
    }
    if (state.xp != null && state.xpToNext) {
      this.xp.style.width = pct(state.xp / state.xpToNext);
      if (this.xpLabel) this.xpLabel.textContent = `XP ${Math.floor(state.xp)} / ${state.xpToNext}`;
    }
    if (state.level != null) this.lvl.textContent = `${state.level}`;
    if (state.gold != null) this.gold.textContent = `${state.gold}`;
    if (state.timeMs != null) {
      const s = Math.floor(state.timeMs / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      this.time.textContent = `${mm}:${ss}`;
    }
    if (state.kills != null) {
      this.kills.textContent = state.killGoal
        ? `${state.kills}/${state.killGoal}`
        : `${state.kills}`;
    }
    // 小地图渲染 (state.minimap = { worldW, worldH, player:{x,y}, core:{x,y,destroyed}, enemies:[{x,y,boss}], spawns:[{x,y}] })
    if (state.minimap) this._renderMinimap(state.minimap);
    // 守塔波次 HUD
    this._renderWavebox(state.wave);
  }

  _renderWavebox(w) {
    if (!this._wb) {
      this._wb = {
        box: document.getElementById('hud-wavebox'),
        label: document.getElementById('hud-wave-label'),
        phase: document.getElementById('hud-wave-phase'),
        prog: document.getElementById('hud-wave-prog'),
      };
    }
    const box = this._wb.box;
    if (!box) return;
    if (!w) { box.classList.remove('show'); return; }
    box.classList.add('show');
    if (w.boss) box.classList.add('boss'); else box.classList.remove('boss');
    this._wb.label.textContent = w.label || '';
    if (w.phase === 'prep') {
      const s = Math.max(0, Math.ceil(w.prepRemainMs / 1000));
      this._wb.phase.textContent = `准备 ${s}s`;
      const pct = w.prepTotalMs ? (1 - w.prepRemainMs / w.prepTotalMs) : 0;
      this._wb.prog.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
    } else {
      // combat
      if (w.boss) {
        this._wb.phase.textContent = `BOSS 战斗中`;
        this._wb.prog.style.width = '100%';
      } else {
        const left = w.living + w.queue;
        this._wb.phase.textContent = `剩余 ${left} / ${w.total}`;
        const pct = w.total ? (1 - left / w.total) : 1;
        this._wb.prog.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
      }
    }
  }

  _renderMinimap(mm) {
    if (!this._mmCtx) {
      const cv = document.getElementById('hud-minimap-canvas');
      if (!cv) return;
      this._mmCv = cv;
      this._mmCtx = cv.getContext('2d');
    }
    const ctx = this._mmCtx;
    const W = this._mmCv.width;
    const H = this._mmCv.height;
    ctx.clearRect(0, 0, W, H);
    if (!mm.worldW || !mm.worldH) return;
    const sx = W / mm.worldW;
    const sy = H / mm.worldH;
    const PX = (x) => x * sx;
    const PY = (y) => y * sy;
    // 网格底色
    ctx.fillStyle = '#1a2a2a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2a3e3e';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const t = (i / 4);
      ctx.beginPath(); ctx.moveTo(t * W, 0); ctx.lineTo(t * W, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, t * H); ctx.lineTo(W, t * H); ctx.stroke();
    }
    // 出生点 (灰)
    if (mm.spawns) {
      ctx.fillStyle = '#80808088';
      mm.spawns.forEach((s) => { ctx.beginPath(); ctx.arc(PX(s.x), PY(s.y), 1.8, 0, Math.PI * 2); ctx.fill(); });
    }
    // 友军 (亮蓝)
    if (mm.allies) {
      ctx.fillStyle = '#60b0ff';
      mm.allies.forEach((a) => { ctx.beginPath(); ctx.arc(PX(a.x), PY(a.y), 2.4, 0, Math.PI * 2); ctx.fill(); });
    }
    // 敌人 (红, boss 大黄)
    if (mm.enemies) {
      mm.enemies.forEach((e) => {
        ctx.fillStyle = e.boss ? '#ffe040' : '#ff5050';
        ctx.beginPath();
        ctx.arc(PX(e.x), PY(e.y), e.boss ? 4 : 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // 水晶塔 (青)
    if (mm.core && !mm.core.destroyed) {
      ctx.fillStyle = '#40e0ff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(PX(mm.core.x), PY(mm.core.y), 4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // 玩家 (亮绿 + 朝向小三角)
    if (mm.player) {
      ctx.fillStyle = '#7cff40';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(PX(mm.player.x), PY(mm.player.y), 4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }

  showBoss(name) {
    if (!this.bossbar) return;
    this.bossname.textContent = name || '首领';
    this.bossfill.style.width = '100%';
    this.bossbar.classList.add('show');
  }

  setBossHp(ratio) {
    if (!this.bossfill) return;
    this.bossfill.style.width = pct(ratio);
  }

  hideBoss() {
    if (this.bossbar) this.bossbar.classList.remove('show');
  }

  showCore(name, hp, maxHp) {
    if (!this.corebar) return;
    if (this.corename) this.corename.textContent = name || '水晶塔';
    this.corebar.classList.add('show');
    this.updateCore(hp, maxHp);
  }

  updateCore(hp, maxHp) {
    if (!this.corefill || !maxHp) return;
    this.corefill.style.width = pct(hp / maxHp);
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    this.corefill.style.background = ratio > 0.5
      ? 'linear-gradient(180deg, #75f0ff, #1684c8)'
      : ratio > 0.25
        ? 'linear-gradient(180deg, #ffe070, #d78720)'
        : 'linear-gradient(180deg, #ff7050, #b02020)';
  }

  hideCore() {
    if (this.corebar) this.corebar.classList.remove('show');
  }

  // —— 死亡 + 排行榜 ——
  // 提交后调用：禁用按钮 + 改文字 + 输入框只读，杜绝重复提交
  lockSubmit(text) {
    const b = el('death-submit');
    const i = el('death-name');
    if (b) { b.disabled = true; b.textContent = text || '已提交'; b.style.opacity = '0.55'; b.style.cursor = 'default'; b.onclick = null; }
    if (i) { i.readOnly = true; }
  }

  showDeath(state, callbacks) {
    // 每次弹出死亡屏：重置提交按钮（前一局可能锁过）
    const b = el('death-submit');
    const i = el('death-name');
    if (b) { b.disabled = false; b.textContent = '提交'; b.style.opacity = ''; b.style.cursor = ''; }
    if (i) { i.readOnly = false; }
    const sub = el('death-sub');
    sub.textContent = `存活 ${formatTime(state.survivalMs)} · 等级 ${state.level} · 击杀 ${state.kills}`;
    el('death-lvlpt').textContent = state.level * 1000;
    el('death-killpt').textContent = state.kills * 10;
    el('death-timept').textContent = Math.floor(state.survivalMs / 1000);
    el('death-score').textContent = state.score;
    const nameInput = el('death-name');
    nameInput.value = state.name || '';
    el('lb-title').textContent = state.remote ? '🏆 排行榜 Top 10（联网实时）' : '🏆 排行榜 Top 10（本地）';
    this._renderLeaderboard(state.top, state.myRank, state.myEntry);
    // 按钮绑定（每次重绑，避免重复触发）
    const submitBtn = el('death-submit');
    const restartBtn = el('death-restart');
    submitBtn.onclick = () => callbacks.onSubmit && callbacks.onSubmit(nameInput.value.trim());
    restartBtn.onclick = () => callbacks.onRestart && callbacks.onRestart();
    nameInput.onkeydown = (e) => { if (e.key === 'Enter') submitBtn.click(); };
    el('death-overlay').classList.add('show');
  }
  updateLeaderboard(top, myRank, myEntry) {
    this._renderLeaderboard(top, myRank, myEntry);
  }
  hideDeath() { const o = el('death-overlay'); if (o) o.classList.remove('show'); }
  _renderLeaderboard(top, myRank, myEntry) {
    const lb = el('death-lb');
    if (!top || !top.length) {
      lb.innerHTML = '<div class="lb-empty">暂无记录,提交你的第一条吧!</div>';
      return;
    }
    const head = '<div class="lb-row head"><span>#</span><span>名字</span><span class="col-r">等级</span><span class="col-r">击杀</span><span class="col-r">分数</span></div>';
    const rows = top.map((e, i) => {
      const isMe = myEntry && e.ts === myEntry.ts && e.name === myEntry.name;
      return `<div class="lb-row ${isMe ? 'me' : ''}">
        <span>${i + 1}</span>
        <span>${escapeHtml(e.name || '?')}</span>
        <span class="col-r">${e.level}</span>
        <span class="col-r">${e.kills}</span>
        <span class="col-r">${e.score}</span>
      </div>`;
    }).join('');
    let trail = '';
    if (myEntry && (!myRank || myRank > top.length)) {
      trail = `<div class="lb-row me"><span>...</span><span>${escapeHtml(myEntry.name)}</span><span class="col-r">${myEntry.level}</span><span class="col-r">${myEntry.kills}</span><span class="col-r">${myEntry.score}</span></div>`;
    }
    lb.innerHTML = head + rows + trail;
  }

  // —— 装备面板 ——
  showGear(state) { this._renderGear(state); el('gear-overlay').classList.add('show'); }
  hideGear() { const o = el('gear-overlay'); if (o) o.classList.remove('show'); }
  updateGear(state) { if (el('gear-overlay').classList.contains('show')) this._renderGear(state); }
  _renderGear(state) {
    el('gear-title').textContent = `装备   金币 ${state.gold}`;
    // 顶部 3 个槽位
    const slotsHtml = state.slots.map((s) => {
      const cls = s.def ? `equipped ${s.def.rarity}` : '';
      const inner = s.def
        ? `${s.def.fallbackIcon || '◆'}<span class="lvl">+${s.eq.level}</span>`
        : '·';
      return `<div class="slot-box"><div class="slot-label">${s.label}</div><div class="frame ${cls}">${inner}</div></div>`;
    }).join('');
    el('gear-slots').innerHTML = slotsHtml;
    // 列表
    const rowsHtml = state.items.map((it, i) => {
      const def = it.def; const rarity = def.rarity;
      const statStr = Object.entries(def.stats).map(([k, v]) => `${state.statLabel(k)}${v > 0 ? '+' : ''}${v}`).join(' ');
      const actClass = it.action === '满级' ? 'act full' : 'act';
      const actStr = it.cost ? `${it.action} ${it.cost}金` : it.action;
      return `<div class="item-row">
        <span class="num">${i + 1}</span>
        <span class="ico">${def.fallbackIcon || '◆'}</span>
        <span class="name ${rarity}">${def.name}</span>
        <span class="stats">${statStr}</span>
        <span class="${actClass}">${actStr}</span>
      </div>`;
    }).join('');
    el('gear-items').innerHTML = rowsHtml;
    el('gear-footer').textContent = `1~${state.items.length} 选择 / 装备 / 升级    Q 翻页 (${state.page + 1}/${state.totalPages})    E 关闭`;
  }

  destroy() {
    // overlay 是全局 DOM，scene restart 时不销毁，只重置内容即可
    if (this.hp) this.hp.style.width = '100%';
    if (this.xp) this.xp.style.width = '0%';
    this.hideBoss();
    this.hideCore();
    this.hideGear();
  }
}
