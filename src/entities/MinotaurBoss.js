// 狂暴牛头人 — 三阶段 boss
// Phase 1 (HP > 66%): 普通追击近战 (继承 MeleeEnemy 行为)
// Phase 2 (33% < HP <= 66%): 加入"蓄力冲撞" — 每 6s 一次, 800ms 红线预告 → 高速冲刺
// Phase 3 (HP <= 33%): 狂暴 — 速度 +50%, 红色 tint, 每 5s 一次"咆哮"AOE 击退 + 召唤 2-3 只小怪
//
// 美术: 暂时复用 'oar' (维京斧汉) 贴图, scale 1.9 + 红 tint. 后续替换正式牛头人贴图时只改 texture/anim 字段.
import MeleeEnemy from './MeleeEnemy.js?v=3';
import { playFx, damageText } from './effects.js?v=3';

export default class MinotaurBoss extends MeleeEnemy {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y, {
      texture: 'oar-idle', anim: 'oar',
      hp: opts.hp ?? 1200,
      dmg: opts.dmg ?? 28,
      speed: opts.speed ?? 86,
      scale: 1.9,
      attackDist: 78,
      bodyW: 36, bodyH: 26, bodyOffX: 14, bodyOffY: 36, barY: -96,
      isBoss: true, gold: 60,
    });
    this.bossKind = 'minotaur';
    this.baseSpeed = this.speed;
    this.phase = 1;
    this._nextChargeAt = scene.time.now + 8000;
    this._nextRoarAt = 0;
    this._charging = false;
    this._chargeTelegraph = null;
    this.setTint(0xffb070); // 暖橙 — phase 1 颜色
  }

  takeDamage(dmg, fromX, fromY) {
    if (this.dead) return;
    // 冲锋中享受 60% 减伤 (避免被瞬秒)
    const reduced = this._charging ? Math.max(1, Math.round(dmg * 0.4)) : dmg;
    super.takeDamage(reduced, fromX, fromY);
    if (this.dead) return;
    const ratio = this.hp / this.maxHp;
    // 阶段过渡
    if (this.phase === 1 && ratio <= 0.66) this._enterPhase2();
    else if (this.phase === 2 && ratio <= 0.33) this._enterPhase3();
  }

  _enterPhase2() {
    this.phase = 2;
    this.setTint(0xff8a4a);
    this._nextChargeAt = this.scene.time.now + 1500;
    this.scene.announce && this.scene.announce('🐂 牛头人怒目相向!', '#ffb070');
  }

  _enterPhase3() {
    this.phase = 3;
    this.setTint(0xff4444);
    this.speed = this.baseSpeed * 1.5;
    this._nextRoarAt = this.scene.time.now + 1200;
    this.scene.announce && this.scene.announce('💢 狂暴! 牛头人陷入红怒', '#ff5040');
    // 触发瞬时咆哮
    this._roar();
  }

  update(player, time) {
    if (this.dead) return;
    // 冲锋状态:直线推进, 不走基类 AI
    if (this._charging) {
      this.bar.update(this.hp, this.maxHp);
      const dx = this._chargeTargetX - this.x;
      const dy = this._chargeTargetY - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 22 || time > this._chargeEndAt) {
        this._endCharge();
      }
      // 边冲边撞击碰到的玩家
      if (player && !player.dead) {
        const pd = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        if (pd < 56 && (!this._lastChargeHitAt || time - this._lastChargeHitAt > 400)) {
          this._lastChargeHitAt = time;
          player.takeDamage(this.dmg * 1.4);
          // 击退玩家
          const a = Math.atan2(player.y - this.y, player.x - this.x);
          if (player.setVelocity) player.setVelocity(Math.cos(a) * 380, Math.sin(a) * 380);
          playFx(this.scene, 'fx-explosion', player.x, player.y, { scale: 0.9 });
        }
      }
      return;
    }
    // 阶段技能调度
    if (this.phase >= 2 && time > this._nextChargeAt) this._startCharge(player, time);
    if (this.phase === 3 && time > this._nextRoarAt) this._roar();
    // 继承的基础追击行为
    super.update(player, time);
  }

  _startCharge(player, time) {
    if (!player || player.dead || this.dead || !this.scene) { this._nextChargeAt = time + 2000; return; }
    // 800ms 预告 — 画一根红线从牛头人指向当前玩家位置
    const scene = this.scene; // 提前缓存 — boss 死后 this.scene 会变 undefined
    const tx = player.x; const ty = player.y;
    const line = scene.add.graphics().setDepth(this.depth + 1);
    const dur = 800;
    const startT = scene.time.now;
    const tick = () => {
      if (this.dead || !this.scene || !line.active) return;
      const e = (this.scene.time.now - startT) / dur;
      line.clear();
      const alpha = 0.55 + 0.45 * Math.sin(e * Math.PI * 6);
      const w = 4 + e * 6;
      line.lineStyle(w, 0xff3030, alpha);
      line.beginPath();
      line.moveTo(this.x, this.y - 30);
      line.lineTo(tx, ty);
      line.strokePath();
    };
    const handler = () => tick();
    scene.events.on('postupdate', handler);
    this.setVelocity(0, 0);
    this._chargeTelegraph = line;
    scene.time.delayedCall(dur, () => {
      // 即使 boss 已死, 也要把 postupdate 监听摘掉, 否则 scene 重置后还会触发
      if (scene && scene.events && scene.events.off) scene.events.off('postupdate', handler);
      if (line && line.active && line.destroy) line.destroy();
      this._chargeTelegraph = null;
      if (this.dead || !this.scene) return;
      this._charging = true;
      this._chargeTargetX = tx;
      this._chargeTargetY = ty;
      const a = Math.atan2(ty - this.y, tx - this.x);
      const speed = this.baseSpeed * 4.2;
      this.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
      this._chargeEndAt = this.scene.time.now + 1200;
      this.attacking = true;
      playFx(this.scene, 'fx-dust', this.x, this.y + 8, { scale: 1.2 });
    });
    this._nextChargeAt = time + (this.phase === 3 ? 4500 : 6500);
  }

  _endCharge() {
    this._charging = false;
    this.attacking = false;
    this.setVelocity(0, 0);
    playFx(this.scene, 'fx-explosion', this.x, this.y + 4, { scale: 1.1 });
    // 冲锋结束后短暂硬直
    this._nextChargeAt = Math.max(this._nextChargeAt, this.scene.time.now + 1200);
  }

  _roar() {
    if (this.dead) return;
    this._nextRoarAt = this.scene.time.now + 5500;
    const R = 220;
    // 红色环形光效
    const ring = this.scene.add.circle(this.x, this.y, 24, 0xff4040, 0.35)
      .setStrokeStyle(4, 0xff8060, 1).setDepth(this.depth + 1);
    this.scene.tweens.add({
      targets: ring, radius: R, alpha: 0, duration: 480, ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
    // 击退 + 伤害玩家
    const p = this.scene.player;
    if (p && !p.dead) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (d < R) {
        p.takeDamage(Math.round(this.dmg * 0.5));
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        if (p.setVelocity) p.setVelocity(Math.cos(a) * 460, Math.sin(a) * 460);
      }
    }
    // 召唤 2-3 只 imp 小弟
    const n = Phaser.Math.Between(2, 3);
    if (this.scene.spawnEnemy) {
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
        const sx = this.x + Math.cos(ang) * 60;
        const sy = this.y + Math.sin(ang) * 60;
        const e = this.scene.spawnEnemy('imp', sx, sy);
        if (e) playFx(this.scene, 'fx-dust', sx, sy, { scale: 0.5 });
      }
    }
    // 屏幕震动
    this.scene.cameras.main.shake(180, 0.006);
  }

  die() {
    if (this._chargeTelegraph) { this._chargeTelegraph.destroy(); this._chargeTelegraph = null; }
    super.die();
  }
}
