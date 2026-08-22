---
type: doc
title: "Round 336 — Mountain idempotency, knockDown utility, storage inspector, universal mute"
tags: ["swek-engine", "round-doc"]
---

# Round 336 — Mountain idempotency, knockDown utility, storage inspector, universal mute

Live-testing feedback from v335. Four issues, four fixes.

---

## 1. Why mountains are too tall

Found in `world/biomePainter.js` — the mountain branch
unconditionally stacks 5-20 STONE voxels on top of `topY` for every
mountain-biome column. No check for whether the column was
already painted.

The `voxelengine.biomes_v2_applied` gate flag normally prevents
re-paint, but `world.regenerate()` fires an `onRegenerate` listener
that force-paints (bypassing the flag). Every demo cycle, every
`Reset World` press in the pre-v333 era, every time the world
regenerated — another 5-20 stones stacked on top of the existing
mountain peak.

My v329 `_terrainTopAt` fix made it worse for re-paints: it
correctly skips SNOW (the cap) and returns the STONE peak body
below. The painter then sees `topY = STONE peak body` as ground
and stacks ANOTHER 5-20 voxels on top.

Result: mountains in heavily-played worlds reach Y=60+, with
sheer cliff sides (no taper, since each pass just adds vertically).
That's the "no side and too tall" you saw.

### The fix

```js
} else if (biome === "mountains") {
    // v336 — skip already-painted columns
    if (topY > 10) {
        continue;
    }
    // ...existing 5-20 stack...
}
```

Natural base terrain caps at ~Y=10. Anything taller IS the mountain
peak from a prior pass. Skip → no more stacking.

The threshold is conservative: the noise-driven peak heights are
5-20, so natural mountain bodies after a single paint reach
Y=10+20=30. After v336, multiple paints won't make them taller.

---

## 2. Existing tall mountains — `knockDownMountains()`

The idempotency fix prevents NEW tall mountains but doesn't help
your current world. New utility:

```js
knockDownMountains()           // default maxY=30 — safe cutoff
knockDownMountains(25)         // more aggressive trim
knockDownMountains(40)         // preserves taller peaks
```

Walks every loaded chunk and clears STONE/SNOW voxels above
`maxY`. Other voxel types untouched (SCREEN walls, MEMORY voxels,
WATER lakes all stay). Returns
`{ columnsTouched, voxelsCleared, maxY }` for inspection.

Use after upgrading to v336 to flatten the existing cliff-mountains
in your world without a full reset.

---

## 3. Storage diagnostics — `inspectStorage()`

For your "Reset World not resetting everything" complaint. Print a
table of every `voxelengine.*` localStorage key with its byte size
and a preview of the contents:

```js
inspectStorage()
```

Output (example):
```
┌─────────┬──────────────────────────┬────────┬─────────────────────────────────────┐
│ (index) │ key                      │ bytes  │ preview                             │
├─────────┼──────────────────────────┼────────┼─────────────────────────────────────┤
│ 0       │ worldDiff                │ 184293 │ {"chunks":[{"key":"0,0",...         │
│ 1       │ ollamaModel              │     12 │ gemma3:4b                           │
│ 2       │ biomes_v2_applied        │      1 │ 1                                   │
│ 3       │ ruins_v1_applied         │      1 │ 1                                   │
│ 4       │ ttsMuted                 │      1 │ 1                                   │
│ 5       │ camera                   │     54 │ {"x":-175.3,"y":97.2,"z":54.1,...   │
└─────────┴──────────────────────────┴────────┴─────────────────────────────────────┘
[inspectStorage] 6 keys, 184362 bytes total
```

Run after `resetWorld()` to verify what was actually cleared. Run
before a session to know your starting state. If `worldDiff` is
huge (100k+ bytes) AFTER a reset, that's your "old stuff" leak —
follow up with `hardResetWorld()`.

---

## 4. Universal mute (the 🔊 button now means what it says)

The speaker button in the KPop LISTENER panel previously toggled
only `kpop._ttsMuted` — silencing the robot's voice but leaving
sfx, ambient, procedural music, and engine speech all going.

In v336 it's a real master mute. One click silences ALL audio:

- `AudioManager.setMasterVolume(0)` + `stopAll()` (sfx, ambient,
  block-place/break/hit sounds, kaiju roars, etc.)
- `AudioManager.muteSpeech()` (engine TTS — alerts, announces)
- `kpop._ttsMuted = true` (KPop voice)
- `procMusic.stop()` if procedural music is running
- `roomAmbience.stop()` if ambient soundscape is active
- Saves the prior master volume so unmute restores it exactly

Persists across reloads via `voxelengine.muteAll` flag — refresh
the page and you're still muted.

Console shortcuts:
```js
muteAllAudio()       // silence everything, save state
unmuteAllAudio()     // restore saved master volume
toggleMuteAll()      // flip — returns new state
```

The button text toggles between 🔊 (audio on) and 🔇 (muted) to
match. Hovering shows the new tooltip: "Mute ALL audio (sfx +
speech + ambient + music)".

---

## 5. Version bump → v336

The STATUS panel header now reads `v336`. Multi-line scripts and
`engineVersion()` reflect the new version.

---

## Tests — 877/877 cumulative

`test_v336.mjs` adds 42 tests:

**Mountain idempotency (T1-T3, 11 tests):**
- T1: column with topY=18 (already painted) → skip, world untouched
- T2: column with topY=8 (natural) → paint, 12 voxels with SNOW cap
- T3: boundary check — topY=10 paints, topY=11 skips

**knockDownMountains (T4-T5, 12 tests):**
- T4: STONE column Y=10..60 with SNOW cap at 61 → above-30 cleared
  (31 voxels), at-or-below preserved
- T5: only STONE (id 1) and SNOW (id 5) cleared — SCREEN/MEMORY/
  WATER preserved even if above maxY

**Universal mute (T6-T9, 13 tests):**
- T6: muteAll saves master volume, calls stopAll/muteSpeech, sets
  kpop._ttsMuted
- T7: idempotent — second call doesn't overwrite saved volume with 0
- T8: unmuteAll restores exact saved volume (0.8 → 0.8, not 1.0)
- T9: toggleMuteAll flips state

**inspectStorage (T10, 4 tests):**
- Rows sorted by bytes desc, non-voxelengine keys filtered

T7 is the test that matters most for state-machine correctness —
without it, two consecutive `muteAll()` calls would lose the
original volume forever.

---

## Try it on your current world

```js
// 1. Confirm v336
engineVersion()
// → "v336"

// 2. See what's persisting that you thought was gone
inspectStorage()
// → table of every voxelengine.* key with size + preview

// 3. Flatten the cliff-mountains
knockDownMountains()
// → "[world] knockDownMountains(maxY=30): cleared 12483 voxels across 942 columns"

// 4. Test universal mute (or click the 🔊 button)
toggleMuteAll()
// → true (all audio silenced)
toggleMuteAll()
// → false (audio restored)

// 5. If something STILL persists after resetWorld(), nuke it:
hardResetWorld()
// → clears every voxelengine.* key
```

Order matters for #3 — `knockDownMountains()` operates on currently-
loaded chunks. If chunk streaming is on (`streamer.enabled() === true`),
chunks loaded later will have FRESH mountain paint with the v336
idempotency fix, so they won't need knocking down.

---

## What's NOT in v336

- **Mountain slopes / tapering.** The painter still produces
  vertical-walled stacks per column without inter-column smoothing
  for slope. A natural-looking mountain biome with gradual slopes
  is a separate (substantial) round — biomePainter needs to look
  at neighboring columns and smooth height transitions.
- **Audio fade-in/out on mute.** Currently it's instant — abrupt
  cut. A 200ms fade would be smoother but isn't urgent.
- **Re-apply biomePainter button.** If you want to re-paint with
  the v336 logic on existing chunks, you'd need a "paint mountain
  biome only" button. For now: `resetWorld()` re-runs everything
  from scratch.

---

## What's next

Moving down the post-docket queue:

- **#1 MeshPostProcessor wiring** ✓ (v335)
- **#2 OBJ floating preview canvas** — draggable, above bench
- **#3 Per-tool "→ Bench" buttons** in pipeline section
- **#4 Boundary walls following camera** (v332 limitation)
- **#5 CS arc validation** (still on you)

Plus a couple new ones from this round's findings:
- Mountain slope/taper (biomePainter inter-column smoothing)
- Audio fade transitions

Per your "in order" preference: #2 OBJ floating preview canvas is
up. Or if mountain slopes feel more pressing in real-play, that
can jump the queue.
