// 三岛屿配置：玩家通关一岛后过桥进入下一岛，状态(HP/等级/武器/装备/金币)保留
//
// 第 1 岛 = 草原(当前),第 2 岛 = 雪原,第 3 岛 = 火山
// 雪原/火山贴图等 Codex 出图后切换 themeReady=true 即可

export const ISLANDS = [
  {
    idx: 0,
    name: '翠绿草原',
    sub: '新人的故乡',
    palette: { sky: '#7bc04a', water: 0x4ea3ff },
    // 已有 grass kit，本岛 themeReady 始终 true
    themeReady: true,
    grassKey: 'ik-grass-base',
    grassVarA: 'ik-grass-varA',
    grassVarB: 'ik-grass-varB',
    enemyPool: ['imp', 'torch', 'bone', 'boom', 'warrior'],
    bossType: 'torch',         // 哥布林首领（原 boss）
    bossName: '哥布林首领',
    spawnMultiplier: 1.0,      // 难度倍率
    bossHpMult: 1.0,
  },
  {
    idx: 1,
    name: '冰封雪原',
    sub: '寒风刺骨之地',
    palette: { sky: '#c8e7f5', water: 0x7fb8d4 },
    themeReady: false,           // Codex 出雪原贴图后改 true
    grassKey: 'ik-grass-base',   // 没图时回退用草地
    grassVarA: 'ik-grass-varA',
    grassVarB: 'ik-grass-varB',
    tint: 0xb8d8e8,              // 没图时给地表加冷色 tint 假装雪
    enemyPool: ['bone', 'archer', 'lancer', 'pawn', 'oar'],
    bossType: 'lancer',
    bossName: '冰霜骑士',
    spawnMultiplier: 1.4,
    bossHpMult: 1.6,
  },
  {
    idx: 2,
    name: '炽热火山',
    sub: '终极试炼',
    palette: { sky: '#3a1f12', water: 0xb0432a },
    themeReady: false,
    grassKey: 'ik-grass-base',
    grassVarA: 'ik-grass-varA',
    grassVarB: 'ik-grass-varB',
    tint: 0xc88060,
    enemyPool: ['tnt', 'archer', 'warrior', 'lancer', 'torch'],
    bossType: 'warrior',
    bossName: '熔岩魔将',
    spawnMultiplier: 1.8,
    bossHpMult: 2.4,
  },
];

// 取下一岛 idx,最后一岛过桥后回到第 1 岛(无限循环) → 通关算赢
export function nextIslandIdx(cur) {
  return (cur + 1) % ISLANDS.length;
}
