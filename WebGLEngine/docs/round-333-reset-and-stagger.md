# Round 333 — Reset that actually resets + dumpChunkGrid stagger fix

Three small fixes responding to live testing. Shipped alongside v334
in the same delivery.

---

## The bugs

**1. World reset didn't actually clear everything.**
The Reset World button (and the equivalent `world:reset` router
command) only cleared `voxelengine.worldDiff` and
`voxelengine.camera`. The "applied" gates for biome painter, ruin
placer, and cave carver stayed set in localStorage. Result:

- Fresh chunks generated from noise (no ruins / biomes / caves)
- Painters/placers checked their gates → SKIPPED
- World came back sterile, AND the v332 ruinPlacer fix couldn't
  actually take effect (because the placer never re-ran)

**2. Ctrl+Shift+R looked like reset but wasn't.**
Hard refresh triggers `beforeunload` → `persistence.save()` → all
modified chunks (including the buggy floating-ruin chunks) get
written to localStorage. On reload, `persistence.load()` restores
them. The "reset" silently undoes itself.

**3. `dumpChunkGrid` caused a frame stagger.**
The diagnostic emitted 18 separate `console.log` calls in sequence
(header + 15 grid rows + 2 N/S markers). Chrome's dev-console
flush is synchronous, so 18 calls = visible hitch.

---

## The fixes

### `world:reset` clears the gate flags

In `core/commandRouter.js`, the handler now removes the three
applied-flags after clearing voxel diff + camera:

```js
this.env.persistence.clear();
this.env.persistence.clearCamera();
try {
    localStorage.removeItem("voxelengine.biomes_v2_applied");
    localStorage.removeItem("voxelengine.ruins_v1_applied");
    localStorage.removeItem("voxelengine.caves_v1_applied");
} catch {}
```

After reset, fresh chunks generate AND the painters/placers re-run
(with v329/v332 fixes intact). You get a properly-decorated world,
not a sterile one.

### `world:hardReset` for the nuclear option

New router command. Walks every localStorage key and removes
anything starting with `voxelengine.` — covers voxel diff, all
gate flags, camera, AI model selections (`ollamaModel`,
`diffuserModel`, `ollamaObjModel`), KPop settings, trellis stats,
everything we own.

Also wipes in-memory `_modified` flags on all chunks so the
`beforeunload` save during the reload window doesn't restore
anything.

Returns `{ ok: true, hard: true, cleared: N, keys: [...] }` for
console inspection.

### Console helpers

Two new functions wired in `main.js`:

```js
resetWorld()        // standard reset — same as the UI button, fixed
hardResetWorld()    // nuclear — wipes every voxelengine.* key
```

Both reload the page after a 50ms timeout.

### dumpChunkGrid uses one console.log

```js
const header = `[chunkGrid] ref=...`;
const body = "  N\n" + lines.map(l => "  " + l).join("\n") + "\n  S";
console.log(header + "\n" + body);
```

Single multi-line string emitted once. Chrome renders it in one
pass. No stagger.

---

## Tests — 758/758 cumulative (with v334)

`test_reset_v333.mjs` adds 29 tests:

- T1: dumpChunkGrid emits exactly 1 console.log call (spy verifies count)
- T2: stats object still returned correctly
- T3: world:reset removes the three gate flags, preserves unrelated keys
- T4: world:hardReset clears all voxelengine.* keys + zeroes chunk
  _modified flags + preserves non-voxelengine keys
- T5: world:hardReset survives gracefully with no world or empty chunks

T1 is the visual fix verification — guards against future regressions
that might add new console.log calls inside dumpChunkGrid.

T3 + T4 verify the localStorage clean-up behavior using a Map-backed
mock, since Node doesn't have localStorage natively.

---

## Try it

After updating to v333:

```js
// "I want a real reset for testing v332's ruin fix"
resetWorld()
// → clears worldDiff + gates → reloads
// → fresh terrain → ruins re-placed with v332 fix → no sky towers

// "Something is still persisting that shouldn't be"
hardResetWorld()
// → console: "[router] world:hardReset cleared 7 localStorage keys: [...]"
// → reloads with completely fresh state (also re-asks AI model picker)

// "Show me chunk loading without the stagger"
dumpChunkGrid()
// → instant — no frame hitch
```

The Reset World UI button now uses the fixed path automatically.
No UI change needed.
