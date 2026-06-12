import HealthBar from './HealthBar.js?v=3';
import { playFx, damageText } from './effects.js?v=3';

// 全图仇恨 — 敌人从出生点开始就一直找玩家(不再因距离远停在原地)
const AGGRO = 99999;
const TOO_CLOSE = 120;

// 通用远程敌人（哥布林 TNT 投弹 / 红骑士弓箭手射箭，由 opts 配置）。
export default class RangedEnemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y, opts.texture ?? 'goblin-tnt', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.anim = opts.anim ?? 'goblin-tnt';
    this.attackAnim = opts.attackAnim ?? 'goblin-tnt-throw';
    this.projectile = opts.projectile ?? 'dynamite';
    this.maxHp = opts.hp ?? 22;
    this.hp = this.maxHp;
    this.dmg = opts.dmg ?? 8;
    this.speed = opts.speed ?? 80;
    this.gold = opts.gold ?? 0;
    this.range = opts.range ?? 240;
    this.windup = opts.windup ?? 420;
    this.cooldown = opts.cooldown ?? 1800;

    this.setScale(opts.scale ?? 0.9);
    // 圆形体 — 网格阶梯地形不卡顿
    this.body.setCircle(15, 81, 108);

    this.firing = false;
    this.dead = false;
    this.lastShot = 0;
    this.facing = -1;
    this.play(`${this.anim}-idle`);
    this.bar = new HealthBar(scene, this, { width: 34 });
    this.on(`animationcomplete-${this.attackAnim}`, () => { this.firing = false; });
  }

  takeDamage(dmg, fromX, fromY) {
    if (this.dead) return;
    this.hp -= dmg;
    damageText(this.scene, this.x, this.y - 44, dmg, '#ffe070');
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => { if (!this.dead) this.clearTint(); });
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.setVelocity(Math.cos(a) * 180, Math.sin(a) * 180);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.body.enable = false;
    playFx(this.scene, 'fx-explosion', this.x, this.y - 24, { scale: 0.7 });
    this.scene.dropGold(this.x, this.y, this.gold);
    this.scene.onEnemyKilled(this);
    this.scene.tweens.add({
      targets: this, alpha: 0, scaleX: this.scaleX * 0.7, scaleY: this.scaleY * 0.7, duration: 320,
      onComplete: () => { this.bar.destroy(); this.destroy(); },
    });
  }

  update(player, time) {
    if (this.dead) return;
    this.bar.update(this.hp, this.maxHp);
    // 被斩击击退中: 保持击飞速度, AI 暂不接管 (顿挫感)
    if (this._staggerUntil && time < this._staggerUntil) return;
    if (this.firing) { this.setVelocity(0, 0); return; }

    const target = this.scene.chooseEnemyTarget ? this.scene.chooseEnemyTarget(this, player) : player;
    const targetDead = target.dead || target.destroyed;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (targetDead || dist > AGGRO) {
      this.setVelocity(0, 0);
      if (this.anims.currentAnim?.key !== `${this.anim}-idle`) this.play(`${this.anim}-idle`);
      return;
    }

    this.facing = target.x >= this.x ? 1 : -1;
    this.setFlipX(this.facing < 0);

    if (dist < TOO_CLOSE) {
      const a = Math.atan2(this.y - target.y, this.x - target.x);
      this.setVelocity(Math.cos(a) * this.speed, Math.sin(a) * this.speed);
      if (this.anims.currentAnim?.key !== `${this.anim}-run`) this.play(`${this.anim}-run`);
    } else if (dist <= this.range) {
      this.setVelocity(0, 0);
      if (time - this.lastShot > this.cooldown) {
        this.lastShot = time;
        this.firing = true;
        this.play(this.attackAnim);
        this.scene.time.delayedCall(this.windup, () => {
          if (!this.dead && !(target.dead || target.destroyed)) {
            if (target.isVillageCore) {
              playFx(this.scene, 'fx-explosion', target.x, target.y - 62, { scale: 0.55, depth: target.y + 40 });
              target.takeDamage(this.dmg);
            } else {
              this.scene.fireProjectile(this.projectile, this.x, this.y, target.x, target.y);
            }
          }
        });
      } else if (this.anims.currentAnim?.key !== `${this.anim}-idle`) {
        this.play(`${this.anim}-idle`);
      }
    } else {
      // 每只敌人对玩家有自己的瞄准偏移,2-5s 刷新,避免直线撞墙
      if (!this._aim || time > this._aimUntil) {
        this._aim = { x: Phaser.Math.Between(-60, 60), y: Phaser.Math.Between(-60, 60) };
        this._aimUntil = time + Phaser.Math.Between(2000, 5000);
      }
      const tx = target.x + this._aim.x;
      const ty = target.y + this._aim.y;
      let a = Math.atan2(ty - this.y, tx - this.x);
      let vx = Math.cos(a); let vy = Math.sin(a);
      // 智能避障 — 承诺到底版本 (同 MeleeEnemy):决定绕墙就走到完全脱离
      const b = this.body;
      const bx = b ? ((b.blocked.left || b.touching.left) ? -1
                  : (b.blocked.right || b.touching.right) ? 1 : 0) : 0;
      const by = b ? ((b.blocked.up || b.touching.up) ? -1
                  : (b.blocked.down || b.touching.down) ? 1 : 0) : 0;
      const blocked = bx !== 0 || by !== 0;
      if (this._lastPos == null) this._lastPos = { x: this.x, y: this.y, t: time };
      const moved = Phaser.Math.Distance.Between(this.x, this.y, this._lastPos.x, this._lastPos.y);
      if (moved > 12) { this._lastPos = { x: this.x, y: this.y, t: time }; }
      const stuck = !blocked && (time - this._lastPos.t > 500) && moved < 12;
      if (blocked || stuck) {
        if (this._slideCommit == null || time > this._slideCommit) {
          this._slideDir = Math.random() < 0.5 ? -1 : 1;
          this._slideCommit = time + 2500;
          this._slideClearAt = null;
        }
        if (blocked) {
          if (bx !== 0 && by === 0) {
            vx = -bx * 0.15; vy = this._slideDir;
          } else if (by !== 0 && bx === 0) {
            vx = this._slideDir; vy = -by * 0.15;
          } else {
            vx = -bx * 0.8; vy = -by * 0.8;
          }
          this._slideClearAt = null;
        } else {
          a += this._slideDir * Math.PI / 2;
          vx = Math.cos(a); vy = Math.sin(a);
        }
      } else if (this._slideCommit) {
        if (!this._slideClearAt) this._slideClearAt = time + 350;
        if (time > this._slideClearAt) { this._slideCommit = null; this._slideClearAt = null; }
      }
      const sep = this._computeSeparation(70);
      if (sep) { vx += sep.x * 0.9; vy += sep.y * 0.9; }
      const mag = Math.hypot(vx, vy) || 1;
      this.setVelocity((vx / mag) * this.speed, (vy / mag) * this.speed);
      if (this.anims.currentAnim?.key !== `${this.anim}-run`) this.play(`${this.anim}-run`);
    }
  }

  // 同伴互斥 — 同 MeleeEnemy
  _computeSeparation(R) {
    const list = this.scene.enemies && this.scene.enemies.getChildren();
    if (!list) return null;
    const R2 = R * R;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o || o === this || o.dead) continue;
      const dx = this.x - o.x; const dy = this.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < R2) {
        const w = 1 - Math.sqrt(d2) / R;
        const inv = 1 / Math.sqrt(d2);
        sx += dx * inv * w; sy += dy * inv * w;
        n++;
      }
    }
    if (!n) return null;
    const mag = Math.hypot(sx, sy);
    if (!mag) return null;
    return { x: sx / mag, y: sy / mag };
  }
}
