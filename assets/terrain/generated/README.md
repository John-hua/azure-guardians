# Generated Terrain Set

Pixel-art top-down terrain tiles. The terrain in this batch is generated procedurally to prioritize exact dimensions and seamless tiling over painterly variation.

| File | Size | Grid | Notes |
|---|---:|---|---|
| `grass-autotile.png` | 192 x 192 | 3 x 3, 64 x 64 cells | cool-green grass autotile: TL/T/TR, L/C/R, BL/B/BR |
| `path-autotile.png` | 192 x 192 | 3 x 3, 64 x 64 cells | warm-brown dirt path autotile with grass transition |
| `water-tile.png` | 64 x 64 | single tile | four-way seamless water tile |
| `biome-forest.png` | 512 x 512 | background tile | seamless cool-green forest biome texture |
| `biome-mine.png` | 512 x 512 | background tile | seamless warm sand / mine biome texture |
| `biome-ruins.png` | 512 x 512 | background tile | seamless gray-green ruins biome texture |
| `biome-coast.png` | 512 x 512 | background tile | seamless shallow-blue coast biome texture |

## Previews

- `terrain-generated-preview.png`: single-tile preview sheet.
- `terrain-seam-test.png`: 2x2 repeat test for seamless assets.

## Integration Notes

- Use `grass-autotile.png` and `path-autotile.png` as spritesheets with `frameWidth: 64`, `frameHeight: 64`.
- Cell order is row-major:
  - 0 = top-left
  - 1 = top
  - 2 = top-right
  - 3 = left
  - 4 = center
  - 5 = right
  - 6 = bottom-left
  - 7 = bottom
  - 8 = bottom-right
- The biome maps are intended for Phaser `tileSprite` / repeating background use.

