// 友军小弟 (Royal Revolt 风格跟班单位)
// — 自主寻敌 + 攻击, 无敌人时跟随玩家保持队形
// — 不被敌人主动攻击 (简化设计: 它们只是输出工具人, 不需要操心血量管理)
//
// kind:
//   'knight'  近战 — 高血量, 低伤, 慢. 复用 warrior-red 贴图 + 蓝色 tint
//   'archer'  远程 — 中血量, 中伤, 长射程. 复用 archer-red + 蓝色 tint
//   'mage'    远程魔法 — 低血, 高伤, AOE 火球. 复用 archer-red + 紫色 tint
import HealthBar from './HealthBar.js?v=3';
import { playFx } from './effects.js?v=3';

const KINDS = {
  knight: {
    label: '骑士',
    icon: 'dmg',
    texture: 'warrior-red-idle', anim: 'warrior-red',
    tint: 0x80c8ff, scale: 0.85,
    kind: 'melee',
    dmg: 14, speed: 130, attackDist: 56, attackCd: 700,
    bodyW: 28, bodyH: 22, bodyOffX: 78, bodyOffY: 110,
  },
  archer: {
    label: '弓手',
    icon: 'arrows',
    texture: 'archer-red-idle', anim: 'archer-red',
    attackAnim: 'archer-red-shoot',
    tint: 0x80c8ff, scale: 0.85,
    kind: 'ranged',
    dmg: 12, speed: 115, range: 320, attackCd: 1100,
    bodyW: 26, bodyH: 22, bodyOffX: 78, bodyOffY: 110,
    projectile: 'arrow',
  },
  mage: {
    label: '法师',
    icon: 'fire',
    texture: 'archer-red-idle', anim: 'archer-red',
    attackAnim: 'archer-red-shoot',
    tint: 0xd080ff, scale: 0.85,
    kind: 'ranged',
    dmg: 22, speed: 100, range: 280, attackCd: 1600,
    bodyW: 26, bodyH: 22, bodyOffX: 78, bodyOffY: 110,
    projectile: 'fireorb',
    aoeRadius: 60,
  },
};

export const ALLY_KINDS = KINDS;

export default class Ally extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, kind = 'knight') {
    const cfg = KINDS[kind] || KINDS.knight;
    super(scene, x, y, cfg.texture, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.allyKind = kind;
    this.cfg = cfg;
    this.anim = cfg.anim;
    this.maxHp = 60;
    this.hp = this.maxHp;
    this.facing = 1;
    this.dead = false;
    this.attacking = false;
    this.lastAttack = 0;
    this.setScale(cfg.scale);
    this.setTint(cfg.tint);
    // 物理圆体
    {
      const _w = cfg.bodyW; const _h = cfg.bodyH;
      const _r = Math.round(Math.min(_w, _h) / 2);
      const _ox = cfg.bodyOffX + _w / 2 - _r;
      const _oy = cfg.bodyOffY + _h / 2 - _r;
      this.body.setCircle(_r, Math.round(_ox), Math.round(_oy));
    }
    this.bar = new HealthBar(scene, this, { width: 28, yOffset: -42 });
    this.play(`${this.anim}-idle`);
    if (cfg.attackAnim) {
      this.on(`animationcomplete-${cfg.attackAnim}`, () => { this.attacking = false; this.play(`${this.anim}-idle`); });
    } else {
      this.on(`animationcomplete-${this.anim}-attack`, () => { this.attacking = false; });
    }
  }

  // 找最近的活敌人 (boss 优先 — 高威胁加权)
  _findTarget() {
    const list = this.scene.enemies && this.scene.enemies.getChildren();
    if (!list || !list.length) return null;
    let best = null; let bestScore = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.dead || !e.active) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      const score = d - (e.isBoss ? 200 : 0); // boss 等效拉近 200px 距离
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  takeDamage() { /* 友军不受敌人主动攻击 — 占位防御性接口 */ }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.body.enable = false;
    playFx(this.scene, 'fx-dust', this.x, this.y, { scale: 0.6 });
    this.scene.tweens.add({
      targets: this, alpha: 0, duration: 280,
      onComplete: () => { if (this.bar) this.bar.destroy(); this.destroy(); },
    });
  }

  update(time) {
    if (this.dead) return;
    this.bar.update(this.hp, this.maxHp);
    if (this.attacking) { this.setVelocity(0, 0); return; }

    const target = this._findTarget();
    const player = this.scene.player;

    // 没敌人 → 跟随玩家 (保持 60px 跟随距离)
    if (!target) {
      if (!player || player.dead) { this.setVelocity(0, 0); return; }
      const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (d < 80) {
        this.setVelocity(0, 0);
        if (this.anims.currentAnim?.key !== `${this.anim}-idle`) this.play(`${this.anim}-idle`);
      } else {
        const a = Math.atan2(player.y - this.y, player.x - this.x);
        this.setVelocity(Math.cos(a) * this.cfg.speed * 0.8, Math.sin(a) * this.cfg.speed * 0.8);
        this.facing = player.x >= this.x ? 1 : -1;
        this.setFlipX(this.facing < 0);
        if (this.anims.currentAnim?.key !== `${this.anim}-run`) this.play(`${this.anim}-run`);
      }
      return;
    }

    // 有敌人 → 进攻
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    this.facing = target.x >= this.x ? 1 : -1;
    this.setFlipX(this.facing < 0);

    if (this.cfg.kind === 'ranged') {
      const range = this.cfg.range;
      if (dist <= range) {
        this.setVelocity(0, 0);
        if (time - this.lastAttack > this.cfg.attackCd) {
          this.lastAttack = time;
          this.attacking = true;
          this.play(this.cfg.attackAnim || `${this.anim}-attack`);
          this._shoot(target);
        }
      } else {
        const a = Math.atan2(target.y - this.y, target.x - this.x);
        this.setVelocity(Math.cos(a) * this.cfg.speed, Math.sin(a) * this.cfg.speed);
        if (this.anims.currentAnim?.key !== `${this.anim}-run`) this.play(`${this.anim}-run`);
      }
    } else {
      const att = this.cfg.attackDist;
      if (dist <= att) {
        this.setVelocity(0, 0);
        if (time - this.lastAttack > this.cfg.attackCd) {
          this.lastAttack = time;
          this.attacking = true;
          this.play(`${this.anim}-attack`);
          playFx(this.scene, 'fx-dust', this.x + this.facing * 22, this.y + 4, { scale: 0.4, flipX: this.facing < 0 });
          this.scene.time.delayedCall(280, () => {
            if (this.dead || target.dead || !target.active) return;
            if (Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <= att + 20) {
              target.takeDamage(this.cfg.dmg, this.x, this.y);
            }
          });
        }
      } else {
        const a = Math.atan2(target.y - this.y, target.x - this.x);
        this.setVelocity(Math.cos(a) * this.cfg.speed, Math.sin(a) * this.cfg.speed);
        if (this.anims.currentAnim?.key !== `${this.anim}-run`) this.play(`${this.anim}-run`);
      }
    }
  }

  _shoot(target) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const a = Math.atan2(dy, dx);
    const speed = 480;
    if (this.cfg.projectile === 'fireorb') {
      // 法师火球 — AOE
      const orb = this.scene.physics.add.image(this.x, this.y - 12, 'fireorb').setDepth(this.y);
      orb.setTint(0xd080ff);
      orb.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
      orb._ally = true; orb._dmg = this.cfg.dmg; orb._aoeR = this.cfg.aoeRadius || 60;
      this.scene.time.delayedCall(1400, () => orb.active && orb.destroy());
      this.scene.physics.add.overlap(orb, this.scene.enemies, (proj, en) => {
        if (!proj.active || !en || en.dead) return;
        playFx(this.scene, 'fx-explosion', proj.x, proj.y, { scale: 0.7 });
        // AOE
        const list = this.scene.enemies.getChildren();
        for (let i = 0; i < list.length; i++) {
          const e2 = list[i];
          if (!e2 || e2.dead || !e2.active) continue;
          if (Phaser.Math.Distance.Between(proj.x, proj.y, e2.x, e2.y) <= proj._aoeR) {
            e2.takeDamage(proj._dmg, proj.x, proj.y);
          }
        }
        proj.destroy();
      });
    } else {
      // 弓手箭矢
      const arrow = this.scene.physics.add.image(this.x, this.y - 12, 'arrow-red').setDepth(this.y);
      arrow.setTint(0x80c8ff);
      arrow.setRotation(a);
      arrow.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
      arrow._ally = true; arrow._dmg = this.cfg.dmg;
      this.scene.time.delayedCall(1500, () => arrow.active && arrow.destroy());
      this.scene.physics.add.overlap(arrow, this.scene.enemies, (proj, en) => {
        if (!proj.active || !en || en.dead) return;
        en.takeDamage(proj._dmg, proj.x, proj.y);
        playFx(this.scene, 'fx-dust', proj.x, proj.y, { scale: 0.4 });
        proj.destroy();
      });
    }
  }
}
