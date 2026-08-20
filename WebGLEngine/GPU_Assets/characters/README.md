# characters/ — NPC / non-player character GLBs

Drop rigged character models here for use as NPCs, enemies, civilians, etc.
Same auto-merge behavior as Your_Avatars/ — files resolve via the top-level
URL convention so existing engine code works transparently.

## Suggested packs

- **KayKit Adventurers** (free, rigged):
  https://kaylousberg.itch.io/kaykit-adventurers
- **KayKit Skeletons** (free, rigged enemies):
  https://kaylousberg.itch.io/kaykit-skeletons
- **Quaternius Universal Base Characters** (free, rigged):
  https://quaternius.itch.io/universal-base-characters

## How they integrate

After drop + reload:
- Listed in `/assets/list` → appear in the asset spawn panel
- Spawnable via console: `anim.spawn(x, z, scale, "<CharName>")`
- Bindable as kaiju kind: `anim.bindAsset("hell", "Skeleton_Warrior")`
