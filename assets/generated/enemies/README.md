# Generated Enemy Set 01

These are original generated enemies based on gameplay roles from the first-row enemy references, not copied paid sprites.

Source specs followed from the reference page:
- 64x64 frame grid
- 10 fps animation target
- PNG sprite sheets plus GIF previews
- Each action uses 8 frames, staying under the requested 10-frame limit

## Characters

### bone-buckler

Role: small shielded melee nuisance.

Rows in `bone-buckler-sheet-64.png`:
- Row 0: `idle`, 8 frames
- Row 1: `run`, 8 frames
- Row 2: `attack`, 8 frames
- Row 3: `utility`, 8 frames: block, hurt, death

Recommended gameplay:
- HP: low-medium
- Speed: medium
- Attack: short sword slash
- Special behavior: brief frontal block window

### oarfin-bruiser

Role: heavier melee charger with paddle smash.

Rows in `oarfin-bruiser-sheet-64.png`:
- Row 0: `idle`, 8 frames
- Row 1: `run`, 8 frames
- Row 2: `attack`, 8 frames
- Row 3: `utility`, 8 frames: charge, hurt, death

Recommended gameplay:
- HP: medium
- Speed: slow-medium
- Attack: paddle slam with small knockback
- Special behavior: short straight-line charge

### boomspike-puffer

Role: ranged / self-burst pressure enemy.

Rows in `boomspike-puffer-sheet-64.png`:
- Row 0: `idle`, 8 frames
- Row 1: `run`, 8 frames
- Row 2: `attack`, 8 frames: bomb spit
- Row 3: `utility`, 8 frames: inflate warning, burst, hurt, death

Recommended gameplay:
- HP: low
- Speed: medium
- Attack: slow bomb projectile
- Special behavior: warning inflate before area burst

## Phaser Loading Notes

Use `frameWidth: 64`, `frameHeight: 64`.

Frame ranges for each sheet:
- `idle`: frames 0-7
- `run`: frames 8-15
- `attack`: frames 16-23
- `utility`: frames 24-31

Suggested animation config:

```js
scene.anims.create({
  key: 'bone-buckler-idle',
  frames: scene.anims.generateFrameNumbers('bone-buckler', { start: 0, end: 7 }),
  frameRate: 10,
  repeat: -1,
});
```

