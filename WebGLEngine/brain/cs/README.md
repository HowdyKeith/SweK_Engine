# Counter-Strike tactics — a GPU Brain learned integration

The brain does not play retail CS (there is no open bot API the way BZFlag ships `bzfs`). What it learns
is the decision that actually wins rounds: in the half-second a peek gives you, **which of the enemies you
could shoot do you shoot first.** Same target-scoring shape as Endless Sky and BZFlag, a different schema.

## Files

- `../csTacticsPolicy.js` — the schema: 7 features, a hand policy, a `reach`-gated linear score. Uses the
  shared learner in `../linearPolicy.js` (contrastive, averaged-not-summed update). Its `isFeat` is the
  wall that rejects a ship's or a tank's samples.
- `csEnv.js` — a headless engagement generator. Real geometry (range, angle-off-crosshair, exposed body),
  health, threat, and whether the enemy is on the bomb, resolved against a HIDDEN "true" priority the
  learner has to recover.
- `csLoop.mjs` — the pilot loop: scores engagements with the served weights, posts outcomes back to the
  bridge, reports win-rate. `node brain/cs/csLoop.mjs` (or `--once`).
- `tools/cs-selfcheck.mjs` — the proof: geometry, the schema wall both ways, the reach gate, and that the
  learned policy shoots the right enemy more often than the hand policy. `node brain/cs/tools/cs-selfcheck.mjs`.
- `../../ai-bridge/csTacticsBridge.js` — serves and learns the weights at `/ai/brain/cs/tactics`
  (GET current, POST outcomes, POST `/reset`). Registered BEFORE `gpuBrainBridge`, which owns the whole
  `/ai/brain` prefix.
- `../../counter-strike.html` — the control panel: watch a round, see the pick, train the policy live.

## The features

`reach` (the gate: clear line of fire AND in range, else the whole score is 0), then `near`, `crosshair`
(on your current aim), `exposed` (body out of cover), `lowHp`, `threat` (aimed at you / holds an AWP), and
`objective` (planter / defuser / bomb carrier).

## Honesty rules (shared with ES and BZ)

- an untrained policy is NOT served — `source: "hand"` and the pilot keeps its own defaults.
- a decision with no runner-up carries no gradient and is rejected, not invented.
- the sample buffer is capped and persisted, so training is reproducible from disk.

## Next

A real bot client (a raycaster/WAD-FPS or VBA-FPS agent posting live engagements) replaces `csLoop.mjs`
as the sample source; the policy and bridge stay exactly as they are.
