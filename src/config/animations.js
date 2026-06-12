// 数据驱动注册帧动画。Tiny Swords 动画为 10fps。
export const ANIMS = [
  // 玩家（蓝战士，免费包拆分表）
  { key: 'warrior-blue-idle', texture: 'warrior-blue-idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
  { key: 'warrior-blue-run', texture: 'warrior-blue-run', start: 0, end: 5, frameRate: 10, repeat: -1 },
  { key: 'warrior-blue-attack', texture: 'warrior-blue-attack', start: 0, end: 3, frameRate: 12, repeat: 0 },
  // 哥布林·火把（近战）每行 6 帧有效，第 7 格空白需避开
  { key: 'goblin-torch-idle', texture: 'goblin-torch', start: 0, end: 5, frameRate: 8, repeat: -1 },
  { key: 'goblin-torch-run', texture: 'goblin-torch', start: 7, end: 12, frameRate: 10, repeat: -1 },
  { key: 'goblin-torch-attack', texture: 'goblin-torch', start: 14, end: 19, frameRate: 12, repeat: 0 },
  // 哥布林·TNT（投弹）：idle0-5 run7-12 throw14-20（每行第7格空白，避开）
  { key: 'goblin-tnt-idle', texture: 'goblin-tnt', start: 0, end: 5, frameRate: 8, repeat: -1 },
  { key: 'goblin-tnt-run', texture: 'goblin-tnt', start: 7, end: 12, frameRate: 10, repeat: -1 },
  { key: 'goblin-tnt-throw', texture: 'goblin-tnt', start: 14, end: 20, frameRate: 12, repeat: 0 },
  { key: 'dynamite-spin', texture: 'dynamite', start: 0, end: 5, frameRate: 16, repeat: -1 },
  // 骑士阵营敌人（免费包整图）
  { key: 'warrior-red-idle', texture: 'warrior-red-idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
  { key: 'warrior-red-run', texture: 'warrior-red-run', start: 0, end: 5, frameRate: 10, repeat: -1 },
  { key: 'warrior-red-attack', texture: 'warrior-red-attack', start: 0, end: 3, frameRate: 12, repeat: 0 },
  { key: 'archer-red-idle', texture: 'archer-red-idle', start: 0, end: 5, frameRate: 8, repeat: -1 },
  { key: 'archer-red-run', texture: 'archer-red-run', start: 0, end: 3, frameRate: 10, repeat: -1 },
  { key: 'archer-red-shoot', texture: 'archer-red-shoot', start: 0, end: 7, frameRate: 12, repeat: 0 },
  // 生成敌人：骷髅 / 河豚 / 鱼人壮汉
  { key: 'bone-idle', texture: 'bone-idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
  { key: 'bone-run', texture: 'bone-run', start: 0, end: 5, frameRate: 10, repeat: -1 },
  { key: 'bone-attack', texture: 'bone-attack', start: 0, end: 7, frameRate: 14, repeat: 0 },
  { key: 'boom-idle', texture: 'boom-idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
  { key: 'boom-run', texture: 'boom-run', start: 0, end: 7, frameRate: 10, repeat: -1 },
  { key: 'boom-attack', texture: 'boom-attack', start: 0, end: 7, frameRate: 14, repeat: 0 },
  { key: 'oar-idle', texture: 'oar-idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
  { key: 'oar-run', texture: 'oar-run', start: 0, end: 7, frameRate: 10, repeat: -1 },
  { key: 'oar-attack', texture: 'oar-attack', start: 0, end: 7, frameRate: 14, repeat: 0 },
  // 长矛兵（红）—— 320x320 方形帧：idle 12 / run 6 / attack 3
  { key: 'lancer-red-idle', texture: 'lancer-red-idle', start: 0, end: 11, frameRate: 10, repeat: -1 },
  { key: 'lancer-red-run', texture: 'lancer-red-run', start: 0, end: 5, frameRate: 10, repeat: -1 },
  { key: 'lancer-red-attack', texture: 'lancer-red-attack', start: 0, end: 2, frameRate: 10, repeat: 0 },
  // 工兵（红）
  { key: 'pawn-red-idle', texture: 'pawn-red-idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
  { key: 'pawn-red-run', texture: 'pawn-red-run', start: 0, end: 5, frameRate: 10, repeat: -1 },
  { key: 'pawn-red-attack', texture: 'pawn-red-attack', start: 0, end: 5, frameRate: 12, repeat: 0 },
  // 环境生物
  { key: 'tree-sway', texture: 'tree', start: 0, end: 7, frameRate: 6, repeat: -1 },
  { key: 'bush-sway', texture: 'bush', start: 0, end: 7, frameRate: 4, repeat: -1 },
  { key: 'sheep-idle', texture: 'sheep-idle', start: 0, end: 5, frameRate: 6, repeat: -1 },
  { key: 'pawn-idle', texture: 'pawn-idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
  // 粒子特效
  { key: 'fx-dust', texture: 'fx-dust', start: 0, end: 7, frameRate: 18, repeat: 0 },
  { key: 'fx-splash', texture: 'fx-splash', start: 0, end: 8, frameRate: 14, repeat: 0 },
  { key: 'fx-explosion', texture: 'fx-explosion', start: 0, end: 8, frameRate: 18, repeat: 0 },
  { key: 'fx-fire', texture: 'fx-fire', start: 0, end: 6, frameRate: 12, repeat: -1 },
  { key: 'foam', texture: 'foam', start: 0, end: 7, frameRate: 8, repeat: -1 },
  // Codex 生成的主角攻击特效
  { key: 'fx-slash', texture: 'fx-slash', start: 0, end: 7, frameRate: 20, repeat: 0 },
  { key: 'fx-holyaura', texture: 'fx-holyaura', start: 0, end: 6, frameRate: 16, repeat: 0 },
  { key: 'fx-swordwave-anim', texture: 'fx-swordwave-anim', start: 0, end: 5, frameRate: 16, repeat: 0 },
  { key: 'fx-fireball-trail', texture: 'fx-fireball-trail', start: 0, end: 5, frameRate: 14, repeat: -1 },
  { key: 'fx-fireball-spell', texture: 'fx-fireball-spell', start: 0, end: 8, frameRate: 20, repeat: 0 },
  // 5 个新肉鸽技能动画 (一次性, 不循环)
  { key: 'fx-holy-burst',     texture: 'fx-holy-burst',     start: 0, end: 8,  frameRate: 18, repeat: 0 },
  { key: 'fx-arcane-impact',  texture: 'fx-arcane-impact',  start: 0, end: 7,  frameRate: 16, repeat: 0 },
  { key: 'fx-thunder-strike', texture: 'fx-thunder-strike', start: 0, end: 10, frameRate: 22, repeat: 0 },
  { key: 'fx-flame-pillar',   texture: 'fx-flame-pillar',   start: 0, end: 5,  frameRate: 12, repeat: 0 },
  { key: 'fx-frost-burst',    texture: 'fx-frost-burst',    start: 0, end: 9,  frameRate: 18, repeat: 0 },
  { key: 'fx-impact', texture: 'fx-impact', start: 0, end: 6, frameRate: 20, repeat: 0 },
  // 第二批：晶体拾取 / 升级光环 / 晶体微光
  { key: 'fx-gem-pickup', texture: 'fx-gem-pickup', start: 0, end: 5, frameRate: 18, repeat: 0 },
  { key: 'fx-levelup-aura', texture: 'fx-levelup-aura', start: 0, end: 7, frameRate: 16, repeat: 0 },
  { key: 'gem-sparkle', texture: 'gem-sparkle', start: 0, end: 3, frameRate: 8, repeat: -1 },
  { key: 'fx-sword-nova', texture: 'fx-sword-nova', start: 0, end: 7, frameRate: 22, repeat: 0 },
  // 英雄进化形态动画（仅在 EVOLUTION_ART_READY=true 时纹理才存在；
  // 注册无害——纹理不存在 generateFrameNumbers 会跳过，不会崩。Phaser 会忽略空动画。）
  { key: 'paladin-t2-idle', texture: 'paladin-t2-idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
  { key: 'paladin-t2-run', texture: 'paladin-t2-run', start: 0, end: 5, frameRate: 10, repeat: -1 },
  { key: 'paladin-t2-attack', texture: 'paladin-t2-attack', start: 0, end: 3, frameRate: 12, repeat: 0 },
  { key: 'paladin-t3-idle', texture: 'paladin-t3-idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
  { key: 'paladin-t3-run', texture: 'paladin-t3-run', start: 0, end: 5, frameRate: 10, repeat: -1 },
  { key: 'paladin-t3-attack', texture: 'paladin-t3-attack', start: 0, end: 3, frameRate: 12, repeat: 0 },
  { key: 'paladin-t4-idle', texture: 'paladin-t4-idle', start: 0, end: 7, frameRate: 8, repeat: -1 },
  { key: 'paladin-t4-run', texture: 'paladin-t4-run', start: 0, end: 5, frameRate: 10, repeat: -1 },
  { key: 'paladin-t4-attack', texture: 'paladin-t4-attack', start: 0, end: 3, frameRate: 12, repeat: 0 },
  { key: 'fx-evolve', texture: 'fx-evolve', start: 0, end: 9, frameRate: 18, repeat: 0 },
  // 水面岸边 foam 循环（V3 island-kit）
  { key: 'ik-water-foam', texture: 'ik-water-foam', start: 0, end: 5, frameRate: 8, repeat: -1 },
];

export function registerAnimations(scene) {
  ANIMS.forEach((a) => {
    if (scene.anims.exists(a.key)) return;
    // 纹理不存在就跳过（开关 false 时进化贴图未加载，避免崩溃）
    if (!scene.textures.exists(a.texture)) return;
    const frameSpec = a.frames ? { frames: a.frames } : { start: a.start, end: a.end };
    scene.anims.create({
      key: a.key,
      frames: scene.anims.generateFrameNumbers(a.texture, frameSpec),
      frameRate: a.frameRate,
      repeat: a.repeat,
    });
  });
}
