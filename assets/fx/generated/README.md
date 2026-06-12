# Generated FX Batch 01

All files in this folder are true-alpha PNG strips for Phaser. Each animation is a horizontal single-row strip with square frames. Source generated images are kept as `*-source.png`; use the `*-strip.png` files in game code.

## Files

| File | Frames | Frame Size | Total Size | Suggested FPS | Use |
|---|---:|---:|---:|---:|---|
| `fx-slash-strip.png` | 8 | 192 x 192 | 1536 x 192 | 18-22 | melee arc slash overlay |
| `fx-swordwave-strip.png` | 6 | 192 x 192 | 1152 x 192 | 14-18 | ranged sword wave projectile |
| `fx-fireball-trail-strip.png` | 6 | 128 x 128 | 768 x 128 | 12-16 | looping fireball projectile trail |
| `fx-impact-strip.png` | 7 | 128 x 128 | 896 x 128 | 18-22 | generic hit impact burst |
| `fx-gem-pickup-strip.png` | 6 | 64 x 64 | 384 x 64 | 14-18 | XP crystal pickup sparkle |
| `fx-levelup-aura-strip.png` | 8 | 192 x 192 | 1536 x 192 | 12-16 | level-up golden aura |
| `gem-sparkle-strip.png` | 4 | 32 x 32 | 128 x 32 | 4-8 | idle sparkle loop for XP gems |
| `fx-sword-nova-strip.png` | 8 | 192 x 192 | 1536 x 192 | 16-20 | centered 360-degree sword nova |

## Phaser Loading

```js
this.load.spritesheet('fx-slash-gen', 'assets/fx/generated/fx-slash-strip.png', {
  frameWidth: 192,
  frameHeight: 192,
});

this.load.spritesheet('fx-swordwave-gen', 'assets/fx/generated/fx-swordwave-strip.png', {
  frameWidth: 192,
  frameHeight: 192,
});

this.load.spritesheet('fx-fireball-trail-gen', 'assets/fx/generated/fx-fireball-trail-strip.png', {
  frameWidth: 128,
  frameHeight: 128,
});

this.load.spritesheet('fx-impact-gen', 'assets/fx/generated/fx-impact-strip.png', {
  frameWidth: 128,
  frameHeight: 128,
});

this.load.spritesheet('fx-gem-pickup-gen', 'assets/fx/generated/fx-gem-pickup-strip.png', {
  frameWidth: 64,
  frameHeight: 64,
});

this.load.spritesheet('fx-levelup-aura-gen', 'assets/fx/generated/fx-levelup-aura-strip.png', {
  frameWidth: 192,
  frameHeight: 192,
});

this.load.spritesheet('gem-sparkle-gen', 'assets/fx/generated/gem-sparkle-strip.png', {
  frameWidth: 32,
  frameHeight: 32,
});

this.load.spritesheet('fx-sword-nova-gen', 'assets/fx/generated/fx-sword-nova-strip.png', {
  frameWidth: 192,
  frameHeight: 192,
});
```

## Notes

- Transparent corners were validated after export.
- Effects are centered per frame and outer 1px borders are cleared to avoid bleeding.
- Preview GIFs are included for quick review, but Phaser should use the PNG strips.
