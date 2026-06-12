import HealthBar from './HealthBar.js?v=3';
import { playFx, damageText } from './effects.js?v=3';

// 全图仇恨 — 敌人从出生点开始就一直找玩家(不再因距离远停在原地)
const AGGRO = 99999;

// 通用近战敌人（哥布林火把 / 红骑士战士 / Boss 等，由 opts 配置）。
export default class MeleeEnemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y, opts.texture ?? 'goblin-torch', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.anim = opts.anim ?? 'goblin-torch';
    this.maxHp = opts.hp ?? 36;
    this.hp = this.maxHp;
    this.dmg = opts.dmg ?? 10;
    this.speed = opts.speed ?? 100;
    this.gold = opts.gold ?? 0;
    this.isBoss = opts.isBoss ?? false;
    this.attackDist = opts.attackDist ?? 58;
    // 部分生成素材默认朝左，翻转逻辑需反转
    this.flipBase = opts.flipBase ?? false;

    this.setScale(opts.scale ?? 0.9);
    // 圆形体 — 网格阶梯地形不卡顿
    {
      const _w = opts.bodyW ?? 40;
      const _h = opts.bodyH ?? 30;
      const _r = Math.round(Math.min(_w, _h) / 2);
      const _ox = (opts.bodyOffX ?? 76) + _w / 2 - _r;
      const _oy = (opts.bodyOffY ?? 108) + _h / 2 - _r;
      this.body.setCircle(_r, Math.round(_ox), Math.round(_oy));
    }
    if (this.isBoss) this.setTint(0xff8866);

    this.attacking = false;
    this.dead = false;
    this.lastAttack = 0;
    this.facing = -1;
    this.play(`${this.anim}-idle`);
    this.bar = new HealthBar(scene, this, { width: this.isBoss ? 70 : 34, yOffset: opts.barY ?? (this.isBoss ? -78 : -48) });
    this.on(`animationcomplete-${this.anim}-attack`, () => { this.attacking = false; });
  }

  takeDamage(dmg, fromX, fromY) {
    if (this.dead) return;
    this.hp -= dmg;
    damageText(this.scene, this.x, this.y - (this.isBoss ? 74 : 44), dmg, '#ffe070');
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (this.dead) return;
      if (this.isBoss) this.setTint(0xff8866); else this.clearTint();
    });
    if (!this.isBoss) {
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      this.setVelocity(Math.cos(a) * 190, Math.sin(a) * 190);
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.body.enable = false;
    playFx(this.scene, 'fx-explosion', this.x, this.y - 24, { scale: this.isBoss ? 1.6 : 0.7 });
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
    if (this.attacking) { this.setVelocity(0, 0); return; }

    const target = this.scene.chooseEnemyTarget ? this.scene.chooseEnemyTarget(this, player) : player;
    const targetDead = target.dead || target.destroyed;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (targetDead || dist > AGGRO) {
      this.setVelocity(0, 0);
      if (this.anims.currentAnim?.key !== `${this.anim}-idle`) this.play(`${this.anim}-idle`);
      return;
    }

    this.facing = target.x >= this.x ? 1 : -1;
    this.setFlipX(this.flipBase ? this.facing > 0 : this.facing < 0);

    const attackDist = target.isVillageCore ? Math.max(this.attackDist, target.attackDist || 76) : this.attackDist;
    if (dist <= attackDist) {
      this.setVelocity(0, 0);
      if (time - this.lastAttack > 1000) {
        this.lastAttack = time;
        this.attacking = true;
        this.play(`${this.anim}-attack`);
        playFx(this.scene, 'fx-dust', this.x + this.facing * 28, this.y + 6, { scale: 0.6, flipX: this.facing < 0 });
        this.scene.time.delayedCall(300, () => {
          if (!this.dead && !(target.dead || target.destroyed)
            && Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <= attackDist + 18) {
            target.takeDamage(this.dmg);
          }
        });
      }
    } else {
      // 每只敌人对玩家有自己的"瞄准偏移"(±60px),每 2-5s 刷新一次
      // → 同时刷新的怪不再都瞄一个点 → 路径自然散开,不会全挤一个角落
      if (!this._aim || time > this._aimUntil) {
        this._aim = { x: Phaser.Math.Between(-60, 60), y: Phaser.Math.Between(-60, 60) };
        this._aimUntil = time + Phaser.Math.Between(2000, 5000);
      }
      const tx = target.x + this._aim.x;
      const ty = target.y + this._aim.y;
      let a = Math.atan2(ty - this.y, tx - this.x);
      let vx = Math.cos(a);
      let vy = Math.sin(a);
      // 智能避障 — 关键:一旦决定绕墙就【承诺到底】,直到完全脱离墙体
      const b = this.body;
      const bx = b ? ((b.blocked.left || b.touching.left) ? -1
                  : (b.blocked.right || b.touching.right) ? 1 : 0) : 0;
      const by = b ? ((b.blocked.up || b.touching.up) ? -1
                  : (b.blocked.down || b.touching.down) ? 1 : 0) : 0;
      const blocked = bx !== 0 || by !== 0;
      // 停滞检测 (没物理碰撞但实际没动)
      if (this._lastPos == null) this._lastPos = { x: this.x, y: this.y, t: time };
      const moved = Phaser.Math.Distance.Between(this.x, this.y, this._lastPos.x, this._lastPos.y);
      if (moved > 12) { this._lastPos = { x: this.x, y: this.y, t: time }; }
      const stuck = !blocked && (time - this._lastPos.t > 500) && moved < 12;
      if (blocked || stuck) {
        // 一次决定,坚持到底:首次进入 blocked 状态选方向 + commit 时长 2.5s
        if (this._slideCommit == null || time > this._slideCommit) {
          this._slideDir = Math.random() < 0.5 ? -1 : 1;
          this._slideCommit = time + 2500;
          this._slideClearAt = null;
        }
        if (blocked) {
          // 真实墙:沿墙 sidestep,主滑方向 = commit 方向
          if (bx !== 0 && by === 0) {
            vx = -bx * 0.15;             // 极轻微离墙
            vy = this._slideDir;          // 全力沿墙滑 (上 or 下)
          } else if (by !== 0 && bx === 0) {
            vx = this._slideDir;          // 全力沿墙滑 (左 or 右)
            vy = -by * 0.15;
          } else {
            // 双向凹角 → 强力对角后退
            vx = -bx * 0.8; vy = -by * 0.8;
          }
          this._slideClearAt = null;
        } else {
          // 软卡死 (被同伴 / 凹槽夹住):垂直于追击方向猛拐 90°
          a += this._slideDir * Math.PI / 2;
          vx = Math.cos(a); vy = Math.sin(a);
        }
      } else if (this._slideCommit) {
        // 不再 blocked:启动 "脱离确认" — 连续 350ms 不被堵才正式释放 commit
        if (!this._slideClearAt) this._slideClearAt = time + 350;
        if (time > this._slideClearAt) { this._slideCommit = null; this._slideClearAt = null; }
        // 这段过渡期保留原追击向量 (沿墙刚出来,正好顺势走)
      }
      // 散开军阵 (皇家起义幸存者风) — 不堆叠,有呼吸间距
      // R=70 ≈ 一个体型距离, weight=0.9 推力较强
      const sep = this._computeSeparation(70);
      if (sep) { vx += sep.x * 0.9; vy += sep.y * 0.9; }
      // 归一化 + 用 speed
      const mag = Math.hypot(vx, vy) || 1;
      this.setVelocity((vx / mag) * this.speed, (vy / mag) * this.speed);
      if (this.anims.currentAnim?.key !== `${this.anim}-run`) this.play(`${this.anim}-run`);
    }
  }

  // 同伴互斥 — 返回单位推力向量 (远离 R 范围内的所有同伴)
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
        // 距离越近推力越强 (反比)
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
