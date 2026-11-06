# One rig session for the readings the changelog lists as owed (entries v4880 to v4912; written 2026-11-06; UNNUMBERED)

Built from a read of `docs/CHANGELOG.md` entries v4880 to v4912 and of the notes they point to. **The sandbox cannot reach the rig** (no computer folder is offered to this session), so this is a checklist to run, not a run. Each line says where it came from, what the later entries say about it, and what the rig is asked. Where a later entry closed an item, it is listed as CLOSED with the entry that closed it, so rig time is not spent on it. Where this note could not tell, it says so.

## 0. Two corrections the read made, said first

1. **The 1080's round 33 to 35 runs are not owed any more.** v4891 said the 1080 owed rounds 33 and 34 and round 35's trace. `render/learned-denoiser-preregistration.md` sections 100 and 102 record what came back: round 35's crash was NOT REPRODUCED in five runs at bc6fbed2; round 34 on the 1080 was read (list fill 24.0 / 25.4 ms against the ring fill's 26.9 / 26.2, chain 1.424 / 1.395 x, H holds); round 33 on the 1080 was left closed on purpose ("the numbers are reported and do not count", section 102). Rounds 36 to 41 followed. Nothing is asked of the rig for rounds 33 to 35.
2. **"Rig verdicts never asked" is one question, not a dozen.** The entries v4880, v4883, v4884, v4897, v4900 and others each say "the rig's verdict of this round has not been asked". A rig `Clone -> verify` grades the whole tree at the commit it clones, and every later tree contains the earlier ones, so ONE verify of main's tip answers all of them at once (a red names its gate). It does not answer a verdict on a tree that has since been fixed: those old reds do not matter any more.

## 1. The session, in the order that wastes the least of the rig's time

**Step 1, start the long runs first (they need no eyes).** From `WebGLEngine\` on the rig, on the branch `claude/sweet-lovelace-8leivh` (or a checkout that contains `tools/ship/plainNetVariantsCmd.mjs` and generations 6 and 7 of `trainSubVestibular.mjs`; `git log -1` must name a commit that has them):

```
node tools/ship/plainNetVariantsCmd.mjs run --specs all --out brain/plainNetVariants.jsonl --workers 8      # ~10.5 core-hours (brain/PLAIN_NET_VARIANTS_WIP.md)
node tools/ship/trainSubVestibularCmd.mjs run --specs wiringShuffledFresh --out brain/fishVestibularGen6.jsonl --workers 4   # ~10.6 core-hours (brain/FISH_WIRING_FRESH_WIP.md, Addendum 16)
node tools/ship/trainSubVestibularCmd.mjs run --specs wiringPermutations --out brain/rig-results/fishVestibularGen2.jsonl --workers 4   # ~21 core-hours (brain/FISH_WIRING_RANK_WIP.md, Addendum 17; resumes Addendum 12's own file)
```

Each is resumable (a second run skips what is in the file) and writes one line per circuit. They are CPU work: run them one after another, not beside the GPU steps below, or the timings in step 3 read a loaded box. Read each with its `report --in <file>` line; do not read a results file before its run is whole.

**Step 2, the one verify (about the usual length of a verify).** On the rig, the GitHub panel's `Clone -> verify` of main's tip (or `node tools/ship/shipVerdict.mjs --version <tip>` in a fresh clone). This is the answer to "rig verdicts never asked". Send back the verdict's last line and the names of any red gates. Two things to watch for in it, from the entries:

* v4880's note: "the rig-only non-zero exit in one of seven gates (avatarServerViews, boundaryLint, canvasFill, homography, proseAudit, registerResidue, wasmSupport) is still unidentified". Nothing later says which, or that it was closed. If one of those seven is red, it is that one.
* v4911's two reds that were "handed back as rig-side steps": `declaredCost` (new gates with a declared cost and no timing record on the rig) and `strandCensus` (`ai-bridge/apks` left untracked and unignored by `routeShadow-selfcheck` on that box). Whether they were done is not recorded in the entries I read.

**Step 3, the looks (real GPU, a real browser window, not headless).** These are looks that were only ever taken in headless Chromium on a software adapter. Each is one sentence of what to do and one of what a wrong picture looks like.

| entry | page | what to do | what wrong looks like |
|---|---|---|---|
| v4897 (snow's TAA default) | `snow-gpu.html` | Open it in Chrome with the GPU. Leave the TAA box ticked, orbit slowly for ten seconds, then untick TAA and orbit the same way. The default history is now read through the hardware sampler (8-bit weights) and the coarse forms of the beauty pass are on. | Ghost trails behind the footprints, a soft smear on edges that the unticked picture does not have, shimmer on the sastrugi and grain that the unticked picture lacks. The frame rate shown is also worth writing down (the Intel gen-9 read 15 fps at 1280x720 before the changes). |
| v4899 (the fins) | `sub-aquarium.html` | At the default camera look at a sub's tail: the stern planes and the rudder. Ask for a pitch and a yaw (the list rows show the commands) and see the planes' trailing edges go up for pitch +1 and the rudder swing for yaw +1. Also say whether the `Robot*.glb` models load in the copy you serve (the entry says that is yours to find). | Fins that do not move, move the wrong way, or are invisible at the default camera (the entry says they are small under the translucent sea). |
| v4900 (the follow camera) | `sub-aquarium.html` | Tick "follow the selected sub": the camera should ease onto the sub and come in to 70 m so the tower, planes and rudder fill the panel; untick: the distance and centre ease back. Select another sub while following. | A jump instead of an ease, a camera that does not leave a sub that left the tank, a readout of pitch, yaw, thrust and ballast on each list row that does not change. |
| v4902, v4904 (the Sea OGRE in the game) | the main game page, console | `ogre.sub()` then `await ogre.brainSubs({ squad: true })`. The terrain was missing because the stage isolation stayed "exclusive"; v4904 leaves it before the start. Checked headless only. | Only the bare grid again; a ReferenceError in the frame loop. |
| v4898 (the flight map selector) | the flight page | Pick each map and fly the circuit on the hills. | A circuit that runs through the ground. |
| v4881, v4883, v4894 (the sea) | the ocean page | The CPU sea's heights were never looked at as water (the spectrum is not fitted to a sea state). v4894 recorded the GPU costs (148-220 ms on the UHD 620, 4-8 ms on the Pascal), not a look. | Say whether it reads as a sea. |

**Step 4, a second adapter for one number.** v4885: the radial image of the zoom blur reads 1 ulp from the CPU at strength 0 on the Intel gen-9, and the entry says "a second adapter would confirm" that the gap is the square root's own. `node tools/ship/zoomBlurExact-selfcheck.mjs` prints the worst figure per image. Whether node-webgpu can be pointed at the 1080 instead of the Intel is NOT established here; if it cannot, drop this step.

## 2. What is CLOSED (do not spend rig time)

* The 1080's rounds 33 to 35: section 0.
* The snow TAA bug and the per-pass costs on both GPUs: `docs/real-hardware-snow.md` and v4897 (TAA 7.9 to 5.15 ms on the Intel, 0.187 to 0.120 ms on the 1080).
* The ocean's costs on both GPUs: v4894 slice 5.
* The record probe's kill rows on win32: v4893 (green on the rig's win32 box, run alone at 7fbce89e).
* The advisor study (Round 5): read in v4907.
* The Windows path class of failure: `node tools/ship/winPathLint.mjs --probe --changed` now reproduces it in the sandbox (this tree, 2026-11-06).

## 3. Not checked here, said plainly

I did not open the pages or run anything on a GPU; the "what wrong looks like" column is read from the entries' own wording and from what each change did, not from a picture. Which of the seven gates in the v4880 note was the rig-only red, and whether `declaredCost` and `strandCensus` were fixed, are not in the entries I read. Whether the rig has the `Robot*.glb` files is the user's to find (v4899, v4900).
