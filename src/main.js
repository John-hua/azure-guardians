import BootScene from './scenes/BootScene.js?v=3';
import HomeScene from './scenes/HomeScene.js?v=4';
import WorldScene from './scenes/WorldScene.js?v=3';
import EditorScene from './scenes/EditorScene.js?v=3';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d2b1d',
  // pixelArt + roundPixels 适合"严格像素风"游戏 (每个像素都对齐),
  // 但本项目是插画风 + painterly 地形,开启会强制最近邻采样 → 边缘锯齿/重影 (用户看到的"重叠效果")
  // 关闭后:线性采样 → 缩放平滑,但严格像素件 (8-bit warrior 等) 可能微糊,可单独 setFilter(NEAREST) 回退
  pixelArt: false,
  roundPixels: false,
  antialias: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    antialiasGL: true,
    powerPreference: 'high-performance',
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false },
  },
  scene: [BootScene, HomeScene, WorldScene, EditorScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
