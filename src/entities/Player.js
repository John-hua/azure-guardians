import { PLAYER_SPEED, PLAYER_MAX_HP, PLAYER_ATTACK_DMG, ATTACK_RANGE } from '../config/constants.js?v=3';
import { EQUIP_BY_ID, scaledStats } from '../config/equipment.js?v=3';
import { damageText } from './effects.js?v=3';
import { Sfx } from '../audio.js?v=music1';

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, animPrefix) {
    // 选定的英雄前缀 (内建 warrior-blue/warrior-red 或自定义 custom-hero)
    // 容错:纹理不存在则回退到 warrior-blue-idle
    const prefix = (animPrefix && scene.textures.exists(`${animPrefix}-idle`)) ? animPrefix : 'warrior-blue';
    super(scene, x, y, `${prefix}-idle`, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 圆形碰撞体 — 半径加大到 26 (原 18),阶梯卡顿明显减轻;
    // 中心仍在 (96, 121),半径越大跨过 16px 凹角越平滑
    this.body.setCircle(26, 70, 95);
    this.setCollideWorldBounds(true);

    // 可被肉鸽升级修改的属性
    this.maxHp = PLAYER_MAX_HP;
    this.hp = PLAYER_MAX_HP;
    this.dmg = PLAYER_ATTACK_DMG;
    this.speed = PLAYER_SPEED;
    this.range = ATTACK_RANGE;
    this.lifesteal = 0;
    this.goldMult = 1;

    // 幸存者属性
    this.pickupRange = 120;      // 经验/金币吸取半径
    this.critChance = 0.05;
    this.critDmg = 1.6;
    this.haste = 0;              // 全武器冷却缩减（0~0.6）

    // 技能属性（可被肉鸽升级修改）
    this.heavyMult = 1.8;        // 重击伤害倍率
    this.heavyCd = 1800;         // 重击冷却(ms)
    this.dashCd = 800;           // 冲刺斩冷却(ms)
    this.heavyCdUntil = 0;
    this.dashCdUntil = 0;
    this.cdReducePerKill = 0;    // 战意：击杀减少冷却(ms)

    // 额外技能冷却/状态
    this.waveCd = 800; this.waveCdUntil = 0;
    this.slashCd = 500; this.slashCdUntil = 0;  // F 横扫斩
    this.cryCd = 9000; this.cryCdUntil = 0;
    this.rageDuration = 4000;
    this.rageMult = 1; this.rageActive = false;

    this.facing = 1;
    this.attacking = false;
    this.heavyAttacking = false;
    this.dashing = false;
    this.dead = false;
    this.invuln = 0;

    // —— 进化形态 / 英雄选择 ——
    this.animPrefix = prefix; // 进化或换英雄后修改
    this.evoTier = 1;

    // —— 装备 —— 三个槽位，每个存 { id, level } 或 null
    this.equipment = { weapon: null, armor: null, trinket: null };
    this._equipApplied = {}; // 当前已施加到属性上的装备加成（用于增量更新）

    this.play(this.anim('idle'));

    // 通用动画完成监听（不写死前缀，进化换贴图后依然生效）
    this.on('animationcomplete', (anim) => {
      if (anim.key.endsWith('-attack')) {
        this.attacking = false;
        this.heavyAttacking = false;
      }
    });
  }

  // 当前形态的动画 key，例如 anim('run') -> 'warrior-blue-run'
  anim(name) { return `${this.animPrefix}-${name}`; }

  busy() { return this.attacking || this.heavyAttacking || this.dashing; }

  // 实际攻击力（含狂暴加成）
  atk() { return Math.round(this.dmg * this.rageMult); }

  attack() {
    if (this.busy() || this.dead) return false;
    this.attacking = true;
    this.setVelocity(0, 0);
    this.play(this.anim('attack'));
    return true;
  }

  // J：重击 —— 蓄力 250ms 后宽范围高伤
  heavyAttack() {
    if (this.busy() || this.dead || this.scene.time.now < this.heavyCdUntil) return false;
    this.heavyAttacking = true;
    this.heavyCdUntil = this.scene.time.now + this.heavyCd;
    this.setVelocity(0, 0);
    this.setTint(0xffdd55);
    this.scene.tweens.add({ targets: this, scaleX: this.scaleX * 1.12, scaleY: this.scaleY * 1.12, duration: 250, yoyo: true });
    this.scene.time.delayedCall(250, () => {
      if (this.dead) { this.heavyAttacking = false; return; }
      this.clearTint();
      this.play(this.anim('attack'));
      this.scene.heavyAttackHit();
    });
    return true;
  }

  // K：冲刺斩 —— 沿朝向快速位移并劈砍路径上的敌人
  dashSlash() {
    if (this.busy() || this.dead || this.scene.time.now < this.dashCdUntil) return false;
    this.dashing = true;
    this.dashCdUntil = this.scene.time.now + this.dashCd;
    const dir = this.facing;
    this.setFlipX(dir < 0);
    this.setVelocity(dir * 620, 0); // 约 120px (620 * 0.19s)
    this.play(this.anim('run'));
    // 残影
    for (let i = 1; i <= 3; i++) {
      this.scene.time.delayedCall(i * 45, () => {
        if (!this.active) return;
        const ghost = this.scene.add.image(this.x, this.y, this.texture.key, this.frame.name)
          .setScale(this.scaleX, this.scaleY).setFlipX(this.flipX).setAlpha(0.4).setTint(0x88ccff).setDepth(this.depth - 1);
        this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
      });
    }
    this.scene.dashSlashHit();
    this.scene.time.delayedCall(190, () => {
      if (this.dead) return;
      this.dashing = false;
      this.setVelocity(0, 0);
    });
    return true;
  }

  // F:横扫斩 — 站桩前向 180° 弧形大剑挥砍 (RR 国王挥剑感)
  // 略带前冲(50px),让"挥剑"有重心移动的感觉
  swingSlash() {
    if (this.busy() || this.dead || this.scene.time.now < this.slashCdUntil) return false;
    this.slashCdUntil = this.scene.time.now + this.slashCd;
    this.attacking = true;
    const dir = this.facing;
    // 极短前冲 (60ms,~50px),冲完归零
    this.setVelocity(dir * 380, 0);
    this.scene.time.delayedCall(60, () => { if (!this.dead) this.setVelocity(0, 0); });
    this.play(this.anim('attack'));
    this.scene.swingSlashHit();
    return true;
  }

  // U：剑气波 —— 向前发射穿透剑气
  swordWave() {
    if (this.busy() || this.dead || this.scene.time.now < this.waveCdUntil) return false;
    this.waveCdUntil = this.scene.time.now + this.waveCd;
    this.play(this.anim('attack'));
    this.scene.swordWaveHit();
    return true;
  }

  // I：战吼 —— 短暂狂暴 + 击退周围敌人
  warCry() {
    if (this.dead || this.scene.time.now < this.cryCdUntil) return false;
    this.cryCdUntil = this.scene.time.now + this.cryCd;
    this.rageMult = 1.5;
    this.rageActive = true;
    this.setTint(0xff9944);
    this.scene.warCryHit();
    this.scene.time.delayedCall(this.rageDuration, () => {
      this.rageMult = 1;
      this.rageActive = false;
      if (!this.dead) this.clearTint();
    });
    return true;
  }

  heal(amount) {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  takeDamage(dmg) {
    if (this.dead || this.scene.time.now < this.invuln) return;
    // 和平/编辑模式无敌
    if (this.scene._peaceful || this.scene._editorActive) return;
    this.invuln = this.scene.time.now + 600;
    this.hp -= dmg;
    damageText(this.scene, this.x, this.y - 54, dmg, '#ff5555');
    this.setTintFill(0xff4444);
    this.scene.time.delayedCall(100, () => this.clearTint());
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.setVelocity(0, 0);
      this.setTint(0x777777);
      Sfx.death();
    } else {
      Sfx.hurt();
    }
  }

  // —— 进化：应用某个 tier 的属性跃升 + 换贴图/染色 ——
  // 智能贴图切换：纹理存在就用新形态，不存在就保留当前形态并用 tint 区分。
  // 这样 art_ready 开关误开或某一 tier 文件缺失，游戏也不会崩、不会变成空精灵。
  applyEvolution(evo) {
    this.evoTier = evo.tier;
    const b = evo.bonus || {};
    if (b.maxHp) { this.maxHp += b.maxHp; this.hp = Math.min(this.maxHp, this.hp + b.maxHp); }
    if (b.dmg) this.dmg += b.dmg;
    if (b.speed) this.speed += b.speed;
    if (b.critChance) this.critChance += b.critChance;
    if (b.critDmg) this.critDmg += b.critDmg;
    if (b.lifesteal) this.lifesteal += b.lifesteal;
    // 切换形态贴图（纹理 + 动画都得在）
    const hasArt = evo.animPrefix && this.scene.textures.exists(`${evo.animPrefix}-idle`)
      && this.scene.anims.exists(`${evo.animPrefix}-idle`);
    if (hasArt) {
      this.animPrefix = evo.animPrefix;
      this.clearTint();
    } else if (evo.tint) {
      this.setTint(evo.tint);
    }
    // 进化不再放大形象 (用户要求保持和基础形态一样大小)
    // evo.scale 字段忽略,始终用基础 scale 0.9
    this.setScale(0.9);
    // 重新固化圆形碰撞体 — 防止 scale 切换后 body offset/radius 失同步
    if (this.body && this.body.setCircle) this.body.setCircle(26, 70, 95);
    // 立刻刷新当前动画为新形态
    this.play(this.anim(this.busy() ? 'attack' : 'idle'));
  }

  // —— 装备：给某个槽位装上/替换，增量重算属性 ——
  equip(def, level = 1) {
    if (!def) return;
    this.unequipSlot(def.slot, true);
    this.equipment[def.slot] = { id: def.id, level };
    this._applyEquipStats(def.slot);
  }

  setEquipLevel(slot, level) {
    if (!this.equipment[slot]) return;
    this.unequipSlot(slot, true);
    this.equipment[slot].level = level;
    this._applyEquipStats(slot);
  }

  unequipSlot(slot, silent = false) {
    const applied = this._equipApplied[slot];
    if (applied) {
      for (const [k, v] of Object.entries(applied)) {
        this[k] -= v;
        if (k === 'maxHp') this.hp = Math.min(this.hp, this.maxHp);
      }
      this._equipApplied[slot] = null;
    }
    if (!silent) this.equipment[slot] = null;
  }

  // 内部：把当前槽位装备的（已按等级缩放的）词条加到属性上，并记录以便回滚
  _applyEquipStats(slot) {
    const eq = this.equipment[slot];
    if (!eq) return;
    const def = EQUIP_BY_ID[eq.id];
    if (!def) return;
    const stats = scaledStats(def, eq.level);
    const applied = {};
    for (const [k, v] of Object.entries(stats)) {
      if (typeof this[k] !== 'number') continue;
      this[k] += v;
      applied[k] = v;
    }
    if (applied.maxHp) this.hp = Math.min(this.maxHp, this.hp + applied.maxHp);
    this._equipApplied[slot] = applied;
  }

  update(cursors, wasd) {
    if (!this.body || this.busy() || this.dead) return; // 无物理体时跳过，避免单帧异常卡死整局

    const left = cursors.left.isDown || wasd.left.isDown;
    const right = cursors.right.isDown || wasd.right.isDown;
    const up = cursors.up.isDown || wasd.up.isDown;
    const down = cursors.down.isDown || wasd.down.isDown;

    let vx = 0;
    let vy = 0;
    if (left) vx -= 1;
    if (right) vx += 1;
    if (up) vy -= 1;
    if (down) vy += 1;

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      const len = Math.hypot(vx, vy) || 1;
      const spd = this.speed * (this.rageActive ? 1.3 : 1);
      this.setVelocity((vx / len) * spd, (vy / len) * spd);
      if (vx !== 0) {
        this.facing = vx > 0 ? 1 : -1;
        this.setFlipX(this.facing < 0);
      }
      if (this.anims.currentAnim?.key !== this.anim('run')) this.play(this.anim('run'));
    } else {
      this.setVelocity(0, 0);
      if (this.anims.currentAnim?.key !== this.anim('idle')) this.play(this.anim('idle'));
    }
  }
}
