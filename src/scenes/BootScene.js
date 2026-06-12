import { ASSETS, TILE, UNIT_FRAME, UI_TEX, UI_ICONS } from '../config/constants.js?v=3';
import { EQUIPMENT, EQUIP_ICONS_READY } from '../config/equipment.js?v=3';
import { EVOLUTION_ART_READY } from '../config/evolution.js?v=3';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // 地形
    this.load.spritesheet('ground', ASSETS.ground, { frameWidth: TILE, frameHeight: TILE });
    this.load.spritesheet('pathtile', ASSETS.path, { frameWidth: TILE, frameHeight: TILE });
    this.load.image('terrain-forest', ASSETS.terrainForest);
    this.load.image('terrain-mine', ASSETS.terrainMine);
    this.load.image('terrain-ruins', ASSETS.terrainRuins);
    this.load.image('terrain-village', ASSETS.terrainVillage);
    this.load.image('terrain-coast', ASSETS.terrainCoast);
    this.load.spritesheet('bridge', ASSETS.bridge, { frameWidth: TILE, frameHeight: TILE });
    this.load.image('water', ASSETS.water);
    this.load.image('cave', ASSETS.cave);
    this.load.spritesheet('waterrock1', ASSETS.waterrock1, { frameWidth: TILE, frameHeight: TILE });
    this.load.spritesheet('waterrock2', ASSETS.waterrock2, { frameWidth: TILE, frameHeight: TILE });
    this.load.spritesheet('foam', ASSETS.foam, { frameWidth: UNIT_FRAME, frameHeight: UNIT_FRAME });
    this.load.image('scarecrow', ASSETS.scarecrow);
    for (let i = 1; i <= 15; i++) {
      this.load.image(`deco${i}`, `assets/deco/scatter/d${String(i).padStart(2, '0')}.png`);
    }
    this.load.spritesheet('tree', ASSETS.tree, { frameWidth: UNIT_FRAME, frameHeight: 256 });

    // 单位
    const unit = { frameWidth: UNIT_FRAME, frameHeight: UNIT_FRAME };
    this.load.spritesheet('warrior-blue-idle', ASSETS.warriorBlueIdle, unit);
    this.load.spritesheet('warrior-blue-run', ASSETS.warriorBlueRun, unit);
    this.load.spritesheet('warrior-blue-attack', ASSETS.warriorBlueAttack, unit);
    this.load.spritesheet('goblin-torch', ASSETS.goblinTorch, unit);
    this.load.spritesheet('goblin-tnt', ASSETS.goblinTnt, unit);
    this.load.spritesheet('dynamite', ASSETS.dynamite, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('warrior-red-idle', ASSETS.warriorRedIdle, unit);
    this.load.spritesheet('warrior-red-run', ASSETS.warriorRedRun, unit);
    this.load.spritesheet('warrior-red-attack', ASSETS.warriorRedAttack, unit);
    this.load.spritesheet('archer-red-idle', ASSETS.archerRedIdle, unit);
    this.load.spritesheet('archer-red-run', ASSETS.archerRedRun, unit);
    this.load.spritesheet('archer-red-shoot', ASSETS.archerRedShoot, unit);
    this.load.image('arrow-red', ASSETS.arrowRed);
    // 生成敌人（64x64 动画条）：骷髅 / 河豚 / 鱼人壮汉
    const gen = (k, file) => this.load.spritesheet(k, `assets/generated/enemies/${file}`, { frameWidth: 64, frameHeight: 64 });
    gen('bone-idle', 'bone-buckler-idle-strip.png');
    gen('bone-run', 'bone-buckler-run-strip-clean6.png');
    gen('bone-attack', 'bone-buckler-attack-strip.png');
    gen('boom-idle', 'boomspike-puffer-idle-strip.png');
    gen('boom-run', 'boomspike-puffer-run-strip.png');
    gen('boom-attack', 'boomspike-puffer-attack-strip.png');
    gen('oar-idle', 'oarfin-bruiser-idle-strip.png');
    gen('oar-run', 'oarfin-bruiser-run-strip.png');
    gen('oar-attack', 'oarfin-bruiser-attack-strip.png');
    // 红色长矛兵（320x320 方形帧，角色居中）+ 红色工兵（192x192）
    this.load.spritesheet('lancer-red-idle', 'assets/units/lancer-red-idle.png', { frameWidth: 320, frameHeight: 320 });
    this.load.spritesheet('lancer-red-run', 'assets/units/lancer-red-run.png', { frameWidth: 320, frameHeight: 320 });
    this.load.spritesheet('lancer-red-attack', 'assets/units/lancer-red-attack.png', { frameWidth: 320, frameHeight: 320 });
    this.load.spritesheet('pawn-red-idle', 'assets/units/pawn-red-idle.png', unit);
    this.load.spritesheet('pawn-red-run', 'assets/units/pawn-red-run.png', unit);
    this.load.spritesheet('pawn-red-attack', 'assets/units/pawn-red-attack.png', unit);
    this.load.spritesheet('sheep-idle', ASSETS.sheepIdle, { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('pawn-idle', ASSETS.pawnIdle, unit);

    // 建筑 + 破坏残骸
    this.load.image('castle', ASSETS.castle);
    this.load.image('castle_destroyed', ASSETS.castleDestroyed);
    this.load.image('tower', ASSETS.tower);
    this.load.image('tower_destroyed', ASSETS.towerDestroyed);
    this.load.image('house', ASSETS.house);
    this.load.image('house_destroyed', ASSETS.houseDestroyed);
    this.load.image('goldmine', ASSETS.goldmine);
    this.load.image('village-core', 'assets/buildings/village-core.png');
    this.load.image('village-core-damaged', 'assets/buildings/village-core-damaged.png');
    this.load.image('village-core-critical', 'assets/buildings/village-core-critical.png');
    this.load.image('village-core-destroyed', 'assets/buildings/village-core-destroyed.png');

    // 装饰
    this.load.spritesheet('bush', ASSETS.bush, { frameWidth: 128, frameHeight: 128 });
    this.load.image('rock1', ASSETS.rock1);
    this.load.image('rock2', ASSETS.rock2);
    this.load.image('rock3', ASSETS.rock3);
    this.load.image('rock4', ASSETS.rock4);
    this.load.image('gold1', ASSETS.gold1);
    this.load.image('gold2', ASSETS.gold2);
    this.load.image('gold3', ASSETS.gold3);
    this.load.image('stump', ASSETS.stump);
    this.load.image('cloud1', ASSETS.cloud1);
    this.load.image('cloud2', ASSETS.cloud2);
    this.load.image('home-bg-iso', 'assets/ui/home/home-bg-iso.png');
    this.load.image('home-cover-poster', 'assets/ui/home/home-cover-poster.png');

    // 粒子特效（fx-explosion/fx-fire 升级为 Update010 版本）
    this.load.spritesheet('fx-dust', ASSETS.fxDust, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('fx-splash', ASSETS.fxSplash, { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('fx-explosion', ASSETS.fxBigExplosion, { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('fx-fire', ASSETS.fxBigFire, { frameWidth: 128, frameHeight: 128 });
    // Codex 生成的主角攻击特效（真 alpha PNG strip）
    this.load.spritesheet('fx-slash', 'assets/fx/generated/fx-slash-final.png?v=5', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('fx-holyaura', 'assets/fx/generated/fx-holyaura-final.png?v=2', { frameWidth: 279, frameHeight: 280 });
    this.load.spritesheet('fx-swordwave-anim', 'assets/fx/generated/fx-swordwave-strip.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('fx-fireball-trail', 'assets/fx/generated/fx-fireball-trail-strip.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('fx-fireball-spell', 'assets/fx/generated/fx-fireball-spell-final.png?v=2', { frameWidth: 266, frameHeight: 266 });
    // 5 个新肉鸽技能特效
    this.load.spritesheet('fx-holy-burst',     'assets/fx/generated/fx-holy-burst-final.png?v=2',     { frameWidth: 216, frameHeight: 215 });
    this.load.spritesheet('fx-arcane-impact',  'assets/fx/generated/fx-arcane-impact-final.png?v=2',  { frameWidth: 265, frameHeight: 268 });
    this.load.spritesheet('fx-thunder-strike', 'assets/fx/generated/fx-thunder-strike-final.png?v=2', { frameWidth: 194, frameHeight: 363 });
    this.load.spritesheet('fx-flame-pillar',   'assets/fx/generated/fx-flame-pillar-final.png?v=2',   { frameWidth: 462, frameHeight: 470 });
    this.load.spritesheet('fx-frost-burst',    'assets/fx/generated/fx-frost-burst-final.png?v=2',    { frameWidth: 265, frameHeight: 266 });
    this.load.spritesheet('fx-impact', 'assets/fx/generated/fx-impact-strip.png', { frameWidth: 128, frameHeight: 128 });
    // 第二批：能量晶体拾取 / 升级光环 / 晶体微光
    this.load.spritesheet('fx-gem-pickup', 'assets/fx/generated/fx-gem-pickup-strip.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('fx-levelup-aura', 'assets/fx/generated/fx-levelup-aura-strip.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('gem-sparkle', 'assets/fx/generated/gem-sparkle-strip.png', { frameWidth: 32, frameHeight: 32 });
    // 利剑环身放射剑气（替换原单边弧光）
    this.load.spritesheet('fx-sword-nova', 'assets/fx/generated/fx-sword-nova-strip.png', { frameWidth: 192, frameHeight: 192 });

    // 任何资源加载失败都明确打印，便于排查 UI 缺图
    this.load.on('loaderror', (file) => {
      // eslint-disable-next-line no-console
      console.warn(`missing ui texture: ${file.key}  (${file.url})`);
    });

    // UI 美术（中世纪肉鸽界面）
    Object.entries(UI_TEX).forEach(([k, path]) => this.load.image(`ui-${k}`, path));
    UI_ICONS.forEach((n) => this.load.image(`ui-icon-${n}`, `assets/ui/icons/${n}.png`));
    // 技能槽美术：仅在 Codex 出图后（SKILL_SLOT_READY=true）加载，否则技能栏用代码绘制槽位
    const SKILL_SLOT_READY = true; // skill-slot.png 等已生成
    if (SKILL_SLOT_READY) {
      this.load.image('ui-skillSlot', 'assets/ui/hud/skill-slot.png');
      this.load.image('ui-skillSlotActive', 'assets/ui/hud/skill-slot-active.png');
      this.load.image('ui-cooldownMask', 'assets/ui/hud/cooldown-mask.png');
    }
    // 装备图标（仅在 Codex 出图后，EQUIP_ICONS_READY=true 时加载；否则面板用 emoji 兜底）
    if (EQUIP_ICONS_READY) {
      EQUIPMENT.forEach((e) => this.load.image(`ui-eq-${e.icon}`, `assets/ui/icons/equipment/${e.icon}.png`));
    }
    // —— Island Kit：painterly 地形组件（127 个） ——
    // 全部按文件名作为纹理 key 加载：`ik-cliff-NN` / `ik-forest-NN` / `ik-path-NN` / `ik-prop-NN`
    const ISLAND_KIT_COUNTS = { cliff: 25, forest: 40, path: 40, prop: 22 };
    const ISLAND_KIT_DIRS = {
      cliff: 'island-cliffs-plateaus',
      forest: 'island-forest-rocks-flowers',
      path: 'island-path-water',
      prop: 'island-landmark-props',
    };
    Object.entries(ISLAND_KIT_COUNTS).forEach(([cat, n]) => {
      for (let i = 1; i <= n; i++) {
        const idx = String(i).padStart(2, '0');
        const file = `assets/terrain/island-kit/${ISLAND_KIT_DIRS[cat]}/${ISLAND_KIT_DIRS[cat]}-${idx}.png`;
        this.load.image(`ik-${cat}-${idx}`, file);
      }
    });
    // V2: 草地填充（painterly seamless）
    this.load.image('ik-grass-base', 'assets/terrain/island-kit/grass/grass-tile-base.png');
    this.load.image('ik-grass-varA', 'assets/terrain/island-kit/grass/grass-tile-variation-A.png');
    this.load.image('ik-grass-varB', 'assets/terrain/island-kit/grass/grass-tile-variation-B.png');
    // V2: cliff 补件（顶/左/右边 + 4 角）
    this.load.image('ik-cliff-top', 'assets/terrain/island-kit/cliffs-extra/cliff-top-edge.png');
    this.load.image('ik-cliff-left', 'assets/terrain/island-kit/cliffs-extra/cliff-left-edge.png');
    this.load.image('ik-cliff-right', 'assets/terrain/island-kit/cliffs-extra/cliff-right-edge.png');
    this.load.image('ik-cliff-tl', 'assets/terrain/island-kit/cliffs-extra/cliff-corner-tl.png');
    this.load.image('ik-cliff-tr', 'assets/terrain/island-kit/cliffs-extra/cliff-corner-tr.png');
    this.load.image('ik-cliff-bl', 'assets/terrain/island-kit/cliffs-extra/cliff-corner-bl.png');
    this.load.image('ik-cliff-br', 'assets/terrain/island-kit/cliffs-extra/cliff-corner-br.png');
    // V3 水面 + biome + 路径羽化 + 景观地标
    this.load.image('ik-water-tile', 'assets/terrain/island-kit/water/water-tile.png');
    this.load.spritesheet('ik-water-foam', 'assets/terrain/island-kit/water/water-foam-loop-strip.png',
      { frameWidth: 192, frameHeight: 64 });
    this.load.image('ik-biome-forest', 'assets/terrain/island-kit/biomes/biome-forest-floor.png');
    this.load.image('ik-biome-village', 'assets/terrain/island-kit/biomes/biome-village-floor.png');
    this.load.image('ik-biome-mine', 'assets/terrain/island-kit/biomes/biome-mine-floor.png');
    this.load.image('ik-biome-ruins', 'assets/terrain/island-kit/biomes/biome-ruins-floor.png');
    this.load.image('ik-path-edge-fade', 'assets/terrain/island-kit/path/path-edge-fade.png');
    ['stone-arch','shrine','windmill','mushroom-grove','crystal-cluster'].forEach((n) => {
      this.load.image(`ik-landmark-${n}`, `assets/terrain/island-kit/landmarks/landmark-${n}.png`);
    });
    // V3 自然小件（10 件，撒在岛上做地表细节）
    [
      'mushroom-red','mushroom-brown','mushroom-blue',
      'flower-cluster-A','flower-cluster-B','flower-cluster-C',
      'grass-tuft-A','grass-tuft-B','fallen-log','vines-A',
    ].forEach((n) => this.load.image(`ik-nature-${n}`, `assets/terrain/island-kit/nature/nature-${n}.png`));

    // 英雄进化贴图（EVOLUTION_ART_READY=true 时加载 t2/t3/t4 × idle/run/attack）
    if (EVOLUTION_ART_READY) {
      ['t2', 't3', 't4'].forEach((tier) => {
        ['idle', 'run', 'attack'].forEach((act) => {
          this.load.spritesheet(`paladin-${tier}-${act}`,
            `assets/units/generated/paladin-${tier}-${act}-strip.png`, unit);
        });
      });
      // 可选：变身光柱特效
      this.load.spritesheet('fx-evolve', 'assets/units/generated/fx-evolve-strip.png',
        { frameWidth: 192, frameHeight: 192 });
    }

    const t = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Loading…', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5);
    this.load.on('complete', () => t.destroy());
  }

  async create() {
    // 启动主城/选岛(HomeScene),玩家从那里点选岛进入战斗(WorldScene)
    // 在跳转前先把自定义英雄(若有)注册到本 Phaser 全局,后续场景直接可用
    try {
      // 先把 IDB 里的大库灌进内存 (装不下 localStorage 的自定义英雄/敌人)
      const heroMod = await import('../config/hero.js?v=3');
      const enemyMod = await import('../config/enemy.js?v=3');
      if (heroMod.hydrate) await heroMod.hydrate();
      if (enemyMod.hydrate) await enemyMod.hydrate();
      const prefix = await heroMod.ensureHeroLoaded(this);
      this.game.registry.set('heroPrefix', prefix);
    } catch (e) { /* ignore — Player 会自动回退 */ }
    this.scene.start('HomeScene');
  }
}
