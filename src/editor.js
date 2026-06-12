// 地形编辑器：在 WorldScene 上挂一个 in-game 编辑模式
//
// 触发：F1 进入/退出编辑模式
// 用法：
//   - 编辑模式下游戏暂停（敌人/玩家冻结）
//   - 右侧 HTML 面板浏览资产，点击缩略图选中"画笔"
//   - 地图上点击 → 放置该件；点击已放置件 → 选中(蓝框)
//   - 拖动选中件 → 移动；滚轮 → 缩放；Delete/右键 → 删除
//   - 保存按钮：localStorage + 下载 JSON 文件
//   - 加载按钮：从 localStorage 加载，或选 JSON 文件加载
//
// 存档数据形如：
//   { islandIdx, pieces: [{ tex, x, y, scale, originX, originY, depthMode }, ...] }
// 加载后，WorldScene 会跳过自动 _placeLandmark / _scatterNature / placeTree 等，
// 直接按 pieces 列表渲染。

import { ISLAND, MAP_COLS, MAP_ROWS, TILE as _TILE_UNUSED } from './config/constants.js?v=3'; // eslint-disable-line no-unused-vars
import { saveKV, loadKV, saveBlob, loadBlob, deleteBlob } from './storage.js?v=3';
import { applyChromaKey, detectKeyColor, isLikelyChromaKey } from './chromakey.js?v=1';
import { addStaticComponent, addSpriteSeqComponent, addVideoComponent, getLibrary as getCompLibrary,
  removeComponent as removeComp, renameComponent as renameComp, ensureAllLoaded as ensureCompsLoaded } from './component-library.js?v=1';

const STORAGE_PREFIX = 'tinyswords.layout.v1.island.';
const TILE = 64;

// === 自适应碰撞 footprint 分析（按贴图像素扫描，结果按 texture key 缓存）===
// 对一个 texture 找它的"地基矩形"：扫描底部 25% 像素带，
// 找最左/最右/最下不透明列，得到真实接地区域。
// 返回值都是 texture-native 像素坐标（相对 texture 左上角）。
const _footprintCache = new Map();
function computeFootprint(texture) {
  if (!texture || !texture.key) return null;
  if (_footprintCache.has(texture.key)) return _footprintCache.get(texture.key);
  const img = texture.getSourceImage();
  if (!img) return null;
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return null;
  let data;
  try {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    data = ctx.getImageData(0, 0, W, H).data;
  } catch (e) { return null; }
  // 找最底部不透明行
  let bottomY = -1;
  for (let y = H - 1; y >= 0 && bottomY < 0; y--) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 40) { bottomY = y; break; }
    }
  }
  if (bottomY < 0) return null;
  // 底部 25% 带内的 footprint 宽度（接地点的左右范围）
  const bandTop = Math.max(0, bottomY - Math.floor(H * 0.25));
  let minX = W; let maxX = -1;
  for (let y = bandTop; y <= bottomY; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (maxX < 0) return null;
  const fpW = maxX - minX + 1;
  const fpH = Math.min(bottomY - bandTop + 1, Math.max(8, Math.round(H * 0.2)));
  const result = {
    cx: minX + fpW / 2,            // footprint 中心 X (texture 像素)
    cy: bottomY - fpH / 2 + 1,     // footprint 中心 Y (texture 像素)
    w: fpW, h: fpH,
    texW: W, texH: H,
  };
  _footprintCache.set(texture.key, result);
  return result;
}

// 把纹理 key 映射回 PNG 实际文件路径（用作缩略图 img src，不依赖 Phaser）
function texKeyToUrl(key) {
  // 自定义组件: 从 library 拿预览 URL
  // - 静态/动画图: entry.dataUrl
  // - 视频: entry.posterUrl (上传时抓的首帧)
  if (key && key.startsWith('custom-comp-')) {
    const lib = (function _read() {
      try { const raw = localStorage.getItem('tinyswords.component.library.v1');
        if (raw) return JSON.parse(raw); } catch (e) {}
      return [];
    })();
    const entry = lib.find((e) => e.key === key);
    if (!entry) return null;
    return entry.posterUrl || entry.dataUrl || null;
  }
  // ik-cliff-NN / ik-forest-NN / ik-path-NN / ik-prop-NN
  let m = key.match(/^ik-(cliff|forest|path|prop)-(\d{2})$/);
  if (m) {
    const dirMap = {
      cliff: 'island-cliffs-plateaus', forest: 'island-forest-rocks-flowers',
      path: 'island-path-water', prop: 'island-landmark-props',
    };
    return `assets/terrain/island-kit/${dirMap[m[1]]}/${dirMap[m[1]]}-${m[2]}.png`;
  }
  // ik-cliff-{top,left,right,tl,tr,bl,br}
  m = key.match(/^ik-cliff-(top|left|right|tl|tr|bl|br)$/);
  if (m) {
    const fileMap = { top: 'cliff-top-edge', left: 'cliff-left-edge', right: 'cliff-right-edge',
      tl: 'cliff-corner-tl', tr: 'cliff-corner-tr', bl: 'cliff-corner-bl', br: 'cliff-corner-br' };
    return `assets/terrain/island-kit/cliffs-extra/${fileMap[m[1]]}.png`;
  }
  // ik-grass-*
  m = key.match(/^ik-grass-(base|varA|varB)$/);
  if (m) {
    const fileMap = { base: 'grass-tile-base', varA: 'grass-tile-variation-A', varB: 'grass-tile-variation-B' };
    return `assets/terrain/island-kit/grass/${fileMap[m[1]]}.png`;
  }
  // ik-biome-*
  m = key.match(/^ik-biome-(\w+)$/);
  if (m) return `assets/terrain/island-kit/biomes/biome-${m[1]}-floor.png`;
  // ik-water-tile
  if (key === 'ik-water-tile') return 'assets/terrain/island-kit/water/water-tile.png';
  // ik-path-edge-fade
  if (key === 'ik-path-edge-fade') return 'assets/terrain/island-kit/path/path-edge-fade.png';
  // ik-landmark-NAME
  m = key.match(/^ik-landmark-(.+)$/);
  if (m) return `assets/terrain/island-kit/landmarks/landmark-${m[1]}.png`;
  // ik-nature-NAME
  m = key.match(/^ik-nature-(.+)$/);
  if (m) return `assets/terrain/island-kit/nature/nature-${m[1]}.png`;
  return null;
}

function texKeyToDataUrl(scene, key) {
  if (!scene || !scene.textures || !scene.textures.exists(key)) return null;
  const texture = scene.textures.get(key);
  const img = texture && texture.getSourceImage ? texture.getSourceImage() : null;
  if (!img) return null;
  const W = img.naturalWidth || img.videoWidth || img.width || 0;
  const H = img.naturalHeight || img.videoHeight || img.height || 0;
  if (!W || !H) return null;
  try {
    const maxSide = 96;
    const scale = Math.min(1, maxSide / Math.max(W, H));
    const w = Math.max(1, Math.round(W * scale));
    const h = Math.max(1, Math.round(H * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, W, H, 0, 0, w, h);
    return c.toDataURL('image/png');
  } catch (e) {
    return null;
  }
}

// 资产分类（按纹理 key 前缀）。terrain 类用于地形铺底，会自动 grid 对齐 + 低 depth
const CATEGORIES = [
  {
    id: 'terrain', label: '🌱 地形', isTerrain: true, snap: TILE,
    keys: [
      'ik-grass-base', 'ik-grass-varA', 'ik-grass-varB',
      'ik-biome-village', 'ik-biome-forest', 'ik-biome-mine', 'ik-biome-ruins',
      'ik-water-tile', 'ik-path-edge-fade',
    ],
  },
  { id: 'path',   label: '🛣 路面',  match: (k) => /^ik-path-\d{2}$/.test(k) },
  { id: 'cliff',  label: '⛰ 崖壁',  match: (k) => /^ik-cliff-/.test(k) },
  { id: 'forest', label: '🌳 树石草', match: (k) => /^ik-forest-\d{2}$/.test(k) },
  { id: 'nature', label: '🍄 自然',  match: (k) => /^ik-nature-/.test(k) },
  { id: 'landmark', label: '🏛 地标', match: (k) => /^ik-landmark-/.test(k) },
  { id: 'prop',   label: '📦 物件',  match: (k) => /^ik-prop-\d{2}$/.test(k) },
  { id: 'custom', label: '✨ 自定义',  match: (k) => /^custom-comp-/.test(k) },
];

// 类别内部的"图层分组"——同类资产的细分(按命名约定推断)
const SUBGROUPS = {
  forest: [
    { label: '🌲 树', match: (k) => /^ik-forest-(0[2-9]|1[0-3])$/.test(k) },
    { label: '🪨 石', match: (k) => /^ik-forest-(1[4-9]|2[0-5])$/.test(k) },
    { label: '🌾 草丛', match: (k) => /^ik-forest-(2[6-9]|3[0-7])$/.test(k) },
  ],
  nature: [
    { label: '🍄 蘑菇', match: (k) => /mushroom/.test(k) },
    { label: '🌸 花',   match: (k) => /flower/.test(k) },
    { label: '🌱 草丛', match: (k) => /grass-tuft/.test(k) },
    { label: '🍃 藤蔓', match: (k) => /vine/.test(k) },
    { label: '🪵 倒木', match: (k) => /(log|stump|branch)/.test(k) },
  ],
  cliff: [
    { label: '⬆ 顶/边', match: (k) => /(top|side|edge)/.test(k) },
    { label: '◣ 角',    match: (k) => /(corner|inner|outer)/.test(k) },
    { label: '🪜 阶/扩展', match: (k) => /(stair|step|ramp|extra)/.test(k) },
  ],
  prop: [
    { label: '📦 箱桶', match: (k) => /^ik-prop-0[1-9]$/.test(k) },
    { label: '⛺ 设施', match: (k) => /^ik-prop-(1[0-9]|2[0-5])$/.test(k) },
  ],
  path: [
    { label: '↔ 直/弯', match: (k) => /^ik-path-0[1-9]$/.test(k) },
    { label: '➕ 交叉/异形', match: (k) => /^ik-path-(1[0-9]|2[0-9])$/.test(k) },
  ],
  terrain: [
    { label: '🌱 草地', match: (k) => /^ik-grass-/.test(k) },
    { label: '🌍 生态群系', match: (k) => /^ik-biome-/.test(k) },
    { label: '💧 水/路缘', match: (k) => /^ik-(water|path-edge)/.test(k) },
  ],
};

export class Editor {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.placed = [];   // 编辑器管理的对象列表：{ obj, tex, scale }
    this.selected = null;
    this.brush = null;  // 当前选中的资产 key
    this.dragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.ui = null;     // HTML overlay 引用
    this.selectMarker = null;
    this.backdrop = null;      // 导入的整图底图（Phaser image）
    this._useOriginalTerrain = true; // 默认显示 painterly 原地形;有自定义且切到 custom 才为 false
    this.backdropInfo = null;  // { url, x, y, w, h } 用于存档
    this._videoLoopGuard = null;

    // === 撤销历史 ===
    this.history = [];
    this.historyLimit = 50;
    this._restoring = false;   // 应用历史时不再压栈

    // === 原地形已删除标记 (跨会话持久) ===
    // 每条 = "tex|x|y" 整数取整,下次场景重建后用来匹配并销毁对应 auto sprite
    this.deletedAutoMarkers = new Set();

    // === 网格涂抹系统（碰撞 + 踏区统一为 16px 格子集合）===
    this.GRID = 16;
    this.collideCells = new Set(); // "c,r" 字符串
    this.stepCells = new Set();
    this.spawnPoints = [];   // [{x,y}, ...] 战斗时敌人从这些点冒出来
    this.heroSpawn = null;   // {x,y} 战斗开始玩家瞬移到这里;无则用 WorldScene 默认
    this.tool = null;        // null | 'collide' | 'step' | 'spawn' | 'herospawn'
    this.shape = 'brush';    // 'brush'（圆形画笔）| 'rect'（矩形框选）| 'lasso'（多边形套索）
    this.erase = false;      // 擦除模式
    this.brushSize = 2;      // 画笔半径（格）
    this._rectStart = null;  // 矩形框选起点（世界坐标）
    this._painting = false;
    this._lassoPts = [];     // 多边形套索顶点（世界坐标）
    this._lassoCursor = null;// 当前鼠标世界坐标（预览闭合线）
    this.zoneGfx = null;     // 网格区域可视化 graphics

    this._installInput();
  }

  _installInput() {
    // F1 切换 — 仅开发模式 (URL 加 ?dev=1) 才启用, 上线后默认隐藏
    const isDevMode = (() => {
      try { return new URLSearchParams(window.location.search).has('dev'); }
      catch (e) { return false; }
    })();
    if (isDevMode) this.scene.input.keyboard.on('keydown-F1', () => this.toggle());
    // Delete 键删除选中
    this.scene.input.keyboard.on('keydown-DELETE', () => this.deleteSelected());
    // 套索: Enter 闭合, ESC 取消
    this.scene.input.keyboard.on('keydown-ENTER', () => {
      if (this.active && this.tool && this.shape === 'lasso' && this._lassoPts.length >= 3) this._lassoClose();
    });
    this.scene.input.keyboard.on('keydown-ESC', () => {
      if (!this.active) return;
      // ESC 是"回到中立态"的总入口:套索 → 选中 → 笔刷,依次清掉
      if (this._lassoPts.length) {
        this._lassoPts = []; this._lassoCursor = null; this._drawZones(); return;
      }
      if (this.selected) { this._clearSelectMarker(); this._refreshSelInfo(); return; }
      if (this.brush) { this.setBrush(null); return; }
    });
    // BACKSPACE / Z(无 Ctrl) — 套索绘制中撤回最后一个顶点
    const popLassoVertex = () => {
      if (!this.active) return false;
      if (this.shape !== 'lasso' || !this._lassoPts.length) return false;
      this._lassoPts.pop();
      if (!this._lassoPts.length) this._lassoCursor = null;
      this._drawZones();
      return true;
    };
    this.scene.input.keyboard.on('keydown-BACKSPACE', (e) => {
      if (popLassoVertex()) e.preventDefault && e.preventDefault();
    });
    // I 键 — 一键反选当前层 (已画与未画互换)
    this.scene.input.keyboard.on('keydown-I', () => {
      if (!this.active || !this.tool) return;
      this.invertActiveCells();
    });
    // Ctrl/Cmd + Z 撤销
    this.scene.input.keyboard.on('keydown-Z', (e) => {
      if (!this.active) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault && e.preventDefault();
      this.undo();
    });
    // 鼠标滚轮缩放选中件 (连续滚轮:首次入栈,200ms 内不重复)
    this.scene.input.on('wheel', (_p, _go, _dx, dy) => {
      if (!this.active || !this.selected) return;
      const now = this.scene.time.now;
      if (!this._wheelSnapUntil || now > this._wheelSnapUntil) this._snapshot();
      this._wheelSnapUntil = now + 200;
      const factor = dy < 0 ? 1.1 : 0.9;
      this.selected.obj.setScale(this.selected.obj.scaleX * factor);
      this.selected.scale = this.selected.obj.scaleX;
    });
    this.scene.input.on('pointerdown', (p) => {
      if (!this.active) return;
      // 套索模式右键 = 闭合多边形；其它情况右键 = 删除选中件
      if (p.rightButtonDown()) {
        if (this.tool && this.shape === 'lasso' && this._lassoPts.length >= 3) {
          this._lassoClose();
          return;
        }
        this._onRightClick(p);
        return;
      }
      // 玩家出生点 (只 1 个):点空地设置,点已有点删除
      if (this.tool === 'herospawn') {
        this._snapshot();
        const wx = p.worldX, wy = p.worldY;
        if (this.heroSpawn) {
          const dx = wx - this.heroSpawn.x, dy = wy - this.heroSpawn.y;
          if (dx * dx + dy * dy <= 22 * 22) {
            this.heroSpawn = null;
            this.scene._customHeroSpawn = null;
            this._announce('🦸 已删玩家出生点');
            this._drawZones();
            this._syncToolUI();
            return;
          }
        }
        this.heroSpawn = { x: Math.round(wx), y: Math.round(wy) };
        this.scene._customHeroSpawn = { ...this.heroSpawn };
        this._announce('🦸 已设玩家出生点');
        this._drawZones();
        this._syncToolUI();
        return;
      }
      // 出生点工具:点空地加一个,点已有点删一个;不走绘画路径
      if (this.tool === 'spawn') {
        this._snapshot();
        this.scene._customSpawnPoints = this.spawnPoints.slice();
        const wx = p.worldX, wy = p.worldY;
        const HIT = 22; // 点击半径
        const i = this.spawnPoints.findIndex((s) => {
          const dx = wx - s.x, dy = wy - s.y;
          return dx * dx + dy * dy <= HIT * HIT;
        });
        if (i >= 0) {
          this.spawnPoints.splice(i, 1);
          this._announce(`🔴 已删 1 个出生点 (剩 ${this.spawnPoints.length})`);
        } else {
          this.spawnPoints.push({ x: Math.round(wx), y: Math.round(wy) });
          this._announce(`🔴 已加出生点 #${this.spawnPoints.length}`);
        }
        this.scene._customSpawnPoints = this.spawnPoints.slice();
        this._drawZones();
        this._syncToolUI();
        return;
      }
      // 网格工具激活时（碰撞/踏区）
      if (this.tool) {
        // 起手先尝试切换选中件: 点击位置若在某件的已有格子上 → 选该件;
        // 否则若点中某件的 sprite → 选该件;否则若点中原地形 → 自动导入。
        // 套索仅第一个顶点时切换;矩形/画笔每次按下都切换。
        const isFirstStroke = !(this.shape === 'lasso' && this._lassoPts.length > 0);
        if (isFirstStroke) this._snapshot();
        if (isFirstStroke) this._autoSwitchPieceAt(p.worldX, p.worldY);
        if (this.shape === 'rect') {
          this._rectStart = { x: p.worldX, y: p.worldY };
          this._rectEnd = { x: p.worldX, y: p.worldY };
        } else if (this.shape === 'lasso') {
          // 点击靠近起点 → 闭合；否则添加顶点
          const pts = this._lassoPts;
          if (pts.length >= 3) {
            const dx = p.worldX - pts[0].x; const dy = p.worldY - pts[0].y;
            if (dx * dx + dy * dy < 12 * 12) { this._lassoClose(); return; }
          }
          pts.push({ x: p.worldX, y: p.worldY });
          this._lassoCursor = { x: p.worldX, y: p.worldY };
          this._drawZones();
        } else {
          this._painting = true;
          this._paintBrush(p.worldX, p.worldY);
        }
        return;
      }
      this._onLeftDown(p);
    });
    this.scene.input.on('pointermove', (p) => {
      if (!this.active) return;
      if (this.tool) {
        if (this.shape === 'rect' && this._rectStart) {
          this._rectEnd = { x: p.worldX, y: p.worldY };
          this._drawZones();
        } else if (this.shape === 'brush' && this._painting) {
          this._paintBrush(p.worldX, p.worldY);
        } else if (this.shape === 'lasso' && this._lassoPts.length > 0) {
          this._lassoCursor = { x: p.worldX, y: p.worldY };
          this._drawZones();
        }
        return;
      }
      // 地形画笔下按住左键拖动 = 持续刷地砖
      if (p.leftButtonDown() && !this.selected && this.brush && this._isTerrainKey(this.brush)) {
        if (!this._terrainStroke) { this._snapshot(); this._terrainStroke = true; }
        this._terrainPaint(p);
        return;
      }
      this._onMove(p);
    });
    this.scene.input.on('pointerup', () => {
      if (!this.active) return;
      if (this.tool) {
        if (this.shape === 'rect' && this._rectStart && this._rectEnd) {
          this._applyRect(this._rectStart, this._rectEnd);
          this._rectStart = null; this._rectEnd = null;
        }
        this._painting = false;
        this._rebuildSolidsFromCells();
        this._drawZones();
        return;
      }
      // 拖动结束：若该件真正被拖过且有 pieceCells/Step,重建物理体跟随到新位置
      if (this._dragMoved && this.selected
        && ((this.selected.pieceCells && this.selected.pieceCells.size)
          || (this.selected.pieceStepCells && this.selected.pieceStepCells.size))) {
        this._rebuildPieceSolids(this.selected);
        this._drawZones();
      }
      this.dragging = false;
      this._dragCandidate = null;
      this._dragMoved = false;
      this._terrainStroke = false; // 笔画结束
    });
    // 禁用右键菜单
    if (this.scene.input.mouse) this.scene.input.mouse.disableContextMenu();
  }

  toggle() { this.active ? this.exit() : this.enter(); }

  enter() {
    this.active = true;
    this.scene._editorActive = true;
    // 加载自定义组件库 (异步,完成后调色板自动会显示)
    ensureCompsLoaded(this.scene).then(() => { if (this.ui && this._buildTabs) this._buildTabs(); }).catch(() => {});
    // 清空所有敌人(整组销毁)
    if (this.scene.enemies) {
      this.scene.enemies.getChildren().slice().forEach((e) => {
        if (e.bar && e.bar.destroy) e.bar.destroy();
        e.destroy();
      });
    }
    // 隐藏 boss 血条
    if (this.scene.hideBossBar) this.scene.hideBossBar();
    if (this.scene.hud && this.scene.hud.hideBoss) this.scene.hud.hideBoss();
    // 原地形保持可见 (用户可点击转换为可编辑件); 碰撞统一停用以免挡路
    this._disableAutoSolids();
    // 物理不暂停（玩家仍可走动看比例），但战斗逻辑已被 _editorActive 拦住
    this._buildUI();
    this._syncToolUI();
    this._drawZones(); // 显示已有碰撞/踏区
    // 重显水晶塔金环 (退出编辑时隐了)
    this.placed.forEach((p) => { if (p.isCustomCore && p._coreRing) p._coreRing.setVisible(true); });
    this._announce('🛠 编辑模式 — 原地形碰撞已停用,点件可编辑 (F1 退出)');
  }

  exit() {
    this.active = false;
    this.scene._editorActive = false;
    // 退出编辑 → 恢复战斗:重新刷怪/刷 boss
    this.scene._peaceful = false;
    // 回复原地形碰撞 (已被导入为编辑件的不复原)
    this._restoreAutoSolids();
    if (this.ui) { this.ui.remove(); this.ui = null; }
    if (this.zoneGfx) this.zoneGfx.clear(); // 隐藏区域可视框（数据仍保留在 cells）
    if (this.collideDebug) this.collideDebug.clear();
    // 出生点数字标签也藏起来 (数据仍保留)
    if (this._spawnLabels) this._spawnLabels.forEach((t) => { if (t && t.setVisible) t.setVisible(false); });
    // 水晶塔金环标记隐藏 (数据 isCustomCore 仍保留, 下次进编辑器再次显示)
    this.placed.forEach((p) => { if (p._coreRing) p._coreRing.setVisible(false); });
    this.tool = null;
    this._clearSelectMarker();
    this._announce('✓ 已退出编辑 → 战斗恢复 (F1 再次进编辑)');
  }

  // —— 原地形碰撞：进编辑时停用,退出时复原(已被导入的件除外) ——
  _disableAutoSolids() {
    if (!this.scene.solids) return;
    if (!this._autoSolidsSnapshot) {
      this._autoSolidsSnapshot = [];
      this.scene.solids.getChildren().forEach((s) => {
        if (!s.body) return;
        this._autoSolidsSnapshot.push({ obj: s, wasEnabled: s.body.enable });
        s.body.enable = false;
      });
    }
  }
  _restoreAutoSolids() {
    if (!this._autoSolidsSnapshot) return;
    this._autoSolidsSnapshot.forEach(({ obj, wasEnabled }) => {
      if (obj && obj.body && !obj._editorClaimed) obj.body.enable = wasEnabled;
    });
    this._autoSolidsSnapshot = null;
  }

  // 扫一遍 _autoLayer,把 deletedAutoMarkers 中匹配到的 sprite 销毁(并停用其碰撞)
  _applyDeletedAutoMarkers() {
    const layer = this.scene._autoLayer;
    if (!layer || !this.deletedAutoMarkers.size) return;
    const TOL = 4; // 允许位置浮点误差
    const remaining = [];
    for (let i = 0; i < layer.length; i++) {
      const o = layer[i];
      if (!o || !o.texture) { remaining.push(o); continue; }
      const tex = o.texture.key;
      let matched = false;
      for (const key of this.deletedAutoMarkers) {
        const parts = key.split('|');
        if (parts[0] !== tex) continue;
        const mx = parseInt(parts[1], 10); const my = parseInt(parts[2], 10);
        if (Math.abs(o.x - mx) <= TOL && Math.abs(o.y - my) <= TOL) { matched = true; break; }
      }
      if (matched) {
        // 顺便认领并停用附近 auto solid,免得留下隐形墙
        if (this.scene.solids && o.displayWidth) {
          const w = o.displayWidth, h = o.displayHeight;
          const ox = o.originX ?? 0.5, oy = o.originY ?? 0.5;
          const left = o.x - w * ox, top = o.y - h * oy;
          this.scene.solids.getChildren().forEach((s) => {
            if (!s.body) return;
            if (s.x >= left - 8 && s.x <= left + w + 8 && s.y >= top - 8 && s.y <= top + h + 8) {
              s._editorClaimed = true; if (s.body) s.body.enable = false;
            }
          });
        }
        o.destroy();
      } else {
        remaining.push(o);
      }
    }
    this.scene._autoLayer = remaining;
  }

  // —— 把"原地形自动层"中的某个 sprite 导入为可编辑件 ——
  // 同时把它周围 64px 内的所有 auto solid 标记为已认领,exit 时不复原。
  _importAutoSprite(sprite) {
    if (!sprite || sprite._editorImported) return null;
    sprite._editorImported = true;
    const isTerrain = this._isTerrainKey(sprite.texture.key);
    const piece = {
      obj: sprite, tex: sprite.texture.key,
      scale: sprite.scaleX, isTerrain, collide: false, solid: null,
      pieceCells: new Set(), pieceStepCells: new Set(), pieceSolids: [], depthBias: 0,
      _imported: true,
      _autoOrigin: { tex: sprite.texture.key, x: Math.round(sprite.x), y: Math.round(sprite.y) },
    };
    // 认领该件附近的 auto solid 们 (按 bounding box 判定)
    if (this.scene.solids) {
      const w = sprite.displayWidth; const h = sprite.displayHeight;
      const left = sprite.x - w * sprite.originX;
      const top = sprite.y - h * sprite.originY;
      const right = left + w; const bottom = top + h;
      this.scene.solids.getChildren().forEach((s) => {
        if (!s.body) return;
        const cx = s.x; const cy = s.y;
        if (cx >= left - 8 && cx <= right + 8 && cy >= top - 8 && cy <= bottom + 8) {
          s._editorClaimed = true; // exit 时不复原
        }
      });
    }
    this.placed.push(piece);
    // 从 _autoLayer 移除,以免重复导入
    const layer = this.scene._autoLayer;
    if (layer) {
      const i = layer.indexOf(sprite);
      if (i >= 0) layer.splice(i, 1);
    }
    if (sprite.setInteractive) sprite.disableInteractive();
    return piece;
  }

  // 给"显示原地形"按钮用：切换 _autoLayer 可见性
  toggleAutoLayer() {
    const layer = this.scene._autoLayer;
    if (!layer || !layer.length) return false;
    const newVisible = !layer[0].visible;
    layer.forEach((o) => { if (o && o.setVisible) o.setVisible(newVisible); });
    return newVisible;
  }

  _openComponentManager() {
    if (document.getElementById('comp-manager')) return;
    const wrap = document.createElement('div');
    wrap.id = 'comp-manager';
    wrap.innerHTML = `
      <style>
        #comp-manager { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200;
          display: flex; align-items: center; justify-content: center; font: 13px/1.4 monospace; color: #fff; }
        #comp-manager .panel { background: #1a0e08; border: 3px solid #c2a35e; border-radius: 6px;
          padding: 18px; min-width: 480px; max-width: 700px; max-height: 86vh; overflow-y: auto; }
        #comp-manager h2 { margin: 0 0 8px; color: #ffe070; font-size: 18px; }
        #comp-manager .hint { color: #aaa; font-size: 11px; margin-bottom: 8px; }
        #comp-manager .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
        #comp-manager .card { position: relative; border: 1px solid #6b5836; background: #2a1d10;
          border-radius: 3px; padding: 8px; }
        #comp-manager .preview { width: 100%; height: 80px; background:#0d0805 center/contain no-repeat;
          image-rendering: pixelated; border-radius: 2px; margin-bottom: 4px; }
        #comp-manager .lbl { font-size: 11px; color: #ffe9b6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #comp-manager .meta { font-size: 10px; color: #aaa; }
        #comp-manager .x { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px;
          background: #c25e5e; color: #fff; border: 0; border-radius: 9px; cursor: pointer;
          font: bold 11px monospace; padding: 0; }
        #comp-manager .actions { display: flex; gap: 8px; margin-top: 12px; }
        #comp-manager button.action { flex: 1; background: #c2a35e; color: #1a0e08; border: 0;
          padding: 8px 12px; font: bold 13px monospace; border-radius: 3px; cursor: pointer; }
      </style>
      <div class="panel">
        <h2>📚 组件库</h2>
        <div class="hint">已上传的自定义组件 — 删除后无法恢复</div>
        <div class="grid" id="comp-grid"></div>
        <div class="actions"><button class="action" id="comp-close">关闭</button></div>
      </div>`;
    document.body.appendChild(wrap);
    const grid = wrap.querySelector('#comp-grid');
    const render = () => {
      grid.innerHTML = '';
      const lib = getCompLibrary();
      if (!lib.length) {
        grid.innerHTML = '<div style="color:#aaa;padding:20px;text-align:center">还没上传组件,试试 📦 上传组件</div>';
        return;
      }
      lib.forEach((entry) => {
        const card = document.createElement('div');
        card.className = 'card';
        let preview = '';
        let metaText = '';
        if (entry.type === 'animated') {
          preview = `background-image:url(${entry.dataUrl}); background-size: auto 80px; background-position: 0 0;`;
          metaText = `${entry.frameCount} 帧 / ${entry.frameRate} fps`;
        } else if (entry.type === 'video') {
          preview = entry.posterUrl
            ? `background-image:url(${entry.posterUrl}); background-size: contain;`
            : 'background:#3a2810 center/contain no-repeat;';
          metaText = `📹 ${entry.natW}×${entry.natH}${entry.chromaKey ? ' · 抠绿' : ''} · ${entry.sizeMB} MB`;
        } else {
          preview = `background-image:url(${entry.dataUrl}); background-size: contain;`;
          metaText = '静态';
        }
        card.innerHTML = `
          <div class="preview" style="${preview}"></div>
          <div class="lbl" title="${entry.name}">${entry.name}</div>
          <div class="meta">${metaText}</div>
          <button class="x" title="删除">×</button>
        `;
        card.querySelector('.x').onclick = () => {
          if (!confirm(`删除 ${entry.name}?`)) return;
          removeComp(this.scene, entry.id);
          this._announce(`🗑 已删: ${entry.name}`);
          render();
          // 重建 Tab 栏 + 刷新当前显示的资产网格 (不然左侧调色板还显示老的)
          this._buildTabs && this._buildTabs();
          const activeTab = document.querySelector('#ed-tabs .tab.active');
          const activeCat = activeTab && activeTab.dataset.catId;
          if (activeCat) this._buildGrid(activeCat);
        };
        grid.appendChild(card);
      });
    };
    wrap.querySelector('#comp-close').onclick = () => wrap.remove();
    render();
  }

  _announce(text) {
    const t = this.scene.add.text(this.scene.cameras.main.width / 2, 60, text, {
      fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold',
      color: '#ffe070', stroke: '#000', strokeThickness: 4,
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(99999);
    this.scene.tweens.add({ targets: t, alpha: 0, duration: 1600, delay: 600, onComplete: () => t.destroy() });
  }

  // ===== 输入处理 =====
  // 整体模型:
  //   - 笔刷选中(this.brush != null) → 空地点击 = 放置新件;点已有件 = 选中(不放置)
  //   - 无笔刷 → 点件 = 选中;点空地 = 取消选中;Alt+点原地形 = 导入为可编辑件
  //   - 拖动门槛 4px,门槛内只是单纯选择,不污染撤销栈、不会因手抖移位
  _onLeftDown(p) {
    // 正在拖参照英雄时，编辑器不响应（EditorScene 专用）
    if (this.scene._refDragging) return;
    const wx = p.worldX; const wy = p.worldY;
    // 命中右上角 × 按钮 → 让该 GameObject 自己的 pointerdown 处理删除,这里不做任何事
    if (this.selectDeleteBtn) {
      const b = this.selectDeleteBtn.bg;
      const dx = wx - b.x; const dy = wy - b.y;
      if (dx * dx + dy * dy < 14 * 14) return;
    }
    this._dragMoved = false;
    this._dragCandidate = null;

    // 1) 命中已放置件 → 选中,记拖动候选 (尚未真正拖动)
    const hit = this._hitTest(wx, wy);
    if (hit) {
      this.select(hit);
      this._dragCandidate = { piece: hit, sx: wx, sy: wy, ox: wx - hit.obj.x, oy: wy - hit.obj.y };
      return;
    }

    // 2) 笔刷激活(且未按 Alt) → 放置新件
    const altDown = !!(p.event && (p.event.altKey || p.event.metaKey));
    if (this.brush && !altDown) {
      this.placeAt(this.brush, wx, wy);
      return;
    }

    // 3) Alt 或 无笔刷 → 命中原地形则导入
    const auto = this._hitAutoLayer(wx, wy);
    if (auto) {
      const piece = this._importAutoSprite(auto);
      if (piece) {
        this.select(piece);
        this._dragCandidate = { piece, sx: wx, sy: wy, ox: wx - auto.x, oy: wy - auto.y };
        this._announce(`📥 已转为可编辑: ${piece.tex}`);
      }
      return;
    }

    // 4) 空地点击 + 无笔刷 → 取消选中 (给用户"回到中立态"的入口)
    if (!this.brush && this.selected) {
      this._clearSelectMarker();
      this._refreshSelInfo();
    }
  }

  // 工具模式起手:在世界坐标处找一个"应当被选中"的件并切换。
  // 优先级: 1) 已有同类格子的件 (collide↔pieceCells, step↔pieceStepCells)
  //         2) sprite 命中的 placed 件
  //         3) sprite 命中的原地形 auto 层 → 导入为可编辑件
  // 找不到则不动 (保持当前 selected 或保持无选,落到全局格子)。
  _autoSwitchPieceAt(wx, wy) {
    const tool = this.tool;
    // 1) 已有格子的件
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const p = this.placed[i];
      const cells = tool === 'step' ? p.pieceStepCells : p.pieceCells;
      if (!cells || !cells.size) continue;
      const k = this._worldToPieceCell(p, wx, wy);
      if (cells.has(`${k.c},${k.r}`)) { if (this.selected !== p) this.select(p); return p; }
    }
    // 2) sprite 命中
    const hit = this._hitTest(wx, wy);
    if (hit) { if (this.selected !== hit) this.select(hit); return hit; }
    // 3) 原地形自动层 → 导入
    const auto = this._hitAutoLayer(wx, wy);
    if (auto) {
      const piece = this._importAutoSprite(auto);
      if (piece) { this.select(piece); this._announce(`📥 已转为可编辑: ${piece.tex}`); return piece; }
    }
    return null;
  }

  // 命中测试：原地形自动层 (小件优先,大件兜底)
  _hitAutoLayer(wx, wy) {
    const layer = this.scene._autoLayer;
    if (!layer || !layer.length) return null;
    const hits = [];
    for (let i = 0; i < layer.length; i++) {
      const o = layer[i];
      if (!o || !o.active || !o.visible) continue;
      if (!o.displayWidth || !o.texture) continue;
      const w = o.displayWidth; const h = o.displayHeight;
      const ox = o.originX != null ? o.originX : 0.5;
      const oy = o.originY != null ? o.originY : 0.5;
      const left = o.x - w * ox; const top = o.y - h * oy;
      if (wx >= left && wx <= left + w && wy >= top && wy <= top + h) {
        hits.push({ o, area: w * h, idx: i });
      }
    }
    if (!hits.length) return null;
    hits.sort((a, b) => (a.area - b.area) || (b.idx - a.idx));
    return hits[0].o;
  }

  _onMove(p) {
    // 拖动门槛: 4px 内的微小移动视为单纯点击,不真正拖、不入栈
    if (!this._dragCandidate) return;
    const c = this._dragCandidate;
    if (!this._dragMoved) {
      const dx = p.worldX - c.sx; const dy = p.worldY - c.sy;
      if (dx * dx + dy * dy < 16) return; // 阈值 4px
      this._dragMoved = true;
      this.dragging = true;
      this._snapshot(); // 真正开始拖才入栈一次
    }
    const piece = c.piece;
    if (!piece || !piece.obj || !piece.obj.active) return;
    let wx = p.worldX - c.ox;
    let wy = p.worldY - c.oy;
    if (piece.isTerrain) {
      wx = Math.floor(wx / TILE) * TILE;
      wy = Math.floor(wy / TILE) * TILE;
    }
    piece.obj.setPosition(wx, wy);
    this._applyPieceDepth(piece);
    this._updateSelectMarker();
  }

  // 计算并应用某件的实际 depth: 地形固定 -88;其它件 = y + depthBias
  _applyPieceDepth(p) {
    if (!p || !p.obj) return;
    if (p.isTerrain) { p.obj.setDepth(-88 + (p.depthBias || 0)); return; }
    p.obj.setDepth(p.obj.y + (p.depthBias || 0));
  }

  // ===== 层级调整 (相对当前 depthBias 累加,或置顶/置底) =====
  bringForward()  { this._nudgeDepth(+100); }
  sendBackward()  { this._nudgeDepth(-100); }
  bringToFront()  { this._setAbsBias(+9999); }
  sendToBack()    { this._setAbsBias(-9999); }
  _nudgeDepth(d) {
    if (!this.selected) return;
    this._snapshot();
    this.selected.depthBias = (this.selected.depthBias || 0) + d;
    this._applyPieceDepth(this.selected);
    this._refreshSelInfo();
  }
  _setAbsBias(d) {
    if (!this.selected) return;
    this._snapshot();
    this.selected.depthBias = d;
    this._applyPieceDepth(this.selected);
    this._refreshSelInfo();
  }

  // 把当前选中的组件标记为"自定义水晶塔" (守塔模式下生效)
  // 仅保留一个 core, 重复标记会自动转移到新选中的件
  markSelectedAsCore() {
    if (!this.selected) {
      this._announce('⚠ 先选中一个组件再点此按钮');
      return;
    }
    const mode = this.scene._mode || 'defense';
    if (mode !== 'defense') {
      this._announce('⚠ 仅守塔模式可设水晶塔');
      return;
    }
    this._snapshot();
    // 清除之前所有标记 + 销毁旧标记的金环
    this.placed.forEach((p) => {
      if (p.isCustomCore) {
        p.isCustomCore = false;
        if (p._coreRing) { p._coreRing.destroy(); p._coreRing = null; }
      }
    });
    // 标记新件
    this.selected.isCustomCore = true;
    this._drawCoreRing(this.selected);
    this._announce(`🔮 已标记为水晶塔 — 已立即生效, 别忘了 💾 保存`);
    // 立刻让 scene 用这件替换默认塔, 不必等下次加载
    if (this.scene.applyCustomCoreFromEditor) this.scene.applyCustomCoreFromEditor();
  }

  // 在标记为 core 的件下面画一个金环, 编辑器里看得见 (实际游玩时不显示)
  _drawCoreRing(p) {
    if (!p || !p.obj) return;
    if (p._coreRing) { p._coreRing.destroy(); p._coreRing = null; }
    const ring = this.scene.add.graphics();
    ring.setDepth(p.obj.depth - 1);
    ring.lineStyle(3, 0xffe070, 1);
    ring.strokeCircle(p.obj.x, p.obj.y, Math.max(28, (p.obj.displayWidth || 80) * 0.55));
    ring.fillStyle(0xffe070, 0.18);
    ring.fillCircle(p.obj.x, p.obj.y, Math.max(28, (p.obj.displayWidth || 80) * 0.55));
    // 仅编辑模式下显示;游玩时藏起来
    ring.setVisible(!!this.active);
    p._coreRing = ring;
  }

  // 地形涂刷：按住左键拖动持续刷出 tile（不创建重复的同位置件）
  _terrainPaint(p) {
    if (!this.brush || !this._isTerrainKey(this.brush)) return false;
    const gx = Math.floor(p.worldX / TILE) * TILE;
    const gy = Math.floor(p.worldY / TILE) * TILE;
    // 该格已有同纹理 tile 就跳过
    const exists = this.placed.some((piece) => piece.isTerrain && piece.tex === this.brush
      && piece.obj.x === gx && piece.obj.y === gy);
    if (exists) return true;
    this.placeAt(this.brush, gx, gy);
    return true;
  }

  // 右键不再直接删除 (太容易误触)。改为"回到中立态":取消选中 + 取消笔刷。
  // 删除请用 Delete 键 或 属性面板的 🗑 按钮。
  _onRightClick() {
    if (this.selected) { this._clearSelectMarker(); this._refreshSelInfo(); }
    if (this.brush) this.setBrush(null);
  }

  // 设置/取消当前笔刷,并同步调色板高亮 + 提示文字
  setBrush(key) {
    this.brush = key || null;
    const panel = document.getElementById('ed-grid');
    if (panel) panel.querySelectorAll('img').forEach((el) => {
      el.classList.toggle('sel', !!key && el.title === key);
    });
    this._refreshBrushChip();
  }
  _refreshBrushChip() {
    const chip = document.getElementById('ed-brush-chip');
    if (!chip) return;
    if (this.brush) {
      chip.style.display = '';
      chip.querySelector('.txt').textContent = this.brush.replace(/^ik-/, '');
    } else {
      chip.style.display = 'none';
    }
  }

  _hitTest(wx, wy) {
    // 命中候选 → 按面积升序,小件优先 (避免大地形挡住小件点击)
    const hits = [];
    for (let i = 0; i < this.placed.length; i++) {
      const p = this.placed[i];
      const o = p.obj;
      if (!o.active) continue;
      const w = o.displayWidth; const h = o.displayHeight;
      const ox = o.originX; const oy = o.originY;
      const left = o.x - w * ox; const top = o.y - h * oy;
      if (wx >= left && wx <= left + w && wy >= top && wy <= top + h) {
        hits.push({ p, area: w * h, idx: i });
      }
    }
    if (!hits.length) return null;
    // 主排序:面积小的优先;同面积时取后放置的(idx 大)
    hits.sort((a, b) => (a.area - b.area) || (b.idx - a.idx));
    return hits[0].p;
  }

  // ===== 放置/选择/删除 =====
  placeAt(texKey, x, y) {
    if (!this.scene.textures.exists(texKey)) return;
    // 在地形涂刷笔画中:仅笔画开始前快照过一次,这里不重复入栈
    if (!this._terrainStroke) this._snapshot();
    // 地形件：grid 对齐到 TILE 中心 + 左上角 origin + 低 depth(在装饰之下)
    const isTerrain = this._isTerrainKey(texKey);
    if (isTerrain) {
      const gx = Math.floor(x / TILE) * TILE;
      const gy = Math.floor(y / TILE) * TILE;
      const obj = this.scene.add.image(gx, gy, texKey).setOrigin(0, 0).setDepth(-88);
      obj.setDisplaySize(TILE, TILE);
      const piece = { obj, tex: texKey, scale: obj.scaleX, isTerrain: true, collide: false, solid: null, pieceCells: new Set(), pieceStepCells: new Set(), pieceSolids: [], depthBias: 0 };
      this.placed.push(piece);
      this.select(piece);
      return;
    }
    // 自定义组件:若是动画 (注册了 -anim 动画),用 add.sprite + play
    const animKey = `${texKey}-anim`;
    const obj = this.scene.anims.exists(animKey)
      ? this.scene.add.sprite(x, y, texKey).setOrigin(0.5, 0.85).setDepth(y).play(animKey)
      : this.scene.add.image(x, y, texKey).setOrigin(0.5, 0.85).setDepth(y);
    // 默认对大型装饰(地标/树/石)猜测要碰撞，小件(花/草/路面)不碰撞
    const collideDefault = /^ik-(landmark-|forest-(0[3-9]|1[0-3]|2[6-9]|3[0-7])$|prop-)/.test(texKey);
    const piece = { obj, tex: texKey, scale: 1, isTerrain: false, collide: false, solid: null, pieceCells: new Set(), pieceStepCells: new Set(), pieceSolids: [], depthBias: 0 };
    this.placed.push(piece);
    // 若该贴图有预设，自动套用
    if (this.hasPreset(texKey)) {
      try {
        const d = JSON.parse(localStorage.getItem(this._presetKey(texKey)));
        piece.pieceCells = new Set(d.pieceCells || []);
        piece.pieceStepCells = new Set(d.pieceStepCells || []);
        if (piece.pieceCells.size || piece.pieceStepCells.size) this._rebuildPieceSolids(piece);
      } catch (e) { /* ignore */ }
    }
    this.select(piece);
  }

  // 启用/关闭某件的"自动地基"物理碰撞（按贴图像素 footprint，缩放时同步）
  setCollide(piece, on) {
    if (!piece) return;
    if (piece.solid) { piece.solid.destroy(); piece.solid = null; }
    piece.collide = !!on;
    if (!on) { this._updateCollideDebug(); return; }
    const box = this._computeCollideBox(piece);
    piece.solid = this.scene.addSolid(box.x, box.y, box.w, box.h);
    this._updateCollideDebug();
  }

  // 计算某件当前应有的碰撞框 (世界坐标 + 尺寸),按 footprint 缓存,失败时回退
  _computeCollideBox(piece) {
    const o = piece.obj;
    const tex = this.scene.textures.get(piece.tex);
    const fp = computeFootprint(tex);
    if (fp) {
      // texture-native footprint → 世界坐标
      // 注意 setDisplaySize 改变 scale,所以这里都用 scaleX/Y 即可
      const sx = o.scaleX; const sy = o.scaleY;
      const tlX = o.x - fp.texW * o.originX * sx;
      const tlY = o.y - fp.texH * o.originY * sy;
      return {
        x: tlX + fp.cx * sx,
        y: tlY + fp.cy * sy,
        w: Math.max(8, fp.w * Math.abs(sx)),
        h: Math.max(6, fp.h * Math.abs(sy)),
      };
    }
    // 回退：50% × 18 在脚底
    return {
      x: o.x,
      y: o.y + (1 - o.originY) * o.displayHeight - 9,
      w: Math.max(20, Math.round(o.displayWidth * 0.5)),
      h: 18,
    };
  }

  // 选中件且自动碰撞开启时,显示橙色 debug 框（让用户眼见地基碰撞区域）
  _updateCollideDebug() {
    if (!this.collideDebug) {
      this.collideDebug = this.scene.add.graphics().setDepth(99997);
    }
    const g = this.collideDebug;
    g.clear();
    if (!this.selected || !this.selected.collide) return;
    const b = this._computeCollideBox(this.selected);
    g.fillStyle(0xffa030, 0.25);
    g.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    g.lineStyle(2, 0xffa030, 0.85);
    g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
  }

  // ===== 导入整图作底图（PNG/JPG/GIF/APNG/WebP/MP4/WebM）=====
  // 视频 MP4/WebM → <video> 直接播 (清晰度最高、体积最小)
  // 静态 PNG/JPG/静态 WebP → 原生 Image → addImage
  // 动画 GIF/APNG/WebP → ImageDecoder 拆帧 → 拼 sheet → Phaser anim
  importBackdropFile(file) {
    const name = (file.name || '').toLowerCase();
    const ext = name.match(/\.(gif|apng|webp|png|jpg|jpeg|mp4|webm|mov|m4v)$/i);
    // 视频:扩展名或 MIME 命中
    const isVideo = (file.type && file.type.startsWith('video/'))
      || /\.(mp4|webm|mov|m4v)$/i.test(name);
    if (isVideo) {
      this._loadVideoBackdrop(file).catch((err) => {
        console.warn('视频底图加载失败:', err);
        this._announce(`⚠ 视频加载失败: ${err.message || err}`);
      });
      return;
    }
    const ext2 = name.match(/\.(gif|apng|webp|png|jpg|jpeg)$/i);
    const animatable = (file.type === 'image/gif' || file.type === 'image/apng' || file.type === 'image/webp')
      || /\.(gif|apng|webp)$/i.test(name);
    if (animatable) {
      // MIME 优先;APNG 文件常被报为 image/png,显式覆盖
      let mime = file.type || 'image/gif';
      if (ext && ext[1].toLowerCase() === 'apng') mime = 'image/apng';
      if (ext && ext[1].toLowerCase() === 'webp') mime = 'image/webp';
      if (ext && ext[1].toLowerCase() === 'gif')  mime = 'image/gif';
      this._loadAnimatedBackdrop(file, mime).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('动画拆帧失败,回退静态:', err);
        // 回退静态加载
        const reader = new FileReader();
        reader.onload = (e) => this._loadBackdrop(e.target.result);
        reader.readAsDataURL(file);
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => this._loadBackdrop(e.target.result);
      reader.readAsDataURL(file);
    }
  }

  // 兼容旧调用: 老的 _loadGifBackdrop 名字仍可用
  _loadGifBackdrop(file) { return this._loadAnimatedBackdrop(file, 'image/gif'); }

  // 视频底图 (MP4 / WebM) — 推荐主力格式: 同体积比 GIF/WebP 清晰得多
  // 存储:Blob 直存 IDB (不 base64,省 33% + 序列化秒级提速)
  // 循环:三重兜底 (原生 loop + ended 事件 + 1.5s 定时器探测)
  // 入参:File (新导入) / videoKey 字符串 (从存档恢复) / dataURL 字符串 (向后兼容旧档)
  async _loadVideoBackdrop(input, restoreInfo) {
    if (!input) {
      this._announce('⚠ 视频底图: 输入为空');
      return;
    }
    let blob = null;
    let videoKey = null;     // IDB blob key (新通道)
    let dataUrl = null;      // 向后兼容旧 dataURL 存档
    if (input instanceof Blob) {
      blob = input;
    } else if (typeof input === 'string') {
      if (input.startsWith('idb-video:')) {
        videoKey = input;
        blob = await loadBlob(videoKey);
        if (!blob) {
          this._announce(`⚠ IDB 找不到视频 ${videoKey},底图已丢失`);
          return;
        }
      } else if (input.startsWith('data:') || input.startsWith('blob:') || input.startsWith('http')) {
        dataUrl = input;
      } else {
        this._announce(`⚠ 视频底图: URL 格式不识别 (${input.slice(0, 40)}...)`);
        return;
      }
    } else {
      this._announce('⚠ 视频底图: 输入类型不支持');
      return;
    }
    // 新导入文件 → 同步写 IDB Blob,拿 key 持久化
    if (blob && !videoKey) {
      videoKey = `idb-video:${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      try { await saveBlob(videoKey, blob); }
      catch (e) { console.warn('视频 Blob 存 IDB 失败:', e); }
    }
    // 决定 video.src — 优先 blob URL (高性能),fallback dataURL (兼容)
    const playUrl = blob ? URL.createObjectURL(blob) : dataUrl;
    if (!playUrl || playUrl === 'undefined') {
      if (!this.backdrop) this._rollbackBackdropLoadFailure();
      throw new Error('视频 URL 无效');
    }
    const vid = document.createElement('video');
    vid.muted = true;
    vid.loop = true;            // 原生 loop 标志(部分浏览器靠它)
    vid.playsInline = true;
    vid.autoplay = true;
    vid.preload = 'auto';
    // 兜底循环:即便 loop 标志被忽略,ended 也强制重播
    vid.addEventListener('ended', () => {
      try { vid.currentTime = 0; vid.play().catch(() => {}); } catch (e) {}
    });
    vid.src = playUrl;
    try {
      await this._waitForVideoFrame(vid);
    } catch (e) {
      try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch (err) {}
      if (playUrl && playUrl.startsWith('blob:')) URL.revokeObjectURL(playUrl);
      if (!this.backdrop) this._rollbackBackdropLoadFailure();
      throw e;
    }
    const natW = vid.videoWidth || 1920;
    const natH = vid.videoHeight || 1080;
    // 绕开 Phaser.Video (cache.video.add + add.video 内部会找 .url 属性 → 拿到 undefined → 404):
    // 用 canvas 接 video 帧,scene.textures.addCanvas 注册,每帧 refresh 喂 GPU
    const texKey = `editor-backdrop-vid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const canvas = document.createElement('canvas');
    canvas.width = natW; canvas.height = natH;
    const cctx = canvas.getContext('2d');
    cctx.drawImage(vid, 0, 0, natW, natH);
    // —— 自动检测绿幕/蓝幕 ——
    // 用户在 UI 上开了开关 (this._chromaKeyEnabled) 才启用
    // 默认从四角采色检测;检测到绿/蓝 → 自动 chroma key,否则不动
    let chromaOpts = null;
    if (this._chromaKeyEnabled) {
      const key = detectKeyColor(cctx, natW, natH);
      const kind = isLikelyChromaKey(key);
      if (kind) {
        chromaOpts = { ...key, tolerance: 120, smooth: 60, despill: true };
        this._announce(`🎬 检测到${kind === 'green' ? '绿' : '蓝'}幕 (RGB ${key.keyR},${key.keyG},${key.keyB}),已抠除`);
      } else {
        this._announce('ℹ 未检测到绿幕/蓝幕,跳过抠图');
      }
    }
    if (this.backdrop) { this.backdrop.destroy(); this.backdrop = null; }
    if (this.scene.textures.exists(texKey)) this.scene.textures.remove(texKey);
    // 处理首帧 (后续每帧也处理)
    if (chromaOpts) applyChromaKey(cctx, natW, natH, chromaOpts);
    const canvasTex = this.scene.textures.addCanvas(texKey, canvas);
    if (canvasTex && canvasTex.refresh) canvasTex.refresh();
    const fit = this._fitToIsland(natW, natH);
    const sprite = this.scene.add.image(fit.x, fit.y, texKey).setOrigin(0, 0).setDepth(-85);
    sprite.setDisplaySize(fit.w, fit.h);
    // 每帧把 video 当前帧画到 canvas → 抠图 → 让 Phaser texture 刷新
    const refresh = () => {
      if (this.backdrop !== sprite) return;
      if (vid.readyState >= 2) {
        cctx.drawImage(vid, 0, 0, natW, natH);
        if (chromaOpts) applyChromaKey(cctx, natW, natH, chromaOpts);
        const tex = this.scene.textures.get(texKey);
        if (tex && tex.refresh) tex.refresh();
      }
      if (vid.ended) { try { vid.currentTime = 0; vid.play().catch(() => {}); } catch (e) {} }
    };
    this.scene.events.on('postupdate', refresh);
    sprite.once('destroy', () => {
      this.scene.events.off('postupdate', refresh);
      try { vid.pause(); vid.src = ''; vid.load(); } catch (e) {}
      if (playUrl && playUrl.startsWith('blob:')) URL.revokeObjectURL(playUrl);
      try { if (this.scene.textures.exists(texKey)) this.scene.textures.remove(texKey); } catch (e) {}
    });
    // 兜底循环
    if (this._videoLoopGuard) clearInterval(this._videoLoopGuard);
    this._videoLoopGuard = setInterval(() => {
      if (!this.backdrop || this.backdrop !== sprite) {
        clearInterval(this._videoLoopGuard); this._videoLoopGuard = null; return;
      }
      if (vid.paused && !vid.ended) { vid.play().catch(() => {}); }
    }, 1500);
    // 旧底图的 IDB blob 不再需要 → 清理(避免越积越多)
    if (this._lastVideoKey && this._lastVideoKey !== videoKey) {
      deleteBlob(this._lastVideoKey).catch(() => {});
    }
    this._lastVideoKey = videoKey;
    this.backdrop = sprite;
    // backdropInfo.url 存 IDB key (新通道) — 不再 base64 进 JSON
    this.backdropInfo = {
      url: videoKey || dataUrl,    // 新存档存 videoKey 引用;旧存档保留 dataUrl
      type: 'video',
      x: fit.x, y: fit.y, w: fit.w, h: fit.h, natW, natH,
    };
    if (!this._restoringBackdrop) {
      this._useOriginalTerrain = false;
      this._hideAutoLayerForBackdrop();
      this._applyBackdropCameraBg();
      const orient = natW >= natH ? '横版' : '竖版';
      const sizeMB = blob ? (blob.size / 1048576).toFixed(2) : (dataUrl.length * 0.75 / 1048576).toFixed(2);
      this._announce(`🎬 ${orient} 视频底图已导入 (${natW}×${natH}, ${sizeMB} MB · ${blob ? 'IDB Blob 直存' : '兼容旧 dataURL'}) · 已切到自定义底图`);
    } else if (this._useOriginalTerrain) {
      sprite.setVisible(false);
      this._restoreAutoLayerForBackdrop();
      this._restoreCameraBg();
    } else {
      this._hideAutoLayerForBackdrop();
      this._applyBackdropCameraBg();
    }
    this._restoringBackdrop = false;
    this._refreshTerrainSwitcher();
  }

  _waitForVideoFrame(vid) {
    return new Promise((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        vid.removeEventListener('loadeddata', onReady);
        vid.removeEventListener('canplay', onReady);
        vid.removeEventListener('error', onError);
        clearTimeout(timer);
      };
      const finish = (fn) => {
        if (done) return;
        done = true;
        cleanup();
        fn();
      };
      const onReady = () => {
        if (vid.readyState >= 2 && vid.videoWidth && vid.videoHeight) {
          finish(resolve);
        }
      };
      const onError = () => finish(() => reject(new Error('视频解码失败,格式可能不被浏览器支持')));
      const timer = setTimeout(() => {
        finish(() => reject(new Error('视频加载超时,请确认 MP4 编码为浏览器支持的 H.264/AAC 或改用 WebM')));
      }, 12000);
      vid.addEventListener('loadeddata', onReady);
      vid.addEventListener('canplay', onReady);
      vid.addEventListener('error', onError, { once: true });
      const p = vid.play();
      if (p && p.catch) p.catch(() => {});
      onReady();
    });
  }

  _rollbackBackdropLoadFailure() {
    this.backdropInfo = null;
    this._useOriginalTerrain = true;
    this._restoreAutoLayerForBackdrop();
    this._restoreCameraBg();
    this._refreshTerrainSwitcher();
  }

  // PNG/JPG/静态 WebP: 用原生 Image 直接解码后注册 textures,绕过 Phaser loader 状态问题
  _loadBackdrop(url) {
    const key = `editor-backdrop-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const img = new Image();
    img.onerror = () => this._announce('⚠ 底图加载失败 (格式不支持或文件损坏)');
    img.onload = () => {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      const natW = img.naturalWidth || img.width;
      const natH = img.naturalHeight || img.height;
      // 仅当源图超 GPU 单纹理上限时才用 canvas 等比缩,否则保持原图原画质
      const maxTex = this._gpuMaxTex();
      const overshoot = Math.max(natW, natH) / maxTex;
      let srcForTex = img;
      if (overshoot > 1) {
        const dw = Math.floor(natW / overshoot);
        const dh = Math.floor(natH / overshoot);
        const c = document.createElement('canvas');
        c.width = dw; c.height = dh;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, dw, dh);
        srcForTex = c;
        this._announce(`ℹ 源图 ${natW}×${natH} 超 GPU 上限 ${maxTex},已降采到 ${dw}×${dh}`);
      }
      this.scene.textures.addImage(key, srcForTex);
      if (this.backdrop) this.backdrop.destroy();
      const fit = this._fitToIsland(natW, natH);
      this.backdrop = this.scene.add.image(fit.x, fit.y, key).setOrigin(0, 0).setDepth(-85);
      this.backdrop.setDisplaySize(fit.w, fit.h);
      this.backdropInfo = { url, type: 'image', x: fit.x, y: fit.y, w: fit.w, h: fit.h, natW, natH };
      if (!this._restoringBackdrop) {
        this._useOriginalTerrain = false;
        this._hideAutoLayerForBackdrop();
        this._applyBackdropCameraBg();
        const orient = natW >= natH ? '横版' : '竖版';
        this._announce(`🗺 ${orient}底图已导入 (${natW}×${natH} → 世界尺寸 ${fit.w}×${fit.h}) · 已切到自定义底图`);
      } else if (this._useOriginalTerrain) {
        this.backdrop.setVisible(false);
        this._restoreAutoLayerForBackdrop();
        this._restoreCameraBg();
      } else {
        this._hideAutoLayerForBackdrop();
        this._applyBackdropCameraBg();
      }
      this._restoringBackdrop = false;
      this._refreshTerrainSwitcher();
    };
    img.src = url;
  }

  // 动画底图: 用 ImageDecoder 拆前 30 帧 → 拼成横向 sheet → 注册 Phaser 动画
  // 支持 GIF / APNG / 动画 WebP — 静态(1 帧) 会被外层回退到 _loadBackdrop
  async _loadAnimatedBackdrop(fileOrBlob, mimeType) {
    if (typeof ImageDecoder === 'undefined') {
      this._announce('⚠ 浏览器不支持拆帧(需 Chrome 99+/Firefox 120+/Safari 17+)');
      return;
    }
    const type = mimeType || 'image/gif';
    // 用完整 ArrayBuffer 喂 decoder — Stream 在动画 WebP 上 frameCount 常停在 1
    const buffer = fileOrBlob.arrayBuffer ? await fileOrBlob.arrayBuffer() : fileOrBlob;
    const decoder = new ImageDecoder({ data: buffer, type });
    await decoder.tracks.ready;
    // 关键:等待全部 metadata,否则 WebP/APNG 的 frameCount 可能滞后
    try { await decoder.completed; } catch (e) { /* 部分浏览器无该 promise */ }
    const track = decoder.tracks.selectedTrack;
    let total = track.frameCount || 0;
    // 兜底:frameCount 仍 0/1 但 track.animated=true → 主动探帧
    if ((!total || total <= 1) && track.animated) {
      total = 0;
      try {
        while (total < 120) {
          await decoder.decode({ frameIndex: total, completeFramesOnly: true });
          total++;
        }
      } catch (e) { /* 越界即结束 */ }
    }
    if (!total) total = 1;
    // 真静态(1 帧) → 走静态路径,带 _fitToIsland 自适配
    if (total <= 1) {
      const blob = (fileOrBlob instanceof Blob) ? fileOrBlob : new Blob([fileOrBlob], { type });
      const url = await new Promise((resolve) => {
        const r = new FileReader(); r.onload = (ev) => resolve(ev.target.result); r.readAsDataURL(blob);
      });
      this._loadBackdrop(url);
      this._announce('🗺 静态底图已加载 (单帧)');
      return;
    }
    const MAX = 30;
    const frameCount = Math.min(total, MAX);
    if (total > MAX) this._announce(`⚠ 共 ${total} 帧,只加载前 ${MAX} 帧`);

    // 拆出每帧 ImageBitmap, 计算尺寸
    const frames = [];
    let avgDur = 100; // ms 默认
    for (let i = 0; i < frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      frames.push(image);
      if (image.duration) avgDur = Math.max(20, Math.round(image.duration / 1000));
    }
    const srcW = frames[0].displayWidth || frames[0].width;
    const srcH = frames[0].displayHeight || frames[0].height;
    // 用网格布局合成 sheet 而不是一长条,且每帧自动降采样到 GPU 单纹理上限内
    const layout = this._packFramesGrid(frames, srcW, srcH, frameCount);
    const fw = layout.fw, fh = layout.fh;
    const sheetUrl = layout.canvas.toDataURL('image/png');

    // 注册到 Phaser 当 spritesheet
    const key = `editor-backdrop-gif-${Date.now()}`;
    this.scene.load.spritesheet(key, sheetUrl, { frameWidth: fw, frameHeight: fh });
    this.scene.load.once('complete', () => {
      if (this.backdrop) this.backdrop.destroy();
      const fit = this._fitToIsland(fw, fh);
      const animKey = key + '-anim';
      if (this.scene.anims.exists(animKey)) this.scene.anims.remove(animKey);
      this.scene.anims.create({
        key: animKey,
        frames: this.scene.anims.generateFrameNumbers(key, { start: 0, end: frameCount - 1 }),
        frameRate: Math.max(1, Math.round(1000 / avgDur)),
        repeat: -1,
      });
      this.backdrop = this.scene.add.sprite(fit.x, fit.y, key, 0).setOrigin(0, 0).setDepth(-85);
      this.backdrop.setDisplaySize(fit.w, fit.h);
      this.backdrop.play(animKey);
      this.backdropInfo = { url: sheetUrl, type: 'gif', x: fit.x, y: fit.y, w: fit.w, h: fit.h, fw, fh, frameCount, frameRate: Math.round(1000 / avgDur) };
      this._useOriginalTerrain = false;
      this._hideAutoLayerForBackdrop();
      this._applyBackdropCameraBg();
      this._refreshTerrainSwitcher();
      this._announce(`🎞 动画底图已导入 (源 ${srcW}×${srcH},sheet 每帧 ${fw}×${fh},${frameCount} 帧) · 已切到自定义底图`);
    });
    this.scene.load.start();
  }

  // 从存档 (data.backdrop) 还原 GIF 动画底图 (sheet dataURL 已存,直接注册动画)
  _loadGifSheetFromDataUrl(info) {
    const { url, fw, fh, frameCount, frameRate } = info;
    const key = `editor-backdrop-gif-${Date.now()}`;
    this.scene.load.spritesheet(key, url, { frameWidth: fw, frameHeight: fh });
    this.scene.load.once('complete', () => {
      if (this.backdrop) this.backdrop.destroy();
      const fit = this._fitToIsland(fw, fh);
      const animKey = key + '-anim';
      if (this.scene.anims.exists(animKey)) this.scene.anims.remove(animKey);
      this.scene.anims.create({
        key: animKey,
        frames: this.scene.anims.generateFrameNumbers(key, { start: 0, end: frameCount - 1 }),
        frameRate: frameRate || 10, repeat: -1,
      });
      this.backdrop = this.scene.add.sprite(fit.x, fit.y, key, 0).setOrigin(0, 0).setDepth(-85);
      this.backdrop.setDisplaySize(fit.w, fit.h);
      this.backdrop.play(animKey);
      this.backdropInfo = { url, type: 'gif', x: fit.x, y: fit.y, w: fit.w, h: fit.h, fw, fh, frameCount, frameRate };
      // 根据存档时记录的当前模式应用可见性
      if (this._useOriginalTerrain) {
        this.backdrop.setVisible(false);
        this._restoreAutoLayerForBackdrop();
        this._restoreCameraBg();
      } else {
        this._hideAutoLayerForBackdrop();
        this._applyBackdropCameraBg();
      }
      this._restoringBackdrop = false;
      this._refreshTerrainSwitcher();
    });
    this.scene.load.start();
  }

  // 根据底图尺寸扩展世界 / 摄像机 / 物理边界
  _expandWorldTo(maxX, maxY) {
    const W = Math.max(maxX, this.scene.scale.width);
    const H = Math.max(maxY, this.scene.scale.height);
    if (this.scene.cameras && this.scene.cameras.main) {
      this.scene.cameras.main.setBounds(0, 0, W, H);
    }
    if (this.scene.physics && this.scene.physics.world) {
      this.scene.physics.world.setBounds(0, 0, W, H);
    }
    this.scene._worldW = W;
    this.scene._worldH = H;
  }

  removeBackdrop() {
    if (this._videoLoopGuard) { clearInterval(this._videoLoopGuard); this._videoLoopGuard = null; }
    if (this.backdrop) { this.backdrop.destroy(); this.backdrop = null; }
    // 顺手把 IDB 里的视频 Blob 也清掉,不留垃圾
    if (this._lastVideoKey) { deleteBlob(this._lastVideoKey).catch(() => {}); this._lastVideoKey = null; }
    this.backdropInfo = null;
    this._useOriginalTerrain = true;
    this._restoreAutoLayerForBackdrop();
    this._restoreCameraBg();
    this._refreshTerrainSwitcher();
    this._announce('🗑 底图已移除 → 已切回原地形');
  }

  // 切换地形模式:'original' = painterly auto-gen | 'custom' = 当前自定义底图
  setTerrainMode(mode) {
    if (mode === 'original') {
      this._useOriginalTerrain = true;
      if (this.backdrop) this.backdrop.setVisible(false);
      this._restoreAutoLayerForBackdrop();
      this._restoreCameraBg();
      this._announce('🌿 已切到原地形');
    } else if (mode === 'custom') {
      if (!this.backdrop) { this._announce('⚠ 还没有自定义底图,先导入一张'); return; }
      this._useOriginalTerrain = false;
      this.backdrop.setVisible(true);
      this._hideAutoLayerForBackdrop();
      this._applyBackdropCameraBg();
      this._announce('🖼 已切到自定义底图');
    }
    this._refreshTerrainSwitcher();
  }

  _refreshTerrainSwitcher() {
    const oBtn = document.getElementById('ed-terrain-orig');
    const cBtn = document.getElementById('ed-terrain-custom');
    if (!oBtn || !cBtn) return;
    const hasCustom = !!this.backdrop;
    const orig = !!this._useOriginalTerrain;
    oBtn.style.outline = orig ? '2px solid #4fd6ff' : 'none';
    cBtn.style.outline = (!orig && hasCustom) ? '2px solid #4fd6ff' : 'none';
    cBtn.style.opacity = hasCustom ? '1' : '0.45';
    cBtn.title = hasCustom ? '切换到自定义底图' : '尚无自定义底图,先点 导入底图';
  }

  // 查询当前 GPU 真实单纹理上限 (现代桌面常 8192~16384)
  _gpuMaxTex() {
    if (this._cachedMaxTex) return this._cachedMaxTex;
    try {
      const game = this.scene.sys && this.scene.sys.game;
      const gl = game && game.renderer && game.renderer.gl;
      if (gl) {
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        if (max && max > 0) {
          this._cachedMaxTex = Math.min(max, 16384);
          return this._cachedMaxTex;
        }
      }
    } catch (e) {}
    return 4096;
  }

  // ===== 帧网格打包 (避免 1×N 横长条超 GPU 上限) =====
  // 自动选择 cols×rows + 必要时降采样,保证 sheet 在真实 MAX_TEX 内
  _packFramesGrid(frames, srcW, srcH, frameCount) {
    const MAX_TEX = this._gpuMaxTex();
    let cols = Math.ceil(Math.sqrt(frameCount));
    let rows = Math.ceil(frameCount / cols);
    let fw = srcW, fh = srcH;
    // 若网格总尺寸超上限,等比下采样直到适配
    const overshoot = () => Math.max(cols * fw, rows * fh) / MAX_TEX;
    let guard = 12;
    while (overshoot() > 1 && guard-- > 0) {
      const factor = 1 / overshoot();
      fw = Math.max(8, Math.floor(fw * factor));
      fh = Math.max(8, Math.floor(fh * factor));
    }
    const canvas = document.createElement('canvas');
    canvas.width = cols * fw;
    canvas.height = rows * fh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    frames.forEach((bm, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      ctx.drawImage(bm, c * fw, r * fh, fw, fh);
    });
    return { canvas, fw, fh, cols, rows };
  }

  // 自适配:把上传的图直接拉伸填满整个 WORLD (不只是 ISLAND),不再有边缘缝
  // 任何分辨率/比例都会铺满 2560×1792,viewport 比 world 大时摄像机背景色兜底
  _fitToIsland(natW, natH) {
    return {
      x: 0, y: 0,
      w: MAP_COLS * TILE,
      h: MAP_ROWS * TILE,
      scale: 1,
    };
  }

  // 进编辑/导入底图时,把摄像机背景色改成海蓝,避免 viewport 超 world 时露暗绿
  _applyBackdropCameraBg() {
    if (this.scene.cameras && this.scene.cameras.main) {
      this.scene.cameras.main.setBackgroundColor('#3a7a9c');
    }
  }
  _restoreCameraBg() {
    if (this.scene.cameras && this.scene.cameras.main) {
      this.scene.cameras.main.setBackgroundColor('#1d2b1d');
    }
  }

  // 底图加载后,把原地形 + 海面背景都隐藏起来 — "完整替换原底图"
  // 同步停用原地形的物理碰撞 (没标 _isPieceSolid 的都是 auto 出生)
  // 否则:画面上看不到墙,但玩家/敌人还是被隐形原墙挡住 → 严重不一致
  _hideAutoLayerForBackdrop() {
    if (this._autoLayerHiddenByBackdrop) return; // 幂等:已经藏过就不重复
    const hidden = [];
    const push = (o) => {
      if (o && o.visible && o.setVisible) { hidden.push(o); o.setVisible(false); }
    };
    const layer = this.scene._autoLayer;
    if (layer && layer.length) layer.forEach(push);
    this.scene.children.list.forEach((o) => {
      if (!o || o === this.backdrop) return;
      if (typeof o.depth === 'number' && o.depth <= -90) push(o);
    });
    this._autoLayerHiddenByBackdrop = hidden;
    // 同步:停用所有"非编辑器画"的碰撞体
    this._autoSolidsHiddenSnapshot = [];
    if (this.scene.solids) {
      this.scene.solids.getChildren().forEach((s) => {
        if (!s || s._isPieceSolid) return; // 玩家手画的保留
        if (!s.body) return;
        if (s.body.enable) {
          this._autoSolidsHiddenSnapshot.push(s);
          s.body.enable = false;
        }
      });
    }
  }
  _restoreAutoLayerForBackdrop() {
    if (this._autoLayerHiddenByBackdrop) {
      this._autoLayerHiddenByBackdrop.forEach((o) => { if (o && o.setVisible) o.setVisible(true); });
      this._autoLayerHiddenByBackdrop = null;
    }
    if (this._autoSolidsHiddenSnapshot) {
      this._autoSolidsHiddenSnapshot.forEach((s) => {
        if (s && s.body && !s._editorClaimed) s.body.enable = true;
      });
      this._autoSolidsHiddenSnapshot = null;
    }
  }

  // ===== 网格涂抹系统（碰撞 + 踏区）=====
  _activeCells() { return this.tool === 'step' ? this.stepCells : this.collideCells; }

  setTool(t) {
    this.tool = (this.tool === t) ? null : t;
    this.shape = 'brush';
    this._rectStart = null; this._rectEnd = null; this._painting = false;
    const names = { collide: '🛡 碰撞', step: '🪜 踏区' };
    if (this.tool) this._announce(`${names[this.tool]} 画笔 — 左键涂 · 右侧切换画笔/框选/擦除 · 笔刷大小可调`);
    else this._announce('✓ 已退出网格工具');
    this._syncToolUI();
    this._drawZones();
  }
  setShape(s) {
    this.shape = s;
    this._rectStart = null; this._rectEnd = null;
    this._lassoPts = []; this._lassoCursor = null;
    this._syncToolUI(); this._drawZones();
  }
  setErase(on) { this.erase = !!on; this._syncToolUI(); }
  setBrushSize(n) { this.brushSize = Math.max(1, Math.min(10, n | 0)); this._syncToolUI(); }
  // 清指定层 (与当前选中的 tool 无关) — 'collide' 或 'step'
  clearLayer(layer) {
    this._snapshot();
    if (layer === 'collide') {
      this.collideCells.clear();
      this.placed.forEach((p) => {
        if (p.pieceCells) p.pieceCells.clear();
        if (p.pieceSolids && p.pieceSolids.length) {
          p.pieceSolids.forEach((s) => s && s.destroy && s.destroy());
          p.pieceSolids = [];
        }
        p.collide = false;
      });
      this._rebuildSolidsFromCells();
      this._announce('↺ 已清空全部碰撞');
    } else if (layer === 'step') {
      this.stepCells.clear();
      this.placed.forEach((p) => { if (p.pieceStepCells) p.pieceStepCells.clear(); });
      this._recomputeStepZones();
      this._announce('↺ 已清空全部踏区');
    }
    this._drawZones();
  }

  clearActiveCells() {
    if (!this.tool) return;
    this._snapshot();
    // 一律清当前工具对应的格子:全局 + 所有件的同类格子
    if (this.tool === 'collide') {
      this.collideCells.clear();
      this.placed.forEach((p) => {
        if (p.pieceCells) p.pieceCells.clear();
        if (p.pieceSolids && p.pieceSolids.length) {
          p.pieceSolids.forEach((s) => s && s.destroy && s.destroy());
          p.pieceSolids = [];
        }
        p.collide = false;
      });
      this._rebuildSolidsFromCells();
    } else if (this.tool === 'step') {
      this.stepCells.clear();
      this.placed.forEach((p) => { if (p.pieceStepCells) p.pieceStepCells.clear(); });
      this._recomputeStepZones();
    } else if (this.tool === 'spawn') {
      this.spawnPoints = [];
      this.scene._customSpawnPoints = [];
    } else if (this.tool === 'herospawn') {
      this.heroSpawn = null;
      this.scene._customHeroSpawn = null;
    }
    this._drawZones();
    this._syncToolUI();
    const label = this.tool === 'collide' ? '碰撞'
                : (this.tool === 'step' ? '踏区'
                : (this.tool === 'herospawn' ? '玩家出生点' : '敌人出生点'));
    this._announce(`↺ 已清空当前层 (${label})`);
  }

  // 一键反选 = 把当前已画的区域和未画的区域互换
  // 范围:选中件 → 件本地 footprint (贴图边界);全局 → ISLAND 范围
  invertActiveCells() {
    if (!this.tool) { this._announce('⚠ 先选 碰撞 或 踏区'); return; }
    this._snapshot();
    const piece = this.selected;
    const onPiece = !!piece && (this.tool === 'collide' || this.tool === 'step');
    if (onPiece) {
      const target = this.tool === 'step' ? piece.pieceStepCells : piece.pieceCells;
      // 件本地范围:贴图原始像素尺寸 / GRID,以件中心为 (0,0) 的本地坐标
      const tex = this.scene.textures.get(piece.tex);
      const src = tex && tex.getSourceImage && tex.getSourceImage();
      const tw = (src && (src.width || src.naturalWidth)) || 192;
      const th = (src && (src.height || src.naturalHeight)) || 192;
      const o = piece.obj;
      // 件本地像素范围: [-tw*originX, tw*(1-originX)] 横向
      const lx0 = -tw * (o.originX || 0.5);
      const ly0 = -th * (o.originY || 0.5);
      const lx1 = lx0 + tw, ly1 = ly0 + th;
      const c0 = Math.floor(lx0 / this.GRID), c1 = Math.floor((lx1 - 1) / this.GRID);
      const r0 = Math.floor(ly0 / this.GRID), r1 = Math.floor((ly1 - 1) / this.GRID);
      const next = new Set();
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const k = `${c},${r}`;
          if (!target.has(k)) next.add(k);
        }
      }
      if (this.tool === 'step') piece.pieceStepCells = next;
      else piece.pieceCells = next;
      if (this.tool === 'collide') this._rebuildPieceSolids(piece);
      else this._recomputeStepZones();
      this._announce(`↔ 已反选 (件本地, ${next.size} 格)`);
    } else {
      const cells = this._activeCells();
      // 全局反选范围:ISLAND 矩形
      const ix0 = ISLAND.x0 * TILE, iy0 = ISLAND.y0 * TILE;
      const ix1 = (ISLAND.x1 + 1) * TILE, iy1 = (ISLAND.y1 + 1) * TILE;
      const c0 = Math.floor(ix0 / this.GRID), c1 = Math.floor((ix1 - 1) / this.GRID);
      const r0 = Math.floor(iy0 / this.GRID), r1 = Math.floor((iy1 - 1) / this.GRID);
      const next = new Set();
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const k = `${c},${r}`;
          if (!cells.has(k)) next.add(k);
        }
      }
      if (this.tool === 'collide') { this.collideCells = next; this._rebuildSolidsFromCells(); }
      else { this.stepCells = next; this._recomputeStepZones(); }
      this._announce(`↔ 已反选 (全局岛屿范围, ${next.size} 格)`);
    }
    this._drawZones();
  }

  // ====== 件本地坐标 vs 世界坐标 转换 ======
  // piece 本地格子: 相对件中心 (px, py) 的"原始像素" cell index
  // 显示/物理体: 件本地格子 → 当前世界矩形(考虑件的当前 x,y, scaleX, flipX, flipY)
  _pieceLocalCellToWorldRect(p, c, r) {
    const o = p.obj;
    const sx = o.scaleX * (o.flipX ? -1 : 1);
    const sy = o.scaleY * (o.flipY ? -1 : 1);
    // 本地格子 c,r → 本地像素中心 ((c+0.5)*G, (r+0.5)*G) → 世界 (o.x + lx*sx, o.y + ly*sy)
    const lx = (c + 0.5) * this.GRID; const ly = (r + 0.5) * this.GRID;
    const wx = o.x + lx * sx; const wy = o.y + ly * sy;
    const ww = this.GRID * Math.abs(sx); const hh = this.GRID * Math.abs(sy);
    return { x: wx - ww / 2, y: wy - hh / 2, w: ww, h: hh };
  }
  // 世界坐标点 → 件本地格子 index
  _worldToPieceCell(p, wx, wy) {
    const o = p.obj;
    const sx = o.scaleX * (o.flipX ? -1 : 1) || 1;
    const sy = o.scaleY * (o.flipY ? -1 : 1) || 1;
    const lx = (wx - o.x) / sx;
    const ly = (wy - o.y) / sy;
    return { c: Math.floor(lx / this.GRID), r: Math.floor(ly / this.GRID) };
  }

  // 把世界坐标圆形笔刷范围内的格子加入/移除
  // 选中件且 tool=collide → 写到 piece.pieceCells (跟件走)
  // 否则 → 写全局 collideCells/stepCells
  _paintBrush(wx, wy) {
    const onPiece = !!this.selected && (this.tool === 'collide' || this.tool === 'step');
    const R = this.brushSize;
    if (onPiece) {
      const p = this.selected;
      const target = this.tool === 'step' ? p.pieceStepCells : p.pieceCells;
      const c0 = this._worldToPieceCell(p, wx, wy);
      for (let dr = -R; dr <= R; dr++) {
        for (let dc = -R; dc <= R; dc++) {
          if (dc * dc + dr * dr > R * R) continue;
          const key = `${c0.c + dc},${c0.r + dr}`;
          if (this.erase) target.delete(key); else target.add(key);
        }
      }
      if (this.tool === 'collide') this._rebuildPieceSolids(p);
      else this._recomputeStepZones();
    } else {
      const cells = this._activeCells();
      const cc = Math.floor(wx / this.GRID);
      const cr = Math.floor(wy / this.GRID);
      for (let dr = -R; dr <= R; dr++) {
        for (let dc = -R; dc <= R; dc++) {
          if (dc * dc + dr * dr > R * R) continue;
          const key = `${cc + dc},${cr + dr}`;
          if (this.erase) cells.delete(key); else cells.add(key);
        }
      }
      if (this.tool === 'step') this._recomputeStepZones();
      else this._rebuildSolidsFromCells();
    }
    this._drawZones();
  }

  // 矩形框选 → 批量加/减格子 (绑件 or 全局,同 _paintBrush 规则)
  _applyRect(a, e) {
    const onPiece = !!this.selected && (this.tool === 'collide' || this.tool === 'step');
    if (onPiece) {
      const p = this.selected;
      const target = this.tool === 'step' ? p.pieceStepCells : p.pieceCells;
      const k0 = this._worldToPieceCell(p, Math.min(a.x, e.x), Math.min(a.y, e.y));
      const k1 = this._worldToPieceCell(p, Math.max(a.x, e.x), Math.max(a.y, e.y));
      for (let r = Math.min(k0.r, k1.r); r <= Math.max(k0.r, k1.r); r++) {
        for (let c = Math.min(k0.c, k1.c); c <= Math.max(k0.c, k1.c); c++) {
          const key = `${c},${r}`;
          if (this.erase) target.delete(key); else target.add(key);
        }
      }
      if (this.tool === 'collide') this._rebuildPieceSolids(p);
      else this._recomputeStepZones();
    } else {
      const cells = this._activeCells();
      const c0 = Math.floor(Math.min(a.x, e.x) / this.GRID);
      const c1 = Math.floor(Math.max(a.x, e.x) / this.GRID);
      const r0 = Math.floor(Math.min(a.y, e.y) / this.GRID);
      const r1 = Math.floor(Math.max(a.y, e.y) / this.GRID);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const key = `${c},${r}`;
          if (this.erase) cells.delete(key); else cells.add(key);
        }
      }
    }
  }

  // 点是否在多边形内 (射线法, pts: [{x,y}, ...])
  _pointInPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi)) inside = !inside;
    }
    return inside;
  }

  // 套索闭合 → 把多边形栅格化到格子并写入(全局 or 绑件)
  _lassoClose() {
    const pts = this._lassoPts;
    if (pts.length < 3) { this._lassoPts = []; this._lassoCursor = null; this._drawZones(); return; }
    const onPiece = !!this.selected && (this.tool === 'collide' || this.tool === 'step');
    let localPts;
    if (onPiece) {
      const o = this.selected.obj;
      const sx = o.scaleX * (o.flipX ? -1 : 1) || 1;
      const sy = o.scaleY * (o.flipY ? -1 : 1) || 1;
      localPts = pts.map((P) => ({ x: (P.x - o.x) / sx, y: (P.y - o.y) / sy }));
    } else {
      localPts = pts;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    localPts.forEach((P) => { if (P.x < minX) minX = P.x; if (P.x > maxX) maxX = P.x; if (P.y < minY) minY = P.y; if (P.y > maxY) maxY = P.y; });
    const c0 = Math.floor(minX / this.GRID), c1 = Math.floor(maxX / this.GRID);
    const r0 = Math.floor(minY / this.GRID), r1 = Math.floor(maxY / this.GRID);
    const targetCells = onPiece
      ? (this.tool === 'step' ? this.selected.pieceStepCells : this.selected.pieceCells)
      : this._activeCells();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cx = (c + 0.5) * this.GRID; const cy = (r + 0.5) * this.GRID;
        if (!this._pointInPoly(cx, cy, localPts)) continue;
        const key = `${c},${r}`;
        if (this.erase) targetCells.delete(key); else targetCells.add(key);
      }
    }
    if (onPiece) {
      if (this.tool === 'collide') this._rebuildPieceSolids(this.selected);
      else this._recomputeStepZones();
    } else if (this.tool === 'step') this._recomputeStepZones();
    else this._rebuildSolidsFromCells();
    this._lassoPts = []; this._lassoCursor = null;
    this._drawZones();
  }

  // 件的本地格子集合 → 世界矩形列表(已合并,跟随件 transform)
  _pieceCellsSetToWorldRects(p, cells) {
    if (!cells || !cells.size) return [];
    const localRects = this._cellsToRects(cells);
    const o = p.obj;
    const sx = o.scaleX * (o.flipX ? -1 : 1);
    const sy = o.scaleY * (o.flipY ? -1 : 1);
    return localRects.map((R) => {
      const lx = R.x + R.w / 2; const ly = R.y + R.h / 2;
      const wx = o.x + lx * sx; const wy = o.y + ly * sy;
      const ww = R.w * Math.abs(sx); const hh = R.h * Math.abs(sy);
      return { x: wx - ww / 2, y: wy - hh / 2, w: ww, h: hh };
    });
  }
  _pieceCellsToWorldRects(p) { return this._pieceCellsSetToWorldRects(p, p.pieceCells); }

  // 重新计算 scene._stepZones (全局 stepCells + 各件 pieceStepCells)
  _recomputeStepZones() {
    const out = [...this._cellsToRects(this.stepCells)];
    this.placed.forEach((p) => {
      if (p.pieceStepCells && p.pieceStepCells.size) {
        out.push(...this._pieceCellsSetToWorldRects(p, p.pieceStepCells));
      }
    });
    this.scene._stepZones = out;
  }

  // 重建件的物理体(根据当前 pieceCells + 当前世界变换)
  _rebuildPieceSolids(p) {
    if (p.pieceSolids) p.pieceSolids.forEach((s) => s.destroy());
    p.pieceSolids = [];
    p.collide = p.pieceCells && p.pieceCells.size > 0;
    if (p.collide) {
      // 矩形 → 圆形链 (滑墙更顺,无阶梯凹角)
      this._pieceCellsToWorldRects(p).forEach((R) => {
        const list = this.scene.addSolidAsCircles
          ? this.scene.addSolidAsCircles(R.x, R.y, R.w, R.h)
          : [this.scene.addSolid(R.x + R.w / 2, R.y + R.h / 2, R.w, R.h)];
        list.forEach((s) => { s._isPieceSolid = true; p.pieceSolids.push(s); });
      });
    }
    // 件的踏区也跟随 transform 重算
    this._recomputeStepZones();
  }

  // 一键自动生成: 用 footprint 算出件本地的格子集(可后续画笔修改)
  autoGenPieceCollide(p) {
    if (!p) return;
    const tex = this.scene.textures.get(p.tex);
    const fp = computeFootprint(tex);
    if (!fp) { this._announce('⚠ 该贴图无法自动检测地基'); return; }
    this._snapshot();
    // fp 是 texture-native 像素: cx, cy 中心 + w, h
    // 件 origin (originX, originY) 决定 texture 左上角相对件中心的偏移
    const o = p.obj;
    const off = {
      x: -fp.texW * o.originX,            // texture 左上角 X (件本地像素)
      y: -fp.texH * o.originY,
    };
    // footprint 矩形 (件本地像素)
    const lx0 = off.x + fp.cx - fp.w / 2;
    const ly0 = off.y + fp.cy - fp.h / 2;
    const lx1 = off.x + fp.cx + fp.w / 2;
    const ly1 = off.y + fp.cy + fp.h / 2;
    // 转格子索引
    const c0 = Math.floor(lx0 / this.GRID); const c1 = Math.floor(lx1 / this.GRID);
    const r0 = Math.floor(ly0 / this.GRID); const r1 = Math.floor(ly1 / this.GRID);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) p.pieceCells.add(`${c},${r}`);
    }
    this._rebuildPieceSolids(p);
    this._drawZones();
    this._announce(`🛡 已生成 ${p.pieceCells.size} 个碰撞格 — 用画笔可微调`);
  }

  clearPieceCells(p) {
    if (!p) return;
    this._snapshot();
    p.pieceCells.clear();
    if (p.pieceStepCells) p.pieceStepCells.clear();
    this._rebuildPieceSolids(p);
    this._drawZones();
  }

  // ===== 预设(按贴图 key 持久化) =====
  _presetKey(tex) { return `tinyswords.preset.collide.v1.${tex}`; }
  hasPreset(tex) {
    try { return !!localStorage.getItem(this._presetKey(tex)); } catch (e) { return false; }
  }
  savePresetFromPiece(p) {
    if (!p) return;
    const data = {
      tex: p.tex,
      pieceCells: [...(p.pieceCells || [])],
      pieceStepCells: [...(p.pieceStepCells || [])],
    };
    if (!data.pieceCells.length && !data.pieceStepCells.length) {
      this._announce('⚠ 该件无碰撞/踏区,无需保存');
      return;
    }
    try {
      localStorage.setItem(this._presetKey(p.tex), JSON.stringify(data));
      this._announce(`💾 已保存预设: ${p.tex}`);
      this._refreshSelInfo();
    } catch (e) { this._announce('⚠ 预设保存失败'); }
  }
  applyPresetToPiece(p) {
    if (!p) return;
    let raw; try { raw = localStorage.getItem(this._presetKey(p.tex)); } catch (e) { return; }
    if (!raw) { this._announce(`⚠ ${p.tex} 无预设`); return; }
    this._snapshot();
    try {
      const d = JSON.parse(raw);
      p.pieceCells = new Set(d.pieceCells || []);
      p.pieceStepCells = new Set(d.pieceStepCells || []);
      this._rebuildPieceSolids(p);
      this._drawZones();
      this._announce(`📋 已套用预设: ${p.tex}`);
    } catch (e) { this._announce('⚠ 预设读取失败'); }
  }
  clearPreset(tex) {
    try { localStorage.removeItem(this._presetKey(tex)); } catch (e) {}
    this._announce(`🗑 已清除预设: ${tex}`);
    this._refreshSelInfo();
  }

  // 贪心合并格子集合 → 最少矩形列表（先按行合并连续段，再纵向合并相同区间）
  _cellsToRects(cells) {
    if (!cells.size) return [];
    // 收集 (c,r)
    const byRow = new Map();
    cells.forEach((k) => {
      const [c, r] = k.split(',').map(Number);
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r).push(c);
    });
    // 每行先合并成水平段 {r, c0, c1}
    let segs = [];
    [...byRow.keys()].sort((a, b) => a - b).forEach((r) => {
      const cs = byRow.get(r).sort((a, b) => a - b);
      let start = cs[0]; let prev = cs[0];
      for (let i = 1; i < cs.length; i++) {
        if (cs[i] === prev + 1) { prev = cs[i]; continue; }
        segs.push({ r, c0: start, c1: prev }); start = cs[i]; prev = cs[i];
      }
      segs.push({ r, c0: start, c1: prev });
    });
    // 纵向合并：相同 c0/c1 且行连续的段堆叠成矩形
    segs.sort((a, b) => (a.c0 - b.c0) || (a.c1 - b.c1) || (a.r - b.r));
    const rects = [];
    let cur = null;
    segs.forEach((s) => {
      if (cur && s.c0 === cur.c0 && s.c1 === cur.c1 && s.r === cur.r1 + 1) {
        cur.r1 = s.r;
      } else {
        if (cur) rects.push(cur);
        cur = { c0: s.c0, c1: s.c1, r0: s.r, r1: s.r };
      }
    });
    if (cur) rects.push(cur);
    // 转世界坐标矩形 {x,y,w,h}
    return rects.map((R) => ({
      x: R.c0 * this.GRID, y: R.r0 * this.GRID,
      w: (R.c1 - R.c0 + 1) * this.GRID, h: (R.r1 - R.r0 + 1) * this.GRID,
    }));
  }

  // 重建物理碰撞体（合并矩形后生成 solids）
  _rebuildSolidsFromCells() {
    if (this._gridSolids) this._gridSolids.forEach((s) => s.destroy());
    this._gridSolids = [];
    const rects = this._cellsToRects(this.collideCells);
    rects.forEach((R) => {
      const list = this.scene.addSolidAsCircles
        ? this.scene.addSolidAsCircles(R.x, R.y, R.w, R.h)
        : [this.scene.addSolid(R.x + R.w / 2, R.y + R.h / 2, R.w, R.h)];
      list.forEach((s) => { s._isPieceSolid = true; this._gridSolids.push(s); });
    });
    // 踏区暴露给场景 (合并全局 + 各件)
    this._recomputeStepZones();
  }

  // 画出碰撞区（红）+ 踏区（蓝），都用合并后的最少矩形，干净不重叠
  _drawZones() {
    if (!this.zoneGfx) this.zoneGfx = this.scene.add.graphics().setDepth(99996);
    const g = this.zoneGfx;
    g.clear();
    if (!this.active) return;
    // 碰撞区(红)— 全局
    this._cellsToRects(this.collideCells).forEach((R) => {
      g.fillStyle(0xff3030, 0.25); g.fillRect(R.x, R.y, R.w, R.h);
      g.lineStyle(2, 0xff3030, 0.85); g.strokeRect(R.x, R.y, R.w, R.h);
    });
    // 各件本地碰撞格 (红, 跟件走)
    this.placed.forEach((p) => {
      if (!p.pieceCells || !p.pieceCells.size) return;
      this._pieceCellsToWorldRects(p).forEach((R) => {
        g.fillStyle(0xff3030, 0.25); g.fillRect(R.x, R.y, R.w, R.h);
        g.lineStyle(2, 0xff3030, 0.85); g.strokeRect(R.x, R.y, R.w, R.h);
      });
    });
    // 踏区(蓝)— 全局
    this._cellsToRects(this.stepCells).forEach((R) => {
      g.fillStyle(0x44d4ff, 0.22); g.fillRect(R.x, R.y, R.w, R.h);
      g.lineStyle(2, 0x44d4ff, 0.8); g.strokeRect(R.x, R.y, R.w, R.h);
    });
    // 各件本地踏区 (蓝, 跟件走)
    this.placed.forEach((p) => {
      if (!p.pieceStepCells || !p.pieceStepCells.size) return;
      this._pieceCellsSetToWorldRects(p, p.pieceStepCells).forEach((R) => {
        g.fillStyle(0x44d4ff, 0.22); g.fillRect(R.x, R.y, R.w, R.h);
        g.lineStyle(2, 0x44d4ff, 0.8); g.strokeRect(R.x, R.y, R.w, R.h);
      });
    });
    // 套索预览
    if (this.shape === 'lasso' && this._lassoPts.length > 0) {
      const col = this.erase ? 0xffffff : (this.tool === 'step' ? 0x88e0ff : 0xff9090);
      const pts = this._lassoPts;
      // 顶点连线
      g.lineStyle(2, col, 0.95);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      // 到光标的预览线
      if (this._lassoCursor) g.lineTo(this._lassoCursor.x, this._lassoCursor.y);
      // 闭合线 (回起点)
      if (pts.length >= 2) g.lineTo(pts[0].x, pts[0].y);
      g.strokePath();
      // 顶点小方块
      pts.forEach((P, i) => {
        g.fillStyle(i === 0 ? 0xffff00 : col, 1);
        g.fillRect(P.x - 3, P.y - 3, 6, 6);
      });
    }
    // 矩形框选预览
    if (this.shape === 'rect' && this._rectStart && this._rectEnd) {
      const a = this._rectStart; const e = this._rectEnd;
      const col = this.erase ? 0xffffff : (this.tool === 'step' ? 0x88e0ff : 0xff9090);
      g.fillStyle(col, 0.3);
      g.fillRect(Math.min(a.x, e.x), Math.min(a.y, e.y), Math.abs(e.x - a.x), Math.abs(e.y - a.y));
      g.lineStyle(2, col, 1);
      g.strokeRect(Math.min(a.x, e.x), Math.min(a.y, e.y), Math.abs(e.x - a.x), Math.abs(e.y - a.y));
    }
    // 玩家出生点 — 绿色菱形 + P 字
    if (this.heroSpawn) {
      const s = this.heroSpawn;
      g.fillStyle(0x44ff88, 0.9);
      g.beginPath();
      g.moveTo(s.x, s.y - 14);
      g.lineTo(s.x + 14, s.y);
      g.lineTo(s.x, s.y + 14);
      g.lineTo(s.x - 14, s.y);
      g.closePath();
      g.fillPath();
      g.lineStyle(3, 0xffffff, 1);
      g.strokePath();
    }
    // 出生点 — 红色实心圆 + 数字编号 + 向中心的箭头
    if (this.spawnPoints && this.spawnPoints.length) {
      const wx = MAP_COLS * TILE / 2;
      const wy = MAP_ROWS * TILE / 2;
      this.spawnPoints.forEach((s, i) => {
        // 箭头指向中心
        g.lineStyle(3, 0xff3030, 0.55);
        g.beginPath();
        g.moveTo(s.x, s.y);
        const ang = Math.atan2(wy - s.y, wx - s.x);
        const len = 60;
        g.lineTo(s.x + Math.cos(ang) * len, s.y + Math.sin(ang) * len);
        g.strokePath();
        // 圆点
        g.fillStyle(0xff3030, 0.85); g.fillCircle(s.x, s.y, 12);
        g.lineStyle(3, 0xffffff, 1); g.strokeCircle(s.x, s.y, 12);
      });
      // 编号 (用 text 必须挂一次,这里复用一个 graphics 已经画不出文字 — 用 scene.add.text 缓存)
      this._refreshSpawnLabels();
    } else {
      this._refreshSpawnLabels();
    }
  }

  // 出生点编号标签 — 用 Phaser text 缓存,数量变化时增删
  _refreshSpawnLabels() {
    if (!this._spawnLabels) this._spawnLabels = [];
    // 数量对齐
    while (this._spawnLabels.length < (this.spawnPoints || []).length) {
      const t = this.scene.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold',
        color: '#fff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(99997);
      this._spawnLabels.push(t);
    }
    while (this._spawnLabels.length > (this.spawnPoints || []).length) {
      const t = this._spawnLabels.pop();
      if (t && t.destroy) t.destroy();
    }
    (this.spawnPoints || []).forEach((s, i) => {
      const t = this._spawnLabels[i];
      if (!t) return;
      t.setText(`${i + 1}`);
      t.setPosition(s.x, s.y);
      t.setVisible(this.active);
    });
  }

  _syncToolUI() {
    const set = (id, on) => { const b = document.getElementById(id); if (b) b.style.outline = on ? '2px solid #fff' : 'none'; };
    set('ed-tool-collide', this.tool === 'collide');
    set('ed-tool-step', this.tool === 'step');
    set('ed-tool-spawn', this.tool === 'spawn');
    set('ed-tool-herospawn', this.tool === 'herospawn');
    const heromark = document.getElementById('ed-herospawn-mark');
    if (heromark) heromark.textContent = this.heroSpawn ? '✓' : '';
    set('ed-shape-brush', this.shape === 'brush');
    set('ed-shape-rect', this.shape === 'rect');
    set('ed-shape-lasso', this.shape === 'lasso');
    set('ed-erase', this.erase);
    const bs = document.getElementById('ed-brush-v');
    if (bs) bs.textContent = this.brushSize;
    const cnt = document.getElementById('ed-spawn-count');
    if (cnt) cnt.textContent = (this.spawnPoints && this.spawnPoints.length) ? `×${this.spawnPoints.length}` : '';
    const panel = document.getElementById('ed-gridtools');
    if (panel) panel.style.display = (this.tool === 'collide' || this.tool === 'step') ? '' : 'none';
  }

  duplicateSelected() {
    if (!this.selected) return;
    const o = this.selected.obj;
    const x = o.x + 32; const y = o.y + 32;
    this.placeAt(this.selected.tex, x, y);
    if (this.selected.isTerrain) return;
    // 复制后保持缩放/旋转/翻转/碰撞
    const np = this.placed[this.placed.length - 1];
    if (np && np.obj) {
      np.obj.setScale(o.scaleX, o.scaleY);
      np.obj.setRotation(o.rotation);
      np.obj.setFlipX(o.flipX); np.obj.setFlipY(o.flipY);
      np.pieceCells = new Set(this.selected.pieceCells || []);
      np.pieceStepCells = new Set(this.selected.pieceStepCells || []);
      np.depthBias = this.selected.depthBias || 0;
      this._applyPieceDepth(np);
      if (np.pieceCells.size || np.pieceStepCells.size) this._rebuildPieceSolids(np);
    }
    this._drawZones();
  }

  _isTerrainKey(key) {
    const cat = CATEGORIES.find((c) => c.isTerrain);
    return cat && cat.keys && cat.keys.includes(key);
  }

  select(piece) {
    this.selected = piece;
    this._updateSelectMarker();
    this._refreshSelInfo();
  }

  _updateSelectMarker() {
    if (!this.selected) return;
    if (!this.selectMarker) {
      this.selectMarker = this.scene.add.graphics().setDepth(99998);
    }
    const o = this.selected.obj;
    const g = this.selectMarker;
    g.clear();
    const w = o.displayWidth; const h = o.displayHeight;
    const x = o.x - w * o.originX; const y = o.y - h * o.originY;
    // 加粗双色外框 + 四角小方块,小件也看得清
    g.lineStyle(4, 0x000000, 0.85); g.strokeRect(x - 1, y - 1, w + 2, h + 2);
    g.lineStyle(2, 0xffd070, 1);    g.strokeRect(x, y, w, h);
    const HS = 5;
    g.fillStyle(0xffd070, 1);
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
      g.fillRect(cx - HS / 2, cy - HS / 2, HS, HS);
    });
    g.lineStyle(1, 0x000000, 0.9);
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
      g.strokeRect(cx - HS / 2, cy - HS / 2, HS, HS);
    });
    // 右上角 × 删除按钮 (世界空间,跟着选框走)
    this._ensureDeleteBtn();
    const bx = x + w + 6;   // 略微伸出选框
    const by = y - 6;
    this.selectDeleteBtn.setPosition(bx, by);
    this.selectDeleteBtn.bg.setPosition(bx, by);
    this.selectDeleteBtn.tx.setPosition(bx, by);
    // 同步刷新红色碰撞框
    this._updateCollideDebug();
  }

  // 创建右上角 × 按钮 (一次,后续靠 setPosition 跟随)
  _ensureDeleteBtn() {
    if (this.selectDeleteBtn) return;
    const sc = this.scene;
    const R = 11;
    const bg = sc.add.circle(0, 0, R, 0xc25e5e, 1)
      .setStrokeStyle(2, 0x000000, 0.9).setDepth(99999)
      .setInteractive({ useHandCursor: true });
    const tx = sc.add.text(0, 0, '×', {
      fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0.55).setDepth(100000);
    // 点击 → 删除当前选中件 (吞掉事件防止透到 Phaser 输入触发其它逻辑)
    bg.on('pointerdown', (p, _lx, _ly, ev) => {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      this.deleteSelected();
    });
    bg.on('pointerover', () => bg.setFillStyle(0xff7a7a));
    bg.on('pointerout', () => bg.setFillStyle(0xc25e5e));
    this.selectDeleteBtn = { bg, tx, setPosition() {} }; // setPosition no-op 占位
  }
  _destroyDeleteBtn() {
    if (!this.selectDeleteBtn) return;
    this.selectDeleteBtn.bg.destroy();
    this.selectDeleteBtn.tx.destroy();
    this.selectDeleteBtn = null;
  }

  _clearSelectMarker() {
    if (this.selectMarker) { this.selectMarker.destroy(); this.selectMarker = null; }
    if (this.collideDebug) { this.collideDebug.clear(); }
    this._destroyDeleteBtn();
    this.selected = null;
  }

  deleteSelected() {
    if (!this.selected) return;
    this._snapshot();
    // 原地形导入件 → 记下"已删除"标记 (用导入时的原始坐标,不受后续移动影响)
    if (this.selected._imported) {
      const ao = this.selected._autoOrigin;
      if (ao) this.deletedAutoMarkers.add(`${ao.tex}|${ao.x}|${ao.y}`);
    }
    const i = this.placed.indexOf(this.selected);
    if (i >= 0) this.placed.splice(i, 1);
    if (this.selected.solid) this.selected.solid.destroy();
    if (this.selected.pieceSolids && this.selected.pieceSolids.length) {
      this.selected.pieceSolids.forEach((s) => s && s.destroy && s.destroy());
      this.selected.pieceSolids = [];
    }
    this.selected.obj.destroy();
    this._clearSelectMarker();
    this._refreshSelInfo();
    this._drawZones();
  }

  // ===== 保存/加载 =====
  storageKey() {
    // 守塔/无尽 各自独立存档:tinyswords.layout.v1.island.{idx}.{mode}
    // 兼容旧版无 mode 后缀的存档 (在 _loadLayoutWithFallback 里处理)
    const mode = this.scene._mode || (function _getMode() {
      try { const v = localStorage.getItem('tinyswords.gameMode'); if (v === 'survival' || v === 'defense') return v; } catch (e) {}
      return 'defense';
    })();
    return `${STORAGE_PREFIX}${this.scene._islandIdx ?? 0}.${mode}`;
  }
  // 旧版 key (无 mode 后缀)
  _legacyStorageKey() { return STORAGE_PREFIX + (this.scene._islandIdx ?? 0); }

  // ===== 撤销系统 =====
  // 在每个用户"手势"开始前调用 _snapshot();Ctrl+Z 时 undo() 恢复上一个状态。
  _snapshot() {
    if (this._restoring) return;
    try {
      const snap = JSON.stringify(this.serialize());
      // 避免连续重复
      if (this.history.length && this.history[this.history.length - 1] === snap) return;
      this.history.push(snap);
      if (this.history.length > this.historyLimit) this.history.shift();
    } catch (e) { /* ignore */ }
  }
  undo() {
    if (!this.history.length) { this._announce('↺ 无可撤销'); return; }
    const snap = this.history.pop();
    try {
      this._restoring = true;
      this._applyLayout(JSON.parse(snap));
      this._announce(`↺ 已撤销 (剩 ${this.history.length} 步)`);
    } catch (e) { this._announce('⚠ 撤销失败'); }
    finally { this._restoring = false; }
  }

  serialize() {
    return {
      islandIdx: this.scene._islandIdx ?? 0,
      backdrop: this.backdropInfo ? {
        url: this.backdropInfo.url,
        type: this.backdropInfo.type || 'image',
        w: this.backdropInfo.w, h: this.backdropInfo.h,
        fw: this.backdropInfo.fw, fh: this.backdropInfo.fh,
        frameCount: this.backdropInfo.frameCount,
        frameRate: this.backdropInfo.frameRate,
      } : undefined,
      // 地形模式: true=显示 painterly 原地形, false=显示自定义底图
      useOriginalTerrain: !!this._useOriginalTerrain,
      // 已删除的原地形件标记 (用于下次场景重建后销毁同位置 sprite)
      deletedAutoMarkers: [...this.deletedAutoMarkers],
      // 网格区域：存格子坐标数组（紧凑）
      collideCells: [...this.collideCells],
      stepCells: [...this.stepCells],
      spawnPoints: this.spawnPoints ? this.spawnPoints.map((s) => ({ x: s.x, y: s.y })) : [],
      heroSpawn: this.heroSpawn ? { x: this.heroSpawn.x, y: this.heroSpawn.y } : null,
      pieces: this.placed.map((p) => ({
        tex: p.tex,
        x: Math.round(p.obj.x), y: Math.round(p.obj.y),
        scale: +(p.obj.scaleX.toFixed(3)),
        scaleY: +(p.obj.scaleY.toFixed(3)),
        rot: +(p.obj.rotation.toFixed(3)),
        flipX: p.obj.flipX, flipY: p.obj.flipY,
        originX: p.obj.originX, originY: p.obj.originY,
        isTerrain: !!p.isTerrain,
        collide: !!p.collide,
        displayW: p.isTerrain ? Math.round(p.obj.displayWidth) : undefined,
        displayH: p.isTerrain ? Math.round(p.obj.displayHeight) : undefined,
        pieceCells: p.pieceCells ? [...p.pieceCells] : [],
        pieceStepCells: p.pieceStepCells ? [...p.pieceStepCells] : [],
        depthBias: p.depthBias || 0,
        isCustomCore: !!p.isCustomCore,
      })),
    };
  }

  async saveToStorage() {
    let json;
    try { json = JSON.stringify(this.serialize()); }
    catch (e) { this._announce(`⚠ 序列化失败: ${e.message}`); return false; }
    const sizeMB = (json.length / 1048576).toFixed(2);
    try {
      const res = await saveKV(this.storageKey(), json);
      this._announce(`💾 已保存 ${this.placed.length} 件 (${sizeMB} MB · ${res.backend})`);
      return true;
    } catch (e) {
      this._announce(`⚠ 保存失败: ${e.message || e.name}`);
      console.warn('[save fail]', e);
      return false;
    }
  }

  downloadJson() {
    const data = JSON.stringify(this.serialize(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `island-${this.scene._islandIdx ?? 0}-layout.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this._announce(`📁 已下载 JSON`);
  }

  async loadFromStorage() {
    try {
      let raw = await loadKV(this.storageKey());
      // 旧档兼容:无 mode 后缀的存档, 两种模式都 fallback
      if (!raw) {
        raw = await loadKV(this._legacyStorageKey());
        if (raw) this._announce('📂 读取旧版存档 (无模式后缀)');
      }
      if (!raw) { this._announce('⚠ 无本地存档'); return false; }
      this._applyLayout(JSON.parse(raw));
      this._announce(`📂 加载 ${this.placed.length} 件`);
      return true;
    } catch (e) { this._announce(`⚠ 加载失败: ${e.message}`); return false; }
  }

  loadFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        this._applyLayout(JSON.parse(e.target.result));
        this._announce(`📂 加载 ${this.placed.length} 件`);
      } catch (err) { this._announce('⚠ JSON 解析失败'); }
    };
    reader.readAsText(file);
  }

  _applyLayout(data) {
    // 清空当前
    this.placed.forEach((p) => { if (p.solid) p.solid.destroy(); p.obj.destroy(); });
    this.placed = [];
    this._clearSelectMarker();
    // 底图清场 + 状态干净复位 (避免上一次会话的 backdrop 模式残留 → 蓝色虚空)
    if (this._videoLoopGuard) { clearInterval(this._videoLoopGuard); this._videoLoopGuard = null; }
    if (this.backdrop) { this.backdrop.destroy(); this.backdrop = null; this.backdropInfo = null; }
    this._restoreAutoLayerForBackdrop();
    this._restoreCameraBg();
    // 验证存档里 backdrop 的可用性 — url 必须是有效字符串
    const hasUsableBackdrop = !!(data && data.backdrop && data.backdrop.url
      && typeof data.backdrop.url === 'string'
      && (data.backdrop.url.startsWith('data:') || data.backdrop.url.startsWith('blob:')
          || data.backdrop.url.startsWith('http') || data.backdrop.url.startsWith('idb-video:')));
    // 模式判定:存档明确的 mode 优先,但若标记 custom 而 backdrop 不可用 → 强制回到 original (避免蓝色虚空)
    const savedMode = (data && typeof data.useOriginalTerrain === 'boolean')
      ? data.useOriginalTerrain : (hasUsableBackdrop ? false : true);
    this._useOriginalTerrain = savedMode || !hasUsableBackdrop;
    this._restoringBackdrop = true;
    // 立刻按模式停用原地形碰撞 — 不等异步底图加载完
    // (视频/GIF 加载需要 1-2s,期间玩家不能撞到隐形原墙)
    if (!this._useOriginalTerrain) {
      this._hideAutoLayerForBackdrop();
      this._applyBackdropCameraBg();
    }
    if (hasUsableBackdrop) {
      if (data.backdrop.type === 'video') this._loadVideoBackdrop(data.backdrop.url);
      else if (data.backdrop.type === 'gif') this._loadGifSheetFromDataUrl(data.backdrop);
      else this._loadBackdrop(data.backdrop.url);
    } else {
      this._restoringBackdrop = false;
      this._refreshTerrainSwitcher();
      if (data && data.backdrop) {
        this._announce('⚠ 存档里的底图 URL 无效,已回退到原地形');
      }
    }
    // 还原"已删除的原地形件"标记并立即应用 (销毁场景里同位置的 auto sprite)
    this.deletedAutoMarkers = new Set(Array.isArray(data && data.deletedAutoMarkers) ? data.deletedAutoMarkers : []);
    this._applyDeletedAutoMarkers();
    // 网格区域（兼容旧版 stepZones：转成格子）
    this.collideCells = new Set(Array.isArray(data && data.collideCells) ? data.collideCells : []);
    this.stepCells = new Set(Array.isArray(data && data.stepCells) ? data.stepCells : []);
    this.spawnPoints = Array.isArray(data && data.spawnPoints) ? data.spawnPoints.slice() : [];
    this.scene._customSpawnPoints = this.spawnPoints.slice();
    this.heroSpawn = (data && data.heroSpawn && typeof data.heroSpawn.x === 'number') ? { x: data.heroSpawn.x, y: data.heroSpawn.y } : null;
    this.scene._customHeroSpawn = this.heroSpawn ? { ...this.heroSpawn } : null;
    // 若玩家已经创建,立即瞬移过去
    if (this.scene.player && this.heroSpawn) {
      this.scene.player.setPosition(this.heroSpawn.x, this.heroSpawn.y);
    }
    if (data && Array.isArray(data.stepZones)) {
      // 旧存档兼容：矩形踏区 → 格子
      data.stepZones.forEach((z) => {
        const c0 = Math.floor(z.x / this.GRID); const c1 = Math.floor((z.x + z.w) / this.GRID);
        const r0 = Math.floor(z.y / this.GRID); const r1 = Math.floor((z.y + z.h) / this.GRID);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.stepCells.add(`${c},${r}`);
      });
    }
    this._rebuildSolidsFromCells();
    this._drawZones();
    if (!data || !Array.isArray(data.pieces)) return;
    data.pieces.forEach((p) => {
      if (!this.scene.textures.exists(p.tex)) return;
      const isTerrain = this._isTerrainKey(p.tex);
      const _animKey = `${p.tex}-anim`;
      const obj = (!isTerrain && this.scene.anims.exists(_animKey)
        ? this.scene.add.sprite(p.x, p.y, p.tex).play(_animKey)
        : this.scene.add.image(p.x, p.y, p.tex))
        .setOrigin(p.originX ?? (isTerrain ? 0 : 0.5), p.originY ?? (isTerrain ? 0 : 0.85))
        .setDepth(isTerrain ? -88 : p.y);
      if (isTerrain && p.displayW && p.displayH) {
        obj.setDisplaySize(p.displayW, p.displayH);
      } else {
        obj.setScale(p.scaleY != null ? p.scale : (p.scale ?? 1), p.scaleY != null ? p.scaleY : (p.scale ?? 1));
      }
      if (p.rot) obj.setRotation(p.rot);
      if (p.flipX) obj.setFlipX(true);
      if (p.flipY) obj.setFlipY(true);
      const piece = { obj, tex: p.tex, scale: obj.scaleX, isTerrain, collide: false, solid: null,
        pieceCells: new Set(p.pieceCells || []),
        pieceStepCells: new Set(p.pieceStepCells || []),
        pieceSolids: [],
        depthBias: p.depthBias || 0,
        isCustomCore: !!p.isCustomCore };
      this.placed.push(piece);
      this._applyPieceDepth(piece);
      if (piece.pieceCells.size || piece.pieceStepCells.size) this._rebuildPieceSolids(piece);
      if (piece.isCustomCore) this._drawCoreRing(piece);
    });
    // 把自定义 core 信息上报给 scene, 由 WorldScene 决定是否替换默认水晶塔
    if (this.scene && this.scene.applyCustomCoreFromEditor) this.scene.applyCustomCoreFromEditor();
  }

  // ===== HTML UI =====
  _buildUI() {
    if (this.ui) return;
    const root = document.createElement('div');
    root.id = 'editor-ui';
    root.innerHTML = `
      <style>
        #editor-ui {
          position: fixed; right: 0; top: 0; bottom: 0; width: 280px; z-index: 95;
          background: #1a0e08ee; color: #fff; font: 12px/1.4 monospace;
          padding: 12px; overflow-y: auto;
          border-left: 3px solid #c2a35e;
        }
        #editor-ui h3 { margin: 0 0 8px; color: #ffe070; font-size: 14px; }
        #editor-ui .tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
        #editor-ui .tab { background: #2a1d10; padding: 4px 8px; border-radius: 3px; cursor: pointer; border: 1px solid #6b5836; }
        #editor-ui .tab.active { background: #c2a35e; color: #1a0e08; font-weight: bold; }
        #editor-ui .assets-panel { max-height: 360px; overflow-y: auto; overflow-x: hidden; margin-bottom: 10px; padding-right: 2px; }
        #editor-ui .layer-group { margin-bottom: 4px; border: 1px solid #4a3a22; border-radius: 3px; background: #1f150c; }
        #editor-ui .layer-head { display: flex; align-items: center; padding: 4px 6px; cursor: pointer; background: #3a2810; user-select: none; }
        #editor-ui .layer-head:hover { background: #4a3418; }
        #editor-ui .layer-head .chev { width: 14px; color: #ffe070; }
        #editor-ui .layer-head .ttl { flex: 1; color: #ffe9b6; font-size: 12px; font-weight: bold; }
        #editor-ui .layer-head .cnt { color: #aaa; font-size: 11px; }
        #editor-ui .layer-body { padding: 4px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; }
        #editor-ui .layer-body.collapsed { display: none; }
        #editor-ui .layer-body img { width: 100%; height: 50px; object-fit: contain; background: #2a1d10; border: 1px solid #6b5836; border-radius: 2px; cursor: pointer; display: block; min-width: 0; image-rendering: auto; color: transparent; }
        #editor-ui .layer-body img:hover { border-color: #ffd07a; }
        #editor-ui .layer-body img.sel { border-color: #4fd6ff; border-width: 2px; height: 48px; }
        #editor-ui .row { display: flex; gap: 6px; margin: 6px 0; }
        #editor-ui button { background: #c2a35e; color: #1a0e08; border: 0; padding: 6px 10px; cursor: pointer; font: bold 12px monospace; border-radius: 3px; flex: 1; }
        #editor-ui button:hover { background: #ffd07a; }
        #editor-ui .info { background: #2a1d10; padding: 6px; border-radius: 3px; margin: 6px 0; min-height: 20px; }
        #editor-ui .hint { color: #aaa; font-size: 11px; margin-top: 8px; }
      </style>
      <h3>🛠 地形编辑器</h3>
      <div class="row">
        <button id="ed-bg-import" style="background:#8ad06a">🗺 导入底图</button>
        <button id="ed-bg-remove">✕ 移除底图</button>
      </div>
      <div class="row" style="margin-top:4px">
        <button id="ed-terrain-orig" title="切换到原地形">🌿 原地形</button>
        <button id="ed-terrain-custom" title="尚无自定义底图,先点 导入底图">🖼 自定义底图</button>
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin:6px 0 0;padding:6px 10px;background:#2a1d10;border:1px solid #5a3e1c;border-radius:3px;cursor:pointer;font-size:12px;color:#ffe9b6">
        <input type="checkbox" id="ed-chromakey" style="margin:0;width:14px;height:14px;cursor:pointer">
        <span>🎬 视频抠绿幕 <span style="color:#aaa;font-size:10px">(导入 MP4 时自动去除绿/蓝幕)</span></span>
      </label>
      <div class="row" style="margin-top:6px">
        <button id="ed-comp-upload" style="background:#c46ad4">📦 上传组件</button>
        <button id="ed-comp-manage" style="background:#7a5ea4">📚 组件库</button>
      </div>
      <input type="file" id="ed-comp-files" accept="image/png,image/webp,image/jpeg,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" multiple style="display:none">
      <input type="file" id="ed-bg-file" accept="image/png,image/jpeg,image/gif,image/webp,image/apng,.apng,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" style="display:none">
      <div class="tabs" id="ed-tabs"></div>
      <div id="ed-brush-chip" style="display:none; margin:4px 0 6px; padding:6px 8px; background:#3a2810; border:1px solid #ffd070; border-radius:3px; font-size:11px; color:#ffe9b6; display:flex; align-items:center; gap:6px;">
        <span>🖌 笔刷:</span><span class="txt" style="flex:1; color:#ffd070; font-weight:bold;"></span>
        <button id="ed-brush-clear" style="padding:2px 8px; background:#886; color:#fff; border:0; border-radius:2px; cursor:pointer; font:bold 10px monospace;">✕ 取消 (ESC)</button>
      </div>
      <div class="assets-panel" id="ed-grid"></div>
      <div class="info" id="ed-info" style="font-size:11px">
        左键空地=放置 · 左键件=选中/拖动 · <b>Alt+左键</b>原地形=导入 · 右键/ESC=取消 · Delete=删除
      </div>
      <div id="ed-props" style="background:#2a1d10;padding:8px;border-radius:3px;margin:6px 0;display:none">
        <div style="color:#ffe070;font-weight:bold;margin-bottom:4px">属性</div>
        <label style="display:block;margin:4px 0">缩放 <span id="ed-scale-v">1.00</span>×</label>
        <input id="ed-scale" type="range" min="0.1" max="3" step="0.05" value="1" style="width:100%">
        <label style="display:block;margin:4px 0">旋转 <span id="ed-rot-v">0°</span></label>
        <input id="ed-rot" type="range" min="-180" max="180" step="5" value="0" style="width:100%">
        <div class="row" style="margin:6px 0;gap:4px">
          <label><input type="checkbox" id="ed-flipx"> ↔ 翻转</label>
          <label><input type="checkbox" id="ed-flipy"> ↕ 翻转</label>
        </div>
        <div class="row" style="gap:4px;margin-top:6px">
          <button id="ed-autogen" style="padding:4px 8px;background:#ffb347">🛡 自动生成碰撞</button>
          <button id="ed-clearpiece" style="padding:4px 8px">↺ 清空件碰撞</button>
        </div>
        <div style="color:#ddc;font-size:11px;margin-top:4px">
          选中件后,画笔/框选/套索 会自动绑到件上(跟随移动/缩放/翻转)
        </div>
        <div style="border-top:1px dashed #555;margin:8px 0 4px"></div>
        <div style="color:#ffd;font-size:11px;margin-bottom:4px">
          预设 (按贴图存,放置同图自动套用):<span id="ed-preset-status" style="color:#8f8"></span>
        </div>
        <div class="row" style="gap:4px">
          <button id="ed-preset-save" style="padding:4px 8px;background:#5e9eff">💾 保存为预设</button>
          <button id="ed-preset-apply" style="padding:4px 8px">📋 套用预设</button>
          <button id="ed-preset-clear" style="padding:4px 8px;background:#776">🗑</button>
        </div>
        <div style="border-top:1px dashed #555;margin:8px 0 4px"></div>
        <div style="color:#ffd;font-size:11px;margin-bottom:4px">
          层级 <span id="ed-depth-v" style="color:#8cf"></span>
        </div>
        <div class="row" style="gap:4px">
          <button id="ed-front" title="置顶" style="padding:4px 8px">⏫</button>
          <button id="ed-forward" title="上一层 (+100)" style="padding:4px 8px">⤴</button>
          <button id="ed-backward" title="下一层 (-100)" style="padding:4px 8px">⤵</button>
          <button id="ed-tobottom" title="置底" style="padding:4px 8px">⏬</button>
        </div>
        <div class="row" style="gap:4px;margin-top:6px">
          <button id="ed-dup" style="padding:4px 8px">📋 复制</button>
          <button id="ed-del" style="padding:4px 8px;background:#c25e5e">🗑 删除</button>
        </div>
      </div>
      <div style="border-top:1px solid #6b5836;margin:8px 0;padding-top:8px">
        <div style="color:#ffe070;font-weight:bold;margin-bottom:4px">🖌 区域绘制</div>
        <div class="row">
          <button id="ed-tool-collide" style="background:#ff7c5e">🛡 碰撞</button>
          <button id="ed-tool-step" style="background:#7cc4ff">🪜 踏区</button>
          <button id="ed-tool-spawn" style="background:#e57aff" title="点击地图加敌人出生点;再点已有点删除">🔴 敌人 <span id="ed-spawn-count" style="opacity:.7"></span></button>
          <button id="ed-tool-herospawn" style="background:#7affd1" title="点击地图设玩家出生点(只 1 个);再点删除">🦸 玩家 <span id="ed-herospawn-mark" style="opacity:.7"></span></button>
          <button id="ed-mark-core" style="background:#7accff" title="选中一件组件后点此按钮 → 把它设为水晶塔(守塔模式生效, 替换默认塔)">🔮 设为水晶塔</button>
        </div>
        <div id="ed-gridtools" style="display:none">
          <div class="row">
            <button id="ed-shape-brush">🖌 画笔</button>
            <button id="ed-shape-rect">▭ 框选</button>
            <button id="ed-shape-lasso">✒ 套索</button>
            <button id="ed-erase">🧽 擦除</button>
            <button id="ed-lasso-invert" title="一键反选: 已画 ↔ 未画 互换 (I 键)">↔ 反选</button>
          </div>
          <div style="color:#aaa;font-size:11px;margin:2px 0 4px">
            套索: 左键加点 · 右键/Enter 闭合 · Backspace 撤回顶点 · ESC 取消 · I 反选当前层
          </div>
          <label style="display:block;margin:4px 0">笔刷大小 <span id="ed-brush-v">2</span></label>
          <input id="ed-brush" type="range" min="1" max="10" step="1" value="2" style="width:100%">
          <div class="row" style="gap:4px;margin-top:4px">
            <button id="ed-clear-collide" style="flex:1;background:#c2856e">↺ 清空碰撞</button>
            <button id="ed-clear-step" style="flex:1;background:#5e9eb0">↺ 清空踏区</button>
          </div>
          <button id="ed-clearcells" style="margin-top:4px">↺ 清空当前层</button>
        </div>
      </div>
      <div class="row">
        <button id="ed-undo" style="background:#a08adf">↺ 撤销 (Ctrl+Z)</button>
        <button id="ed-save">💾 保存</button>
        <button id="ed-load">📂 加载</button>
      </div>
      <div class="row">
        <button id="ed-download">📁 下载 JSON</button>
        <button id="ed-import">📥 导入</button>
      </div>
      <div class="row">
        <button id="ed-toggleauto">👁 切换原地形</button>
        <button id="ed-clear">🗑 清空全部</button>
      </div>
      <div class="row">
        <button id="ed-exit">✕ 退出</button>
      </div>
      <input type="file" id="ed-file" accept=".json" style="display:none">
      <div class="hint">
        F1 切换 · 拖动移动件 · 滚轮缩放 · Delete 删除<br>
        <b>区域绘制</b>:选碰撞/踏区 → 画笔涂 or 框选 · 擦除可改 · 重叠自动合并
      </div>
    `;
    document.body.appendChild(root);
    this.ui = root;
    this._buildTabs();
    this._buildGrid(CATEGORIES[0].id);
    document.getElementById('ed-undo').onclick = () => this.undo();
    document.getElementById('ed-brush-clear').onclick = () => this.setBrush(null);
    document.getElementById('ed-save').onclick = () => this.saveToStorage();
    document.getElementById('ed-load').onclick = () => this.loadFromStorage();
    document.getElementById('ed-download').onclick = () => this.downloadJson();
    document.getElementById('ed-clear').onclick = () => {
      if (!confirm('清空全部已放置件 + 碰撞区 + 踏区?')) return;
      // 清放置件
      this.placed.forEach((p) => { if (p.solid) p.solid.destroy(); p.obj.destroy(); });
      this.placed = [];
      this._clearSelectMarker();
      // 清网格区域(碰撞 + 踏区) + 物理体
      this.collideCells.clear();
      this.stepCells.clear();
      this._rebuildSolidsFromCells();
      this._drawZones();
      this._announce('🗑 已清空全部');
    };
    document.getElementById('ed-exit').onclick = () => this.exit();
    document.getElementById('ed-import').onclick = () => document.getElementById('ed-file').click();
    document.getElementById('ed-toggleauto').onclick = () => {
      const visible = this.toggleAutoLayer();
      this._announce(visible ? '👁 原地形已显示' : '🙈 原地形已隐藏');
    };
    // 网格区域绘制工具
    document.getElementById('ed-tool-collide').onclick = () => this.setTool('collide');
    document.getElementById('ed-tool-step').onclick = () => this.setTool('step');
    document.getElementById('ed-tool-spawn').onclick = () => this.setTool('spawn');
    document.getElementById('ed-tool-herospawn').onclick = () => this.setTool('herospawn');
    document.getElementById('ed-mark-core').onclick = () => this.markSelectedAsCore();
    document.getElementById('ed-shape-brush').onclick = () => this.setShape('brush');
    document.getElementById('ed-shape-rect').onclick = () => this.setShape('rect');
    document.getElementById('ed-shape-lasso').onclick = () => this.setShape('lasso');
    document.getElementById('ed-erase').onclick = () => this.setErase(!this.erase);
    document.getElementById('ed-lasso-invert').onclick = () => this.invertActiveCells();
    document.getElementById('ed-brush').oninput = (e) => this.setBrushSize(parseInt(e.target.value, 10));
    document.getElementById('ed-clearcells').onclick = () => this.clearActiveCells();
    document.getElementById('ed-clear-collide').onclick = () => this.clearLayer('collide');
    document.getElementById('ed-clear-step').onclick = () => this.clearLayer('step');
    document.getElementById('ed-bg-import').onclick = () => document.getElementById('ed-bg-file').click();
    document.getElementById('ed-terrain-orig').onclick = () => this.setTerrainMode('original');
    document.getElementById('ed-terrain-custom').onclick = () => this.setTerrainMode('custom');
    // 初次激活样式
    this._refreshTerrainSwitcher();
    document.getElementById('ed-bg-file').onchange = (e) => { if (e.target.files[0]) this.importBackdropFile(e.target.files[0]); };
    document.getElementById('ed-bg-remove').onclick = () => this.removeBackdrop();
    // 组件上传
    const compFileInput = document.getElementById('ed-comp-files');
    document.getElementById('ed-comp-upload').onclick = () => compFileInput.click();
    document.getElementById('ed-comp-manage').onclick = () => this._openComponentManager();
    compFileInput.onchange = async (e) => {
      const files = [...(e.target.files || [])];
      if (!files.length) return;
      try {
        const first = files[0];
        const isVideo = (first.type && first.type.startsWith('video/'))
          || /\.(mp4|webm|mov|m4v)$/i.test(first.name);
        if (isVideo) {
          const name = prompt('视频组件命名', first.name.replace(/\.[^.]+$/, '')) || first.name;
          const useChroma = confirm('是否对视频应用绿幕/蓝幕抠图? (适合绿屏背景的素材)\n确定 = 开启,取消 = 不抠');
          await addVideoComponent(this.scene, first, name, { chromaKey: useChroma });
          this._announce(`📹 视频组件 ${name} 已加入${useChroma ? ' (绿幕抠图开)' : ''}`);
        } else if (files.length === 1) {
          const name = prompt('给这个组件起名', first.name.replace(/\.[^.]+$/, '')) || first.name;
          await addStaticComponent(this.scene, first, name);
          this._announce(`📦 静态组件已加入: ${name}`);
        } else {
          const name = prompt(`检测到 ${files.length} 张图,合并为序列动画。组件名?`, '序列动画') || '序列动画';
          const fpsStr = prompt('帧率 (FPS)?', '12');
          const fps = Math.max(1, Math.min(60, parseInt(fpsStr, 10) || 12));
          await addSpriteSeqComponent(this.scene, files, name, fps);
          this._announce(`📦 序列动画 ${name} (${files.length} 帧 / ${fps} fps) 已加入`);
        }
        // 重建 Tab 栏 + 自动切到 ✨ 自定义 + 渲染网格 (让新上传的组件立即可见可点)
        this._buildTabs();
        this._switchToCategory('custom');
      } catch (err) {
        console.error(err);
        this._announce(`⚠ ${err.message || err}`);
      } finally {
        e.target.value = '';
      }
    };
    const chromaToggle = document.getElementById('ed-chromakey');
    if (chromaToggle) {
      chromaToggle.checked = !!this._chromaKeyEnabled;
      chromaToggle.onchange = (e) => {
        this._chromaKeyEnabled = !!e.target.checked;
        if (this._chromaKeyEnabled) {
          this._announce('🎬 已开启绿幕抠图,下次导入视频时自动检测并去除');
        } else {
          this._announce('🎬 已关闭绿幕抠图');
        }
      };
    }
    document.getElementById('ed-file').onchange = (e) => { if (e.target.files[0]) this.loadFromFile(e.target.files[0]); };
    // 属性面板事件
    // 滑块拖动开始时入栈一次撤销点(避免每帧 oninput 都入栈)
    ['ed-scale', 'ed-rot'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', () => { if (this.selected) this._snapshot(); });
    });
    document.getElementById('ed-scale').oninput = (e) => {
      if (!this.selected) return;
      const v = parseFloat(e.target.value);
      document.getElementById('ed-scale-v').textContent = v.toFixed(2);
      if (this.selected.isTerrain) {
        this.selected.obj.setDisplaySize(TILE * v, TILE * v);
      } else {
        this.selected.obj.setScale(v);
      }
      // 件本地碰撞格子跟随缩放重建
      if (this.selected.pieceCells && (this.selected.pieceCells.size || (this.selected.pieceStepCells && this.selected.pieceStepCells.size))) this._rebuildPieceSolids(this.selected);
      this._updateSelectMarker();
      this._drawZones();
    };
    document.getElementById('ed-rot').oninput = (e) => {
      if (!this.selected) return;
      const v = parseFloat(e.target.value);
      document.getElementById('ed-rot-v').textContent = `${Math.round(v)}°`;
      this.selected.obj.setRotation(v * Math.PI / 180);
      this._updateSelectMarker();
    };
    document.getElementById('ed-flipx').onchange = (e) => {
      if (!this.selected) return;
      this._snapshot();
      this.selected.obj.setFlipX(e.target.checked);
      if (this.selected.pieceCells && (this.selected.pieceCells.size || (this.selected.pieceStepCells && this.selected.pieceStepCells.size))) this._rebuildPieceSolids(this.selected);
      this._drawZones();
    };
    document.getElementById('ed-flipy').onchange = (e) => {
      if (!this.selected) return;
      this._snapshot();
      this.selected.obj.setFlipY(e.target.checked);
      if (this.selected.pieceCells && (this.selected.pieceCells.size || (this.selected.pieceStepCells && this.selected.pieceStepCells.size))) this._rebuildPieceSolids(this.selected);
      this._drawZones();
    };
    document.getElementById('ed-autogen').onclick = () => this.autoGenPieceCollide(this.selected);
    document.getElementById('ed-clearpiece').onclick = () => this.clearPieceCells(this.selected);
    document.getElementById('ed-preset-save').onclick = () => this.selected && this.savePresetFromPiece(this.selected);
    document.getElementById('ed-preset-apply').onclick = () => this.selected && this.applyPresetToPiece(this.selected);
    document.getElementById('ed-preset-clear').onclick = () => this.selected && this.clearPreset(this.selected.tex);
    document.getElementById('ed-front').onclick = () => this.bringToFront();
    document.getElementById('ed-forward').onclick = () => this.bringForward();
    document.getElementById('ed-backward').onclick = () => this.sendBackward();
    document.getElementById('ed-tobottom').onclick = () => this.sendToBack();
    document.getElementById('ed-dup').onclick = () => this.duplicateSelected();
    document.getElementById('ed-del').onclick = () => this.deleteSelected();
  }

  _buildTabs() {
    const tabs = document.getElementById('ed-tabs');
    tabs.innerHTML = '';
    CATEGORIES.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'tab' + (i === 0 ? ' active' : '');
      el.textContent = c.label;
      el.dataset.catId = c.id;
      el.onclick = () => {
        tabs.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        el.classList.add('active');
        this._buildGrid(c.id);
      };
      tabs.appendChild(el);
    });
  }

  // 切换到指定 Tab 并刷新它的网格
  _switchToCategory(catId) {
    const tabs = document.getElementById('ed-tabs');
    if (!tabs) return;
    let found = false;
    tabs.querySelectorAll('.tab').forEach((t) => {
      const match = t.dataset.catId === catId;
      t.classList.toggle('active', match);
      if (match) found = true;
    });
    if (found) this._buildGrid(catId);
  }

  _buildGrid(catId) {
    const cat = CATEGORIES.find((c) => c.id === catId);
    if (!cat) return;
    const panel = document.getElementById('ed-grid');
    panel.innerHTML = '';
    // 收集本类的所有 keys
    let keys = [];
    if (cat.keys) {
      keys = cat.keys.filter((k) => this.scene.textures.exists(k));
    } else if (cat.match) {
      Object.keys(this.scene.textures.list || {}).forEach((k) => {
        if (cat.match(k) && this.scene.textures.exists(k)) keys.push(k);
      });
      keys.sort();
    }
    // 折叠状态 (跨重建保持)
    if (!this._layerCollapsed) this._layerCollapsed = {};
    // 分组定义
    const subs = SUBGROUPS[catId];
    if (!subs || !subs.length) {
      this._renderLayerGroup(panel, catId, '全部', keys);
      return;
    }
    // 按子组划分,未匹配的进 "其它"
    const assigned = new Set();
    subs.forEach((sg, i) => {
      const matched = keys.filter((k) => sg.match(k) && !assigned.has(k));
      matched.forEach((k) => assigned.add(k));
      if (matched.length) this._renderLayerGroup(panel, `${catId}-${i}`, sg.label, matched);
    });
    const rest = keys.filter((k) => !assigned.has(k));
    if (rest.length) this._renderLayerGroup(panel, `${catId}-other`, '➕ 其它', rest);
  }

  _renderLayerGroup(parent, groupId, label, keys) {
    if (!keys.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'layer-group';
    const head = document.createElement('div');
    head.className = 'layer-head';
    const collapsed = !!this._layerCollapsed[groupId];
    head.innerHTML = `<span class="chev">${collapsed ? '▶' : '▼'}</span>`
      + `<span class="ttl">${label}</span><span class="cnt">${keys.length}</span>`;
    const body = document.createElement('div');
    body.className = 'layer-body' + (collapsed ? ' collapsed' : '');
    head.onclick = () => {
      this._layerCollapsed[groupId] = !this._layerCollapsed[groupId];
      const c = this._layerCollapsed[groupId];
      body.classList.toggle('collapsed', c);
      head.querySelector('.chev').textContent = c ? '▶' : '▼';
    };
    keys.forEach((key) => {
      const url = texKeyToUrl(key);
      const fallbackUrl = texKeyToDataUrl(this.scene, key);
      if (!url && !fallbackUrl) return;
      const img = document.createElement('img');
      img.src = url || fallbackUrl;
      img.title = key;
      img.alt = '';
      img.draggable = false;
      if (url && fallbackUrl) {
        img.onerror = () => {
          img.onerror = null;
          img.src = fallbackUrl;
        };
      }
      if (key === this.brush) img.classList.add('sel');
      img.onclick = () => {
        // 选笔刷时:取消当前选中件,让用户知道下次点击是"放置",不会改属性
        if (this.selected) { this._clearSelectMarker(); this._refreshSelInfo(); }
        this.setBrush(key);
        // 同时刷新所有分组的高亮(setBrush 已处理,但保险再清一遍本组)
        parent.querySelectorAll('.layer-body img').forEach((x) => x.classList.remove('sel'));
        img.classList.add('sel');
      };
      body.appendChild(img);
    });
    wrap.appendChild(head);
    wrap.appendChild(body);
    parent.appendChild(wrap);
  }

  _refreshSelInfo() {
    const info = document.getElementById('ed-info');
    const props = document.getElementById('ed-props');
    if (!info) return;
    if (!this.selected) {
      info.textContent = '点击地图放置 · 点件选中';
      if (props) props.style.display = 'none';
      return;
    }
    const o = this.selected.obj;
    info.innerHTML = `<b>${this.selected.tex}</b><br>x=${Math.round(o.x)} y=${Math.round(o.y)}`;
    if (!props) return;
    props.style.display = '';
    // 同步当前数值到属性面板
    const sc = document.getElementById('ed-scale');
    const scV = document.getElementById('ed-scale-v');
    const v = +o.scaleX.toFixed(2);
    sc.value = Math.max(0.1, Math.min(3, v)); scV.textContent = v.toFixed(2);
    const rt = document.getElementById('ed-rot');
    const rv = Math.round(o.rotation * 180 / Math.PI);
    rt.value = Math.max(-180, Math.min(180, rv));
    document.getElementById('ed-rot-v').textContent = `${rv}°`;
    document.getElementById('ed-flipx').checked = !!o.flipX;
    document.getElementById('ed-flipy').checked = !!o.flipY;
    const presetStatus = document.getElementById('ed-preset-status');
    if (presetStatus) {
      presetStatus.textContent = this.hasPreset(this.selected.tex) ? ' ✓ 已存' : ' (无)';
      presetStatus.style.color = this.hasPreset(this.selected.tex) ? '#8f8' : '#888';
    }
    const dv = document.getElementById('ed-depth-v');
    if (dv) {
      const b = this.selected.depthBias || 0;
      const total = (this.selected.isTerrain ? -88 : Math.round(o.y)) + b;
      dv.textContent = `偏移 ${b >= 0 ? '+' : ''}${b}  实际 z=${total}`;
    }
  }
}
