# Island Terrain Kit

Original top-down / slightly isometric island terrain components inspired by cozy fantasy village island maps. These are not seamless 64px tiles; they are larger scene-building components for richer Phaser map dressing.

## Main Sheets

| File | Size | Contents |
|---|---:|---|
| `island-cliffs-plateaus-sheet.png` | 1536 x 1024 | grass plateaus, cliff edges, corners, rock walls |
| `island-forest-rocks-flowers-sheet.png` | 1536 x 1024 | forest clusters, trees, bushes, flowers, rocks, shoreline stones |
| `island-path-water-sheet.png` | 1536 x 1024 | stone paths, dirt paths, bridges, foam, ponds, sand/grass patches |
| `island-landmark-props-sheet.png` | 1536 x 1024 | well, signs, crates, barrels, flags, campfire, fences, ruins, bridge props |

## Auto-Cropped Components

Each sheet also has an auto-cropped component folder:

- `island-cliffs-plateaus/`
- `island-forest-rocks-flowers/`
- `island-path-water/`
- `island-landmark-props/`

The files inside are numbered components cropped from the sheet. Use `island-kit-manifest.json` for bounding boxes and sizes.

## Phaser Usage

Recommended layering:

1. Base terrain tile or biome background.
2. Grass plateau / cliff pieces.
3. Paths and water edges.
4. Trees, rocks, flowers.
5. Props and landmarks.
6. Characters and enemies.

These pieces should be placed as normal images with `setDepth(y)` or a similar feet-depth rule.

## Notes

- Assets are true-alpha PNG after local background removal.
- Components are painterly / low-poly style, richer than the current Tiny Swords tile layer.
- Forest sheet currently has some pale/white canopy highlights. Generate a pure green variant if a warmer non-snow forest is preferred.

