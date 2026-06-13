import {
  TILE, MAP_COLS, MAP_ROWS, ISLAND, GROUND,
  ATTACK_RANGE, DYNAMITE_DMG, DYNAMITE_RADIUS, ARROW_DMG,
  GOLD_DROP_MIN, GOLD_DROP_MAX, UI_FRAMES,
} from '../config/constants.js?v=3';
import { registerAnimations } from '../config/animations.js?v=3';
import { ensureHeroLoaded } from '../config/hero.js?v=3';
import { openHeroPicker, closeHeroPicker } from '../hero-picker.js?v=3';
import { openMusicPicker, closeMusicPicker } from '../music-picker.js?v=3';
import { filterSpawnPool, ensureCustomEnemiesLoaded, injectCustomTypes, getLibrary as getEnemyLibrary } from '../config/enemy.js?v=3';
import { openEnemyPicker, closeEnemyPicker } from '../enemy-picker.js?v=3';
import { HERO_EVOLUTIONS } from '../config/evolution.js?v=3';
import {
  EQUIPMENT, EQUIP_BY_ID, EQUIP_SLOTS, SLOT_LABELS, RARITY,
  scaledStats, upgradeCost, buyCost, MAX_EQUIP_LEVEL,
} from '../config/equipment.js?v=3';
import Player from '../entities/Player.js?v=3';
import MeleeEnemy from '../entities/MeleeEnemy.js?v=3';
import RangedEnemy from '../entities/RangedEnemy.js?v=3';
import MinotaurBoss from '../entities/MinotaurBoss.js?v=3';
import Ally, { ALLY_KINDS } from '../entities/Ally.js?v=3';
import Building from '../entities/Building.js?v=3';
import VillageCore from '../entities/VillageCore.js?v=3';
import { playFx, shockwave } from '../entities/effects.js?v=3';
import { HudOverlay } from '../hud-overlay.js?v=3';
import { Leaderboard, computeScore, getStoredName, saveName } from '../leaderboard.js?v=3';
import { ISLANDS, nextIslandIdx } from '../config/islands.js?v=3';
import { Editor } from '../editor.js?v=3';

// 排行榜：默认本地（localStorage）；要联网实时 → 把 REMOTE_LEADERBOARD_URL 改成你的后端地址
// 后端协议：POST /submit (body=JSON entry)  +  GET /top?n=10 (返回 entry 数组按分降序)
const REMOTE_LEADERBOARD_URL = '/api';
import { Sfx, resumeAudio, startMusic, toggleMute } from '../audio.js?v=music1';

// 单位精灵原点在中心，脚底约在中心下方此距离 → 用脚底做深度排序
const FEET_DEPTH = 42;

// Island Kit 受损件黑名单（Codex auto-crop 失败：内容被切掉 / 邻件碎片混入）
// Codex 重切并覆盖后，把对应数字从这里删掉即可恢复使用。
// Codex 已重切覆盖原 28 件，黑名单清空 → 全部 127 件恢复使用
const IK_BLACKLIST = {
  cliff: [],
  forest: [],
  path: [],
  prop: [],
};

// 技能栏调试：true 时在底部画一个半透明红框，用于确认技能栏位置
const HOTBAR_DEBUG = false;

// 敌人预设
const ENEMY_TYPES = {
  imp: { kind: 'melee', texture: 'goblin-torch', anim: 'goblin-torch', hp: 14, dmg: 5, speed: 155, scale: 0.6, attackDist: 50 },
  torch: { kind: 'melee', texture: 'goblin-torch', anim: 'goblin-torch', hp: 36, dmg: 10, speed: 100, scale: 0.9 },
  warrior: { kind: 'melee', texture: 'warrior-red-idle', anim: 'warrior-red', hp: 54, dmg: 13, speed: 95, scale: 0.9, attackDist: 62 },
  bone: { kind: 'melee', texture: 'bone-idle', anim: 'bone', hp: 20, dmg: 6, speed: 122, scale: 1.0, attackDist: 46, bodyW: 24, bodyH: 16, bodyOffX: 20, bodyOffY: 42, barY: -30 },
  boom: { kind: 'melee', texture: 'boom-idle', anim: 'boom', hp: 26, dmg: 9, speed: 96, scale: 1.0, attackDist: 48, bodyW: 24, bodyH: 16, bodyOffX: 20, bodyOffY: 42, barY: -30, flipBase: true },
  oar: { kind: 'melee', texture: 'oar-idle', anim: 'oar', hp: 48, dmg: 12, speed: 88, scale: 1.15, attackDist: 52, bodyW: 26, bodyH: 18, bodyOffX: 19, bodyOffY: 40, barY: -34 },
  lancer: { kind: 'melee', texture: 'lancer-red-idle', anim: 'lancer-red', hp: 46, dmg: 12, speed: 92, scale: 0.9, attackDist: 86, bodyW: 50, bodyH: 40, bodyOffX: 130, bodyOffY: 150, barY: -64 },
  pawn: { kind: 'melee', texture: 'pawn-red-idle', anim: 'pawn-red', hp: 16, dmg: 5, speed: 132, scale: 0.9, attackDist: 50 },
  tnt: { kind: 'ranged', texture: 'goblin-tnt', anim: 'goblin-tnt', attackAnim: 'goblin-tnt-throw', projectile: 'dynamite', hp: 22, speed: 80 },
  archer: { kind: 'ranged', texture: 'archer-red-idle', anim: 'archer-red', attackAnim: 'archer-red-shoot', projectile: 'arrow', hp: 26, speed: 85, range: 360, windup: 420, cooldown: 1600 },
};

// 自动武器定义（升级=更快/更多，伤害随玩家攻击力成长）
const WEAPON_DEFS = {
  sword:        { name: '利剑',     maxLevel: 6, baseCd: 850,  desc: '环身挥砍',                 up: '范围与伤害提升',     icon: 'dmg' },
  aura:         { name: '圣光环',   maxLevel: 6, baseCd: 650,  desc: '持续灼烧周围敌人',         up: '范围/频率提升',      icon: 'crit' },
  wave:         { name: '剑气波',   maxLevel: 6, baseCd: 1300, desc: '前方穿透剑气',             up: '更快/多重',          icon: 'swordwave' },
  fireball:     { name: '火球杖',   maxLevel: 6, baseCd: 1600, desc: '向最近敌人投掷爆裂火球',   up: '更多目标/范围',      icon: 'fire' },
  bow:          { name: '长弓',     maxLevel: 6, baseCd: 1000, desc: '自动射击最近敌人',         up: '更多箭矢',           icon: 'arrows' },
  holyburst:    { name: '🌟 圣光爆', maxLevel: 6, baseCd: 1800, desc: '远程在多个敌人身上引爆神圣爆',  up: '+1 目标 / 范围 / 伤害', icon: 'skill-holyburst' },
  arcanebolt:   { name: '💜 奥术冲击', maxLevel: 6, baseCd: 1400, desc: '从斩击中横扫飞出, 穿透敌人',   up: '+1 道 / 伤害',         icon: 'skill-arcanebolt' },
  thunderbolt:  { name: '⚡ 天罚雷', maxLevel: 6, baseCd: 2200, desc: '天降紫雷劈击随机敌人',         up: '+1 道 / 范围',         icon: 'skill-thunderbolt' },
  flamepillar:  { name: '🔥 烈焰柱', maxLevel: 6, baseCd: 1900, desc: '敌人脚底爆发烈焰柱',           up: '+1 柱 / 伤害',         icon: 'skill-flamepillar' },
  frostfall:    { name: '❄️ 寒冰爆', maxLevel: 6, baseCd: 2000, desc: '天降冰晶炸开随机敌人',         up: '+1 道 / 范围',         icon: 'skill-frostfall' },
};

// 被动强化池
const PASSIVES = [
  { title: '利刃', desc: '攻击 +5', icon: 'dmg', apply: (p) => { p.dmg += 5; } },
  { title: '疾风', desc: '移动速度 +25', icon: 'speed', apply: (p) => { p.speed += 25; } },
  { title: '坚韧', desc: '最大生命 +25 回满', icon: 'maxhp', apply: (p) => { p.maxHp += 25; p.heal(25); } },
  { title: '磁石', desc: '拾取范围 +45', icon: 'greed', apply: (p) => { p.pickupRange += 45; } },
  { title: '锐利', desc: '暴击率 +6%', icon: 'crit', apply: (p) => { p.critChance += 0.06; } },
  { title: '狠击', desc: '暴击伤害 +30%', icon: 'bomb', apply: (p) => { p.critDmg += 0.3; } },
  { title: '吸血', desc: '每次命中回 3 血', icon: 'lifesteal', apply: (p) => { p.lifesteal += 3; } },
  { title: '急速', desc: '全武器冷却 -8%', icon: 'cooldown', apply: (p) => { p.haste = Math.min(0.6, p.haste + 0.08); } },
  { title: '贪婪', desc: '金币 +50%', icon: 'greed', apply: (p) => { p.goldMult += 0.5; } },
];

// 友军招募池 (与 PASSIVES 共用 apply 接口, 但作用于 scene 而非 player)
const RECRUITS = [
  { title: '招募骑士', desc: '召唤一名近战骑士跟随作战', icon: 'dmg', recruit: 'knight' },
  { title: '招募弓手', desc: '召唤一名弓手, 中距离压制', icon: 'arrows', recruit: 'archer' },
  { title: '招募法师', desc: '召唤一名法师, 范围魔法打击', icon: 'fire', recruit: 'mage' },
];

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super('WorldScene');
  }

  // Scene init: 接收 islandIdx + 玩家持久化状态(过桥时由上一岛传入)
  init(data) {
    this._islandIdx = (data && typeof data.islandIdx === 'number') ? data.islandIdx : 0;
    this._island = ISLANDS[this._islandIdx] || ISLANDS[0];
    // 游戏模式: 'defense' = 守水晶塔(默认) | 'survival' = 无尽杀戮,达到 killGoal 通关
    this._mode = (data && data.mode === 'survival') ? 'survival' : 'defense';
    this._killGoal = (data && typeof data.killGoal === 'number') ? data.killGoal : 1000;
    this._victoryShown = false;
    this._carryState = data && data.playerState ? data.playerState : null;
    // 每次进入战斗都重置死亡/过桥/崩溃标记，避免上一局状态延续
    this._deathShown = false;
    this._transitioning = false;
    this._crashed = false;
    this._deathSubmitted = false;
    this._myEntry = null;
    // 关掉可能残留的 DOM overlay
    const d = document.getElementById('death-overlay');
    if (d) d.classList.remove('show');
  }

  create() {
    const worldW = MAP_COLS * TILE;
    const worldH = MAP_ROWS * TILE;
    registerAnimations(this);
    this.makeSwordWaveTexture();

    this.solids = this.physics.add.staticGroup();
    this.buildings = [];
    this.villageCore = null;
    this._coreDestroyed = false;
    this.gold = 0;

    // 1) 水面（painterly seamless）+ 岛屿地形
    this.add.tileSprite(0, 0, worldW, worldH, 'ik-water-tile').setOrigin(0, 0).setDepth(-100);
    // —— Painterly Island（新地形）：纯绿底 + cliff 边缘件 ——
    // 旧 64px 草地与 biome 已停用，由 island-kit 全套接管。
    this.buildPainterlyIsland();
    this.addFoam(); // 海岸泡沫动画

    // 2) 小路（橄榄色草地，连接中心枢纽与各区域）
    this.pathCells = new Set();
    this.addPath(20, 14, 9, 7, 2);    // 中心 → 村庄
    this.addPath(20, 14, 30, 6, 2);   // 中心 → 森林
    this.addPath(20, 14, 32, 20, 2);  // 中心 → 矿区
    this.addPath(20, 14, 8, 21, 2);   // 中心 → 废墟
    this.addPath(20, 14, 20, 25, 2);  // 中心 → 海岸

    // 3) 区域分区（村庄 / 森林 / 矿区 / 废墟 / 海岸）
    this.addVillageArea();
    this.addForestArea();
    this.addMineArea();
    this.addRuinArea();
    this.addCoastArea();
    // 区域地表色彩分层（半透明 overlay）+ 适度分区点缀
    this.decorateVillageArea();
    this.decorateForestArea();
    this.decorateMineArea();
    this.decorateRuinArea();
    this.decorateCoastArea();
    // 水晶塔: 不再自动生成默认塔. 玩家需在编辑器里放一件组件 + 🔮 设为水晶塔.
    // (applyCustomCoreFromEditor 会在 layout 加载完成后用标记件挂上 VillageCore 逻辑)
    // 注: 原 _scheduleClearCenterColliders() 调用已移除 —
    // 它会暴力 disable 中心 220×160 区域所有 solid (包括用户编辑器画的碰撞格), 不再需要

    // 7) 玩家（出生在中央开阔战斗区）
    // 英雄前缀从 hero.js 读;通常 HomeScene 已 await ensureHeroLoaded,这里同步取到 prefix。
    // 若是直接进入(没经 HomeScene),则 prefix 默认 warrior-blue,Player 容错处理。
    const heroPrefix = (this._heroPrefix
      || (this.game.registry && this.game.registry.get('heroPrefix'))
      || 'warrior-blue');
    // 第一关默认围绕中心水晶塔开局；若编辑器手动保存了出生点，则尊重编辑器配置。
    let spawnX = this.villageCore ? this.villageCore.x - 150 : 20 * TILE;
    let spawnY = this.villageCore ? this.villageCore.y + 135 : 14 * TILE;
    try {
      const idx = this._islandIdx || 0;
      const modeKey = `tinyswords.layout.v1.island.${idx}.${this._mode || 'defense'}`;
      const legacyKey = `tinyswords.layout.v1.island.${idx}`;
      // 两种模式都允许 fallback 到旧 legacy key (使旧档既能给守塔用,也能给无尽用)
      const raw = localStorage.getItem(modeKey) || localStorage.getItem(legacyKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.heroSpawn && typeof d.heroSpawn.x === 'number') {
          spawnX = d.heroSpawn.x; spawnY = d.heroSpawn.y;
        }
      }
    } catch (e) {}
    this.player = new Player(this, spawnX, spawnY, heroPrefix);
    this.player.setScale(0.9);
    this.physics.add.collider(this.player, this.solids);
    // 过桥来 → 还原状态
    if (this._pendingRestore) this._restoreCarryState(this._pendingRestore);
    // 主角头顶血条（始终显示，跟随角色）
    this.playerHpBg = this.add.rectangle(0, 0, 50, 8, 0x000000, 0.6).setOrigin(0.5).setDepth(99996);
    this.playerHpFill = this.add.rectangle(0, 0, 46, 5, 0x46c83c).setOrigin(0, 0.5).setDepth(99997);

    // 8) 敌人 + 幸存者进度状态
    this.enemies = this.add.group();
    this.physics.add.collider(this.enemies, this.solids);
    // 友军小弟
    this.allies = this.add.group();
    this.physics.add.collider(this.allies, this.solids);
    // 不做敌人之间的相互碰撞——大量敌人聚集时这是最重的物理开销，
    // 允许重叠（幸存者类游戏的常规做法），帧率更稳。
    this.choosing = false;
    // 状态字段：默认值；若是过桥来的，下面会被 _restoreCarryState 覆写
    this.elapsed = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 5;
    this.pendingLevels = 0;
    this.nextSpawnAt = 800;
    this.nextBossAt = 60000;
    // —— 守塔模式波次状态 ——
    this._waveNum = 0;
    this._wavePhase = 'prep';      // 'prep' | 'combat'
    this._wavePhaseUntil = 0;
    this._waveSpawnQueue = 0;
    this._waveSpawnNext = 0;
    // 起手不带自动武器 — 基础攻击 = F 横扫斩(手动)
    // 自动武器(剑环 / 圣光环 / 剑气波 / 火球 / 长弓)全部走升级时肉鸽抽取
    this.weapons = [];
    this.ownedEquip = {};
    this.gearOpen = false;
    // 过桥状态恢复（HP/等级/武器/装备/金币/计时/击杀），玩家创建后再应用一次
    this._pendingRestore = this._carryState;

    // 9) 投射物 + 金币 + 经验晶体
    this.makeGemTexture();
    this.makeCircleTexture('fireorb', 0xff7a2a, 11);
    this.arrows = this.physics.add.group();
    this.physics.add.overlap(this.arrows, this.player, (a, b) => {
      // Phaser 在 overlap(组, 精灵) 时会交换参数顺序，回调收到的是 (精灵, 组成员)。
      // 所以这里必须按身份判断哪个才是箭，绝不能直接 destroy 第一个参数（那会误删玩家！）。
      const arrow = a === this.player ? b : a;
      if (!arrow || !arrow.active) return;
      this.player.takeDamage(ARROW_DMG);
      playFx(this, 'fx-dust', arrow.x, arrow.y, { scale: 0.5 });
      arrow.destroy();
    });
    this.physics.add.collider(this.arrows, this.solids, (arrow) => arrow.destroy());
    this.coins = this.physics.add.group();
    this.gems = this.physics.add.group();

    // 10) 云 + 岸边水花
    this.spawnClouds(worldW, worldH);
    this.time.addEvent({ delay: 1800, loop: true, callback: () => this.shoreSplash() });

    // 11) 边界 / 相机
    this.physics.world.setBounds(
      ISLAND.x0 * TILE, ISLAND.y0 * TILE,
      (ISLAND.x1 - ISLAND.x0 + 1) * TILE, (ISLAND.y1 - ISLAND.y0 + 1) * TILE,
    );
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    if (this._islandIdx === 0 && this.villageCore) {
      // 第一关是守塔玩法：镜头围绕水晶塔构图，而不是让水晶塔跑到屏幕边缘。
      // 水晶塔 sprite 的 y 是底座脚底，视觉中心约在其上方 92px。
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1, this.villageCore.x - this.player.x, this.villageCore.y - 92 - this.player.y);
    } else {
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    }
    this.cameras.main.setZoom(1.4);
    // 锁绘制到整数像素 — 避免相机 lerp 平滑跟随时静态物体 (水晶塔/树/石头) 亚像素抖动产生的"漂移感"
    this.cameras.main.setRoundPixels(true);

    // 12) 输入
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.attackKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.skillJ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.skillK = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.skillU = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U);
    this.skillI = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.skillL = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.healKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
    this.shopKeyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.gearKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.gearPrevKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.muteKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.numKeys = this.input.keyboard.addKeys({
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      three: Phaser.Input.Keyboard.KeyCodes.THREE,
      four: Phaser.Input.Keyboard.KeyCodes.FOUR,
      five: Phaser.Input.Keyboard.KeyCodes.FIVE,
      six: Phaser.Input.Keyboard.KeyCodes.SIX,
    });

    // HUD 全部交给 HTML overlay 渲染（永远锚定浏览器视口）
    // 旧画布 HUD 已禁用，避免与 overlay 重叠
    this.hud = new HudOverlay();
    if (this.hud && this.hud.showCore && this.villageCore) {
      this.hud.showCore('水晶塔', this.villageCore.hp, this.villageCore.maxHp);
    } else if (this.hud && this.hud.hideCore) {
      this.hud.hideCore();
    }
    // 初次填充技能栏（K 冲刺 + 当前武器图标）
    this.refreshWeaponHud();
    // 排行榜 + 死亡屏
    this.leaderboard = new Leaderboard({ remoteEndpoint: REMOTE_LEADERBOARD_URL });
    this._myEntry = null;
    if (this.hud) this.hud.hideDeath();
    // 给旧字段做 no-op 占位，避免散落各处的 setText/setUiBar/setVisible 调用崩掉
    const noop = { setText: () => {}, setColor: () => {}, setVisible: () => {}, destroy: () => {} };
    this.hpText = noop; this.levelText = noop; this.timerText = noop; this.killText = noop;
    this.goldText = noop; this.skillText = noop; this.weaponText = noop;
    this.bossNameText = noop;
    const noopBar = { width: 0, setVisible: () => {}, setCrop: () => {}, _tw: 1, _th: 1, destroy: () => {} };
    this.hudFill = noopBar; this.xpFill = noopBar; this.bossFill = noopBar;
    this.bossUI = [];
    this.hotSlots = null; // refreshHotbar 会 push 到 overlay；不再有画布槽位
    this.cdGraphics = null;
    this.playerHpBg = noopBar; this.playerHpFill = noopBar;
    this._hudObjects = [];
    // buildHud 已成空操作（保留方法签名给旧路径调用），保持下行不删，但不再渲染任何东西
    this.buildHud();

    // 所有 path/树石/建筑都放完后，最后撒自然小件（蘑菇/花/草/倒木/藤）
    this._scatterNature(70);

    // 进入此岛公告 + 桥接到下一岛
    this.announce(`⛵ ${this._island.name}  · ${this._island.sub}`, '#ffe070');
    this._placeBridgeToNextIsland();

    // —— 地形编辑器：按 F1 切换 ——
    // 在 editor 创建之前，先把当前已放置的所有 auto 件捕获进 _autoLayer，
    // 进编辑模式时统一隐藏（用户要"隐藏原地形"以便从零搭建）
    this._autoLayer = [];
    // 把 villageCore 自身 + 它的子部件 (hp 条/光效等) 收成黑名单, 避免被当成原地形隐藏
    const coreBlacklist = new Set();
    if (this.villageCore) {
      coreBlacklist.add(this.villageCore);
      ['sprite','baseShadow','hpBg','hpFill','aura','glow','label'].forEach((k) => {
        if (this.villageCore[k]) coreBlacklist.add(this.villageCore[k]);
      });
    }
    this.children.list.forEach((o) => {
      if (o === this.player) return;
      if (o === this.playerHpBg || o === this.playerHpFill) return;
      if (coreBlacklist.has(o)) return; // 水晶塔永远显示, 不进 auto 层
      if (o.scrollFactor && o.scrollFactor.x === 0 && o.scrollFactor.y === 0) return; // HUD/scroll-locked
      if (o.depth <= -100) return; // 水面背景保留
      this._autoLayer.push(o);
    });
    this.editor = new Editor(this);
    // 自动加载本岛+模式的布局 (混合存储 localStorage / IDB,带旧版 fallback)
    // 关键: 必须先 await 组件库 hydrate, 否则用户上传的自定义贴图 (含水晶塔) 还没注册,
    // _applyLayout 跳过 → 看起来塔丢失了
    Promise.all([
      import('../storage.js?v=3'),
      import('../component-library.js?v=1'),
    ]).then(async ([{ loadKV }, compLib]) => {
      if (compLib.ensureAllLoaded) await compLib.ensureAllLoaded(this);
      const idx = this._islandIdx || 0;
      const modeKey = `tinyswords.layout.v1.island.${idx}.${this._mode || 'defense'}`;
      let raw = await loadKV(modeKey);
      if (!raw) {
        raw = await loadKV(`tinyswords.layout.v1.island.${idx}`);
      }
      return raw;
    }).then((raw) => {
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.pieces)) this.editor._applyLayout(data);
      } catch (e) { /* ignore */ }
    }).catch((err) => { console.warn('[layout load]', err); });

    // 首次输入解锁音频并启动 BGM（浏览器自动播放限制）
    this.lastStep = 0;
    const unlock = () => { resumeAudio(); startMusic(); };
    this.input.keyboard.once('keydown', unlock);
    this.input.once('pointerdown', unlock);

    // 游戏中换英雄: H 键打开角色库,或点 HUD 浮动按钮
    this.input.keyboard.on('keydown-H', () => this._openHeroSwap());
    this._buildHeroSwapButton();
    // 敌人库: M 键 或 HUD 按钮
    this.input.keyboard.on('keydown-M', () => this._openEnemyPicker());
    this._buildEnemyPickerButton();
    // 音乐库: HUD 浮动按钮 (无键位 — N 键可能跟其它冲突)
    this._buildMusicPickerButton();
    // 自定义敌人:加载贴图+动画 + 注入 ENEMY_TYPES (异步,完成后即可被刷怪选中)
    ensureCustomEnemiesLoaded(this).then(() => injectCustomTypes(ENEMY_TYPES));
  }

  _buildEnemyPickerButton() {
    if (document.getElementById('hud-enemy-picker')) return;
    const b = document.createElement('button');
    b.id = 'hud-enemy-picker';
    b.innerHTML = '👹';
    b.title = '敌人库 (M)';
    b.style.cssText = `
      position: fixed; top: 12px; right: 60px; z-index: 220;
      width: 40px; height: 40px; border-radius: 50%;
      background: #4a3014; color: #ffe070; border: 2px solid #c2a35e;
      font: 18px monospace; cursor: pointer; padding: 0;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    `;
    b.onmouseover = () => { b.style.background = '#6b4a20'; };
    b.onmouseout = () => { b.style.background = '#4a3014'; };
    b.onclick = () => this._openEnemyPicker();
    document.body.appendChild(b);
  }

  _openEnemyPicker() {
    if (this._deathShown) return;
    openEnemyPicker(this);
  }

  _buildMusicPickerButton() {
    if (document.getElementById('hud-music-picker')) return;
    const b = document.createElement('button');
    b.id = 'hud-music-picker';
    b.innerHTML = '🎵';
    b.title = '音乐 (开关 + 上传)';
    b.style.cssText = `
      position: fixed; top: 12px; right: 108px; z-index: 220;
      width: 40px; height: 40px; border-radius: 50%;
      background: #2a4a6a; color: #ffe070; border: 2px solid #c2a35e;
      font: 18px monospace; cursor: pointer; padding: 0;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    `;
    b.onmouseover = () => { b.style.background = '#3a5e88'; };
    b.onmouseout = () => { b.style.background = '#2a4a6a'; };
    b.onclick = () => { if (!this._deathShown) openMusicPicker(this); };
    document.body.appendChild(b);
  }

  // 浮动小按钮 (HUD 之下,左上角) — 点击打开角色库,即时换形态
  _buildHeroSwapButton() {
    if (document.getElementById('hud-hero-swap')) return;
    const b = document.createElement('button');
    b.id = 'hud-hero-swap';
    b.innerHTML = '🦸';
    b.title = '换英雄 (H)';
    b.style.cssText = `
      position: fixed; top: 12px; right: 12px; z-index: 220;
      width: 40px; height: 40px; border-radius: 50%;
      background: #4a204a; color: #ffe070; border: 2px solid #c2a35e;
      font: 18px monospace; cursor: pointer; padding: 0;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    `;
    b.onmouseover = () => { b.style.background = '#6b3070'; };
    b.onmouseout = () => { b.style.background = '#4a204a'; };
    b.onclick = () => this._openHeroSwap();
    document.body.appendChild(b);
  }

  _openHeroSwap() {
    if (this._deathShown) return;
    openHeroPicker(this, {
      onPick: (entry) => this._swapHeroLive(entry),
    });
  }

  // 不重生玩家,只换贴图/动画 — HP / 等级 / 装备 / 位置全保留
  _swapHeroLive(entry) {
    if (!this.player || !entry) return;
    const prefix = entry.prefix;
    if (!this.textures.exists(`${prefix}-idle`)) return; // 自定义未就绪
    if (!this.anims.exists(`${prefix}-idle`)) return;
    const p = this.player;
    p.animPrefix = prefix;
    p.evoTier = 1;            // 换形态后清进化标记 (避免下一次升级重叠 tint)
    p.clearTint();
    p.setTexture(`${prefix}-idle`, 0);
    p.play(p.anim('idle'), true);
  }

  shutdown() {
    const b = document.getElementById('hud-hero-swap');
    if (b) b.remove();
    const eb = document.getElementById('hud-enemy-picker');
    if (eb) eb.remove();
    const mb = document.getElementById('hud-music-picker');
    if (mb) mb.remove();
    closeHeroPicker();
    closeEnemyPicker();
    closeMusicPicker();
  }

  // —— 波次系统 ——
  // —— 持续刷怪（密度/种类随时间递增）——
  spawnInterval() {
    const m = this.elapsed / 60000;
    // 守塔: 起手 2200ms → 700ms; 无尽杀戮: 起手 1300ms → 400ms (节奏快一倍)
    if (this._mode === 'survival') return Math.max(400, 1300 - m * 200);
    return Math.max(700, 2200 - m * 300);
  }

  // —— 守塔模式波次系统 ——
  // 每波: 准备阶段 (无怪,显示倒计时) → 战斗阶段 (按队列刷怪,清空进下一波)
  // 每 5 波是 BOSS 波: 单只大怪, 无小弟
  _waveConfig(n) {
    if (n > 0 && n % 5 === 0) {
      return { boss: true, prepMs: 4000, label: `第 ${n} 波 · BOSS`, rewardGold: 60 + n * 5 };
    }
    const baseCount = 10 + n * 3;
    const pool = ['imp', 'pawn'];
    if (n >= 2) pool.push('torch');
    if (n >= 3) pool.push('bone');
    if (n >= 4) pool.push('warrior');
    if (n >= 6) pool.push('archer');
    if (n >= 7) pool.push('lancer');
    return {
      boss: false,
      count: baseCount,
      pool,
      // 每次刷怪 tick 同时出 batch 只, 节奏立刻热闹起来
      batch: Math.min(4, 2 + Math.floor(n / 3)),
      spawnMs: Math.max(180, 700 - n * 40),
      prepMs: n === 1 ? 3000 : 6000,
      label: `第 ${n} 波`,
      rewardGold: 20 + n * 5,
    };
  }

  _tickWaveSystem(time) {
    if (this._peaceful || this._editorActive) return;
    // 第一次进入: 启动 wave 1 prep
    if (this._waveNum === 0) {
      this._waveNum = 1;
      const c0 = this._waveConfig(1);
      this._wavePhase = 'prep';
      this._wavePhaseUntil = time + c0.prepMs;
      this.announce(`${c0.label} · 准备 ${Math.ceil(c0.prepMs / 1000)}s`, '#80c8ff');
    }

    if (this._wavePhase === 'prep') {
      if (time >= this._wavePhaseUntil) this._startCombatPhase(time);
      return;
    }

    // 战斗阶段
    const cfg = this._waveConfig(this._waveNum);
    if (cfg.boss) {
      // BOSS 波: spawnBoss 已在 _startCombatPhase 触发, 等清空全场
      if (this.livingEnemies() === 0 && !this._waveEndPending) this._endWave(time);
      return;
    }
    // 按节奏从队列里刷小怪 — 每个 tick 一次同时刷 batch 只
    if (this._waveSpawnQueue > 0 && time >= this._waveSpawnNext) {
      const pool = filterSpawnPool(cfg.pool);
      const batch = Math.min(cfg.batch || 1, this._waveSpawnQueue);
      for (let i = 0; i < batch; i++) {
        const type = Phaser.Utils.Array.GetRandom(pool);
        this.spawnEnemy(type);
      }
      this._waveSpawnQueue -= batch;
      this._waveSpawnNext = time + cfg.spawnMs;
    }
    // 全刷完 + 全清完 → 结束本波
    if (this._waveSpawnQueue === 0 && this.livingEnemies() === 0 && !this._waveEndPending) {
      this._endWave(time);
    }
  }

  _startCombatPhase(time) {
    const cfg = this._waveConfig(this._waveNum);
    this._wavePhase = 'combat';
    if (cfg.boss) {
      this.spawnBoss();
      this.announce(`⚠ ${cfg.label} — BOSS 来袭!`, '#ff5040');
    } else {
      this._waveSpawnQueue = cfg.count;
      this._waveSpawnNext = time;
      this.announce(`${cfg.label} 开始 · ${cfg.count} 名敌人涌入`, '#ffe070');
    }
  }

  _endWave(time) {
    const cfg = this._waveConfig(this._waveNum);
    this._waveEndPending = true;
    const gold = cfg.rewardGold;
    this.gold = (this.gold || 0) + gold;
    this.announce(`✓ ${cfg.label} 清空! 奖励 +${gold} 金币`, '#80ff80');
    // 进入下一波准备阶段 (800ms 喘息后再触发公告)
    this._waveNum += 1;
    this.time.delayedCall(800, () => {
      this._waveEndPending = false;
      const nextCfg = this._waveConfig(this._waveNum);
      this._wavePhase = 'prep';
      this._wavePhaseUntil = this.time.now + nextCfg.prepMs;
      this.announce(`${nextCfg.label} · 准备 ${Math.ceil(nextCfg.prepMs / 1000)}s`, '#80c8ff');
    });
  }

  spawnTick() {
    if (this._peaceful || this._editorActive) return;       // 和平/编辑模式不刷怪
    // 同屏上限: 守塔 60, 无尽 120 (爽快感)
    const cap = this._mode === 'survival' ? 120 : 60;
    if (this.livingEnemies() >= cap) return;
    const m = (this.elapsed / 60000) * (this._island.spawnMultiplier || 1);
    // 守塔: 1-2 起手 → 3-5 后期
    // 无尽: 3-5 起手 → 8-12 后期 (单波大批涌入,享受割草)
    const count = this._mode === 'survival'
      ? 3 + Math.floor(m * 1.4) + Phaser.Math.Between(0, 2)
      : 1 + Math.floor(m * 0.7) + Phaser.Math.Between(0, 1);
    // 每岛有自己的敌人池(草原 / 雪原 / 火山) + 自定义敌人也能参与
    const islandPool = (this._island && this._island.enemyPool) || ['imp', 'torch', 'bone', 'pawn'];
    const customKeys = getEnemyLibrary().filter((e) => !['imp','torch','tnt','warrior','archer','lancer','pawn','bone','boom','oar'].includes(e.key)).map((e) => e.key);
    const fullPool = [...islandPool, ...customKeys];
    const pool = filterSpawnPool(fullPool);
    for (let i = 0; i < count; i++) this.spawnEnemy(Phaser.Utils.Array.GetRandom(pool));
  }

  spawnBoss() {
    if (this._peaceful || this._editorActive) return;       // 和平/编辑模式不刷 boss
    const p = this.spawnPointAwayFromPlayer();
    const m = Math.floor(this.elapsed / 60000);
    const hpMul = this._island.bossHpMult || 1;
    let boss;
    // 第一关 (island 0) 默认 boss = 狂暴牛头人; 其他岛仍走原通用 boss
    if ((this._island.bossType === 'minotaur') || (this._islandIdx === 0)) {
      const hp = Math.round((1200 + m * 260) * hpMul);
      boss = new MinotaurBoss(this, p.x, p.y, { hp, dmg: 24 + m * 4 });
      this.showBossBar(boss, '狂暴牛头人');
    } else {
      const cfg = ENEMY_TYPES[this._island.bossType] || ENEMY_TYPES.torch;
      boss = new MeleeEnemy(this, p.x, p.y, {
        ...cfg, hp: Math.round((300 + m * 220) * hpMul), dmg: 24, speed: 80, scale: 1.7, isBoss: true, gold: 25,
      });
      this.showBossBar(boss, this._island.bossName);
    }
    this.enemies.add(boss);
    this.bossWarning();
  }

  bossWarning() {
    const W = this.scale.width;
    const img = this.add.image(W / 2, 150, 'ui-bannerWarning').setScale(0.6)
      .setScrollFactor(0).setDepth(20000).setAlpha(0);
    const txt = this.add.text(W / 2, 150, '⚠ 首领来袭', {
      fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold', color: '#ffe0c0', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20001).setAlpha(0);
    this.tweens.add({
      targets: [img, txt], alpha: 1, duration: 250, yoyo: true, hold: 1100,
      onComplete: () => { img.destroy(); txt.destroy(); },
    });
  }

  // —— 自动武器 ——
  fireWeapons(delta) {
    this.weapons.forEach((w) => {
      w.cdLeft -= delta;
      if (w.cdLeft > 0) return;
      this.fireWeapon(w);
      const def = WEAPON_DEFS[w.key];
      let cd = def.baseCd * (1 - 0.05 * (w.level - 1)) * (1 - this.player.haste);
      cd = Math.max(def.baseCd * 0.35, cd);
      w.cdLeft = cd;
      w.cdMax = cd; // 记录满冷却，用于技能栏转圈
    });
  }

  fireWeapon(w) {
    if (this.player.dead) return;
    const ev = !!w.evolved;
    if (w.key === 'sword') this.fireSword(w.level, ev);
    else if (w.key === 'aura') this.fireAura(w.level, ev);
    else if (w.key === 'wave') this.fireWaveWeapon(w.level, ev);
    else if (w.key === 'fireball') this.fireFireball(w.level, ev);
    else if (w.key === 'bow') this.fireBow(w.level, ev);
    else if (w.key === 'holyburst') this.fireHolyBurst(w.level, ev);
    else if (w.key === 'arcanebolt') this.fireArcaneBolt(w.level, ev);
    else if (w.key === 'thunderbolt') this.fireThunderBolt(w.level, ev);
    else if (w.key === 'flamepillar') this.fireFlamePillar(w.level, ev);
    else if (w.key === 'frostfall') this.fireFrostFall(w.level, ev);
  }

  dealDamage(e, base) {
    if (e.dead) return;
    let dmg = base;
    if (Math.random() < this.player.critChance) dmg = Math.round(dmg * this.player.critDmg);
    e.takeDamage(dmg, this.player.x, this.player.y);
    this.applyLifesteal();
  }

  // 吸血：实际回血并累计，由 update 节流弹出绿色「+N」飘字
  applyLifesteal() {
    if (this.player.lifesteal <= 0 || this.player.dead) return;
    const before = this.player.hp;
    this.player.heal(this.player.lifesteal);
    const healed = this.player.hp - before;
    if (healed > 0) this._healAcc = (this._healAcc || 0) + healed;
  }

  flushLifestealText(time) {
    if (!this._healAcc || this._healAcc <= 0) return;
    if (time - (this._healShownAt || 0) < 360) return;
    this._healShownAt = time;
    const amt = Math.round(this._healAcc);
    this._healAcc = 0;
    const t = this.add.text(this.player.x + 16, this.player.y - 40, `+${amt}`, {
      fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#5dff8a', stroke: '#0a3a18', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(99995);
    this.tweens.add({ targets: t, y: t.y - 26, alpha: 0, duration: 700, ease: 'Sine.out', onComplete: () => t.destroy() });
  }

  nearestEnemies(n) {
    const px = this.player.x; const py = this.player.y;
    return this.enemies.getChildren()
      .filter((e) => !e.dead)
      .sort((a, b) => Phaser.Math.Distance.Between(px, py, a.x, a.y) - Phaser.Math.Distance.Between(px, py, b.x, b.y))
      .slice(0, n);
  }

  fireSword(level, evolved) {
    const px = this.player.x; const py = this.player.y;
    const r = (88 + 9 * level) * (evolved ? 1.3 : 1);
    const m = evolved ? 1.7 : 1;
    shockwave(this, px, py, { color: evolved ? 0xffd040 : 0xffffff, maxRadius: r, duration: 200, lineWidth: evolved ? 5 : 3 });
    // 环身放射剑气（Codex fx-sword-nova）—— 跟随英雄，位移时不掉队
    const nova = this.attachFxToPlayer('fx-sword-nova', { dy: 8, scale: 0.8 * (evolved ? 1.2 : 1) });
    if (evolved && nova) nova.setTint(0xffe08a);
    Sfx.swordNova();
    let hit = 0;
    this.enemies.getChildren().forEach((e) => {
      if (!e.dead && Phaser.Math.Distance.Between(px, py, e.x, e.y) <= r) { this.dealDamage(e, Math.round(this.player.atk() * m)); hit += 1; }
    });
  }

  fireAura(level, evolved) {
    const player = this.player;
    const r = (66 + 9 * level) * (evolved ? 1.35 : 1);
    // Sfx.aura() — 高频自动技能, 音效太吵, 关掉
    // 视觉: fx-holyaura (7 帧 279×280) — 素材最大圈半径 ≈ 130px
    // scale = max(0.85, r / 130) 防止低等级时光环过小看不清
    // y 取 player.y - 30 让光环居中在身体而非脚下
    const scale = Math.max(0.85, r / 130);
    const sprite = this.add.sprite(player.x, player.y - 30, 'fx-holyaura')
      .setScale(scale)
      .setDepth(player.y - 20);  // 在玩家身后, 角色站位会盖住光环下半
    sprite.play('fx-holyaura');
    // 跟随玩家 — 整个动画过程中 sprite 钉在玩家身上
    const followHandler = () => {
      if (!sprite.active) return;
      sprite.setPosition(player.x, player.y - 30);
      sprite.setDepth(player.y - 20);
    };
    this.events.on('update', followHandler);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.events.off('update', followHandler);
      sprite.destroy();
    });
    const dmg = Math.round(this.player.atk() * (evolved ? 0.95 : 0.6));
    const px = player.x; const py = player.y;
    this.enemies.getChildren().forEach((e) => {
      if (!e.dead && Phaser.Math.Distance.Between(px, py, e.x, e.y) <= r) this.dealDamage(e, dmg);
    });
  }

  fireWaveWeapon(level, evolved) {
    this.swordWaveHit();
    if (level >= 4 || evolved) this.time.delayedCall(110, () => { if (!this.player.dead) this.swordWaveHit(); });
    if (evolved) this.time.delayedCall(220, () => { if (!this.player.dead) this.swordWaveHit(); });
  }

  fireFireball(level, evolved) {
    const targets = this.nearestEnemies((level >= 4 ? 2 : 1) + (evolved ? 2 : 0));
    if (targets.length) Sfx.fireball();
    targets.forEach((tgt) => {
      const tx = tgt.x; const ty = tgt.y;
      const sx = this.player.x; const sy = this.player.y - 20;
      // 新火球:用 fx-fireball-spell 完整一次性动画 (10 帧 @20fps = 500ms)
      // 起手帧 → 飞行旋转帧 → 命中爆开帧 → 残烬消散帧, 全程不切换 sprite
      const orb = this.add.sprite(sx, sy, 'fx-fireball-spell').setDepth(99990);
      orb.setRotation(Math.atan2(ty - sy, tx - sx));
      orb.setScale(evolved ? 1.3 : 1.0);
      orb.play('fx-fireball-spell');
      // 飞行段: 380ms 滑到目标 (略快于动画 500ms, 给末尾 120ms 在目标爆开残)
      this.tweens.add({
        targets: orb, x: tx, y: ty, duration: 380, ease: 'Sine.in',
        onComplete: () => {
          // 命中: 把旋转归零, 让末尾爆开帧不再被旋转拉扁成椭圆
          // 同时整体放大一点, 增强冲击感
          orb.setRotation(0);
          orb.setScale(orb.scaleX * 1.3);
          this.fireballExplode(tx, ty, level);
        },
      });
      // 动画播完才销毁 (爆开残烬留在目标位置)
      orb.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => orb.destroy());
    });
  }

  fireballExplode(x, y, level) {
    // 不再播 fx-explosion / fx-impact — 新火球术动画末尾自带爆开残烬帧
    Sfx.explosion();
    const r = 64 + 10 * level; const dmg = Math.round(this.player.atk() * 1.3);
    this.enemies.getChildren().forEach((e) => {
      if (!e.dead && Phaser.Math.Distance.Between(x, y, e.x, e.y) <= r) this.dealDamage(e, dmg);
    });
  }

  fireBow(level, evolved) {
    const n = 1 + Math.floor(level / 2) + (evolved ? 2 : 0);
    const mult = evolved ? 1.4 : 1.0;
    this.nearestEnemies(n).forEach((tgt, i) => {
      this.time.delayedCall(i * 70, () => {
        if (tgt.dead || this.player.dead) return;
        const arrow = this.add.image(this.player.x, this.player.y - 18, 'arrow-red').setDepth(99990);
        if (evolved) arrow.setTint(0xffd040).setScale(1.2);
        arrow.setRotation(Math.atan2(tgt.y - this.player.y, tgt.x - this.player.x));
        const fx = tgt.x; const fy = tgt.y;
        this.tweens.add({
          targets: arrow, x: fx, y: fy, duration: 200,
          onComplete: () => { arrow.destroy(); if (!tgt.dead) this.dealDamage(tgt, Math.round(this.player.atk() * mult)); },
        });
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // 5 个新技能 (用户手调素材 v2): 帧网格 holy 216×215 / arcane 265×268 /
  //   thunder 194×363 / flame 462×470 / frost 265×266
  // 视觉基准: 大而酷炫 — 单目标爆裂 ≈ 2 倍玩家身高, 伤害半径跟视觉对齐
  // ─────────────────────────────────────────────────────────────────

  // —— 圣光爆: 远程在多个敌人身上引爆神圣 AOE ——
  fireHolyBurst(level, evolved) {
    const count = 2 + Math.floor(level / 2) + (evolved ? 2 : 0);
    const targets = this.nearestEnemies(count);
    if (!targets.length) return;
    Sfx.holyBurst();
    const dmg = Math.round(this.player.atk() * (evolved ? 1.5 : 1.1));
    const r = 75 + 8 * level;            // ≈ 83-123px 半径
    targets.forEach((tgt, idx) => {
      this.time.delayedCall(idx * 70, () => {
        if (!tgt || tgt.dead) return;
        const tx = tgt.x; const ty = tgt.y;
        const fx = this.add.sprite(tx, ty - 30, 'fx-holy-burst')
          .setScale(evolved ? 1.3 : 1.0).setDepth(ty + 220);
        // 起手急速放大 — 爆裂冲击感
        fx.setScale(fx.scaleX * 0.6);
        this.tweens.add({ targets: fx, scaleX: fx.scaleX / 0.6, scaleY: fx.scaleY / 0.6, duration: 90, ease: 'Back.Out' });
        fx.play('fx-holy-burst');
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
        this.enemies.getChildren().forEach((e) => {
          if (!e.dead && Phaser.Math.Distance.Between(tx, ty, e.x, e.y) <= r) this.dealDamage(e, dmg);
        });
      });
    });
  }

  // —— 奥术冲击: 从角色斩击中横扫飞出, 穿透路径上的敌人 ——
  fireArcaneBolt(level, evolved) {
    if (this.player.dead) return;
    Sfx.arcaneBolt();
    const waves = 1 + Math.floor(level / 3) + (evolved ? 1 : 0);   // 1 → 3 道
    const dmg = Math.round(this.player.atk() * (evolved ? 1.6 : 1.2));
    const dir = this.player.facing;
    const travel = 340 + 25 * level;                               // 飞行距离
    const hitWidth = 75 + 6 * level;                               // 路径命中半径
    for (let i = 0; i < waves; i++) {
      this.time.delayedCall(i * 120, () => {
        if (this.player.dead) return;
        // 多道时上下扇形错开
        const yOff = (i - (waves - 1) / 2) * 46;
        const sx = this.player.x + dir * 30;
        const sy = this.player.y - 22 + yOff;
        // 素材原生朝左 → 朝右挥时翻转
        const fx = this.add.sprite(sx, sy, 'fx-arcane-impact')
          .setFlipX(dir > 0)
          .setScale(evolved ? 1.15 : 0.9)
          .setDepth(99990);
        fx.play('fx-arcane-impact');
        const hitSet = new Set();
        // 横扫推进 — 动画播放期间向前飞 travel 像素, 穿透沿途敌人
        this.tweens.add({
          targets: fx, x: sx + dir * travel, duration: 460, ease: 'Sine.Out',
          onUpdate: () => {
            this.enemies.getChildren().forEach((e) => {
              if (e.dead || hitSet.has(e)) return;
              if (Phaser.Math.Distance.Between(fx.x, fx.y, e.x, e.y) <= hitWidth) {
                hitSet.add(e);
                this.dealDamage(e, dmg);
              }
            });
          },
        });
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
      });
    }
  }

  // —— 天罚雷: sky 天降, 紫雷劈击随机敌人 ——
  fireThunderBolt(level, evolved) {
    const count = 2 + Math.floor(level / 2) + (evolved ? 2 : 0);
    const targets = this.nearestEnemies(count);
    if (!targets.length) return;
    Sfx.thunderBolt();
    const dmg = Math.round(this.player.atk() * (evolved ? 1.8 : 1.3));
    targets.forEach((tgt, idx) => {
      this.time.delayedCall(idx * 110, () => {
        if (!tgt || tgt.dead) return;
        const tx = tgt.x; const ty = tgt.y;
        // 帧 194×363, scale 0.95 → 柱高 ~ 345 (3.5 倍玩家身高, 天罚气势)
        const fx = this.add.sprite(tx, ty + 4, 'fx-thunder-strike')
          .setOrigin(0.5, 1.0)
          .setScale(evolved ? 1.25 : 0.95)
          .setDepth(ty + 220);
        fx.play('fx-thunder-strike');
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
        const r = 60 + 6 * level;        // ≈ 66-96
        this.enemies.getChildren().forEach((e) => {
          if (!e.dead && Phaser.Math.Distance.Between(tx, ty, e.x, e.y) <= r) this.dealDamage(e, dmg);
        });
      });
    });
  }

  // —— 烈焰柱: 敌人脚底爆发 ——
  fireFlamePillar(level, evolved) {
    const count = 1 + Math.floor(level / 2) + (evolved ? 2 : 0);
    const targets = this.nearestEnemies(count);
    if (!targets.length) return;
    Sfx.flamePillar();
    const dmg = Math.round(this.player.atk() * (evolved ? 1.7 : 1.3));
    targets.forEach((tgt, idx) => {
      this.time.delayedCall(idx * 100, () => {
        if (!tgt || tgt.dead) return;
        const tx = tgt.x; const ty = tgt.y;
        // 帧 462×470, scale 0.6 → ~ 277×282 大火柱
        const fx = this.add.sprite(tx, ty + 6, 'fx-flame-pillar')
          .setOrigin(0.5, 1.0)
          .setScale(evolved ? 0.8 : 0.6)
          .setDepth(ty + 220);
        fx.play('fx-flame-pillar');
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
        const r = 60 + 7 * level;        // ≈ 67-102
        this.enemies.getChildren().forEach((e) => {
          if (!e.dead && Phaser.Math.Distance.Between(tx, ty, e.x, e.y) <= r) this.dealDamage(e, dmg);
        });
      });
    });
  }

  // —— 寒冰爆: sky 天降, 冰晶炸开 ——
  fireFrostFall(level, evolved) {
    const count = 2 + Math.floor(level / 2) + (evolved ? 2 : 0);
    const targets = this.nearestEnemies(count);
    if (!targets.length) return;
    Sfx.frostFall();
    const dmg = Math.round(this.player.atk() * (evolved ? 1.5 : 1.1));
    targets.forEach((tgt, idx) => {
      this.time.delayedCall(idx * 90, () => {
        if (!tgt || tgt.dead) return;
        const tx = tgt.x; const ty = tgt.y;
        // 帧 265×266, scale 0.9 → ~ 239×239
        const fx = this.add.sprite(tx, ty - 25, 'fx-frost-burst')
          .setScale(evolved ? 1.2 : 0.9)
          .setDepth(ty + 220);
        // 起手急速放大
        fx.setScale(fx.scaleX * 0.6);
        this.tweens.add({ targets: fx, scaleX: fx.scaleX / 0.6, scaleY: fx.scaleY / 0.6, duration: 90, ease: 'Back.Out' });
        fx.play('fx-frost-burst');
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
        const r = 70 + 8 * level;        // ≈ 78-118
        this.enemies.getChildren().forEach((e) => {
          if (!e.dead && Phaser.Math.Distance.Between(tx, ty, e.x, e.y) <= r) this.dealDamage(e, dmg);
        });
      });
    });
  }

  // —— 经验晶体 ——
  makeGemTexture() {
    if (this.textures.exists('xpgem')) return;
    const g = this.make.graphics({ add: false });
    g.fillStyle(0x6fe0ff, 1);
    g.beginPath(); g.moveTo(9, 0); g.lineTo(18, 11); g.lineTo(9, 24); g.lineTo(0, 11); g.closePath(); g.fillPath();
    g.lineStyle(2, 0xffffff, 0.85); g.strokePath();
    g.generateTexture('xpgem', 18, 24);
    g.destroy();
  }

  makeCircleTexture(key, color, radius) {
    if (this.textures.exists(key)) return;
    const g = this.make.graphics({ add: false });
    g.fillStyle(color, 1); g.fillCircle(radius, radius, radius);
    g.fillStyle(0xffffff, 0.7); g.fillCircle(radius, radius, radius * 0.5);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }

  dropGem(x, y, val) {
    // 防卡死：晶体总数封顶——超额时合并到最早的一颗，避免物理体无限增长
    const live = this.gems.getChildren().filter((g) => g.active);
    if (live.length >= 120) {
      const oldest = live[0];
      oldest.xpVal = (oldest.xpVal || 1) + val;
      return;
    }
    const gem = this.gems.create(x, y - 8, 'gem-sparkle');
    gem.xpVal = val;
    gem.setDepth(99970);
    gem.play('gem-sparkle');
    gem.anims.setProgress(Math.random()); // 各晶体微光错开，避免整齐闪烁
    gem.body.setAllowGravity(false);
    gem.collectible = false;
    const ang = Phaser.Math.DegToRad(Phaser.Math.Between(0, 360));
    this.physics.velocityFromRotation(ang, Phaser.Math.Between(50, 110), gem.body.velocity);
    gem.body.setDrag(500, 500);
    this.time.delayedCall(250, () => { if (gem.active) gem.collectible = true; });
    // 防卡死：未拾取的晶体 18s 后自动飞向玩家并被吸收，绝不无限堆积
    this.time.delayedCall(18000, () => {
      if (gem.active) { this.addXp(gem.xpVal || 1); gem.destroy(); }
    });
  }

  updateGems() {
    const p = this.player; const R = p.pickupRange;
    // 吸附速度必须始终快于玩家移动速度，否则加速后会“甩开”晶体；并随距离越近越快（归巢）。
    const basePull = Math.max(360, p.speed * 1.9);
    this.gems.getChildren().forEach((g) => {
      if (!g.active || !g.collectible) return;
      const d = Phaser.Math.Distance.Between(g.x, g.y, p.x, p.y);
      // 一旦进入吸取范围就锁定归巢，即使之后略微超出也继续追，避免高速移动时反复脱离
      if (d < R) g.homing = true;
      if (g.homing) {
        if (d < 46) { this.collectGem(g); return; }
        const pull = basePull + (R - Math.min(d, R)) * 2.2; // 越近越快
        this.physics.moveTo(g, p.x, p.y, pull);
      }
    });
  }

  collectGem(g) {
    if (!g.active) return;
    playFx(this, 'fx-gem-pickup', g.x, g.y, { scale: 0.7, depth: 99980 });
    Sfx.gem();
    this.addXp(g.xpVal || 1);
    g.destroy();
  }

  addXp(v) {
    this.xp += v;
    let leveled = false;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = Math.round(this.xpToNext * 1.3) + 3;
      this.pendingLevels += 1;
      leveled = true;
      // 进化升阶已禁用 — 不再随等级切 paladin-tN 形态
      // this.checkEvolution();
    }
    // 升级光环（进化那一帧已有更强的进化特效，避免叠加，仅普通升级时播放）
    if (leveled && this.player.evoTier === (this._lastEvoTier ?? 1)) {
      playFx(this, 'fx-levelup-aura', this.player.x, this.player.y + 6, { scale: 0.9, depth: this.player.y - 10 });
      Sfx.upgrade();
    }
    this._lastEvoTier = this.player.evoTier;
  }

  // 达到进化等级阈值 → 触发英雄进化（属性跃升 + 形态切换 + 特效）
  checkEvolution() {
    const evo = HERO_EVOLUTIONS.find((e) => e.level === this.level && e.tier > this.player.evoTier);
    if (!evo) return;
    this.player.applyEvolution(evo);
    this.announce(`⚡ 进化！${evo.name}`, '#ffe070');
    this.refreshSkillHud();
    // 进化光柱特效：有 fx-evolve 用之，否则用现成的爆炸/尘土兜底
    const fxKey = this.textures.exists('fx-evolve') ? 'fx-evolve' : 'fx-explosion';
    playFx(this, fxKey, this.player.x, this.player.y - 10, { scale: 1.2, depth: this.player.y + 100 });
    this.cameras.main.flash(220, 255, 240, 180);
  }

  // —— 动态升级选项 ——
  getUpgradeChoices() {
    const pool = [];
    this.weapons.forEach((w) => {
      const def = WEAPON_DEFS[w.key];
      if (w.level < def.maxLevel) pool.push({ title: `${def.name} → Lv${w.level + 1}`, desc: def.up, icon: def.icon, rarity: 'rare', apply: () => { w.level += 1; } });
      else if (!w.evolved) pool.push({ title: `★合成：${def.name}`, desc: '满级进化，威力大幅提升', icon: def.icon, rarity: 'legendary', apply: () => { w.evolved = true; } });
    });
    if (this.weapons.length < 6) {
      Object.keys(WEAPON_DEFS).forEach((k) => {
        if (!this.weapons.find((w) => w.key === k)) {
          pool.push({ title: `新武器：${WEAPON_DEFS[k].name}`, desc: WEAPON_DEFS[k].desc, icon: WEAPON_DEFS[k].icon, rarity: 'rare', apply: () => { this.weapons.push({ key: k, level: 1, cdLeft: 200 }); } });
        }
      });
    }
    PASSIVES.forEach((p) => pool.push({ ...p, rarity: 'common' }));
    // 招募卡 — 友军未到上限 (6) 才进池. 每张是独立 apply, 多次出现可堆叠
    const allyCount = this.allies ? this.allies.getChildren().filter((a) => !a.dead).length : 0;
    if (allyCount < 6) {
      RECRUITS.forEach((r) => {
        pool.push({
          title: r.title, desc: r.desc, icon: r.icon, rarity: 'rare',
          apply: () => this.recruitAlly(r.recruit),
        });
      });
    }
    // 🚧 测试期偏置: 5 个新技能未拥有时, 三选一保证 2 张是新技能 + 1 张其他
    // 全部收齐后自动回归纯随机. 后续要平衡概率改这里即可.
    const NEW_TEST_KEYS = ['holyburst', 'arcanebolt', 'thunderbolt', 'flamepillar', 'frostfall'];
    const newTitleSet = new Set(NEW_TEST_KEYS.map((k) => `新武器：${WEAPON_DEFS[k].name}`));
    const newPicks = pool.filter((c) => newTitleSet.has(c.title));
    const others   = pool.filter((c) => !newPicks.includes(c));
    Phaser.Utils.Array.Shuffle(newPicks);
    Phaser.Utils.Array.Shuffle(others);
    if (newPicks.length === 0) return others.slice(0, 3);
    const result = [];
    const newQuota = Math.min(2, newPicks.length);
    for (let i = 0; i < newQuota; i++) result.push(newPicks[i]);
    while (result.length < 3 && others.length) result.push(others.shift());
    return result;
  }

  // 在玩家身后随机一点生成友军
  recruitAlly(kind) {
    if (!this.player || !this.allies) return null;
    const ang = Math.random() * Math.PI * 2;
    const r = 60 + Math.random() * 30;
    const x = this.player.x + Math.cos(ang) * r;
    const y = this.player.y + Math.sin(ang) * r;
    const ally = new Ally(this, x, y, kind);
    this.allies.add(ally);
    playFx(this, 'fx-dust', x, y, { scale: 0.7 });
    const label = (ALLY_KINDS[kind] && ALLY_KINDS[kind].label) || '友军';
    this.announce && this.announce(`🛡 ${label} 加入战斗!`, '#80c8ff');
    return ally;
  }

  // 给 HUD 喂波次状态 (无尽模式返回 null = 不显示 wavebox)
  _buildWaveState() {
    if (this._mode !== 'defense') return null;
    if (!this._waveNum) return null;
    const cfg = this._waveConfig(this._waveNum);
    const state = {
      label: cfg.label,
      boss: !!cfg.boss,
      phase: this._wavePhase,
    };
    if (this._wavePhase === 'prep') {
      state.prepRemainMs = Math.max(0, this._wavePhaseUntil - this.time.now);
      state.prepTotalMs = cfg.prepMs;
    } else {
      state.queue = this._waveSpawnQueue || 0;
      state.living = this.livingEnemies();
      state.total = cfg.boss ? 1 : cfg.count;
    }
    return state;
  }

  // 编辑器加载完 layout 后调用 — 检查是否有件被标记为自定义水晶塔
  // 有 → 销毁默认 villageCore, 用这件做新的塔
  applyCustomCoreFromEditor() {
    if (this._mode !== 'defense') return;            // 只有守塔模式有塔的概念
    if (!this.editor || !this.editor.placed) return;
    const corePiece = this.editor.placed.find((p) => p.isCustomCore && p.obj && p.obj.active);
    if (!corePiece) return;
    // 已经用这件做 core 了 → 不重复
    if (this.villageCore && this.villageCore._editorPieceRef === corePiece) return;
    // 销毁旧 core
    if (this.villageCore && !this.villageCore.destroyed) {
      if (this.villageCore.solid) this.villageCore.solid.destroy();
      if (this.villageCore.bar) this.villageCore.bar.destroy();
      if (this.villageCore.sprite && this.villageCore.sprite !== corePiece.obj) {
        this.villageCore.sprite.destroy();
      }
      this.villageCore = null;
    }
    // 用 corePiece.obj 作为新塔的 sprite — 保留原动画/缩放/旋转
    const sp = corePiece.obj;
    // 调整 depth 让血条/特效叠在它上方
    sp.setDepth(sp.y + 4);
    this.villageCore = new VillageCore(this, Math.round(sp.x), Math.round(sp.y), {
      maxHp: 1800,
      aggroRadius: 620,
      existingSprite: sp,
      baseW: Math.round((sp.displayWidth || 80) * 0.7),
      baseH: 42,
    });
    this.villageCore._editorPieceRef = corePiece;
    // HUD core bar 同步重建
    if (this.hud && this.hud.showCore) this.hud.showCore('水晶塔', this.villageCore.hp, this.villageCore.maxHp);
    // 摄像头围绕新塔
    if (this.cameras && this.cameras.main && this.player) {
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1,
        this.villageCore.x - this.player.x, this.villageCore.y - 92 - this.player.y);
    }
  }

  // 给 HudOverlay 的小地图喂数据
  _buildMinimapState() {
    const x0 = ISLAND.x0 * TILE;
    const y0 = ISLAND.y0 * TILE;
    const worldW = (ISLAND.x1 - ISLAND.x0 + 1) * TILE;
    const worldH = (ISLAND.y1 - ISLAND.y0 + 1) * TILE;
    const norm = (o) => ({ x: o.x - x0, y: o.y - y0 });
    const enemies = [];
    if (this.enemies && this.enemies.getChildren) {
      const list = this.enemies.getChildren();
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e.dead || !e.active) continue;
        enemies.push({ ...norm(e), boss: !!e.isBoss });
      }
    }
    const allies = [];
    if (this.allies && this.allies.getChildren) {
      const list = this.allies.getChildren();
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a || a.dead || !a.active) continue;
        allies.push(norm(a));
      }
    }
    return {
      worldW, worldH,
      player: this.player ? norm(this.player) : null,
      core: this.villageCore ? { ...norm(this.villageCore), destroyed: this.villageCore.destroyed } : null,
      enemies,
      allies,
      spawns: (this.editor && this.editor.spawnPoints) ? this.editor.spawnPoints.map(norm) : null,
    };
  }

  spawnEnemy(type, ovX, ovY) {
    const cfg = ENEMY_TYPES[type];
    if (!cfg) return; // 自定义敌人贴图还没加载完 → 跳过这次,下次刷怪再试
    const p = (typeof ovX === 'number' && typeof ovY === 'number')
      ? { x: ovX, y: ovY } : this.spawnPointAwayFromPlayer();
    const e = cfg.kind === 'ranged'
      ? new RangedEnemy(this, p.x, p.y, cfg)
      : new MeleeEnemy(this, p.x, p.y, cfg);
    this.enemies.add(e);
    return e;
  }

  // 无尽模式启动时,延迟到 editor 应用完 layout 后再扫除中央碰撞
  // (layout 是异步加载的,直接清会被后到的 cells 复活)
  _scheduleClearCenterColliders() {
    // 立刻清一次 + 1s 后再清一次 (兜底布局异步晚到)
    const doClear = () => this._clearCenterColliders();
    doClear();
    this.time.delayedCall(300, doClear);
    this.time.delayedCall(1500, doClear);
  }

  _clearCenterColliders() {
    if (!this.solids) return;
    // 中央"水晶塔区域" = 默认 placeVillageCore 的中心 ±100px 横 / ±70px 竖
    const cx = 20 * TILE + 32;
    const cy = 13 * TILE + 42;
    const halfW = 110; const halfH = 80;
    const kids = this.solids.getChildren();
    let cleared = 0;
    kids.forEach((s) => {
      if (!s || !s.body || !s.body.enable) return;
      const sx = s.body.x + s.body.width / 2;
      const sy = s.body.y + s.body.height / 2;
      if (sx > cx - halfW && sx < cx + halfW && sy > cy - halfH && sy < cy + halfH) {
        s.body.enable = false;
        if (s.setVisible) s.setVisible(false);
        cleared++;
      }
    });
    if (cleared > 0 && this.editor && this.editor._drawZones) this.editor._drawZones();
  }

  placeVillageCore() {
    const x = 20 * TILE + 32;
    const y = 13 * TILE + 42;
    // 水晶塔血量从 450 → 1800 (4x), 配合刷怪速度减半可以撑 1-2 分钟而不是 10 秒爆
    this.villageCore = new VillageCore(this, x, y, { maxHp: 1800, aggroRadius: 620 });
    this.add.text(x, y - 142, '水晶塔', {
      fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold',
      color: '#bff5ff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(y + 70);
  }

  chooseEnemyTarget(enemy, player) {
    const core = this.villageCore;
    if (!core || core.destroyed) return player;
    if (!player || player.dead) return core;
    const distPlayer = Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y);
    const distCore = Phaser.Math.Distance.Between(enemy.x, enemy.y, core.x, core.y);
    const nearCore = distCore <= core.aggroRadius;
    const playerFar = distPlayer > 340;
    if (nearCore && (playerFar || distCore < distPlayer * 0.88)) return core;
    return player;
  }

  onVillageCoreDestroyed() {
    if (this._coreDestroyed) return;
    this._coreDestroyed = true;
    this.announce('水晶塔被摧毁', '#ff7676');
    if (this.hud && this.hud.updateCore && this.villageCore) this.hud.updateCore(0, this.villageCore.maxHp);
    if (this.player && !this.player.dead) {
      this.player.dead = true;
      this.player.setVelocity(0, 0);
      this.player.setTint(0x888888);
    }
    this.time.delayedCall(450, () => this._showDeathOverlay('水晶塔被摧毁'));
  }

  // 检测某世界坐标点是否落在碰撞体内 (静态群组里的 rect 体)
  _pointBlocked(x, y) {
    if (!this.solids) return false;
    const kids = this.solids.getChildren();
    for (let i = 0; i < kids.length; i++) {
      const s = kids[i];
      if (!s || !s.body || !s.body.enable) continue;
      const b = s.body;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return true;
    }
    return false;
  }

  // 从 (x,y) 螺旋向外找一个不在碰撞体内的点;找不到就返回 null
  _findFreeNear(x, y, maxRadius = 120) {
    if (!this._pointBlocked(x, y)) return { x, y };
    const step = 16;
    for (let r = step; r <= maxRadius; r += step) {
      const samples = 8;
      for (let i = 0; i < samples; i++) {
        const a = (Math.PI * 2 * i) / samples;
        const tx = x + Math.cos(a) * r;
        const ty = y + Math.sin(a) * r;
        if (!this._pointBlocked(tx, ty)) return { x: tx, y: ty };
      }
    }
    return null;
  }

  spawnPointAwayFromPlayer() {
    // 优先用编辑器里玩家手标的出生点 (this._customSpawnPoints) — 轮询挑,加小抖动 + 碰撞验证
    const custom = this._customSpawnPoints;
    if (custom && custom.length) {
      if (this._customSpawnCursor == null) this._customSpawnCursor = 0;
      for (let i = 0; i < custom.length; i++) {
        const idx = (this._customSpawnCursor + i) % custom.length;
        const s = custom[idx];
        const jitter = 80;   // 大幅抖动 — 同一波就成扇形展开,不是一团
        let x = s.x + Phaser.Math.Between(-jitter, jitter);
        let y = s.y + Phaser.Math.Between(-jitter, jitter);
        // 抖动后若落进墙 → 找附近空地
        const free = this._findFreeNear(x, y, 80);
        if (!free) continue; // 该出生点周围 80px 内都是墙 → 跳过试下一个
        x = free.x; y = free.y;
        if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) > 160) {
          this._customSpawnCursor = (idx + 1) % custom.length;
          return { x, y };
        }
      }
      // 都被玩家盖住 / 都进墙 → 用当前 cursor 那个 (避免死锁),并强制找附近空地
      const s = custom[this._customSpawnCursor];
      this._customSpawnCursor = (this._customSpawnCursor + 1) % custom.length;
      const free = this._findFreeNear(s.x, s.y, 200) || { x: s.x, y: s.y };
      return free;
    }
    // 兜底:6 条固定生成线 (上/右/下 各 2 条) — 没标点也能玩
    if (!this._spawnLines) {
      const x0 = ISLAND.x0 * TILE; const y0 = ISLAND.y0 * TILE;
      const w = (ISLAND.x1 - ISLAND.x0 + 1) * TILE;
      const h = (ISLAND.y1 - ISLAND.y0 + 1) * TILE;
      const lx = (t) => x0 + Math.round(w * t);
      const ly = (t) => y0 + Math.round(h * t);
      // 上边/下边各取 x 的 1/3 + 2/3 两点;右边取 y 的 1/3 + 2/3 两点
      this._spawnLines = [
        { side: 'top',    x: lx(1 / 3), y: y0 },
        { side: 'top',    x: lx(2 / 3), y: y0 },
        { side: 'right',  x: x0 + w,    y: ly(1 / 3) },
        { side: 'right',  x: x0 + w,    y: ly(2 / 3) },
        { side: 'bottom', x: lx(1 / 3), y: y0 + h },
        { side: 'bottom', x: lx(2 / 3), y: y0 + h },
      ];
      this._spawnCursor = 0;
    }
    // 加抖动并轮询挑选,避免一条线被偏爱
    const tryOne = (line) => {
      const jitter = TILE;
      const x = line.x + Phaser.Math.Between(-jitter, jitter);
      const y = line.y + Phaser.Math.Between(-jitter, jitter);
      return { x, y, side: line.side };
    };
    // 最多扫一遍 6 条线找一个离玩家足够远的;都不行就用当前 cursor
    for (let i = 0; i < this._spawnLines.length; i++) {
      const line = this._spawnLines[(this._spawnCursor + i) % this._spawnLines.length];
      const p = tryOne(line);
      if (Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y) > 200) {
        this._spawnCursor = (this._spawnCursor + i + 1) % this._spawnLines.length;
        return p;
      }
    }
    const line = this._spawnLines[this._spawnCursor];
    this._spawnCursor = (this._spawnCursor + 1) % this._spawnLines.length;
    return tryOne(line);
  }

  onEnemyKilled(e) {
    this.kills += 1;
    const r = this.player.cdReducePerKill;
    if (r > 0) this.player.dashCdUntil -= r;
    if (e) this.dropGem(e.x, e.y, e.isBoss ? 12 : 1);
    if (e && e.isBoss && this.villageCore && !this.villageCore.destroyed) {
      this.villageCore.activate();
      this.announce('水晶塔已稳定，桥路开始回应', '#bff5ff');
    }
    // 无尽模式:达到击杀目标 → 通关
    if (this._mode === 'survival' && !this._victoryShown && this.kills >= this._killGoal) {
      this._victoryShown = true;
      this._onSurvivalVictory();
    }
  }

  _onSurvivalVictory() {
    this._peaceful = true; // 停止刷怪
    this.announce(`🏆 通关! 击杀达成 ${this._killGoal}`, '#ffe070');
    // 大型通告 2 秒后回主城
    this.time.delayedCall(2500, () => {
      // 把当前进度通过 deathShown 流程触发结算 (复用排行榜提交)
      if (this.showDeath) {
        this.player.dead = true;
        this.showDeath();
      } else {
        this.scene.start('HomeScene');
      }
    });
  }

  livingEnemies() {
    return this.enemies.getChildren().filter((e) => !e.dead).length;
  }

  announce(text, color) {
    const t = this.add.text(this.scale.width / 2, 90, text, {
      fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color,
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20000);
    this.tweens.add({ targets: t, alpha: 0, y: 70, duration: 1800, delay: 700, onComplete: () => t.destroy() });
  }

  // —— 肉鸽强化选择 ——
  showUpgrades() {
    this.choosing = true;
    const choices = this.getUpgradeChoices();
    this.currentChoices = choices;
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H / 2;
    const D = 30000;
    const ui = [];
    ui.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0, 0).setScrollFactor(0).setDepth(D));
    ui.push(this.add.text(cx, cy - 208, '选择强化', {
      fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color: '#ffd040', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));
    ui.push(this.add.text(cx, cy - 180, '按 1 / 2 / 3 选择', {
      fontFamily: 'monospace', fontSize: '14px', color: '#cfe9ff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));
    const cf = UI_FRAMES.card;
    const s = 0.62;
    const cw = cf.w * s;
    const ch = cf.h * s;
    const step = cw + 24;
    const rarTex = { common: 'ui-cardCommon', rare: 'ui-cardRare', legendary: 'ui-cardLegendary' };
    this.cardSlots = [];
    choices.forEach((u, i) => {
      const x = cx + (i - 1) * step;
      const y = cy + 12;
      ui.push(this.add.image(x, y, rarTex[u.rarity] || 'ui-cardCommon').setScale(s).setScrollFactor(0).setDepth(D + 1));
      if (u.icon) ui.push(this.add.image(x, y - ch * (0.5 - cf.iconY), `ui-icon-${u.icon}`).setScale(0.52).setScrollFactor(0).setDepth(D + 2));
      ui.push(this.add.text(x, y - ch * (0.5 - cf.numY), `${i + 1}`, {
        fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#ffe070', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
      ui.push(this.add.text(x, y - ch * (0.5 - cf.titleY), u.title, {
        fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#ffffff', align: 'center',
        stroke: '#000', strokeThickness: 3, wordWrap: { width: cw - 30 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
      ui.push(this.add.text(x, y - ch * (0.5 - cf.descY), u.desc, {
        fontFamily: 'monospace', fontSize: '12px', color: '#3a2614', align: 'center', wordWrap: { width: cw - 34 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
      this.cardSlots.push({ x, y, s });
    });
    this.upgradeUI = ui;
  }

  chooseUpgrade(i) {
    if (!this.choosing || !this.currentChoices[i]) return;
    const slot = this.cardSlots && this.cardSlots[i];
    if (slot) {
      const g = this.add.image(slot.x, slot.y, 'ui-cardGlow').setScale(slot.s * 1.05)
        .setScrollFactor(0).setDepth(30050).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: g, alpha: 0, duration: 280, onComplete: () => g.destroy() });
    }
    this.currentChoices[i].apply(this.player);
    this.upgradeUI.forEach((o) => o.destroy());
    this.upgradeUI = [];
    this.cardSlots = null;
    this.choosing = false;
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    Sfx.upgrade();
    this.refreshWeaponHud();
    this.refreshSkillHud();
  }

  addBuilding(key, destroyedKey, c, r, scale, baseW, baseH) {
    this.buildings.push(new Building(this, key, destroyedKey, c * TILE + 32, r * TILE + 32, scale, baseW, baseH));
  }

  // —— 小路 ——
  markPath(c, r) {
    const key = `${c},${r}`;
    if (this.pathCells.has(key)) return;
    this.pathCells.add(key);
    if (c < ISLAND.x0 || c > ISLAND.x1 || r < ISLAND.y0 || r > ISLAND.y1) return;
    // 用 island-kit path 件（石路 tile）。01 是基础方形地块，缩到 1 个 TILE。
    const img = this.add.image(c * TILE + TILE / 2, r * TILE + TILE / 2, 'ik-path-01')
      .setOrigin(0.5).setDepth(-49);
    img.setDisplaySize(TILE * 1.05, TILE * 1.05);
    // 边缘羽化：在 path 之上覆盖 path-edge-fade 让石路和草地软化过渡
    if (this.textures.exists('ik-path-edge-fade')) {
      this.add.image(c * TILE + TILE / 2, r * TILE + TILE / 2, 'ik-path-edge-fade')
        .setOrigin(0.5).setDepth(-48).setAlpha(0.65)
        .setDisplaySize(TILE * 1.15, TILE * 1.15);
    }
  }

  // ===== Painterly Island 地形构建（V2：草地无缝填充 + cliff 全套边缘） =====
  // 旧的 64px 瓷砖地面 + biome 区域已停用，全部由这一个方法接管。
  buildPainterlyIsland() {
    const x0 = ISLAND.x0 * TILE;
    const y0 = ISLAND.y0 * TILE;
    const w = (ISLAND.x1 - ISLAND.x0 + 1) * TILE;
    const h = (ISLAND.y1 - ISLAND.y0 + 1) * TILE;

    // 1) painterly 草地无缝铺底（tileSprite，自动平铺整个岛屿）
    this.add.tileSprite(x0, y0, w, h, 'ik-grass-base').setOrigin(0, 0).setDepth(-90);

    // 1.5) Biome 地貌区域：5 个分区各用 painterly 纹理覆盖（半透明叠加，与草地融合）
    // 区块尺寸沿用 WorldScene 早期的 5 区分布（村庄/森林/矿区/废墟/海岸）
    this._paintBiome(ISLAND.x0, ISLAND.y0, 14, 11, 'ik-biome-village', 0.85);
    this._paintBiome(22, ISLAND.y0, ISLAND.x1, 11, 'ik-biome-forest', 0.85);
    this._paintBiome(22, 15, ISLAND.x1, 23, 'ik-biome-mine', 0.85);
    this._paintBiome(ISLAND.x0, 15, 14, 23, 'ik-biome-ruins', 0.85);

    // 2) 随机点缀草地变体（A 带花、B 带土石），256×256 一格，按 256 网格随机几个
    const variantStep = 256;
    for (let py = y0; py < y0 + h; py += variantStep) {
      for (let px = x0; px < x0 + w; px += variantStep) {
        const roll = Math.random();
        if (roll < 0.15) {
          this.add.image(px, py, 'ik-grass-varA').setOrigin(0, 0).setDepth(-89);
        } else if (roll < 0.25) {
          this.add.image(px, py, 'ik-grass-varB').setOrigin(0, 0).setDepth(-89);
        }
      }
    }

    // 3) 岛屿四边 cliff 件铺设
    // 用 displaySize 把每段标准化，保证拼接整齐。
    // 顶边：用 tileSprite 让 Phaser 自动平铺，避免单件之间出现可见接缝
    const topH = 90;
    this.add.tileSprite(x0, y0 - topH * 0.55, w, topH, 'ik-cliff-top')
      .setOrigin(0, 0).setDepth(-35);
    // 底边：用既有 cliff-07（长条 1470×158）
    const botH = 100;
    const botTex = this.textures.get('ik-cliff-07');
    if (botTex && botTex.source && botTex.source[0]) {
      const cw = botTex.source[0].width;
      const ch = botTex.source[0].height;
      const scale = botH / ch;
      const pieceW = cw * scale;
      let x = x0;
      while (x < x0 + w) {
        this.add.image(x, y0 + h - botH * 0.5, 'ik-cliff-07').setOrigin(0, 0).setScale(scale).setDepth(-30);
        x += pieceW - 20; // 微重叠避免接缝
      }
    }
    // 左边：tiling cliff-left-edge（120×200）
    const leftW = 90; const leftH = 180;
    for (let y = y0; y < y0 + h; y += leftH) {
      const img = this.add.image(x0 - leftW * 0.55, y, 'ik-cliff-left').setOrigin(0, 0).setDepth(-32);
      img.setDisplaySize(leftW, leftH + 6);
    }
    // 右边：tiling cliff-right-edge
    for (let y = y0; y < y0 + h; y += leftH) {
      const img = this.add.image(x0 + w - leftW * 0.45, y, 'ik-cliff-right').setOrigin(0, 0).setDepth(-32);
      img.setDisplaySize(leftW, leftH + 6);
    }
    // 4 个外凸转角，盖在边的接缝之上
    const cornerSize = 120;
    this.add.image(x0 - leftW * 0.5, y0 - topH * 0.5, 'ik-cliff-tl').setOrigin(0, 0).setDepth(-25)
      .setDisplaySize(cornerSize, cornerSize);
    this.add.image(x0 + w - cornerSize + leftW * 0.5, y0 - topH * 0.5, 'ik-cliff-tr').setOrigin(0, 0).setDepth(-25)
      .setDisplaySize(cornerSize, cornerSize);
    this.add.image(x0 - leftW * 0.5, y0 + h - cornerSize + topH * 0.5, 'ik-cliff-bl').setOrigin(0, 0).setDepth(-25)
      .setDisplaySize(cornerSize, cornerSize);
    this.add.image(x0 + w - cornerSize + leftW * 0.5, y0 + h - cornerSize + topH * 0.5, 'ik-cliff-br').setOrigin(0, 0).setDepth(-25)
      .setDisplaySize(cornerSize, cornerSize);

    // 4) 景观地标（5 处）—— 散在岛屿各区，让地图有"地方感"
    // targetH 是显示在画面上的目标高度（不是原图高度）；mushroom-grove 原图大，整体压缩
    this._placeLandmark(12 * TILE, 3 * TILE,  'ik-landmark-windmill',         110);  // 村庄区：风车（挪到右上空地，远离城堡）
    this._placeLandmark(31 * TILE, 4 * TILE,  'ik-landmark-stone-arch',       110);  // 森林入口：石拱门
    this._placeLandmark(34 * TILE, 19 * TILE, 'ik-landmark-crystal-cluster',  90);   // 矿区：水晶簇
    this._placeLandmark(5 * TILE,  20 * TILE, 'ik-landmark-shrine',           95);   // 废墟：神龛
    this._placeLandmark(18 * TILE, 22 * TILE, 'ik-landmark-mushroom-grove',   100);  // 海岸：蘑菇丛

    // 5) 海岸 foam 循环动画（4 边各取若干点）
    this._placeShoreFoam();
    // 自然小件撒点已挪到 create 末尾，因为它依赖 pathCells + solids 都就位
  }

  // —— 过桥状态恢复 ——
  _restoreCarryState(s) {
    this.elapsed = s.elapsed || 0;
    this.kills = s.kills || 0;
    this.level = s.level || 1;
    this.xp = s.xp || 0;
    this.xpToNext = s.xpToNext || 5;
    this.gold = s.gold || 0;
    this.ownedEquip = s.ownedEquip || {};
    if (Array.isArray(s.weapons) && s.weapons.length) {
      this.weapons = s.weapons.map((w) => ({ ...w, cdLeft: 200 }));
    }
    // Player 属性
    const p = this.player;
    if (s.player) {
      Object.assign(p, {
        maxHp: s.player.maxHp ?? p.maxHp,
        hp: Math.min(s.player.maxHp ?? p.maxHp, s.player.hp ?? p.hp),
        dmg: s.player.dmg ?? p.dmg,
        speed: s.player.speed ?? p.speed,
        critChance: s.player.critChance ?? p.critChance,
        critDmg: s.player.critDmg ?? p.critDmg,
        lifesteal: s.player.lifesteal ?? p.lifesteal,
        haste: s.player.haste ?? p.haste,
        goldMult: s.player.goldMult ?? p.goldMult,
        pickupRange: s.player.pickupRange ?? p.pickupRange,
        evoTier: s.player.evoTier ?? 1,
        animPrefix: s.player.animPrefix || 'warrior-blue',
      });
      if (s.player.equipment) p.equipment = s.player.equipment;
      p.play(p.anim('idle'));
    }
  }

  _serializeCarryState() {
    const p = this.player;
    return {
      elapsed: this.elapsed, kills: this.kills,
      level: this.level, xp: this.xp, xpToNext: this.xpToNext,
      gold: this.gold, ownedEquip: this.ownedEquip,
      weapons: this.weapons.map(({ key, level, evolved }) => ({ key, level, evolved })),
      player: {
        maxHp: p.maxHp, hp: p.hp, dmg: p.dmg, speed: p.speed,
        critChance: p.critChance, critDmg: p.critDmg,
        lifesteal: p.lifesteal, haste: p.haste, goldMult: p.goldMult,
        pickupRange: p.pickupRange, evoTier: p.evoTier, animPrefix: p.animPrefix,
        equipment: p.equipment,
      },
    };
  }

  // —— 在岛屿右边缘放一座桥，玩家走上去 → 切场景到下一岛 ——
  _placeBridgeToNextIsland() {
    const bridgeX = (ISLAND.x1 - 1) * TILE + 32;
    const bridgeY = Math.floor((ISLAND.y0 + ISLAND.y1) / 2) * TILE + 32;
    // 视觉：用 ik-path-01 拼出 4 格桥面（先用现有件，等 Codex 出桥再换）
    for (let i = 0; i < 4; i++) {
      this.add.image(bridgeX + i * TILE, bridgeY, 'ik-path-01')
        .setOrigin(0.5).setDepth(-49).setDisplaySize(TILE + 4, TILE + 4);
    }
    // 桥头牌子
    this.add.text(bridgeX + 2 * TILE, bridgeY - 50, `→ ${ISLANDS[nextIslandIdx(this._islandIdx)].name}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffe070',
      backgroundColor: '#2a1d10cc', padding: { x: 6, y: 3 }, stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(99980);
    // 触发区(物理 zone)，玩家进入 → 过场切到下一岛
    const zone = this.add.zone(bridgeX + 3 * TILE, bridgeY, TILE * 1.5, TILE * 1.5);
    this.physics.add.existing(zone, true);
    this.physics.add.overlap(this.player, zone, () => {
      if (this._transitioning) return;
      this._transitioning = true;
      const next = nextIslandIdx(this._islandIdx);
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(420, () => {
        this.scene.start('WorldScene', { islandIdx: next, playerState: this._serializeCarryState() });
      });
    });
  }

  // 踏区抬高：玩家进入"可踏高台区"时,把深度抬高(渲染到高台件之上)，营造"站到高台上"的错觉
  _applyStepDepth() {
    const base = this.player.y + FEET_DEPTH;
    const zones = this._stepZones;
    let onStep = false;
    if (zones && zones.length) {
      const px = this.player.x; const py = this.player.y;
      for (const z of zones) {
        if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) { onStep = true; break; }
      }
    }
    // 在踏区内 → 深度额外 +400（盖过同区域的高台/台阶贴图，看起来站上去了）
    this.player.setDepth(onStep ? base + 400 : base);
  }

  // —— 自然小件撒点 ——
  _scatterNature(count) {
    const natKeys = [
      'ik-nature-mushroom-red', 'ik-nature-mushroom-brown', 'ik-nature-mushroom-blue',
      'ik-nature-flower-cluster-A', 'ik-nature-flower-cluster-B', 'ik-nature-flower-cluster-C',
      'ik-nature-grass-tuft-A', 'ik-nature-grass-tuft-B',
      'ik-nature-fallen-log', 'ik-nature-vines-A',
    ].filter((k) => this.textures.exists(k));
    if (!natKeys.length) return;
    let placed = 0; let tries = 0;
    while (placed < count && tries < count * 6) {
      tries++;
      const c = Phaser.Math.Between(ISLAND.x0 + 1, ISLAND.x1 - 1);
      const r = Phaser.Math.Between(ISLAND.y0 + 1, ISLAND.y1 - 1);
      if (this.isPath(c, r)) continue;
      const x = c * TILE + Phaser.Math.Between(8, 56);
      const y = r * TILE + Phaser.Math.Between(8, 56);
      // 避开已存在的碰撞物
      let collide = false;
      this.solids.getChildren().forEach((s) => {
        if (collide) return;
        if (Phaser.Math.Distance.Between(s.x, s.y, x, y) < 40) collide = true;
      });
      if (collide) continue;
      const key = natKeys[Phaser.Math.Between(0, natKeys.length - 1)];
      const img = this.add.image(x, y, key).setOrigin(0.5, 0.85).setDepth(y);
      // 自然小件目标高 ~36px(原图 60-96px)，统一缩到地表点缀大小
      img.setScale(Math.min(1, 36 / Math.max(img.height || 64, 1)));
      placed++;
    }
  }

  // —— Biome 纹理覆盖 ——
  _paintBiome(c0, r0, c1, r1, texKey, alpha = 0.85) {
    if (!this.textures.exists(texKey)) return;
    const x = c0 * TILE; const y = r0 * TILE;
    const w = (c1 - c0 + 1) * TILE; const h = (r1 - r0 + 1) * TILE;
    this.add.tileSprite(x, y, w, h, texKey).setOrigin(0, 0).setAlpha(alpha).setDepth(-87);
  }

  // —— 景观地标 ——
  _placeLandmark(x, y, texKey, targetH = 180) {
    if (!this.textures.exists(texKey)) return;
    const img = this.add.image(x, y, texKey).setOrigin(0.5, 0.85).setDepth(y);
    img.setScale(Math.min(1, targetH / img.height));
    // 加碰撞（地标都是实体）
    this.addSolid(x, y - 8, 60, 28);
  }

  // —— 海岸 foam 动画点缀 ——
  _placeShoreFoam() {
    if (!this.anims.exists('ik-water-foam')) return;
    const x0 = ISLAND.x0 * TILE; const y0 = ISLAND.y0 * TILE;
    const w = (ISLAND.x1 - ISLAND.x0 + 1) * TILE; const h = (ISLAND.y1 - ISLAND.y0 + 1) * TILE;
    const spots = [
      // 4 边随机几个点（避免太多影响性能）
      [x0 + w * 0.2, y0 - 30], [x0 + w * 0.6, y0 - 30],
      [x0 + w * 0.3, y0 + h + 30], [x0 + w * 0.75, y0 + h + 30],
      [x0 - 30, y0 + h * 0.3], [x0 - 30, y0 + h * 0.7],
      [x0 + w + 30, y0 + h * 0.4], [x0 + w + 30, y0 + h * 0.8],
    ];
    spots.forEach(([sx, sy], i) => {
      const spr = this.add.sprite(sx, sy, 'ik-water-foam', 0).setDepth(-95).setAlpha(0.85);
      spr.setScale(0.7);
      // 各点 phase 错开
      this.time.delayedCall(i * 220, () => { if (spr.active) spr.play('ik-water-foam'); });
    });
  }

  addPath(c0, r0, c1, r1, w = 1) {
    const half = Math.floor(w / 2);
    const cs = Math.min(c0, c1); const ce = Math.max(c0, c1);
    for (let c = cs; c <= ce; c++) for (let o = -half; o <= half; o++) this.markPath(c, r0 + o);
    const rs = Math.min(r0, r1); const re = Math.max(r0, r1);
    for (let r = rs; r <= re; r++) for (let o = -half; o <= half; o++) this.markPath(c1 + o, r);
  }

  isPath(c, r) { return this.pathCells.has(`${c},${r}`); }

  // —— 障碍/装饰放置 ——
  // Island Kit 选件辅助：从指定类别里随机取一个件名
  // 自动跳过 IK_BLACKLIST 中的损坏件（auto-crop 失败导致内容残缺/混入碎片）
  ikPick(cat, indices) {
    const pool = indices.filter((i) => !(IK_BLACKLIST[cat] && IK_BLACKLIST[cat].includes(i)));
    if (!pool.length) return `ik-${cat}-01`; // 兜底
    const i = pool[Phaser.Math.Between(0, pool.length - 1)];
    return `ik-${cat}-${String(i).padStart(2, '0')}`;
  }

  placeTree(c, r) {
    if (this.isPath(c, r)) return;
    const x = c * TILE + TILE / 2; const y = r * TILE + TILE / 2;
    // forest-01 是大林海(不要单独用)；2-13 范围是单棵树/小灌
    const img = this.add.image(x, y, this.ikPick('forest', [3, 4, 5, 6, 7, 8, 9, 10]))
      .setOrigin(0.5, 0.85).setDepth(y);
    // 自适应缩放：让树高约 100px
    img.setScale(Math.min(1, 100 / img.height));
    this.addSolid(x, y + 6, 28, 18);
  }

  placeBush(c, r) {
    if (this.isPath(c, r)) return;
    const x = c * TILE + 20; const y = r * TILE + 40;
    // 灌木/花丛 11-25 范围（重切后全部可用）
    const img = this.add.image(x, y, this.ikPick('forest', [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]))
      .setOrigin(0.5, 0.75).setDepth(y);
    img.setScale(Math.min(1, 60 / Math.max(img.width, img.height)));
    this.addSolid(x, y + 16, 30, 14);
  }

  placeRock(c, r) {
    if (this.isPath(c, r)) return;
    const x = c * TILE + 30; const y = r * TILE + 44;
    // forest 后段是石头/海岸石 26-40（全部可用）
    const img = this.add.image(x, y, this.ikPick('forest', [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40]))
      .setOrigin(0.5, 0.78).setDepth(y);
    img.setScale(Math.min(1, 70 / Math.max(img.width, img.height)));
    this.addSolid(x, y + 4, 40, 22);
  }

  placeGold(c, r) {
    if (this.isPath(c, r)) return;
    const x = c * TILE + 32; const y = r * TILE + 40;
    this.add.image(x, y, `gold${Phaser.Math.Between(1, 3)}`).setOrigin(0.5, 0.7).setScale(0.6).setDepth(y);
    this.addSolid(x, y, 40, 22);
  }

  placeStump(c, r) { // 纯装饰，无碰撞
    const x = c * TILE + 32; const y = r * TILE + 40;
    // 用花/小蘑菇当装饰点缀
    const img = this.add.image(x, y, this.ikPick('forest', [19, 20, 21, 22, 23, 24, 25]))
      .setOrigin(0.5, 0.85).setDepth(y);
    img.setScale(Math.min(1, 48 / Math.max(img.width, img.height)));
  }

  ruinDecor(c, r, key, scale) { // 倒塌建筑残骸（带碰撞）
    const x = c * TILE + 32; const y = r * TILE + 32;
    this.add.image(x, y, key).setOrigin(0.5, 0.92).setScale(scale).setDepth(y);
    this.addSolid(x, y - 16, 70, 30);
  }

  makeWanderer(sprite, range) {
    const home = { x: sprite.x, y: sprite.y };
    const step = () => {
      if (!sprite.active) return;
      const tx = home.x + Phaser.Math.Between(-range, range);
      const ty = home.y + Phaser.Math.Between(-range, range);
      sprite.setFlipX(tx < sprite.x);
      this.tweens.add({
        targets: sprite, x: tx, y: ty, duration: Phaser.Math.Between(1400, 2600), ease: 'Sine.inOut',
        onComplete: () => this.time.delayedCall(Phaser.Math.Between(500, 1800), step),
      });
    };
    this.time.delayedCall(Phaser.Math.Between(0, 1500), step);
  }

  // —— 区域 ——
  addVillageArea() {
    // 村庄中心地标：城堡 + 房屋（均可破坏）
    this.addBuilding('castle', 'castle_destroyed', 7, 4, 0.7, 150, 40);
    this.addBuilding('house', 'house_destroyed', 4, 7, 0.7, 78, 34);
    this.addBuilding('house', 'house_destroyed', 12, 5, 0.7, 78, 34);
    this.addBuilding('house', 'house_destroyed', 13, 9, 0.7, 78, 34);
    this.addBuilding('tower', 'tower_destroyed', 5, 10, 0.7, 60, 36);

    // 商店 NPC
    const npcX = 10 * TILE + 30; const npcY = 8 * TILE + 40;
    this.shopNpc = this.add.sprite(npcX, npcY, 'pawn-idle').setOrigin(0.5, 0.82).setScale(0.8).setDepth(npcY).play('pawn-idle');
    this.add.text(npcX, npcY - 64, '商店', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffe070', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9000);
    this.shopPrompt = this.add.text(npcX, npcY - 46, '按 B 购买', {
      fontFamily: 'monospace', fontSize: '12px', color: '#fff', backgroundColor: '#000000aa', padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(9000).setVisible(false);
    this.shopOpen = false;

    // 漫步村民 + 羊
    [[6, 9], [13, 7]].forEach(([c, r]) => {
      const p = this.add.sprite(c * TILE + 30, r * TILE + 40, 'pawn-idle').setOrigin(0.5, 0.82).setScale(0.7).setDepth(r * TILE + 40).play('pawn-idle');
      this.makeWanderer(p, 26);
    });
    [[8, 10], [11, 10]].forEach(([c, r]) => {
      const s = this.add.sprite(c * TILE + 30, r * TILE + 40, 'sheep-idle').setOrigin(0.5, 0.8).setScale(0.6).setDepth(r * TILE + 40).play('sheep-idle');
      this.makeWanderer(s, 24);
    });
    [[5, 6], [11, 7]].forEach(([c, r]) => this.placeBush(c, r));
  }

  addForestArea() {
    [[25, 3], [27, 4], [29, 3], [31, 5], [33, 4], [35, 3], [26, 6], [30, 7], [34, 7],
      [36, 5], [24, 8], [28, 9], [32, 9], [35, 10], [27, 11], [31, 12], [34, 12], [25, 10]]
      .forEach(([c, r]) => this.placeTree(c, r));
    [[26, 3], [30, 5], [33, 8], [28, 7], [36, 9], [24, 5]].forEach(([c, r]) => this.placeBush(c, r));
    [[29, 11], [33, 6], [26, 9]].forEach(([c, r]) => this.placeStump(c, r));
    // 林中漫步羊
    const s = this.add.sprite(30 * TILE + 30, 10 * TILE + 40, 'sheep-idle').setOrigin(0.5, 0.8).setScale(0.6).setDepth(10 * TILE + 40).play('sheep-idle');
    this.makeWanderer(s, 30);
  }

  addMineArea() {
    // 地标：金矿
    this.add.image(31 * TILE + 32, 18 * TILE + 24, 'goldmine').setOrigin(0.5, 0.7).setScale(0.95).setDepth(18 * TILE + 30);
    this.addSolid(31 * TILE + 32, 18 * TILE + 20, 92, 32);
    // 地标：洞穴入口
    this.add.image(35 * TILE + 32, 22 * TILE + 24, 'cave').setOrigin(0.5, 0.7).setScale(0.95).setDepth(22 * TILE + 30);
    this.addSolid(35 * TILE + 32, 22 * TILE + 20, 92, 30);
    [[29, 17], [30, 19], [28, 20], [33, 16], [34, 19], [32, 22]].forEach(([c, r]) => this.placeGold(c, r));
    [[27, 16], [36, 17], [29, 23], [33, 24], [37, 21], [30, 15]].forEach(([c, r]) => this.placeRock(c, r));
  }

  addRuinArea() {
    // 地标：废墟营地（倒塌城堡 + 房屋 + 塔）
    this.ruinDecor(7, 19, 'castle_destroyed', 0.7);
    this.ruinDecor(4, 22, 'house_destroyed', 0.7);
    this.ruinDecor(11, 21, 'house_destroyed', 0.7);
    this.ruinDecor(10, 17, 'tower_destroyed', 0.7);
    [[5, 18], [12, 19], [6, 24], [10, 23], [3, 20], [8, 24]].forEach(([c, r]) => this.placeRock(c, r));
    [[6, 21], [9, 18]].forEach(([c, r]) => this.placeStump(c, r));
  }

  addCoastArea() {
    // 地标：木桥码头（向南伸入水面）——作为地板层，置于角色之下
    [[20, 24, 3], [20, 25, 6], [20, 26, 9]].forEach(([c, r, frame]) => {
      this.add.image(c * TILE, r * TILE, 'bridge', frame).setOrigin(0, 0).setDepth(-45);
    });
    // 水中礁石（装饰，无碰撞）
    [[5, 26], [9, 27], [14, 26], [26, 27], [31, 26], [35, 27]].forEach(([c, r], i) => {
      this.add.image(c * TILE + 32, r * TILE + 32, i % 2 ? 'waterrock2' : 'waterrock1', 0)
        .setOrigin(0.5, 0.6).setScale(0.9).setDepth(r * TILE);
    });
    [[16, 24], [24, 24]].forEach(([c, r]) => this.placeBush(c, r));
  }

  // 海岸泡沫（岛屿外圈水面，动画）
  addFoam() {
    const place = (c, r) => {
      const f = this.add.sprite(c * TILE + TILE / 2, r * TILE + TILE / 2, 'foam')
        .setScale(0.5).setDepth(-60).setAlpha(0.85);
      f.play('foam');
      f.anims.setProgress(Math.random());
    };
    for (let c = ISLAND.x0; c <= ISLAND.x1; c++) { place(c, ISLAND.y0 - 1); place(c, ISLAND.y1 + 1); }
    for (let r = ISLAND.y0; r <= ISLAND.y1; r++) { place(ISLAND.x0 - 1, r); place(ISLAND.x1 + 1, r); }
  }

  // —— 区域地表色彩分层 ——
  // 生成地表纹理层，直接使用 image2 生成后压成 64x64 的可平铺素材。
  addRegionTerrain(x0, y0, x1, y1, texture, alpha = 1) {
    const w = (x1 - x0 + 1) * TILE;
    const h = (y1 - y0 + 1) * TILE;
    this.add.tileSprite(x0 * TILE, y0 * TILE, w, h, texture)
      .setOrigin(0, 0)
      .setAlpha(alpha)
      .setDepth(-49.6);
  }

  // 半透明色块 wash，覆盖在草地之上、装饰与角色之下
  addRegionTint(x0, y0, x1, y1, color, alpha) {
    const w = (x1 - x0 + 1) * TILE; const h = (y1 - y0 + 1) * TILE;
    this.add.rectangle(x0 * TILE, y0 * TILE, w, h, color, alpha).setOrigin(0, 0).setDepth(-49.4);
  }

  // 小块地表斑块（沙/苔/碎石感），略高于色块层
  addGroundPatch(c, r, color, alpha = 0.3) {
    if (this.isPath(c, r)) return;
    const s = Phaser.Math.Between(40, 64);
    this.add.rectangle(c * TILE + 32 + Phaser.Math.Between(-8, 8), r * TILE + 32 + Phaser.Math.Between(-8, 8), s, s, color, alpha)
      .setDepth(-47);
  }

  // 在区域内稀疏点缀小装饰（纯装饰无碰撞）
  zoneDeco(x0, y0, x1, y1, count, scaleLo = 0.55, scaleHi = 0.85) {
    for (let i = 0; i < count; i++) {
      const c = Phaser.Math.Between(x0, x1);
      const r = Phaser.Math.Between(y0, y1);
      if (this.isPath(c, r)) continue;
      this.add.image(c * TILE + Phaser.Math.Between(8, 56), r * TILE + Phaser.Math.Between(22, 56), `deco${Phaser.Math.Between(1, 15)}`)
        .setOrigin(0.5, 0.8).setScale(Phaser.Math.FloatBetween(scaleLo, scaleHi)).setDepth(r * TILE + 30);
    }
  }

  decorateVillageArea() { // 西北：暖亮、干净
    this.addRegionTint(ISLAND.x0, ISLAND.y0, 14, 11, 0xffd36a, 0.06);
    this.zoneDeco(3, 3, 13, 10, 6);
    this.add.image(13 * TILE + 32, 11 * TILE + 40, 'scarecrow').setOrigin(0.5, 0.85).setScale(0.6).setDepth(11 * TILE + 40);
  }

  decorateForestArea() { // 东北：冷绿、茂密
    this.addRegionTint(22, ISLAND.y0, ISLAND.x1, 11, 0x0f352d, 0.08);
    for (let i = 0; i < 6; i++) this.addGroundPatch(Phaser.Math.Between(23, 36), Phaser.Math.Between(3, 11), 0x14402d, 0.16);
    this.zoneDeco(22, 3, 36, 11, 14, 0.6, 0.95);
  }

  decorateMineArea() { // 东南：暖沙赭石、碎石多
    this.addRegionTint(22, 15, ISLAND.x1, 23, 0xffb14a, 0.07);
    for (let i = 0; i < 10; i++) this.addGroundPatch(Phaser.Math.Between(23, 37), Phaser.Math.Between(15, 23), 0xb07e2c, 0.28);
    [[24, 16], [26, 21], [35, 17], [29, 23]].forEach(([c, r]) => this.placeRock(c, r));
  }

  decorateRuinArea() { // 西南：灰绿苔、石块多
    this.addRegionTint(ISLAND.x0, 15, 14, 23, 0x64715f, 0.07);
    for (let i = 0; i < 10; i++) this.addGroundPatch(Phaser.Math.Between(3, 13), Phaser.Math.Between(15, 23), 0x596356, 0.28);
    [[4, 16], [12, 22], [3, 23]].forEach(([c, r]) => this.placeRock(c, r));
  }

  decorateCoastArea() { // 南缘：浅水蓝、湿润、干净
    this.addRegionTint(ISLAND.x0, 24, ISLAND.x1, ISLAND.y1, 0x8ee8f0, 0.08);
  }

  // —— 投射物 ——
  fireProjectile(type, x, y, tx, ty) {
    if (type === 'arrow') this.shootArrow(x, y, tx, ty);
    else this.throwDynamite(x, y, tx, ty);
  }

  throwDynamite(x, y, tx, ty) {
    const d = this.physics.add.sprite(x + (tx >= x ? 18 : -18), y - 18, 'dynamite').setScale(0.8).setDepth(99990);
    d.body.setAllowGravity(false);
    d.play('dynamite-spin');
    this.physics.moveTo(d, tx, ty, 260);
    Sfx.arrow();
    this.time.delayedCall(820, () => this.explodeDynamite(d));
  }

  explodeDynamite(d) {
    if (!d.active) return;
    const { x, y } = d;
    d.destroy();
    playFx(this, 'fx-explosion', x, y, { scale: 1.1 });
    this.cameras.main.shake(110, 0.0028);
    if (!this.player.dead && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= DYNAMITE_RADIUS) {
      this.player.takeDamage(DYNAMITE_DMG);
    }
  }

  shootArrow(x, y, tx, ty) {
    const sx = x + (tx >= x ? 18 : -18);
    const sy = y - 18;
    const a = Math.atan2(ty - sy, tx - sx);
    // 先用组工厂创建再设速度（add() 会重置速度，导致箭飞不出去）
    const arrow = this.arrows.create(sx, sy, 'arrow-red');
    arrow.setScale(0.9).setDepth(99990);
    arrow.body.setAllowGravity(false);
    arrow.setRotation(a);
    // 沿瞄准方向直线飞行（更快、射程更远），保证能追上移动中的英雄
    const SPEED = 460;
    arrow.body.setVelocity(Math.cos(a) * SPEED, Math.sin(a) * SPEED);
    Sfx.arrow();
    this.time.delayedCall(2500, () => arrow.active && arrow.destroy());
  }

  // —— 金币 ——
  // 地面只保留能量块（经验晶体）；金币不再掉落金块，击杀后直接结算到计数。
  dropGold(x, y, bonus = 0) {
    let n = Phaser.Math.Between(GOLD_DROP_MIN, GOLD_DROP_MAX) + bonus;
    n = Math.round(n * this.player.goldMult);
    if (n <= 0) return;
    this.gold += n;
    if (this.goldText) this.goldText.setText(`${this.gold}`);
  }

  spawnClouds(worldW, worldH) {
    for (let i = 0; i < 4; i++) {
      const key = i % 2 === 0 ? 'cloud1' : 'cloud2';
      const c = this.add.image(Phaser.Math.Between(0, worldW), Phaser.Math.Between(0, worldH), key)
        .setAlpha(0.28).setScale(0.9).setDepth(9000).setScrollFactor(0.7);
      this.tweens.add({
        targets: c, x: c.x + worldW, duration: Phaser.Math.Between(40000, 70000),
        repeat: -1, onRepeat: () => { c.x = -300; },
      });
    }
  }

  shoreSplash() {
    const edge = Phaser.Math.Between(0, 3);
    let c; let r;
    if (edge === 0) { c = Phaser.Math.Between(ISLAND.x0, ISLAND.x1); r = ISLAND.y0; }
    else if (edge === 1) { c = Phaser.Math.Between(ISLAND.x0, ISLAND.x1); r = ISLAND.y1; }
    else if (edge === 2) { c = ISLAND.x0; r = Phaser.Math.Between(ISLAND.y0, ISLAND.y1); }
    else { c = ISLAND.x1; r = Phaser.Math.Between(ISLAND.y0, ISLAND.y1); }
    const x = c * TILE + (edge === 2 ? -28 : edge === 3 ? TILE + 28 : 32);
    const y = r * TILE + (edge === 0 ? -28 : edge === 1 ? TILE + 28 : 32);
    playFx(this, 'fx-splash', x, y, { scale: 0.6, depth: -40 });
  }

  addSolid(x, y, w, h) {
    const rect = this.add.rectangle(x, y, w, h, 0xff0000, 0).setOrigin(0.5, 0.5);
    this.physics.add.existing(rect, true);
    this.solids.add(rect);
    return rect;
  }

  // 圆形碰撞体 — 比矩形对玩家圆体更"滑",不会卡阶梯凹角
  addSolidCircle(cx, cy, radius) {
    // 用 Phaser Arcade staticBody 静态圆:add.circle + setCircle(radius)
    const c = this.add.circle(cx, cy, radius, 0xff0000, 0).setOrigin(0.5, 0.5);
    this.physics.add.existing(c, true);
    if (c.body && c.body.setCircle) c.body.setCircle(radius);
    this.solids.add(c);
    return c;
  }

  // 给一个矩形区域,返回一串"覆盖该区域"的圆 — 长边方向重叠排列
  // 短边方向用直径填满
  addSolidAsCircles(x, y, w, h) {
    const r = Math.floor(Math.min(w, h) / 2);
    if (r < 4) return [this.addSolid(x + w / 2, y + h / 2, w, h)]; // 太小直接矩形
    const list = [];
    if (w >= h) {
      // 横向排,圆心 Y 居中,X 从 x+r 到 x+w-r 均匀分布
      const span = w - r * 2;
      const count = Math.max(1, Math.floor(span / r) + 1);
      const step = count > 1 ? span / (count - 1) : 0;
      for (let i = 0; i < count; i++) {
        list.push(this.addSolidCircle(x + r + step * i, y + h / 2, r));
      }
    } else {
      const span = h - r * 2;
      const count = Math.max(1, Math.floor(span / r) + 1);
      const step = count > 1 ? span / (count - 1) : 0;
      for (let i = 0; i < count; i++) {
        list.push(this.addSolidCircle(x + w / 2, y + r + step * i, r));
      }
    }
    return list;
  }

  // —— 带框图集填充条（origin 左-中，靠 setCrop 按比例收缩）——
  uiBar(key, leftX, centerY, dispW, dispH, depth) {
    const img = this.add.image(leftX, centerY, key).setOrigin(0, 0.5).setScrollFactor(0).setDepth(depth);
    img._tw = img.width; img._th = img.height;
    img.setScale(dispW / img._tw, dispH / img._th);
    img.setCrop(0, 0, img._tw, img._th);
    return img;
  }

  setUiBar(img, ratio) {
    if (!img) return;
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    img.setCrop(0, 0, Math.max(0.001, img._tw * r), img._th);
  }

  buildHud() {
    // 画布 HUD 已被 HTML overlay 完全取代，此方法保留为空 no-op
    // 仅用于让 _onResize / checkHudViewport 等旧路径调用不报错
    if (this.hud) this.hud.update({}); // 触发 overlay 同步一次
    return;
  }

  _onResize() {
    // 防抖：缩放过程中频繁触发，延后到下一帧统一重建
    if (this._resizePending) return;
    this._resizePending = true;
    this.time.delayedCall(60, () => {
      this._resizePending = false;
      if (this.scene.isActive()) this.buildHud();
    });
  }

  // 兜底：每帧检查相机视口是否与 HUD 构建时尺寸不同（涵盖 scale resize 没触发的情形，如浏览器缩放）
  // 用与 buildHud 完全相同的尺寸源（canvas.getBoundingClientRect）做触发判断，
  // 否则 cam 报旧值但 canvas 真实大小变了 → 永远不触发重建（之前一直没修干净的根因）。
  checkHudViewport() {
    const canvas = this.sys && this.sys.game && this.sys.game.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (!w || !h || w < 200 || h < 150) return; // 异常尺寸不动作
    const noHud = !this._hudObjects || this._hudObjects.length === 0;
    const sizeChanged = this._hudBuildW !== w || this._hudBuildH !== h;
    if (!noHud && !sizeChanged) return;
    if (this._resizePending) return;
    this._resizePending = true;
    this.time.delayedCall(60, () => {
      this._resizePending = false;
      if (this.scene.isActive()) this.buildHud();
    });
  }

  // 技能栏：完全用代码绘制槽位，不依赖任何图集 / 单图，保证一定显示。
  // 有 skill-slot.png（纹理键 ui-skillSlot）时优先用美术，否则用代码圆角方块。
  buildHotbar(W, H) {
    const reg = (o) => { (this._hudObjects || (this._hudObjects = [])).push(o); return o; };
    const DEPTH = 10020;
    const SLOT = 72;
    const GAP = 10;
    const COUNT = 6;
    const totalW = COUNT * SLOT + (COUNT - 1) * GAP;
    const firstCx = W / 2 - totalW / 2 + SLOT / 2; // 第一个槽位中心
    // 留出底部操作提示与浏览器安全区。这里用浏览器真实高度兜底：
    // 某些 resize 时相机高度会短暂大于实际可见 canvas，导致技能栏只露上半截。
    const visibleH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : H;
    const cy = Math.max(96, Math.min(H, visibleH) - 120);
    const slotTex = this.textures.exists('ui-skillSlot') ? 'ui-skillSlot' : null;

    // （之前的暗色底板兜底已删除：金属圆环槽稳定显示后，底板只会造成视觉拥挤、装饰重叠拖尾）

    // 调试红框：确认是位置问题还是资源问题
    if (HOTBAR_DEBUG) {
      reg(this.add.rectangle(W / 2, H - 80, 520, 90, 0xff0000, 0.25)
        .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH - 1));
    }

    this.hotIconSize = SLOT * 0.66;
    this.hotSlotR = SLOT / 2;
    this.hotSlots = [];
    for (let i = 0; i < COUNT; i++) {
      const cx = firstCx + i * (SLOT + GAP);
      // 槽位底：先画代码兜底圆环，再叠美术。这样不会因为透明图/加载问题完全不可见。
      const g = reg(this.add.graphics().setScrollFactor(0).setDepth(DEPTH - 1));
      g.fillStyle(0x171b24, 0.94);
      g.fillCircle(cx, cy, SLOT * 0.42);
      g.lineStyle(4, 0x5d4a2d, 1);
      g.strokeCircle(cx, cy, SLOT * 0.44);
      g.lineStyle(2, 0xd3ae57, 0.95);
      g.strokeCircle(cx, cy, SLOT * 0.36);
      if (slotTex) {
        reg(this.add.image(cx, cy, slotTex).setDisplaySize(SLOT, SLOT)
          .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH));
      }
      // 图标占位（用一定存在的纹理建立，刷新时再换；缺失则隐藏，不崩溃）
      const icon = reg(this.add.image(cx, cy, 'ui-icon-dash')
        .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3).setVisible(false));
      const keyT = reg(this.add.text(cx - SLOT / 2 + 5, cy - SLOT / 2 + 3, '', {
        fontFamily: 'monospace', fontSize: '14px', color: '#cfe9ff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 4));
      const lvlT = reg(this.add.text(cx + SLOT / 2 - 5, cy + SLOT / 2 - 3, '', {
        fontFamily: 'monospace', fontSize: '14px', color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
      }).setOrigin(1, 1).setScrollFactor(0).setDepth(DEPTH + 4));
      this.hotSlots.push({ cx, cy, r: SLOT / 2, icon, keyT, lvlT });
    }

    // 冷却扇形遮罩：盖在图标之上、文字之下
    this.cdGraphics = reg(this.add.graphics().setScrollFactor(0).setDepth(DEPTH + 3));

    // eslint-disable-next-line no-console
    console.log('hotbar ready', this.hotSlots.length);
  }

  // 生成一个「跟随英雄」的特效精灵：动画播完自动销毁，期间每帧贴着英雄
  attachFxToPlayer(key, opts = {}) {
    const { dy = 0, dx = 0, scale = 1 } = opts;
    const spr = this.add.sprite(this.player.x + dx, this.player.y + dy, key)
      .setOrigin(0.5, 0.5).setDepth(this.player.depth - 1).setScale(scale);
    spr._fxDx = dx; spr._fxDy = dy;
    (this._playerFx || (this._playerFx = [])).push(spr);
    spr.play(key);
    spr.once('animationcomplete', () => {
      const arr = this._playerFx;
      if (arr) { const i = arr.indexOf(spr); if (i >= 0) arr.splice(i, 1); }
      spr.destroy();
    });
    return spr;
  }

  // 每帧把跟随特效贴回英雄当前位置（移动时不掉队）
  updatePlayerFx() {
    const arr = this._playerFx;
    if (!arr || !arr.length) return;
    const p = this.player;
    for (const s of arr) {
      if (!s.active) continue;
      s.setPosition(p.x + s._fxDx, p.y + s._fxDy);
      s.setDepth(p.depth - 1);
    }
  }

  // 每帧把冷却比例喂给 HTML overlay (CSS conic-gradient 扫描)
  // 槽位 0=F 横扫斩;槽位 1=K 冲刺;槽位 i=this.weapons[i-2] (i ≥ 2)
  updateHotbarCooldowns() {
    if (!this.hud || !this.hud.setCooldown) return;
    const now = this.time.now;
    // F 横扫斩 (slot 0)
    const slashRemain = (this.player.slashCdUntil || 0) - now;
    const slashRatio = (slashRemain > 0 && this.player.slashCd > 0) ? slashRemain / this.player.slashCd : 0;
    this.hud.setCooldown(0, Phaser.Math.Clamp(slashRatio, 0, 1));
    // K 冲刺 (slot 1)
    const dashRemain = (this.player.dashCdUntil || 0) - now;
    const dashRatio = (dashRemain > 0 && this.player.dashCd > 0) ? dashRemain / this.player.dashCd : 0;
    this.hud.setCooldown(1, Phaser.Math.Clamp(dashRatio, 0, 1));
    // 自动武器 (slot 2+)
    for (let i = 0; i < 4; i++) {
      const w = this.weapons[i];
      const r = (w && w.cdMax && w.cdLeft > 0) ? Phaser.Math.Clamp(w.cdLeft / w.cdMax, 0, 1) : 0;
      this.hud.setCooldown(i + 2, r);
    }
    // 旧画布扇形（已 noop）保留兼容
    const g = this.cdGraphics;
    if (!g || !this.hotSlots) return;
    g.clear();
    const r = this.hotSlotR || 14;
    // 槽位 0 = 冲刺(K)；槽位 i = this.weapons[i-1]
    this.hotSlots.forEach((slot, i) => {
      if (!slot.icon || !slot.icon.visible) return; // 空槽不画
      let ratio = 0; // 剩余冷却占比 0~1
      if (i === 0) {
        const remain = (this.player.dashCdUntil || 0) - now;
        if (remain > 0 && this.player.dashCd > 0) ratio = remain / this.player.dashCd;
      } else {
        const w = this.weapons[i - 1];
        if (w && w.cdMax && w.cdLeft > 0) ratio = w.cdLeft / w.cdMax;
      }
      ratio = Phaser.Math.Clamp(ratio, 0, 1);
      if (ratio <= 0.001) return;
      // 暗色扇形：圆心 → 弧 → 回圆心，从正上方(-90°)顺时针覆盖 ratio 比例
      const start = -Math.PI / 2;
      const end = start + ratio * Math.PI * 2;
      g.fillStyle(0x000000, 0.5);
      g.beginPath();
      g.moveTo(slot.cx, slot.cy);
      g.arc(slot.cx, slot.cy, r, start, end, false);
      g.closePath();
      g.fillPath();
    });
  }

  buildBossBar(W, D) {
    const reg = (o) => { (this._hudObjects || (this._hudObjects = [])).push(o); return o; };
    const bf = UI_FRAMES.bossFrame;
    const s = 0.62;
    const left = W / 2 - (bf.w * s) / 2;
    const inn = bf.inner;
    const wasVisible = this.bossRef && !this.bossRef.dead;
    const frame = reg(this.add.image(W / 2, 8, 'ui-bossFrame').setOrigin(0.5, 0).setScale(s)
      .setScrollFactor(0).setDepth(D + 50).setVisible(wasVisible));
    this.bossFill = reg(this.uiBar('ui-bossFill', left + inn.x * s, 8 + (inn.y + inn.h / 2) * s, inn.w * s, inn.h * s, D + 51));
    this.bossFill.setVisible(wasVisible);
    this.bossNameText = reg(this.add.text(W / 2, 8 + (inn.y + inn.h / 2) * s, this._bossName || '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 52).setVisible(wasVisible));
    this.bossUI = [frame, this.bossFill, this.bossNameText];
  }

  showBossBar(boss, name) {
    this.bossRef = boss;
    this._bossName = name || '首领';
    if (this.bossUI) this.bossUI.forEach((o) => o.setVisible && o.setVisible(true));
    if (this.bossNameText && this.bossNameText.setText) this.bossNameText.setText(this._bossName);
    this.setUiBar(this.bossFill, 1);
    if (this.hud) this.hud.showBoss(this._bossName);
  }

  hideBossBar() {
    this.bossRef = null;
    this._bossName = null;
    if (this.bossUI) this.bossUI.forEach((o) => o.setVisible(false));
  }

  // 每帧同步 Boss 血条（Boss 死亡/移除则隐藏）
  updateBossBar() {
    if (!this.bossRef) return;
    if (this.bossRef.dead || !this.bossRef.active) { this.hideBossBar(); return; }
    this.setUiBar(this.bossFill, this.bossRef.hp / this.bossRef.maxHp);
  }

  refreshWeaponHud() {
    this.refreshHotbar();
  }

  refreshHotbar() {
    // 槽位 0 = F 横扫斩 (主力手动);1 = K 冲刺;2+ = 已获得的自动武器
    const entries = [
      { icon: 'dmg', key: 'L', lvl: '' },
      { icon: 'dash', key: 'K', lvl: '' },
    ];
    this.weapons.forEach((w) => {
      const def = WEAPON_DEFS[w.key];
      entries.push({ icon: def && def.icon, key: '', lvl: `${w.level}${w.evolved ? '★' : ''}` });
    });
    if (this.hud) this.hud.setSlots(entries);
    if (!this.hotSlots) return;
    const size = this.hotIconSize || 46;
    this.hotSlots.forEach((slot, i) => {
      const e = entries[i];
      if (!e) { slot.icon.setVisible(false); slot.keyT.setText(''); slot.lvlT.setText(''); return; }
      const texKey = `ui-icon-${e.icon}`;
      if (e.icon && this.textures.exists(texKey)) {
        slot.icon.setVisible(true).setTexture(texKey).setDisplaySize(size, size);
      } else {
        if (e.icon) console.warn(`missing ui texture: ${texKey}`); // 缺图标 → 空槽，不崩溃
        slot.icon.setVisible(false);
      }
      slot.keyT.setText(e.key || '');
      slot.lvlT.setText(e.lvl || '');
    });
  }

  refreshSkillHud() {
    if (!this.skillText) return;
    const p = this.player;
    const stats = [`攻击${p.dmg}`, `暴击${Math.round(p.critChance * 100)}%`];
    if (p.lifesteal > 0) stats.push(`吸血${p.lifesteal}`);
    if (p.haste > 0) stats.push(`急速${Math.round(p.haste * 100)}%`);
    this.skillText.setText(stats.join('  '));
  }

  tryHeal() {
    if (this.player.dead || this.gold < 5 || this.player.hp >= this.player.maxHp) return;
    this.gold -= 5;
    this.player.heal(30);
    Sfx.heal();
    this.goldText.setText(`${this.gold}`);
    this.player.setTint(0x66ff88);
    this.time.delayedCall(120, () => { if (!this.player.dead) this.player.clearTint(); });
    playFx(this, 'fx-dust', this.player.x, this.player.y, { scale: 0.6 });
  }

  // —— 金币商店 ——
  get shopItems() {
    return [
      { label: '回血 30', cost: 5, apply: (p) => p.heal(30) },
      { label: '攻击 +5', cost: 12, apply: (p) => { p.dmg += 5; } },
      { label: '最大生命 +20', cost: 15, apply: (p) => { p.maxHp += 20; p.heal(20); } },
      { label: '移速 +15', cost: 10, apply: (p) => { p.speed += 15; } },
    ];
  }

  openShop() {
    this.shopOpen = true;
    this.shopPrompt.setVisible(false);
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H / 2;
    const D = 30000;
    const sh = UI_FRAMES.shop;
    const s = 1.3;
    const ph = sh.h * s;
    const items = this.shopItems;
    const ui = [];
    ui.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.5).setOrigin(0, 0).setScrollFactor(0).setDepth(D));
    ui.push(this.add.image(cx, cy, 'ui-shopPanel').setScale(s).setScrollFactor(0).setDepth(D + 1));
    this.shopTitle = this.add.text(cx, cy - ph / 2 + sh.titleY * ph, `金币商店   持有 ${this.gold}`, {
      fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3);
    ui.push(this.shopTitle);
    // 物品行
    const rowS = 0.6;
    const rw = 398 * rowS;
    const rh = 110 * rowS;
    const bodyTop = cy - ph / 2 + sh.bodyY0 * ph;
    const rowGap = 6;
    items.forEach((it, i) => {
      const ry = bodyTop + rh / 2 + i * (rh + rowGap);
      ui.push(this.add.image(cx, ry, 'ui-itemRow').setScale(rowS).setScrollFactor(0).setDepth(D + 2));
      ui.push(this.add.text(cx - rw / 2 + 70, ry, `${i + 1}. ${it.label}`, {
        fontFamily: 'monospace', fontSize: '14px', color: '#3a2614', fontStyle: 'bold',
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 3));
      ui.push(this.add.text(cx + rw / 2 - 37, ry, `${it.cost}`, {
        fontFamily: 'monospace', fontSize: '14px', color: '#ffe070', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
    });
    ui.push(this.add.text(cx, cy + ph / 2 - 22, '按 1~4 购买 · 按 B 关闭', {
      fontFamily: 'monospace', fontSize: '13px', color: '#5a3a22', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
    this.shopUI = ui;
  }

  closeShop() {
    this.shopOpen = false;
    if (this.shopUI) this.shopUI.forEach((o) => o.destroy());
    this.shopUI = null;
  }

  buyItem(i) {
    const it = this.shopItems[i];
    if (!it || this.gold < it.cost) return;
    this.gold -= it.cost;
    it.apply(this.player);
    this.goldText.setText(`${this.gold}`);
    if (this.shopTitle) this.shopTitle.setText(`金币商店   持有 ${this.gold}`);
    Sfx.upgrade();
    playFx(this, 'fx-dust', this.player.x, this.player.y, { scale: 0.6 });
  }

  // —— 装备图标：有 PNG 用 PNG，否则用 emoji 兜底 ——
  equipIconKey(def) {
    const k = `ui-eq-${def.icon}`;
    return this.textures.exists(k) ? k : null;
  }

  statLabel(k) {
    return ({
      maxHp: '生命', dmg: '攻击', speed: '移速', critChance: '暴击', critDmg: '暴伤',
      lifesteal: '吸血', haste: '急速', goldMult: '金币', pickupRange: '拾取',
    })[k] || k;
  }

  // —— 装备面板（按 E 开关）——
  openGear() {
    this.gearOpen = true;
    this.gearPage = this.gearPage || 0;
    this._refreshGearOverlay();
  }

  closeGear() {
    this.gearOpen = false;
    if (this.gearUI) this.gearUI.forEach((o) => { try { o.destroy(); } catch (e) {} });
    this.gearUI = null;
    if (this.hud) this.hud.hideGear();
  }

  // 收集装备面板当前状态，交给 HTML overlay 渲染
  _refreshGearOverlay() {
    if (!this.hud) return;
    const perPage = 6;
    const totalPages = Math.ceil(EQUIPMENT.length / perPage);
    this._gearPages = totalPages;
    this.gearPage = Phaser.Math.Clamp(this.gearPage || 0, 0, totalPages - 1);
    const pageItems = EQUIPMENT.slice(this.gearPage * perPage, this.gearPage * perPage + perPage);
    this._gearItems = pageItems;
    const slots = EQUIP_SLOTS.map((slot) => {
      const eq = this.player.equipment[slot];
      const def = eq ? EQUIP_BY_ID[eq.id] : null;
      return { label: SLOT_LABELS[slot], eq, def };
    });
    const items = pageItems.map((def) => {
      const owned = this.ownedEquip[def.id];
      const equipped = this.player.equipment[def.slot]?.id === def.id;
      let action; let cost = 0;
      if (equipped && owned < MAX_EQUIP_LEVEL) { action = `升级+${owned + 1}`; cost = upgradeCost(def, owned); }
      else if (equipped) action = '满级';
      else if (owned) action = '装备';
      else { action = '购买'; cost = buyCost(def); }
      return { def, action, cost };
    });
    this.hud.showGear({
      gold: this.gold,
      slots,
      items,
      page: this.gearPage,
      totalPages,
      statLabel: (k) => this.statLabel(k),
    });
  }

  renderGear() {
    if (this.gearUI) this.gearUI.forEach((o) => o.destroy());
    const ui = [];
    const W = this.scale.width; const H = this.scale.height;
    const cx = W / 2; const cy = H / 2; const D = 30000;
    ui.push(this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0).setScrollFactor(0).setDepth(D));
    ui.push(this.add.image(cx, cy, 'ui-modalPanel').setScale(1.25, 1.2).setScrollFactor(0).setDepth(D + 1));
    ui.push(this.add.text(cx, cy - 178, `装备   金币 ${this.gold}`, {
      fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold', color: '#ffe070', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));

    // 顶部：当前已装备的三个槽位
    const slotX = [cx - 150, cx, cx + 150];
    EQUIP_SLOTS.forEach((slot, i) => {
      const eq = this.player.equipment[slot];
      const def = eq ? EQUIP_BY_ID[eq.id] : null;
      const x = slotX[i]; const y = cy - 130;
      ui.push(this.add.text(x, y - 26, SLOT_LABELS[slot], {
        fontFamily: 'monospace', fontSize: '12px', color: '#cfe9ff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
      const box = this.add.rectangle(x, y, 56, 56, 0x1a1f2b, 0.9)
        .setStrokeStyle(2, def ? RARITY[def.rarity].color : 0x555c6a).setScrollFactor(0).setDepth(D + 2);
      ui.push(box);
      if (def) {
        const ic = this.equipIconKey(def);
        if (ic) {
          const img = this.add.image(x, y, ic).setScrollFactor(0).setDepth(D + 3);
          img.setScale(46 / (img.width || 128));
          ui.push(img);
        } else {
          ui.push(this.add.text(x, y, def.fallbackIcon, { fontSize: '26px' }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
        }
        ui.push(this.add.text(x + 22, y + 16, `+${eq.level}`, {
          fontFamily: 'monospace', fontSize: '12px', color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
        }).setOrigin(1, 1).setScrollFactor(0).setDepth(D + 4));
      }
    });

    // 列表：所有装备（分页，每页 6 件），数字键 1~6 操作
    const perPage = 6;
    const pages = Math.ceil(EQUIPMENT.length / perPage);
    this._gearPages = pages;
    this.gearPage = Phaser.Math.Clamp(this.gearPage || 0, 0, pages - 1);
    const items = EQUIPMENT.slice(this.gearPage * perPage, this.gearPage * perPage + perPage);
    this._gearItems = items;
    items.forEach((def, i) => {
      const y = cy - 76 + i * 40;
      const owned = this.ownedEquip[def.id];
      const equipped = this.player.equipment[def.slot]?.id === def.id;
      const rc = RARITY[def.rarity];
      const colorHex = '#' + rc.color.toString(16).padStart(6, '0');
      const statStr = Object.entries(def.stats).map(([k, v]) => `${this.statLabel(k)}${v > 0 ? '+' : ''}${v}`).join(' ');
      let action; let cost = 0;
      if (equipped && owned < MAX_EQUIP_LEVEL) { action = `升级+${owned + 1}`; cost = upgradeCost(def, owned); }
      else if (equipped) { action = '满级'; }
      else if (owned) { action = '装备'; }
      else { action = '购买'; cost = buyCost(def); }
      const left = cx - 215;
      const ic = this.equipIconKey(def);
      if (ic) { const im = this.add.image(left, y, ic).setScrollFactor(0).setDepth(D + 3); im.setScale(28 / (im.width || 128)); ui.push(im); }
      else ui.push(this.add.text(left, y, def.fallbackIcon, { fontSize: '20px' }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
      ui.push(this.add.text(left + 22, y, `${i + 1}.${def.name}[${rc.name}] ${statStr}`, {
        fontFamily: 'monospace', fontSize: '13px', color: colorHex, stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 3));
      const tag = cost ? `${action} ${cost}金` : action;
      ui.push(this.add.text(cx + 215, y, tag, {
        fontFamily: 'monospace', fontSize: '13px', color: (equipped && action === '满级') ? '#88ff88' : '#ffd040',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 3));
    });

    ui.push(this.add.text(cx, cy + 168, `1~${items.length} 选择/装备/升级    Q 翻页(${this.gearPage + 1}/${pages})    E 关闭`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#aaa',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
    this.gearUI = ui;
  }

  // 装备面板里数字键选择某项
  gearSelect(i) {
    const def = this._gearItems && this._gearItems[i];
    if (!def) return;
    const owned = this.ownedEquip[def.id];
    const equipped = this.player.equipment[def.slot]?.id === def.id;
    if (equipped) {
      if (owned >= MAX_EQUIP_LEVEL) return;
      const cost = upgradeCost(def, owned);
      if (this.gold < cost) { Sfx.hurt(); return; }
      this.gold -= cost;
      this.ownedEquip[def.id] = owned + 1;
      this.player.setEquipLevel(def.slot, owned + 1);
    } else if (owned) {
      this.player.equip(def, owned);
    } else {
      const cost = buyCost(def);
      if (this.gold < cost) { Sfx.hurt(); return; }
      this.gold -= cost;
      this.ownedEquip[def.id] = 1;
      this.player.equip(def, 1);
    }
    Sfx.upgrade();
    this.goldText.setText(`${this.gold}`);
    this.refreshSkillHud();
    this._refreshGearOverlay();
  }

  groundFrame(c, r) {
    const L = c === ISLAND.x0; const R = c === ISLAND.x1;
    const T = r === ISLAND.y0; const B = r === ISLAND.y1;
    if (T && L) return GROUND.TL;
    if (T && R) return GROUND.TR;
    if (B && L) return GROUND.BL;
    if (B && R) return GROUND.BR;
    if (T) return GROUND.T;
    if (B) return GROUND.B;
    if (L) return GROUND.L;
    if (R) return GROUND.R;
    return GROUND.C;
  }

  playerAttackHit() {
    const px = this.player.x;
    const py = this.player.y;
    const dir = this.player.facing;
    const range = this.player.range;
    playFx(this, 'fx-dust', px + dir * 36, py + 8, { scale: 0.7, flipX: dir < 0 });

    let firstHit = true;
    this.enemies.getChildren().forEach((e) => {
      if (e.dead) return;
      const dx = e.x - px; const dy = e.y - py;
      if (Math.hypot(dx, dy) <= range && Math.sign(dx || dir) === dir && Math.abs(dy) < 70) {
        e.takeDamage(this.player.atk(), px, py);
        Sfx.hit();
        this.applyLifesteal();
        if (firstHit) { playFx(this, 'fx-impact', e.x, e.y - 6, { scale: 0.6 }); firstHit = false; }
      }
    });
    if (this._buildingsAttackable()) {
      this.buildings.forEach((b) => {
        if (b.destroyed) return;
        const dx = b.x - px; const dy = b.y - py;
        if (Math.hypot(dx, dy) <= range + 30 && Math.sign(dx || dir) === dir && Math.abs(dy) < 90) {
          b.takeDamage(this.player.atk());
        }
      });
    }
  }

  makeSwordWaveTexture() {
    if (this.textures.exists('swordwave')) return;
    const g = this.make.graphics({ add: false });
    g.lineStyle(18, 0x4fd6ff, 0.45); g.beginPath(); g.arc(60, 48, 38, -1.2, 1.2, false); g.strokePath();
    g.lineStyle(11, 0x9ff0ff, 0.9); g.beginPath(); g.arc(60, 48, 38, -1.1, 1.1, false); g.strokePath();
    g.lineStyle(4, 0xffffff, 1); g.beginPath(); g.arc(60, 48, 38, -1.0, 1.0, false); g.strokePath();
    g.generateTexture('swordwave', 120, 96);
    g.destroy();
  }

  // U：剑气波 —— 前方穿透直线（发光 + 拖尾 + 起手闪光）
  swordWaveHit() {
    const px = this.player.x; const py = this.player.y; const dir = this.player.facing;
    const dmg = this.player.atk();
    // 起手闪光
    shockwave(this, px + dir * 24, py, { color: 0x9ff0ff, maxRadius: 46, duration: 220, lineWidth: 4 });
    // 主剑气：Codex 动画剑气，朝前方飞行
    const wave = this.add.sprite(px + dir * 26, py, 'fx-swordwave-anim').setFlipX(dir < 0)
      .setScale(1.2).setDepth(99990);
    wave.play('fx-swordwave-anim');
    this.tweens.add({
      targets: wave, x: px + dir * 360, scaleX: 1.7, scaleY: 1.9, alpha: 0, duration: 360, ease: 'Sine.out',
      onComplete: () => wave.destroy(),
    });
    Sfx.swordWave();
    // 震屏移除 — 多剑气连发时画面晃得眼花
    this.enemies.getChildren().forEach((e) => {
      if (e.dead) return;
      const dx = e.x - px; const dy = e.y - py;
      if (Math.sign(dx || dir) === dir && Math.abs(dx) <= 340 && Math.abs(dy) < 62) {
        e.takeDamage(dmg, px, py);
        this.applyLifesteal();
      }
    });
  }

  // L:横扫斩 — 站桩前向 180° 弧形大剑挥砍 (RR 国王挥剑感)
  // 比 K 冲刺斩更厚重 (无位移, 范围更大), 比 J 重击更快 (CD 0.5s)
  swingSlashHit() {
    const px = this.player.x; const py = this.player.y; const dir = this.player.facing;
    const dmg = Math.round(this.player.atk() * 1.4);
    const range = 180;                // 视觉 + 判定一致
    // 视觉 (fx-slash 192×192 8 帧, 原始素材未经裁剪): scale 1.4 让月牙覆盖 ~180 判定范围
    playFx(this, 'fx-slash', px + dir * 40, py - 6, {
      scale: 1.4,
      flipX: dir < 0,
      depth: py + 200,
    });
    Sfx.slash();
    // 伤害结算: 前向 180° 弧内 (与剑光朝向一致, 身后不受击)
    this.enemies.getChildren().forEach((e) => {
      if (e.dead) return;
      const dx = e.x - px; const dy = e.y - py;
      if (Math.hypot(dx, dy) > range) return;
      if (Math.sign(dx || dir) !== dir) return;
      e.takeDamage(dmg, px, py);
      this.applyLifesteal();
      // 斩击击退: 未死的普通怪沿远离玩家方向击飞一小段 (boss 不吃击退)
      if (!e.dead && !e.isBoss && e.setVelocity) {
        const a = Math.atan2(e.y - py, e.x - px);
        e.setVelocity(Math.cos(a) * 420, Math.sin(a) * 420);
        e._staggerUntil = this.time.now + 170;   // 击退期间 AI 不夺回速度 → 顿挫感
      }
    });
    if (this.buildings && this._buildingsAttackable()) {
      this.buildings.forEach((b) => {
        if (b.destroyed) return;
        const dx = b.x - px; const dy = b.y - py;
        if (Math.hypot(dx, dy) <= range && Math.sign(dx || dir) === dir) b.takeDamage(dmg);
      });
    }
  }

  // 自定义底图模式下,原地形建筑视觉已隐藏 + 物理已停 → 也不该被攻击
  _buildingsAttackable() {
    return !this.editor || this.editor._useOriginalTerrain !== false;
  }

  // I：战吼 —— 击退周围敌人 + 光环
  warCryHit() {
    const px = this.player.x; const py = this.player.y;
    shockwave(this, px, py, { color: 0xffaa44, maxRadius: 140, duration: 420, lineWidth: 6 });
    this.cameras.main.shake(160, 0.006);
    Sfx.warCry();
    this.enemies.getChildren().forEach((e) => {
      if (e.dead) return;
      if (Phaser.Math.Distance.Between(px, py, e.x, e.y) <= 130) {
        const a = Math.atan2(e.y - py, e.x - px);
        e.setVelocity(Math.cos(a) * 320, Math.sin(a) * 320);
      }
    });
  }

  // J：重击命中（宽范围、高伤、爆炸+震屏）
  heavyAttackHit() {
    const px = this.player.x; const py = this.player.y; const dir = this.player.facing;
    const range = this.player.range * 1.4;
    const dmg = Math.round(this.player.atk() * this.player.heavyMult);
    playFx(this, 'fx-explosion', px + dir * 42, py, { scale: 0.85 });
    playFx(this, 'fx-dust', px + dir * 30, py + 10, { scale: 1.1, flipX: dir < 0 });
    this.cameras.main.shake(160, 0.008);
    Sfx.heavy();
    this.enemies.getChildren().forEach((e) => {
      if (e.dead) return;
      const dx = e.x - px; const dy = e.y - py;
      if (Math.hypot(dx, dy) <= range && Math.sign(dx || dir) === dir && Math.abs(dy) < 95) {
        e.takeDamage(dmg, px, py);
        this.applyLifesteal();
      }
    });
    if (this._buildingsAttackable()) {
      this.buildings.forEach((b) => {
        if (b.destroyed) return;
        const dx = b.x - px; const dy = b.y - py;
        if (Math.hypot(dx, dy) <= range + 30 && Math.sign(dx || dir) === dir && Math.abs(dy) < 110) b.takeDamage(dmg);
      });
    }
  }

  // K：冲刺斩命中（沿朝向前方一条带状区域）
  dashSlashHit() {
    const px = this.player.x; const py = this.player.y; const dir = this.player.facing;
    const dmg = Math.round(this.player.atk() * 0.8);
    playFx(this, 'fx-dust', px + dir * 30, py + 8, { scale: 0.8, flipX: dir < 0 });
    Sfx.dash();
    this.enemies.getChildren().forEach((e) => {
      if (e.dead) return;
      const dx = e.x - px; const dy = e.y - py;
      if (Math.sign(dx || dir) === dir && Math.abs(dx) <= 150 && Math.abs(dy) < 60) {
        e.takeDamage(dmg, px, py);
        this.applyLifesteal();
      }
    });
  }

  // 外层包一层 try/catch：单帧异常不再让整个 RAF 循环死掉（卡死）。
  // 关键：报错要定位到「真实出错的源码行」，而不是这层 catch 所在的行。
  update(time, delta) {
    // 致命停摆需要连续多帧同一错误才触发；偶发单帧错误只节流提示、继续运行。
    if (this._crashed) return;
    try {
      this._update(time, delta);
      this._errStreak = 0; // 正常跑一帧就清空连续错误计数
    } catch (err) {
      this.handleUpdateError(err, time);
    }
  }

  handleUpdateError(err, time) {
    this._errStreak = (this._errStreak || 0) + 1;
    const sig = (err && err.message ? err.message : String(err)) + '|' + this.firstSrcFrame(err);

    // 每个不同错误只往 console 打一次（带浏览器可点击的真实行号），避免每帧刷屏
    if (sig !== this._lastErrSig) {
      this._lastErrSig = sig;
      // eslint-disable-next-line no-console
      console.error('WorldScene.update 错误（真实堆栈见下）:', err);
    }

    // 红框节流：最多每 800ms 刷新一次显示
    if (!this._lastErrShown || time - this._lastErrShown > 800) {
      this._lastErrShown = time;
      this.showCrash(err);
    }

    // 连续 180 帧（约 3 秒）都在同一处崩 → 判定为致命，停摆并保留最后的红框
    if (this._errStreak >= 180) this._crashed = true;
  }

  // 从 stack 里挑出第一个属于本项目 src/ 的帧，返回 "文件名:行:列"
  firstSrcFrame(err) {
    const stack = err && err.stack ? err.stack : '';
    const lines = stack.split('\n');
    for (const ln of lines) {
      // 匹配 .../src/xxx/yyy.js?v=2:行:列
      const m = ln.match(/\/src\/([^\s)]+\.js)(?:\?[^\s:)]*)?:(\d+):(\d+)/);
      if (m) return `${m[1]}:${m[2]}:${m[3]}`;
    }
    return '位置未知';
  }

  showCrash(err) {
    const message = err && err.message ? err.message : String(err);
    const where = this.firstSrcFrame(err);
    // 第一行就是真实错误信息 + 真实源码行号
    const headline = `${message}  @ ${where}`;
    if (typeof window !== 'undefined' && window.__showErr) {
      window.__showErr(headline, err && err.stack ? err.stack : '');
    }
    if (this._crashText) this._crashText.destroy();
    const msg = `⚠ 错误（请截图发我）:\n>>> ${headline}\n\n${err && err.stack ? err.stack : ''}`;
    this._crashText = this.add.text(20, 60, msg, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', backgroundColor: '#7a0000ee',
      padding: { x: 10, y: 8 }, wordWrap: { width: this.scale.width - 60 },
    }).setScrollFactor(0).setDepth(99999);
  }

  _update(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.muteKey)) toggleMute();
    this.updatePlayerBar();

    if (this.player.dead || this._coreDestroyed) {
      this._showDeathOverlay(this._coreDestroyed ? '水晶塔被摧毁' : undefined);
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) this.scene.start('HomeScene');
      return;
    }

    // 升级选择中：只处理 1/2/3
    if (this.choosing) {
      if (Phaser.Input.Keyboard.JustDown(this.numKeys.one)) this.chooseUpgrade(0);
      else if (Phaser.Input.Keyboard.JustDown(this.numKeys.two)) this.chooseUpgrade(1);
      else if (Phaser.Input.Keyboard.JustDown(this.numKeys.three)) this.chooseUpgrade(2);
      this.player.update(this.cursors, this.wasd);
      this.player.setDepth(this.player.y + FEET_DEPTH);
      return;
    }

    // 商店开启中
    if (this.shopOpen) {
      this.player.setVelocity(0, 0);
      if (Phaser.Input.Keyboard.JustDown(this.numKeys.one)) this.buyItem(0);
      else if (Phaser.Input.Keyboard.JustDown(this.numKeys.two)) this.buyItem(1);
      else if (Phaser.Input.Keyboard.JustDown(this.numKeys.three)) this.buyItem(2);
      else if (Phaser.Input.Keyboard.JustDown(this.numKeys.four)) this.buyItem(3);
      if (Phaser.Input.Keyboard.JustDown(this.shopKeyB)) this.closeShop();
      this.setUiBar(this.hudFill, this.player.hp / this.player.maxHp);
      return;
    }

    // 装备面板开启中
    if (this.gearOpen) {
      this.player.setVelocity(0, 0);
      if (Phaser.Input.Keyboard.JustDown(this.numKeys.one)) this.gearSelect(0);
      else if (Phaser.Input.Keyboard.JustDown(this.numKeys.two)) this.gearSelect(1);
      else if (Phaser.Input.Keyboard.JustDown(this.numKeys.three)) this.gearSelect(2);
      else if (Phaser.Input.Keyboard.JustDown(this.numKeys.four)) this.gearSelect(3);
      else if (Phaser.Input.Keyboard.JustDown(this.numKeys.five)) this.gearSelect(4);
      else if (Phaser.Input.Keyboard.JustDown(this.numKeys.six)) this.gearSelect(5);
      else if (Phaser.Input.Keyboard.JustDown(this.gearPrevKey)) { this.gearPage = (this.gearPage + 1) % this._gearPages; this._refreshGearOverlay(); }
      else if (Phaser.Input.Keyboard.JustDown(this.gearKey)) this.closeGear();
      this.setUiBar(this.hudFill, this.player.hp / this.player.maxHp);
      return;
    }
    // 打开装备面板（E）
    if (Phaser.Input.Keyboard.JustDown(this.gearKey)) { this.openGear(); return; }

    const nearShop = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.shopNpc.x, this.shopNpc.y) < 96;
    this.shopPrompt.setVisible(nearShop);
    if (nearShop && Phaser.Input.Keyboard.JustDown(this.shopKeyB)) { this.openShop(); return; }

    // 手动：仅保留冲刺走位；攻击全自动
    if (Phaser.Input.Keyboard.JustDown(this.skillK) && this.player.dashSlash()) Sfx.dash();
    if (Phaser.Input.Keyboard.JustDown(this.skillL)) this.player.swingSlash();
    if (Phaser.Input.Keyboard.JustDown(this.healKey)) this.tryHeal();

    this.player.update(this.cursors, this.wasd);
    this._applyStepDepth();

    const moving = this.player.body && !this.player.busy() && (Math.abs(this.player.body.velocity.x) > 5 || Math.abs(this.player.body.velocity.y) > 5);
    if (moving && time - this.lastStep > 280) { this.lastStep = time; Sfx.footstep(); }

    this.enemies.getChildren().forEach((e) => { e.update(this.player, time); e.setDepth(e.y + FEET_DEPTH); });
    if (this.allies) this.allies.getChildren().forEach((a) => { a.update(time); a.setDepth(a.y + FEET_DEPTH); });

    this.updateGems();
    this.fireWeapons(delta);
    this.flushLifestealText(time);
    this.updatePlayerFx();
    this.updateHotbarCooldowns();
    this.checkHudViewport();

    // 刷怪逻辑分流: 守塔模式走波次系统, 无尽模式保持连续刷怪+定时 boss
    this.elapsed += delta;
    if (this._mode === 'defense') {
      this._tickWaveSystem(time);
    } else {
      if (this.elapsed >= this.nextSpawnAt) { this.spawnTick(); this.nextSpawnAt = this.elapsed + this.spawnInterval(); }
      if (this.elapsed >= this.nextBossAt) { this.spawnBoss(); this.nextBossAt += 60000; }
    }

    // 升级排队
    if (this.pendingLevels > 0 && !this.choosing) this.showUpgrades();

    // 旧画布 HUD 继续运行（位置可能不对但无害）
    this.setUiBar(this.hudFill, this.player.hp / this.player.maxHp);
    this.hpText.setText(`${Math.ceil(this.player.hp)} / ${this.player.maxHp}`);
    this.setUiBar(this.xpFill, this.xp / this.xpToNext);
    this.levelText.setText(`Lv ${this.level}`);
    this.timerText.setText(this.fmtTime(this.elapsed));
    this.killText.setText(`${this.kills}`);

    // HTML overlay HUD：永远锚定浏览器视口正确位置
    if (this.hud) {
      this.hud.update({
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        xp: this.xp,
        xpToNext: this.xpToNext,
        level: this.level,
        gold: this.gold,
        timeMs: this.elapsed,
        kills: this.kills,
        // 无尽模式显示 kills/killGoal 进度
        killGoal: this._mode === 'survival' ? this._killGoal : null,
        minimap: this._buildMinimapState(),
        wave: this._buildWaveState(),
      });
      if (this.villageCore && this.hud.updateCore) this.hud.updateCore(this.villageCore.hp, this.villageCore.maxHp);
    }

    // Boss 血条同步
    if (this.bossRef) {
      if (this.bossRef.dead || !this.bossRef.active) { this.hideBossBar(); if (this.hud) this.hud.hideBoss(); }
      else {
        this.setUiBar(this.bossFill, this.bossRef.hp / this.bossRef.maxHp);
        if (this.hud) this.hud.setBossHp(this.bossRef.hp / this.bossRef.maxHp);
      }
    }
  }

  // 弹出死亡 + 排行榜 overlay（一局只触发一次）
  _showDeathOverlay(reason) {
    if (this._deathShown) return;
    this._deathShown = true;
    if (reason) this.announce(reason, '#ff7676');
    const survivalMs = this.elapsed;
    const score = computeScore({ level: this.level, kills: this.kills, survivalMs });
    const name = getStoredName();
    // 先用本地排行渲染一次（即时反馈），再异步拉远程刷新
    this.leaderboard.getTop(10).then((top) => {
      this.hud.showDeath({
        survivalMs, level: this.level, kills: this.kills, score, name,
        remote: !!this.leaderboard.remote, top, myRank: null, myEntry: null,
      }, {
        onSubmit: async (newName) => {
          // 防重复提交：一局只能提交一次
          if (this._deathSubmitted) return;
          this._deathSubmitted = true;
          this.hud.lockSubmit && this.hud.lockSubmit('已提交');
          const nm = (newName || '匿名英雄').slice(0, 12);
          saveName(nm);
          const entry = { name: nm, level: this.level, kills: this.kills, survivalMs, score, ts: Date.now() };
          this._myEntry = entry;
          await this.leaderboard.submit(entry);
          const list = await this.leaderboard.getTop(10);
          const rank = this.leaderboard.rankOf(entry, list);
          this.hud.updateLeaderboard(list, rank, entry);
        },
        onRestart: () => this.scene.start('HomeScene'),
      });
    });
  }

  updatePlayerBar() {
    // 玩家头顶画布血条已弃用（HTML overlay 顶部已显示 HP）
    if (!this.playerHpBg || !this.playerHpBg.setPosition) return;
    const p = this.player;
    const y = p.y - 50;
    this.playerHpBg.setPosition(p.x, y);
    this.playerHpFill.setPosition(p.x - 23, y);
    const ratio = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
    this.playerHpFill.width = 46 * ratio;
    this.playerHpFill.fillColor = ratio > 0.5 ? 0x46c83c : ratio > 0.25 ? 0xe0b020 : 0xd03030;
    const show = !p.dead;
    this.playerHpBg.setVisible(show);
    this.playerHpFill.setVisible(show);
  }

  fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
}
