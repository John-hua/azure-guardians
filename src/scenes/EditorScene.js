// 独立地形搭建场景：完全空白画布(只有水面 + 草地底色),不刷怪、不掉血
// 顶部有"切换岛屿"和"保存/导出"按钮，可同时管理多岛布局。
// 编辑器面板复用 Editor 类。
//
// 入口：HomeScene 主城点击"🛠 搭建地形"按钮 → 进入。
// 退出：右上角"返回主城"按钮 → 回 HomeScene。

import { TILE, MAP_COLS, MAP_ROWS, ISLAND } from '../config/constants.js?v=3';
import { ISLANDS } from '../config/islands.js?v=3';
import { Editor } from '../editor.js?v=3';
import Player from '../entities/Player.js?v=3';
import { ensureHeroLoaded } from '../config/hero.js?v=3';
import { openHeroPicker, closeHeroPicker } from '../hero-picker.js?v=3';

export default class EditorScene extends Phaser.Scene {
  constructor() { super('EditorScene'); }

  init(data) {
    this._islandIdx = (data && typeof data.islandIdx === 'number') ? data.islandIdx : 0;
    // 编辑器编辑哪种模式的地图:优先 data.mode,否则读用户在主城选的 gameMode
    this._mode = (data && (data.mode === 'survival' || data.mode === 'defense'))
      ? data.mode
      : (function _read() {
          try { const v = localStorage.getItem('tinyswords.gameMode'); if (v === 'survival' || v === 'defense') return v; } catch (e) {}
          return 'defense';
        })();
  }

  create() {
    const worldW = MAP_COLS * TILE;
    const worldH = MAP_ROWS * TILE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.physics.world.setBounds(0, 0, worldW, worldH);

    // 1) 干净画布：水面 + 草地基底
    if (this.textures.exists('ik-water-tile')) {
      this.add.tileSprite(0, 0, worldW, worldH, 'ik-water-tile').setOrigin(0).setDepth(-100);
    } else {
      this.add.rectangle(0, 0, worldW, worldH, 0x4ea3ff).setOrigin(0).setDepth(-100);
    }
    const x0 = ISLAND.x0 * TILE;
    const y0 = ISLAND.y0 * TILE;
    const w = (ISLAND.x1 - ISLAND.x0 + 1) * TILE;
    const h = (ISLAND.y1 - ISLAND.y0 + 1) * TILE;
    if (this.textures.exists('ik-grass-base')) {
      this.add.tileSprite(x0, y0, w, h, 'ik-grass-base').setOrigin(0).setDepth(-90);
    } else {
      this.add.rectangle(x0, y0, w, h, 0x7bc04a).setOrigin(0).setDepth(-90);
    }

    // 2) addSolid 占位 (Editor.setCollide 需要)
    this.solids = this.physics.add.staticGroup();
    this.addSolid = (x, y, ww, hh) => {
      const r = this.add.rectangle(x, y, ww, hh, 0xff0000, 0).setOrigin(0.5);
      this.physics.add.existing(r, true);
      this.solids.add(r);
      return r;
    };

    // 3) 摄像机平移：键盘 WASD/箭头 控制 camera
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    // 中心位置开始
    this.cameras.main.scrollX = worldW / 2 - this.scale.width / 2;
    this.cameras.main.scrollY = worldH / 2 - this.scale.height / 2;

    // 4) 编辑器
    this.enemies = this.add.group(); // Editor 引用时不会崩
    this._islandIdx = this._islandIdx || 0;
    this.editor = new Editor(this);
    // 强制进入编辑模式
    this.editor.enter();
    // 自动加载本岛 + 当前模式的布局 (混合 localStorage + IndexedDB,带旧档 fallback)
    import('../storage.js?v=3').then(async ({ loadKV }) => {
      const modeKey = `tinyswords.layout.v1.island.${this._islandIdx}.${this._mode}`;
      let raw = await loadKV(modeKey);
      if (!raw && this._mode === 'defense') {
        raw = await loadKV(`tinyswords.layout.v1.island.${this._islandIdx}`);
      }
      if (raw) this.editor._applyLayout(JSON.parse(raw));
    }).catch(() => {});

    // 4.5) 参照英雄 — 真 Player(物理 + 动画 + 碰撞), 可 WASD 走 / 拖动瞬移
    // 模式默认是"走位": WASD 走英雄,摄像机跟随;
    // 长按 空格 临时切到"看图"模式: WASD 移动摄像机, 松开恢复。
    const heroPrefix = (this.game.registry && this.game.registry.get('heroPrefix')) || 'warrior-blue';
    this._refHero = new Player(this, worldW / 2, worldH / 2, heroPrefix);
    this._refHero.setScale(0.9).setDepth(900000);
    // 与 piece 物理体 + 全部 solids 碰撞 (editor.enter 已停用 auto solids,只剩 piece + 用户画的)
    this.physics.add.collider(this._refHero, this.solids);
    // 拖动瞬移 (依然保留 — 想跳到某个位置不用走过去)
    this._refHero.setInteractive({ draggable: true, useHandCursor: true });
    this.input.setDraggable(this._refHero);
    this._refHero.on('dragstart', () => { this._refDragging = true; this._refHero.body.enable = false; });
    this._refHero.on('drag', (_p, dx, dy) => { this._refHero.setPosition(dx, dy); });
    this._refHero.on('dragend', () => {
      this._refHero.body.enable = true;
      this.time.delayedCall(50, () => { this._refDragging = false; });
    });
    // 摄像机跟随
    this.cameras.main.startFollow(this._refHero, true, 0.12, 0.12);
    // 头顶小标签
    this._refHeroLabel = this.add.text(worldW / 2, worldH / 2 - 70, '英雄(WASD 走位 · 空格切看图 · H 换形象)', {
      fontFamily: 'monospace', fontSize: '11px', color: '#cfe9ff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(900001);
    // 空格 = 临时摄像机模式
    this._camMode = false;
    this.input.keyboard.on('keydown-SPACE', () => { this._camMode = true; });
    this.input.keyboard.on('keyup-SPACE',   () => { this._camMode = false; });
    // H 键打开角色库 (热替换参照英雄)
    this.input.keyboard.on('keydown-H', () => {
      openHeroPicker(this, { onPick: (entry) => this._swapRefHero(entry) });
    });
    // 用 registry 监听:HomeScene 改了形象也立即同步
    this.game.registry.events.on('changedata-heroPrefix', (_g, prefix) => {
      this._swapRefHero({ prefix });
    });
    this.events.once('shutdown', () => {
      this.game.registry.events.off('changedata-heroPrefix');
      closeHeroPicker();
    });

    // 5) 顶部工具栏（HTML，岛屿切换 + 返回主城）
    this._buildTopBar();

    // 6) 标题/提示
    this.add.text(this.scale.width / 2, 16, '🛠 地形编辑器 — 独立画布', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffe070',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(99999);
  }

  update() {
    const cam = this.cameras.main;
    // 看图模式 (空格按住): WASD 移动摄像机,英雄站定
    if (this._camMode) {
      cam.stopFollow();
      const speed = 10;
      if (this.cursors.left.isDown  || this.wasd.left.isDown)  cam.scrollX -= speed;
      if (this.cursors.right.isDown || this.wasd.right.isDown) cam.scrollX += speed;
      if (this.cursors.up.isDown    || this.wasd.up.isDown)    cam.scrollY -= speed;
      if (this.cursors.down.isDown  || this.wasd.down.isDown)  cam.scrollY += speed;
      if (this._refHero && this._refHero.body) this._refHero.setVelocity(0, 0);
    } else if (this._refHero && this._refHero.update) {
      // 走位模式:WASD 走英雄,摄像机自动跟随 (上一帧若刚松开空格,这里重新挂跟随)
      if (this._wasCamMode) { cam.startFollow(this._refHero, true, 0.12, 0.12); this._wasCamMode = false; }
      this._refHero.update(this.cursors, this.wasd);
    }
    if (this._camMode) this._wasCamMode = true;
    // 头顶小标签跟随
    if (this._refHero && this._refHeroLabel) {
      this._refHeroLabel.setPosition(this._refHero.x, this._refHero.y - 70);
    }
  }

  // 热替换参照英雄外观 (不重生 — 保留位置 / 朝向)
  _swapRefHero(entry) {
    const p = this._refHero;
    if (!p || !entry || !entry.prefix) return;
    if (!this.textures.exists(`${entry.prefix}-idle`)) return;
    if (!this.anims.exists(`${entry.prefix}-idle`)) return;
    p.animPrefix = entry.prefix;
    p.evoTier = 1;
    p.clearTint();
    p.setTexture(`${entry.prefix}-idle`, 0);
    p.play(p.anim('idle'), true);
  }

  _buildTopBar() {
    if (document.getElementById('editor-topbar')) return;
    const bar = document.createElement('div');
    bar.id = 'editor-topbar';
    bar.innerHTML = `
      <style>
        #editor-topbar {
          position: fixed; left: 0; top: 0; right: 280px; height: 44px; z-index: 96;
          background: #1a0e08ee; color: #fff; display: flex; align-items: center;
          padding: 0 12px; gap: 10px; font: 12px/1.4 monospace;
          border-bottom: 2px solid #c2a35e;
        }
        #editor-topbar select, #editor-topbar button {
          background: #c2a35e; color: #1a0e08; border: 0; padding: 6px 10px;
          font: bold 12px monospace; border-radius: 3px; cursor: pointer;
        }
        #editor-topbar button:hover { background: #ffd07a; }
        #editor-topbar .spacer { flex: 1; }
      </style>
      <span>编辑岛屿:</span>
      <select id="ed-island-sel"></select>
      <span>模式:</span>
      <select id="ed-mode-sel">
        <option value="defense">🛡 守塔</option>
        <option value="survival">⚔ 无尽</option>
      </select>
      <button id="ed-lock-default" style="background:#5ec46b">💾 锁定当前为默认</button>
      <span style="color:#aaa">WASD = 平移 · F1 收起面板 · 两模式独立存档</span>
      <span class="spacer"></span>
      <button id="ed-back">← 返回主城</button>
    `;
    document.body.appendChild(bar);
    const sel = document.getElementById('ed-island-sel');
    const modeSel = document.getElementById('ed-mode-sel');
    modeSel.value = this._mode;
    modeSel.onchange = (e) => {
      // 切模式 = 重启场景换 layout 槽位
      bar.remove();
      const ui = document.getElementById('editor-ui');
      if (ui) ui.remove();
      this.scene.restart({ islandIdx: this._islandIdx, mode: e.target.value });
    };
    ISLANDS.forEach((isl) => {
      const o = document.createElement('option');
      o.value = isl.idx; o.textContent = `${isl.idx + 1}. ${isl.name}`;
      sel.appendChild(o);
    });
    sel.value = this._islandIdx;
    sel.onchange = (e) => {
      const idx = parseInt(e.target.value, 10);
      // 切岛屿：销毁顶栏 + 重启场景
      bar.remove();
      this.scene.restart({ islandIdx: idx });
    };
    document.getElementById('ed-back').onclick = () => {
      bar.remove();
      // 退出前隐藏编辑器 UI
      const ui = document.getElementById('editor-ui');
      if (ui) ui.remove();
      this.scene.start('HomeScene');
    };
    document.getElementById('ed-lock-default').onclick = async () => {
      // 一键保存当前编辑成果到当前模式槽 (defense 或 survival)
      if (this.editor && this.editor.saveToStorage) {
        const ok = await this.editor.saveToStorage();
        if (ok) {
          const modeLabel = this._mode === 'survival' ? '⚔ 无尽' : '🛡 守塔';
          this.editor._announce && this.editor._announce(`✅ 已锁定为 ${modeLabel} 模式默认地形`);
        }
      }
    };
  }

  shutdown() {
    const bar = document.getElementById('editor-topbar');
    if (bar) bar.remove();
    const ui = document.getElementById('editor-ui');
    if (ui) ui.remove();
  }
}
