# Generated UI Atlas Set 01

These UI assets are original medieval roguelite interface concepts for the current Phaser game. They are meant to provide a complete game UI layer: HUD, hero status, skill bar, upgrades, shop, boss warnings, pause/death/victory panels, combat status, and mobile controls.

The generated style target is a royal uprising / medieval arcade roguelite interface, but the assets are original and are not copied from any paid asset pack or existing game UI.

## Files

- `ui-hud-atlas.png`
  - Hero portrait frame
  - Player HP bar frame and fill
  - XP bar frame and fill
  - Coin, timer, kill plaques
  - Wave / boss warning banner
  - Enemy HP bar
  - Bottom skill hotbar with six circular slots
  - Pause/settings buttons
  - Minimap frame
  - Cooldown wedge pieces

- `ui-panels-buttons-atlas.png`
  - Large modal panel
  - Shop panel
  - Item row slot and price tag
  - Primary, danger, disabled buttons
  - Square icon buttons
  - Tabs, close, confirm, tooltip
  - Victory and defeat banners

- `ui-upgrade-cards-icons-atlas.png`
  - Common / rare / legendary upgrade card frames
  - Selected glow frame
  - Reroll, lock, skip, level-up badge
  - Upgrade icons: damage, armor, max HP, speed, dash, sword wave, lifesteal, greed, cooldown, crit, fire, ice, lightning, bomb, arrows, war horn

- `ui-combat-status-atlas.png`
  - Damage/heal/crit badge shapes
  - Pickup sparkles
  - Wave start banner
  - Elite nameplate
  - Boss HP bar frame and fill
  - Status icons
  - Quest plaque, speech bubble, interaction prompt
  - Keycap frames
  - Mobile joystick and action buttons

- `ui-atlas-preview.png`
  - Checker-background preview of the four cleaned atlases.

## Recommended UI Pass

1. Replace the current rectangle-only top-left HP UI with:
   - hero portrait frame
   - ornate HP frame + red fill
   - XP bar under or above it
   - level badge

2. Replace text-only weapon/skill HUD with:
   - bottom hotbar frame
   - six circular skill slots
   - cooldown overlays
   - icon mapping for attack, dash, sword wave, war cry, heal, passive

3. Replace `showUpgrades()` with:
   - dark overlay
   - three upgrade card frames
   - upgrade icon in each card art window
   - selected glow when pressing 1/2/3

4. Replace `openShop()` with:
   - shop panel
   - item row slots
   - price tags
   - close button / B prompt

5. Add combat overlays:
   - boss HP bar when `isBoss`
   - wave banner on spawn waves
   - elite nameplate for special enemies
   - status icons above enemies if poison/burn/freeze are added later

## Slicing Notes

The atlases are currently concept atlases, not packed JSON atlases. Before Phaser runtime use, crop the chosen pieces into named PNGs or create a TexturePacker-style JSON atlas.

Recommended next files after slicing:

- `assets/ui/hud/hero-frame.png`
- `assets/ui/hud/player-hp-frame.png`
- `assets/ui/hud/player-hp-fill.png`
- `assets/ui/hud/xp-frame.png`
- `assets/ui/hud/xp-fill.png`
- `assets/ui/hud/hotbar.png`
- `assets/ui/cards/upgrade-common.png`
- `assets/ui/cards/upgrade-rare.png`
- `assets/ui/cards/upgrade-legendary.png`
- `assets/ui/panels/shop-panel.png`
- `assets/ui/panels/modal-panel.png`
- `assets/ui/boss/boss-hp-frame.png`
- `assets/ui/boss/boss-hp-fill.png`

