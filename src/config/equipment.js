// 装备系统数据。三个槽位：武器 / 护甲 / 饰品。
//
// 现在「图标还没到位」：每件装备带一个 emoji 兜底图标（fallbackIcon），
// 等 Codex 出 assets/ui/icons/equipment/<icon>.png 后，UI 会自动优先用 PNG（纹理键 ui-eq-<icon>）。
//
// 词条（stats）直接加到 player 上的同名属性：
//   maxHp / dmg / speed / critChance / critDmg / lifesteal / haste / goldMult / pickupRange
// 这些都是 Player 已有的可被加成字段，所以装备效果即插即用。
//
// rarity 决定边框颜色与商店价格倍率。

// Codex 的装备图标到位后，把这里设为 true，BootScene 会加载
// assets/ui/icons/equipment/<icon>.png（纹理键 ui-eq-<icon>）。
// false 时面板用 emoji 兜底图标，逻辑完全一致。
export const EQUIP_ICONS_READY = false;

export const EQUIP_SLOTS = ['weapon', 'armor', 'trinket'];

export const SLOT_LABELS = {
  weapon: '武器',
  armor: '护甲',
  trinket: '饰品',
};

export const RARITY = {
  common: { name: '普通', color: 0xb9c2cc, costMul: 1.0 },
  rare: { name: '稀有', color: 0x4ea3ff, costMul: 1.8 },
  epic: { name: '史诗', color: 0xb06bff, costMul: 3.0 },
  legendary: { name: '传说', color: 0xffc23d, costMul: 5.0 },
};

// id 唯一；icon 对应 Codex 装备图标文件名（无扩展名）；fallbackIcon 是没图时的 emoji。
export const EQUIPMENT = [
  // —— 武器 ——
  { id: 'sword-iron', slot: 'weapon', name: '铁剑', rarity: 'common', icon: 'sword-iron', fallbackIcon: '🗡️', baseCost: 20, stats: { dmg: 6 } },
  { id: 'sword-flame', slot: 'weapon', name: '烈焰剑', rarity: 'epic', icon: 'sword-flame', fallbackIcon: '🔥', baseCost: 60, stats: { dmg: 14, critChance: 0.04 } },
  { id: 'axe-battle', slot: 'weapon', name: '战斧', rarity: 'rare', icon: 'axe-battle', fallbackIcon: '🪓', baseCost: 40, stats: { dmg: 11, critDmg: 0.2 } },
  { id: 'staff-fire', slot: 'weapon', name: '火焰法杖', rarity: 'rare', icon: 'staff-fire', fallbackIcon: '🔮', baseCost: 40, stats: { dmg: 9, haste: 0.06 } },
  { id: 'dagger-twin', slot: 'weapon', name: '双生匕首', rarity: 'epic', icon: 'dagger-twin', fallbackIcon: '🗡️', baseCost: 55, stats: { dmg: 8, critChance: 0.08, speed: 8 } },

  // —— 护甲 ——
  { id: 'armor-leather', slot: 'armor', name: '皮甲', rarity: 'common', icon: 'armor-leather', fallbackIcon: '🦺', baseCost: 18, stats: { maxHp: 25 } },
  { id: 'armor-plate', slot: 'armor', name: '板甲', rarity: 'rare', icon: 'armor-plate', fallbackIcon: '🛡️', baseCost: 45, stats: { maxHp: 60, speed: -5 } },
  { id: 'armor-mage', slot: 'armor', name: '法师长袍', rarity: 'rare', icon: 'armor-mage', fallbackIcon: '🧥', baseCost: 42, stats: { maxHp: 30, haste: 0.08 } },
  { id: 'shield-round', slot: 'armor', name: '圆盾', rarity: 'common', icon: 'shield-round', fallbackIcon: '🛡️', baseCost: 22, stats: { maxHp: 35 } },
  { id: 'shield-tower', slot: 'armor', name: '塔盾', rarity: 'epic', icon: 'shield-tower', fallbackIcon: '🛡️', baseCost: 65, stats: { maxHp: 100, speed: -10 } },

  // —— 饰品 ——
  { id: 'ring-power', slot: 'trinket', name: '力量之戒', rarity: 'rare', icon: 'ring-power', fallbackIcon: '💍', baseCost: 38, stats: { dmg: 8 } },
  { id: 'ring-haste', slot: 'trinket', name: '急速之戒', rarity: 'rare', icon: 'ring-haste', fallbackIcon: '💍', baseCost: 38, stats: { haste: 0.12 } },
  { id: 'amulet-life', slot: 'trinket', name: '生命护符', rarity: 'epic', icon: 'amulet-life', fallbackIcon: '📿', baseCost: 50, stats: { maxHp: 50, lifesteal: 2 } },
  { id: 'boots-swift', slot: 'trinket', name: '疾行之靴', rarity: 'common', icon: 'boots-swift', fallbackIcon: '👢', baseCost: 24, stats: { speed: 25 } },
  { id: 'cloak-shadow', slot: 'trinket', name: '暗影斗篷', rarity: 'epic', icon: 'cloak-shadow', fallbackIcon: '🧣', baseCost: 55, stats: { critChance: 0.06, speed: 12 } },
  { id: 'crown-king', slot: 'trinket', name: '王者之冠', rarity: 'legendary', icon: 'crown-king', fallbackIcon: '👑', baseCost: 90, stats: { dmg: 10, maxHp: 40, goldMult: 0.5 } },
];

export const EQUIP_BY_ID = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e]));

// 装备升级：每件可升 +1~+5，每级把 stats 乘以 (1 + 0.25*level) 取整，升级费随等级递增。
export const MAX_EQUIP_LEVEL = 5;

export function scaledStats(def, level) {
  const mul = 1 + 0.25 * (level - 1);
  const out = {};
  for (const [k, v] of Object.entries(def.stats)) out[k] = Math.round(v * mul);
  return out;
}

export function upgradeCost(def, level) {
  // 升到 level+1 的费用
  return Math.round(def.baseCost * 0.6 * (level + 1) * RARITY[def.rarity].costMul);
}

export function buyCost(def) {
  return Math.round(def.baseCost * RARITY[def.rarity].costMul);
}
