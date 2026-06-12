// 一次性粒子特效、火焰循环、伤害飘字。

export function playFx(scene, key, x, y, opts = {}) {
  const { scale = 1, depth = y + 1000, flipX = false } = opts;
  const s = scene.add.sprite(x, y, key).setScale(scale).setDepth(depth).setFlipX(flipX);
  s.play(key);
  s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  return s;
}

// 持续火焰，duration 毫秒后淡出销毁
export function fireLoop(scene, x, y, opts = {}) {
  const { scale = 1, depth = y + 1000, duration = 1600 } = opts;
  const s = scene.add.sprite(x, y, 'fx-fire').setScale(scale).setDepth(depth);
  s.play('fx-fire');
  scene.time.delayedCall(duration, () => {
    scene.tweens.add({ targets: s, alpha: 0, duration: 300, onComplete: () => s.destroy() });
  });
  return s;
}

// 代码绘制的扩散冲击波环（用于旋风/战吼等技能）
export function shockwave(scene, x, y, opts = {}) {
  const { color = 0xffffff, maxRadius = 95, duration = 320, lineWidth = 5, depth = 99990 } = opts;
  const g = scene.add.graphics().setDepth(depth);
  const st = { r: 6, a: 0.9 };
  scene.tweens.add({
    targets: st, r: maxRadius, a: 0, duration, ease: 'Cubic.out',
    onUpdate: () => { g.clear(); g.lineStyle(lineWidth, color, st.a); g.strokeCircle(x, y, st.r); },
    onComplete: () => g.destroy(),
  });
}

// 伤害飘字：向上飘并淡出
// 性能保护：text 对象渲染开销大，AoE 同时命中大量敌人会瞬间生成几十个 →
// 全局限制同时存在的飘字数量，超出则跳过（敌人多时优先保帧率）。
let activeDamageTexts = 0;
const MAX_DAMAGE_TEXTS = 26;
export function damageText(scene, x, y, amount, color = '#ffffff') {
  if (activeDamageTexts >= MAX_DAMAGE_TEXTS) return;
  activeDamageTexts += 1;
  const t = scene.add.text(x, y, `-${amount}`, {
    fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold',
    color, stroke: '#000000', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(99999);
  scene.tweens.add({
    targets: t, y: y - 32, alpha: 0, duration: 700,
    ease: 'Cubic.out', onComplete: () => { t.destroy(); activeDamageTexts -= 1; },
  });
}
