// 英雄进化阶段（达到等级自动触发）。
//
// ★★★ 接入 Codex 进化贴图的唯一一步：把 EVOLUTION_ART_READY 改成 true。★★★
//
// 文件必须按这些名字放进 `assets/units/generated/`：
//   paladin-t2-idle-strip.png  (192×192, 8 帧)
//   paladin-t2-run-strip.png   (192×192, 6 帧)
//   paladin-t2-attack-strip.png(192×192, 4 帧)
//   paladin-t3-{idle,run,attack}-strip.png  同规格
//   paladin-t4-{idle,run,attack}-strip.png  同规格
//   （可选）fx-evolve-strip.png (192×192, 10 帧) —— 进化光柱特效
//
// 开关 false 时：进化仍生效（属性跃升 + 改名 + 染色 + 闪屏 + 公告），只是不换形态贴图。
// 开关 true 时：BootScene 自动加载 9 张 strip + 注册动画，applyEvolution 自动切贴图。
export const EVOLUTION_ART_READY = true;

// 注：每段 evolution 的 animPrefix 始终用最终名（paladin-tN）。
// applyEvolution 会先看纹理是否存在，存在就切换，不存在就保留当前形态贴图——
// 所以即使开关 true 但某一形态文件缺失，游戏也不会崩。
// 注:scale 字段已弃用 — Player.applyEvolution 强制保持初始 scale 0.9,不再随进化放大
export const HERO_EVOLUTIONS = [
  {
    tier: 2,
    level: 5,
    name: '精英骑士',
    animPrefix: 'paladin-t2',
    tint: 0x9fd0ff,    // 没图时的染色;有图后此色被 applyEvolution 自动清掉
    bonus: { maxHp: 40, dmg: 6, speed: 10 },
  },
  {
    tier: 3,
    level: 10,
    name: '圣堂武士',
    animPrefix: 'paladin-t3',
    tint: 0xffcf6b,
    bonus: { maxHp: 70, dmg: 12, speed: 15, critChance: 0.05 },
  },
  {
    tier: 4,
    level: 15,
    name: '天使化身',
    animPrefix: 'paladin-t4',
    tint: 0xfff2b0,
    bonus: { maxHp: 120, dmg: 20, speed: 20, critChance: 0.08, lifesteal: 2 },
  },
];
