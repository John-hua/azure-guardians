import HealthBar from './HealthBar.js?v=3';
import { playFx, fireLoop, damageText } from './effects.js?v=3';
import { Sfx } from '../audio.js?v=music1';

export default class VillageCore {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.maxHp = opts.maxHp ?? 450;
    this.hp = this.maxHp;
    this.destroyed = false;
    this.dead = false;
    this.isVillageCore = true;
    this.aggroRadius = opts.aggroRadius ?? 520;
    this.attackDist = opts.attackDist ?? 76;

    // 自定义 core: 复用编辑器里已经放好的 sprite (可能是带动画的精灵序列)
    if (opts.existingSprite) {
      this.sprite = opts.existingSprite;
      this.customSkin = true;
    } else {
      this.sprite = scene.add.image(x, y, 'village-core')
        .setOrigin(0.5, 0.88)
        .setScale(opts.scale ?? 0.92)
        .setDepth(y + 4);
    }
    // 默认塔自动加底座碰撞;自定义塔不加 — 让用户在编辑器里用 piece-collide cells 自己画
    this.solid = opts.existingSprite
      ? null
      : scene.addSolid(x, y - 28, opts.baseW ?? 88, opts.baseH ?? 42);
    this.bar = new HealthBar(scene, this.sprite, {
      width: 86, height: 8, yOffset: -this.sprite.displayHeight * 0.82, color: 0x44d8ff,
    });
    this._lastStage = 'normal';
  }

  takeDamage(dmg) {
    if (this.destroyed) return;
    // 水晶塔伤害减免 50% (向上取整,至少扣 1)
    // 防止后期高伤敌人秒爆,给玩家反应窗口
    const reduced = Math.max(1, Math.ceil(dmg * 0.5));
    this.hp = Math.max(0, this.hp - reduced);
    dmg = reduced; // 显示也用减免后的数
    damageText(this.scene, this.x, this.y - 108, dmg, '#8ee8ff');
    // 塔位置固定, 不抖动 — 只闪烁 alpha 表达受击
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.55,
      duration: 60,
      yoyo: true,
      onComplete: () => this.sprite.setAlpha(1),
    });
    playFx(this.scene, 'fx-impact', this.x, this.y - 72, { scale: 0.65, depth: this.y + 20 });
    this._updateStage();
    this.bar.update(this.hp, this.maxHp);
    if (this.scene.hud && this.scene.hud.updateCore) this.scene.hud.updateCore(this.hp, this.maxHp);
    if (this.hp <= 0) this.destroyCore();
  }

  _updateStage() {
    const ratio = this.hp / this.maxHp;
    const stage = ratio <= 0.25 ? 'critical' : ratio <= 0.55 ? 'damaged' : 'normal';
    if (stage === this._lastStage) return;
    this._lastStage = stage;
    if (this.customSkin) {
      // 自定义贴图没有 damaged/critical 版本 → 用 tint 表达状态
      const tint = stage === 'critical' ? 0xff8866 : stage === 'damaged' ? 0xffcc66 : 0xffffff;
      if (this.sprite.setTint) this.sprite.setTint(tint);
    } else {
      const key = stage === 'critical' ? 'village-core-critical'
        : stage === 'damaged' ? 'village-core-damaged'
          : 'village-core';
      this.sprite.setTexture(key);
    }
    const color = stage === 'critical' ? '#ff7a44' : '#ffe070';
    this.scene.announce(stage === 'critical' ? '⚠ 水晶塔濒危' : '⚠ 水晶塔受损', color);
  }

  destroyCore() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.dead = true;
    if (this.solid) this.solid.destroy();
    if (this.bar) this.bar.destroy();
    if (this.customSkin) {
      if (this.sprite.setTint) this.sprite.setTint(0x664444);
      if (this.sprite.setAlpha) this.sprite.setAlpha(0.5);
    } else {
      this.sprite.setTexture('village-core-destroyed');
    }
    playFx(this.scene, 'fx-explosion', this.x, this.y - 58, { scale: 1.35, depth: this.y + 30 });
    fireLoop(this.scene, this.x - 22, this.y - 28, { scale: 0.65, duration: 2200 });
    fireLoop(this.scene, this.x + 24, this.y - 24, { scale: 0.7, duration: 2400 });
    // 塔毁震屏也去掉 — 用户偏好: 塔是固定结构, 任何情况都不晃
    Sfx.explosion();
    if (this.scene.onVillageCoreDestroyed) this.scene.onVillageCoreDestroyed(this);
  }

  activate() {
    if (this.destroyed) return;
    playFx(this.scene, 'fx-levelup-aura', this.x, this.y - 52, { scale: 1.05, depth: this.y + 40 });
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.sprite.scaleX * 1.08,
      scaleY: this.sprite.scaleY * 1.08,
      duration: 160,
      yoyo: true,
      repeat: 2,
    });
  }
}
