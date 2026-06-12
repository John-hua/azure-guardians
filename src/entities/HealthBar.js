// 跟随目标头顶的简易血条（背景 + 前景矩形）。
export default class HealthBar {
  constructor(scene, target, { width = 40, height = 6, yOffset = -48, color = 0x46c83c } = {}) {
    this.target = target;
    this.width = width;
    this.height = height;
    this.yOffset = yOffset;
    // 满血时隐藏，受伤后才显示——敌人多时大幅减少绘制对象
    this.bg = scene.add.rectangle(target.x, target.y, width + 2, height + 2, 0x000000, 0.6).setDepth(99998).setVisible(false);
    this.fill = scene.add.rectangle(target.x, target.y, width, height, color).setOrigin(0, 0.5).setDepth(99999).setVisible(false);
  }

  update(hp, maxHp) {
    const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    const show = ratio < 1;
    if (this.bg.visible !== show) { this.bg.setVisible(show); this.fill.setVisible(show); }
    if (!show) return;
    const x = this.target.x - this.width / 2;
    const y = this.target.y + this.yOffset;
    this.bg.setPosition(this.target.x, y);
    this.fill.setPosition(x, y);
    this.fill.width = this.width * ratio;
    this.fill.fillColor = ratio > 0.5 ? 0x46c83c : ratio > 0.25 ? 0xe0b020 : 0xd03030;
  }

  destroy() {
    this.bg.destroy();
    this.fill.destroy();
  }
}
