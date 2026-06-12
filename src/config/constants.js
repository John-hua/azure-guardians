// 集中管理可调参数与资产路径。
export const TILE = 64;              // Tiny Swords 地块网格
export const MAP_COLS = 40;
export const MAP_ROWS = 28;

// 草地岛屿范围（含边缘），其余为水面
export const ISLAND = { x0: 2, y0: 2, x1: 37, y1: 25 };

export const PLAYER_SPEED = 170;
export const UNIT_FRAME = 192;       // 单位精灵帧边长

// 资产路径（相对 index.html）
export const ASSETS = {
  ground: 'assets/terrain/ground.png',         // 576x384，64px 自动拼接图集
  path: 'assets/terrain/path.png',             // 橄榄色草地变体，做小路
  terrainForest: 'assets/terrain/generated/forest-cool-green.png',
  terrainMine: 'assets/terrain/generated/mine-warm-sand.png',
  terrainRuins: 'assets/terrain/generated/ruins-gray-green.png',
  terrainVillage: 'assets/terrain/generated/village-warm-light.png',
  terrainCoast: 'assets/terrain/generated/coast-shallow-blue.png',
  bridge: 'assets/terrain/bridge.png',         // 192x256 木桥(3列x4行)
  water: 'assets/terrain/water.png',           // 64x64 可平铺
  tree: 'assets/terrain/tree.png',             // 192x256 ×8 帧
  cave: 'assets/deco/cave.png',                // 192x128 洞穴/矿口
  waterrock1: 'assets/deco/waterrock1.png',    // 1024x64 ×16 水中礁石
  waterrock2: 'assets/deco/waterrock2.png',
  foam: 'assets/terrain/foam.png',             // 1536x192 ×8 海岸泡沫
  scarecrow: 'assets/deco/scarecrow.png',      // 192x192 稻草人
  // 玩家（蓝战士）192x192：idle×8 run×6 attack×4
  warriorBlueIdle: 'assets/units/warrior-blue-idle.png',
  warriorBlueRun: 'assets/units/warrior-blue-run.png',
  warriorBlueAttack: 'assets/units/warrior-blue-attack.png',
  sheepIdle: 'assets/units/sheep-idle.png',    // 128x128 ×6 帧
  // 建筑（Update010 + 破坏残骸）
  castle: 'assets/buildings/castle.png',       // 320x256
  castleDestroyed: 'assets/buildings/castle_destroyed.png',
  tower: 'assets/buildings/tower.png',         // 128x256
  towerDestroyed: 'assets/buildings/tower_destroyed.png',
  house: 'assets/buildings/house.png',         // 128x192
  houseDestroyed: 'assets/buildings/house_destroyed.png',
  goldmine: 'assets/deco/goldmine.png',        // 192x128
  // 哥布林敌人（192x192 多行表，7列）
  goblinTorch: 'assets/goblins/torch.png',     // idle0-6 run7-13 attack14-20
  goblinTnt: 'assets/goblins/tnt.png',         // idle0-5 run7-12 throw14-20
  dynamite: 'assets/goblins/dynamite.png',     // 64x64 ×6
  // 骑士阵营敌人（免费包，单动画整图，无空帧）
  warriorRedIdle: 'assets/units/warrior-red-idle.png',     // 192x192 ×8
  warriorRedRun: 'assets/units/warrior-red-run.png',       // ×6
  warriorRedAttack: 'assets/units/warrior-red-attack.png', // ×4
  archerRedIdle: 'assets/units/archer-red-idle.png',       // ×6
  archerRedRun: 'assets/units/archer-red-run.png',         // ×4
  archerRedShoot: 'assets/units/archer-red-shoot.png',     // ×8
  arrowRed: 'assets/units/arrow-red.png',                  // 64x64
  // 装饰
  bush: 'assets/deco/bush.png',                // 128x128 ×8 帧
  rock1: 'assets/deco/rock1.png',              // 64x64
  rock2: 'assets/deco/rock2.png',
  rock3: 'assets/deco/rock3.png',
  rock4: 'assets/deco/rock4.png',
  gold1: 'assets/deco/gold1.png',              // 128x128
  gold2: 'assets/deco/gold2.png',
  gold3: 'assets/deco/gold3.png',
  stump: 'assets/deco/stump.png',              // 192x256
  cloud1: 'assets/deco/cloud1.png',            // 576x256
  cloud2: 'assets/deco/cloud2.png',
  pawnIdle: 'assets/units/pawn-idle.png',      // 192x192 ×8 村民
  // 粒子特效
  fxDust: 'assets/fx/dust.png',                // 64x64 ×8
  fxSplash: 'assets/fx/splash.png',            // 192x192 ×9
  fxBigExplosion: 'assets/fx/big-explosion.png', // 192x192 ×9
  fxBigFire: 'assets/fx/big-fire.png',         // 128x128 ×7
};

// —— 生成式中世纪 UI 资源（由 assets/generated/ui 概念图集切出的独立 PNG）——
// 在 BootScene 中以 `ui-<键名>` 作为纹理 key 加载。
export const UI_TEX = {
  heroFrame: 'assets/ui/hud/hero-frame.png',
  hpFrame: 'assets/ui/hud/hp-frame.png',
  hpFill: 'assets/ui/hud/hp-fill.png',
  xpFrame: 'assets/ui/hud/xp-frame.png',
  xpFill: 'assets/ui/hud/xp-fill.png',
  plaqueCoin: 'assets/ui/hud/plaque-coin.png',
  plaqueTimer: 'assets/ui/hud/plaque-timer.png',
  plaqueKills: 'assets/ui/hud/plaque-kills.png',
  hotbar: 'assets/ui/hud/hotbar.png',
  bannerWarning: 'assets/ui/hud/banner-warning.png',
  cardCommon: 'assets/ui/cards/card-common.png',
  cardRare: 'assets/ui/cards/card-rare.png',
  cardLegendary: 'assets/ui/cards/card-legendary.png',
  cardGlow: 'assets/ui/cards/card-glow.png',
  shopPanel: 'assets/ui/panels/shop-panel.png',
  modalPanel: 'assets/ui/panels/modal-panel.png',
  itemRow: 'assets/ui/panels/item-row.png',
  btnPrimary: 'assets/ui/panels/btn-primary.png',
  btnDanger: 'assets/ui/panels/btn-danger.png',
  btnClose: 'assets/ui/panels/btn-close.png',
  btnConfirm: 'assets/ui/panels/btn-confirm.png',
  bossFrame: 'assets/ui/boss/boss-hp-frame.png',
  bossFill: 'assets/ui/boss/boss-hp-fill.png',
  bannerWave: 'assets/ui/boss/banner-wave.png',
};

// 升级/技能图标，以 `ui-icon-<名>` 加载（assets/ui/icons/<名>.png）。
export const UI_ICONS = [
  'dmg', 'armor', 'maxhp', 'speed', 'dash', 'swordwave', 'lifesteal', 'greed',
  'cooldown', 'crit', 'fire', 'ice', 'lightning', 'bomb', 'arrows', 'warhorn',
  // 5 个新技能专属图标 (Codex 生成, assets/ui/icons/skill-*.png)
  'skill-holyburst', 'skill-arcanebolt', 'skill-thunderbolt', 'skill-flamepillar', 'skill-frostfall',
];

// 切片帧的内部填充矩形（纹理本地像素坐标），用于对齐血条 / 经验条 / Boss 条。
// hp / xp 框内部镂空（填充放框后方）；boss 框内部为暗槽（填充放框前方）。
export const UI_FRAMES = {
  hpFrame: { w: 666, h: 153, inner: { x: 70, y: 42, w: 526, h: 70 }, hollow: true },
  xpFrame: { w: 646, h: 103, inner: { x: 56, y: 30, w: 536, h: 44 }, hollow: true },
  bossFrame: { w: 679, h: 99, inner: { x: 90, y: 34, w: 528, h: 44 }, hollow: false },
  hotbar: { w: 955, h: 224, slots: [140, 274, 410, 546, 681, 816], slotY: 127, slotR: 46 },
  card: { w: 324, h: 504, iconY: 0.36, titleY: 0.655, descY: 0.83, numY: 0.10 },
  shop: { w: 369, h: 304, titleY: 0.105, bodyX0: 0.10, bodyX1: 0.92, bodyY0: 0.22, bodyY1: 0.88 },
};

export const BUILDING_HP = 120;
// 哥布林
export const GOBLIN_TORCH_HP = 36;
export const GOBLIN_MELEE_DMG = 10;
export const GOBLIN_TNT_HP = 22;
export const DYNAMITE_DMG = 16;
export const DYNAMITE_RADIUS = 80;
export const ARROW_DMG = 7;
// 金币
export const GOLD_DROP_MIN = 1;
export const GOLD_DROP_MAX = 3;

export const PLAYER_MAX_HP = 100;
export const PLAYER_ATTACK_DMG = 20;
export const ATTACK_RANGE = 78;       // 玩家近战命中半径

// 地面图集（9列×6行）左上 3×3 为草地角/边/中心
export const GROUND = {
  TL: 0, T: 1, TR: 2,
  L: 9, C: 10, R: 11,
  BL: 18, B: 19, BR: 20,
};
