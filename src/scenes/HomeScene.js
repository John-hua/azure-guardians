// 主城 / 选岛场景 — HTML overlay 版
// Phaser 仅渲染背景插画 + 云雾;所有 UI 走 HTML+CSS,使用 assets/ui/generated 资产。

import { ISLANDS } from '../config/islands.js?v=3';
import { Leaderboard } from '../leaderboard.js?v=3';
import { openHeroPicker } from '../hero-picker.js?v=3';
import { openMusicPicker } from '../music-picker.js?v=3';

const HOME_BG_KEY = 'home-cover-poster';
const HOME_FALLBACK_BG_KEY = 'home-bg-iso';

const ASSETS = 'assets/ui/generated';

const ISLAND_STORY = {
  0: { chapter: 'I',   title: '草原哨站', note: '村庄的风车仍在转动,哥布林已经摸到谷仓外。', accent: '#7ed36b', accentSoft: 'rgba(126,211,107,.18)' },
  1: { chapter: 'II',  title: '霜桥远征', note: '冰雾封住了古桥,巡逻骑士在雪线尽头等待。', accent: '#9fd9f6', accentSoft: 'rgba(159,217,246,.18)' },
  2: { chapter: 'III', title: '熔岩王座', note: '黑岩裂缝中有火光呼吸,魔将正在重铸军团。', accent: '#ff8a4a', accentSoft: 'rgba(255,138,74,.18)' },
};

const HOME_LORE_HTML = `
  <p class="story-headline">敌军压境,主城征召<em>最后的骑士</em></p>
  <p class="story-body">敌潮正从<em>火山裂谷</em>涌上浮岛。穿过草原、霜桥与<em>熔岩王座</em>,点亮失落航路。</p>
  <p class="story-body">每次升级都会改变战局,每次阵亡都把下一次推得更远。</p>
`;

const MODE_KEY = 'tinyswords.gameMode';
function getMode() {
  try { const v = localStorage.getItem(MODE_KEY); if (v === 'survival' || v === 'defense') return v; } catch (e) {}
  return 'defense';
}
function setMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (e) {} }

export default class HomeScene extends Phaser.Scene {
  constructor() { super('HomeScene'); }

  create() {
    this._cleanupOverlays();
    this._mode = getMode();

    const W = this.scale.width;
    const H = this.scale.height;
    this.cameras.main.setBackgroundColor('#0d1922');
    this._renderBackground(W, H);
    this._renderClouds(W, H);
    this._buildHtmlHome();

    // 场景切换前清理 HTML 覆盖层
    this.events.once('shutdown', () => this._destroyHtmlHome());
    this.events.once('destroy',  () => this._destroyHtmlHome());
  }

  _cleanupOverlays() {
    ['death-overlay', 'gear-overlay'].forEach((id) => {
      const o = document.getElementById(id);
      if (o) o.classList.remove('show');
    });
    const boss = document.getElementById('hud-bossbar');
    if (boss) boss.classList.remove('show');
    ['hero-picker', 'enemy-picker', 'music-picker', 'hud-hero-swap', 'hud-enemy-picker', 'hud-music-picker', 'home-music-btn', 'home-overlay'].forEach((id) => {
      const o = document.getElementById(id);
      if (o) o.remove();
    });
    ['topleft', 'topright', 'hotbar', 'hint', 'bottomstats', 'xpbar', 'corebar', 'hpcluster', 'wavebox', 'minimap'].forEach((cls) => {
      document.querySelectorAll(`.panel.${cls}`).forEach((el) => { el.style.display = 'none'; });
    });
  }

  _renderBackground(W, H) {
    if (this.textures.exists(HOME_BG_KEY)) {
      const bg = this.add.image(W / 2, H / 2, HOME_BG_KEY);
      const scale = Math.max(W / bg.width, H / bg.height);
      bg.setScale(scale).setAlpha(1);
    } else if (this.textures.exists(HOME_FALLBACK_BG_KEY)) {
      const bg = this.add.image(W / 2, H / 2, HOME_FALLBACK_BG_KEY);
      const scale = Math.max(W / bg.width, H / bg.height);
      bg.setScale(scale).setAlpha(0.98);
    }
    // 大幅度暗角 + 顶部暗色 vignette, 让 HTML UI 文字浮起来
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x000810, 0x000810, 0x000810, 0x000810, 0.36, 0.12, 0.02, 0.62);
    sky.fillRect(0, 0, W, H);
    sky.fillStyle(0x000810, 0.20);
    sky.fillRect(0, H * 0.7, W, H * 0.3);
    const vignette = this.add.graphics();
    vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.10, 0.10, 0.55);
    vignette.fillRect(0, 0, W, H);
  }

  _renderClouds(W, H) {
    if (!this.textures.exists('cloud1')) return;
    const c1 = this.add.image(W * 0.16, H * 0.16, 'cloud1').setAlpha(0.22).setScale(1.7);
    const c2 = this.add.image(W * 0.82, H * 0.24, this.textures.exists('cloud2') ? 'cloud2' : 'cloud1').setAlpha(0.18).setScale(1.5);
    this.tweens.add({ targets: c1, x: c1.x + 24, duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: c2, x: c2.x - 28, duration: 6400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ==================== HTML overlay 主页 ====================
  _buildHtmlHome() {
    if (document.getElementById('home-overlay')) return;
    const root = document.createElement('div');
    root.id = 'home-overlay';
    root.innerHTML = this._homeMarkup();
    this._injectHomeStyles();
    document.body.appendChild(root);

    // 初始化状态
    this._setActiveMode(this._mode);
    this._wireHomeHandlers();
    this._loadTop3();
  }

  _destroyHtmlHome() {
    const el = document.getElementById('home-overlay');
    if (el) el.remove();
    const style = document.getElementById('home-overlay-style');
    if (style) style.remove();
  }

  _homeMarkup() {
    const islandHtml = ISLANDS.map((isl, i) => {
      const story = ISLAND_STORY[isl.idx] || ISLAND_STORY[0];
      const locked = i > 0; // 暂时只解锁第一关
      return `
        <article class="chapter-card${locked ? ' is-locked' : ''}" data-idx="${isl.idx}" style="--accent:${story.accent}; --accent-soft:${story.accentSoft};">
          <div class="chapter-illu">
            <div class="chapter-illu-bg"></div>
            <div class="chapter-illu-glyph">${story.title.slice(0, 1)}</div>
          </div>
          <img class="chapter-frame" src="${ASSETS}/chapter-card-frame.png" alt="" draggable="false">
          <div class="chapter-roman">${story.chapter}</div>
          <div class="chapter-meta">
            <div class="chapter-title">${isl.name || story.title}</div>
            <div class="chapter-note">${story.note}</div>
            <div class="chapter-stats">
              <span class="stat-pill">难度 ×${(isl.spawnMultiplier || 1).toFixed(1)}</span>
              <span class="stat-pill">Boss · ${isl.bossName || '?'}</span>
            </div>
          </div>
          ${locked ? `<img class="chapter-lock" src="${ASSETS}/lock-chain.png" alt="" draggable="false"><div class="chapter-locktip">通关前一关解锁</div>` : ''}
        </article>
      `;
    }).join('');

    return `
      <div class="home-stage">
        <!-- ──── 100% 可靠的背景层 (CSS object-fit:cover) ──── -->
        <div class="home-bg" role="presentation"></div>
        <!-- 大气层: 粒子/雾 + 暗角 + 顶底渐变 -->
        <div class="home-atmos" aria-hidden="true">
          <span class="dust dust-a"></span><span class="dust dust-b"></span><span class="dust dust-c"></span>
          <span class="dust dust-d"></span><span class="dust dust-e"></span><span class="dust dust-f"></span>
        </div>
        <div class="home-vignette" aria-hidden="true"></div>
        <!-- 电影 letterbox 上下条 -->
        <div class="home-letterbox home-letterbox-top" aria-hidden="true"></div>
        <div class="home-letterbox home-letterbox-bottom" aria-hidden="true"></div>

        <!-- ────────── 故事 + CTA ────────── -->
        <section class="home-story">
          <div class="story-vignette">
            ${HOME_LORE_HTML}
          </div>

          <div class="cta-cluster">
            <div class="mode-toggle" role="tablist">
              <button class="mode-btn" data-mode="defense" role="tab">
                <span class="mode-icon">🛡</span><span class="mode-label">守塔模式</span>
                <span class="mode-hint">保护水晶塔</span>
              </button>
              <button class="mode-btn" data-mode="survival" role="tab">
                <span class="mode-icon">⚔</span><span class="mode-label">无尽杀戮</span>
                <span class="mode-hint">击杀 1000 通关</span>
              </button>
            </div>

            <button class="cta-primary" data-action="start">
              <span class="cta-sheen"></span>
              <span class="cta-rim"></span>
              <span class="cta-label">⚔ 开始远征</span>
            </button>
          </div>
        </section>

        <!-- ────────── 左下角 rail ────────── -->
        <nav class="rail-bottom" aria-label="主城功能">
          <button class="rail-btn" data-action="editor" data-tip="搭建地形">
            <span class="rail-icon">🛠</span>
          </button>
          <button class="rail-btn" data-action="hero" data-tip="换英雄">
            <span class="rail-icon">🦸</span>
          </button>
          <button class="rail-btn" data-action="leaderboard" data-tip="战功榜">
            <span class="rail-icon">🏆</span>
          </button>
          <button class="rail-btn" data-action="music" data-tip="音乐">
            <span class="rail-icon">🎵</span>
          </button>
        </nav>

        <!-- ────────── 战功榜 飞出层 ────────── -->
        <div class="leaderboard-flyout" id="hb-leaderboard">
          <img class="lb-bg" src="${ASSETS}/panel-parchment.png" alt="" draggable="false">
          <div class="lb-inner">
            <div class="lb-header">
              <span class="lb-medal">🏆</span>
              <span class="lb-title">战功榜 · Top 5</span>
            </div>
            <img class="lb-divider" src="${ASSETS}/divider-ornament.png" alt="" draggable="false">
            <ol class="lb-list" id="hb-lb-list"><li class="lb-empty">读取中…</li></ol>
          </div>
        </div>

        <!-- ────────── 章节 carousel ────────── -->
        <section class="chapter-dock">
          <div class="dock-header">
            <span class="dock-eyebrow">SELECT  YOUR  PATH</span>
            <h2 class="dock-title">选择远征航路</h2>
            <img class="dock-divider" src="${ASSETS}/divider-ornament.png" alt="" draggable="false">
          </div>
          <div class="chapter-row">
            ${islandHtml}
          </div>
        </section>
      </div>
    `;
  }

  _injectHomeStyles() {
    if (document.getElementById('home-overlay-style')) return;
    const s = document.createElement('style');
    s.id = 'home-overlay-style';
    s.textContent = `
      #home-overlay {
        position: fixed; inset: 0; z-index: 50; pointer-events: none;
        font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
        color: #f5e8c8;
        --gold:        #c2a35e;
        --gold-hi:     #ffd87a;
        --gold-dark:   #8a7340;
        --cream:       #f5e8c8;
        --cream-mute:  #a8967a;
        --stone:       #1e1612;
        --stone-soft:  #2a2018;
        --vermilion:   #c0392b;
        --vermilion-hi:#e74c3c;
      }
      #home-overlay > .home-stage {
        position: absolute; inset: 0;
        display: grid;
        grid-template-columns: minmax(520px, 1.05fr) minmax(0, 1.4fr);
        grid-template-rows: auto 1fr auto;
        grid-template-areas:
          "hero    ."
          "story   ."
          "dock    dock";
        padding: 48px 64px 40px;
        pointer-events: auto;
        gap: 0;
      }

      /* ============ 大气层: 背景 + 暗角 + letterbox + 粒子 ============ */
      #home-overlay .home-bg {
        position: absolute; inset: 0; z-index: -3;
        background-image: url('assets/ui/home/home-cover-poster.png');
        background-size: cover;
        background-position: center 30%;
        background-repeat: no-repeat;
        background-color: #0a1726;
        /* 入场缓慢 zoom — 电影感 */
        animation: bgZoom 26s ease-in-out infinite;
      }
      @keyframes bgZoom {
        0%, 100% { transform: scale(1.04) translateX(-4px); }
        50%      { transform: scale(1.08) translateX(8px); }
      }
      #home-overlay .home-vignette {
        position: absolute; inset: 0; z-index: -2;
        pointer-events: none;
        background:
          radial-gradient(ellipse 110% 80% at 50% 55%, transparent 30%, rgba(0,0,0,.45) 75%, rgba(0,0,0,.78) 100%),
          linear-gradient(180deg, rgba(6,12,20,.55) 0%, transparent 22%, transparent 78%, rgba(6,12,20,.55) 100%),
          linear-gradient(90deg, rgba(6,12,20,.35) 0%, transparent 30%, transparent 70%, rgba(6,12,20,.35) 100%);
      }
      #home-overlay .home-atmos {
        position: absolute; inset: 0; z-index: -1;
        pointer-events: none;
        overflow: hidden;
      }
      #home-overlay .home-atmos .dust {
        position: absolute;
        width: 3px; height: 3px;
        background: radial-gradient(circle, rgba(255,230,180,.85), transparent 70%);
        border-radius: 50%;
        filter: blur(0.6px);
        will-change: transform, opacity;
      }
      #home-overlay .home-atmos .dust-a { left:10%; top:60%; animation: dustRise 13s linear infinite; }
      #home-overlay .home-atmos .dust-b { left:24%; top:80%; animation: dustRise 17s linear infinite -3s; width:2px;height:2px; }
      #home-overlay .home-atmos .dust-c { left:42%; top:70%; animation: dustRise 21s linear infinite -8s; width:4px;height:4px; }
      #home-overlay .home-atmos .dust-d { left:58%; top:85%; animation: dustRise 15s linear infinite -5s; }
      #home-overlay .home-atmos .dust-e { left:75%; top:65%; animation: dustRise 19s linear infinite -11s; width:2px;height:2px; }
      #home-overlay .home-atmos .dust-f { left:88%; top:75%; animation: dustRise 14s linear infinite -2s; width:3px;height:3px; }
      @keyframes dustRise {
        0%   { transform: translateY(0) translateX(0); opacity: 0; }
        15%  { opacity: 0.85; }
        80%  { opacity: 0.55; }
        100% { transform: translateY(-90vh) translateX(20px); opacity: 0; }
      }
      /* 电影 letterbox 顶/底条 — 不是死黑, 是金线 + 渐变 */
      #home-overlay .home-letterbox {
        position: absolute; left: 0; right: 0;
        height: 38px;
        pointer-events: none;
        z-index: 70;
      }
      #home-overlay .home-letterbox-top {
        top: 0;
        background: linear-gradient(180deg, rgba(6,10,18,.92) 0%, rgba(6,10,18,.6) 60%, transparent 100%);
        border-bottom: 1px solid rgba(194,163,94,.25);
        box-shadow: 0 1px 0 rgba(255,216,122,.08), 0 16px 28px -16px rgba(0,0,0,.5) inset;
      }
      #home-overlay .home-letterbox-bottom {
        bottom: 0;
        background: linear-gradient(0deg, rgba(6,10,18,.92) 0%, rgba(6,10,18,.6) 60%, transparent 100%);
        border-top: 1px solid rgba(194,163,94,.25);
        box-shadow: 0 -1px 0 rgba(255,216,122,.08), 0 -16px 28px -16px rgba(0,0,0,.5) inset;
      }
      /* 顶 letterbox 上层加一行小金字 (居中) */
      #home-overlay .home-letterbox-top::before {
        content: 'SKYGUARD  ·  AZURE  GUARDIANS  ·  CHRONICLE  I';
        position: absolute;
        left: 50%; top: 50%; transform: translate(-50%, -50%);
        font-family: 'Cinzel', 'Times New Roman', serif;
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.6em;
        color: rgba(255,216,122,.55);
        text-shadow: 0 1px 2px rgba(0,0,0,.6);
        white-space: nowrap;
      }

      /* ====== 主标题 ====== */
      #home-overlay .home-hero {
        grid-area: hero;
        align-self: start;
      }
      #home-overlay .hero-title {
        display: block;
        width: clamp(360px, 36vw, 560px);
        height: auto;
        margin-left: -28px;
        filter: drop-shadow(0 8px 16px rgba(0,0,0,.65)) drop-shadow(0 0 24px rgba(255,184,74,.32));
        animation: heroBreath 3.4s ease-in-out infinite;
        user-select: none;
      }
      @keyframes heroBreath {
        0%, 100% { filter: drop-shadow(0 8px 16px rgba(0,0,0,.65)) drop-shadow(0 0 24px rgba(255,184,74,.32)); }
        50%      { filter: drop-shadow(0 8px 16px rgba(0,0,0,.65)) drop-shadow(0 0 32px rgba(255,184,74,.50)); }
      }

      /* ====== 故事区 + CTA ====== */
      #home-overlay .home-story {
        grid-area: story;
        align-self: end;
        max-width: 540px;
        padding-top: 12px;
      }
      #home-overlay .story-vignette {
        position: relative;
        padding: 18px 22px 18px 26px;
        margin-bottom: 22px;
        background:
          linear-gradient(180deg, rgba(20,14,10,.55) 0%, rgba(20,14,10,.28) 100%);
        border-radius: 14px;
        backdrop-filter: blur(2px) saturate(120%);
        -webkit-backdrop-filter: blur(2px) saturate(120%);
      }
      #home-overlay .story-vignette::before {
        /* 左侧金色发光竖线 */
        content: '';
        position: absolute; left: 8px; top: 14px; bottom: 14px;
        width: 2px;
        background: linear-gradient(180deg, transparent 0%, var(--gold-hi) 30%, var(--gold) 70%, transparent 100%);
        box-shadow: 0 0 8px rgba(255,216,122,.6);
      }
      #home-overlay .story-headline {
        margin: 0 0 10px;
        font-size: 18px; font-weight: 700; letter-spacing: 0.5px;
        color: var(--cream);
        text-shadow: 0 2px 4px rgba(0,0,0,.75);
      }
      #home-overlay .story-headline em,
      #home-overlay .story-body em {
        font-style: normal;
        color: var(--gold-hi);
        font-weight: 600;
        text-shadow: 0 1px 3px rgba(0,0,0,.7), 0 0 8px rgba(255,184,74,.4);
      }
      #home-overlay .story-body {
        margin: 0 0 8px;
        font-size: 13.5px; line-height: 1.7;
        color: #e8d7b0;
        text-shadow: 0 1px 3px rgba(0,0,0,.85);
      }

      /* ====== Mode toggle ====== */
      #home-overlay .cta-cluster { display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
      #home-overlay .mode-toggle {
        display: flex; gap: 8px; padding: 4px;
        background: rgba(20,14,10,.55);
        border-radius: 10px;
        border: 1px solid rgba(194,163,94,.25);
      }
      #home-overlay .mode-btn {
        display: flex; flex-direction: column; align-items: center;
        gap: 1px; padding: 8px 16px;
        background: transparent; border: none;
        color: var(--cream-mute);
        font: 600 12px/1 inherit;
        cursor: pointer;
        border-radius: 7px;
        transition: all .18s ease;
        position: relative;
      }
      #home-overlay .mode-btn .mode-icon { font-size: 16px; line-height: 1; margin-bottom: 4px; }
      #home-overlay .mode-btn .mode-label { font-size: 13px; letter-spacing: 1px; }
      #home-overlay .mode-btn .mode-hint { font-size: 10px; opacity: .7; margin-top: 2px; letter-spacing: 0.5px; }
      #home-overlay .mode-btn:hover { color: var(--cream); }
      #home-overlay .mode-btn.is-active {
        background: linear-gradient(180deg, rgba(255,216,122,.18), rgba(194,163,94,.08));
        color: var(--gold-hi);
        box-shadow: inset 0 0 0 1px rgba(255,216,122,.4), 0 0 14px rgba(255,184,74,.18);
      }
      #home-overlay .mode-btn.is-active::after {
        content: ''; position: absolute; left: 14%; right: 14%; bottom: 3px; height: 2px;
        background: var(--gold-hi); border-radius: 2px;
        box-shadow: 0 0 6px var(--gold-hi);
      }

      /* ====== CTA 主按钮 ====== */
      #home-overlay .cta-primary {
        position: relative; isolation: isolate;
        padding: 16px 38px 18px;
        min-width: 260px;
        font: 800 18px/1 -apple-system, "PingFang SC", sans-serif;
        letter-spacing: 6px;
        color: #fff7d0;
        text-shadow: 0 2px 0 #5a1004, 0 0 12px #ffe07088;
        background:
          radial-gradient(ellipse at top, #f06e52 0%, #e74c3c 22%, #c0392b 60%, #7a1c12 100%);
        border: none;
        border-radius: 14px;
        cursor: pointer;
        box-shadow:
          0 0 0 1px #ffd87a,
          0 0 0 4px #8a7340,
          0 12px 28px rgba(0,0,0,.5),
          0 0 32px rgba(255,184,74,.35);
        transform: translateZ(0);
        transition: transform .14s ease, box-shadow .2s ease;
        animation: ctaBreath 1.8s ease-in-out infinite;
      }
      @keyframes ctaBreath {
        0%, 100% { box-shadow: 0 0 0 1px #ffd87a, 0 0 0 4px #8a7340, 0 12px 28px rgba(0,0,0,.5), 0 0 32px rgba(255,184,74,.35); }
        50%      { box-shadow: 0 0 0 1px #ffd87a, 0 0 0 4px #8a7340, 0 14px 32px rgba(0,0,0,.5), 0 0 52px rgba(255,184,74,.65); }
      }
      #home-overlay .cta-primary .cta-sheen {
        position: absolute; left: 4px; right: 4px; top: 4px; height: 40%;
        background: linear-gradient(180deg, rgba(255,255,255,.32), rgba(255,255,255,0));
        border-radius: 10px 10px 0 0;
        pointer-events: none;
      }
      #home-overlay .cta-primary:hover {
        transform: translateY(-2px) scale(1.02);
      }
      #home-overlay .cta-primary:active {
        transform: translateY(1px) scale(0.99);
      }
      #home-overlay .cta-primary .cta-label { position: relative; z-index: 1; }

      /* ====== 左下 rail ====== */
      #home-overlay .rail-bottom {
        position: fixed;
        left: 26px;
        bottom: 60px;            /* 抬高让出底部 letterbox */
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: auto;
        z-index: 75;             /* 高于 letterbox 70, 始终可点 */
      }
      #home-overlay .rail-btn {
        position: relative;
        width: 56px; height: 56px;
        background: url('${ASSETS}/icon-base-stone-idle.png') center/contain no-repeat;
        border: none;
        cursor: pointer;
        transition: transform .14s ease, filter .14s ease;
        padding: 0;
      }
      #home-overlay .rail-btn .rail-icon {
        position: absolute; inset: 0;
        display: grid; place-items: center;
        font-size: 22px;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,.6));
        pointer-events: none;
      }
      #home-overlay .rail-btn:hover {
        background-image: url('${ASSETS}/icon-base-stone-hover.png');
        transform: translateY(-2px);
      }
      #home-overlay .rail-btn:active {
        background-image: url('${ASSETS}/icon-base-stone-pressed.png');
        transform: translateY(1px);
      }
      #home-overlay .rail-btn::after {
        /* 文字标签从右侧滑出 */
        content: attr(data-tip);
        position: absolute;
        left: 64px; top: 50%;
        transform: translateY(-50%) translateX(-6px);
        opacity: 0;
        padding: 4px 12px;
        background: rgba(20,14,10,.92);
        border: 1px solid var(--gold-dark);
        border-radius: 6px;
        color: var(--gold-hi);
        font: 600 12px/1 inherit;
        letter-spacing: 1px;
        white-space: nowrap;
        pointer-events: none;
        transition: opacity .18s ease, transform .18s ease;
      }
      #home-overlay .rail-btn:hover::after {
        opacity: 1;
        transform: translateY(-50%) translateX(0);
      }

      /* ====== 战功榜飞出 ====== */
      #home-overlay .leaderboard-flyout {
        position: fixed;
        left: 98px;
        bottom: 60px;            /* 抬高对齐 rail */
        width: 320px;
        height: 230px;
        opacity: 0;
        pointer-events: none;
        transform: translateX(-12px);
        transition: opacity .22s ease, transform .22s ease;
        z-index: 76;             /* 高于 letterbox + rail */
      }
      #home-overlay .leaderboard-flyout.show {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(0);
      }
      #home-overlay .leaderboard-flyout .lb-bg {
        position: absolute; inset: 0; width: 100%; height: 100%;
        filter: drop-shadow(0 8px 18px rgba(0,0,0,.6));
      }
      #home-overlay .leaderboard-flyout .lb-inner {
        position: relative;
        padding: 22px 26px 18px;
        color: #2a1a0a;
      }
      #home-overlay .leaderboard-flyout .lb-header {
        display: flex; align-items: center; gap: 8px;
        font: 800 16px/1 inherit;
        color: #4a2e10;
        letter-spacing: 1px;
      }
      #home-overlay .leaderboard-flyout .lb-medal { font-size: 18px; }
      #home-overlay .leaderboard-flyout .lb-divider {
        display: block;
        width: 100%;
        margin: 8px 0 6px;
        opacity: .85;
      }
      #home-overlay .leaderboard-flyout .lb-list {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 5px;
      }
      #home-overlay .leaderboard-flyout .lb-list li {
        display: flex; align-items: center;
        font: 600 12px/1.4 inherit;
        color: #3a2208;
        gap: 8px;
        padding: 2px 4px;
      }
      #home-overlay .leaderboard-flyout .lb-rank { width: 16px; color: #8a4e10; font-weight: 800; }
      #home-overlay .leaderboard-flyout .lb-name { flex: 1; color: #1a0e08; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #home-overlay .leaderboard-flyout .lb-score { color: #6c4a18; font-weight: 700; letter-spacing: 0.5px; }
      #home-overlay .leaderboard-flyout .lb-empty { color: #8a6c40; padding: 18px 0; text-align: center; }

      /* ====== 章节 dock ====== */
      #home-overlay .chapter-dock {
        grid-area: dock;
        margin-top: 24px;
        align-self: end;
        /* 给章节区一个微弱的"舞台 spotlight" 让它从背景里浮起来 */
        position: relative;
      }
      #home-overlay .chapter-dock::before {
        content: '';
        position: absolute;
        left: 50%; bottom: -20px;
        transform: translateX(-50%);
        width: 80%; max-width: 1080px; height: 200px;
        background: radial-gradient(ellipse at center, rgba(255,184,74,.10) 0%, transparent 70%);
        pointer-events: none;
        z-index: -1;
      }
      #home-overlay .dock-header {
        text-align: center;
        margin-bottom: 20px;
      }
      #home-overlay .dock-eyebrow {
        display: inline-block;
        font: 700 11px/1 'Cinzel', 'Times New Roman', serif;
        letter-spacing: 7px;
        color: var(--gold);
        text-shadow: 0 1px 2px rgba(0,0,0,.8);
        opacity: .88;
        margin-bottom: 6px;
      }
      #home-overlay .dock-title {
        margin: 6px 0 0;
        font: 900 28px/1 inherit;
        color: var(--gold-hi);
        letter-spacing: 8px;
        background: linear-gradient(180deg, #fff6e0 0%, #ffd87a 50%, #8a6328 100%);
        -webkit-background-clip: text;
                background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 4px 0 rgba(0,0,0,.5);
        filter: drop-shadow(0 0 18px rgba(255,184,74,.35));
      }
      #home-overlay .dock-divider {
        display: block;
        margin: 10px auto 0;
        width: 320px;
        opacity: .90;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,.6));
      }
      #home-overlay .chapter-row {
        display: flex; justify-content: center; gap: 32px;
        padding: 0 24px;
      }

      /* ====== 章节卡 — 大一号, 更有存在感 ====== */
      #home-overlay .chapter-card {
        position: relative;
        width: 304px;
        height: 208px;
        cursor: pointer;
        transition: transform .28s cubic-bezier(.2,.7,.3,1), filter .28s ease;
      }
      #home-overlay .chapter-card:not(.is-locked):hover {
        transform: translateY(-6px) scale(1.025);
        filter: drop-shadow(0 12px 20px rgba(0,0,0,.5)) drop-shadow(0 0 18px var(--accent));
      }
      #home-overlay .chapter-card .chapter-illu {
        position: absolute;
        left: 18px; top: 28px; right: 18px; bottom: 18px;
        border-radius: 6px;
        overflow: hidden;
      }
      #home-overlay .chapter-card .chapter-illu-bg {
        position: absolute; inset: 0;
        background:
          radial-gradient(ellipse at center top, var(--accent-soft) 0%, transparent 70%),
          linear-gradient(160deg, rgba(20,14,10,.85), rgba(40,28,20,.92));
      }
      #home-overlay .chapter-card .chapter-illu-glyph {
        position: absolute; inset: 0;
        display: grid; place-items: center;
        font: 900 96px/1 "PingFang SC", "Songti SC", serif;
        color: var(--accent);
        opacity: 0.16;
        letter-spacing: -4px;
        pointer-events: none;
      }
      #home-overlay .chapter-card .chapter-frame {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        pointer-events: none;
      }
      #home-overlay .chapter-card .chapter-roman {
        position: absolute;
        left: 50%; top: 5px;
        transform: translateX(-50%);
        font: 800 14px/1 "Cinzel", "Times New Roman", serif;
        color: var(--gold-hi);
        z-index: 2;
        text-shadow: 0 1px 2px rgba(0,0,0,.8);
        pointer-events: none;
      }
      #home-overlay .chapter-card .chapter-meta {
        position: absolute;
        left: 28px; right: 28px; bottom: 22px;
        z-index: 1;
        pointer-events: none;
      }
      #home-overlay .chapter-card .chapter-title {
        font: 800 18px/1.1 inherit;
        color: #fff;
        letter-spacing: 2px;
        text-shadow: 0 2px 4px rgba(0,0,0,.9), 0 0 12px var(--accent);
        margin-bottom: 4px;
      }
      #home-overlay .chapter-card .chapter-note {
        font: 500 11px/1.4 inherit;
        color: #e8d7b0;
        text-shadow: 0 1px 2px rgba(0,0,0,.95);
        margin-bottom: 8px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      #home-overlay .chapter-card .chapter-stats {
        display: flex; gap: 6px;
      }
      #home-overlay .chapter-card .stat-pill {
        display: inline-block;
        padding: 2px 8px;
        background: rgba(20,14,10,.7);
        border: 1px solid rgba(194,163,94,.4);
        border-radius: 10px;
        font: 600 10px/1.4 inherit;
        color: var(--gold-hi);
        letter-spacing: 0.3px;
        white-space: nowrap;
      }

      /* 锁定态 */
      #home-overlay .chapter-card.is-locked {
        filter: grayscale(85%) brightness(0.55);
        cursor: not-allowed;
      }
      #home-overlay .chapter-card.is-locked .chapter-lock {
        position: absolute;
        left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        width: 90px;
        opacity: .9;
        z-index: 3;
        pointer-events: none;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,.7));
      }
      #home-overlay .chapter-card.is-locked .chapter-locktip {
        position: absolute;
        left: 0; right: 0; bottom: 8px;
        text-align: center;
        font: 600 10px/1 inherit;
        color: #c4a460;
        letter-spacing: 1px;
        z-index: 3;
        text-shadow: 0 1px 2px rgba(0,0,0,1);
        pointer-events: none;
      }

      /* ====== Responsive ====== */
      @media (max-width: 1100px) {
        #home-overlay > .home-stage {
          grid-template-columns: 1fr;
          grid-template-areas: "hero" "story" "dock";
          padding: 20px 24px 20px;
        }
        #home-overlay .home-story { max-width: 100%; }
        #home-overlay .hero-title { width: clamp(280px, 60vw, 440px); margin-left: 0; }
        #home-overlay .chapter-card { width: 220px; height: 160px; }
      }
    `;
    document.head.appendChild(s);
  }

  _setActiveMode(mode) {
    this._mode = mode;
    setMode(mode);
    document.querySelectorAll('#home-overlay .mode-btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.mode === mode);
    });
  }

  _wireHomeHandlers() {
    const overlay = document.getElementById('home-overlay');
    if (!overlay) return;

    // Mode toggle
    overlay.querySelectorAll('.mode-btn').forEach((b) => {
      b.addEventListener('click', () => this._setActiveMode(b.dataset.mode));
    });

    // CTA — 开始远征
    overlay.querySelector('[data-action="start"]').addEventListener('click', () => {
      this._fadeStart({ islandIdx: 0 });
    });

    // 章节卡
    overlay.querySelectorAll('.chapter-card').forEach((card) => {
      const idx = parseInt(card.dataset.idx, 10);
      card.addEventListener('click', () => {
        if (card.classList.contains('is-locked')) {
          card.animate(
            [{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
            { duration: 180, iterations: 1 },
          );
          return;
        }
        this._fadeStart({ islandIdx: idx });
      });
    });

    // Rail buttons
    overlay.querySelectorAll('.rail-btn').forEach((b) => {
      const a = b.dataset.action;
      if (a === 'editor') {
        b.addEventListener('click', () => {
          this.cameras.main.fade(260, 0, 0, 0);
          this.time.delayedCall(280, () => this.scene.start('EditorScene', { islandIdx: 0 }));
        });
      } else if (a === 'hero') {
        b.addEventListener('click', () => openHeroPicker(this));
      } else if (a === 'leaderboard') {
        const fly = document.getElementById('hb-leaderboard');
        let open = false;
        const toggle = () => {
          open = !open;
          fly.classList.toggle('show', open);
        };
        b.addEventListener('click', toggle);
        // 点外部关闭
        document.addEventListener('click', (ev) => {
          if (!open) return;
          if (b.contains(ev.target) || fly.contains(ev.target)) return;
          open = false;
          fly.classList.remove('show');
        });
      } else if (a === 'music') {
        b.addEventListener('click', () => openMusicPicker(this));
      }
    });
  }

  _fadeStart({ islandIdx }) {
    this.cameras.main.fade(260, 0, 0, 0);
    this.time.delayedCall(280, () => this.scene.start('WorldScene', { islandIdx, mode: this._mode, killGoal: 1000 }));
  }

  _loadTop3() {
    const lb = new Leaderboard({ remoteEndpoint: null });
    lb.getTop(5).then((top) => {
      const el = document.getElementById('hb-lb-list');
      if (!el) return;
      if (!top || !top.length) {
        el.innerHTML = '<li class="lb-empty">还没有人留下战功</li>';
        return;
      }
      const medals = ['🥇', '🥈', '🥉', '4', '5'];
      el.innerHTML = top.slice(0, 5).map((e, i) => `
        <li>
          <span class="lb-rank">${medals[i]}</span>
          <span class="lb-name">${(e.name || '?').toString().slice(0, 12)}</span>
          <span class="lb-score">Lv${e.level} · ${e.score}</span>
        </li>
      `).join('');
    }).catch(() => {
      const el = document.getElementById('hb-lb-list');
      if (el) el.innerHTML = '<li class="lb-empty">读取失败</li>';
    });
  }
}
