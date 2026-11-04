# Branch cleanup, 2026-11-04 (UNNUMBERED; writing only -- nothing here was run)

Keith, 2026-11-04: "I know that there are old branches that are already merged and I will need the DOS commands to delete them once we verify which are taken care of."

## How this was verified
For every remote branch, `git rev-list --count <publish branch before today's merges>..origin/<branch>` was 0: every commit of the branch is already in the line the publish branch carries (94 branches). Nothing was deleted from here: this session can push to its own branch only.

## 1. Merged before today -- safe to delete (94 branches)
Run from any checkout of the repo (DOS). Fifteen a line, because a command line is limited to 8,191 characters. A branch that is already gone answers an error and the loop goes on.

```
for %b in (claude/barehands-integration-oomqew claude/batvu-rvqr-rangefinder-qr claude/bvh-csg-blast-localisation claude/bvh-csg-round10-eps claude/bvh-csg-round11-scale claude/bvh-csg-round12-contacts claude/bvh-csg-round13-flag claude/bvh-csg-round14-finish claude/bvh-csg-round15-cost claude/bvh-csg-round16-seam claude/bvh-csg-round16b-exact claude/bvh-csg-round16c-snapround claude/bvh-csg-round16d-hotpixel claude/bvh-csg-round16e-straddle claude/bvh-csg-round16f-exact) do git push origin --delete %b
for %b in (claude/bvh-csg-round16g-exact-default claude/bvh-csg-round16h-exact-nonconforming claude/bvh-csg-round17-translate claude/bvh-csg-round18-audit claude/bvh-csg-round18b-finish claude/bvh-csg-round19-default claude/bvh-csg-round19b-openings claude/bvh-csg-round19c-sliver-fan claude/bvh-csg-round20-manifold-audit claude/bvh-csg-round20b-embedded-rounding claude/bvh-csg-round20c-settle-fan claude/bvh-csg-round9-arrangement claude/code-review-nr3a01 claude/code-review-nr3a0i claude/code-review-nr3a0icls) do git push origin --delete %b
for %b in (claude/commit-belt-identity claude/denoiser-c1-training claude/denoiser-deploy claude/denoiser-device claude/denoiser-emitter-mask claude/denoiser-kernel-speed claude/denoiser-kpcn claude/denoiser-large-net claude/denoiser-randomized claude/denoiser-round14 claude/denoiser-round15 claude/denoiser-round16 claude/denoiser-round17 claude/denoiser-round18 claude/denoiser-temporal) do git push origin --delete %b
for %b in (claude/denoiser-third-family claude/denoiser-train-c claude/economy-checker-rules claude/exported-functions-mesh-render-exui0d claude/fish-vestibular-helper claude/five-standing-reds claude/kinematic-game-view claude/long-silence-elements-check-22ecrz claude/nn-denoiser claude/orrery-seeded-by-git-log claude/particle-rendering-errors-097u4l claude/refusal-own-repo claude/round21-suite-green claude/round23-wall-bvh-reuse claude/round24-page-sessions) do git push origin --delete %b
for %b in (claude/round25-snapped-path claude/shader-porting-swek-ozgvb0 claude/splat-collision claude/stale-numbers-sweep claude/swek-engine-upgrade-ugijhw claude/three-texturebarrier-swiftshader claude/trader-policy-outputs claude/v4661-complete-singles claude/v4662-last-teleports claude/v4663-cadence claude/v4664-formation claude/v4668-spmix claude/v4669-porttail claude/v4670-orb-phase2 claude/v4671-backlog-integrity) do git push origin --delete %b
for %b in (claude/v4672-relative-budget claude/v4673-orphan-sets claude/v4674-tier-cap claude/v4675-record-probe claude/v4680-changelog-tail claude/v4680-changelog-tail-v2 claude/v4778-rig-fixes claude/wgsl-vendor-scope fish1-fetch-fix record-v4880-release record-v4882-release record-v4883-release record-v4885-release record-v4886-release record-v4887-release) do git push origin --delete %b
for %b in (record-v4888-release record-v4889-release record-v4890-release record-v4894-release) do git push origin --delete %b
```

## 2. Merged TODAY into the publish branch -- do NOT delete until their chats say they are finished
* `ccr-6c3eeb7c-pxz6kx` -- the denoise / upscaler chat (Rounds 78-82; its study is running on the rig).
* `claude/tier-2-keys-patch-4lwhzk` -- the box3d chat (still working; its two battleship gates are red at its own tip, see below).
* `claude/sweet-lovelace-8leivh` -- the fish / fly / navigation chat (waiting on rig timings).
* `claude/vigilant-feynman-r315c9` -- the Decider audit (Round 14 Decider, 7 commits; probably finished, delete once its chat confirms).

## 3. NOT merged, and why
* `claude/round22-guardian-names` (2026-10-02, one commit, 7 files): a round stacked on v4675 whose files (`frozenRecords`, `recordProbe`, `recordReach`, `vba/runtimeGap`) have moved far since; merging it conflicts in 5 files. NOT taken. Decide: abandon (delete) or ask for a rebase. `git cherry` says its one patch is not in the publish branch.
* `record-v4874-release`, `record-v4879-release` (2026-10-19 and 10-20, one commit each): old release-record commits; `git cherry` says each patch's content is already in the publish branch (the records were re-written later), their `releases.json` conflicts. Safe to delete:

```
for %b in (record-v4874-release record-v4879-release) do git push origin --delete %b
```

## 4. Left for the box3d chat, found while merging
`brain/battleshipFight-selfcheck.mjs` (9 reds) and `tools/ship/battleshipPage-selfcheck.mjs` (1 red) are red at the TIP of `claude/tier-2-keys-patch-4lwhzk` itself (checked in a worktree of that tip), not because of the merge: the pinned fights and the shipped pilot's label (`held-out 20.569` against a pinned `9.934`) disagree with the 6-DOF pilot weights file that line carries (`brain/pilot6dofMlpWeightsDefault.json`).
