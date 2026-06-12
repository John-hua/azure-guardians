import HealthBar from './HealthBar.js?v=3';
import { playFx, fireLoop, damageText } from './effects.js?v=3';
import { BUILDING_HP } from '../config/constants.js?v=3';
import { Sfx } from '../audio.js?v=music1';

// 可破坏建筑：破坏时爆炸/烟尘/火焰，并替换为 _Destroyed 残骸图。
export default class Building {
  constructor(scene, key, destroyedKey, x, y, scale, baseW, baseH) {
    this.scene = scene;
    this.key = key;
    this.destroyedKey = destroyedKey;
    this.x = x;
    this.y = y;
    this.hp = BUILDING_HP;
    this.maxHp = BUILDING_HP;
    this.destroyed = false;
    this.bar = null;

    this.sprite = scene.add.image(x, y, key).setOrigin(0.5, 0.92).setScale(scale).setDepth(y);
    this.solid = scene.addSolid(x, y - baseH / 2, baseW, baseH);
    this.barY = -this.sprite.displayHeight * 0.86;
  }

  takeDamage(dmg) {
    if (this.destroyed) return;
    this.hp -= dmg;
    damageText(this.scene, this.x, this.y - this.sprite.displayHeight * 0.5, dmg, '#ffd040');
    this.scene.tweens.add({ targets: this.sprite, alpha: 0.55, duration: 60, yoyo: true });
    playFx(this.scene, 'fx-dust', this.x, this.y - 6, { scale: 0.9 });
    if (!this.bar) {
      this.bar = new HealthBar(this.scene, this.sprite, { width: 60, yOffset: this.barY, color: 0xd0b020 });
    }
    this.bar.update(this.hp, this.maxHp);
    if (this.hp <= 0) this.destroyBuilding();
  }

  destroyBuilding() {
    this.destroyed = true;
    this.solid.destroy();
    if (this.bar) this.bar.destroy();
    const { x, y } = this;

    playFx(this.scene, 'fx-explosion', x, y - 40, { scale: 1.5 });
    playFx(this.scene, 'fx-dust', x - 26, y - 6, { scale: 1.4 });
    playFx(this.scene, 'fx-dust', x + 26, y - 6, { scale: 1.4 });
    fireLoop(this.scene, x, y - 18, { scale: 1.0, duration: 1800 });
    fireLoop(this.scene, x - 30, y - 4, { scale: 0.7, duration: 1500 });
    this.scene.cameras.main.shake(240, 0.01);
    Sfx.explosion();

    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, duration: 220, delay: 140,
      onComplete: () => {
        this.sprite.setTexture(this.destroyedKey).setAlpha(1);
      },
    });
  }
}
