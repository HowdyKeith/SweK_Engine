# SweK GPU Brain v77 -- MERGED into EngineProject v2064 (headless WebGPU enemy AI)

A standalone Deno process that solves terrain-aware flow fields on the
GPU and feeds them to kaiju navigation -- off the engine's frame budget,
off the engine's thread, killable at any time with zero behavior change.
Authority model unchanged: the game owns positions; the brain only
publishes fields the game may consult.


## REFUSAL CASE LAW (standing index -- pointers, not paraphrases)

The bar for new machinery, findable in one place. One line per
refusal: the verdict and where the full reasoning lives. Pointers
rot less than paraphrases -- read the section, not this line.
DECIDED without a lint contract: the day this index drifts from
the sections, THAT drift earns the contract, not before.

- v54: exposure-weighted chi REFUSED -- count-margin chi is scale-
  invariant; weighting changes the null. (built, tested, reverted)
- v71: smoke-ledger snapshot loop REFUSED -- the self-check runs
  every smoke; no silent drift exists for a snapshot to catch.
- v72: gated-contract registry REFUSED -- one member is a pattern
  claim, not a pattern; build at the second gated contract.
- v73: streak-threshold knob REFUSED -- 3-of-5 has a reason
  (majority of the window), not a preference; knobs invite tuning
  smoke alarms.
- v74: anchor-pair contract generalization REFUSED -- see below.

## FPS FLIP-DAY RUNBOOK (standing -- consume at the next dungeon reset)

Follow by finger, in order; the flip and the reset are ONE act.

1. STOP the brain and the engine page.
2. simulation/DungeonDemo.js: FPS_DOMAIN_SPLIT = true (one boolean,
   top of file; the work-order comment sits at the push sites).
   [v59: steps 2-3 automate as `sh tools/fps-flip.sh` from the repo
   root -- tested on a throwaway copy; steps 4-6 stay human eyes.]
3. DELETE brain/difficulty_ab_dgn.json (the dungeon A/B reset --
   [v61: the flip script now backs it up to .bak first; a mis-flip
   restores with one cp + re-flip of the boolean]
   the shooter's history walks out of arms it was counted in, so
   the arms restart clean; adopted/resolved state goes with it,
   deliberately).
4. START the brain. VERIFY the boot log line:
   "[brain] fps head born from the DUNGEON's trained head (v57
   decision)" -- if it says kaiju instead, weights_attack_heads.json
   has no dungeon entry yet; play dungeon first, then re-flip.
5. Play one SHOOTER session (fpsShooter active). VERIFY on the
   console: the fps rows in the T-sweep / hit-rate readouts wake
   from empty; domainOf is routing fps- ids.
6. Play one TD-MODE dungeon session. VERIFY dgn rows ALSO move --
   the split only claims the shooter, not the dungeon.
7. Cross off: this runbook's job is done; delete the section or
   mark it CONSUMED with the date.

## Dataflow

  main.js (2Hz)  --POST /ai/brain/snapshot-->  bridge (dumb mailbox)
                 <--field in the response----
  brain.js (4Hz) --GET  /ai/brain/snapshot-->  bridge
                 --POST /ai/brain/flowfield->  bridge
  Kaiju.js: when the CPU waypoint planner FAILS (the straight-line
  fallback that walks kaiju into cliffs and water), sample the field and
  blend 60% field / 40% direct-to-target.

Snapshot: 96x96 height grid, 4-unit cells (384x384 world units centered
on the camera) + civ centers as goals. Field: per-cell unit vectors
toward the cheapest path to the nearest goal, where cost = 1 + 3*slope,
+25 in water -- so the field routes around cliffs and lakes and wades
only where there is no dry crossing.

## Files

NEW  brain/brain.js         main loop (poll -> solve -> publish, stats)
NEW  brain/gpu.js           WebGPU init; HARD-FAILS on software adapters
                            (llvmpipe/SwiftShader/Basic Render Driver) --
                            a CPU rasterizer pretending to be the GPU
                            brain defeats the point
NEW  brain/flowfield.js     3 WGSL kernels: k_cost (slope+water),
                            k_relax (Jacobi min-plus, ping-pong, ~1.7*N
                            iterations), k_flow (8-neighbor gradient).
                            Buffers created once per grid size, reused
                            (same no-churn discipline as PATCH-VR3)
NEW  brain/START_BRAIN.bat  sets WGPU_BACKEND=vulkan + runs deno with
                            --unstable-webgpu; friendly deno-missing hint
PATCH ai-bridge/server.js   PATCH-B1: /ai/brain/snapshot (POST returns
                            the freshest field -- one round trip, no new
                            polling loop in the browser), /ai/brain/
                            flowfield, /ai/brain/status
PATCH main.js               PATCH-B2: 2Hz snapshot publisher (in-flight
                            guarded, fire-and-forget) + field receiver +
                            window.sampleBrainFlow(x, z) sampler (null
                            when absent/stale>5s/out of area)
PATCH simulation/Kaiju.js   PATCH-B3: flow blend in the planner-failed
                            fallback only. No field -> byte-for-byte old
                            behavior

NOTE: main.js here is based on the WebGL_VoxelRenderer_PatchPack_v1
main.js (VR4 wiring + H hoists included). diffs/main.js.diff is against
that base; the other diffs are against pristine v1985.

## Verification done here

- All brain modules + all three patched files pass node --check as ESM
- Kernel ALGORITHM validated on CPU (exact same control flow as the
  WGSL) on a synthetic map: agent routed through the single wall gap,
  reached the goal, and crossed water only at the narrowest point when
  no dry route existed
- Deno WebGPU invocation web-verified against current docs (June 2026):
  still --unstable-webgpu; WGPU_BACKEND=vulkan pinned because Deno on
  Windows panicked when wgpu chose the GL backend (denoland/deno #26144)

## Rig-only verify (cannot be tested in this sandbox)

- deno run prints "[gpu] adapter: NVIDIA ..." and NOT the software-
  adapter refusal. If it refuses: driver update / WGPU_BACKEND check
- With engine + bridge running: curl http://127.0.0.1:8787/ai/brain/status
  shows snapPosts climbing (browser publishing), then start the brain
  and fieldPosts climbs with fieldSolveMs a few ms
- In the engine console: window.gpuBrainStats populated;
  window.sampleBrainFlow(camera.position.x, camera.position.z) returns
  a unit-ish vector near civs
- THE DEMO: spawn a kaiju across a lake or ridge from a civ, break its
  path (destroy terrain between waypoints). Old: it beelines into the
  cliff/water. New: it contours around. Kill the brain process mid-run:
  behavior reverts within 5s (field staleness window)
- solveMs on the 1070 should be low single-digit ms for 96x96 x ~164
  iterations; if it is 50ms+, the software-adapter assert failed you --
  check the adapter line

## v2 -- Phase 2 (threat field + policy inference)

Two new GPU workloads per solve tick, same mailbox, ZERO bridge changes
(the v1 mailbox was payload-agnostic by design -- server.js diff is
unchanged from v1):

THREAT FIELD -- kaiju positions seed a second relax solve with DISTANCE
readback (flowfield.js v2: wantDist, no flow pass). Because the field is
cost-weighted, terrain between you and a kaiju genuinely reads as
safety. Consumer: PATCH-B4 -- _pickRetreatTarget scores 12 ring
candidates by sampled threat distance and flees to the SAFEST, instead
of the stock random direction that regularly ran wounded kaiju back
into the fight or into open water.

AGGRO POLICY -- NEW brain/mlp.js: generic batched MLP forward on GPU
(any depth/width, fused bias+activation, ping-pong activations, weights
uploaded once). NEW brain/policy.js: 10 features per kaiju (energy,
tier, local threat, prey proximity, kind flags) through a single
sigmoid layer with HAND-SET, sentence-readable weights -- honestly
labeled a designed utility in network form; a trained policy is a
weight swap in buildLayers(), nothing else changes. Consumer: PATCH-B5
-- retreat threshold = 0.3 * (1.4 - 0.8*aggro): veterans with prey in
reach hold to ~0.23, wounded swarmed kaiju bail at ~0.38, hellspawn
fanaticism visibly overrides fear, and aggro 0.5 reproduces stock 0.3
EXACTLY. No brain -> null -> stock everywhere.

v2 validation (CPU references of the exact kernel control flow):
- 2-layer batched MLP matches an independent forward to 1e-6
- policy sanity table in the pack notes: stock-reference case lands at
  0.302 vs stock 0.300; ordering of brave/timid cases all correct

v2 rig checks (additive to the v1 list):
- /ai/brain/status fieldSolveMs roughly doubles (two solves + MLP)
- console: window.sampleBrainThreat(camera.position.x,
  camera.position.z) near a kaiju is small, far away is large/9999
- window.getBrainAggro(<kaiju id>) returns 0..1; a tier-8 healthy
  kaiju scores visibly higher than a fresh wounded one
- THE DEMO: wound a kaiju next to a second kaiju fight -- old behavior
  fled in a random direction (sometimes INTO the brawl); new behavior
  visibly picks the quiet side. Kill the brain: random retreat returns
  within 5s

## v3 -- Phase 3 (attack selection over the REAL Round 30)

CORRECTION FIRST: my phase-2 notes said Round 30 "did not exist yet" --
wrong. This engine already ships a full ranged-attack system in
world/kaijuAttacks.js: ~20 attacks across beam/projectile/aoe families,
3-deep per-kind rotations (primary/alt/alt2), king overrides and king
rotations, family executors, cooldown buffs, narrative events. Mid-build
I briefly wired a duplicate registry before the import list exposed the
real one; that duplicate was rolled back IN THE SAME SESSION and nothing
of it ships in this pack. Phase 3 is what it should be: replacing the
BLIND rotation with situational selection over the existing registry.

FOUND + FIXED while in there (PATCH-B8, world/kaijuAttacks.js):
advanceKingAttackRotation cycled non-kings % 2, but v769 made rotations
3-deep and getAttackForKaiju indexes all 3 -- the index never reached 2,
so EVERY alt2 attack (meteor, magic_orb, tractor_beam, sonic_scream,
acid_spit, emp_burst -- the whole v769/v771 content wave) was
unreachable for regular kaiju. Now modulo the actual rotation length.
Also: the kaiju_ranged_attack event reported KIND_TO_ATTACK[kind]
regardless of what actually fired (wrong for every rotated/alt/king
attack); specs are now name-stamped and the event reports attack.name.

PATCH-B8 also adds availableAttacksFor(k) -- the kaiju's LEGAL attack
set (king rotation respected) -- the single source of truth shared by
the snapshot publisher and the manager's validation of brain picks.

PATCH-B9 (KaijuManager._tickRangedAttack): consult window.getBrainAttack
(k.id); a suggestion naming anything outside availableAttacksFor(k) is
ignored; no/stale brain -> getAttackForKaiju rotation, exactly as
before. Cooldowns, king-aura buffs, duel multipliers, demoralization,
executors: all untouched downstream.

PATCH-B2c (main.js): roster gains king flag, current-target position,
and the legal attack list (name/family/range/damage) per kaiju; receiver
gains window.getBrainAttack(id) -> {name, score}.

BRAIN v3 (policy.js + brain.js): one feature row per (kaiju, legal
attack) -- 13 features including interaction terms so a single layer can
express "AoE wants crowds" and "beams shine far" -- batched through the
SAME BatchedMLP (256-row cap), argmax per kaiju, published as
attack:{id:{name,score}}. Hand-set sentence-readable weights, same
trained-drop-in story as v2.

v3 validation (CPU, exact kernel flow, real registry values):
  hell @14u vs cluster : flamethrower 0.974 > fireball > magic_orb
  hell @26u vs lone    : magic_orb/fireball ~0.92 >> flamethrower 0.304
  tech @38u vs lone    : ion_lance 0.935 >> swarm_volley >> emp_burst
  tech @10u vs cluster : emp_burst 0.970 > swarm_volley > ion_lance
All four flips are the tactically correct ones.

v3 rig checks:
- BRAINLESS FIRST: with the brain OFF, watch a hell kaiju's attack
  cycle -- magic_orb (alt2) now appears in rotation (it never could
  before; that is the B8 bug fix, visible without any GPU involvement)
- Event feed: kaiju_ranged_attack attackName now varies with what fired
- Brain ON: park a tech kaiju far from a lone civ -> ion_lance every
  time; lure it into a civ cluster -> emp_burst takes over. Kill the
  brain -> rotation returns within 5s
- window.getBrainAttack(<id>) in the console shows {name, score}

## v4 -- Phase 4 (online learning: the weights earn themselves)

Closes the loop every honesty note promised: the engine reports what
each fired attack actually accomplished, and the attack policy's
weights move toward reality. Restart-proof: weights persist to
brain/weights_attack.json and reload at boot.

DATA PATH (PATCH-B2d, main.js): civEvents.subscribe captures
kaiju_ranged_attack (attackName is truthful as of PATCH-B9 -- phase 4
is only possible because phase 3 fixed that event). Beams and AoE apply
instantly in this engine, so they are outcomes at fire time; projectile
outcomes wait for their real projectile_impact event, matched by
ownerKaijuId (tree throws also impact but never have a pending shot, so
they are ignored). Outcomes ride the next snapshot POST -- ZERO new
routes, zero cost when no brain is consuming them.

LEARNER (NEW brain/learn.js): the attack policy is a single sigmoid
layer = logistic regression, so training is plain SGD -- DELIBERATELY
ON CPU. Batched inference belongs on the GPU; a 13-parameter SGD step
does not, and putting it there would be theater. The brain remembers
EVERY candidate row it scores (not just its picks), so brain picks,
epsilon explorations (BRAIN_EPSILON, default 0.10 -- some kaiju get a
random legal attack so the learner sees counterfactuals), and the
engine's rotation fallback ALL become labeled experience. Weight clamp
+-6 and L2 keep long runs stable. mlp.js gained updateWeights() --
hot-swaps the GPU buffers in place, same buffer-object-reuse trick as
voxelrenderer VR3. NEW brain/attackDamage.js: reward-shaping damage
table extracted PROGRAMMATICALLY from world/kaijuAttacks.js (real
registry values; regenerate when the registry changes -- extraction
one-liner lives in the file header). Knobs: BRAIN_LEARN=0 disables,
BRAIN_LR, BRAIN_EPSILON. START_BRAIN.bat adds --allow-read/--allow-write.

REWARD, honestly stated: hit-probability-weighted damage. Projectiles
are labeled by real impacts (ground splash = 0); beams/AoE always land
by engine design, so their reward is their damage (AoE boosted by the
cluster captured at fire time). Expect the policy to learn that
long-range projectiles whiff and beams don't -- that IS the lesson.

v4 VALIDATION (exact learn.js SGD + exact policy.js features against a
synthetic environment with computed expected-value ground truth):
  hand policy      : avgRegret 0.0032, oracle agreement 87%
  learned @1.5K eps: avgRegret 0.0023, oracle agreement 88%
  learned @20K eps : identical -- converged, NO drift over long runs
A 28% regret cut over an already-good designed prior, converging within
~1,500 outcomes (an evening of kaiju sandbox). The residual 12%
disagreement is the linear model's expressiveness ceiling -- the
documented case for dropping a deeper net into buildAttackLayers, which
BatchedMLP + updateWeights already support end to end.

v4 rig checks:
- [brain] log line now carries learn: steps/buffer/avgReward; steps
  climb once kaiju start firing
- brain/weights_attack.json appears after ~20 train steps; restart the
  brain -> "[learn] loaded trained weights (N steps)"
- Let a destruction session run an evening, then diff
  weights_attack.json against the hand values in policy.js -- the
  drifted weights ARE the portfolio artifact ("this enemy AI trained
  itself on my machine")
- BRAIN_LEARN=0 freezes weights; BRAIN_EPSILON=0 disables exploration
- Explore picks are flagged explore:true in window.getBrainAttack output

## v5 -- Phase 5 (deep policy, aggro learning, split brain, civ defense)

FOUR items, all shipped:

1) DEEP ATTACK POLICY (policy.js buildAttackLayersDeep + learn.js
MLPTrainer). 13 -> 16 relu -> 1 sigmoid with DISTILLATION INIT: hidden
units 0/1 are +hand/-hand with output taps +1/-1, so relu(h0)-relu(h1)
reproduces the hand logit for every sign -- verified to 4.4e-8. The net
provably starts EXACTLY equal to the hand policy and can only learn
from there. Backprop is CPU (a 13x16 net does not earn a GPU kernel;
the GPU's job stays batched inference) and matches numeric gradients to
8.5e-6. Persistence is multi-layer with v4 back-compat: an old linear
weights file distills its LEARNED weights into the h0/h1 pathway, so
prior training carries forward. HONEST RESULT: in the synthetic
environment the deep net MATCHES the linear learner (0.0023 regret /
88% oracle agreement) rather than beating it -- that environment's
decision boundaries are evidently near-linear in our features. The
deep net's case is the real game's unknown reward surface plus the
cannot-start-worse guarantee.

2) AGGRO LEARNING (brave-window survival). PATCH-B2e: a kaiju whose
energy is below the stock 0.3 threshold but at/above its aggro-scaled
one is fighting on ONLY because the policy said brave -- open a 12s
window; alive at the end = reward 1, gone = 0 (roster disappearance
also catches despawns -- a stated approximation). Timid kaiju generate
NO windows (no counterfactual exists), which is why BRAIN_AGGRO_EPSILON
(default 0.08) occasionally nudges a kaiju brave: a policy drifting
timid would otherwise starve its own training data. Plain SGD on the
single-layer aggro policy; weights_aggro.json persists. Stated frankly:
if fights are lethal, this learns cowardice -- which is the policy
learning the truth.

3) SPLIT BRAIN (BRAIN_ROLE=all|fields|policy + PATCH-B1b). fields role
publishes fx/fz only; policy role publishes aggro/attack/civDef; both
solve the threat grid (both consume it; cheaper than plumbing it
across). The bridge overlays a partial payload's non-null keys onto the
cached field, so a nav brain on Galaxina and a policy brain on PurtyGF
(BRAIN_BRIDGE=http://<galaxina-ip>:8787 -- HTTP crosses the AP
isolation that blocks the UDP beacon) compose ONE field for the
browser. Full payloads replace, exactly as before; single-brain setups
are untouched.

4) CIV DEFENSE (NEW simulation/civRetaliation.js + civDef policy). The
backlog item needed an actual mechanism to make decisions about, so v5
includes a deliberately small one: a threatened civ fires a retaliation
bolt at the nearest kaiju in range (45u, 6s cooldown, 0.02 energy,
floor 0.25) through the EXISTING ProjectileManager -- whose friendly-
fire skip matches ownerKaijuId only, so ownerless civ bolts damage
kaiju correctly. Decision: window.getBrainCivDefense(civId) (scored
from the threat grid + civ health -- three multiplies per civ, kept on
CPU deliberately) with a shoot-when-threatened heuristic fallback.
Wired: one init line + one gated tick line in main.js.

v5 validation: distillation identity 4.4e-8; backprop vs numeric
gradients 8.5e-6; brave-window state machine unit-checked (brave
survivor -> 1, brave death -> 0, timid kaiju correctly excluded); all
files node --check clean.

v5 rig checks:
- weights_attack.json becomes the {layers:[...]} format after the
  first save; restarting logs "loaded deep weights" (or "distilling v4
  linear weights" the first time, carrying v4 training forward)
- [brain] log line: learn now shows attack AND aggro stats; aggro
  buffer fills only during actual close fights (brave windows are rare
  by construction -- an evening yields tens, not thousands; slow is
  expected and honest)
- Split brain: start Galaxina with BRAIN_ROLE=fields and PurtyGF with
  BRAIN_ROLE=policy BRAIN_BRIDGE=http://<galaxina-ip>:8787 -- /ai/brain/
  status fieldPosts climbs at BOTH rates and the browser sees flow AND
  attack picks; kill either process and its half goes stale while the
  other keeps publishing
- Civ defense: park a kaiju near a city -> smoke-trailed bolts arc out
  every ~6s (civRetaliation.stats.shots in console); brain running ->
  weakened civs (energy < ~0.4) hold fire that a healthy civ would take

## v6 -- Phase 6 (civ-defense learning loop + replay persistence)

The hook, closed: civ bolts already flowed through projectile_impact --
they just carried no attribution. PATCH-B10 threads an optional
ownerCivId through ProjectileManager.launch into the impact event
(three lines; nothing else in the projectile pipeline changes), and
civRetaliation stamps its shooter. PATCH-B2f turns every attributed
impact into an outcome on the existing channel: hit a kaiju = 1, ground
splash = 0, multi-kaiju splash earns the same bonus shaping as kaiju
attacks.

The civ-defense policy is now LEARNABLE (weights_civdef.json). v5's
fixed formula is re-expressed as weights over 5 features -- the new
ones being nearest-kaiju tier and nearest-kaiju DISTANCE, which equals
shot distance, the feature that lets it learn which shots actually
land. Hold decisions produce no outcomes (same one-sided-data problem
as timid aggro), so BRAIN_CIVDEF_EPSILON (default 0.06) occasionally
flips a hold to a probing shot, flagged explore:true.

v6 validation (synthetic env where bolt hit probability falls with
distance): the hand prior shot out to ~33u; after 4,000 decisions the
learned policy holds from 28u out, and the distance weight moved
-0.6 -> -1.37. "The cities learned that long shots miss" -- from
nothing but their own impact events.

REPLAY PERSISTENCE (learn.js serialize/restore + replay_buffers.json):
brave windows and civ-bolt outcomes arrive in tens per evening, not
thousands -- losing buffers on restart threw away exactly the data
that is hardest to collect. All three trainers' buffers persist every
50 solves AND on ctrl+c: a SIGINT handler saves weights + replays
before exit, so a brain stopped mid-evening loses nothing. Round-trip
validated sample-exact.

v6 rig checks:
- Console: civRetaliation.stats.shots climbing; [brain] learn line now
  shows civdef steps/buffer/avgReward growing as bolts land or splash
- weights_civdef.json appears; watch W[3] (distance weight) drift more
  negative across an evening of sieges -- that drift is the cities
  learning marksmanship discipline
- Ctrl+c the brain: "[brain] SIGINT -- saving..." then restart:
  "replay restored: attack=N aggro=N civdef=N" -- buffers survive
- Explore probes visible: window.getBrainCivDefense(<civId>) sometimes
  shows explore:true on a shoot that scored under 0.5

## v7 -- Phase 7 (aim, share, narrate, snapshot)

TRANSPARENCY NOTE FIRST: the v6 turn's summary message was lost in
transit -- the pack itself WAS delivered and complete. Before building
v7 I audited v6 end to end (zip == workdir, every claimed patch present,
all files node --check clean); this pack builds on that verified base.

1) CIV-DEFENSE TARGET SELECTION (which kaiju, not just whether).
NEW civtarget policy: one row per (civ, kaiju within bolt range) -- 8
features including the close-AND-big interaction term -- argmax picks
the target; civRetaliation fires at the brain's pick when it is still
alive and in range, nearest otherwise. PATCH-B10b threads targetKaijuId
through ProjectileManager into the impact event, so the outcome labels
the exact (civ, kaiju) AIM row: the policy learns from its own
marksmanship, per shot, per target. weights_civtarget.json persists;
replay buffer included in the v6 persistence scheme.

2) DISTRIBUTED EXPERIENCE SHARING (BRAIN_SHARE=1 + PATCH-B1c).
/ai/brain/experience is a sequence-cursored ring on the bridge: policy
brains POST fresh samples (drainNew) and GET peers' (after cursor,
excluding self). Foreign samples enter replay buffers but are never
re-shared -- validated: no echo, cursor advances correctly, self-
filtering exact. Two policy brains (Galaxina + PurtyGF) now learn from
each other's fights; feature-length guards drop mismatched-version
samples silently.

3) LEARNING MILESTONES -> server.html (NEW brain/milestones.js).
Every 100 attack-train steps the LIVE nets answer a fixed probe set;
an argmax flip on any probe, or a 4u+ drift in the civ hold radius, is
a milestone POSTed to the existing /sys/logs route -- it appears in
server.html's debug console next to the KPop listener chatter. Template
lines are the guaranteed path ("after 200 lessons, the kaiju now favor
beam-type over aoe-type against a lone target up close"); with
BRAIN_NARRATE=ollama the new /ai/brain/narrate route (PATCH-B1d,
mirroring the mascot-quip _ollamaBase + 4s-timeout pattern) rewrites
them as kaiju-documentary narration, failing soft to the template.

4) WEIGHT SNAPSHOTS. Every 500 attack steps the deep net is copied to
brain/snapshots/weights_attack.<steps>.json -- the before/after diff IS
the portfolio artifact, generated automatically.

v7 validation: experience ring semantics exact (self-filter, cursor,
512-cap); no-echo sharing proven; milestone detector catches a forced
attack flip AND a hold-radius collapse (45u -> 21u reported correctly);
all engine patches + brain modules node --check clean.

v7 rig checks:
- Park kaiju of mixed tiers near a city: bolts now prefer the big one
  at the gate over the closest straggler (watch dec.target in
  window.getBrainCivDefense output)
- weights_civtarget.json appears; its dist weight should drift the same
  direction civdef's did in v6 -- aim learns range discipline too
- Two-brain: BRAIN_SHARE=1 on both; [brain] learn buffers grow on BOTH
  machines during a fight only one machine's browser is running
- server.html: "[brain milestone] ..." lines appear during long
  training sessions; set BRAIN_NARRATE=ollama for the documentary voice
- brain/snapshots/ accumulates numbered weight files across an evening

## v8 -- Phase 8 (counterfactual credit, cross-policy features, the report)

1) COUNTERFACTUAL CIV-DEFENSE CREDIT -- and an experiment that
disagreed with the pitch. The plan was textbook clipped inverse-
propensity scoring: explore probes into the hold region fire with
probability epsilon, so their outcomes get weight 1/eps and stand in
for the whole region the policy never samples. The machinery is built
exactly so (rows carry propensity, both trainers apply IPS-weighted
gradients, weights survive replay serialization and sharing). BUT the
validation said no, not so fast:

  A) well-specified model (features include shot distance), hold-radius
     error vs oracle over 6 runs: naive 1.0u, clip=3 2.5u, clip=12
     5.7u. When the model CAN represent the truth, probe labels are
     already unbiased -- reweighting only injects variance and HURTS.
  B) misspecified model (distance invisible to the features, shooting
     correlated with closeness -- the realistic condition, since
     production features never capture wind-up/occlusion/motion):
     naive is biased +0.058 OPTIMISTIC (over-shoots -- logs oversample
     easy close shots), clip=3 cuts it to -0.026, clip=12 to -0.019.

  Shipped default: BRAIN_IPS_CAP=3 -- the measured hedge, not the
  theoretical maximum. Set 1 to disable, raise only under suspected
  heavy correlated logging. Applied to civdef only: attack explore/
  rotation-fallback firing provenance is not logged cleanly enough for
  honest propensities there (phase-9 item if ever). Both experiment
  harnesses are reproduced in full in this notes section's numbers.

  Also v8: the gate threshold stops being an arbitrary 0.5. With the
  sigmoid now read as P(hit|x), the decision is "shoot when hit
  probability clears tau" -- BRAIN_CIVDEF_TAU (default 0.35) is the
  explicit cost/value knob a designer can reason about.

2) CROSS-POLICY FEATURES. The attack net now sees the threat field the
way civdef does: ATK_FEATURES 13 -> 15 (threatAtSelf, threatAtTarget,
zero priors -- learning decides whether crowds change picks). One
shared threat sampler feeds aggro, civdef, AND attack rows. Weight
files migrate automatically: old L1 rows are remapped with the bias
column relocated and the new columns zeroed -- proven BIT-EQUIVALENT
(max diff 0.00e+0 over 300 random inputs) until training moves the new
columns. Old snapshots chart cleanly through the same migration in the
report generator.

3) THE REPORT (NEW brain/report.js). `deno run --allow-read
--allow-write report.js` reads every snapshot (v8 snapshots ALL four
policies, not just attack), evaluates the probe suite against each,
and writes snapshots/report.html: probe-pick table with decision flips
highlighted, civ hold-radius curve, weight drift vs the hand priors.
Dependency-free HTML; smoke-tested end to end (Deno-shimmed) with a
forced flip -- renders correctly. Run it after a week: the file IS the
"what it learned this month" portfolio artifact.

4) KING PACK COORDINATION -- DEFERRED, deliberately. The phase-3 lesson
applies: I have not read the KingPack/aura system's actual coordination
surface, and building against it blind is how the duplicate-registry
mistake happened. It needs its own read-first session.

v8 validation: IPS experiments A+B above; 13->15 migration bit-
equivalent; report.js end-to-end smoke (flip cell + hold radii render);
all modules node --check clean; replay w round-trips (old replay files
load at weight 1).

v8 rig checks:
- First boot after upgrade logs "migrated attack weights 13 -> 15";
  behavior is identical until the threat columns train away from zero
- weights_civdef drift should now respond to tau: raise
  BRAIN_CIVDEF_TAU and watch the hold radius tighten within a session
- After 500+ steps: snapshots/ holds all four policies per step mark;
  run report.js and open snapshots/report.html
- Explore probes in the [brain] log now note their IPS weight

## v9 -- Phase 9 (the pack, and honest attack propensities)

1) KING PACK COORDINATION -- built AFTER the read-first session v8
demanded. KingPack v1 (round 287) turned out to have exactly the
surface needed: _packs (king -> aura members), kings tracking
_lastAttackTarget, and demoralization. PATCH-B12: when a king has a
target and the order says COORDINATE, aura members inherit it;
PATCH-B13: _resolveTarget honors a fresh order (4s window) -- hellspawn
stay on-mission, demoralized kaiju ignore orders (leaderless packs
scatter, completing the round-287 design), stale/dead orders fall
through. PATCH-B12b adds packSizeOf to KingPack. The order policy is a
hand-set linear scorer published per king (focus when the pack is big
and the king healthy; scatter into a meat-grinder target; wounded kings
do not order charges -- all four cases verified). LEARNING for pack
orders is deliberately NOT included: pack-level reward attribution
(whose focus order caused which outcome across a 20s brawl) is a real
credit-assignment problem, not a weekend SGD -- stated, not hand-waved.
Brainless fallback: coordinate when pack >= 3.

2) ATTACK-SIDE PROPENSITY LOGGING -- attack rows join the IPS scheme
honestly. PATCH-B11 stamps every kaiju_ranged_attack with its
provenance (brain | brain-explore | rotation); the brain records what
it published and how many legal options existed, so outcome-time
propensities are exact: argmax fires with p = (1-eps) + eps/n, an
explore with p = eps/n (weight clipped by the same BRAIN_IPS_CAP=3 the
v8 sweep chose -- an explore at eps=0.10, n=3 would weigh 30 unclipped).
Rotation fire has NO defined propensity under our behavior policy, so
it trains uncorrected at weight 1 -- the honest treatment of untracked
logging, spelled out rather than approximated.

3) REPORT SPARKLINES. report.html now charts each probe's CONVICTION
(top score minus runner-up) as an inline-SVG sparkline across
snapshots -- a decision flip appears as the curve dipping through zero,
the story of a changed mind rather than a highlighted cell.

4) POLICY RESET. BRAIN_RESET=1 archives every weight file to
*.pre-reset.json, re-distills from the hand priors, and KEEPS the
replay buffers: fresh mind, remembered experience. For demos that need
stock behavior, and for before/after retraining comparisons.

v9 validation: propensity math exact (brain 0.933 -> w 1.07, explore
0.033 -> w 3.00 clipped from 30, rotation -> w 1.00); pack-order policy
verified on all four canonical cases after a retune the first sanity
table caught (lone wolves free-hunt, meat grinders scatter); all engine
patches + brain modules node --check clean.

v9 rig checks:
- Promote a king near 3+ kaiju with a civ in reach: the pack visibly
  converges on the king's target within an aura tick or two; kill the
  king and watch the same pack scatter demoralized
- Event feed: kaiju_ranged_attack now carries attackSource; the mix of
  brain/brain-explore/rotation is itself a health metric (mostly
  rotation = the brain's picks are going stale -- check field ts)
- BRAIN_RESET=1 boot: "RESET: archived ..." lines, stock behavior
  returns, replay counts unchanged in the restore line
- report.html now has the sparkline row; flat-high lines mean settled
  convictions, zero-crossings line up with the highlighted flips

## v10 -- Phase 10 (orders learn, kings differ, memory survives, VBA joins)

1) PACK-ORDER LEARNING. The credit-assignment problem, scoped honestly:
episodes open when a king's FOCUS order targets a CIV (identified as
the goal within 10u of the ordered position) and close 15s later --
civ destroyed or drained >= 0.25 energy is reward 1, else 0. Kaiju-
target orders are EXCLUDED from learning (the roster carries target
position, not identity -- a stated limitation, not an approximation).
The order policy is now learned weights over [packSize, kingEnergy,
threatAtTarget, bias] (weights_packorder.json) with the same one-sided-
data treatment civdef earned: no-order windows are never labeled, so
BRAIN_PACKORD_EPSILON (0.08) occasionally probes a focus order,
propensity-tagged, IPS-corrected under the measured cap. Episode state
machine unit-validated (success/failure/destroyed-civ all correct).

2) PER-KING PERSONALITIES. A stable hash of the king's id offsets the
order logit (BRAIN_KING_PERSONALITY, default 0.35, 0 disables): some
kings are born coordinators, some lone wolves, and the SAME king keeps
the SAME temperament across brain restarts. First hash attempt FAILED
its own validation -- FNV alone barely avalanches on ids differing in
one trailing character (four sequential kings all landed within 0.02 of
neutral); a murmur-style finalizer fixed the spread (12 kings: 5 bold,
2 wary, 5 even). Published as temperament: bold|wary|even for HUD and
narration use.

3) CROSS-MACHINE REPLAY BACKUP. PATCH-B1e: the bridge's experience ring
persists to gpu_brain_experience.json (lazy 60s save, restore at boot),
and a BRAIN_SHARE=1 brain whose local replay files are missing WARM-
STARTS from the ring -- a fresh install begins with the fleet's memory.

4) THE VBA ENGINE AS A SECOND BRAIN CLIENT (NEW vba/modGPUBrain.bas +
vba/modGPUBrainDemo.bas). The mailbox never knew it was talking to a
WebGL engine, and now it provably is not: the VBA module publishes
snapshots (clsStringBuilder assembly -- ~100KB payloads that would be
O(n^2) death by ampersand) over WinHttpRequest in ASYNC mode with a
WaitForResponse(0) polling state machine, so the VBA game loop NEVER
blocks on the network; the response's field parses through JSONParser
v2 (an integration that is only possible because of the FixPack --
ScriptControl could not parse these payloads on 64-bit Office at all).
GPUBrain_SampleFlow / GPUBrain_SampleThreat mirror the WebGL samplers:
False on absent/stale/out-of-area, so the engine's existing behavior
is always the fallback. The demo module publishes the SAME synthetic
wall-with-a-gap map the v1 CPU validation used, so the first non-zero
flow vector in the Immediate window is a known-correct answer. The
exact JSON the builder emits was mirrored byte-for-byte in Python and
schema-checked against brain.js's tick(): valid, complete, compatible.
Both .bas files are ASCII-clean and UNTESTED IN EXCEL -- verify.

v10 rig checks:
- Two kings alive: window.getBrainPackOrder on each shows different
  temperaments; the bold one orders focus in situations the wary one
  sits out
- weights_packorder.json appears after siege sessions; its threat
  weight drifting more negative = kings learning not to order charges
  into defended cities (civ retaliation bolts make this REAL now)
- Stop the bridge mid-session, restart it: [gpuBrain] experience ring
  restored logs N samples; delete a brain's replay_buffers.json and
  boot with BRAIN_SHARE=1: replay warm-start line appears
- VBA: import clsStringBuilder + JSONParser v2 + both modGPUBrain
  files into the GL engine workbook; with bridge+brain running, run
  GPUBrainDemo_Start -- non-zero flow at the probe within ~2 ticks,
  pointing through the wall gap; stop the brain and the sampler goes
  False within 5s

## v11 -- Phase 11 (the brain steers the FPS demos)

The question this phase answered: can the brain hook the OGRE demo and
the other FPS demos? YES for the two that have enemies; the read-first
session mapped the exact surfaces:

- fpsScene.js (fpscontrol/fpsmirror) is a STATIC reference scene --
  grid + landmark cubes, no enemies. Nothing to steer there. The
  enemies you fight in the FPS shooter are DUNGEON monsters registered
  through window.fpsShooter -- steering them covers the FPS demo.
- DungeonDemo/DungeonAI (v1400+): real monsters, BFS pathing toward
  the player with a straight-line fallback when BFS fails.
- OgreScenario (round 206): PathPlanner waypoints with a direct-to-HQ
  fallback when planSmoothed finds no path.

Both fallbacks are the same shape as the kaiju planner-failed case,
so both got the same medicine:

1) PLAYER-SEEKING FIELD (v11 brain). A third FlowFieldSolver instance
solves goals=[player] each cycle when the snapshot carries a player
position (PATCH-B2k publishes the camera -- the camera IS the player).
Published as pfx/pfz; window.sampleBrainPlayerFlow mirrors the existing
sampler contract (null on absent/stale/out-of-area/flat). The dungeon
needed ZERO special-casing: its walls are voxels (3-high plugs), so the
terrain-height snapshot already encodes corridors and the slope-cost
field routes around them.

2) PATCH-B14 (DungeonAI): when a monster's BFS found no path (the
straight-line fallback), blend the player-flow 60/40 into the heading.
CPU-validated on the wall-gap map: straight-line aims INTO the wall
(0.87, 0.49), the blended heading (0.78, 0.62) clears it -- two cells
ahead lands on open floor, curving through the gap the 8x8 BFS grid
could not see.

3) PATCH-B15 (OgreScenario): when the round-206 planner failed AND no
remote commander is steering, blend window.sampleBrainFlow 60/40 into
the OGRE's heading. PATCH-B2k publishes the HQ as the field goal while
the scenario is active (the arena has no civs, so the field would
otherwise be goalless) -- the "civ-directed" field IS HQ-directed here.
Planned paths and ogreCommander orders are untouched: the brain only
fills the exact hole where the OGRE currently marches blind.

4) VBA RAYCASTER STEERING (NEW vba/modGPUBrainSteer.bas). The consumer
half of the Doom plan: GPUBrain_SteerBlend applies the same validated
60/40 blend to any enemy heading (one call in your movement code), and
GPUBrain_SteerRetreat gives threat-field flee headings. The integration
comment spells out the whole raycaster wiring: publish the grid as
heights (open=20, wall=60), player as the single goal, blend in the
enemy update, keep your collision as the authority. With modGPUBrain
(transport, phase 10) + this module (steering) + your engine's FPS
demo, what remains of "Doom in Excel with GPU-trained enemies" is the
raycaster game itself -- your two weekends, not infrastructure.
UNTESTED IN EXCEL -- verify per discipline. ASCII-clean.

v11 rig checks:
- Dungeon: lure a monster behind a wall section, kill the brain --
  it straight-lines and hugs the wall (stock). Restart the brain --
  within a publish cycle it curves through openings instead
- OGRE: pick a hilly themed-waves arena where the console shows
  "no path found; falling back to direct movement" -- with the brain
  up, the OGRE now curves around the hill on that same wave
- Console: getBrainStatus() unchanged; the flowfield response now
  carries pfx/pfz when a camera is present
- fpscontrol.html: unchanged by design (no enemies in that scene)

## v12 -- Phase 12 (all five hooks: the limitation lifted, the war
## report, smarter fear, Doom itself, and the duel)

1) KAIJU-TARGET ORDER LEARNING (PATCH-B2l). The v10 stated limitation
is lifted: the roster now carries tgtKid when a king's target is a
kaiju (identity, not just position), and pack-order episodes open for
kaiju targets too -- judged on the TARGET's fate over the same 15s
window (gone from the roster = dead = reward 1; else the 0.25 energy-
drop test). Civ episodes unchanged; one trainer, one weight file, now
fed by both order types.

2) TEMPERAMENT NARRATION. Order FLIPS (not every publish, and never
exploration probes) emit a war-report line to /sys/logs: "the bold
king kaiju-7 orders the pack to focus (pack 5, conviction 0.31)" /
"the wary king kaiju-3 releases the pack to free-hunt". BRAIN_NARRATE=
ollama embellishes through the existing v7 route.

3) DUNGEON RETREAT VIA THE FIELD (PATCH-B16). Fleeing monsters
(v1430) straight-lined away from the player and cornered themselves;
now the flee heading blends 60/40 with the NEGATED player-flow --
ascending distance-to-player through corridors, out through openings.
The axis-slide collision stays the authority; no brain -> the original
flee, unchanged.

4) DOOM IN EXCEL (NEW vba/modRaycasterDemo.bas). The reference
implementation: a classic DDA raycaster rendering to WORKSHEET CELLS
(64x44 viewport, distance-shaded walls with the two-tone face cue,
billboard enemies with z-buffer occlusion, WASD+QE via OnKey, OnTime
frame chain). Enemies chase the player with ONE steering line --
GPUBrain_SteerBlend -- so with the bridge + brain up they route the
wall-gap map like the kaiju do, and with the brain down they chase
dumb-straight: the fallback contract, visible in gameplay. The DDA
core was mirrored line-for-line in JavaScript and validated against
brute-force ray marching: max error 0.0010 cells over the 64-column
sweep, gap ray 19.5 and wall ray 7.5 exact. The map publisher reuses
GPUBrain_Tick (open=20, wall=60, player as the goal): the brain never
learns it is running Doom. UNTESTED IN EXCEL -- the render loop,
OnKey handling, and cell-paint throughput need rig verification
(expect ~5-10 fps; drop VW/VH if slower). ASCII-clean.

5) BRAIN-VS-BRAIN (PATCH-B1f + BRAIN_KINDS). The bridge's split-brain
merge is now per-KAIJU-ID for the policy maps (attack, aggro,
packOrder, civDef, civTarget) -- merge-tested: two partial payloads
coexist without clobbering. BRAIN_KINDS="space,tech" restricts a
policy brain's decisions to its faction's kinds; fields stay world-
wide (terrain is not a faction). Learning isolates for free: row-
matched outcome ingestion means a foreign faction's outcomes never
match. THE DUEL: two policy instances --
  BRAIN_ROLE=policy BRAIN_KINDS=space,tech  BRAIN_SHARE=0 (mind A)
  BRAIN_ROLE=policy BRAIN_KINDS=hell,ice    BRAIN_SHARE=0 (mind B)
plus one BRAIN_ROLE=fields instance -- and kaiju-vs-kaiju combat plus
the new kaiju-target orders (hook 1, same phase, not a coincidence)
become two minds learning against each other. Leave BRAIN_SHARE off
for a duel; turning it ON makes them share experience, which is a
different (also interesting) experiment.

v12 validation: bridge merge unit-tested (both factions present,
aggro merged per-id, fields preserved); all four brain policy loops
carry the faction filter; DDA validated as above; every touched file
node --check clean; both new VBA files ASCII-only.

v12 rig checks:
- Kings targeting kaiju now produce weights_packorder.json growth
  during kaiju-vs-kaiju brawls, not just city sieges
- /sys/logs shows temperament lines on order flips
- Dungeon: wound a skittish monster near a dead-end -- it flees OUT
  through the corridor instead of cornering
- Excel: import FixPack + modGPUBrain + modGPUBrainSteer +
  modRaycasterDemo, run Raycaster_Start; walls render, enemies chase;
  start the brain and watch them route the gap
- Duel: three-process setup above; watch each faction's report.html
  drift apart

## v13 -- Phase 13 (the duel gets a scoreboard, the dungeon gets a
## mind, Doom gets teeth)

1) DUEL SCOREBOARD (PATCH-B2m). Console-armed:
    window.gpuBrainDuel = { A: ["space","tech"], B: ["hell","ice"] }
Deaths are roster disappearances between publishes; in a two-faction
duel kills(A) = deaths(B) by construction -- no event plumbing needed,
no killer attribution to get wrong. Live energy sums per faction.
Every 30s a line posts to /sys/logs:
  [duel] A(space,tech) kills 12, energy 340.0 | B(hell,ice) kills 9, ...
Logic mirror-tested: deaths attributed to the right faction, non-
faction kaiju (the OGRE) ignored, energy summed live.

2) RAYCASTER v1.1 -- COMBAT (modRaycasterDemo.bas). Enemies now SHOOT:
range 9 cells, 2s cooldown, 8 damage, gated on ray-marched line of
sight over the same map the renderer uses (no shooting through walls).
Player: 100 HP with a top-row HP bar (green -> red), a red border
flash for 250ms after a hit, death ends the run. SPACE is a hitscan
shot: the enemy nearest the crosshair inside a 0.35 angular window,
LOS-checked, takes 0.5 damage (two shots kills). Combat math mirrored
and validated in JS: LOS true through the gap / false through the
wall, dead-ahead enemy selected at ang 0.000, off-axis rejected at
1.263, behind-camera rejected outright. Still UNTESTED IN EXCEL.

3) DUNGEON BOSS BRAIN-CONSULTED ATTACKS (PATCH-B17 + PATCH-B2n). The
featurizer turned out to be fully SPEC-driven (family/range/damage
from the roster -- no name registry), so dungeon monsters join the
brain the honest way: aggroed ranged monsters enter the snapshot
roster as dgn-<id> with a two-attack repertoire (arrow: fast/low,
magic: slow/high), target = the player, energy from fpsShooter HP.
Bosses and mages honor the brain's pick per shot; archers keep their
arrows. CONSULT-ONLY this phase: no outcome plumbing for dungeon
shots yet, so their rows expire unmatched (harmless) and picks ride
the kaiju-trained weights -- stated, not hidden. The v8 threat
features even give it dungeon meaning: threat-at-target is distance
to the nearest OTHER monster, so "magic into the crowd" emerges from
the same aoe*cluster weights the kaiju learned.

4) MATCH RECAP (v13 brain). SIGINT now composes a war summary through
the milestone route before exit (400ms grace for the POST):
  [brain] match recap (space,tech): 214 orders issued, 130 focus /
  84 free-hunt, 17 changes of mind (bold 9, wary 3, even 5); attack
  policy at 4200 training steps
BRAIN_NARRATE=ollama turns it into prose. In a duel, stop both minds
and read two rival memoirs of the same war.

v13 rig checks:
- Arm the duel object + run the three-process setup: scoreboard lines
  every 30s, diverging kill counts as the policies drift apart
- Dungeon: reach a boss with the brain up -- watch arrow picks at
  long range flip to magic as you close in or stand near other
  monsters (the rangeFit and cluster features doing their job)
- Raycaster: enemies only hit you with line of sight; two SPACE hits
  drop one; HP bar shrinks; border flashes on damage
- Ctrl-C a policy brain: recap line appears in /sys/logs (prose if
  BRAIN_NARRATE=ollama)

## v14 -- Phase 14 (the dungeon learns, the pack fans out, the duel
## draws its curves)

1) DUNGEON SHOT OUTCOMES (PATCH-B18) -- consult-only LIFTED. The shot
lifecycle was read first: dungeon projectiles are target-locked at
fire time, resolve at flight end with a 1.7u hit test, and a guarded
player can deflect them mid-air. Now: DungeonAI stamps each pick's
provenance (brain | brain-explore | rotation, exactly the kaiju
semantics); DungeonDemo tags the PRIMARY shot with shooter + source
(the boss's 3-shot spread tags only the center shot -- one decision,
one outcome, no triple counting); resolution pushes the same outcome
shape kaiju attacks use (deflections count as misses). The publisher
drains them, the brain's pick records supply exact propensities, and
dgn rows TRAIN. Boss and mage picks now sharpen against the actual
player instead of riding kaiju priors forever.

2) RAYCASTER v1.2 -- FLANKING. The published enemies ARE the threat
sources, so threat-distance at an enemy's own position measures how
bunched the pack is. Under 1.5 cells: probe both perpendiculars,
deflect ~35% toward the SAFER (emptier) side. Geometry validated in
JS: two enemies converging on the same heading fan to opposite sides
(-0.65 / +0.65 y-components); uncrowded enemies are untouched; no
brain -> SampleThreat is False -> no-op. Enemies now arrive from
different doorways instead of a conga line.

3) DUEL KILL CURVES (PATCH-B1g + report v14). The engine's 30s tallies
now also POST to /ai/brain/duel; the bridge persists them (2000-entry
ring, same lazy pattern as the experience ring). report.html grows a
"The duel" section -- two polylines, faction A red vs B cyan --
present only when a duel file exists. Watch the curves cross when one
mind's policy drift starts paying.

4) FACTION DISPOSITION (BRAIN_TEMPER_BIAS). BRAIN_KING_PERSONALITY
sets the temperament SPREAD; the new bias shifts its MEAN, per
process. The duel can now field a reckless culture (+0.25) against a
cautious one (-0.25) -- every king in a faction leans its way, on top
of per-king variance. One line of math, a whole axis of experiment.

v14 validation: all five touched JS files node --check clean;
separation geometry mirror-tested (fan-out + uncrowded no-op); duel
route follows the tested B1f/B1e patterns; raycaster still ASCII-only.

v14 rig checks:
- Dungeon boss fight with the brain up: weights_attack.json steps
  advance during the fight; deflect a few bolts and the magic/arrow
  mix shifts (deflected magic = expensive miss)
- Raycaster: three enemies through one corridor visibly spread at
  the room mouth
- After an armed duel session: report.html shows the kill curves;
  gpu_brain_duel.json survives a bridge restart
- Duel with BRAIN_TEMPER_BIAS +0.25 / -0.25: the reckless faction's
  /sys/logs shows more focus orders and more flips

## v15 -- Phase 15 (leading the target, a spreadsheet closes the loop,
## and one mind is measured across three games)

1) AIM-QUALITY LEARNING (targetMoving, feature 16). The attack net
grew 15 -> 16: NEW feature 14 is normalized target speed (the player's
velocity between publishes, 8 u/s horizon -- "he was strafing when I
fired"), bias relocated to 15, hand prior 0 so outcomes decide whether
movement matters. loadDeepWeights migration GENERALIZED from the v8
one-off (exactly nInNew-2) to any shorter row >= 13, bias always
relocated, new columns zeroed -- proven bit-equivalent again: max
|diff| 0.00e+0 over 200 random inputs through the migrated hidden
layer. With dungeon outcomes flowing (v14), bolts that a strafing
player dodges are now attributable to the strafing.

2) RAYCASTER v1.3 + modGPUBrain v1.1 -- THE FULL LOOP IN VBA. The
transport learned two tricks: it parses the brain's per-enemy attack
map (GPUBrain_GetAttack, explore flag included) and queues shot
results (GPUBrain_ReportOutcome) that drain into the next snapshot as
proper outcomes {id, name, hit, src}. The raycaster fields two archers
and a mage, publishes the dungeon repertoire per enemy (spec-driven
features, so the dgn-trained columns apply), consults the brain per
shot with exact provenance (brain / brain-explore / rotation
fallback), and reports every result -- magic is fictionally dodgeable
(40% miss) so there is a real signal to learn. Pick -> propensity ->
outcome -> SGD, end to end, in a spreadsheet. Snapshot JSON with
attacks + outcomes mirrored in Python and schema-validated. UNTESTED
IN EXCEL, as ever.

3) DUEL CHART v2. Energy curves join the kills (dashed, own scale,
faction colors), and LEAD CHANGES get gold vertical annotations with
a count in the title. Detection mirror-tested: sign changes only,
ties skipped (the -1,+1,-1,+1,0,+1 sequence is 3 genuine changes).

4) CROSS-GAME MEASUREMENT. Every resolved attack outcome tallies into
its domain by id prefix (dgn- dungeon, rc- raycaster, else kaiju);
every 500 outcomes a milestone line reports the split:
  [brain] cross-game hit-rates: kaiju 62% (n=1200), dungeon 48%
  (n=210), raycaster 55% (n=90)
and /status exposes stats.domains for scripts. This is the
MEASUREMENT the hook asked for -- whether shared weights help or hurt
is now an empirical question with a number; the per-domain weight
SPLIT is the follow-up experiment if the numbers demand it, not
before.

v15 validation: migration bit-equivalence 0.00e+0/200; lead-change
mirror correct-by-walkthrough; all touched JS node --check clean; VBA
snapshot JSON byte-mirrored + schema-checked; both .bas ASCII-only.

v15 rig checks:
- Dungeon: strafe constantly during a boss fight vs stand still --
  after a few hundred outcomes the moving-target column in
  weights_attack.json drifts negative for magic (slow bolts miss
  movers) if the effect is real
- Raycaster with brain: mage opens with magic, and if you strafe a
  lot, watch arrows take over its picks across a session
- report.html duel section: dashed energy under the solid kills,
  gold lines at every lead change
- /status: stats.domains counts climbing in whichever games are live

## v16 -- Phase 16 (the split experiment, the last static column, the
## duel goes live)

1) THE DOMAIN SPLIT (BRAIN_DOMAIN_SPLIT=1). Dungeon and raycaster get
their own OUTPUT HEADS while the hidden layer stays shared BY
REFERENCE: every domain trainer wraps the same L1 Float32Array (so
representation learning pools across all three games) with its own L2
(so what "a good shot" MEANS can differ per game). Heads start as
clones of the kaiju head and persist to weights_attack_heads.json.
Kaiju rows keep the GPU path; dungeon/raycaster rows (a handful per
publish) re-score through their heads on CPU. Any domain's training
step re-uploads the shared L1 to the GPU net. Three invariants
PROVEN: cpuFwdSplit matches an independent forward (0.00e+0), clone-
start heads score identically to the kaiju head (0.00e+0 -- split day
changes nothing), and L1 mutations through one trainer are visible
through the other (reference sharing confirmed). OFF by default: v15
behavior exactly. Run it when the v15 cross-game numbers show shared
judgment hurting; the hidden layer stays communal either way.

2) VBA AIM-QUALITY (modGPUBrain v1.2 + raycaster v1.4). The raycaster
now measures player speed between publishes and stamps it as tspd on
every enemy row; the transport serializes it. Feature 14 -- the
strafing signal -- now flows from the spreadsheet exactly as it does
from the WebGL dungeon.

3) LIVE DUEL PANEL (PATCH-B19, server.html). A fixed bottom-right
canvas polls /ai/brain/duel every 10s: kill curves solid, energy
dashed, gold lead-change ticks, live score in the title. Hides itself
until a duel has posted two tallies, so non-duel sessions never see
it. Same detection rule as the report (sign flips, ties skipped).

4) KAIJU-TARGET SPEED (v16 main.js). The last static column: kaiju
whose target is another kaiju (or the OGRE) now publish the target's
displacement-per-second since the previous publish as tspd. Civs stay
0 (they do not move); duel combat feeds feature 14 from both sides.
The previous-position map refreshes once per publish -- one Map, no
per-frame cost.

v16 validation: split invariants (three, above); all touched JS node
--check clean; server.html HTML-parses clean; both .bas ASCII-only.

v16 rig checks:
- BRAIN_DOMAIN_SPLIT=1 boot: "DOMAIN SPLIT on: heads cloned" line;
  behavior initially identical; weights_attack_heads.json appears
  after dungeon/raycaster sessions; compare cross-game hit-rates
  before/after a few thousand outcomes -- that comparison IS the
  experiment's verdict
- Duel running + server.html open: the panel fades in after the
  second tally and ticks gold on lead changes
- Kaiju-vs-kaiju brawl: report.html conviction sparklines shift as
  feature 14 learns whether moving targets change picks

## v17 -- Phase 17 (the experiment reads itself out, the duel gets a
## page, the player gets a scorecard, the OGRE gets served)

1) SPLIT VERDICT AUTOMATION. Per-domain tallies now persist ACROSS
SESSIONS keyed by regime (regime_stats.json: this session's counts
fold in under split or shared at every 500-outcome report and at
SIGINT). Once both regimes have data, the report includes a verdict
per domain via a TWO-PROPORTION Z-TEST -- "SPLIT winning" or "SHARED
winning" only past |z| > 1.96, otherwise "no significant difference
yet"; domains under 30 samples per side abstain. The z-test was
validated against known values (60/100 vs 50/100 -> z=1.421 correctly
not significant; 300/500 vs 250/500 -> z=3.178 correctly decisive).
The brain runs the experiment AND reads out the result:
  [brain] split verdict -- dungeon: split 54% (n=812) vs shared 47%
  (n=655) -> SPLIT winning (z=2.71); raycaster: ... -> no significant
  difference yet (z=1.10)

2) FULL-PAGE DUEL VIEW (PATCH-B1h). /ai/brain/duel/view serves a
self-contained page: 900px chart (kills solid, energy dashed, gold
lead ticks), live score header, and a LEAD-CHANGE LOG with timestamps
("14:32:07 -- the lead passes to A (12 : 11)"). Auto-refreshes every
10s. The server.html panel is now the click-through (cursor, tooltip,
opens in a new tab).

3) PLAYER MARKSMANSHIP (raycaster v1.5). The enemy loop closed in
v1.3; now YOUR side is measured: shots, hits, kills; a live 6-cell
accuracy readout top-right (green >= 60%, amber >= 30%, red below);
a summary line on stop ("marksmanship: 12/20 (60%), 3 kills").

4) THE OGRE, SERVED (PATCH-B2o + PATCH-B20). The OGRE was always a
kaiju (kind ogre_hull -- BRAIN_KINDS and the duel scoreboard accept it
unchanged); what was missing was anything for a policy brain to DO
for it. Now: its variant weapon(s) become roster attacks (family-
mapped: laser->beam, artillery->aoe, plasma->projectile), and dual-
armed variants (mk12+) present a REAL choice -- the brain's pick
de-emphasizes the other weapon to 1.5x its interval (never disables;
the fueled-underside and barrage mechanics are untouched). Outcomes
close the loop: lasers and underside hits report at fire (hitscan),
plasma shots are tagged and resolve at defender/plane/drone contact
(hit) or ttl expiry (miss) -- all five hit sites plus the expiry path
covered. Single-weapon variants and brainless runs are byte-identical.
NOTE the honest asymmetry: OGRE outcomes carry src "rotation"
(weight-1, uncorrected) because the engine fires on ITS schedule --
the brain only emphasizes; propensity semantics for emphasis-not-
selection would be fiction, so none are claimed.

v17 validation: z-test vs known values (above); a first patch run
ABORTED at a stale anchor (the underside gate is multi-line) and was
verified UNWRITTEN before a clean rerun -- the assert-before-write
pattern doing its job; all touched JS node --check clean; server.html
click-through in place; VBA ASCII-only.

v17 rig checks:
- Run a few sessions each with BRAIN_DOMAIN_SPLIT=0 and =1: the
  verdict line appears once both regimes have data, and abstains
  until then
- Click the duel panel: the full view opens; lead-change log
  timestamps match the gold ticks
- Raycaster: accuracy readout tracks your aim live; summary on stop
- mk12 Skylord with a policy brain on ogre_hull: when the brain
  prefers "underside", the main gun visibly slows to 1.5x cadence
  (and vice versa); weights drift as plasma expiry-misses accumulate
  at long range

## v18 -- Phase 18 (the asymmetry lifted, significance made visible,
## the game that fights back, the poll dropped)

1) OGRE EMPHASIS PROPENSITIES -- v17's stated weight-1 asymmetry is
LIFTED, correctly. The insight: emphasis is not selection, but both
weapons fire at KNOWN relative rates under either emphasis (the
de-emphasized one at 1/1.5x), so the marginal probability that an
observed shot is weapon W is exact:
    p(W) = sum_E pi(E) * rate_W(E) / sum_V rate_V(E)
The brain now SAMPLES the published emphasis from a softmax over the
two scores (T=0.35; sampling IS the exploration, so the epsilon flip
is bypassed for emphasis kaiju), records the sampling distribution +
the intervals (now published in the OGRE's roster attacks), and
assigns o.p from the formula above at outcome time -- whatever the
engine stamped, because the engine fires on its own schedule and WE
know the mechanics. Validated: hand-calculated case (pi 0.6/0.4,
intervals 2.0/1.4) gives p(plasma)=0.4346 matching the by-hand
0.4344, probabilities sum to 1 exactly, and the degenerate case
(pure emphasis, equal intervals) lands on the closed-form
1/(1+1/1.5)=0.6 to nine decimals. Emphasis mode triggers for ANY
kaiju whose roster attacks all carry intervals -- the mechanism is
general, the OGRE is its first tenant.

2) VERDICT HISTORY CHART. Every verdict computation appends its
z-values to regime_history.json (1000-entry ring); report.html grows
a "z over time" chart -- kaiju green, dungeon purple, raycaster
amber, with the +/-1.96 significance bands as dotted lines. Watch a
line climb out of the band: that is significance emerging, drawn.

3) ADAPTIVE RAYCASTER (v1.6). Enemy cadence scales with YOUR
marksmanship: cooldowns run 1.35x when you are missing everything
down to 0.75x when you are deadly, linear in accuracy, and the
scaling only trusts the number after 5 shots (no punishment for the
first fumbling volley). Verified monotone in the right direction
(0% acc -> 2.03s, 100% -> 1.13s on the 1.5s base).

4) DUEL PUSH (v18 bridge + both views). The bridge already ran a
WebSocketServer for the engine; duel POSTs now broadcast
{type:"gpu:duel"} to every open client, and both the server.html
panel and the full-page view subscribe -- tallies redraw the moment
they land. The 10s poll REMAINS as first-paint + reconnect fallback:
dropping the poll's latency, not its resilience.

v18 validation: propensity math (three checks above); adaptive
cadence monotonicity; all touched JS node --check clean; VBA
ASCII-only.

v18 rig checks:
- mk12+ with a policy brain: /ai/brain/flowfield attack entry for the
  OGRE now flips stochastically publish-to-publish (softmax sampling
  visible); weights_attack.json moves on OGRE outcomes with IPS
  weights near 2.3/1.8 instead of flat 1
- report.html: the z-over-time chart appears after two verdict
  computations; the band-crossing moment is the experiment's headline
- Raycaster: miss on purpose for a while -- enemies audibly slow;
  go deadly -- they pressure you
- Duel view open during a duel: tallies appear within a second of
  the engine's 30s tick, no 10s stutter

## v19 -- Phase 19 (kings sample, charts carry their n, the brain
## runs the difficulty, the duel narrates its kills)

1) SAMPLED-SELECTION FOR KINGS -- with a semantics guard the hook
demanded thinking about. Rate-emphasis math (v18) only applies where
the engine keeps firing BOTH weapons; kaiju picks are SELECTION (the
engine fires the pick), so blindly triggering emphasis mode off
interval presence would apply the wrong propensity model. Fix: the
emphasis detector is now keyed on an explicit roster flag (emphMode,
set only for the OGRE), and kings instead get SAMPLED-SELECTION --
the published pick is drawn from the softmax over the repertoire's
scores (same T=0.35), and the fired pick's propensity is its softmax
prob DIRECTLY. Cleaner IPS than epsilon-uniform: every attack
explores in proportion to its plausibility (validated: probs sum to
1.000000; hot pick weighs 1.73, cold picks cap at 3). Kings also
publish cooldown-annotated repertoires from the registry -- roster
enrichment for future rate features, safely inert under the guard.

2) N-ANNOTATIONS. Verdict history entries now carry per-domain sample
counts; the z-over-time chart labels each line's end with n=...,
because significance without sample size is theater.

3) BRAIN-SERVED DIFFICULTY (modGPUBrain v1.3 + raycaster v1.7). The
raycaster publishes marksmanship on the player goal (acc, after 5+
shots); the brain folds it into rc- enemies' published AGGRO
(+0.6*(acc-0.5), clamped, ON TOP of the learned policy value --
stacked, not replacing); the transport parses the aggro map
(GPUBrain_GetAggro) and cadence follows the brain's boldness
(1.55 - 0.9*aggro). Direction verified end to end: deadly player ->
aggro 0.74 -> 1.33s cadence; fumbling -> 0.26 -> 1.97s. The v1.6
local formula remains the brainless FALLBACK -- the game adapts
either way, the brain just does it with one central knob. Stated
plainly: the modulation is a HEURISTIC; a learned difficulty policy
needs a reward for "the player is having a good fight", which
nothing measures yet.

4) DUEL KILL FEED. The full-page view grows a scrolling feed built
from per-tally deltas -- "14:32:07 -- A scores 2 kills (12 : 9)" --
newest first, capped at 40, redrawn on every websocket push.

v19 validation: softmax sampling (sum, weights); difficulty
direction end-to-end; all touched JS node --check clean; VBA
ASCII-only. One patch anchor missed on first attempt (the aggro
assignment shape) -- verified unwritten, re-anchored from the real
code, applied clean.

v19 rig checks:
- A king with 3+ attacks: the published pick varies publish-to-
  publish in proportion to scores (watch /ai/brain/flowfield);
  weights move under propensity weights near 1/prob, capped
- report.html z chart: n= labels at each line end
- Raycaster with brain: go deadly and the pressure arrives via the
  BRAIN's aggro (kill the brain mid-run: the local fallback takes
  over seamlessly)
- Duel view: kill feed scrolls in real time with the websocket push

## v20 -- Phase 20 (the A/B before the retirement, the instrument
## before the reward, names before legends, n everywhere)

1) SELECTION-MODE A/B (BRAIN_ATK_SELECT). The hook said compare regret
FIRST, so this ships the comparison, not the switchover. BRAIN_ATK_
SELECT=sampled extends v19's king mechanism to ALL kaiju with a
choice (emphMode still guarded); the default stays epsilon. Kaiju-
domain outcomes tally under whichever mode's pick record produced
them (rotation fallbacks credit neither), persist across sessions
(selection_stats.json), and the 500-outcome report carries a z-tested
verdict:
  [brain] selection verdict (hit-rate proxy): sampled 61% (n=903) vs
  epsilon 58% (n=1420) -> no significant difference yet (z=1.44)
HONESTY NOTE, in the code and here: this measures realized hit-rate
difference between two logging policies -- a REGRET PROXY, not true
regret (which needs a counterfactual optimum nothing observes).
Retire epsilon when the proxy clears the band, not before.

2) DIFFICULTY REWARD RESEARCH -- the missing measurement, BUILT. A
raycaster SESSION (closed after 60s without rc outcomes; sub-3-shot
fragments discarded) now records the candidate rewards: duration
(engagement proxy), enemy hit-rate against the player (pressure),
final marksmanship (skill), and HP-MIDBAND fraction -- the share of
publishes with player HP in [25, 75], on the theory that close
fights hover there while stomps and slaughters do not. Records
persist (difficulty_telemetry.json, 500-ring); each session closes
with a milestone summary. The raycaster (v1.8) publishes hp on the
player goal to feed it; the transport (modGPUBrain v1.4) serializes
it. Session segmentation mirror-tested (gap-close, fragment
discard). WHEN one of these candidates proves out -- correlates
with players actually staying -- the v19 heuristic gets replaced by
a learned policy. The instrument comes first; that is the research.

3) FACTION NAMES. window.gpuBrainDuel.nameA/nameB ride the tally
POST; the bridge keeps the latest labels; the full-page view (score
header, kill feed, lead-change log) and the server.html panel title
all speak them: "Space Coalition 12 : 9 Hell Legion". Absent names
fall back to A/B everywhere -- fully backward compatible.

4) QUARTILE N-ANNOTATIONS. The z-over-time chart now labels n= at
the 25/50/75/100% points of each domain line, deduplicated for
short histories. How the evidence ACCUMULATED matters as much as
where it landed -- a line that crossed the band at n=80 and stayed
through n=2000 tells a different story than one that crossed
yesterday.

v20 validation: session segmentation mirror-tested; all touched JS
node --check clean; all VBA ASCII-only; names fall back cleanly.

v20 rig checks:
- Run sessions under both BRAIN_ATK_SELECT values: the selection
  verdict line appears once both arms pass 30 outcomes
- Play a few raycaster bouts, walk away 60s: telemetry milestones
  land, difficulty_telemetry.json accumulates
- Set window.gpuBrainDuel = { A: [...], B: [...], nameA: "Space
  Coalition", nameB: "Hell Legion" }: names everywhere
- report.html z chart: n= marks along each line, not just ends

## v21 -- Phase 21 (the A/B learns to see domains, the instrument
## learns to nominate, the sweep runs offline, the factions get faces)

1) SELECTION A/B PER DOMAIN. The v20 aggregate could mask a game
where epsilon still wins, and under BRAIN_ATK_SELECT=sampled the
mechanism reaches dgn-/rc- picks too -- so the tallies now break out
by domain (old flat selection_stats.json migrates into the kaiju
bucket, which is where all v20 counts actually came from). The
verdict reports per domain, each abstaining under 30 samples per arm:
  [brain] selection verdict (hit-rate proxy) -- kaiju: sampled 61%
  (n=903) vs epsilon 58% (n=1420) -> ...; dungeon: ...

2) TELEMETRY CORRELATION PASS. Once 50+ raycaster sessions exist,
every session close also computes Pearson r of DURATION against each
candidate reward -- enemy-hit, acc, hp-midband, plus the derived
CLOSENESS (1 - 2*|enemyHitRate - 0.5|, peaking when the fight is
even) -- and reports which leads. Pearson validated against known
values (perfect +1.000, inverse -1.000, hand-computed 0.800 exact).
Stated in the code and here: duration is an engagement PROXY and
correlation is not causation -- this pass NOMINATES a candidate for
a controlled test; it does not crown one.

3) OFFLINE TEMPERATURE SWEEP (the good one). T=0.35 was inherited
from emphasis mode and never tuned; a live sweep would take weeks of
sessions. Instead: sampled picks now log their FULL candidate score
vector alongside the fired pick, logged propensity, and reward
(t_sweep_log.json, 5000-ring) -- exactly what OFFLINE policy
evaluation needs. At each 500-outcome report (once 300+ entries), a
SNIPS estimator (self-normalized IPS, weight-capped at 10) prices a
whole temperature grid from the same logged data:
  [brain] T-sweep (SNIPS, n=1412): T=0.2 -> 0.612, T=0.35 -> 0.605,
  T=0.5 -> 0.591, ... (running at T=0.35)
BRAIN_ATK_T makes the temperature a knob to act on the findings.
The estimator was validated on a synthetic world with a KNOWN best
temperature: from logs collected at T=0.5, SNIPS estimated the
T=0.2 policy at 0.647 against a true value of 0.645, and ranked the
grid in the correct order. Self-normalization trades a little bias
for a lot of variance -- the right call at these n, and said so.

4) FACTION COLORS FROM NAMES. Names hash to hues (murmur-style
finalizer -- the v10 avalanche lesson applied), with forced
separation when two names land within 50 degrees on the wheel
(identical names get pushed 150 apart; "Space Coalition" vs "Hell
Legion" are naturally distinct at 69). Applied to the full view
(chart lines + kill feed + lead log via injected style) and the
server.html panel. Nameless duels keep the classic red/cyan.

v21 validation: SNIPS synthetic-world test (estimate 0.647 vs true
0.645, correct ranking); Pearson vs known values; hue separation
including the identical-name edge; all touched JS node --check
clean. One honest stumble: the first hue patch nested template
literals inside the view's outer template literal (instant syntax
error) -- caught by node --check, rewritten as concatenation.

v21 rig checks:
- Sessions under both selection modes across the three games: the
  per-domain verdict lines diverge or agree per game
- 50+ rc sessions: the correlation line lands after a session close
- After 300+ sampled outcomes: the T-sweep line prices the grid;
  try BRAIN_ATK_T at the starred value for a few sessions
- Named duel: each faction wears its own hue everywhere

## v22 -- Phase 22 (the brain asks permission, the test runs itself,
## every domain prices its own T, the spectator gets one palette)

1) ACTING ON THE SWEEP (T adoption ladder). Precedence order, each a
gate: an explicit BRAIN_ATK_T PINS the temperature (auto disabled,
and the report says "would adopt ... but BRAIN_ATK_T pins it"); else
adoption requires BRAIN_ATK_T_AUTO_K consecutive sweeps starring the
SAME T (default 3), a real margin (>0.01 SNIPS over the running T),
AND the human-approval gate BRAIN_ATK_T_AUTO=adopt. The default is
SUGGEST: "suggests adopting T=0.5 (3 agreeing sweeps, margin 0.014);
set BRAIN_ATK_T_AUTO=adopt to allow" -- the brain states its case
and waits. Adopted T persists (t_sweep_state.json) across restarts.

2) CONTROLLED DIFFICULTY TEST (BRAIN_DIFF_AB=1). Alternating rc
sessions: arm 0 is the v19 heuristic EXACTLY; arm 1 adds a learned
session-level offset theta, updated by a (1+1) evolution strategy on
the nominated candidate reward (BRAIN_DIFF_REWARD, default
hp-midband): hold direction while the reward improves, flip when it
drops, step 0.05, clamped to [-0.3, 0.3]. The ES was walked in a
synthetic world with a known optimum at theta=0.15: it climbs there
and oscillates within one step -- textbook (1+1) behavior. The
OUTCOME metric is session DURATION -- reward candidates steer the
learner; duration judges the arms -- compared by WELCH'S T-TEST at
20+ sessions per arm (validated against a hand-computed case:
t=-1.897 exact). |t| > 2.0 is called significant under a normal
approximation, and the verdict line says so rather than pretending
to a t-distribution CDF.

3) PER-DOMAIN T-SWEEPS. Sweep log entries carry their domain; the
report prices each domain's own grid once it has 300 entries
("kaiju (n=812): best T=0.35 | dungeon (n=344): best T=0.5"). The
best kaiju temperature need not be the best dungeon temperature --
especially under the split, where the heads already disagree about
what a good shot is.

4) SPECTATOR POLISH (PATCH-B21 + v22 main.js). The engine's duel
scoreboard line speaks the faction NAMES when the config carries
them, and server.html's log panel was rewritten from one giant
textContent += (O(n^2), and structurally unable to hold color) to
per-LINE nodes -- duel lines get each faction tinted with the SAME
name-hash hues the duel views use. One story, one palette,
everywhere the spectator looks. The duel-line regex was validated
against both the named and the legacy A(kinds) formats.

v22 validation: Welch t hand-check exact; (1+1) ES convergence walk;
duel-line regex both formats; server.html parses clean; all touched
JS node --check clean.

v22 rig checks:
- Let sweeps accumulate: watch suggest lines; pin BRAIN_ATK_T and
  watch the "pins it" acknowledgment; unpin + BRAIN_ATK_T_AUTO=adopt
  and watch an adoption persist across a restart
- BRAIN_DIFF_AB=1 for an evening of rc sessions: theta drifts,
  difficulty_ab.json grows, verdict lands at 20/arm
- report.html + /sys/logs: per-domain best-T notes appear as
  domains cross 300 sweep entries
- Named duel: the log panel's duel lines wear the same hues as the
  panel and the full view

## v23 -- Phase 23 (the second ladder, temperatures go local, the ES
## learns to give up gracefully, the log stops growing forever)

1) DIFF ADOPTION LADDER -- with the retirement path the hook did not
ask for but symmetry demands. After BRAIN_DIFF_AUTO_K consecutive
DECISIVE Welch verdicts in the SAME direction (streak resets on any
non-significant result or direction flip -- walked and verified), the
test RESOLVES: a learned win PROMOTES theta as the standing offset
for every session and alternation stops; a heuristic win RETIRES the
test -- a decisive loss should end an experiment too, not run it
forever. Both need the human gate (BRAIN_DIFF_AUTO=adopt; default
suggests, same as the T ladder). Resolved state persists and applies
even with BRAIN_DIFF_AB unset; delete difficulty_ab.json to rerun.

2) PER-DOMAIN ADOPTED T. When a domain's own sweep disagrees with the
running temperature DECISIVELY -- its own K-streak, its own >0.01
margin computed on its own subset -- that domain adopts its own T
(sweepState.dom), and sampling uses the domain's temperature for that
kaiju's picks. Same four gates as the global ladder: env pin, streak,
margin, human approval. The dungeon can now run hotter than the
kaiju without anyone editing a constant.

3) ES RESTART KICK. Theta pinned at a clamp edge for 5 consecutive
learned sessions means the (1+1) ES is pushing against a wall or
chasing noise off the map: re-seed at 0 with a fresh random
direction and a cleared reward memory, and say so in the log. Kick
logic walked: fires at exactly 5, resets theta, not before.

4) LOG LINE CAP (PATCH-B21b). Per-line nodes made it a two-liner:
past 2000 lines, drop from the front. The old single-text-node log
could only have been trimmed with string surgery -- the v22 rewrite
paid for itself one phase later.

v23 validation: ladder walk (streak resets on non-significant AND on
direction flips; promotion + retirement both reached); edge-kick
timing exact; all touched JS node --check clean; server.html parses
clean.

v23 rig checks:
- BRAIN_DIFF_AB=1 long-run: watch a suggest line appear after 3
  decisive verdicts; flip BRAIN_DIFF_AUTO=adopt and watch it resolve;
  confirm the promoted theta applies with BRAIN_DIFF_AB unset
- Force disagreeing domains (dungeon-heavy sessions): the per-domain
  adoption notes appear; /ai/brain/flowfield picks change character
  per game
- Watch a stuck theta re-seed after 5 edge sessions
- Leave server.html open overnight: the log holds at 2000 lines

## v24 -- Phase 24 (the console, the finer step, the series, the
## dungeon joins the experiment)

1) THE EXPERIMENT CONSOLE (report.html, first section). One table,
every ladder: T global, T per-domain, both difficulty A/Bs, split-vs-
shared, sampled-vs-epsilon -- each with its STATE (running/adopted/
resolved), its EVIDENCE (streaks, session counts, latest z per
domain), and its NEXT GATE (which condition or env flips it). Absent
state files render "not started". Five experiments now run
concurrently; this is the section to read first.

2) ES STEP DECAY. A direction flip means the ES overshot: shrink the
step (x0.7, floor 0.0125); a hold means still climbing: regrow
(x1.15, cap 0.05). The re-seed kick restores 0.05. Measured on the
same noisy synthetic world: mean |theta - optimum| over the settled
half fell from 0.0250 (fixed step -- oscillating a full step wide
forever) to 0.0109 (adaptive). Applied to both difficulty ESes.

3) BEST-OF-N SETS (PATCH-B2m3). duel.setTarget arms series play:
kills accumulate globally, per-set counts are deltas from the set
baseline, first past the post takes the set (simultaneous crossings
resolve to the higher count, ties to A -- deterministic, stated),
and the log announces it by name: "[duel] SET to Space Coalition!
Sets 2-1 (set kills 25:18)". Series score rides the tally POST; the
full view and the panel title both show SETS A-B. Scoring walked:
baseline deltas, first-cross, and the simultaneous case all correct.

4) DUNGEON DIFFICULTY A/B (BRAIN_DIFF_AB_DGN=1 + PATCH-B22). The
prerequisite first: dungeon monsters never actually CONSUMED
published aggro -- PATCH-B22 wires ranged cadence to the brain's
boldness (same 1.55-0.9a curve as the raycaster, stacked on enrage,
stock when brainless). Then the A/B: a PARALLEL TWIN of the rc
machinery with its own state file -- deliberately not a premature
abstraction over two cases; unify when a third domain appears
(stated tradeoff). Dungeon-specific: no player acc/hp is published,
so the default reward is CLOSENESS (1 - 2*|enemyHitRate - 0.5|,
computable from outcomes alone); sessions segment on the same 60s
gap; the learned/promoted theta rides dgn- aggro. Same ladder, same
kick, same Welch verdict, same human gate. Telemetry records carry
dom:"dgn"; the rc correlation pass now filters to rc records so
mixed-domain r never happens.

v24 validation: adaptive-vs-fixed ES comparison (0.0109 vs 0.0250);
set-scoring walk (first-cross, simultaneous, baselines); all touched
JS node --check clean; server.html parses clean.

v24 rig checks:
- report.html: the console appears first and reads correctly with
  whatever mix of state files exists
- Watch theta's step shrink in difficulty_ab.json as sessions settle
- window.gpuBrainDuel = {A:[...], B:[...], nameA:..., nameB:...,
  setTarget: 25}: set announcements in the log, SETS in both views
- Dungeon with brain: bosses/mages fire faster as their published
  aggro climbs; BRAIN_DIFF_AB_DGN=1 alternates arms per session

## v25 -- Phase 25 (the series crowns a champion, the console goes
## live, the chart shows its sets, promotions stay on probation)

1) MATCH POINT + CHAMPION (PATCH-B2m4). duel.bestOf arms the series
endgame: a faction one set from ceil(bestOf/2) triggers "MATCH POINT
<name>"; reaching it crowns "[duel] CHAMPION: Space Coalition wins
the series 4-2 over Hell Legion!" -- and the duel ENDS: the crowned
state freezes the scoreboard (no further tallies, kills, or sets;
clear window.gpuBrainDuel or reload to start a new series). The
champion rides the final tally POST; the full view shows a gold
CHAMPION banner. Endgame walked: match point at need-1 (both
factions can hold it simultaneously -- the line names the latest),
champion at need, frozen after.

2) LIVE EXPERIMENT CONSOLE (/ai/brain/console). The report is
offline; this route serves the same ladder table -- every
experiment's state, evidence, and next gate -- rendered on demand
from the same state files, auto-refreshing every 15s. It is a NODE
TWIN of report.js's console (different runtime, deliberately
duplicated, registered as such in the comment), and it additionally
shows the drift watch on promoted thetas (hook 4) which the offline
report cannot see mid-session. Path assumption stated: brain/ is a
sibling of ai-bridge/, as shipped.

3) PER-SET CHART SEGMENTATION. Tallies now carry per-tally set
counts (the v24 POST had them; the bridge now stores them on each
tally instead of latest-only), and both charts -- the full view
canvas and report.html's SVG -- draw white dashed verticals where
the set count steps. Three mark styles now coexist: gold =
lead change, white dashed = set boundary, colors = the factions.
Boundary detection mirror-tested.

4) ES WARM RESTART FROM PROMOTED THETA. A promotion is a bet that
must keep paying: promotion now CAPTURES the winning arm's duration
array as a drift baseline, and every promoted-era session joins a
post array. Once 20 exist, the last 20 are Welch-tested against the
baseline; DIFF_AUTO_K consecutive significantly-WORSE checks
re-open the test through the same human gate (suggest mode re-arms
the check instead of spamming). The restart is WARM: the ES resumes
from the promoted theta -- the old optimum is the best guess for
the new one's neighborhood -- with fresh direction, full step, and
EMPTY arms (mixing eras would poison the comparison). Implemented
for the rc instance; the dungeon twin inherits it when its first
promotion actually exists to monitor -- sequencing, not neglect.

v25 validation: series endgame walk (match point both sides,
champion, frozen); set-boundary detection; console row assembly;
all touched JS node --check clean.

v25 rig checks:
- Best-of-3 duel with small setTarget: watch match point, champion,
  and the frozen scoreboard; the banner appears in the view
- Open /ai/brain/console during a session: ladders update within
  15s of state-file writes
- The kill curves show white set boundaries between gold lead ticks
- After a promotion (or hand-edit difficulty_ab.json to fake one):
  the console shows the drift watch counting sessions

## v26 -- Phase 26 (history gets a shelf, the console gets hands,
## adopted Ts get a clean courtroom, the twins reach parity)

1) SERIES PODIUM. A champion-bearing tally is a series' last word
(the frozen scoreboard sends nothing further), so the bridge appends
it once to gpu_brain_series.json -- champion, score, both names,
date; 200-ring -- lazy-loads it on restart, and serves it with the
duel data. The full view grows a Podium section: "7/6/2026 -- Space
Coalition (4-2) vs Hell Legion", newest first.

2) CONSOLE ACTIONS -- the design work the hook flagged. The brain is
a separate Deno process; the bridge cannot touch its env. So the
gates live in a FILE (brain/gates.json) with precedence ENV > FILE >
DEFAULT: an explicit env var is the operator's hard setting and
always wins; the console button is the soft setting. The bridge's
POST /ai/brain/gates is WHITELISTED (two keys, two values, nothing
else writes through); the brain re-reads the file lazily with a 5s
cache, so a flipped button takes effect without a restart; the
console page shows the file values with suggest/adopt buttons and
says plainly that env pins are invisible to it. Precedence chain
verified including junk-value coercion.

3) ERA WINDOWING for adopted Ts -- with the honest analysis first:
the T ladder was ALREADY self-correcting (adoption moves atkT; the
streak/margin machinery keeps comparing new stars against it, so
re-adoption and reversion both worked). What it lacked was a clean
courtroom: the 5000-ring mixes pre- and post-adoption picks, so an
adopted T was being judged partly on data generated by the policy it
replaced. Now adoptions stamp their moment (adoptedAt, global and
per-domain), sweep entries carry timestamps, and once 300
post-adoption entries exist, maintenance grids run on that era alone
(full-log fallback until then, so young adoptions are not judged on
20 samples). Probation delivered as evidence hygiene, not a new
mechanism -- because the mechanism was never the gap.

4) DUNGEON WARM RESTART (twin parity). The v25 monitor mirrored into
the dgn twin: promotion captures the winning arm's baseline, promoted
sessions accumulate, 20-session Welch drift checks, K-streak
re-opens through the same gate (now the live gateValue), warm theta,
fresh arms. The twin's first promotion can actually be probationed.

v26 validation: gate precedence chain (env wins, file applies,
default holds, junk coerced); era-window threshold behavior; gates
whitelist (bad keys and values rejected); all touched JS node
--check clean. One honest stumble: the podium patch consumed the
duel route's if-brace and left the file unbalanced -- caught by node
--check, one brace restored, double-block left visibly harmless.

v26 rig checks:
- Finish a best-of series: the podium lists it; restart the bridge
  and it is still there
- Flip a gate from /ai/brain/console: within ~5s the brain's next
  verdict acts under the new gate; set the env var and confirm the
  button stops mattering
- After a T adoption, watch the report note the evaluation window
  narrow once 300 post-adoption picks accumulate
- Hand-promote the dungeon test and watch its drift counter appear
  on the console

## v27 -- Phase 27 (the shelf reaches the report, the gates leave a
## trail, the tuning tells its story, the frozen duel thaws on command)

1) PODIUM ON THE REPORT. Offline twin of the view's section, reading
the bridge's series archive through the same sibling-path pattern as
the kill curves: date, champion, score, opponent; last 20, newest
first; absent archive renders nothing.

2) GATES AUDIT TRAIL. Every accepted gate flip appends {ts, key,
value, from} to brain/gates_audit.json (500-ring) beside the gates
file, and the console shows the last 8. "Who" is the requester's
address -- on a LAN that is a machine name in all but spelling; no
auth exists to name a person, and the log does not pretend
otherwise (stated in the code).

3) T-SWEEP ERA CHART. Every sweep report now persists its full grid
(t_sweep_history.json, 1000-ring, adoption-flagged); report.html
draws SNIPS-over-time, one line per temperature, gold verticals at
adoptions. The tuning finally has a narrative: which T led when,
where the evidence crossed, and the exact moment the brain (or the
human through the gate) acted on it. Assembly checked on synthetic
history including missing-column handling and the flat-span guard.

4) SERIES REMATCH (PATCH-B2m5 + bridge route). The chain, honestly
laid out: the console button POSTs /ai/brain/duel/rematch; the
bridge clears its tallies, champion, and sets (the podium already
archived the series -- nothing is lost) and stamps rematchAt; the
ENGINE -- whose duel state lives browser-side where the bridge
cannot reach -- polls that stamp on the same 30s cadence the
scoreboard always used, restructured so a crowned series polls
instead of skipping everything. A fresh stamp (newer than the
crowning's wall-clock) clears the champion, zeroes the sets, moves
the set baseline to the current kill totals (kills stay cumulative
-- the baseline math absorbs it), and announces "[duel] REMATCH!
New series begins." Reset semantics walked: champion cleared, sets
zeroed, baseline at current kills, deaths untouched, stale stamps
ignored.

v27 validation: rematch reset walk (five properties); era-chart
assembly on synthetic data; all touched JS node --check clean.

v27 rig checks:
- report.html: podium table + the T-era chart render with real data
- Flip a gate twice from two machines: the audit names both
  addresses
- Crown a series, hit Rematch on the console: within ~30s the
  engine announces the new series and the panel un-freezes
- Watch the era chart grow a gold line the day an adoption fires

## v28 -- Phase 28 (rematches negotiate terms, and leave receipts;
## the console sees the eras; the history learns to forget wisely)

1) REMATCH WITH NEW TERMS. The console's Series section grew two
inputs (setTarget, bestOf; blank keeps current); the POST body is
sanitized bridge-side to positive capped integers (setTarget <= 1000,
bestOf <= 99; an even bestOf is legal -- ceil(N/2) still yields a
deterministic first-to), the surviving terms ride the rematch stamp,
and the engine applies them when it consumes it. Change the stakes
between series without touching a console variable in the browser.

2) REMATCH AUDIT TRAIL. Same append-log pattern as the gates:
ai-bridge/rematch_audit.json records {ts, from, terms} per rematch
(500-ring), and the console's Series section shows the last five --
"7/6/2026 -- rematch from 192.168.10.40 (terms: {bestOf: 5})".

3) ERA CHART ON THE LIVE CONSOLE. The offline report's twin, canvas-
drawn: the route embeds the last 300 history entries as JSON and the
client draws one line per temperature plus gold adoption verticals --
same palette, same story, fifteen-second freshness.

4) SWEEP HISTORY COMPACTION -- a ring that forgets wisely. 1000
reports at 500-outcome spacing is weeks of story, and a plain ring
forgets the oldest chapters first. When full, the OLDER HALF
downsamples to every 2nd entry -- but adoption-flagged entries are
NEVER dropped: the gold verticals are the plot; thinning may only
take the connective tissue between them. Invariants proven: 1200 ->
904 with all 13 adoptions intact, timestamps monotonic, and a second
grow-and-compact cycle preserved every adoption again (repeated
compaction halves the old connective tissue further, exactly as
intended -- distant eras get sparser, never gone).

Also cleaned in passing: the v27->v28 route rewrite briefly left an
unreachable if(false) splice artifact -- syntactically harmless,
removed anyway; dead code is a lie waiting to be believed.

v28 validation: compaction invariants (adoption preservation across
two cycles, monotonic ts, size reduction); rematch-term sanitization
caps; all touched JS node --check clean.

v28 rig checks:
- Rematch with bestOf=5 from the console: the new series announces
  and crowns at 3 sets; the audit names the machine and the terms
- The console's era chart matches the report's after a refresh
- Let sweep history pass 1000: file size drops, old adoptions
  still chart

## v29 -- Phase 29 (rejections speak up, the tally ring keeps its
## plot, the chart answers questions, the rematch counts itself down)

1) TERMS VALIDATION FEEDBACK. The bridge's sanitizer now records WHY
each input failed ("200 (must be an integer 1..99)") and returns
{terms, rejected}; the console button reads the response and says
what happened -- "Rematch armed. Kept: {setTarget:25}. REJECTED:
{bestOf: ...}" -- before reloading. Silent failure is a bug report
nobody files.

2) DUEL TALLY COMPACTION. The 2000-ring gets the sweep-history
treatment: older half thins to every 2nd entry, PLOT entries exempt.
The plot here is lead changes and set boundaries, and both survive
by construction: keeping every flip entry preserves the entire sign
SEQUENCE across kept entries (signs only change at flips), and set
counts are constant between steps, so between-step thinning loses
nothing. Validation with a confession: my first two synthetic duels
never actually produced a lead change (the constructions kept one
faction ahead throughout -- bad test data, not bad code), so the
proof rests on the ADVERSARIAL case, which is also the strong one:
1200 flips placed deliberately at ODD indices -- exactly the entries
the every-2nd rule alone would have dropped to zero -- all 1200
survived compaction. Set boundaries separately proven 13 -> 13.

3) ERA CHART TOOLTIPS. The live console's canvas answers the mouse:
nearest report by x, exact SNIPS per temperature, the timestamp, and
an [ADOPTION] tag on era boundaries. Hovering the gold line tells
you precisely what the evidence said the moment the brain acted.

4) REMATCH COUNTDOWN (v29 engine). The poll callback now only ARMS:
"[duel] rematch armed -- resetting on the next scoreboard tick",
with the actual reset (and the "REMATCH! New series begins (new
terms: ...)" line) performed synchronously on that tick. Two wins,
one stated plainly: the log gets its countdown beat, and duel-state
mutation leaves async-callback territory -- no race with a publish
mid-flight. The arm flag is idempotent (a second poll before the
tick cannot double-arm).

v29 validation: compaction plot preservation (adversarial odd-index
flips + set boundaries); rejection reasons echoed end to end; all
touched JS node --check clean.

v29 rig checks:
- Rematch with bestOf=200: the alert names the rejection and the cap
- Let a long duel pass 2000 tallies: the chart's gold ticks and
  white boundaries all survive the thinning
- Hover the console era chart on an adoption line: the tooltip
  carries the [ADOPTION] tag and the grid values
- Watch the log: "rematch armed" then, one tick later, "REMATCH!"

## v30 -- Phase 30 (one ring policy to rule them, the duel answers
## the mouse, the countdown learns to count, freshness yields to hands)

1) COMPACTION UNIFICATION (ringKeep, both runtimes). One helper, two
modes: WITHOUT a plotFn it is a HARD ring, byte-identical to the
splices it replaces (converting plain rings to downsampling would
silently change their semantics -- the helper refuses to); WITH a
plotFn it is wise-forgetting, and the plotFn receives (entry, index,
arr) so sequence properties like sign flips can be judged. Thirteen
sites swapped: brain-side the sweep history (wise) plus eight hard
rings (sweep log, regime history, both telemetry rings, both arm
arrays, both post arrays); bridge-side the duel tallies (wise) plus
series and both audits (hard). The runtimes cannot share a module,
so the node twin's contract is held by the comment and the tests:
hard mode proven equal to splice element-for-element, and BOTH prior
wise proofs (v28 adoption preservation, v29 adversarial odd-index
flips) re-run through the helper verbatim. The v10 experience ring
predates this series and kept its manual splice -- listed, not
hidden.

2) DUEL VIEW TOOLTIP. The era-canvas pattern on the kill curves:
nearest tally by x -- time, kills, energy, sets. The draw function
now retains the last-fetched tallies for the tooltip to read
(wrapped, not rewritten).

3) REMATCH ETA -- measured, not guessed. The frozen branch stamps
its own pass cadence; the armed line speaks it: "rematch armed --
resetting on the next scoreboard tick (in ~1s)". Sub-second cadence
floors at ~1s (a countdown that says ~0s is a countdown that lied).

4) REFRESH YIELDS TO HANDS. The console's meta-refresh (which yanked
tooltips mid-read) became a JS timer: reload every 15s, but only
when the pointer and keyboard have been still for 3s -- hovering a
tooltip, reaching for a gate button, or half-filling the rematch
form all hold the page. Interaction always beats freshness.

v30 validation: hard mode == splice element-for-element; both prior
wise-forgetting proofs reproduced through the unified helper;
refresh-pause logic; ETA floor; all touched JS node --check clean.

v30 rig checks:
- Grep the pack for "splice(0": the survivors are the v10 experience
  ring and in-place tail operations, nothing else
- Hover the duel view's curves: per-tally tooltips
- Rematch: the armed line carries a plausible ~Ns
- Park the mouse on a console tooltip past the 15s mark: it stays

## v31 -- Phase 31 (the last splice retires, static charts learn to
## answer, an armed rematch can stand down, the console gets addresses)

1) EXPERIENCE-RING MIGRATION -- read first, as prescribed. The v10
read established: seq stays monotonic under a hard ring (warm-start
consumers order by seq), hard mode is splice element-for-element
(v30 proof), and ringKeep -- declared later in the same enclosing
function -- is callable at the route via declaration hoisting
(demonstrated, not assumed). The splice migrated. BONUS from the
read: the loader trusted the persisted file's length, so a future
cap decrease would have overflowed until the first POST -- a
defensive load-time cap now guards it (top-level scope predates
ringKeep's declaration point, so it is an inline splice with a
comment saying why). Zero manual ring splices remain in code this
series authored.

2) REPORT SVG TOOLTIPS. Static SVG has no listeners at report time;
<title> children are its native hover text. All three charts got
line-level titles (name + latest value), and the T-sweep chart adds
PER-POINT invisible hover circles carrying timestamp + exact SNIPS +
an [ADOPTION] tag -- strided to ~150 per line so the SVG stays sane,
with adoption points ALWAYS targeted regardless of stride (152
circles on a 600-report synthetic, both adoption points hit).

3) ARMED-REMATCH CANCEL -- with the race window stated, not wished
away. A cancel wins only while the stamp is UNCONSUMED: the engine
polls every ~30s and, once armed, resets within one tick. So the
engine now ACKS consumption, the console shows a PENDING indicator
(stamp set, no ack) with the Cancel button, and the cancel response
says which side of the window you were on ("Cancelled in time." /
"Too late -- already consumed."). Cancels join the rematch audit,
marked in-time or too-late. Race semantics walked both ways.

4) CONSOLE ANCHORS. #experiments, #era, #series, #audit, #gates ids
plus a nav bar; location.reload() preserves the URL hash, so the
auto-refresh (already hand-yielding since v30) returns you to the
section you were reading.

v31 validation: hoisting demonstration; cancel race both ways;
stride + adoption-targeting invariants; all touched JS node --check
clean.

v31 rig checks:
- grep "splice(0" across the pack: only in-place tail ops and the
  commented load-time guard remain
- Hover the report's T-sweep points: exact values; the adoption
  point answers even between strides
- Crown a series, rematch, cancel within 30s: "Cancelled in time",
  the audit shows it, the engine never resets; repeat too slowly:
  "Too late"
- Deep-link the console at #gates: the refresh keeps you there

## v32 -- Phase 32 (the countdown counts, the arms show their spread,
## the audits speak one language, every flip can take itself back)

1) PENDING-REMATCH COUNTDOWN. The console's pending line now ticks:
"armed 12s ago; the engine polls every ~30s, so it consumes within
~18s" -- and past the bound, "any moment". Stated as an UPPER bound,
not a promise: the engine may see the stamp on its very next tick.
Client-side ticker; the hover-pause (v30) keeps it readable.

2) DIFFICULTY A/B STRIP CHARTS (report.html, both instances). Each
arm's session durations as jittered dots on a band -- heuristic
green, learned amber -- with mean ticks, per-dot <title> tooltips
(the v31 lesson), Welch t in the caption (the validated v22 formula
inlined, since the report has no import path to the brain's copy;
re-checked against the hand case: t=-1.897 exact), and a PROMOTED
theta / RETIRED marker when resolved. The distributions the verdict
lines summarize are now visible: overlap is a "not yet", separation
is a story.

3) AUDIT UNIFICATION -- the ringKeep lesson applied to audits. Files
stay separate (no migration risk); the WRITER unifies: one
appendAudit(file, req, action, detail) producing {ts, from, action,
...detail} with ringKeep(500), replacing three inline blocks. The
console renders ONE merged, sorted, kind-tagged list -- and
old-shape entries from before the unification still render: an
audit that forgets its own past would be a poor audit.

4) GATE UNDO. Flips now record the value they DISPLACED (prev, null
when the key was unset); the undo route restores the most recent
flip's prev for the key -- restoring null deletes the key, back to
default -- skipping undo entries when searching (walked: an undo
after two flips targets the second flip, not itself). Every undo is
itself audited: history only ever grows. One button per gate row,
and the alert names what was restored.

v32 validation: undo targeting (skips undo entries, null-prev
deletes); inline Welch vs the hand case; countdown bound behavior;
all touched JS node --check clean.

v32 rig checks:
- Arm a rematch and watch the countdown tick to "any moment" as the
  engine's poll window closes
- report.html after 20+ A/B sessions: the strips separate (or
  visibly do not -- which is the honest picture the t summarizes)
- Flip a gate twice, undo once: the file shows the first flip's
  value; the merged audit shows flip, flip, UNDO in order
- The Audit section interleaves gate and duel entries by time

## v33 -- Phase 33 (undo walks all the way back, outliers cannot hide,
## the countdown trusts a stopwatch, scripts get the ledger)

1) UNDO DEPTH via STACK REPLAY. The cursor the last-flip search could
not be: replaying the audit per key -- flips push, undos pop -- means
the next undo always restores the TOP's prev, so repeated undos walk
the entire flip history back one honest step at a time, a flip after
undos restarts the walk from there, and an exhausted history says
"nothing left to undo". The depth is DERIVED from the audit itself --
no cursor state to desynchronize, ever. Full walk validated: flip
a->b->c, three undos land suggest, adopt, (default), a fourth refuses;
post-undo flip then unwinds correctly. Undo responses now report how
many steps remain.

2) OUTLIER RINGS -- with a caught bug worth the phase. Naive 3-sigma
was implemented first and MY OWN TEST exposed the classic MASKING
problem: a 400s session among ~100s sessions inflates sigma until
|400 - mean| = 270 < 3*sd = 285 and the outlier hides itself.
Replaced with median + MAD (the 1.4826 factor keeps "3 sigma" an
honest label under normality): the same data now flags exactly
[400], clean data flags nothing, twin outliers on both tails are
both caught, and degenerate spreads ring nothing. The rings carry
tooltips naming the arm median they fled from.

3) MEASURED COUNTDOWN -- no engine change needed. The engine is the
rematch GET's only client, so the bridge measures inter-request gaps
itself: median of the last five (a stray curl cannot drag a median
far -- verified: one 1s gap among 30s gaps still reads 30). The
console's countdown speaks the measured cadence and labels it
"(measured)"; the hardcoded 30 survives only as cold-start. Single-
poller assumption stated in the code: two engines would halve the
apparent gap.

4) AUDIT EXPORT. GET /ai/brain/audit.json serves the merged,
source-tagged list -- refactored so the console and the export
render from the SAME mergedAudit() function: one source of truth,
two consumers.

v33 validation: full undo walk (five assertions); MAD vs the exact
masking case naive sigma failed; median-cadence stray resistance;
all touched JS node --check clean.

v33 rig checks:
- Flip a gate three times, undo four: the fourth politely refuses;
  the audit reads flip, flip, flip, undo, undo, undo
- Fake a 400s session into difficulty_ab.json: the report rings it
- Watch the pending countdown after the engine has polled a few
  times: "(measured)" appears with the true cadence
- curl /ai/brain/audit.json | jq: the ledger, scriptable

## v34 -- Phase 34 (history walks both ways, freak sessions get
## named in the verdict, the console knows when the engine went quiet,
## and the ledger takes questions)

1) REDO. The replay derives BOTH stacks now: flips push (and CLEAR
the redo stack -- editor semantics: redoing across a divergent
history would apply a value from a timeline that no longer exists),
undos move stack -> redo, redos move redo -> stack and re-apply the
value. Walked end to end: a -> b -> c, two undos back to a, redos
rebuild b then c, a third refuses, and a post-undo flip kills the
redo stack as it must. The undo route now shares the same
replayGateStacks() -- one history interpreter, two directions. Redo
buttons join undo on every gate row; redos are audited like
everything else.

2) MAD IN THE VERDICTS -- flagging, not trimming. The report's v33
masking lesson reaches the brain: both difficulty verdicts count
robust outliers per arm and append a caution when freak sessions may
be doing the arguing ("[caution: 1 outlier session(s) in learned --
Welch assumes roughly normal arms; inspect the report strips]"). The
drift monitor logs flagged windows too, but they still count toward
the streak (three independent windows must agree -- persistence is
already the defense). Deliberately NOT trimming: silently dropping
data is a methods change that deserves its own gate, not a quiet
if-statement -- and the open question of whether cautioned decisive
verdicts should feed ladder streaks is stated in the code, undecided
on purpose. Detector parity with the report proven on five shared
cases including the masking one.

3) ENGINE STALENESS -- honest about its aperture. The console header
reads "engine last seen Ns ago (via duel routes)", green under 90s,
amber past. Liveness is attributed only from ENGINE-ONLY routes
(duel tallies, rematch poll, rematch ack), so it reads while a duel
is armed or crowned and says "not seen this bridge session
(liveness reads only from duel routes)" otherwise -- an indicator
that names its blind spot instead of claiming omniscience.

4) AUDIT EXPORT FILTERS. ?src=gate|duel, ?action=flip|undo|redo|
rematch|cancel, ?since=<ms-epoch> -- composable, unknown params
ignored, malformed since filters nothing rather than erroring.
"What did anyone change since last night" is now one curl.

v34 validation: full redo walk (rebuild + exhaustion + divergence);
MAD detector parity across five cases; all touched JS node --check
clean.

v34 rig checks:
- Flip, undo, redo, flip: the audit reads all five actions and the
  file lands where the walk says it should
- Fake a 900s session into an arm: the next verdict carries the
  caution and the strip rings the dot
- Watch the staleness line flip amber ~90s after stopping the engine
  mid-duel
- curl "/ai/brain/audit.json?src=gate&action=undo" | jq

## v35 -- Phase 35 (the methods change stands trial, the pulse widens
## the aperture, the buttons count their steps, the ledger speaks Excel)

1) TRIMMED-VERDICT EXPERIMENT -- the methods change, properly gated.
madTrim() returns an arm minus its robust outliers, and both
difficulty verdicts now report BOTH t values: "raw t=2.31, trimmed
t=2.10". The ladder counts a verdict as decisive ONLY when raw and
trimmed AGREE on significance and direction -- trimming never
decides alone, it can only withhold consent. Disagreement says so
out loud ("raw and trimmed DISAGREE -- outliers are arguing; streak
withheld") and zeroes the streak. If trimming leaves an arm under 10
sessions, the trimmed t ABSTAINS and the raw verdict stands with a
note -- a heavily-trimmed arm is itself information. The full
agreement matrix walked: both-sig-same-sign decisive; raw-only
withheld; opposite-signs withheld; neither quiet; abstain falls back
to raw. Trim verified to remove the v33 masking case's 400.

2) HEARTBEAT (engine + bridge). The engine installs a single 60s
POST /ai/brain/heartbeat (??= guard -- one interval, ever); the
bridge stamps engineLastSeen with a SOURCE tag, and the duel routes
tag theirs too. The console's staleness line now reads whenever the
engine runs -- "last seen 12s ago (via heartbeat)" -- not only
mid-duel, and the cold-start text explains that the pulse begins
with the engine.

3) REDO/UNDO DEPTH INDICATORS. The gate rows run the same
replayGateStacks() the routes use and label the buttons with their
walk lengths -- "undo x2 / redo x1" -- disabling at zero instead of
failing politely after the click. One history interpreter, three
consumers now.

4) AUDIT CSV EXPORT. ?format=csv on /ai/brain/audit.json (composable
with the v34 filters): RFC-4180 quoting -- comma/quote/newline
fields quoted, inner quotes doubled, validated on all three cases
plus nulls -- columns ts/iso/src/action/from/key/value/prev/
restored/detail, served with a download disposition. Yes, the irony
of exporting the GPU brain's ledger INTO a spreadsheet is noted in
the code and savored: the VBA engine's ancestors would be proud.

Two honest stumbles this phase, both caught by the rituals: (1) the
first server patch run died on an INDENTATION-SUBSTRING collision --
an 8-space anchor matched inside a 20-space line (a prefix of spaces
contains a shorter prefix of spaces), count came back 2, assert
aborted with the file unwritten; rerun with newline-prefixed
exact-indent anchors. (2) The rerun's freshness guard ('v35' in
file) tripped on a PRE-EXISTING "v352" catalog comment from the old
engine -- a substring accident in the guard itself; replaced with a
marker only this patch writes ('v35 -- HEARTBEAT'). Both times the
abort-unwritten rule meant the file on disk stayed pristine v34
until a clean run applied everything.

v35 validation: agreement matrix (five cases); trim vs the masking
case; CSV escaping (comma, quote, null); heartbeat via-tagging
sites counted (5); all touched JS node --check clean.

v35 rig checks:
- After 20+ A/B sessions with one faked 900s outlier: the verdict
  line carries both t values and, if they disagree, the withheld
  streak note
- Stop the duel but leave the engine running: staleness stays green
  "(via heartbeat)"
- The gate buttons read "undo x0" disabled on a fresh key, count up
  with flips
- curl "/ai/brain/audit.json?format=csv" -o audit.csv and open it
  in Excel on Galaxina -- the full circle

## v36 -- Phase 36 (the drift monitor stands the same trial, the
## ladders date their evidence, every dataset speaks Excel, and the
## open question closes)

1) TRIMMED TWIN FOR THE DRIFT MONITOR (both instances). The
warm-restart Welch now runs raw AND trimmed, and a drift step counts
only when they AGREE -- with the asymmetry stated: the drift test is
ONE-SIDED (direction is fixed; both must agree the post window is
WORSE, t < -2.0), so agreement collapses to both clearing the same
bar. The v35 abstain rule carries over (either side trimmed under 10
-> raw decides alone), disagreement is announced ("outliers are
arguing; streak withheld"), and the v34 outlier flag still names the
freak sessions on counted steps. Six-case matrix walked, including
the boundary (trimmed -2.0001 counts).

2) EVIDENCE-AS-OF STAMPS. Every experiment row gained a fifth
column: the state file's mtime IS the moment its evidence last
moved. The interesting staleness is relative: a row goes amber when
the file is 10+ minutes older than the engine's last heartbeat --
not just old, but old WHILE data was flowing, which is the
suspicious kind of old. Missing files read "-", and with no
heartbeat yet the stamp stays neutral (no false alarms on a cold
bridge).

3) DATA CSV EXPORT. /ai/brain/export.csv?file=telemetry|
sweep_history -- whitelisted, one route. Columns are the SORTED
UNION of keys across entries (deterministic; sparse fields render
empty; object values JSON-quoted through the same RFC-4180 esc).
The telemetry sessions and the tuning's whole history now open
straight into a spreadsheet.

4) THE v34 OPEN QUESTION, RESOLVED. Should cautioned decisive
verdicts feed ladder streaks? The agreement gate answered it
structurally across v35/v36: a cautioned verdict counts iff raw and
trimmed AGREE -- the caution stays a flag, the gate does the
deciding, and the same rule now governs A/B streaks and drift
streaks alike. The v34 "open question" comment in the code was
updated to point at its resolution rather than silently vanishing:
questions that got answered should say so where they were asked.

v36 validation: six drift-agreement cases including the boundary;
CSV auto-column determinism, sparse fields, object quoting;
staleness rule (alive+old = amber, cold bridge = neutral); all
touched JS node --check clean.

v36 rig checks:
- Promote a theta, then fake one 900s session into the post window:
  the drift line reports both t values and withholds if they split
- The console's fifth column goes amber on a ladder whose file
  stopped moving while the heartbeat stayed green
- /ai/brain/export.csv?file=telemetry opens in Excel with every
  session a row
- Grep brain.js for "open question": the comment now names its
  resolution

## v37 -- Phase 37 (the report dates its evidence, every table
## reaches Excel, the drift watch gets a picture, silence gets loud --
## and a two-version-old bug surfaces from a read)

0) LATENT BUG, CAUGHT BY THE READ-FIRST RITUAL. Preparing the gap
alerter meant reading the /sys/logs POST internals -- which revealed
the route reads d.msg, while THREE engine-side lines I authored
(v25 SET/CHAMPION, v27/v29 rematch announce lines) posted {line: ...}
and were being SILENTLY DROPPED (ok:true, nothing pushed). Fixed at
all three sites to the route's real contract ({src:"duel", msg}) --
the route's own [src] prefixing replaces the hardcoded bracket. The
rig check below matters: those announcements have never actually
appeared in the log panel.

1) EVIDENCE-AS-OF ON THE REPORT. Same fifth column as the live
console, from Deno.statSync at render time -- with the honest
difference stated: the offline report cannot know engine liveness,
so it dates the evidence without judging it (absolute stamps, no
amber).

2) EXPORT.CSV GROWS BRIDGE FILES. ?file=duel|series join
telemetry|sweep_history in the whitelist -- duel tallies and the
podium open in Excel through the same auto-column RFC-4180 path.

3) DRIFT-WATCH STRIP CHART (report, both instances). The promotion
baseline (cyan) vs the accumulating post window (gold) in the A/B
strips' pattern, with the drift streak in the caption -- rendered
only while a promotion is on watch. Refactor note: stripBand was
EXTRACTED from diffChart so both charts share one renderer -- same
file, same runtime, so unlike the node twins, duplication here would
have been pure carelessness. Jitter determinism across instances
verified.

4) HEARTBEAT GAP ALERTING. A lazy-installed 30s watcher (??= --
one, ever): if the engine was heartbeating and has gone quiet past
2.5 beats (150s), ONE warn line lands in the system log ("engine
heartbeat QUIET for 160s (~2 beats missed) -- gone or wedged
mid-session"); the returning pulse logs its own recovery with the
outage length, and the alert re-arms for the next quiet period. The
console waited for someone to look at nothing; the log goes to them.
Full cycle walked: quiet -> one alert (no repeats), recovery ->
loud, re-quiet -> alerts again. One test-data confession: the first
walk used ts=0 as the epoch and the falsy guard skipped everything
-- bad test data (third occurrence this series), not bad code;
rerun on epoch-offset stamps, all three transitions exact.

Also this phase: the report patch aborted once mid-run -- I assumed
the offline console's rows mirrored the node twin's formatting, and
they do not (template literals vs concatenation). The abort-unwritten
rule held, the section was READ, and the rerun anchored on real
bytes. The ritual exists precisely because twin symmetry is a guess.

v37 validation: gap-alert state machine (three transitions); jitter
determinism through the shared renderer; drift-chart gating
(promoted+post renders, retired and thin-post skip); all touched JS
node --check clean.

v37 rig checks:
- Crown a set: the SET/CHAMPION lines now actually appear in the
  log panel (they never did before -- the v37 fix is why)
- Kill the engine mid-session: within ~3 minutes the log carries the
  QUIET warn; restart it: the BACK line with the outage length
- report.html during a promotion: the drift-watch strip sits under
  the A/B strip, baseline vs post
- /ai/brain/export.csv?file=duel opens the tally history in Excel

## v38 -- Phase 38 (the bug class gets a guard dog, the drift watch
## goes live, opinion becomes a knob, one door to Excel)

1) LOG-CONTRACT LINT. On first request the bridge greps the engine
bundle for JSON.stringify({ line: ... }) posts -- the v37 bug class
-- and logs one line either way ("[lint] log-contract clean" or a
warn naming the count and file), because a lint that runs silently
cannot be distinguished from a lint that never ran. Missing bundle
says so and skips. The regex catches multiline forms; the current
bundle lints CLEAN (the v37 fix held -- verified in-sandbox with the
same pattern).

2) DRIFT STRIPS ON THE LIVE CONSOLE. Canvas twin of the report's
v37 chart, per instance, rendered only while a promotion is on
watch: baseline cyan, post window gold, streak in the caption --
and the twins are PIXEL-AGREED: the live LCG jitter was verified
identical to the report's across 50 draws, so the same session
lands in the same spot on both charts. Gating parity checked too.

3) GAP THRESHOLD AS A KNOB. BRAIN_HB_QUIET_S joins gates.json as
the whitelist's first NUMERIC key (integer seconds, 60..3600;
rejection matrix walked: 59, 3601, "abc", 150.5 all bounce). The
watcher reads it each 30s tick (a fresh read of a tiny file is
cheaper than a cache bug), falling back to 150s on absence or
nonsense. The satisfying part: prev-recording, undo, redo, and the
audit all work on the numeric knob UNCHANGED -- the replay
machinery never cared what a value meant, only that flips record
what they displaced. The console row takes a number and a set
button.

4) EXPORT.CSV?FILE=AUDIT. The alias closes the loop: audit joins
the whitelist with a null path (merged in code via mergedAudit(),
not read from disk -- the "in" check accepts it by design), so one
export surface now serves telemetry, sweep history, duel tallies,
series, and the ledger. The older audit.json?format=csv route
stays for compatibility.

v38 validation: lint regex on both contract styles + multiline;
numeric-knob rejection matrix; twin jitter parity (50 draws) and
gating parity; alias whitelist semantics; all touched JS node
--check clean.

v38 rig checks:
- Boot the bridge, first console load: "[lint] log-contract clean"
  in the log; hand-add a {line:} post to main.js and re-boot: the
  warn names it
- During a promotion, the live console shows the drift strips and
  they match the report's chart dot-for-dot
- Set BRAIN_HB_QUIET_S to 60 from the console, kill the engine:
  the QUIET warn lands in ~1-1.5 minutes; undo restores the default
- /ai/brain/export.csv?file=audit opens the ledger in Excel

## v39 -- Phase 39 (contracts become a table, tooltips reach the
## live strips, knobs get types, sheets get narrower) + ESCAPE
## VELOCITY joins the fleet

1) LINT EXPANSION -- a contract TABLE. Each cross-process contract
is one entry: a regex for the wrong shape and a line saying what
right looks like. Three checked: {line:} log posts (the v37 class),
heartbeat POSTs carrying a body (the route ignores one -- a payload
there is a misunderstanding waiting to grow), and duel tally posts
missing killsA (also dropped silently). New contracts join the
table, not the code. Both styles validated per contract.

2) DRIFT-STRIP TOOLTIPS (live canvas). The era-chart hover pattern:
the hovered band is chosen by y (baseline above, post below), the
nearest dot by x, "baseline: 142s" in the tip, nothing shown past
18px so empty space stays quiet.

3) KNOB TYPES. The whitelist entry now declares how a key renders
and validates: enum -> suggest/adopt buttons, int -> a number input
with the entry's own bounds. The v38 special-cased hbRow RETIRED
into the table it should always have been; new knobs are one table
line. Undo/redo depth labels ride every row type unchanged.

4) EXPORT COLUMN SELECTION. ?cols=ts,durS narrows any sheet:
requested order kept, unknown names dropped (a typo yields a
thinner sheet, not an error -- the header shows what survived),
all-typos falls back to the full set.

## ESCAPE VELOCITY (/ev) -- the brain's fourth game

A new CLIENT of the existing mailbox, ZERO protocol changes: ships
POST the same snapshot round-trip the engine uses (roster of
ev-<id> entries with attack specs, outcomes riding along), the
field comes back with the merged attack map and aggro, and the
authority model is unchanged since the VBA days -- the page owns
positions and physics, the brain owns intents.

What EV got: six systems on a JUMP GRAPH (Sol/Vega/Rigel/Altair/
Deneb/Kruger) with BFS routing -- systems are a graph, not a grid;
flow fields stay where they are good, which is not here -- EV-feel
physics (thrust + rotation + true inertia for the player; AI ships
carry mild drag so dogfights converge), two factions as brain kinds
(ev_confed patrols, ev_pirate hunts), brain-served weapon choice
(blaster/missile through the attack map) with the rc LOCAL FALLBACK
when the brain is quiet -- the HUD says which mode you are in --
aggro-driven pursuit and the rc cadence formula (1.55 - 0.9*aggro),
and outcome reporting per shot so ev picks feed the same
pick -> propensity -> outcome -> SGD loop as everything else.

Brain-side: domainOf learned the ev- prefix, so per-domain
hit-rates, T sweeps, and selection A/B buckets exist for ev FOR
FREE; the three explicit domain lists were extended. HONEST SCOPE:
under BRAIN_DOMAIN_SPLIT, ev rows ride the kaiju GPU head this
phase -- an ev output head is the sketched next step, stated in the
code, not silently assumed. Also out of scope and stated: the
economy (trading as a new episode type -- pick=cargo/route,
outcome=margin -- is the framed next arc, one honest phase-arc of
work).

Mirror-validation, EV: BFS exhaustive over all 36 system pairs
(every route's hops verified as real edges; diameter 4; the
Sol->Kruger spot-check lands a known shortest); player inertia
exact (100u coast in 1s, zero drag); AI drag measured 0.995^60 =
0.740 per second; cadence parity with rc (hot 0.67s vs cold 1.23s
on the blaster).

v39 validation: contract regexes both ways per entry; cols
selection (order kept, typos dropped, full-set fallback); EV math
above; all touched JS node --check clean.

v39 rig checks:
- Boot: "[lint] 3 cross-process contracts clean"
- Open /ev on Galaxina: fly (arrows), fight pirates (space), jump
  (j past the ring); HUD flips from "local fallback" to "SERVED"
  once the brain process is up
- After a session, /ai/brain/status shows the ev domain
  accumulating outcomes; the T-sweep gains an ev bucket at 300
- Hover the live drift strips: per-dot values
- /ai/brain/export.csv?file=telemetry&cols=ts,durS is two columns

## v40 -- Phase 40 (the debt is paid, the factions go to war, the
## freighters start earning, the ev sessions get counted)

1) EV OUTPUT HEAD -- the v39 debt, paid where incurred. The head-init
loop, the trainer construction (rewritten as one loop over three
domains -- the two-entry literal was already repeating itself), the
training step, and the heads save all speak ["dungeon", "raycaster",
"ev"]; the ev head clones from kaiju at birth like its siblings,
shares the hidden layer by reference, and judges alone. The v16
routing needed NOTHING: domainOf(o.id) already lands "ev" on
atkHeads.ev the moment it exists, and the observe path dispatches
domTrainers[dom] dynamically (verified: 5 dynamic sites). The v39
scope-note comment was retired in place -- debts should be marked
paid where they were incurred.

2) EV FACTION DUEL. /ev?duel=1&setTarget=5&bestOf=3: ship-vs-ship
combat turns on (under a duel the nearest enemy ship outranks the
player as a target), confed and pirate deaths tally, and the SAME
bridge duel routes get the kills -- Confederation vs Pirates flows
into the kill curves, sets, podium, and rematch machinery unchanged,
because those routes never cared which client was posting. The v25
endgame logic rides as a small page-side copy (node-twin precedent;
walked again here: 2-1, champion A). The HUD carries sets and
champion.

3) TRADING EPISODES -- a new episode type, not a bent combat one (a
margin is a scalar reward, not a hit boolean; reusing the attack map
would have lied about semantics). Three freighters trade the graph:
at dock, the pick over (good, destination) options is softmax at
EV_TRADE_T over EXPECTED margins; margins REALIZE at arrival against
prices that moved in transit -- the gap between expected and
realized is the point. Episodes {scores, pIdx, p, margin} ride the
snapshot; the brain rings them (trade_log.json, 5000) and at 300+
runs a SNIPS grid pricing TRADER BOLDNESS -- validated on a
synthetic exploit-favoring world where colder temperatures correctly
price higher, monotone across the grid. Propensities exact
(softmax sum 1.000000).

4) EV DIFFICULTY TELEMETRY. The page publishes player {hp, acc}
with each snapshot; the brain segments ev sessions on the rc rules
(60s gaps close, sub-15s or sub-3-snapshot stubs discarded) into
difficulty_telemetry.json with dom:"ev" -- so the v24 correlation
pass, the strip charts' data source, and export.csv?file=telemetry
see ev sessions for free.

Two rituals earned their keep again this phase: the page patch
aborted once on a bad anchor -- a leading quote I imagined at the
HUD line, where the pipe-separator actually sits MID-literal --
labeled counts pinned it, the file stayed unwritten, the corrected
anchor landed everything. And the ts=0-falsy test-data artifact
struck a FOURTH time (telemetry harness; real code uses Date.now()
and is immune) -- at this point it is a named recurring character.

v40 validation: trade SNIPS on a known world (colder wins,
monotone); duel endgame parity with the v25 walk; propensity
exactness; segmentation close/discard rules; domTrainers dynamic-
dispatch verification; all touched JS node --check clean.

v40 rig checks:
- BRAIN_DOMAIN_SPLIT=1: boot says three heads; after ev sessions,
  weights_attack_heads.json grows an ev entry with climbing steps
- /ev?duel=1&setTarget=3&bestOf=3: watch Confederation vs Pirates on
  the duel view; crown, rematch from the console -- the page's next
  series posts fresh
- Leave the freighters running ~10 min: the boldness sweep milestone
  lands in the log
- export.csv?file=telemetry&cols=ts,dom,durS shows ev rows among rc

## v41 -- Phase 41 (boldness earns a ladder, the crowned page thaws,
## pirates tax the trade lanes, and ev joins the verdict)

1) TRADE LADDER -- EV_TRADE_T becomes brain-served. The T ladder's
whole pattern lands on trader boldness: 3 agreeing sweeps starring
the same T, a RELATIVE >2% margin over the running T (margins are
world units; an absolute threshold would drift with the economy),
era-windowing post-adoption (the v26 lesson arrived pre-paid --
trade entries carried timestamps from birth), and the
BRAIN_TRADE_T_AUTO gate through the same gates.json the console
flips (whitelist, knob table, undo/redo all extended -- one enum
line each, as the v39 type table promised). Adoption persists
(trade_state.json); the served T rides the field POST beside the
policy payloads that already survive the partial merge, and the
page's freighters read field.tradeT with 0.5 as local fallback --
the combat doctrine, applied to commerce. Ladder walked: streak
builds, resets on a different star, SUGGESTs at 3 gated, ADOPTs
open, quiets on same-T and sub-2% margins.

2) EV REMATCH CONSUMPTION (PATCH-B2m5, the page's turn). A crowned
page polls the stamp every ~30s, arms + announces through the
proper {src,msg} contract, resets SYNCHRONOUSLY on the next tick
(sets zeroed, baseline moved to current kills, dead ships refitted
for the new series), applies terms riding the stamp, and ACKS -- so
the console's pending indicator, countdown, and cancel window all
work for EV duels exactly as they do for kaiju ones.

3) FREIGHTER PIRACY -- the economy and the combat share a ledger.
Freighters gained bodies (in-system position + 60 hull); hot
pirates (aggro > 0.5) prefer a freighter in reach over any other
target; a pirated leg reports margin = -buyAt (the purchase is
sunk) into the SAME boldness sweep as honest legs. The proof is
the phase's best result: in a synthetic world where the bold route
gets pirated 25% of the time, the SNIPS ordering FLIPS -- warmer
temperatures now price HIGHER than cold ones (diversification as
insurance), where v40's safe world priced cold on top. The sweep
did not need to be told about pirates; the margins told it.

4) EV IN THE SPLIT VERDICT. The brain-side z-test already spoke ev
(the v39 domain-list extension reached it -- verified by read, not
assumed); what remained was the READOUTS: the report's z-chart
gains the ev line (cyan) and legend, and both consoles' Split and
Sampled rows enumerate ev. Both regimes must accumulate ev data
before the z-test speaks -- run some /ev sessions under each
BRAIN_DOMAIN_SPLIT setting.

v41 validation: ladder walk (nine transitions); piracy-prices-risk
flip on a known world; pirated-episode shape; all touched JS node
--check clean.

v41 rig checks:
- Let freighters run past 300 legs: the sweep milestone reports
  "serving T=0.5" with streak progress; flip BRAIN_TRADE_T_AUTO to
  adopt from the console and watch an adoption land + persist
- Crown an EV duel, rematch with new terms from the console: the
  page announces, resets, and the pending indicator clears
- Watch a pirate peel off mid-dogfight for a freighter; the log
  carries "ev-t1 pirated -- cargo lost"
- After ev sessions under both regimes, the z-chart grows a cyan
  line

## v42 -- Phase 42 (adopted boldness stands probation, the navy
## answers the pirates, the economy draws its own picture, the podium
## wears its colors)

1) TRADE DRIFT WATCH. Adoption now CAPTURES its baseline -- the last
200 margins at the moment of adoption, the promoted-theta doctrine
verbatim -- and every sweep while adopted Welch-tests the last 100
post-adoption margins against it, ONE-SIDED worse, raw and trimmed
AGREEING (the v36 rule; disagreement announced and withheld). Three
agreed-worse sweeps re-open through the gate: adoption cleared,
serving falls back to 0.5, streaks re-arm. Deliberately NO warm
restart -- T is a discrete grid; there is no neighborhood to resume
from, and pretending otherwise would be ceremony.

2) ESCORT MISSIONS -- the counterforce. Piracy HEAT rises 1.2 per
taken freighter and decays with a ~35s half-life; past 1.5, confeds
convert to escorts: anchored to the nearest live freighter, weapons
hot regardless of their own aggro. The loop piracy opened (bold
legs -> losses -> boldness repriced) now has its answer (losses ->
escorts -> pirates contested) -- and neither side needed a script;
heat and aggro do the arguing. The HUD says "ESCORTS OUT (heat
2.1)" while it holds. Dynamics verified: two piracies in 10s clear
the threshold, ~70s of quiet stands the escorts down (measured 0.25
of peak over two half-lives, exact).

3) TRADE STRIP CHART (report). Honest legs green, pirated legs red,
through the shared stripBand -- so the honest band's MAD rings still
flag freak margins WITHIN honest trade, and the gap between the
bands is, visibly, what piracy costs. Pirated episodes carry a flag
from the page through the brain's ingest (one spread each side).

4) PODIUM HUES. The v21 hueOf carries onto the podium: champion AND
loser names in their faction colors (the loser kept its colors too)
-- Confederation and Pirates arrive pre-hued like every kaiju
faction before them, because the podium never cared which game the
series came from.

v42 validation: heat dynamics (threshold crossing + half-life decay
measured exact); drift agreement rule three ways; all touched JS
node --check clean.

v42 rig checks:
- Adopt a trade T, then flood the market (hand-edit prices flat):
  three sweeps later the drift re-open lands and serving reads 0.5
- Watch pirates take two freighters: "ESCORTS OUT" on the HUD,
  confeds converge on the survivors, heat decays after the fight
- report.html: the trade strip's red band sits left of the green
- The podium colors Confederation and Pirates by name hue

## v43 -- Phase 43 (the escorts get audited -- honestly, the drift
## watch gets its picture, the tripwire goes brain-served, the podium
## learns which game it is watching)

1) ESCORT EFFECTIVENESS TELEMETRY -- with the confounding as the
centerpiece, not a footnote. The page accumulates exposure seconds
and piracy counts per arm (escorts out vs calm); the brain persists
them (escort_stats.json) and every 5 escort-minutes reports both
rates -- prefixed, in the milestone itself, with the methodological
truth: escorts deploy EXACTLY when piracy is hot, so the arms are
not randomized and the naive comparison is biased AGAINST escorts.
A rate ratio near 1 under that bias already favors them. The honest
fix -- a RANDOMIZED threshold test -- is named as the next step,
not smuggled in as done. (The worked example in validation: escorts
seeing 0.40/min against calm's 0.12/min reads as 3.3x worse only if
you forget they were sent into the storm on purpose.)

2) TRADE DRIFT STRIP (report). Adoption baseline (cyan) vs post
margins (gold), drift streak in the caption -- the v37 drift-watch
chart pattern on the probation trades earned in v42. Renders only
while an adoption is on watch.

3) HEAT AS A SERVED SIGNAL. The brain reads pirated fractions from
its own trade log and serves the escort THRESHOLD the way it serves
aggro and tradeT: linear in recent pirated fraction, clamped
[0.8, 2.5], pf=0.1 landing exactly on the 1.5 status quo (verified
along the curve, clamps held). A hot economy lowers the tripwire --
escorts sortie earlier; a quiet one raises it -- no navy for a calm
sea. The page reads field.escortThreshold with 1.5 as the local
fallback; every v42 threshold site swapped to the served read.

4) PODIUM GAME FILTER. Duel POSTs carry game tags now (the EV page
says "ev", the engine says "kaiju" -- one line each), the bridge
stores them on podium entries, and the view honors ?game=ev|kaiju.
Untagged LEGACY entries always show: history predating the tag is
history, not noise.

One abort this phase, caught by its own inline doubt: the engine's
duel-POST anchor was tried against server.js first -- the assert
died, the file stayed unwritten, and the edit went to main.js where
it belonged. The comment questioning the placement was already in
the patch when it failed; rituals work best when they argue with
you mid-keystroke.

v43 validation: threshold curve (monotone, clamped, status-quo
anchor exact); rate arithmetic with the bias reading; podium filter
three ways (legacy/hidden/unfiltered); all touched JS node --check
clean.

v43 rig checks:
- Let pirates feed: the milestone lands with the confounding line
  verbatim; escort_stats.json survives a brain restart
- Hand-set trade_log pirated fractions high: field.escortThreshold
  drops below 1.0 within a snapshot cycle and the HUD's ESCORTS OUT
  arrives visibly earlier
- report.html during a trade adoption: the probation strip renders
- /ai/brain/duel/view?game=ev shows only EV series; drop the param
  and the kaiju wars return

## v44 -- Phase 44 (the coin fixes the courtroom, the experiment
## table seats a new defendant, the tripwire keeps a diary, the podium
## counts its wars)

1) RANDOMIZED THRESHOLD TEST -- the honest experiment v43 named,
built. A heat-EPISODE runs from heat crossing 0.5 upward until it
decays back; at ignition a COIN assigns the arm -- served-0.3 (lo,
escorts sortie earlier) or served+0.3 (hi, later) -- BEFORE any
outcomes exist, which is exactly what breaks the v43 confounding.
The igniting piracy predates assignment and is attributed to
NEITHER arm (walked); sub-10s stubs are discarded; episodes ship
through the snapshot, ring per-arm (escort_ab.json), and at 20+/arm
the brain Welch-tests per-episode piracy rates -- the episode is
both the randomization unit and the analysis unit, as it must be.
Validated three ways: a null world stays quiet under the coin
(rates 0.113 vs 0.094 -- no confounding survives randomization); a
game-calibrated halved-rate world is caught decisively (t=-5.63);
and a POWER FINDING earned its keep: my first synthetic world used
sparse rates (0.06/min) where most episodes are zero-count, and the
same halving hid completely (t=0.33) -- per-episode Welch is
underpowered for rare events. Named in the code as a caveat: quiet
economies need more episodes before the verdict means anything.
The rates are game-realistic in practice (episodes ignite BECAUSE
piracy is happening), so the calibrated case is the operative one.

2) ESCORT STATS ON THE CONSOLE. Both consoles (live + report twin)
seat the new row in the experiment table's pattern: state
"collecting episodes", evidence "lo 14 ep @1.8/min, hi 11 ep
@2.4/min", next gate "20+ per arm, then Welch", evidence-as-of from
the file mtime like every other ladder.

3) SERVED-THRESHOLD ERA CHART. The tripwire keeps a diary ({ts, th,
pf} at most once a minute, 1000-ring) and the report draws it: gold
threshold on its own 0.8..2.5 scale, red dashed pirated fraction on
0..0.5 -- TWO honest scales, both labeled, because forcing them
onto one axis would flatten whichever story is quieter. Overflow
clamps verified.

4) CROSS-GAME PODIUM SUMMARY. Above the (filterable) list: per-game
series counts and the leading champion -- "kaiju: 12 series --
Space Coalition 8/12  |  ev: 3 series -- Pirates 2/3" -- with
untagged legacy series keeping their own bucket, because history
predating the tag still counts.

v44 validation: episode lifecycle (ignition coin, attribution,
stub discard); null + known-effect + sparse worlds; dual-scale
mapping + clamp; all touched JS node --check clean.

v44 rig checks:
- Run /ev with pirates active ~20 min: the console row's episode
  counts climb both arms; at 20+/arm the randomized verdict
  milestone lands
- The era chart shows the threshold DIP as pirated fraction rises
  (the v43 curve, now visible as history)
- The podium header counts kaiju and ev series separately
- Sanity: the A/B verdict and the v43 observational report can
  disagree -- the randomized one wins the argument

## v45 -- Phase 45 (the tripwire learns from its own experiment, the
## episodes show their spread, the ledger's last table reaches Excel,
## the summary wears the colors)

1) THE SERVED THRESHOLD LEARNS -- the full circle. The v43 curve's
intercept (the hardcoded 1.5) is now escortThState.baseTh, and the
RANDOMIZED verdicts move it: a SIGNED streak (down = earlier-escorts
wins, up = later wins; a flipped verdict resets the sign), 3
consecutive same-direction decisive verdicts, the BRAIN_ESCORT_AUTO
gate (whitelist, knob table, undo/redo -- one enum line each), then
a 0.15 nudge clamped [1.0, 2.0]. At a clamp edge the ladder HOLDS
and says so. And the era hygiene that makes it sound: after a nudge
the A/B ARMS RESET -- old episodes measured jitter around the OLD
base; mixing eras would poison the very experiment that earned the
nudge (holds at the clamp do NOT reset arms -- nothing changed).
Ladder walked to the floor: streaks, nudge to 1.35, sign-flip
reset, clamped nudge to exactly 1.00, hold at the floor, two arm
resets counted -- nudges only.

The loop this closes, spelled out: piracy prices boldness (v41),
heat summons escorts (v42), the brain serves the tripwire (v43),
a coin makes the escort question answerable (v44), and now the
answer FEEDS BACK into the tripwire it tested -- gated, era-clean,
and auditable at every joint.

2) EPISODE STRIP CHART. Per-episode piracy rates by randomized arm
through the shared stripBand -- lo green, hi amber, MAD rings
flagging freak episodes within each arm. The mean ticks are the
verdict's raw material, made visible.

3) ESCORT_AB ON THE EXPORT SURFACE. ?file=escort_ab joins the
whitelist -- the file's {lo, hi} object shape flattens to arm-tagged
rows so the auto-column path gets the array it wants (3 rows,
columns arm/durS/pirated/ts, deterministic; verified).

4) SUMMARY HUES. The cross-game summary line's leading champions
wear their v42 faction colors -- the same hueOf, DOM spans instead
of textContent, separators preserved.

v45 validation: intercept ladder walked to the floor (streaks,
nudges, sign flip, clamp hold, arm-reset accounting); export
flatten shape; all touched JS node --check clean.

v45 rig checks:
- Open the gate (BRAIN_ESCORT_AUTO=adopt from the console) and let
  pirates run: after 3 decisive verdicts the milestone reads
  "INTERCEPT NUDGED 1.50 -> 1.35; arms reset for the new era" and
  the era chart's gold line steps down
- report.html: the episode strip sits under the tripwire diary;
  the arm means visibly separate (or do not -- which is the answer)
- /ai/brain/export.csv?file=escort_ab&cols=arm,pirated,durS in
  Excel: the experiment, raw
- The summary line's champion names match the podium's colors

## v46 -- Phase 46 (the nudge stands probation, the factions get a
## thumb on the scale, fights get measured twice, the table learns
## which game each ladder belongs to -- and a nine-version-old bug
## surfaces)

1) INTERCEPT DRIFT WATCH -- the stencil applied, with its direction
INVERTED and stated: piracy rates go UP when things get worse, so
drift here is Welch(post, baseline) t > +2 (the theta watches test
t < -2). Baseline = the WINNING arm's rates at nudge time -- the
evidence that earned the move -- plus the base we left, so a
drifted nudge can step back home. Post = POOLED post-nudge episode
rates: the jitter coin is symmetric, both arms sample the same new
base, pooling is fair. Raw and trimmed must agree (v36); three
agreed-worse reports step baseTh back to prevBaseTh through the
gate, arms reset again. Improvements never trip it (checked).

2) FACTION BIAS SERVED. BRAIN_EV_BIAS="confed:0.1,pirate:-0.05" --
the BRAIN_TEMPER_BIAS precedent verbatim: operator env knob, brain
parses once (whitelisted faction names, values clamped +-0.5, junk
drops -- parse matrix verified), serves field.factionBias, and the
page applies it at aggro-read time clamped [0,1] so aggro stays an
honest probability. Tip the war without touching a line of AI.

3) EPISODE LENGTH -- the SECONDARY endpoint, reported never acted
on. The A/B milestone now carries "episode length: lo 42s vs hi 61s
(t=...)" beside the rate verdict, because escorts may shorten
fights even when piracy rates tie -- worth seeing. But only the
rate feeds the intercept ladder: acting on two endpoints without
multiplicity correction is p-hacking with extra steps, and this
system does not do that quietly. The restraint is in the code
comment, not just here.

4) CONSOLE GROUPED BY GAME (both twins). Rows carry a game group;
the table renders a gold header band per group -- "engine (kaiju /
dungeon / raycaster)" then "escape velocity" -- with the T (ev)
domain row filed under EV where it belongs. The trade ladder EARNED
its console row in the process (it never had one). And the grouping
patch caught a NINE-VERSION-OLD BUG: the report console's render
loop printed r[0..3] only, so the evidence-as-of column added in
v37 had a header and data but NEVER RENDERED -- the offline table
has been one column short and misaligned against its own header
since. The fix and the confession travel together, in the code and
here.

v46 validation: inverted drift matrix four ways; bias parse
(whitelist, clamp, junk); grouped placement (every row exactly
once, order held); aggro clamp; all touched JS node --check clean.

v46 rig checks:
- Nudge the intercept, then hand-poison post episodes: three
  reports later the step-back milestone lands and baseTh reads its
  old value
- BRAIN_EV_BIAS=pirate:0.3 on the brain: pirates visibly hungrier
  within a snapshot cycle
- The A/B milestone carries the episode-length clause
- report.html: the console shows group bands AND -- for the first
  time since v37 -- the evidence-as-of column actually renders

## v47 -- Phase 47 (the bias goes console-flippable, both endpoints
## keep diaries, every system gets its own tripwire, the table folds
## on a link)

1) BIAS AS GATES KNOBS. The v38 knob table grows a FLOAT class:
BRAIN_EV_BIAS_CONFED / _PIRATE, [-0.5, 0.5], step 0.05 inputs on the
console; the POST validator gains a kind field (int stays strict --
150.5 still bounces -- floats admit decimals in range, junk bounces
everywhere). Brain-side, gateNum() is gateValue's numeric sibling:
ENV > FILE > DEFAULT with junk falling through each layer
(validated four ways), 5s cache, so a console flip reaches the
served field.factionBias without a restart -- and undo/redo work on
the new knobs for free, as the replay machinery always promised.
Precedence stated in code: the combined BRAIN_EV_BIAS env string
remains the operator's hard pin and wins outright.

2) SECONDARY-ENDPOINT HISTORY. Each A/B report rings {ts, tRate,
tDur, n} (escort_ab_history.json, 500) and the report draws both:
rate t gold solid, duration t cyan dashed, +-2 significance band --
the z-chart pattern. The picture this exists to catch: rates TYING
while durations SEPARATE -- escorts that do not reduce piracy
counts but end fights faster would show as the cyan line leaving
the band alone.

3) PER-SYSTEM PIRACY HEAT -- six tripwires, one experiment. Heat
lands where the crime did (sysHeat[tr.sys]), decays independently
(verified: Sol at one half-life, Altair double-struck and hottest,
Vega untouched at zero), and escort BEHAVIOR is local: confeds
sortie where the trouble is, weapons-hot in the hot system only.
The RANDOMIZED experiment stays keyed to MAX heat across systems --
changing the randomization unit mid-experiment would fork the data,
so the episode unit holds and the code carries the receipt. The HUD
speaks both ("max heat 2.1, here 0.4"); the system map marks hot
systems with ~heat.

4) CONSOLE FOLD -- in the URL, by design. ?fold=ev, ?fold=engine,
or both: band headers are links that toggle their own group (a
folded band shows its row count), and because the state travels in
the URL it survives the auto-refresh (reload keeps the URL, the v31
anchor lesson), needs no storage, and can be SHARED -- a link to
the console folded to just the EV ladders is a link to exactly
that.

v47 validation: float/int validation matrix; gateNum precedence
with junk fallthrough; fold toggle three ways; per-system decay
independence; all touched JS node --check clean.

v47 rig checks:
- Slide BRAIN_EV_BIAS_PIRATE to 0.3 on the console: pirates hungrier
  within ~5s, no restart; undo restores calm
- Provoke piracy in one system: its map row grows ~heat, confeds
  sortie THERE, the neighboring system's patrol stays cold
- After several A/B reports, the endpoint chart shows two lines --
  watch for the divergence pattern
- Fold the engine band, share the URL to PurtyGF: it opens folded

## v48 -- Phase 48 (six local tripwires get six local brains, the
## second endpoint gets a real seat -- at a higher table, the static
## report folds, and the thumb goes on trial)

1) PER-SYSTEM SERVED THRESHOLDS. Trade episodes carry their system
(the leg's destination, or where it died), the brain computes six
LOCAL pirated fractions and serves escortThresholds[6] through the
same learned-intercept curve -- with a floor: a system under 15
tagged legs falls back to the global fraction, because a tripwire
tuned on three data points is a coin toss wearing a uniform.
Untagged legacy entries feed only the global. Page-side, every
tripwire read goes local (read chain verified: array > scalar > 1.5
cold fallback), and the experiment jitter shifts ALL SIX uniformly
-- one coin, one contrast; shifting only some systems would blur
what the arm even means.

2) DURATION AS A GATED CO-PRIMARY -- promoted properly.
BRAIN_ESCORT_COPRIMARY=on (a new off/on gate; gateValue and the
POST validator both grew per-key value sets) raises BOTH bars to
2.24 -- Bonferroni's alpha split -- and a verdict is decisive if
EITHER endpoint clears its bar with raw/trimmed agreement, rate
winning direction ties as primary-among-equals. The tradeoff is in
the code: two chances to win, each harder -- that is the price of
not p-hacking. Decision matrix walked five ways, including the
newly instructive one: with the gate ON, a rate t of 2.1 that used
to decide NO LONGER CLEARS -- promoting the second endpoint costs
the first some power, visibly, as it must.

3) REPORT FOLD. The static file cannot re-render, so a small
embedded script toggles class-tagged rows per group on header
click. No persistence -- a static file's fold state dies with the
tab, honestly.

4) BIAS A/B -- the thumb on trial. ?biasab=1 under a duel: a coin
at each SET start arms a +0.15 pirate aggro thumb or leaves the set
clean; the set's winner ships with the arm it PLAYED under, the
coin re-flips, and the brain runs a two-proportion z on pirate win
rates at 10+ sets per arm. POWER STATED PLAINLY: a 25-point win-
rate thumb sits exactly at z=1.96 with 30 sets per arm (computed,
not guessed) -- the 10-set minimum will REPORT long before it can
DECLARE, and the milestone's "no significant effect yet" means
exactly that, not "no effect".

v48 validation: co-primary matrix (five cases incl. the power-cost
one); TH read chain + uniform jitter; bias-set arm integrity +
re-coin; two-proportion boundary case; all touched JS node --check
clean.

v48 rig checks:
- Concentrate piracy in Kruger: its served threshold drops below
  its neighbors' within a sweep; confeds sortie there at lower heat
- Flip BRAIN_ESCORT_COPRIMARY=on: the next A/B milestone's bar
  reads 2.24 and a marginal rate verdict goes quiet
- /ev?duel=1&biasab=1 for an evening: the bias verdict milestone
  arrives with honest n
- Click a report group header: the band folds; reload: it is back
  (as stated)

## v49 -- Phase 49 (six numbers become one glance, the thumb finds
## its minimal dose, the co-primary pattern becomes a stencil, and a
## column arrives for free)

1) PER-SYSTEM SPARKLINE (both consoles). The th diary's entries now
carry bySys, and the last entry renders as six inline bars -- taller
= LOWER threshold = hotter system, because the eye should find
trouble, not ceilings; bars under 1.2 go red. Hover a bar for the
system index and exact value; the min..max range sits beside it.
Live console and report twin share the geometry (verified monotone:
0.8 -> 14px, 2.5 -> 2px floor).

2) BIAS-MAGNITUDE LADDER -- dose-finding by down-titration. Gated
by BRAIN_BIAS_MAG_AUTO: a WORKS verdict shrinks the served thumb
0.05 (0.15 -> 0.10 -> 0.05 floor), hunting the minimal effective
dose; a non-detection AFTER a shrink -- at the same evidence bar,
so power is symmetric across steps -- steps back up and HOLDS: the
last working dose is the answer. Arms reset on every magnitude
change (era hygiene, as always). The page's experimental thumb now
reads the SERVED dose (field.biasABMag, found ?? current; 0.15 only
as cold fallback). Honest limit in the code: "not detected at this
n" triggers the step-back, not proof of no effect -- the design
accepts that asymmetry because a too-small thumb costs one era of
data, not a wrong conclusion carved anywhere.

HONEST STUMBLE, caught by the walk before it shipped: the original
step-back logic RECONSTRUCTED the previous dose as mag+0.05 -- and
0.1+0.05 is 0.15000000000000002 in IEEE, so the <=0.15 guard went
false and the minimal-effective-dose branch could never fire. The
fix records the working dose IN the shrink branch, where it is
sitting right there; never rebuild floats you already had. All
three dose-finding paths now walk clean: works-to-the-floor (MED
0.05), fails-first-shrink (MED 0.15), fails-second-shrink (MED
0.10).

3) CO-PRIMARY FOR THE DIFFICULTY A/B -- the v48 escort pattern,
generalized into a stencil. BRAIN_DIFF_COPRIMARY=on raises both
bars to 2.24 and lets hp-midband decide when duration cannot,
duration winning direction ties as primary-among-equals; raw and
trimmed must agree per endpoint. rc ONLY: the dungeon publishes no
hp, and a co-primary with no data is a wish -- the dgn twin stays
single-endpoint with that line as the reason, in the code. Null-hp
sessions simply do not join the arm arrays; the co-primary abstains
under 10 per arm and says so in the milestone.

4) TRADE SYS ON THE CSV -- zero code, and that is the point. The
v36 export's auto-columns are a sorted union of keys across
entries; sys joined the log in v48, so the sheet grew the column BY
DESIGN. Verified with mixed-era entries: legacy rows render the
column empty, tagged rows carry their system, pirated flags
interleave correctly. Sometimes the best patch is the one an old
decision already wrote.

v49 validation: sparkline geometry monotone with floor; three
titration paths (incl. the FP fix); co-primary abstention +
tie-break semantics inherited from the walked v48 matrix; auto-
column union on mixed eras; all touched JS node --check clean.

v49 rig checks:
- The console's EV band shows six bars; concentrate piracy in one
  system and watch its bar grow and redden within a sweep
- Gate BRAIN_BIAS_MAG_AUTO=adopt, run ?duel=1&biasab=1 across
  evenings: the titration milestones walk down and the MED lands
- Flip BRAIN_DIFF_COPRIMARY=on: the next rc difficulty milestone
  carries the hp-midband clause (or its honest abstention)
- /ai/brain/export.csv?file=trade: the sys column is just there

## v50 -- Phase 50 (the difficulty twins get a diary, the found dose
## goes on probation against a living control, the pilot gets the
## console's eyes, and the ev z waits honestly for its data)

1) DIFFICULTY ENDPOINT DIARY. The rc verdict now rings {ts, tDur,
tHp, nDur, nHp} (diff_ab_history.json, 500) and the report draws
the v47 pattern: duration t gold, hp-midband t cyan dashed -- with
BOTH bars, 2.0 dim and 2.24 fainter, because which bar applies
depends on a gate and the chart should not pretend to know which
era the reader is in. Structural point that mattered: the hp t is
now computed WHENEVER the data exists, hoisted out of the co-
primary gate -- so the diary records both endpoints regardless,
and flipping BRAIN_DIFF_COPRIMARY on later inherits history instead
of starting blind. Sparse diaries suppress the hp line under two
points rather than inventing one.

2) MINIMAL-DOSE DRIFT WATCH -- probation against a LIVING control.
The stencil, adapted: no baseline snapshot at all, because the off
arm keeps randomizing and IS the baseline -- the found dose must
keep beating the live contrast. Three consecutive non-significant
z's at 20+ sets per arm re-open the ladder: found cleared, mag held
at the found value, arms reset. A significant contrast anywhere in
the run breaks the streak (walked); under-n contrasts never count
(walked). Honest scope in the code: this watch only breathes while
?biasab=1 keeps flipping coins -- no experiment, no probation.

3) /EV HUD SPARKLINE. The canvas corner draws the same six bars the
console shows -- taller = lower = hotter, red past 1.2 -- with the
player's CURRENT system underlined in white, because the pilot's
first question is "here?". Same geometry as the console at 12px
(monotone verified, 2px floor).

4) EV SPLIT-VERDICT FIRST READING -- verified a rig task, and the
readout is already honest: the z-chart null-skips absent domains
with a two-point guard (confirmed by read), so the ev line APPEARS
only once both regimes have spoken -- no zero-flatline pretending
to be a verdict. The rig procedure is the checks below; nothing to
build is itself the finding.

One abort this phase, instructive twice over: the HUD sparkline's
first anchor guessed g.fillText(hud...) -- the /ev HUD is a DOM
div, not canvas text -- and the assert died with the file
unwritten. But the harness lesson rode along: the node --check
lines sat AFTER the heredoc rather than inside the && chain, so
they ran green against UNTOUCHED files -- an ALL-OK that verified
nothing. The re-run greps for the v50 markers BEFORE checking, so
the confirmation now proves the edits exist, then that they parse.

v50 validation: probation walk (streak break on returning effect,
sparse-n guard); HUD geometry monotone with floor; sparse-diary
line suppression; endpoint-hoist parse; all touched JS node --check
clean -- verified present-then-parsed.

v50 rig checks:
- Run rc sessions until two diffAB reports land: report.html grows
  the difficulty endpoint chart, hp line only if hp data flowed
- With a found dose and ?biasab=1 running, weaken the thumb by
  hand (BRAIN_EV_BIAS_PIRATE=-0.1 opposing it): three reports later
  the probation re-opens the ladder
- Fly /ev: six bars top-right, white underline follows jumps, the
  hot system's bar visibly taller and red
- Run /ev sessions under BRAIN_DOMAIN_SPLIT on then off; once both
  regimes hold ev data the z-chart's cyan line appears -- its first
  real reading is the phase-51 conversation

## v51 -- Phase 51 (the ladder writes its autobiography, the episodes
## say where, the sparkline answers "which one", and the stencil lands
## its third application)

1) DOSE-LADDER LIFE CHART. Every shrink/floor/med/reopen writes one
diary line (bias_mag_history.json, 300-ring, four magEvent call
sites riding the existing milestones) and the report draws the
biography: served magnitude as a STEP line -- verticals exactly at
events, verified on the path -- with markers on top: shrinks gold,
a found dose green, reopens red. Hover any dot for the event, dose,
and timestamp. One glance now answers "what has this ladder been
through".

2) PER-SYSTEM EPISODE ATTRIBUTION -- a SECONDARY readout, loudly so.
Episodes carry bySys (piracy counts per system, attributed at the
crime alongside the existing global count); the brain ingests the
array when well-formed; the report renders a six-row table of per-
system rates per arm -- captioned, in the header itself, with what
it is NOT: the randomization unit stays the global episode, and
nothing in the table is a test. It only shows WHERE the piracy
inside each arm's episodes landed, which is allowed to be
interesting without being inferential.

3) HUD SPARKLINE HIT-TEST. Hover (or tap -- a tap lands as one move)
a bar and it names itself: system name and served threshold, drawn
right-aligned under the bars. The hit rect math walked five ways
including the dead gaps between bars -- a chart that cannot answer
"which one is that" is decoration.

4) EV REGIME HP CO-PRIMARY -- the stencil's third application. The
ev session close now feeds regime_hp.json, one bucket per regime
(the regime is a launch flag, so every session this brain sees
belongs to exactly one bucket -- both buckets fill only across
launches, which is the split experiment's nature). With
BRAIN_DIFF_COPRIMARY=on, the ev line of the split verdict raises
its hit-z bar to 2.24 and lets an hp-midband Welch at the same bar
decide when hits cannot -- hits win direction ties, raw/trimmed
must agree on hp, and the clause abstains WITH ITS COUNTS when
either bucket is under 10. Other domains stay single-endpoint: no
hp data, and a co-primary with no data is still a wish (the v49
line, now cited twice, which is what stencils are for). Decision
matrix walked five ways including the power-cost case (z=2.0 no
longer clears when the gate is on).

v51 validation: regime co-primary matrix; ladder-life event
ordering; step-path verticals; hit-test rect incl. dead gaps; sys-
table rate arithmetic; all touched JS present-then-parsed (the v50
harness lesson, now the standing order of checks).

v51 rig checks:
- After a few ladder events, report.html shows the biography; a
  reopen dot should be rare and red
- Fly with piracy concentrated in one system: the sys table's lo/hi
  rates both spike THERE (and if lo's spike is visibly smaller,
  that is the escorts earning their keep -- observed, not tested)
- Hover each HUD bar: names and thresholds; the gaps stay silent
- Run ev sessions under each regime flag across restarts; once both
  buckets hold 10, the ev verdict line grows its hp clause

## v52 -- Phase 52 (the interesting table gets a test that owns its
## flaws, the console learns the ladder's latest, the co-primary
## becomes one code path with per-domain data, and an axis learns to
## stretch)

1) SYS-TABLE CHI-SQUARE -- a real test with the warnings AS PART OF
THE STATISTIC, not a footnote. 2x6 contingency on raw counts, df=5
against 11.07, and the same line that reports the number owns three
caveats in one breath: it is SECONDARY/exploratory (a hit invites a
pre-registered follow-up, never a conclusion); piracy events CLUSTER
within episodes, so independence is violated and the test runs
anti-conservative -- too eager, and it says so; and expected cells
under 5 get counted and called out as approximation-breaking.
Validated against hand arithmetic: uniform world lands chi2=0.00
exactly, a skewed world clears the bar with its low cells flagged,
and one cell recomputed by hand matches to the digit (8.93).

2) LADDER-LIFE ON THE CONSOLE (both twins). A "Bias dose ladder"
row in the EV band: state (titrating at mag / MED found / probation
streak), the LAST diary event inline with its age ("shrink@0.10,
2h ago"), and the next gate in the ladder's own words. The report
keeps the biography; the console carries the latest sentence.

3) REGIME HP PER-DOMAIN -- the co-primary is now ONE code path fed
by per-domain data. regime_hp.json holds {dom: {split, shared}};
the v51 ev-only file LIFTS into .ev on load (walked: no data lost,
new shape passes through, empty file stays empty). Raycaster joins
for free -- its session close already computed hpMidband; the data
was one push away. The DUNGEON stays out, and the code says exactly
why where the null lives: its wire format carries no hp -- the gap
is ENGINE-side (the dungeon page would need to sample player hp
into its snapshot the way the raycaster does), named and waiting on
data, not paper.

4) DOSE-CHART AUTO-RANGE. The v51 axis hardcoded 0.03..0.17 to the
ladder it happened to know; a wider ladder would have clipped
silently. Now: observed range padded 0.02 each way, span floored at
0.04 so a flat life draws mid-chart instead of dividing by zero
(both cases walked).

One abort this phase, and the ritual caught a TWIN: the rc
telemetry-write anchor matched TWICE -- the dungeon session close
writes the identical block -- so the assert died with the file
unwritten. The re-anchor leads with the rc-specific rec tail
(hpMidband from rcSession), which exists in exactly one place. The
same lesson as v35's substring collision, one layer up: identical
CODE twins are anchors' natural predators; disambiguate with the
bytes that made the site unique in the first place.

v52 validation: chi-square vs hand arithmetic (exact cell match);
legacy lift walk; auto-range flat + wide; ladder-row rendering
paths; all touched JS present-then-parsed.

v52 rig checks:
- With bySys data flowing, the sys table grows its chi-square line;
  read the caveats once out loud, they are the deliverable
- The console's EV band shows the dose ladder's latest event; age
  ticks up between refreshes
- Run raycaster sessions under both regime flags; regime_hp.json
  grows a .raycaster key and the rc verdict line can earn its hp
  clause
- Hand-write a wide bias_mag_history (0.05 and 0.4 events): the
  dose chart stretches instead of clipping

## v53 -- Phase 53 (the dungeon finally says how it feels, the live
## row carries the starred number, the shuffle keeps the episodes
## whole, and the biography gets a silhouette)

1) DUNGEON HP PUBLICATION -- the v52 gap, closed the day the data
arrived. The publication rides the wire that already flows: both
dungeon outcome posts gain an hp field using the same canonical
read as the window.dungeon.hp() getter (fpsShooter health when the
shooter drives, _playerHP otherwise -- parity checked: 0.62 -> 62,
td-mode 45 -> 45). The brain samples o.hp per outcome, the rc
midband pattern verbatim (bounds walked: 24 out, 25 in, 75 in, 76
out), the dgn rec's hardcoded null becomes a computed hpMidband,
and regimeHpPush("dungeon", ...) means the v52 one-path co-primary
LIGHTS UP BY ITSELF -- all three domains now feed buckets through
the same function. The dgn difficulty A/B also starts collecting
armsHp now (arriving at the phase-54 verdict wiring with data beats
arriving with a wish); both stale "dungeon stays out" comments
updated where they live.

2) CHI-SQUARE ON THE LIVE CONSOLE. The escort row's evidence
carries "sys chi2=12.3*" when computable (12+ events), starred past
11.07, and captioned in-line with where the honest test lives: the
report. The console gets the number; the report keeps the caveats
and the permutation.

3) EPISODE-CLUSTERED PERMUTATION TEST -- the honest fix, built. Arm
labels shuffle across WHOLE episodes (each episode's bySys travels
intact -- the inference unit matches the randomization unit), the
chi2 statistic recomputes per shuffle, p = fraction of shuffled
worlds at least as extreme (+1 smoothing). The clustering violation
the chi-square confesses to simply does not arise: whatever
dependence lives inside an episode moves with it. Calibrated on
known worlds: null p=0.605 (quiet), planted 70%-sys0 skew p=0.002
(caught). The report line says which number to trust when the two
tests disagree -- this one.

4) MICRO STEP-CHART ON THE LIVE LADDER ROW. The biography's
silhouette inline: an 80px step-path of served magnitude with
event dots (shrink gold, found green, reopen red), titles carrying
the detail on hover -- the sparkline pattern reused, auto-ranged
with the v52 axis rules.

v53 validation: hp-read parity + midband bounds; permutation
calibration on null and planted worlds; chi threshold star; step-
path geometry shared with v52's walked rules; all touched JS
present-then-parsed.

v53 rig checks:
- Play the dungeon (either mode): dgn telemetry milestones now
  quote a real hp mid-band; regime_hp.json grows .dungeon
- The escort console row grows its starred chi2 once bySys events
  pass 12
- report.html: the permutation p sits beside the chi-square; if
  they disagree, believe the permutation (the line says so)
- The dose ladder row shows the silhouette; hover the dots

## v54 -- Phase 54 (the third difficulty co-primary lands, the honest
## p reaches the live row, the dungeon's sessions get their strip, and
## a proposed fix gets REFUSED with the proof attached)

1) DGN DIFFICULTY CO-PRIMARY VERDICT -- the rc stencil's third
difficulty application, wired now that v53's armsHp has had a phase
to pool. Same BRAIN_DIFF_COPRIMARY gate (one methods switch for
both difficulty A/Bs), same 2.24 Bonferroni bars on both endpoints,
same duration-wins-direction-ties, same abstain-under-10 WITH the
counts in the milestone. The seam checked: with the gate off, the
original agree2 (and its trimmed-abstains note) flows untouched;
gate on, an hp-decided verdict carries its "(decided by hp-midband
co-primary)" tag into the milestone.

2) PERMUTATION P ON THE LIVE ROW -- cached, stamped, honest about
being a cache. The report cannot be asked to run 500 shuffles per
3-second console refresh, and does not pretend to: at render it
writes sys_perm_cache.json {ts, p, B, nEps}, and the live escort
row appends "perm p=0.041 (as of <mtime>, n=38 ep)" -- the number,
its age, and its evidence base, in one clause.

3) DUNGEON HP STRIP (report). hp mid-band fraction per dungeon
session through the shared stripBand, MAD rings flagging freak
sessions. PREREQUISITE FIXED FIRST: rc and dgn write the SAME
telemetry file with -- after v53 -- indistinguishable rec shapes;
both closes now stamp dom tags, and the chart admits only tagged
rows, because pre-tag rows are mixed history no chart should claim.

4) EXPOSURE NORMALIZATION -- A FIX REFUSED, WITH THE PROOF. The
hook worried the chi-square was "fair only when arm exposures are
close." Validation FALSIFIED the worry: chi-square with count
margins is scale-invariant by construction -- margins absorb
uniform scaling -- so equal shapes under double (or 10x!) exposure
land chi2 = 0.00 exactly, walked on three worlds. An exposure-
weighted expected WAS built and tested, and it does something
worse than nothing: it CHANGES THE NULL to "equal per-system
rates," conflating the distribution-profile question (this table's)
with the rate-level question (the primary A/B's). Reverted, with
the finding as a comment where the temptation will next arise and
a plain-language line in the report itself. Sometimes the
deliverable is the reason the code did not change.

Also this phase, answered from the codebase: WAD FPS is brain-
integrated VIA THE KAIJU PATH (spawnThingsAsKaiju turns Doom
monster placements into live kaiju -- roster, aggro, served
attacks, training, all for free); there is no separate wad domain.
Counterstrike does not exist in this codebase (the "counter" hits
are counter-missiles); wiring a CS-like game is the v39/v40
recipe -- id prefix, domainOf clause, three list entries, its own
head -- one phase, on request.

v54 validation: co-primary seam (gate off/on, note passthrough);
exposure invariance three worlds incl. 10x scaling; real-skew
detection preserved; dom-tag filter; all touched JS present-then-
parsed.

v54 rig checks:
- Flip BRAIN_DIFF_COPRIMARY=on and play dungeon sessions: the dgn
  milestone grows its hp clause (or its honest abstention counts)
- Regenerate the report, then open the console: the escort row
  carries the cached perm p with its as-of age
- report.html: the dungeon hp strip renders once 5 tagged sessions
  exist; older mixed rows stay out
- Read the exposure-finding line in the report once -- the refusal
  is the deliverable

## v55 -- Phase 55 (the diary learns both dialects, the cached p
## admits its age out loud, and two surveys return -- one blocked by a
## missing file, one finished with a dormant one-liner)

1) ENDPOINT DIARY FOR DGN -- decided at the read, as the hook
offered: ONE file, a dom COLUMN (tags beat filenames -- one reader,
and the v36 auto-column export unions it for free). The rc write
gains dom:"raycaster", the dgn verdict gains its twin write
(dom:"dungeon", tvHp54/armsHp counts riding), and the report's
endpoint chart splits into two at the read -- with the legacy lift:
untagged rows go to raycaster, because only rc wrote before the tag
existed; the lift is history, not a guess (walked: 2 rc incl.
legacy, 1 dgn).

2) PERM-CACHE STALENESS GUARD -- the v36 amber pattern. A cached p
under fresh episodes now says so louder: when escort_ab.json moved
more than 10 minutes after the cache was computed, the live row
grows an amber clause -- how many minutes the data outran the
number, the episode-count drift when it shows (38 -> 51 ep), and
the remedy ("regenerate the report"). Cache-newer-than-data stays
quiet (walked both ways).

3) WAD-ENCOUNTER TAGGING -- SURVEYED, BLOCKED, NAMED.
tools/wadThingSpawner.js is NOT in this bundle (verified: no tools/
directory; main.js imports it dynamically at runtime from the real
engine tree). A tag placed here would be a tag placed on bytes we
cannot read -- the assert-anchored ritual has no anchor. The task
is engine-side and precise: in spawnWadThingsAsKaiju, stamp the
spawned kaiju (a wad flag on the entity or a "wad-" id namespace --
the latter rides domainOf's kaiju fallthrough untouched), and the
podium/verdict splits follow the v43 game-tag recipe. One file, one
stamp, next time the real tree is in reach.

4) FPS-SHOOTER DOMAIN -- SURVEY COMPLETE, WIRING DEFERRED ON
PURPOSE. The survey says: fps sessions are NOT distinguishable
today (they ride dgn- ids through the dungeon's two outcome-push
sites), but they are ONE EDIT from distinguishable --
id: (window.fpsShooter?.active ? "fps-" : "dgn-") + srcId. The
reason not to flip it now is a real one: mid-era, the shooter's
sessions would walk out of the dungeon A/B's arms, forking the
experiment the arms are mid-way through. The dormant marker sits at
the push site with the full recipe (flip + domainOf clause + three
list entries + its own head) for the next dungeon-experiment reset.
Survey first, wire second -- the hook's own words, honored
literally.

One abort this phase, and the checks earned their keep TWICE: the
DungeonDemo anchor matched two identical push heads (count=2, assert
died) -- and because the script's report.js write sat AFTER the
dungeon block, present-then-parsed showed report.js at ZERO markers
despite a clean parse. Two files were quietly unwritten; the greps
said so before anything shipped. Fix: anchor off the unique hit:0
variant, write the stragglers, re-verify. Write order inside patch
scripts now follows dependency order: each file written immediately
after its own edits.

v55 validation: legacy-lift bucket walk; staleness both directions;
dom-column round-trip; all four touched files present-then-parsed.

v55 rig checks:
- After rc AND dgn verdicts land, report.html shows two endpoint
  charts, the rc one carrying pre-v55 history
- Age the perm cache past 10 min of fresh episodes: the amber
  clause appears with the ep-count drift
- Read the dormant fps marker at the next dungeon reset -- it is
  the work order
- When the real engine tree is open: the WAD stamp, one file

## v56 -- Phase 56 (the report wears one honest clock, the dgn diary
## reads for real through the real code, fps stands wired-and-dormant,
## and the ladder's diary reaches Excel)

1) STALENESS AUDIT + AGE BANNER. The audit's method was the
finding's proof: the whole report ran under a Deno SHIM (every file
read intercepted live), demonstrating that every chart reads its
source fresh at render -- no within-report readout caches another
compute; the only cache-shaped artifact (sys_perm_cache) is written
FOR the console, never read back. So the aging axis is the DOCUMENT
itself, and it wears exactly one banner: "report generated N min
ago," ticking client-side, ambering past 30 minutes with
"regenerate" spelled out. One clock, because there is one cache.

2) DGN DIARY FIRST READING -- a rig task executed as a SMOKE, not a
replica. The real report.js ran under the shim against a synthetic
mixed-dom diary (one legacy untagged row, one tagged rc, two dgn):
4.4KB of html captured, BOTH dialect charts present, rc before dgn,
the legacy row lifted into rc exactly as v55 promised. Getting
there took four shim iterations (module path, snapshots-dir guard
via async readDir, async writeTextFile) -- each missing Deno API
named by the crash, none guessed. The rig's own first reading still
wants real verdicts behind it; the code path is now proven wiring,
not hoped wiring.

3) FPS DOMAIN -- WIRED AND DORMANT, the reset-gated design. Brain
side is COMPLETE: the domainOf clause, all three verdict/readout
lists, and all FOUR head loops (init/trainers/step/save) speak fps;
until ids flow, every fps row renders empty -- the ev precedent.
Engine side sits behind ONE boolean (FPS_DOMAIN_SPLIT=false) wired
through both push sites via FPS_ID_PREFIX(); the work order at the
site says the flip and the dungeon reset are ONE act. Truth table
walked: dormant+shooter still says dgn-, flipped+td says dgn-,
flipped+shooter says fps-, and wad- ids still fall through to
kaiju untouched.

4) LADDER-LIFE EXPORT. ?file=bias_mag_history joins the whitelist
-- array shape, so the v36 auto-columns (ts/ev/mag) come free. One
line, as the hook priced it.

THREE aborts this phase, and the third was the teacher: (a) a list
count died at 4-vs-3; (b) I "corrected" it to 4 from the error
message WITHOUT re-grepping disk, and died again at 3-vs-4 --
because the two asserts were DIFFERENT counts and I had misread
which line fired; (c) ground truth found the real story: the head
loops number FOUR (init/trainers/step/save -- v40's own words!),
and the original survey's `head -12` had truncated the fourth site
off the screen. Two standing lessons written in blood-adjacent ink:
error-message archaeology is not verification -- re-grep the disk;
and never let a pipe's head-limit stand in for a count.

v56 validation: shim-proven fresh reads; real-code first reading;
prefix truth table + routing table; four-loop count against disk;
all touched JS present-then-parsed.

v56 rig checks:
- Open report.html, wait 31 minutes (or edit data-ts): the banner
  ambers with the regenerate line
- At the next dungeon reset: flip FPS_DOMAIN_SPLIT, delete
  difficulty_ab_dgn.json, play shooter sessions -- the fps rows
  wake up across console, verdicts, and T sweeps with zero further
  edits
- /ai/brain/export.csv?file=bias_mag_history in Excel: ts/ev/mag
- The next real report generation: both endpoint charts, live data

## v57 -- Phase 57 (the fps head gets its birth certificate, the
## report gets a front door with a clock on it, the diaries shrink onto
## the live rows, and the shim lessons move into the repo)

1) FPS HEAD WARM-START -- DECIDED IN WRITING, before any flip, as
the hook demanded. The decision: fps births as a CLONE OF THE
DUNGEON'S TRAINED HEAD -- not kaiju's, not fresh. Reasons ranked in
the code where the birth happens: (1) the shooter's enemy-side
decision problem IS the dungeon's -- same monsters, same attack
space, only the camera differs; (2) months of dgn training beat a
cold start on fps's sparser traffic; (3) the drift/verdict
machinery exists precisely to catch an imported bias that does not
fit -- a wrong prior is correctable, a wasted prior is not. Chain:
saved fps > saved dungeon > kaiju, read from SAVED weights (not the
freshly built sibling) so loop order cannot bite. Birth announced
in the boot log. Truth table walked all three rungs.

2) REPORT LINK WITH ITS AGE -- and the hook smoked out a GAP, not a
label: the console had NO route to the report at all (audited: no
link, no serving route -- the report was reachable only by
filesystem). Now: GET /ai/brain/report serves the static file (404
honest when none generated), and the console header carries the
link WEARING ITS AGE -- mtime read per refresh, "12 min old" in
cyan, amber past 30 minutes (the report's own v56 banner threshold)
with "regenerate for live decisions", and an honest absence line
when no report exists yet.

3) MICRO ENDPOINT TWINS ON THE LIVE ROWS. Both difficulty rows'
evidence cells open with an 80px twin of the v50 diary -- tDur gold,
tHp cyan dashed, hover titles with the latest values -- per dom,
with legacy untagged rows lifted to raycaster (the v55 rule,
applied at a second read site without a second rule).

4) SMOKE HARNESS PROMOTED: tools/smoke-report.mjs, with all four
v56 shim lessons ENCODED AS COMMENTS at the top (repo-relative
import; async readDir for the snapshots guard; async writeTextFile;
and the subtle one -- unshimmed files must THROW so charts fall to
their catch{}, because returning "" would feed them garbage
silently). Run from the repo it goes green: 5.2KB html, both
dialect charts, order held, legacy lift confirmed. Exit codes make
it CI-shaped. (The smoke's stray report.html removed from the
bundle -- artifacts of tests are not deliverables.)

v57 validation: birth-chain three rungs; smoke green FROM THE REPO
FILE; route + 404 path; micro-twin injection into both rows'
evidence cells; all touched JS present-then-parsed.

v57 rig checks:
- Delete weights_attack_heads.json's fps entry (or first boot after
  the flip): the boot log announces "fps head born from the
  DUNGEON's trained head"
- Open the console: the report link shows its age; regenerate the
  report and refresh -- the age resets
- Both difficulty rows carry the micro diaries once 2+ reports
  exist per dom
- node tools/smoke-report.mjs on the rig: SMOKE GREEN

## v58 -- Phase 58 (the smoke learns to expect nothing, the served
## report locks its doors from the inside, the flip-day gets a finger
## to follow, and n reaches the last 80 pixels)

1) SMOKE SCENARIO B -- the negative case, half a test suite. The
harness now runs the real report twice: mixed diary (both charts,
order, legacy lift -- the v57 green) and EMPTY diary, where the
charts must VANISH without a crash and the html must still build
(3.6KB of chartless report, verified). Shim lesson #5 joined the
ledger: ESM caches imports, so the second run must cache-bust with
a ?scenario= query or it silently replays the first -- a test that
cannot fail is not a test.

2) CSP ON THE SERVED REPORT -- one line, precise about its own
compromise: the report's banner and fold toggles are INLINE scripts
by design, so script-src 'unsafe-inline' is required, not lax. The
win is default-src 'none': nothing external can load, fetch, frame,
or run -- the report locks every door except the one it built.
Directive string parsed and sanity-checked.

3) FPS FLIP-DAY RUNBOOK -- a STANDING section at the top of this
file (above the phase log, where a finger will find it), seven
steps from stop-everything to cross-it-off, with the two VERIFY
gates that matter: the boot-log birth line (and what it means if it
says kaiju), and the console fps rows waking on the first shooter
session while dgn rows still move on a TD session.

4) MICRO-TWIN TITLES GAIN n. The 80px diaries' hover titles now
read "tHp latest 2.6 (n=18)" -- the v19 line earns its third
citation: significance without n is theater, even at 80 pixels.
Missing n renders "?" rather than pretending.

v58 validation: two smoke scenarios green from the repo file
(positive AND negative); CSP directive parse; n-title fallback;
all touched JS present-then-parsed; test artifact cleaned from the
bundle again.

v58 rig checks:
- node tools/smoke-report.mjs: SMOKE GREEN x2
- curl -sI the report route: the CSP header rides; the banner still
  ticks in the browser (inline allowed, as designed)
- Hover a micro diary: n in the title
- Read the runbook top-of-file once now, then leave it for flip day

## v59 -- Phase 59 (the smoke meets hostile input, the console locks
## its doors too, the flip gets a tested script, and probation becomes
## three dots)

1) SMOKE SCENARIO C -- corrupt diary, the other half of the
negative case. A truncated JSON string feeds the shim: the read
SUCCEEDS, JSON.parse THROWS inside the chart's try, the catch eats
it, the charts vanish, the html still builds (3.6KB, chartless,
identical footprint to the empty case -- garbage and nothing should
look the same from outside, and they do). SMOKE GREEN x3.

2) CONSOLE CSP -- the v58 one-liner with ONE extra door, named: the
console runs more script than the report (refresh loop, gate
setters, undo/redo, canvases -- all inline by design), and its gate
buttons FETCH back to the bridge, so connect-src 'self' joins the
carve-outs. Everything else stays default-src 'none'.

3) FLIP SCRIPT -- runbook steps 2-3 as tools/fps-flip.sh, TESTED ON
A THROWAWAY COPY before shipping (boolean flipped, AB file gone,
originals untouched). The script's own header says what it will
not do: steps 4-6 stay human eyes, because a script cannot verify
what a verdict means. The runbook's step 2 now points at it.

4) PROBATION STREAK GLYPH. The dose row's state reads "MED found:
0.10 ●●○" -- three dots filling as quiet contrasts accumulate,
hover title spelling out that 3 = re-open, clamped above 3 (which
never renders anyway: at 3 the ladder re-opened and found cleared).
Truth table walked 0 through 5 plus undefined.

v59 validation: smoke x3 from the repo file; flip script exercised
end-to-end on a copy; glyph truth table; CSP directive shape; all
touched JS present-then-parsed; test artifacts cleaned twice.

v59 rig checks:
- node tools/smoke-report.mjs: GREEN x3
- curl -sI /ai/brain/console: the CSP header rides; gate buttons
  still work (connect-src 'self' is the door they use)
- On flip day: sh tools/fps-flip.sh, then eyes on steps 4-6
- Let a found dose take two quiet contrasts: ●●○ on the row

## v60 -- Phase 60 (the console gets covered the honest way, the flip
## script learns to refuse, unknown doms get their own charts, and the
## dots reach the twin)

1) CONSOLE UNDER SMOKE -- via its TWIN, with the full-boot tar pit
mapped so nobody re-digs it. The attempt is the record:
server.js entangles bundle-absent runtime modules at require time
(ws -> twitchClient -> twitchEventSub -> discordVoice ->
wadGeometry/wadTextures -> aiCreds), each throw aborting startup
BEFORE listen() despite the continuing exception handler. Stubbing
them is a foot-gun twice over: a plain Proxy breaks `new
TwitchClient()` (arrows are not constructors), and a truthy-
everywhere universal stub feeds any poll loop forever -- one pegged
the sandbox flat. And `timeout node server.js` kills node but NOT
its spawn tree; a drain loop of those orphaned enough children to
starve the box twice. All three hazards are named in
tools/smoke-console.sh's header. The RESOLUTION: the report embeds
the console's twin table, so the shared logic is now under the
shim smoke (marker, both group bands, and the as-of column -- the
v46 repair now has a regression guard); the live-route wrapper
gets tools/smoke-console.sh, a curl-assertion script for the RIG,
where twitch and wad and creds actually exist. Logic tested where
it lives; wrapper tested where its dependencies live.

2) FLIP PRE-FLIGHT -- and a near-miss owned. The script now refuses
when anything answers on :8787 (flipping under a live system leaves
the loaded boolean stale and the deleted A/B resurrectable from
memory on the next save -- the refusal message says why). REFUSE
path tested against a fake listener in a throwaway copy: exit 1,
boolean untouched. The near-miss: testing the PASS path, I ran the
script against the DELIVERABLE tree (the sandbox has no bridge, so
pre-flight passed and flipped the real boolean); reverted, parsed,
and the standing rule gains a clause: destructive scripts get
exercised on copies ONLY -- both paths, not just the scary one.

3) SCENARIO D -- unknown doms chart, stated. The report's dom loop
now appends any dom it discovers ("tank", the already-wired "fps",
whatever comes) AFTER the known two, sorted, each with its own
chart -- bucketed somewhere STATED, never vanished silently into
rc's history. The smoke asserts a planted "tank" dom renders after
raycaster. SMOKE GREEN x4 + twin.

4) DOSE GLYPH TWIN. The report's ladder row wears the same three
dots as the live row, same hover title. Twins stay twins.

v60 validation: smoke x4 + console-twin assertions; refuse path on
a fake listener; revert verified parsed; forward-compat dom walk;
all touched JS present-then-parsed; scratch trees and orphan
processes purged.

v60 rig checks:
- node tools/smoke-report.mjs: GREEN x4 with the twin block
- sh tools/smoke-console.sh against the live bridge: GREEN
- sh tools/fps-flip.sh with the bridge RUNNING: REFUSED
- report.html ladder row: the dots match the console's

## v61 -- Phase 61 (the smoke joins the ship ritual as a gated step,
## the flip learns to un-oops, the diary-only doms get honest rows, and
## the half-empty case closes the scenario ladder)

1) VERIFY STEP, LIVENESS-GATED. verify.mjs lives engine-side (not in
this bundle -- surveyed, the tools/ story again), so the step ships
self-contained: tools/verify-step-console.mjs probes the bridge
with a 2s abort; ALIVE -> smoke-console.sh runs and its verdict
PROPAGATES (a red console fails the ship); DOWN -> "SKIP -- not a
failure", exit 0, because an offline bridge is a normal ship-time
state. The rig's verify.mjs wires it in one execSync line, quoted
in the file's header. The SKIP path was exercised here (no bridge
in the sandbox -- for once the sandbox's poverty was the fixture).

2) FLIP BACKUP. One cp to difficulty_ab_dgn.json.bak before the rm
-- deleting the A/B history is the point; losing it forever is not.
The script's output now carries the restore recipe (cp back +
re-flip the boolean), and the runbook's step 3 notes the net.

3) DIARY-ONLY ROWS ON THE LIVE CONSOLE. Doms the diary knows but
the A/B machinery does not (a woken fps, a future tank) now get a
row: the micro twin, the entry count, and an HONEST state --
"diary-only (no A/B machinery for this dom)" with the next gate
reading "wire arms + verdict when this dom earns them." Filed under
the engine band with the filing decision stated in code: every
diary dom so far is an engine game; revisit when that stops being
true. The micro57 helper was already dom-generic -- v57's
parameterization paid out unmodified.

4) SCENARIO E -- the half-empty case, closing the gap between B
(nothing) and D (something strange): a diary where every tHp is
null must draw the tDur line and SUPPRESS the hp line in the same
chart. The titles carry the key names, so presence/absence IS the
assertion: tDur (latest...) present, tHp (latest...) absent,
chart header present. SMOKE GREEN x5.

v61 validation: SKIP path live-exercised; smoke x5 incl. the
half-empty; flip script syntax + backup guard; diary-only row
rendering path; all touched JS present-then-parsed; artifact
cleaned.

v61 rig checks:
- Add the one-liner to verify.mjs; ship once with the bridge UP
  (step runs, PASS) and once DOWN (SKIP, ship proceeds)
- Flip day: confirm the .bak lands beside the deleted file
- Hand-plant a tank entry in the diary: the console grows its
  diary-only row with the micro twin
- node tools/smoke-report.mjs: GREEN x5

## v62 -- Phase 62 (both smokes stand in the ship line, backups stop
## eating each other, the twin table matches the live one, and
## corruption learns to stay in its lane)

1) VERIFY STEP FOR THE REPORT SMOKE -- the v61 pattern minus the
probe, because this smoke needs no bridge: run, propagate. The
rig's verify.mjs now has TWO one-liners to add (report step
unconditional, console step liveness-gated), both quoted in their
headers. Exercised here: PASS.

2) .BAK ROTATION. Every flip keeps ITS OWN backup --
difficulty_ab_dgn.json.bak.YYYYMMDD-HHMMSS -- so a second flip
cannot eat the first flip's months of arms. The restore recipe in
the script's output picks the LATEST by mtime (`ls -t | head -1`).

3) DIARY-ONLY ROWS, REPORT TWIN -- with the divergence DECIDED, not
drifted: the report's rows are TEXT-ONLY ("N diary entries (chart
below)"), because the full-size unknown-dom charts already render
just beneath the table (v60) -- a micro there would duplicate its
own neighbor. Twins stay twins in CONTENT; presentation may differ
when the page around them differs, and the decision is written
where the code diverges. Bonus caught in the smoke's byte counts:
scenario D grew 5190 -> 5394 bytes because the planted tank now
ALSO earns its twin row -- the new code exercised by the old
scenario, free.

4) SCENARIO F -- per-dom resilience. One healthy dom beside one
whose entries lack tDur entirely: the healthy chart unaffected
(tDur draws), the sick dom's chart draws what it HAS (tHp) and
suppresses what it lacks -- corruption stays in its lane instead
of taking the file down with it. Assertions slice the html per
chart so the checks cannot cross-contaminate. SMOKE GREEN x6.

v62 validation: both verify steps exercised (report PASS, console
SKIP from v61); rotation naming + latest-restore recipe; smoke x6
with per-chart slicing; twin rows firing inside scenario D; all
touched files present-then-parsed; artifact cleaned.

v62 rig checks:
- verify.mjs gains both one-liners; one full ship with the bridge
  up runs report-PASS + console-PASS
- Two flips a minute apart: two .bak files, distinct stamps
- Plant a tank diary entry: BOTH consoles show the diary-only row,
  the report's pointing at its chart below
- node tools/smoke-report.mjs: GREEN x6

## v63 -- Phase 63 (the ledger learns to read itself, the backups
## learn to stop, the two linked decisions learn each other's address,
## and the verify steps learn to whisper)

1) SCENARIO LEDGER SELF-CHECK. The smoke reads its OWN source and
counts: header scenario lines vs runScenario calls. Documentation
that can rot now checks -- a mismatch goes RED with a message
naming the desync. Exercised BOTH ways: 6/6 matched green, and a
phantom "scenario G" header line planted in a copy went RED at 7
vs 6. A self-check that cannot fail is not a self-check; this one
was made to fail before it shipped.

2) .BAK PRUNING -- CAP = 5, stated in the script. One ls -t | tail
-n +6 | xargs rm line: the newest five survive, the sixth flip
retires the oldest. Tested on seven planted backups: five remained,
the two oldest gone, newest untouched.

3) LINKED DECISIONS, CROSS-REFERENCED AT BOTH ADDRESSES. The v62
text-only rows exist BECAUSE the full charts render on the same
page; each site now carries a note pointing at the other ("change
one, visit the other"), so the day someone moves or drops
diffEndpointChart, the rows' obligation to inherit micro twins is
written where they will be standing. Decisions that depend on each
other should not depend on memory.

4) --QUIET FOR BOTH VERIFY STEPS -- with the failure exception
designed in: quiet captures the smoke's narration and prints ONLY
the verdict line (machines want one line), but a FAIL dumps the
captured story to stderr first -- because the human debugging a
red wants exactly what quiet suppressed. Exercised: report-PASS
one line, console-SKIP one line.

v63 validation: ledger green AND red (phantom line); prune 7 -> 5
with the right survivors; quiet PASS + quiet SKIP; cross-refs at
both sites; all touched files present-then-parsed; negative-test
copies cleaned.

v63 rig checks:
- verify.mjs one-liners gain --quiet; a CI-style ship log shows
  two verdict lines and nothing else
- Six flips over time: the backup directory holds exactly five
- Add a scenario without its header line (or vice versa): the
  ship goes RED at the ledger, not at a human's memory
- Read both LINKED DECISION notes once so they are known to exist

## v64 -- Phase 64 (the prose gets its own lint table, the sh smoke
## learns the whisper rule, and retirements get named)

1+4) DOC LINT -- hooks one and four merged into ONE file on purpose:
tools/lint-docs.mjs is the v38 lint-table pattern applied to PROSE,
holding two contracts a grep can enforce. CONTRACT 1: the runbook's
numbered steps must run contiguous 1..N -- a deleted step leaves a
gap nobody counts by hand; a runbook absent entirely passes ONLY if
marked CONSUMED (its designed end state). CONTRACT 2: the LINKED
DECISION markers in report.js are a PAIR, "(1/2)" and "(2/2)"
exactly once each -- the cross-reference itself can rot, so it is
held. Both contracts exercised RED on copies before shipping: a
step renumbered 4 -> 9 caught ([1,2,3,9,5,6,7] not contiguous), a
broken pair caught ((2/2) x0). One execSync line wires it into
verify.mjs, quoted in the header.

2) -q FOR smoke-console.sh -- the verify steps' whisper rule
brought down to the sh layer: diagnostics accumulate through say()
(silent under -q), and fail() dumps the accumulated story to
stderr BEFORE the RED line -- so quiet failures still hand the
human everything quiet suppressed. Exercised against a dead port:
one RED line, no noise (and nothing to dump, because nothing had
been diagnosed yet -- the dump is honest about being empty).

3) PRUNE ECHOES. Each retirement is named: "retired old backup:
<file>" -- silent pruning was correct, but one echo answers "where
did my backup go" before it becomes a question. Exercised on seven
planted files: two named retirements, five survivors.

v64 validation: lint green + both contract REDs on copies; -q fail
path; prune echoes with survivor count; all touched files parsed
or sh -n'd; test copies cleaned.

v64 rig checks:
- verify.mjs gains the lint one-liner; break a cross-ref on
  purpose once to watch the ship go RED at the right line
- On flip day #6: the retirement echo names the oldest backup
- sh tools/smoke-console.sh -q against the live bridge: one line
- After consuming the runbook, mark it CONSUMED -- the lint knows
  the difference between finished and missing

## v65 -- Phase 65 (the headers police their own order, the smoke
## reads past the bands, curiosity becomes free, and the ritual gets
## one front door)

1) CONTRACT 3 -- phase headers monotonic. lint-docs now extracts
every "## vNN --" header and asserts strict increase: 63 sections,
v2..v64, in order. Exercised RED on a copy with v63/v64 swapped --
caught with the message naming the crime ("a section was pasted
into the wrong place"). Forty headers is past what anyone re-reads;
the ledger trick holds it instead.

2) ROW-CONTENT DIAG -- with the conditionality DECIDED, not
tripped over: "Bias dose ladder" renders only when its state file
exists, so asserting it would fail a fresh rig; the two
UNCONDITIONAL rows ("Trader boldness (T ladder)", "Escort threshold
(randomized)" -- both render "not started" states on an empty
brain) are asserted instead, and the smoke's comment says why the
dose row is deliberately absent from the checks. A render
regression past the bands now has two tripwires.

3) --DRY-RUN FOR THE FLIP -- v60's near-miss, answered. Every
mutating action routes through run(), which under --dry-run prints
"[dry] would: ..." and touches nothing; the CLOSING WORDS match the
mode too (a dry run must not claim a flip -- caught in review, the
first pass's trailing echoes lied). Exercised on a copy with
planted state: three would-lines, boolean unflipped, A/B file
intact, "nothing was changed."

4) VERIFY-ALL -- the ship ritual's single entry point, with the
semantics that matter stated: it runs EVERY step even after a red
(a ship wants the full damage report, not the first casualty),
collects failures, exits nonzero naming them. --quiet passes
through to the steps that speak it. Exercised green (lint + report
PASS + console SKIP) and red (broken lint in a copy: the other
steps still ran, then "[verify-all] RED: lint-docs failed"). One
execSync line replaces three in verify.mjs.

v65 validation: contract-3 both ways; dry-run zero-touch on
planted state; verify-all green AND damage-report red; closing-
words honesty fix; all touched files parsed or sh -n'd; copies and
artifacts cleaned.

v65 rig checks:
- verify.mjs swaps its lines for the ONE verify-all call
- sh tools/fps-flip.sh --dry-run any day, free
- Break something small before a real ship once: watch the full
  damage report list every red, not just the first
- The smoke against the live bridge now proves rows, not just bands

## v66 -- Phase 66 (the ritual reads its own clock, the sections
## prove they carry their handles, the band order gets its first
## witness, and the front door learns to describe itself)

1) VERIFY-ALL TIMING. Every step's wall time in one summary line --
"lint-docs 0.0s | verify:report 0.1s | verify:console 0.1s" -- so a
step that suddenly takes 10x announces itself even when green. The
baseline is now in this ledger: on this hardware, tenths across the
board; anything reading in whole seconds deserves a look.

2) CONTRACT 4 -- rig-checks blocks, SURVEYED THEN STRICT. Before
adoption the scan ran: all 64 existing sections already carry rig
checks, so the contract ships with NO grandfather clause -- and
that finding is recorded in the contract's own comment, because a
rule that needed no exceptions is evidence the ritual was already
sound. Exercised RED on a copy with one block renamed away: named
by version ("missing in v63"), failed with the reason (the checks
are the deliverable's handle).

3) BAND ORDER -- the v46 grouped-render order, asserted for the
first time anywhere: engine before escape velocity, settled by
grep -bo byte offsets. The comparator logic exercised RED on a
deliberately reversed string (E@20 > V@0 -> fail). A reordering
regression -- a refactor that flips the group loop -- now has a
witness.

4) VERIFY-ALL --DRY-RUN -- three lines, as priced: list every step
with its full command, touch nothing, exit 0. Symmetry with the
flip script; the front door can now describe itself before opening.

v66 validation: contract-4 survey (64/64) + RED on a stripped
block; band-order comparator RED on reversed input; dry-run
listing; timed green run; all touched files parsed or sh -n'd.

v66 rig checks:
- node tools/verify-all.mjs --dry-run before the first wired ship:
  three steps listed, nothing run
- Watch the timing line across a few ships; note the rig's own
  baseline next to the sandbox's tenths
- sh tools/smoke-console.sh against the live bridge: the band-order
  diag line appears in verbose mode
- Write the next phase section WITHOUT rig checks once, run the
  lint, enjoy the RED, then write them

## v67 -- Phase 67 (the clock grows a memory, the tail proves it is
## alive, the lock proves it is locked, and the manifest becomes
## quotable)

1) TIMING HISTORY -- the v66 clock, given a memory and a judgment.
Every verify-all run appends one line to tools/verify_timing.json
(a 200-ring): timestamp, green/red, per-step seconds. With 5+
historical runs, a step past 3x its own MEDIAN warns even when
green -- median, not mean, stated in the code: one slow outlier
must not poison the baseline it is measured against. Five seed
runs live in the shipped ring; the warn logic validated against a
planted history (median 0.1: 0.5 warns, 0.2 stays quiet).

2) CONTRACT 5 -- the LIVING hooks tail, surveyed then encoded
SHARPER than the hook phrased it. "Hooks end every phase entry" is
structurally false in this ledger: consumed hooks BECOME the next
section, so the true invariant is exactly ONE "Phase NN hooks (not
built)" header, NN = max phase + 1, standing as the FINAL header.
Exercised RED twice on copies: a stale NN (Phase 99 vs expected
67) and a planted duplicate mid-file (2 sections, final-header
false) -- both caught with the counts in the message.

3) CSP VALUE ASSERTS -- the lock proves it is locked. A header
that exists but says default-src * would pass a presence check
while guarding nothing; the smoke now greps the VALUE for the two
directives whose loosening would matter -- default-src 'none' (the
lock) and connect-src 'self' (the one door). The loosened case
exercised through the same grep logic: caught.

4) --MANIFEST -- the steps array exported as JSON, because it IS
the ship ritual's true manifest and SHIP.md generators should
QUOTE it, not paraphrase it: paraphrases rot; data does not.
Name + full command per step, pretty-printed, exit 0.

v67 validation: contract-5 both REDs (stale NN, duplicate tail);
loosened-CSP RED through the real grep; warn-logic median walk;
manifest output; 5-run seeded ring verified on disk; all touched
files parsed or sh -n'd; artifact cleaned.

v67 rig checks:
- After ~10 real ships, read verify_timing.json once: the rig's
  own baseline, and whether any step ever warned
- node tools/verify-all.mjs --manifest | into the SHIP.md
  generator -- quote, don't paraphrase
- curl -sI the console with the bridge up: both CSP directives in
  the header the smoke now demands
- Ship a phase WITHOUT updating the hooks tail once: contract 5
  goes RED at "stale NN" -- the ritual now enforces its own
  succession

## v68 -- Phase 68 (the ritual's pulse gets a picture, the contracts
## learn to grandfather honestly, the manifest gets consumed, and the
## ring reaches Excel)

1) TIMING CHART -- the ritual's pulse, drawn. verifyTimingChart()
reads the v67 ring (a tools-side file from a brain-side page; the
../ hop is deliberate and stated in the comment: the ring belongs
to the ritual, not the brain) and draws one line per step across
ships, red dots along the top for red ships, auto-ranged, run
count in the title. Probed against the real 5-run ring under the
shim: renders, "5 runs". Under the smoke's throwing shim it
vanishes like every other chart -- no new scenario needed, the
existing negatives already cover it.

2) CONTRACT 6 -- validation blocks, and the SURVEY WENT THE OTHER
WAY this time: v11 and v13 predate the habit, so the contract
ships GRANDFATHERED AT THE BOUNDARY -- the two exceptions named in
a constant, v14 onward strict. Contract 4 needed no grandfather;
contract 6 does. The contrast is deliberate ledger: it records
when each ritual habit actually began, instead of pretending they
were all born at v2.

3) MANIFEST CONSUMED -- tools/gen-ship-section.mjs closes the
quote-don't-paraphrase loop: it runs --manifest and wraps the JSON
into a SHIP.md section (one `>> SHIP.md` line on the rig). The
commands in the output are QUOTED -- if the steps change, the next
ship's SHIP.md changes with them, and no human paraphrase sits in
between to rot. Exercised: three steps, full commands, dated
header.

4) EXPORT LINE + THE v45 FLATTEN. ?file=verify_timing joins the
whitelist -- but the ring's entries carry a NESTED steps object,
and a raw export would print [object Object]; the v45 precedent
(reshape at the surface, never in the file) flattens each step to
its own column: ts, green, lint-docs, verify:report,
verify:console. Flatten walked including a steps-less red entry.

A ghost caught by an old rule: server.js grep for "v68" counted 9
-- seven were v680 ENGINE comments (substring match); the exact-
marker grep ("v68 -- ") counted the true 2. The v56 lesson (re-grep
the disk, exactly) pays out again.

v68 validation: chart probe on the real ring; smoke x6 unchanged;
contract-6 survey + boundary; generator output; flatten walk with
a degenerate entry; exact-marker recount; all touched files
present-then-parsed.

v68 rig checks:
- After ten real ships: the pulse chart on report.html, and
  whether any red dots line the top
- gen-ship-section >> SHIP.md once; diff the section after any
  step change to watch the quote update itself
- /ai/brain/export.csv?file=verify_timing in Excel: one column
  per step
- Write a section without a validation block: contract 6 goes RED
  and names it

## v69 -- Phase 69 (the warns reach the picture, the surveys become a
## flag, the generator learns its own name, and the ring gets a
## bathroom scale)

1) WARN OVERLAY -- amber dots under the red, RE-DERIVED from the
ring rather than trusted from a transcript: the runtime computes
warns but records only seconds, so the chart recomputes the same
rule (5+ PRIOR runs, current > 3x their median) from the data
itself -- re-derivation from data beats trusting a log line that
scrolled away. Hover names the warning step(s). Logic walked: five
flat runs then a 0.5s spike -- amber at the spike only, never
before the baseline exists.

2) --SURVEY -- contracts 4 and 6 both began life as hand surveys;
now the next one is a flag. Every contract runs in REPORT-ONLY
mode: findings print as "would-RED", the exit stays 0 -- a survey
informs, it does not gate. Exercised on a copy with a broken
runbook: one would-RED named, exit 0, while the same copy under
plain lint would have shipped-blocked.

3) GEN-SHIP-SECTION --WRITE -- idempotent BY CONSTRUCTION, not by
care: `>>` appends a duplicate on the second run, so the tool
gained a mode that finds its own section by its MARK header and
REPLACES it up to the next "## " (appending only when absent).
Exercised twice into one file: "appended", then "replaced", one
section. stdout mode stays for piping.

4) RING SIZE NOTE -- informational, never a fail: entries x steps
and KB on every lint run, with a NUDGE line past 100KB (a smaller
ring or fewer decimals). 200 x 3 today is nothing; the note exists
for the day steps number ten.

v69 validation: overlay logic walk (flat-then-spike); survey
would-RED + exit 0; double-write idempotence; ring note on the
real file; all touched files present-then-parsed.

v69 rig checks:
- After a genuinely slow ship: the amber dot appears, hover names
  the step
- node tools/lint-docs.mjs --survey before adopting any future
  contract 7 -- the survey is now free
- gen-ship-section --write SHIP.md in the rig's ship script; diff
  after two ships to confirm one section
- Glance at the ring note once a month; ignore it until it nudges

## v70 -- Phase 70 (the amber explains itself, the survey learns
## before-and-after, the quote gets a freshness seal, and the threshold
## becomes one knob with two readers)

1) LEGEND CLAUSE -- one clause in the chart header, as priced: "amber
dot = a Nx-median warn (hover names the step)" -- and the N in the
legend is the LIVE knob value (hook 4), so the legend can never
disagree with the rule it describes.

2) SURVEY SNAPSHOT DIFF -- the "what did my change break" loop in
two flags: --survey --save FILE snapshots the findings; --survey
--diff FILE re-surveys and set-diffs -- NEW findings are what the
edit broke, FIXED are what it healed, both labeled in those words.
Exit stays 0 throughout: surveys inform, they do not gate.
Exercised end-to-end: clean baseline saved (0 findings), runbook
broken in a copy, diff reported "+1 new, -0 fixed" with the
finding named.

3) GEN-SHIP-SECTION --CHECK -- the quote can rot too. Compares the
section BODY in the target against a freshly generated one -- the
timestamp line EXCLUDED on purpose (dates always differ; staleness
is about the COMMANDS). Exit 1 stale-or-missing with the remedy
("rerun --write"), 0 fresh. Exercised both ways: fresh after
--write, stale after a planted command edit.

4) WARN THRESHOLD KNOB -- decided at the read, as the hook asked:
NOT a shared import (couples the Deno-side chart to node-side
tools), NOT a brain gate (the ship ritual is not the brain's
domain) -- tools/verify_config.json {warnFactor: 3}, read with a
default of 3 by BOTH consumers. The ring's consumers share the
ring's CONFIG as data: greppable, no import coupling, both
hardcodes gone. Boundary walked: at 5x, a 0.5s step over a 0.1s
median sits exactly AT the line and stays quiet -- strict
inequality, stated.

v70 validation: survey save/diff end-to-end; check fresh AND
stale; knob boundary exact; legend quotes the live value; all
touched files present-then-parsed.

v70 rig checks:
- Set warnFactor to 2 for one evening of ships; watch the amber
  dots multiply, then put it back -- the knob is the experiment
- lint-docs --survey --save before any big NOTES edit; --diff
  after -- the loop is now two commands
- gen-ship-section --check in CI next to verify-all: the quote
  now has a freshness gate
- The pulse chart legend should read "3x" until the knob moves

## v71 -- Phase 71 (one hook refused with its reasons, one contract
## that sleeps until flip day, one nudge set to fire at five, and the
## ritual's pulse beside the report link)

1) SMOKE-LEDGER SNAPSHOT LOOP -- REFUSED, with the reasons at the
site. The ledger's self-check is binary and runs on EVERY smoke; it
cannot drift silently between snapshots, and silent drift is the
only disease the snapshot loop cures. The lint earned the loop
because prose contracts accumulate would-REDs across proposed
edits; the ledger has exactly one failure mode, already gated at
every run. Machinery with no new information is weight, not safety
-- the v54 lesson, cited in the decision comment where the next
reader will wonder.

2) CONFIG SCHEMA NOTE -- informational, boundary pre-set: every
lint run prints the config's key count and names; at FIVE keys the
NUDGE fires ("time for a schema contract in this lint"), so the
contract gets written the day it earns itself and not before.
Today: 1 key [warnFactor].

3) CONTRACT 7 -- the runbook's CONSUMED promise, LIVENESS-GATED ON
THE FLIP ITSELF. While FPS_DOMAIN_SPLIT reads false the contract
SLEEPS (an unconsumed runbook before flip day is just a runbook,
and the lint says so); the moment the boolean reads true, a
still-living runbook is a broken promise -- its own step 7 -- and
fails by name. Full lifecycle exercised on a copy: asleep
(flip=false), awake and RED (flipped, runbook living), satisfied
(flipped, CONSUMED marker) -- GREEN.

4) PULSE STRIP ON THE CONSOLE -- the last 5 ships beside the
report link, the v49 mini pattern: one bar per ship, height =
total seconds scaled to the window's max, red bar = red ship,
hover carrying the per-step splits. Renders only at 2+ ring
entries; absent rings absent the strip. Bar math walked (0.2s and
0.6s totals -> 4px and 12px, cyan and red).

A ghost pre-empted this time: server.js "v71" greps count engine-
era v717 comments; the exact marker ("v71 -- pulse strip") counts
1. The v56/v68 rule, now applied BEFORE the confusion instead of
after it.

v71 validation: contract-7 three-state lifecycle; strip bar math;
schema note live; refusal reasons at the site; smoke x6 unchanged;
all touched files present-then-parsed.

v71 rig checks:
- Post-flip-day, first lint: contract 7 goes RED until step 7 is
  honored -- the ritual now collects its own debts
- The console header: five bars beside the report link once five
  ships have run
- Watch the config note the day a second key lands
- Read the refusal comment once -- the next snapshot-loop idea
  should meet its reasons

## v72 -- Phase 72 (a frame refused for being early, a strip that
## goes somewhere, the floor becomes the second knob, and the lint
## learns to smell smoke)

1) GATED-CONTRACT FRAME -- SURVEYED, REFUSED, dated. Contract 7 is
the ONLY gated contract in existence; a registry with one member is
a pattern claim, not a pattern. The frame gets built at the SECOND
gated contract, not before -- the refusal comment sits above
contract 7 where the next gated contract's author will land, and
cites the v71 logic still holding one phase later: machinery with
no new information is weight.

2) STRIP CLICK-THROUGH -- one href, as priced: the console's pulse
strip wraps in a link to /ai/brain/report#pulse72, and the report's
pulse h2 gained the matching id. A glance becomes a click becomes
the full picture.

3) warnMinRuns -- the 5-run floor was the SECOND hardcode-in-two-
places (runtime and chart), so it got the same treatment as the
first: a key in verify_config.json, read with a default of 5 by
both consumers. Walked: a 6-run history that floor-5 judges is
silenced by floor-8. The schema note now reads "2 key(s)" -- three
more and it nudges for its own contract, exactly as designed.

4) RED-STREAK NOTE -- three reds in the last five ships is a louder
finding than any timing warn, and now the lint says so in those
words. A NOTE, not a fail, with the reasoning in the comment: each
red already failed its own ship; this lint gates PROSE, and a
streak is a signal about the RIG, not the ledger. Exercised on a
planted ring: fires at 3/5, names the count, points at the rig.

The v56/v68/v71 ghost rule, applied on schedule: server.js "v72"
greps count engine-era v72x comments; the exact markers count the
true edits. Pre-emption is now the habit, not the recovery.

v72 validation: streak note on a planted ring; floor-knob walk
both sides; click-through anchor pair (id + href); refusal dated
at the site; schema note tracking 2 keys; all touched files
present-then-parsed.

v72 rig checks:
- Click the strip: land on the pulse chart, not the page top
- Set warnMinRuns to 10 for a young ring; warns should vanish
  until the history earns them
- Force three red ships in a test window once: the streak line
  appears in the next lint
- When the second gated contract is proposed: read the refusal
  first, then build the frame

## v73 -- Phase 73 (a knob refused for having a reason, a clause
## instead of a line, a cross-file pair held by contract, and a
## dashboard line that knows it is volatile)

1) STREAK KNOB -- REFUSED, the reason at the site: the warn knobs
existed to kill a two-place duplication; 3-of-5 lives in ONE place
and its value has a REASON (3 = majority of the window), not a
preference. A knob there would invite tuning a smoke alarm. The
schema-contract nudge stays two keys away, honestly.

2) CONTRACT 8 -- the pulse anchor pair, the linked-decision pattern
applied to a CROSS-FILE pair: the console's "#pulse72" href and the
report's id="pulse72", exactly one each, one grep per side. A
refactor renaming either strands the click on the page top -- now
it strands on a RED instead. Exercised: id renamed in a copy,
caught at "href x1, id x0".

3) GREEN STREAK -- DECIDED: a CLAUSE, not a line. A permanent "all
good" line trains eyes to skip lines; carried on the existing ring
line it costs nothing and still answers "how long has it been":
"ship streak: 5 green (the whole ring)", or "(last ship was red)"
at zero. Information without a new line to go blind to.

4) DASHBOARD LINE -- gen-ship-section now quotes the LAST ship's
timing ("Last ship: green, lint-docs 0s | ..."), and the trap it
sets was caught in design: the line is volatile BY NATURE, so
--check SCRUBS it from both sides before comparing -- freshness is
about the COMMANDS; the pulse is about the moment. Proved the hard
way on purpose: a NEW ship ran between --write and --check, and
the check still read FRESH.

v73 validation: contract-8 both ways; scrub across a genuinely
newer ring; streak clause at 5-green and the zero wording; refusal
reasons at the site; all touched files present-then-parsed.

v73 rig checks:
- Rename the anchor once on purpose: the lint catches it before a
  user's click does
- After a red ship: the streak clause reads "0 green (last ship
  was red)"
- SHIP.md after several ships: the dashboard line updates, --check
  stays FRESH until a command actually changes
- Re-read the two refusals (v71, v72, v73) together once -- the
  bar for new machinery is now case law

## v74 -- Phase 74 (the case law gets a spine, the contract declines
## its own expansion, and the streak reaches both the quote and the
## glance)

1) REFUSAL CASE LAW -- DECIDED: a standing INDEX of POINTERS, not a
lint contract and not paraphrases. Collecting the refusals as prose
would be exactly the rot the quote-don't-paraphrase lesson names;
one line per refusal (verdict + where the reasoning lives) rots
least. Five entries: v54 exposure chi, v71 snapshot loop, v72
registry frame, v73 streak knob, v74 (below). And the index's own
governance decided in its header: NO lint contract until the index
actually drifts -- the drift earns the contract, not the fear of
it.

2) ANCHOR-PAIR GENERALIZATION -- SURVEYED, REFUSED, and the survey
sharpened the contract's jurisdiction: five anchor pairs exist in
the console, but ALL are SAME-FILE (href and id in one served page
-- a rename fails visibly in one diff). Contract 8 guards the
CROSS-FILE seam, where renames fail silently; exactly one such pair
exists. The frame gets built at the second cross-file pair -- the
v72 rule, applied to the very contract it sits beside.

3) DASHBOARD STREAK CLAUSE -- rides the SAME volatile line, so the
--check scrub covers it FOR FREE: one prefix, one rule. Proved
again across a genuinely newer ring: FRESH. The line now reads
"Last ship: green, ... -- streak 6 green."

4) STRIP HOVER COMPLETED -- total leads each bar's title ("total
0.3s: lint-docs 0.1s, ...") and the trailing span carries the
streak, honestly labeled WINDOW-LOCAL in the comment: this strip
sees five ships, so its streak is the window's streak (walked: a
red mid-window caps it at the bars since). The lint's ring-wide
streak clause remains the full answer.

v74 validation: scrub across a newer ring with the longer line;
window-local streak walk (mid-window red); anchor survey with the
same-file/cross-file split; index placed without disturbing
contracts 1/3/5; all touched files present-then-parsed.

v74 rig checks:
- Read the case-law index once; it is now the first stop before
  proposing machinery
- Hover the strip: totals lead, streak trails
- SHIP.md across a red ship: the dashboard line flips to RED and
  streak 0; --check stays FRESH throughout
- When a second CROSS-file anchor pair lands, contract 8's refusal
  comment is the work order

## v75 -- Phase 75 (a deferral honored with zero code, two streaks
## introduced to each other, the freshness gate finally gets run, and
## the pulse learns what day it is)

1) REFUSAL-INDEX DRIFT CHECK -- DEFERRED BY ITS OWN RULE, and the
deliverable is exactly this paragraph: the index's header says
drift earns the contract; no drift has occurred; nothing was
built. Revisit on evidence.

2) STREAK RECONCILIATION -- one clause, placed where the SMALLER
window lives: the strip's span now reads "streak N green in
window" with a hover title naming the split ("the lint reports the
ring-wide streak"). Two streaks, two windows, one sentence --
before it became a bug report.

3) SHIPMD GATE, RUN AT LAST -- tools/verify-step-shipmd.mjs joins
the manifest as step four: SHIP.md absent -> SKIP (a rig that
keeps no SHIP.md is a normal state); present -> --check
propagates. And the designed consequence stated IN the manifest
comment: adding this step CHANGES the manifest, so the first
--check after this update rightly reports any existing SHIP.md
stale -- the gate catches its own arrival; rerun --write once.
Exercised: SKIP with no file, PASS against a fresh --write.

4) DAY BOUNDARIES -- the ring carries ts the chart was ignoring: a
faint vertical where the date changes, MM-DD label, missing-ts
rows draw none. Walked: midnight crossing draws one, same-day
none, ts-less none.

One abort this phase, and it sharpened a RULE: the write-guard
(`assert 'in window' not in file`) misfired on unrelated pre-
existing text -- three lines of server.js already contain "in
window". The v56 lesson applies to GUARDS too, not just anchors:
unique bytes or nothing ("green in window" guarded the rerun).
Blocks after the dead guard were unwritten and said so; the v55
write-order rule contained the blast radius to exactly the two
pending files.

v75 validation: shipmd SKIP + PASS both exercised; boundary walk
three cases; strip clause + title; smoke x6 unchanged; all touched
files present-then-parsed after the guard fix.

v75 rig checks:
- First verify-all after this lands: shipmd step SKIPs until the
  rig writes its SHIP.md; then --write once and watch it PASS
- Hover the strip's trailing text: the reconciliation title
- A multi-evening ring: date lines on the pulse chart
- The refusal index: still five entries, still no contract --
  correct until evidence says otherwise

## v76 -- Phase 76-prep (one button collects the evidence, the birth
## line learns to survive its terminal, and the wiring work smoked out
## a latent break that may explain quiet milestones)

1) EVIDENCE BUNDLE, ONE CLICK. GET /ai/brain/evidence.zip, linked
in green beside the report link ("collect evidence bundle").
Server-side it gathers everything phases 76-77 asked for:
brain/*.json (the real payload), tools/verify_timing.json +
verify_config.json, milestones.txt (the brain's lines filtered out
of SYS_LOG -- item 1 and item 3 of the ask in one file), and
console.html via an internal self-fetch on the bridge's own bound
port (item 2 -- no curl step for the human). A meta.txt names what
is present and what is MISSING, by name, not hidden. The ZIP is a
ZERO-DEPENDENCY store-only writer -- proven against unzip AND
python's zipfile (CRCs verified by both) BEFORE it entered
server.js; no npm package rides into the bridge for this.

2) BIRTH LINE PROMOTED TO A MILESTONE. The v57 announcement was a
console.log, which dies with the terminal; the bundle can only zip
what the bridge can see. The birth line now also fires
reportMilestone (fire-and-forget, wrapped), landing in SYS_LOG
where milestones.txt collects it.

3) THE LATENT BREAK, found while checking that call's scope:
brain.js calls reportMilestone 36 TIMES and constructs
MilestoneWatcher once -- and NO IMPORT EXISTED. milestones.js
exports both; nothing imported it. Most call sites sit inside
try/catch, so the ReferenceError would be EATEN and milestones
would silently stop arriving. REPAIRED with the one import line,
and the diagnostic fork stated at the site: if the rig's milestone
stream has been quiet, this was why; if it has NOT been quiet, the
rig's tree differs from this bundle -- and the evidence bundle
will say which. Either branch is information.

v76 validation: ZIP builder proven by two independent readers
before integration; import repair with export-name cross-check;
verify-all GREEN x4 steps; all touched files present-then-parsed.

v76 rig checks (THE FLIP-DAY SEQUENCE, in order):
- Deploy v76; restart brain + bridge; confirm milestone lines
  appear in /sys/logs (the repair's first test)
- Upload a pre-flip evidence bundle FIRST (one click) -- phases
  78-79 read the dungeon arms the flip will erase
- Flip day: runbook + fps-flip.sh, one shooter session, one TD
  session
- Click "collect evidence bundle" again; upload the post-flip zip
  -- phases 76-77 build from it

## v77 -- Phase 77 (THE MERGE: the brain becomes the engine's brain --
## GPUBrain v76 wired into EngineProject v1988, shipping as v2064)

THE SHAPE OF THE MERGE, so future-us can trust it:

1) THE BRIDGE -- ai-bridge/gpuBrainBridge.js, a NEW module holding
the ENTIRE brain-bridge surface, ported VERBATIM from the bundle
server.js as one contiguous span (its lines 5486-6943: mailbox,
experience ring, gates + undo/redo, duel + rematch + podium,
export.csv, heartbeat, audit, the /ev game page, evidence.zip,
report route, and the whole live console) plus the gpuBrain
mailbox state block. NO logic rewritten in transit -- the 76
phases of notes still describe exactly this code. The engine's
server.js (1.16MB, 740 routes) gained exactly TWO edits: one
require line beside its sibling bridges, and ONE delegation block
after sendJson -- ownership by prefix (/ai/brain/*, /ev), ctx
injecting the five engine facilities the span leans on (sendJson,
SYS_LOG, sysLogPush, _ollamaBase, _ollamaModelName -- all verified
present engine-side before wiring). An owned-but-unmatched URL
404s honestly.

2) THE LINEAGE FINDING that made the rest safe: the bundle's
main.js diffs against the engine's at only SIX HUNKS (644 lines
across two 22k-line files) -- the bundle was engine v1985 + brain
patches; the engine is v1988. So minus-lines were v1986-88 engine
work to KEEP (the ?seed/?cam repro system), plus-lines were the
brain. Hunks 4/5/6 (outcome collection, civRetaliation tick, the
snapshot pump) applied via patch(1) with a dry-run first; hunk 2's
two brain imports applied by hand AROUND the kept repro import.
ENGINE_VERSION bumped to v2064.

3) WHOLESALE TAKES, each verified pure-base on the engine side
first (every engine-only diff line inspected as pre-patch context,
not newer work): DungeonDemo (all brain wiring incl. the dormant
FPS_DOMAIN_SPLIT gate), DungeonAI, Kaiju, KaijuManager, KingPack,
OgreScenario, ProjectileManager, kaijuAttacks (which also carries
the PATCH-B8 fix: alt2 attacks -- meteor, magic_orb, tractor_beam,
sonic_scream, acid_spit, emp_burst -- were UNREACHABLE for
non-king kaiju; the engine inherits the fix with the merge),
server.html, plus NEW files: simulation/civRetaliation.js, the
whole brain/ directory, the four vba/ brain modules, and the
eleven ship-ritual tools.

4) FALLOUT CAUGHT AND FIXED IN-MERGE: contract 8 repointed (the
console's #pulse72 href lives in the module now, not server.js);
the evidence-bundle button now renders in BOTH branches of the
report-link IIFE (a fresh tree has no report.html, and the fresh
tree is exactly who clicks the button first); Start_Everything.bat
gains a Deno-guarded GPU Brain launch (brain/START_BRAIN.bat
already pointed at :8787 -- the engine bridge's own port, so the
mailbox address was right by construction).

5) v77 validation -- PROOF WITHOUT A BOOT (the v60 tar-pit case law honored): the
module require()s clean and was invoked DIRECTLY with mock
req/res/ctx -- flowfield mailbox answers, the console renders
13.5KB with both bands from an empty brain, /ev serves its 20KB
game page. And the ENTIRE ship ritual ran GREEN inside the merged
tree: all 8 doc contracts, smoke x6 through the real report.js,
gated steps SKIPping correctly, timing ring recording.

v77 rig checks (FIRST BOOT of v2064):
- Start_Everything.bat: engine up, then the brain window (or
  "Deno not found -- skipped", which is honest)
- /ai/brain/console in the browser: bands render, rows say "not
  started" until sessions happen
- Play ONE kaiju session: the console's rows begin to move --
  that is the pump, the mailbox, and the brain agreeing
- Click "collect evidence bundle" and upload it here: phases
  78-79 read it
- Milestones appear in /sys/logs (the v76 import repair's first
  live test)

### v77 addendum -- the v1989-11 patch pack, absorbed

Geek's 28-file patch pack (peer auto-update fixes, camera/ONVIF
integrations, go2rtc restart logic, avatar diorama framing, AI
pipeline upgrades, box3d physics, new dashboards) landed AFTER the
merge and collided at exactly the two predicted seams. Resolution:
(a) server.js -- took v1989's wholesale (1.19MB), re-applied the
brain seam (require + delegation) at the same two anchors, all six
anchor/facility greps verified surviving v1989 first; (b)
server.html -- took v1989's, re-applied the brain's PATCH-B21 duel
tinting via patch(1), both hunks landing at a 110-line offset with
context intact. The other 25 files were untouched by the brain and
copied over (9 new, 16 newer). Console re-invoked live after the
swap: renders with the evidence link. Ritual GREEN.

### v77 addendum 2 -- first-boot fixes (Geek's console errors + Mac)

1) DungeonDemo EXPORT RESTORED. The v56 const-insertion split the
file at index-of('class DungeonDemo') -- which sits INSIDE 'export
class DungeonDemo', so the export migrated onto the const and the
class shipped naked. Nothing in the standalone bundle ever
imported the module, so no check noticed; the real engine's
main.js:268 import noticed immediately. Fixed and proven by an
actual node import (named export present, const private). Lesson
for the anchor rules: index-of on a bare keyword can land inside a
longer token -- anchor on LINE-shaped bytes.

2) MAC DOUBLE-OPEN: a race between two openers -- start-mac.sh
opened the browser at port-bind, and server.js self-opens on
darwin when no tab's SSE has connected; slow first paint = both
fire. The script's fresh-start open is REMOVED; the server's
smarter opener (best LAN URL, boot-mode page, only-if-nothing-
connected) owns the job alone.

3) MAC TERMINAL AUTO-CLOSE: Terminal is NOT locked down -- the
confirm dialog only appears while a process is attached. The
launcher now titles its window 'SweK Engine'; a NEW launch takes
over (kills only the :8787 listener, exactly the Windows
launcher's behavior), waits for the old shell to exit its wait,
then closes other SweK-titled windows via osascript -- promptless,
because nothing is attached to them anymore. (intro.mp4 404 is by
design: an optional decorative HEAD-probe that hides itself; the
message-channel errors are a Chrome extension, not the engine.)

### v77 addendum 3 -- second boot report (v2065)

1) THE TDZ THAT ATE THE BOOT. civRetaliation.init() referenced
projectileManager at module top level, but this tree's v1986-88
layout declares that const ~40 lines BELOW the patched-in site --
the bundle's layout had it above, so the hunk applied cleanly and
detonated at runtime. An uncaught top-level ReferenceError ABORTS
the whole module: everything after main.js:7200 (including the
brain pump at 21k) silently never ran -- "boots but not fully" is
exactly what a mid-module abort looks like. Init moved to
immediately after the ProjectileManager construction; parse +
placement verified.

2) THE 8 PEERS ARE DATA, NOT A BUG IN THIS MERGE: the fleet roster
lives in swek-peers.json published to Google Drive, and it
accumulates -- one box under its LAN IP AND its tunnel URL counts
twice; old entries linger; PeerPresence (40s grace) filters
liveness but the panel shows roster entries. Nothing in v2064/65
or the v1989 pack touched roster counting. Remedy: prune
swek-peers.json in Drive; if the count still offends afterwards,
dedupe-by-peer-identity in the panel is a proper future phase.

3) ENGINE_VERSION bumped to v2065; archive renamed to match.

### v77 addendum 4 -- third boot report (v2066): the dock un-letterboxed

BOOT IS CLEAN: the v2065 log runs end-to-end, zero uncaught errors
-- the TDZ fix held; the remaining items are UI-layer.

1) DOCK FRAMING FIXED, with the numbers: the diorama/studio
branches capped frameAspect at 1.0 (v1811), letterboxing the
ultra-wide docked panel into a SQUARE -- and the v1989 wider
content span (llama roam +-1.4, props at 1.6+) pulled the camera
back INSIDE that square. Measured on the dock's real geometry
(aspect 2.6, span 2.2): capped = content fills 31% of panel width;
true aspect = 55% width with FULL height, contain-fit, nothing
cropped. Both branches now use the true aspect unless a host
EXPLICITLY pins _fixedFrame (that override still honored). The
compact preset one branch up already did this -- the fix makes the
family agree.

2) STATUS PANEL / MINI RADAR: not blind-patched. The radar gate
(window._stage.active() === isolation exclusive) SHOULD read true
on blank_sandbox per the boot log, so either isolation flips later
or the hidden thing is a DIFFERENT element (the minimize-to-tab
wording suggests an LCARS panel). Probes shipped in the reply; one
paste pins it.

### v77 addendum 5 -- fourth boot report (v2067): dock frame de-clamped

DOCK FRAMING, real cause found: the compact branch already used the
true aspect (my v2066 aspect change was inert HERE -- it helps the
non-compact diorama/studio hosts, so it stays). The actual bug:
_contentSpanX() force-widens its span to +-1.45 whenever petEnabled
(the llama bury/roam range), and the compact dock fed that straight
into halfW -> a ~3.9u-wide frame that shrank the gauges+avatar group
to a dot. The compact block now computes its span from actors +
props ONLY (skipping the pet clamp), 22% tighter (3.04u), so the
group fills the panel and the llama wanders in/out of a snug frame
like any pet.

OPEN (needs one value from the render, not guessable from code): if
the rigged avatar still sits RIGHT of center after this, it is
either mid-walk (diorama starts the avatar at roamMin=-0.6 and walks
it to the pinned x=0) or a model-pivot offset. Diagnostic in the
reply.

### v77 addendum 7 -- v2068 first live brain boot: two real bugs fixed

THE STACK IS LIVE: Deno auto-installed (2.9.1), bridge up on :8787,
brain connected to the Intel UHD 620 GPU, browser tab talking to it.
Two bugs surfaced on the first real run -- both genuine, neither a
merge artifact.

1) BRAIN CRASH (brain.js:2401) -- trainer.stats() on null. The
trainer is lazily constructed inside tick() only once attack data
arrives; on a fresh boot with an empty world it stays null past the
first 10-second log tick, and the log line called .stats() UNguarded
while every other site guards with `trainer &&`. Guarded now, with an
honest idle message until the first attack. This crash is why the
brain window closed -- it should stay up now.

2) THE 8 PEERS -- ROOT CAUSE FOUND AND FIXED, not hidden. autoPull
merges mDNS + saved roster keyed by URL, so ONE box counted once per
URL it answers on: LAN IP, Cloudflare tunnel, AND (in this boot log)
three Hyper-V/VM virtual adapters. The tree already had
peerIdentityBridge.js (v1676): a stable sha256-derived id built to
dedup by machine. Wired it through -- /package/info advertises the
id, autoPull collapses by it (URL fallback for old peers, self
excluded). Walked: 6 URLs across 2 boxes + 1 legacy peer -> 3.

### v77 addendum 6 -- v2068: Geek's infra pack (Deno auto-install)

Four-file pack, all infrastructure, taken WHOLESALE -- it supersedes
my v2064 brain-launch edit with a better one: START_NODE_Engine.bat
now AUTO-INSTALLS Deno (vendored installers/deno-install.ps1, official
GitHub build, no admin) instead of just skipping when Deno is absent,
so the GPU Brain starts on a fresh box with no manual step. Also:
installers/kpop-guard.ps1 (stops a stale KPopListener cleanly, exit 42
= already-good), and a refreshed KPopListener.ps1. All launcher path
references verified resolving in the merged tree (deno-install,
brain/START_BRAIN.bat, KPop Listener/KPopListener.ps1). No brain-seam
or engine-code files touched -- nothing to re-merge.

### v2069 -- version bump ONLY (re-ship of the v2068 fixes)

No code change from v2068. The engine self-update compares
ENGINE_VERSION (main.js -> packagerBridge.engineVersion ->
/package/info), and a re-shipped same-number zip is NOT ingested --
the running box sees an equal version and skips it. Both stamps moved
together: main.js ENGINE_VERSION and the folder/zip name (packagerBridge
also reads vNNNN from the basename for the outgoing GmailSafe package).
Standing rule reaffirmed: every ship increments the number, even a pure
re-ship, or the fleet will not take it.

### v2070 -- server.html reports real GPU-Brain status (not just "running")

The question was right: "running" (Deno process alive) is only ONE of
several states, and reporting only it hides real failures. The bridge
already sees everything needed; it just was not surfaced.

NEW /ai/brain/health endpoint returns a four-state verdict derived from
timestamps the mailbox already stamps:
  - offline : no brain traffic this session (Deno window not running)
  - idle    : engine feeding snapshots but brain has not solved yet
              (empty world / no kaiju fired) -- NOT an error
  - stale   : last solve >15s ago (fields flow ~4Hz; quiet = stopped)
  - live    : solving in real time
plus fed/solving booleans, last-solve/last-feed ages, POST/GET counters,
experience-ring depth, and hasField/hasSnapshot. It never pretends: it
says "offline" when it cannot reach the brain.

NEW server.html chip (bottom-left, mirrors the duel panel bottom-right):
a colored dot + word, polls /health every 5s, hover shows the full
detail + solve/sample counts, click opens the live console. The three
distinctions that matter are now visible at a glance -- especially
idle-vs-offline, which tells you whether to fire a kaiju or go restart
the Deno window.

### v2071 -- THE MIND, LIVE: a real-time visual of what the brain is doing

Not a decorative fake -- it renders the ACTUAL solved state the mailbox
already holds, every 250ms:
  - FLOW PARTICLES ride the fx/fz vector field, so "where enemies are
    told to move" shows as MOTION and direction over time, not just
    static arrows (though a sparse arrow grid overlays for the still
    reading). Speed tints them blue->bright.
  - THREAT HEAT underlay from the per-cell threat map (9999 = safe),
    glow-trailed so danger pulses.
  - PLAYER-SEEK field in green, GOALS as pulsing gold markers.
  - Live HUD: state (from /health), solve time, grid size, kaiju
    decided this tick, goal count, learn steps + avg reward.
Served at /ai/brain/mind (and /mind/view), pure client canvas, own CSP.
An honest idle screen when the field is empty ("fire a kaiju -- an empty
world gives the brain nothing to think about"), so it never fakes life.

The server.html status chip is now the front door: LEFT-click opens the
mind view, RIGHT-click the console. The four-state dot still tells you at
a glance whether there is anything to watch.

WHY THIS MATTERS beyond eye-candy: the flow field IS the brain's
navigation decision and the threat map IS its danger model -- watching
them move is watching the reasoning. A field that thrashes, a threat map
that never clears, particles that pool in a corner: these are debuggable
SdIGHTS now, not log-diving.

### v2072 -- fleet scoring foundation: brains self-identify, bridge ranks them

Answering Geek's multi-brain question honestly: the MECHANISM to target
each brain at chosen work already existed (BRAIN_ROLE=fields|policy|all
splits by function, BRAIN_KINDS splits policy by faction, the bridge
merges partial payloads per-key and per-kaiju-id). What was MISSING was
the SCORING layer -- nothing measured or ranked the brains. Built now:

1) BRAIN IDENTITY: every field POST now carries brainId (gpu|role|pid,
BRAIN_ID overrides), brainGpu, brainRole, brainKinds. The bridge could
not rank brains it could not tell apart; now it can.

2) FLEET SCOREBOARD (bridge): a per-brain rolling solve-speed EWMA
(alpha 0.15, robust to one slow tick), lastSeen eviction at 60s. Both
full and partial (split-brain) payloads score.

3) /ai/brain/fleet: the scoreboard + a routing RECOMMENDATION. Speed
ranks; the fastest brain is recommended for FIELDS (navigation replans
every tick -- most latency-sensitive), slower brains for POLICY (combat,
less critical). Walked with a simulated GTX-1080 (3.4ms) + Intel-UHD-620
(23.9ms): correctly recommends 1080->fields, 620->policy -- exactly the
"simple requests to slower brains" idea.

DELIBERATELY NOT auto-routing: the recommendation prints the env-var
assignment a human applies per machine. Silently moving a brain mid-run
would fork the very A/B experiments the whole upstream system measures
(the v54/v71 "machinery with no new info is weight" discipline, plus a
correctness reason). Auto-apply is a real future phase once the scores
are trusted -- it needs a settle-window and experiment-boundary guard.

### v2073 -- Phase A: the CPU fields brain (the work-stealing prerequisite)

Geek's dynamic-reassignment idea (low-level task drops to a CPU brain,
the freed GPU brain is stolen for high-value work) needs three things
the system lacked: task PRIORITY, a CPU BRAIN to hand demoted work to,
and a safe HANDOFF. This ships the load-bearing one -- the CPU brain --
because without it there is nothing to reassign onto.

WHAT SHIPPED:
- brain/flowfieldCpu.js -- a DROP-IN for FlowFieldSolver: same
  constructor, same solve(heights, goals, opts) -> { fx?, fz?, dist? }
  grid-major, same cost model (1 + slopeK*slope + waterK below water).
  The brain cannot tell which solver it holds. It is NOT a downgrade:
  the GPU approximates Dijkstra with ~1.7*max(w,h) parallel min-plus
  passes; on a CPU that parallelism buys nothing, so this does the
  thing the GPU was IMITATING -- an EXACT multi-source Dijkstra with a
  binary heap, one pass, exact field. Verified: 5x5 flat (goal dist 0,
  edge 8, corner 16, flow points to goal, goal flow zero); water strip
  (the +waterK penalty AND the slope term at the water edge both fire,
  matching the k_cost kernel); 96x96 real-grid solve in 2.94ms (~340
  solves/sec vs the 4Hz poll -- vast headroom).
- brain.js -- BRAIN_BACKEND=cpu selects the CPU solver AND skips
  initGPU() (which hard-refuses a software adapter by design), so the
  CPU brain boots on a GPU-less box. Because policy is a GPU MLP, a CPU
  brain is fields-only by construction -- we force EFFECTIVE_ROLE=fields
  rather than let policy silently no-op, and it self-identifies to the
  fleet with brainGpu = "CPU (...)".
- brain/START_BRAIN_CPU.bat -- launcher with no GPU flags; point
  BRAIN_BRIDGE at the engine box and it joins the fleet as a fields
  solver.

HOW TO SEE IT: run START_BRAIN_CPU.bat pointed at the engine's bridge
alongside the GPU brain; /ai/brain/fleet shows both, the CPU one scored
by its own solve speed, tagged cpu. That is the "slower resource absorbs
the simpler navigation work" idea proven end to end -- and the concrete
foundation Phase B (task levels) and Phase C (the preemption scheduler
with an experiment-boundary guard) now build on.

### v2074 -- Phase B: task priority (and the honest FPS/WAD answer)

Phase C (preemption) needs to know which solves are latency-critical.
Phase B computes that -- from what is ACTUALLY happening, not a hand-set
label someone must remember to attach.

THE CLASSIFIER (brain.js, per solve, from the live snapshot):
- workMode: "fps" when a player is present AND kaiju are active;
  "combat" when kaiju are active but no player; "nav" when quiet.
- workPriority 0..3: a player under live fire (moving / producing
  outcomes) is 3; monster NAVIGATION toward a present player is 2;
  active kaiju combat without a player is 2; quiet kaiju present is 1;
  a silent nav field is 0.
- workNavOnly: true when the solve's FIELDS are all downstream needs --
  i.e. safe for a CPU/fields brain.
These ride in every field POST beside the Phase A identity.

THE FPS/WAD QUESTION, answered honestly: FPS/WAD splits in two.
(1) NAVIGATION -- monsters pathing to the player through dungeon
corridors -- is the v11 player-seek FIELD, the SAME solver class Phase
A already routes through the backend switch. So the CPU brain ALREADY
covers FPS/WAD monster pathing (dungeon walls are tall voxel plugs in
the height snapshot; slope cost routes around them with no dungeon-
specific code). (2) The FPS POLICY HEAD (v56/v57 lineage, the learned
attack behavior cloned from the dungeon head) is a GPU MLP -- CPU brains
are fields-only, so they do NOT run it. Net: a CPU brain jumps into
FPS/WAD navigation but not its learned policy -- which is exactly the
right split, since monster pathing is the latency-tolerant work you WANT
on a CPU, freeing the GPU for the policy head.

THE BRIDGE (fleet scoreboard) now records each brain's work mode +
priority and runs a MISALLOCATION detector: a slower brain carrying
high-priority work while a faster brain does low-priority work. Walked:
fast GTX-1080 on quiet nav (3.2ms, pri 0) + slow CPU on active FPS
(9.5ms, pri 3) -> correctly flagged "a faster brain is on lower-priority
work -- Phase C would swap these at a safe boundary." That flag IS the
trigger Phase C will act on.

STILL ADVICE, NOT ACTION: Phase B only observes and reports. Phase C is
the scheduler that acts on the misallocation flag -- swapping roles at
an experiment boundary so it never forks a running A/B test. The trigger
now exists; the actuator is next.

### v2075 -- Phase C: the preemption scheduler (and it covers the VBA FPS)

The actuator. Phases A+B gave a CPU brain to offload onto and a priority
signal to act on; Phase C is the scheduler that MOVES work: fastest brain
to the highest-priority task, low-priority/nav pushed onto slower (incl.
CPU) brains -- Geek's "steal the freed GPU brain for the high-value
request" made real.

DESIGN (safety first, because this one ACTS):
- OPT-IN per brain: the bridge only emits an assignment to a brain that
  announces BRAIN_SCHED=1. Default fleet = pure advice, unchanged.
- ASSIGNMENT rides back on the field-POST response (no new poll -- same
  one-round-trip design as the field itself).
- The brain applies an assignment ONLY at a safe boundary: end of a tick,
  AND not mid-experiment. expBusy (diffAB/diffABDgn unresolved) is
  reported to the bridge AND re-checked brain-side before applying, so a
  race cannot swap a role under a running A/B test -- the bridge may
  offer, the brain refuses until the experiment resolves.
- SETTLE window (8s): assignments only commit after the fleet has been
  stable, so the scheduler does not thrash roles tick-to-tick.
- CPU brains are PINNED to fields (they cannot run the GPU MLP);
  assignments to policy are refused CPU-side.
Walked: fast GTX-1080 + CPU brain, both opted in, high-priority FPS live
-> 1080 assigned POLICY (the hot combat work), CPU assigned FIELDS (nav);
under expBusy the bridge still offers but the brain declines to apply.
/ai/brain/fleet now shows scheduler.assignments live.

THE VBA QUESTION, answered: YES, Phase C manages the VBA FPS game --
because it schedules BRAINS, not games. The VBA controller
(modGPUBrain.bas) POSTs to the SAME bridge mailbox on :8787 as the WebGL
engine ("engine-agnostic: anything that can POST") and consumes the field
via GPUBrain_SampleFlow, blind to whether a GPU or CPU solved it. VBA FPS
monster pathing works by passing the player's x/z as a goal -- i.e. it is
NAVIGATION work, exactly what a CPU brain handles. So when the scheduler
pushes field-solving to a CPU brain to free a GPU, the VBA FPS game keeps
running without a hitch: it is the ideal CPU-offload client. (One honest
gap for later: the VBA snapshot sends heights/goals/enemies but not yet a
distinct player field the way the WebGL publisher does -- VBA seeks the
player via a goal, which is fine for nav; a dedicated VBA player-field
POST would be a small future add if VBA ever wants the separate pfx/pfz
channel.)

Phases A-C complete: the fleet now scores brains, classifies work, and
reassigns roles safely across BOTH the WebGL engine and the VBA game.

### v2076 -- the dedicated VBA player-field POST (closes the v2075 gap)

v2075 noted VBA sought the player via a plain goal, lacking the separate
player-seek channel (pfx/pfz) the WebGL publisher has. Closed now, in
modGPUBrain.bas + modGPUBrainSteer.bas, mirroring the WebGL PATCH-B2k
path exactly:

- GPUBrain_Tick gains optional hasPlayer/playerX/playerZ. Omit them and
  behavior is byte-identical to before (pure additive).
- SendSnapshot emits "player":{x,z} before the ts field when hasPlayer.
  That is the SAME shape the brain already gates on
  (snap.player && Number.isFinite(snap.player.x)), so the brain solves
  pfx/pfz toward the VBA player with zero brain-side change -- verified
  by parsing the exact emitted body against that gate.
- ParseFieldResponse now reads pfx/pfz into m_Pfx/m_Pfz (same loop shape
  as the threat block), guarded by m_HavePlayerField.
- GPUBrain_SamplePlayerFlow(x,z, fx,fz) -- the accessor, mirroring
  SampleFlow but for the player field.
- GPUBrain_SteerBlendPlayer(x,z, dirX,dirZ) -- the FPS/dungeon PURSUIT
  steer: blends a monster's heading with the player field (60/40, same
  as SteerBlend), routing it around walls toward the player. Graceful
  fallback preserved: False + untouched heading when no fresh player
  field covers the point.

Structural checks (no VBA linter in the sandbox): Sub/Function pairs
balanced (4/4, 6/6 in modGPUBrain; 3/3 in modGPUBrainSteer), the player
emit is valid JSON, and the brain's player-field gate fires on the
emitted body.

WHY IT MATTERS for the fleet work: VBA FPS pursuit is now a first-class
FIELDS product -- the exact latency-tolerant navigation work a CPU brain
serves. So Phase C can push a VBA FPS game's monster pathing onto a CPU
brain to free a GPU, and the monsters keep chasing the player through
corridors without a hitch. The VBA game is now a full peer of the WebGL
engine on the shared bridge: same nav field, same threat field, same
player field, same scheduler.

USAGE (documented in modGPUBrainSteer.bas): call GPUBrain_Tick with
hasPlayer:=True + the player x/z; in the enemy update, replace the
straight-at-player heading with GPUBrain_SteerBlendPlayer(e.x, e.z,
dirX, dirZ).

### v2077 -- fleet-aware cell-tracking cluster dispatch (accel step 1 of 4)

The Cell Tracking panel already fanned whole samples across LAN boxes,
but the split was blind round-robin (samples.forEach i % nodes) -- every
box got the same count regardless of speed, so the cluster finished only
as fast as its SLOWEST box. Fixed: weight each box's share by how fast it
actually is.

HOW THE WEIGHT IS CHOSEN (best signal available, per box):
1. MEASURED throughput -- samples/sec learned from that box's own
   completed runs (EWMA 0.6/0.4, learns in ~2 runs), persisted in
   _clusterThroughput. This is the truth once a box has run.
2. BRAIN-SPEED PROXY -- first run has no history, so fall back to the
   fleet scoreboard: a box with a fast GPU/CPU brain (low solveMsEwma)
   is likely a fast detection box. gpuBrainBridge.fleetSpeeds() exposes
   this; weight = 1000/ms.
3. DEFAULT 1.0 -- no brain, no history -> even split (original behavior).

THE SPLIT: largest-remainder assignment -- each box gets round(frac*N)
samples, remainder to the largest fractional parts, so totals ALWAYS sum
to N and faster boxes get proportionally more. Verified: even (7/7/6 with
no data), brain-proxy (11/3/6 for 3ms/12ms/6ms boxes), measured (17/3 for
a 5x-faster box), all summing to 20. Each completed node records its
throughput so the NEXT run's split is sharper -- the cluster self-tunes.

THE UI: the cluster state line now shows the basis, e.g.
"fleet-aware split -- galaxina 11 (brain-proxy) . purtygf 3 (measured)",
so it is transparent WHY each box got its share.

WHY THIS IS STEP 1: detection is embarrassingly parallel across time and
the code's own docstring calls it the dominant cost, so spreading it well
is the biggest whole-run win per unit effort -- and it reuses the fleet
scoreboard (v2072-75) directly. It also MULTIPLIES the next steps: when
the GPU detector kernel (step 2) lands, a GPU box's measured throughput
jumps and this splitter automatically routes more work to it. No
re-wiring needed.

NEXT (accel steps 2-4, planned): (2) GPU detector kernel -- separable 3D
Gaussian + local-maxima on WebGPU, the "GPU/cell translator", 10-50x the
per-frame smoothing, biggest single-box win; a new WebGPU compute service
sharing the brain's Deno runtime + this dispatch, NOT the flow-field
brain itself. (3) Sparse tracker cost matrix -- spatial-hash prefilter so
cdist only considers detections within max_link_distance; small, CPU-side.
(4) Visualization polish -- higher-res volumes / better transfer functions
on the existing WebGPU ray-march; incremental.

### v2078 -- GPU detector kernel (accel step 2 of 4: the GPU/cell translator)

The detector's dominant cost is Gaussian-smoothing each (Z,Y,X) frame before
peak-finding. A 3D Gaussian is SEPARABLE (one 1D pass per axis) and each pass
is embarrassingly parallel per voxel -- the textbook GPU win. Built it.

WHAT SHIPPED:
- cell-tracking/src/gpu_smooth.mjs -- a Deno + WebGPU service: separable 3D
  Gaussian on compute shaders, ping-pong buffers, reflect-101 edges, one WGSL
  module reused for all three axes (axis-select stride, no transpose). Refuses
  a software adapter, exactly like the brain. Length-prefixed binary
  stdin/stdout protocol so Python needs no extra deps. Reuses the brain's
  own Deno runtime (which the engine already auto-installs) -- NOT the
  flow-field brain itself, a sibling compute service.
- cell-tracking/src/gpu_smooth.py -- spawns + warm-keeps that service, streams
  frames to it. CONTRACT: any failure (no deno, no GPU, software adapter,
  protocol error) raises, and detector.py catches it and falls back to scipy.
  GPU is a speedup, NEVER a dependency -- the pipeline always runs.
- detector.py / run_pipeline.py -- use_gpu threaded through; --gpu flag; the
  GPU path pins workers=1 (one GPU stream beats many processes each spawning
  their own deno). Only the SMOOTHING moves to the GPU; scipy's exact
  peak_local_max runs on the result, so detections match the CPU path.
- server.html -- a "GPU smoothing" toggle by the Run button, wired into both
  single runs and cluster runs (forwarded to every node, per-node CPU
  fallback).

CORRECTNESS, verified: on realistic fluorescent-nuclei blobs, the
GPU-equivalent separable smoothing produces BYTE-IDENTICAL peaks to the scipy
path (peak_local_max sets equal). Interior smoothing matches skimage to 0.002;
borders differ by edge convention, but so do skimage vs scipy themselves
(0.085), and cells are not at borders. So this is a pure speedup with no
detection drift.

COMPOUNDING WITH STEP 1: when a GPU box runs with --gpu its measured
cell-tracking throughput jumps, and the v2077 fleet-aware splitter AUTOMATICALLY
routes more samples to it next run -- no re-wiring. Steps 1+2 multiply.

NEXT: (3) sparse tracker cost matrix -- spatial-hash prefilter so cdist only
considers detections within max_link_distance; small, CPU-side. (4) viz polish
on the existing WebGPU ray-march.

### v2079 -- cell-tracking accel steps 3 + 4 (sparse tracker + viz polish)

STEP 3 -- SPARSE TRACKER COST MATRIX. link_frames built a full MxN
scaled_distance matrix between every active track and every detection each
frame, then forbade pairs beyond max_link_distance -- but on dense frames the
vast majority of those pairs are impossible links, and at scale cdist + the
MxN matrix dominate (measured: n=3000 -> cdist 444ms, matrix 68MB). Added a
uniform spatial hash sized to the link radius (in PHYSICAL um, since z is 4x
coarser): _sparse_link_pairs bins detections and, per track, tests only its
own + 26 neighbor bins, computing distances in one vectorized pass.

HONEST CROSSOVER (measured, not assumed): sparse is only worth it at scale.
n<=2000 dense is as fast or faster and simpler; n=3000 sparse is 4.7x
(537ms -> 115ms). So the tracker uses dense below 1500 cells/frame, sparse
above. Verified IDENTICAL matches at every scale (the sparse path only omits
pairs scaled_distance would forbid anyway) -- a pure speedup on dense data, no
behavior change on typical frames. (An early loop-based version was actually
SLOWER than one vectorized cdist; caught it by measuring, rewrote to a
batched vectorized fill.)

STEP 4 -- VISUALIZATION POLISH (on the existing WebGPU ray-march, not a
rewrite). export_volume normalized each frame by GLOBAL min/max, so a single
saturated voxel compressed every real nucleus into the low bins -- a faint
cell read as 7/255, near-invisible. Replaced with a per-frame ROBUST
normalization: clip to a high percentile (default 99.5) so hot spots don't
dominate, then a tunable gamma to lift dim nuclei. Same faint nucleus now
reads 255/255. Both are tunable (--max_dim / --gamma / --clip_pct, and via the
bridge opts), but the DEFAULTS already improve every export -- no payload cost
(still one uint8 per voxel).

ALL FOUR ACCEL STEPS COMPLETE: (1) fleet-aware dispatch, (2) GPU detector
kernel, (3) sparse tracker, (4) viz polish -- spanning the whole pipeline from
LAN distribution through per-box compute to the 3D view, each verified and
each falling back cleanly when its fast path is unavailable.

### v2080 -- cell-tracking CORRECTNESS fixes (audit findings 1-3, not speed)

A clean-eyed read of the pipeline surfaced real quality holes, distinct from
the v2077-79 speed work. Fixed the three that actually cost competition score:

1) ANISOTROPIC SMOOTHING (the biggest detection bug). The detector applied a
SCALAR gaussian sigma equally to z/y/x, but voxels are 4x taller in z
(1.625 vs 0.40625 um). So sigma=1.5 blurred 2.44um in z but 0.61um in x/y -- a
4x over-smear along z that shifts and MERGES peaks. Now _axis_sigma() scales
sigma per axis by voxel size for physically ISOTROPIC blur. Verified: two
nuclei separated in z that the old isotropic blur merged into ONE peak are now
correctly resolved as TWO. Threaded through BOTH the scipy path (per-axis
tuple) and the GPU smoother (protocol extended to 3 per-axis sigmas; the WGSL
already read radius from the uniform, so one kernel per axis, no recompile).

2) GAP-CLOSING (biggest tracking bug). A track ENDED the instant it was missed
once -- and real microscopy drops detections constantly (dim frames,
occlusion, threshold flicker). On reappearance the cell became a false NEW
track, breaking the edge continuity the metric rewards AND spawning a spurious
lineage: double damage. Now a track COASTS at its last position for up to
max_gap frames (default 2), keeping its node_id so a re-link connects straight
back to the pre-gap lineage. No node is invented for the missed frame.

3) EMPTY-FRAME BLAST RADIUS. One frame with zero detections set active=[],
ENDING EVERY track in the movie at once (a single z-stack glitch or bright
artifact severed all lineages). Now an empty frame just coasts every track
(one miss), so tracks within max_gap survive.

VERIFIED TOGETHER: a cell moving through a MISSED + EMPTY frame stays ONE
continuous lineage (3 edges) with the fixes, vs TWO broken lineages under the
old behavior. Also cleaned a dead if/else branch in the new-cell path (audit
item 8; both sides did the same append).

All tunable: --max_gap on run_pipeline (0 restores old single-miss-ends
behavior). Deliberately LEFT for later (honest baseline scope): learned/temporal
detection (audit 5), sub-voxel centroids (6), per-frame adaptive threshold (7),
and a cleaner division model (4) -- all real, none a quick patch.

### v2081 -- cell-tracking quality: 3 patches + learned-detector scaffold

Following the v2080 audit, built the three safe-on-synthetic patches and a
scaffold for the learned detector (which needs real data to be worth training).

PATCH -- ADAPTIVE THRESHOLD (audit 7). estimate_threshold picked ONE threshold
for the whole movie, so photobleached later frames under-detected. detector.py
--adaptive computes a per-frame threshold from that frame's own background +
dynamic range, floored at 0.5x the global estimate so a truly empty frame does
not detect noise. Verified: at 80% bleaching the global threshold found 0/4
cells, adaptive found 4/4; on a noise-only frame both correctly found 0 (the
floor prevents hallucination).

PATCH -- SUB-VOXEL CENTROIDS (audit 6). peak_local_max snaps to integer
voxels; --subvoxel refines each peak to the intensity-weighted centroid of its
3x3x3 neighborhood (background-subtracted). Sharper positions => more correct
metric matches, and it matters most in the coarse z axis. Verified on off-grid
synthetic centers: mean localization error 0.578um -> 0.533um.

PATCH -- CLEANER DIVISION MODEL (audit 4). The old rule only fired when TWO
detections were BOTH left unmatched by the Hungarian pass -- but at a real
division one daughter is usually close enough to be grabbed as a 1-to-1 match,
leaving one unmatched daughter, so the division was MISSED. Rebuilt: a fork is
recorded wherever a parent has BOTH a matched child AND a nearby unmatched
detection within division_distance -- producing the out-degree>=2 node the
metric scores (+0.1*division_jaccard). Verified: the matched+unmatched-daughter
case (which the old logic dropped) now yields a fork; a simple moving cell
still produces no false fork.

SCAFFOLD -- LEARNED DETECTOR (audit 5). detector_learned.py: a drop-in with the
SAME contract (volume -> dict[t] -> (z,y,x) centroids), a compact anisotropic
3D U-Net (stride-1 in z, respecting the coarse axis), inference that peak-picks
the predicted heatmap through the same peak_local_max/sub-voxel path, and a
train_from_geff entry point stubbed with the exact recipe + shapes. It is
HONEST: available() is True only when torch AND a trained model are actually
present; otherwise --learned transparently falls back to the classical detector
and says so (verified). No weights ship -- training on synthetic blobs would fit
the generator, not real cells. Ready to train the moment real royerlab data +
geff labels are on a box.

All flags plumbed through run_pipeline (--adaptive/--subvoxel/--learned/
--max_gap), the bridge, the single-run UI toggles, and cluster dispatch (each
node inherits them). Nothing changes default behavior unless a flag is set.

### v2082 -- AutoRemesher integration (quad remeshing / retopology)

Wired huxingyi/autoremesher (MIT) as an external tool, matching the
cubvh/cuda_voxelizer/ComfyUI pattern: mesh in -> clean QUAD topology out, as a
timeout-guarded subprocess that NEVER becomes a hard dependency (any failure
keeps the original mesh). It turns dense generated meshes (Trellis /
ComfyUI-3D / cuda_voxelizer output) into riggable quad topology, and makes LODs
via a target-quads count. Input formats OBJ/STL/PLY; prebuilt-release deps
(CGAL, OpenVDB, Geogram, libigl, TBB, Qt) are bundled.

WHAT SHIPPED:
- autoInstall.js -- an "autoremesher" registry entry (app tier): binary
  detection across the known prebuilt-release + built-from-source locations,
  and a link-install to the releases page (deps bundled -> prefer the exe;
  build-from-source with VS2022/CMake+TBB is the fallback).
- ai-bridge/remeshBridge.js -- findBinary(), status(), remesh(). The subprocess
  is hard-killed on timeout (default 3 min) because the Blender-addon fork
  documents AutoRemesher can HANG on some meshes; on timeout/crash/exit!=0 the
  original mesh is kept.
- routes /remesh/status (GET) and /remesh/run (POST, trusted-only).

HONEST CLI DISCOVERY (the important part -- our standing rule: never bake
un-verified invoke commands, prior AI docs fabricated them). The 1.0.0 release
added a CLI with adaptivity / sharp-edge / smooth-normal / target-quads params,
but the EXACT flag spellings are NOT documented upstream. So remeshBridge does
NOT hardcode flags: it probes `autoremesher --help` at runtime, extracts the
real flag tokens it actually sees, and invokes with those. If it cannot verify
how to pass input/output, it REFUSES to run a guessed command and asks for a
SWEK_AUTOREMESHER_ARGS="{in} {out} ..." template instead. Verified: absent ->
honest "not installed" status; unverified + no template -> refuses; template or
verified-flags -> builds the correct argv from the discovered/real spelling.

NEXT (not built): a UI panel entry (status chip + "remesh this asset" +
target-quads slider) once someone confirms the real --help output on a box with
AutoRemesher installed, so the discovered flag names can be sanity-checked
against a live binary; and a post-processing pipeline stage (weld -> remesh ->
normals) wiring remesh() into MeshPostProcessor.

### v2083 -- AutoRemesher "Get --help" button in the installer panel

Where the installer lives: Settings -> Auto-Install (rendered in main.js from
/autoinstall/list). AutoRemesher already shows there as an "app"-tier row (from
the v2082 registry entry) with a "Get it" link to the releases page.

Added a "Get --help" button to that row (only for the autoremesher item). It
calls /remesh/status, which now returns the RAW --help text the bridge probed
from the installed binary, and shows it in a read-only, copyable textarea with a
Copy button. The box leads with the binary path, whether the CLI was
auto-verified, and the discovered flag tokens, then the full raw --help output
under a "copy all of this and report it back" header.

This closes the loop on the v2082 honesty note: rather than guessing the CLI
flags, the user installs AutoRemesher on a box, clicks Get --help, copies the
output, and reports it back -- then the discovered flag names can be checked
against a live binary and the UI panel + post-processing pipeline stage finished
against verified syntax. When AutoRemesher is absent the box shows the install
note instead.

remeshBridge.status() now includes `help` (the raw probe output). No behavior
changes anywhere else.

### v2084 -- AutoRemesher build-from-source (the "build as fallback" path)

v2082 wired binary-first detection but left build-from-source as docs only.
Now it is a real button, modeled exactly on the existing box3d-build precedent
(status/log/build routes + a global build-state object + prereq detection +
single-build guard + streamed log).

WHAT SHIPPED:
- tools/build-autoremesher.sh -- clones huxingyi/autoremesher at the pinned
  1.0.0 (MIT) tag, runs the README's exact `cmake .. && cmake --build .` (NO
  invented CMake flags -- upstream does not document options, so we do not
  guess), finds the produced autoremesher binary, and stages it to
  vendor/autoremesher/. Fails early + clearly on missing git/cmake/C++
  compiler, warns on missing libtbb-dev, and prints the SWEK_AUTOREMESHER
  export line.
- Detection updated in BOTH places (autoInstall "files" paths and
  remeshBridge CANDIDATE_PATHS) to include vendor/autoremesher/, so a built
  binary is picked up with no extra config.
- Routes /remesh/build (POST, spawn one at a time), /remesh/build-status
  (prereqs + artifact + build state + per-OS hints), /remesh/build-log (raw
  tail) -- trusted-only, mirroring /box3d/*.
- UI: a "Build from source" button in the AutoRemesher install row beside
  "Get --help". It checks prereqs first (shows what's missing + the per-OS
  install hint), streams the build log live, and on success refreshes the row
  to Installed. Native CMake build, not WASM; Windows via WSL/git-bash or
  native CMake+VS2022.

STILL NOT AUTO-INSTALL: the row remains manual (link/build only) -- it never
installs itself on first run. Both getting-it paths (download the prebuilt
release, or click Build from source) are explicit user actions, by design.

### v2085 -- Mojo experiment: is it worth it? (prove-it-first, not a commitment)

Question raised: should Mojo be an install option? Honest answer: not as a
pipeline dependency yet (beta 1.0.0b2, compiler closed-source until fall 2026,
Linux/macOS only, and nothing in the engine uses it). But it targets EXACTLY
our kind of workload -- Python with hot inner loops -- so instead of guessing,
we built an experiment that measures it on the user's own hardware.

THE EXPERIMENT (experiments/mojo-subvoxel/):
- subvoxel.mojo -- a Mojo port of detector._refine_subvoxel (the sub-voxel
  centroid loop: an intensity-weighted centroid over a 3x3x3 window per
  detection). The NumPy version pays per-patch overhead (np.clip/np.sum/np.mgrid
  on 27 voxels); a compiled scalar loop should erase it. Written against Mojo's
  stable core + Python interop; if a stdlib symbol has moved, the harness prints
  the error verbatim so the exact spelling can be pinned from the user's build
  (same "verify, don't guess" discipline as the AutoRemesher CLI).
- bench.py -- the harness: VERIFIES the Mojo output is identical to NumPy
  (<1e-9) before timing, then compares across 100/500/2000/8000 detections.
  Falls back to NumPy-only (still a useful baseline) if Mojo is absent, printing
  why. Sandbox NumPy baseline: ~5ms @100 up to ~387ms @8000 detections -- lots
  of headroom for a compiled loop to win.

INSTALL + DETECT + RUN, from the panel (Settings -> Auto-Install -> Mojo row):
- ai-bridge/mojoBridge.js -- detect (mojo on PATH + version, and whether uv/pixi
  are present), a scripted uv install (VERIFIED command:
  `uv ... install mojo --extra-index-url https://modular.gateway.scarf.sh/simple/
  --prerelease allow` -- the --prerelease flag is required for the 1.0.0b2 beta),
  and runBenchmark (prefers `mojo run bench.py`, else python3 for the NumPy
  baseline). Refuses to install on native Windows (Mojo needs WSL2).
- routes /mojo/status, /mojo/install (+ /mojo/install-log), /mojo/benchmark
  (trusted-only).
- UI: a "mojo (experimental)" row (manual, never auto-installs) with Detect /
  Install (uv) / Run benchmark buttons + a live output box.

THE PLAN: install Mojo on a box (Linux, or the Intel Mac), click Run benchmark,
report the numbers. If Mojo meaningfully beats NumPy on this loop AND the result
is byte-identical, it earns a real place -- and only then do we wire it into the
detector with the same fallback discipline (Mojo path when built, NumPy
otherwise). If it does not, we learned that cheaply and move on.

### v2086 -- Mojo experiment: Google Colab notebook (no local install needed)

Clarified + expanded the Mojo experiment's reach. Two corrections/additions:

FACT CHECK: Mojo runs on Linux AND macOS -- it's WINDOWS that lacks a native
build (needs WSL2). So the Intel Mac runs it natively (CPU path, which is what
the sub-voxel benchmark measures); the Windows fleet boxes are the awkward ones.

CLOUD: Google Colab is OFFICIALLY supported by Modular (a %%mojo cell magic,
GPU-backed runtimes with T4/L4/A100). Kaggle is not officially supported and its
offline-submission rule fights Mojo's installer -- ironic since the cell-tracking
pipeline is itself a Kaggle competition, but it means Colab is the clean path for
DEVELOPING/benchmarking kernels while Kaggle stays the submission target.

SHIPPED (experiments/mojo-subvoxel/):
- mojo_subvoxel_colab.ipynb -- a self-contained Colab notebook (generated by
  build_notebook.py, so the JSON is always valid): installs Mojo, runs the CPU
  sub-voxel comparison (NumPy vs a Mojo port, VERIFIES identical <1e-9 before
  timing), and demos a Mojo GPU kernel on Colab's NVIDIA hardware. Every Mojo
  cell prints build errors verbatim so a beta stdlib drift can be pinned from the
  user's run (verify-don't-guess). Validated: JSON well-formed, all cells
  structurally valid, the NumPy baseline cell executes correctly here.
- build_notebook.py -- regenerates the notebook after edits.
- README.md -- the two run paths (Colab recommended; fleet box via the engine's
  Mojo panel from v2085).

WHY COLAB IS THE RIGHT TEST BED: it sidesteps the Windows-WSL limitation and the
Intel-Mac (CPU-only for Mojo GPU) limitation entirely, and gives real NVIDIA GPUs
to test Mojo's actual headline feature -- GPU kernels in the same language, no
CUDA -- which is the direction that would matter most if Mojo earns a place.

### v2087 -- fix: the GPU Brain window stayed open across a version update

Reported: after a SweK update the old GPU Brain window is still open. Root-
caused to TWO paths, both fixed (the same version-skew footgun the node-kill
was written for, but the brain was missed):

1. Start_Everything.bat `start`ed a NEW brain window every run WITHOUT killing
   the old one. On an update you got two windows -- and the OLD brain (old
   code) polling the NEW bridge = version skew. Fixed: before launching, kill
   any deno process whose COMMAND LINE matches brain.js (so only OUR brain
   dies, not unrelated deno procs) + close a lingering "SweK GPU Brain" window
   by title. The match runs from a temp .ps1 (not inline) because inline
   PowerShell with quotes/pipes/braces inside a batch (...) block is a known
   parsing footgun -- verified the generated PowerShell is well-formed.

2. The engine SELF-UPDATE (_scheduleRestart) respawns node DIRECTLY, not the
   launcher, so it never touched the brain at all -- the old brain survived a
   peer-pulled auto-update entirely. Fixed: _scheduleRestart now kills the
   stale brain and relaunches a fresh one via the new brainProcess.js before
   respawning node.

NEW ai-bridge/brainProcess.js centralizes brain lifecycle so both paths
converge: killStaleBrain() (cmdline-matched, cross-platform: PowerShell on
Windows, pkill -f on mac/linux), launchBrain() (uses START_BRAIN.bat on
Windows / the same deno flags on mac/linux; no-op if Deno absent, since the
brain is optional), restartBrain(). Safe by construction -- never throws into
the caller, clean no-op when nothing is running (verified).

Also added POST /brain/restart (trusted-only): manually clear a stale brain +
relaunch without restarting the whole engine, as a safety valve if a leftover
window ever appears again.

### v2088 -- the brain now NOTICES a sibling and coordinates (in-band)

Question: shouldn't the GPU Brain be smart enough to detect another brain and
sort it out, instead of relying on the launcher to kill the old process? Answer:
it wasn't (the brain is a fire-and-forget POLLER -- it posts fields and never
reads who else is posting), but now it is. The BRIDGE always knew (it tracks
every brain's identity for fleet scoring); we just taught the brain to ask.

THE HANDSHAKE (newest-wins):
- On boot, BEFORE its first solve, a brain POSTs /ai/brain/hello with its
  identity + startTime. If a live sibling (same GPU + role) already exists, the
  bridge arbitrates by startTime: the newer brain keeps running (it has the
  newer code after an update), the older is flagged to retire. The newcomer is
  told to proceed or, if an even-newer brain is somehow already live, to bow out
  immediately instead of duplicating work.
- The retire flag rides back on the OLD brain's next field-POST response
  (checked before the scheduling early-return, so it always applies). On seeing
  it, the old brain saves weights + replay buffers and exits gracefully -- no
  external kill, no lost learning.

Bugs caught + fixed in testing:
- Zombie sibling: a brain flagged-to-retire but not yet stepped down was still
  "live", so a third brain re-flagged IT instead of the real current brain.
  Fixed: _liveSibling skips already-retiring brains and returns the NEWEST live
  sibling. Verified a 3-brain chain: each newcomer supersedes the true current
  brain, only the final survivor keeps running.
- Boot race: if the bridge isn't up yet, hello fails -> null -> the brain just
  proceeds (a poller tolerates a missing bridge). Verified.

RELATIONSHIP TO v2087: the process-kill (launcher + self-update _scheduleRestart)
STAYS as belt-and-suspenders -- it guarantees cleanup even for a wedged brain
that can't self-report. v2088 is the smart in-band layer that handles the common
case cleanly: the new brain notices the old one, and the old one retires itself.

### v2089 -- KPop listener: fix minimize-lost-on-update + brain kill in the REAL launcher

Two user reports, and an important correction about which launcher is live.

CORRECTION: the user runs START_NODE_Engine.bat, a ROOT launcher that sits
ABOVE WebGLEngine/ (in the distribution root, alongside START_BUN_Full.bat
etc.). Prior brain/KPop launcher edits (v2087) went into
WebGLEngine/Start_Everything.bat -- a DIFFERENT launcher the user does not run.
The root launchers ARE part of every build (they ship at EngineProject_vNNN/),
they just live outside the WebGLEngine subtree the ship ritual usually edits.
Fixes below went into the ROOT launchers.

Q1 -- "should the KPop listener exit on update like the 2nd brain tells the 1st
to close?" It ALREADY does, and it's the mature version of the brain handshake:
kpop-guard.ps1 runs before the launch and arbitrates by version -- same-version
listener heartbeating => exit 42 (skip, leave it alone); different-version alive
=> gracefully stop it (control-file 'exit', wait for cleanup, then Stop-Process
on the published pid) and launch new. No new work needed.

Q2 -- "was minimizing fine, now terminates instead of minimizing." ROOT CAUSE:
the minimize flag lived ONLY at WebGLEngine/ai-bridge/kpop_minimize.flag --
INSIDE the versioned tree. Every engine update replaced WebGLEngine wholesale
and WIPED the flag, silently reverting "start minimized" to off. So: toggle on
(works) -> update -> flag gone -> listener opens un-minimized again, forever.
What the user saw as "terminating instead of minimizing" is the guard stopping
the old listener to replace it + the new one coming back un-minimized because
the flag was lost.
FIX: persist the flag in the STABLE KPopListener temp dir
(%TEMP%\KPopListener\kpop_minimize.flag) -- the same update-surviving location
the listener already uses for its runtime state. server.js /kpop/minimize now
writes there (and keeps the legacy in-tree flag in sync for older launchers);
all four root launchers that read the flag (START_NODE_Engine, START_BUN_Full,
START_BOTH, START_SERVER) now check the stable path first, then the legacy
in-tree path. The preference now survives updates.

ALSO: added the stale-brain kill to START_NODE_Engine.bat (it had none -- the
v2087 kill went into the wrong launcher). Same temp-.ps1 cmdline-matched deno
kill as Start_Everything.bat, before the brain launch. This is belt-and-
suspenders behind the v2088 in-band sibling handshake -- for a wedged brain
that can't self-report.

### v2090 -- the GPU Brain now launches on macOS (Apple Silicon + Intel)

Finding: the brain was NEVER starting on the Mac. The Mac launcher
("Start Mac SweK Engine.command") started the bridge + KPop listener but had NO
brain launch, and the only brain launchers were Windows .bat files. So Stellar
Atlas never ran a brain at all.

SHIPPED:
- brain/start-brain-mac.sh -- a macOS brain launcher that:
  * auto-installs Deno on first run via the official installer (curl ... |
    DENO_INSTALL=$HOME/.deno sh; no admin), and finds an already-installed one;
  * tries the GPU brain FIRST (deno run --unstable-webgpu ... brain.js). On mac
    we do NOT pin WGPU_BACKEND -- the Windows launcher pins vulkan for Pascal
    NVIDIA, but wgpu's default on Apple is METAL, so pinning would break it;
  * watches the first ~6s: if the brain exits with the software-adapter refusal
    / no-adapter / navigator.gpu-missing signal (which initGPU() throws by
    design on a box with no real GPU), it transparently RELAUNCHES as the CPU
    brain (BRAIN_BACKEND=cpu, exact Dijkstra). Fallback detection verified
    against initGPU()'s actual error strings.
- "Start Mac SweK Engine.command" now runs start-brain-mac.sh after the bridge
  binds (so the poller connects at once) and before opening the browser,
  wrapped in `|| true` so a brain problem never aborts the launcher (set -e).

M-SERIES CHECK (as asked): the brain is already Apple-Silicon-ready as written.
initGPU() requests a generic high-performance adapter, refuses only software
rasterizers (none of which are Metal), and requests a default device with NO
NVIDIA-specific limits/features -- so on M-series wgpu returns a Metal adapter
(vendor 'apple') that passes the assert and runs on the GPU. The compute
shaders use @workgroup_size(8,8)=64 threads, a multiple of both NVIDIA's warp
(32) and Apple's SIMD width (32) and well under all limits -- portable, no
retuning. Net: Apple Silicon -> GPU (Metal) path; Intel Mac -> likely CPU
fallback (its integrated GPU is often refused), which is the right call and not
a downgrade (CPU brain is exact where the GPU one approximates). Either way the
Mac now joins the fleet (posts fields, sibling handshake, scoring).

### v2091 -- PetFBI Lost Pet Board in the engine + Outlook email ingest

Two threads shipped.

1) GRAPH_VIEWER WASM -- BUILT, VERIFIED, NOT WIRED (honest result). Wrote
   vendor/wasm/graphlayout.ts (AssemblyScript, matches the existing kernel
   style): repulse(n,kRep,grav,damp,cooling) does the O(n^2) all-pairs
   repulsion+gravity from graph_viewer's stepLayout, integrate(n) does pos+=vel;
   spring/edge pass stays in JS. Compiled to graphlayout.wasm (540 bytes).
   Output verified IDENTICAL to the JS to 7.6e-6 (f32-vs-f64 rounding only).
   BUT measured only 1.07-1.14x vs V8 across n=500..5000, and -- critically --
   it does NOT raise the ~1.5k node ceiling (both JS and WASM hit ~48fps at
   1500 nodes) because the O(n^2) ALGORITHM is the bottleneck, not the language.
   So the kernel ships in vendor/wasm with an honest README note but is NOT
   wired into the page: shipping a 1.1x that users can't feel would be
   dishonest. The real ceiling-raiser is Barnes-Hut (O(n log n)) or a GPU path;
   left as an offer, not built on a marginal number.

2) PETFBI LOST PET BOARD -- now a first-class engine page + fed by Outlook.
   - petfbi-board.html: the Supabase-cloud coordination board (built earlier via
     the Excel->WebApp kit) copied into the engine tree and registered in
     server.html Tools as "Lost Pet Board" (distinct from the existing
     petfbi.html panel). Cloud-first Supabase with localStorage fallback, the
     five-status flow (New/Needs info/Claimed/Posted/Archived), Admins tab,
     the "who are you" picker, and the anti-double-post guards ported faithfully.
   - EMAIL INGEST: reports come from the Outlook rules (which already have a
     "petfbi" action). Added a parser -- parsePetFbiEmail() in the page and a
     mirror parsePetFbiBoardEmail() server-side -- that FLATTENS a PetFBI report
     email into just what the board + FB-post template need: title, petType,
     SEX (drives the post's he/she -- the one detail Keith keeps), status
     (Lost/Found->new, Reunited->archived), the report link, Pet FBI Report ID
     (dedupe key), and location. All the other report detail (breed/color/
     weight/age/collar/coat) is intentionally dropped.
   - TWO PATHS (as chosen): (a) a "Paste email" box in the board that previews +
     ingests with dedupe-by-reportId (a Reunited follow-up archives the earlier
     Lost/Found for the same pet); (b) a bridge endpoint POST /petfbi/board-ingest
     that flattens raw email text into the report shape, so the Outlook rule can
     auto-feed. Both parsers verified identical against Keith's real sample
     (Lost Cat - Winston, ID 801272, M/F Male -> sex Male, location extracted).
   - New report fields sex/reportId/location added to the data model, the DB
     mapping (round-trips verified), the embedded setup-guide SQL (three new
     columns), the report form, and the card (shows sex as the FB post needs it).
   - Stays a COORDINATION board only -- no scrape/map/auto-post; posting stays
     assisted-never-auto, matching the PetFBI README rule.

### v2092 -- Lost Pet Board: PawBoost ingest too (dual-source, tagged)

The board now ingests BOTH PawBoost and Pet FBI report emails into one board,
tagged by source. Same minimal output shape either way.

- parsePawBoostEmail() (page) + parsePawBoostBoardEmail() (server): PawBoost uses
  label-on-one-line / value-on-NEXT-line, and its subject carries the summary
  ("Have you seen Storm? Lost cat in Providence, RI 02909 (ID: 73095374"). We
  pull name/species/sex/PawBoost-ID/location + the nearest LANDMARK (kept -- it's
  useful in the post), and the pawboost.com landing URL. Verified against Keith's
  real Storm sample: "Lost Cat - Storm", Female, id 73095374, landmark
  Atwells/broadway, link captured.
- parseReportEmail()/parseReportBoardEmail() auto-detect the source (pawboost if
  the text mentions pawboost or matches the "Have you seen ...?" subject, else
  petfbi) and dispatch. The "Paste email" box and POST /petfbi/board-ingest both
  use the dispatcher, so either source Just Works.
- Report model gained source + landmark; DB round-trip mapping, embedded
  setup-guide SQL (two new columns source/landmark), and dedupe all updated.
  Dedupe is now scoped by source+reportId (ids could collide across sources).
- Card shows a source badge (PawBoost / PetFBI) next to pet type + sex.
- Verified end-to-end: one board holding a PetFBI Winston + a PawBoost Storm,
  each correctly tagged, sexed, and (PawBoost) landmarked.

NEXT (not built -- waiting on Keith's real page JSON-LD + his existing VBA):
GPS coords + pet-pic + auto-generated flyer image live in the PAGE HTML (both
sources), not the email. Plan: extend petfbi_grab.py (already grabs JSON-LD /
og / all image URLs via Camoufox) for GPS + flyer-vs-pic identification, add a
pawboost_grab.py sibling, download images to local files, and compose the two FB
posts (MA Lost Pets = pic+map+info; official Lost Dogs/Cats MA = flyer+info).
KEY MECHANIC from Keith: the VBA does NOT use any FB API -- it waits for the
admin to click "add photo", watches the OS file-open dialog by window title,
injects the post text into the composer, and pastes image PATHS via the file
dialog's filename field (map image path into the name field), then Enter loads
both images and the admin clicks Post. So the board must hand the VBA: the
composed TEXT + local FILE PATHS to the images. ~5 posts/hour, human-paced,
assisted-never-auto. Build this against Keith's pasted JSON-LD + ported from his
existing VBA rather than guessing selectors.

### v2093 -- brain DOS windows now close when the brain exits

Symptom (Keith): 3 GPU Brain windows open at once; two showed
"Press any key to continue . . ." with a frozen skip counter, one was still
live (skip counter climbing). So the two dead ones had ALREADY EXITED -- the
sibling-retirement handshake WORKED -- but the cmd window lingered.

ROOT CAUSE: brain/START_BRAIN.bat (and START_BRAIN_CPU.bat) ended with an
unconditional `pause`. When brain.js exits for ANY reason -- retired by the
sibling handshake (Deno.exit(0) at brain.js ~2321), a clean stop, or a crash --
control returns to the batch and parks at "Press any key" forever. NOT a
handshake failure; a launcher-lifecycle bug.

FIX: check Deno's exit code. errorlevel 0 (clean -- includes a retired sibling,
which exits 0) -> fall through, window CLOSES on its own, so a superseded brain
disappears. errorlevel >=1 (crash) -> print the code and `pause` so the
scrollback stays readable. Applied to both START_BRAIN.bat and
START_BRAIN_CPU.bat; both re-normalized to all-CRLF (the edit had flattened
START_BRAIN.bat to LF). Mac start-brain-mac.sh already detaches (nohup &), no
lingering window there.

Net: after this, a retired sibling's window vanishes by itself; only a genuinely
crashed brain leaves a window open, and it tells you the exit code.

### v2094 -- PetFBI pipeline step 1: sheet-sync foundation (JSON snapshot)

The composer will READ Keith's workbook config rather than reinvent it -- Keith
built the Key sheet as a tunable FILTER layer precisely so that when the online
HTML/templates change, he adjusts the spreadsheet, not code. Decisions locked:
(a) the page-HTML grabs (GPS/pic/flyer) become sheet-tunable too, via a new
HTMLKey block, same (target,left,right) shape as Key; (b) the engine reads a
SYNCED COPY as JSON (a locked/open/moved master must never break the board);
(c) format = JSON snapshot (Node reads it trivially, board can display it).

SHIPPED (step 1 of the pipeline build):
- PetFBI/config/sync_sheets.py -- exports the config sheets from Keith's
  workbook (R_clean.xls/.xlsb) to JSON: Key (report-text parse rules + cleanup
  replacements), Templates (post text by status x type, gender placeholders),
  {STATE} Pages (town->FB page routing, MA/RI/CT/NH/ME), HTMLKey (page-HTML
  grabs seeded from the newest VBA: geo_longitude/geo_latitude, og:image pic,
  picture_file fallback, the "reunited with their family" don't-post flag),
  UrlTemplates (report page / pet-pic base / flyer URL), and the Gender fill
  map (Male->he/his, Female->she/her).
- PetFBI/config/petfbi-sheets.json -- the REAL snapshot generated from Keith's
  actual R_clean.xls: 42 Key rules, 4 template statuses (Lost/Found/Spotted/
  Deceased), 338 FB pages (MA 240, RI 38, CT 44, NH 14, ME 2), 5 HTMLKey rules.
  Verified Node reads it trivially (the bridge's job).

This validates the whole "read your sheets" approach against real data. Keith's
workbook stays the master; sync_sheets.py regenerates the snapshot on demand
(the future "sync sheets" button). Full design + build order in
PetFBI/docs/PIPELINE_PORTING_NOTES.md.

NEXT (steps 2-6, own session): bridge page-fetch applying HTMLKey rules -> GPS/
pic/flyer + reunited guard; image download to local paths; template compose
(status x type, gender) from the snapshot; town+statewide routing from Pages;
handoff of composed text + local image paths to the poster's file-dialog
injection (assisted, ~5/hr, never auto).

### v2095 -- PetFBI pipeline steps 2-6 (fetch -> GPS/images -> compose -> route -> handoff)

Built the full report->post pipeline as ai-bridge/petfbiPipeline.js, driven
entirely by the sheet snapshot (v2094) so every layer stays tunable in Keith's
workbook.

- (2) grabFromHtml(html, source): applies the HTMLKey (left,right) rules to the
  fetched page -> GPS (geo_longitude/geo_latitude), pet pic (og:image, with
  picture_file fallback -> images.petfbi.org base), and the "reunited with their
  family" flag. Normalizes the backslash-escaped delimiters so Keith's sheet
  value works whether or not the JSON escape survives. Verified on realistic
  HTML: pulled lat/long, og:image, and the reunited guard.
- (2) URL builders from UrlTemplates: reportPageUrl(id,emailName), flyerUrl(id).
- (3) fetchAndDownload: GET the report page, grab, honor REUNITED->don't-post,
  download Pet.jpg + Flyer.png to a per-report temp folder, and derive a maps
  URL from the GPS. (Live fetch/download not runnable in the sandbox -- no
  petfbi.org egress -- but the path is structured; extraction verified on
  realistic HTML.)
- (4) composePost: fills Templates[status][type] with the report fields and
  resolves the gender pronouns ([GENDER-HE/SHE], [GENDER-HER/HIS]) from the
  Gender map. Fixed the location parser (was treating "US" as the state; now
  picks the real 2-letter US state code, and parses town/zip/street/area).
  Verified across Keith's real samples: Winston (Lost Cat, Male -> his/he),
  Shelby (Lost Cat, Female -> her/she) -- correct pronouns, correct
  "Town, MA - Lost ..." headers.
- (5) routePages: town page + statewide from {STATE} Pages. Statewide tags:
  Town=="Default" (MA Lost Pets, pet+map), Town==type (DOG/CAT official, flyer).
  Town matching upgraded to whole-word contains ("West Brookfield"~"Brookfield")
  mirroring the VBA. Verified: Norwell Dog -> town + MA Lost Pets + Lost Dogs
  Massachusetts(flyer); West Brookfield Cat -> Brookfield town + MA Lost Pets.
  DATA NOTES for Keith's sheet: (a) no CAT-tagged official page exists yet (only
  DOG->Lost Dogs Massachusetts); add a "Lost Cats Massachusetts" row tagged CAT
  if you post cats officially. (b) some town rows have a stale "Log into
  Facebook | Facebook" display name (scraper caught a login redirect) -- the URL
  still routes correctly, but the names could use a cleanup pass.
- (6) assemble: the full handoff object -> { text, images{pet,map,flyer paths},
  gps, mapUrl, pages:[{role,fbPage,images}] }. This is exactly what the poster
  (VBA/Python file-dialog injection) consumes: composed text + per-page image
  sets. Never auto-posts.

Bridge endpoints: GET /petfbi/sheets (inspect the snapshot), POST /petfbi/compose
(text+routing, no network), POST /petfbi/assemble (full: fetch+images+compose+
route). Board gained a "Compose post" button on each report -> shows the filled
post text (copyable) + the pages it routes to.

REMAINING (small, needs live network / Keith's box): confirm the real
petfbi.org page HTML matches the HTMLKey delimiters (tune in the sheet if not);
render an actual static MAP image from the GPS (currently we hand off a maps
URL + coords -- the VBA did a Google-search grab; a proper static-map is the
clean replacement); wire the poster handoff to the actual VBA/Python injector.

### v2096 -- EV: a prominent Play button in the Escape Velocity panel

The Escape Velocity minitab in server.html only exposed the CLOUD/multiplayer
server controls (player counts, start/stop, live pilots -> ev-admin.html, bot
pirates). There was NO link to actually PLAY -- ev-loader.html (the local,
offline-capable flight entry where you drag your EV data file and fly) was
reachable only by typing the URL by hand.

Added a prominent "Play - Stellar Atlas" button at the top of the EV panel
(opens ev-loader.html), with a one-line note that it runs locally/offline once
your EV data file is on the box. Re-titled the panel and moved the existing
server controls under a "Cloud / multiplayer server" subheader so the play
entry point reads first. cgPlay wired next to cgPilots.

Offline note (for Keith): Stellar Atlas is fully offline-capable already -- the
ev/ engine has NO runtime CDN deps and parses the data file locally via
drag-drop. resourceFork.js auto-unwraps MacBinary/AppleSingle/AppleDouble and
handles nova.ndat / .rez / raw resource forks. So offline play only needs the
engine + an EV data file present on the machine; the loader's external links are
one-time "get the data" pointers, not runtime fetches. The P2P "ghost ships"
presence is the only networked part (LAN is fine; not needed for solo flight).

### v2097 -- EV: read Windows EV Nova .rez (BurgerLib BRGR) + multi-file merge

Keith dropped his Windows EV Nova data files (Nova Data 1-6.rez etc.) into the
loader; every one failed with "resourceFork: header out of bounds". Root cause:
Windows EV Nova .rez files are NOT Mac resource forks -- when the .bin files land
in the Plugins dir, Nova converts them to the BurgerLib "BRGR" resource format
(endian-swapping platform data). The engine's resourceFork.js only read the Mac
fork / .ndat / MacBinary / AppleDouble containers, so BRGR fell through to the
raw-fork path and the offsets were garbage.

FIX -- added a BRGR reader to ev/resourceFork.js (parseBRGR), routed to when the
file starts with the 'BRGR' magic. Layout per andrews05/evstuff plugconvert.c +
the Ambrosia forum spec: Header1{sig,version,header2Length} +
Header2{unknown,firstIndex,numEntries} + an offset table
{offset,size,unknown}*numEntries + a map blob (entry 0) holding
MapHeader{unknown,numTypes} + TypeInfo{type,mapOffset,numResources}* +
ResourceInfo{index,type,id,name[256]}*. Endianness wrinkle handled: the
header/offset list is little-endian (Intel) while the map (types + resource
info) is big-endian (Motorola). Each resource's raw bytes are found via its
index into the offset table (no 4-byte length prefix, unlike the Mac data
section). Produces the SAME resource API (count/typeList/list/get/has) as the
Mac parser, so buildUniverse and the whole engine work unchanged. Verified by a
spec-built synthetic BRGR round-trip (two typed resources extracted byte-exact);
caught + fixed an off-by-one in the index->offset mapping during the test.

ALSO -- multi-file merge (mergeForks). Windows Nova splits the universe across
six Nova Data .rez files, but the loader read only one. ev.html now accepts
MULTIPLE files (input multiple + drop-all), parses each, and merges the resource
tables (later files override earlier (type,id) clashes, matching EV's data +
plug-in layering) before buildUniverse. Verified merge across two forks: systems
from both combine, per-resource data pulled from its source fork. Drop hint +
error message updated to tell Windows users to select all six Nova Data files
together. Drop hint in ev.html + ev-loader now mention Windows .rez.

CAVEAT: parseBRGR is validated against a spec-built synthetic file, not Keith's
actual .rez yet (no petfbi.org-style egress needed, but his files aren't in the
sandbox). The real test is dropping the six Nova Data files on Galaxina. If a
real-file quirk shows up (the forum spec had a couple "unknown" fields), the
error/counts line will show container=brgr + resource count, which tells us
exactly where to look. Note: the engine draws vector-triangle ships, so ONLY the
Nova Data files are needed -- Nova Ships/Graphics/Titles/Sounds/music/movies are
irrelevant to the flight engine.

### v2098 -- BRGR (.rez) reader: fixed the map location (it's the LAST entry)

v2097's BRGR reader was wrong: on Keith's real Nova Data files it reported an
insane "46,791,920 resources" (single) / no sÿst (merged). Root cause: I had the
resource MAP at offset-table entry 0. Pulling the authoritative source
(andrews05/evstuff plugconvert.c, the npif2rez writer) showed the real layout:
  header1 | header2 | offsets[numEntries] | "resource.map\0" | [data blobs] |
  mapHeader | typesInfo | resInfo[]
and the MAP is the LAST offset entry (index numResources = numEntries-1), NOT the
first. Entry 0 is the first resource's DATA -- reading it as the map gave a
garbage numTypes and the explosion. Also confirmed per-field endianness from the
source: header1.version, header2, and the offset table are LITTLE-endian (raw
fwrite, no swap); only the map region (mapHeader/typesInfo/resInfo) is
BIG-endian. Resource bytes are at offsets[index - firstIndex], no length prefix.

FIX: parseBRGR now reads the map from offsets[numResources], with the correct
per-region endianness, plus sanity guards (numEntries/numTypes bounds) that fail
fast with a clear message instead of producing 46M phantom resources.

LESSON: v2097's synthetic round-trip test PASSED because I built the test file
with the same wrong assumption (map at entry 0) -- it validated my misreading
against itself. v2098's test is rebuilt to follow plugconvert.c's ACTUAL write
order (map last, correct endianness per field), so it's a real check: 2 systs +
1 ship, names decoded, all data byte-exact.

STILL synthetic (Keith's real .rez aren't in the sandbox), but now matched to the
authoritative writer. The real test is dropping the six Nova Data files on
Galaxina again; if it still misses, the counts line (container=brgr + count) or
a specific guard message will pinpoint it.

### v2099 -- EV: cache the loaded data (auto-restore) + Forget/swap for plug-ins

CONFIRMED WORKING FIRST: Keith dropped his six Windows Nova Data .rez files on
v2098 and got "545 systems, 411 stellars, 288 ships, merged(brgr x6)" -- correct
EV Nova galaxy, fully offline. The BRGR reader + multi-file merge are validated
on real files.

Added persistence so he doesn't re-pick six files every launch:
- IndexedDB cache (db "swek-ev"): on a successful load, the RAW file bytes are
  cached (not the parsed universe -- keeps it format-agnostic and lets plug-in
  swaps re-parse). On launch, evTryRestore() reads them back, rebuilds File
  objects, and re-runs the same load path automatically -> straight to the
  galaxy map, no drop. Counts line shows "· cached" when restored.
- "Forget data" button (hidden until data is loaded): clears the cache and
  returns to the drop screen, so Keith can load a DIFFERENT set or add a plug-in.
- Verified the full save->load->restore->clear cycle over a real http origin in
  Playwright (IndexedDB is denied on opaque/file origins): 6 files stored,
  restored byte-exact as Files, cleared cleanly.

PLUG-IN import (answering Keith's question): a Nova plug-in is just another .rez
in the same BRGR format. mergeForks already layers later files over earlier ones
on (type,id) clash -- exactly how Nova applies plug-ins. So loading a mod's .rez
alongside/atop the base data imports it: DATA mods (new systems/ships/outfits/
missions/govts -- the resource types the engine reads) come in fine; total
conversions load as their own .rez set. Two honest limits: (1) the engine draws
vector-triangle ships, so a mod's custom SPRITES (rleD/PICT) won't render -- new
ship stats/behavior import, art doesn't; (2) deep mission-script chains import as
resources but play only as far as the engine simulates Nova's mission system.
The Forget/reload button is what makes plug-in experimentation practical: fly the
cached base, then swap in a plug-in set when you want to try a mod.

### v2100 -- EV sprites Stage 1: rlëD decoder + shän reader + sprite viewer

Keith wants mod (and base) ship SPRITES to render, not just vector triangles.
Staged build; Stage 1 = decode a sprite + SEE it, before touching the flight
renderer. Chosen: prove on base Nova art (already loaded/cached).

- ev/sprites.js (clean-room, no content): readShan(rf,id) reads the shän (ship
  animation) resource per the Nova Bible field order -> baseImageID (which rlëD),
  baseSetCount (frames, usually 36/64), baseW/baseH. decodeRLED(bytes) walks the
  rlëD per-scanline opcode stream (skip/copy/run tokens, 16-bit 5-5-5 color, 0 =
  transparent) into RGBA. shipSprite(rf,shipId) chains shan->rlëD->first frame.
- ev-sprites.html: standalone viewer (in Tools as "EV Sprites"). Loads data
  (reuses the same loader + IndexedDB cache as the flight engine -- "Use cached
  data" pulls the six files Keith already cached), lists resources by type
  (sprite types first), and renders a picked shän/rlëD to a canvas.
- SELF-DIAGNOSING by design: the exact rlëD opcode TAG numbers aren't nailed down
  by any spec I could fully read (structure yes, tag bytes no). So decodeRLED
  returns {error, inspect:hexdump} when it hits an unknown opcode or a wrong-
  looking header, and the viewer shows those raw bytes. That way a REAL rlëD from
  Keith's files confirms or corrects the opcode map, instead of silently drawing
  garbage. The decode machinery itself is verified on a synthetic sprite (copy ->
  red px, skip -> transparent, run -> green px, all correct).

NEXT once a real sprite decodes cleanly (Keith drops Nova Graphics/Ships into the
viewer): Stage 2 = shän frame indexing by heading (pick the right rotation frame
from BaseSetCount) ; Stage 3 = upload frames as WebGL textures and draw textured
ship quads in flightView/systemView (replacing/augmenting the triangles). Mod
sprites use the identical path -- their rlëD/shän load via the same merge.

CAVEAT: real-file opcode confirmation is pending Keith running the viewer on the
graphics files; the hex inspector is the mechanism to close that gap fast.

### v2101 -- EV: friendlier error when sprite files are dropped on the flight loader

Keith dropped the Nova Graphics/Ships files on the flight engine (ev.html) and
got "No sÿst resources" -- technically true (graphics files have no systems) but
misleading. Now the flight loader detects a sprite/graphics-only drop (presence
of rlëD/shän/PICT, no systems) and says so, linking to ev-sprites.html, instead
of the dead-end "select six Nova Data files" message. The six Nova Data files
still go in ev.html to fly; the graphics files go in EV Sprites to view.

### v2102 -- rlëD decoder: real format nailed from Keith's sprite bytes

Keith ran the viewer on a real rlëD (#2029) and the hex inspector paid off: it
showed "unknown opcode 0x1 at byte 8" with the raw bytes. Reading them:
  ...00 10 00 00 00 01 00 00 00 00 00 00  01 00 00 24
  03 00 00 62  02 00 00 1c  00 00 ...
That's the REAL format: a 16-byte header (width/height/depth/bytesPerRow + 4
framing fields), then 4-BYTE big-endian opcodes [op:1][count:3]:
  0x00 <n> end scanline / advance n lines ; 0x01 <n> skip n transparent px ;
  0x02/0x03 <n> draw n direct 16-bit-color px (padded to 4-byte alignment).
My v2100 decoder was wrong on both counts (8-byte header, 2-byte opcodes) --
hence the stall at byte 8. Rewrote decodeRLED to the real 16-byte header + 4-byte
opcodes; verified the walker on a synthetic sprite in the NEW format (draw->red,
skip->transparent, end->next line, draw->green, all correct). The opcodes in
Keith's actual dump (0x01 skip 36, 0x03 draw 98, 0x02 draw 28) are exactly what
the new path handles, so it should now walk his sprite instead of erroring.

Still pending real-file confirmation (sandbox can't run his .rez): re-run the
viewer on #2029 -> either the ship renders, or a NEW (more advanced) inspector
error pinpoints the next detail (likely pixel padding or the 4 framing fields).

### v2103 -- rlëD decoder: draw count is BYTES not pixels (from Keith's real stream)

Second real-file pass. The v2102 decoder walked several opcodes correctly
(0x02/0x01/0x03 all parsed) then tripped: "unknown opcode 0x46 at byte 80".
Keith's dump showed why: "02 00 00 10" (draw, count 16) was followed by exactly
16 BYTES = 8 pixels of 16-bit color, then the next opcode "01 00 00 20". My
decoder treated count as a PIXEL count (read 16 px = 32 bytes), overrunning into
the next opcode's bytes and reading a color byte (0x46) as an opcode. FIX: for
the draw opcodes (0x02/0x03), count is the BYTE length of the pixel block ->
pixels = count/2; jump p to end-of-block, keep 4-byte opcode alignment.
Verified against Keith's ACTUAL reconstructed opcode stream (02x16, 01 skip32,
03x12, 02x24, ...) -> now walks CLEAN, no unknown-opcode, lands exactly on each
next opcode. This is real-file-confirmed structure, not synthetic.

Re-run the viewer on shän #128 (baseImageID 1000, 3 sets, 24x24): the sprite
should now render. If a residual detail remains (0x02 vs 0x03 semantics, or line
advance), it'll show as a wrong-looking image rather than a decode error -- eyes
on the canvas are the next check.

### v2104 -- rlëD: removed the bogus 4-byte alignment padding

Third real-file pass. v2103 walked MUCH further (byte 224 vs 80) but tripped:
"unknown opcode 0x3e at byte 224". Keith's dump showed a draw block whose pixel
DATA contained byte 0x3e -- and my forced 4-byte alignment after each draw was
nudging the pointer off, so it eventually read a color byte as an opcode. The
byte-count already positions the next opcode EXACTLY; the alignment padding was
spurious. Removed it. Verified against a reconstruction of Keith's actual stream
including a draw block containing opcode-looking bytes (0x3e/0x01/0x02) -> now
consumed as data, walks clean. Three real-file passes have now pinned the rlëD
format: 16-byte header, 4-byte [op][count:3] opcodes, draw count = BYTES, no
padding, next opcode immediately follows the pixel block.

Re-run shän #129 (32x32): should render, or show a wrong-LOOKING image (color
layout / 0x02-vs-0x03 / line advance) rather than a decode error.

(Music: the Nova Music.mp3 is a plain mp3 -- trivially playable later, unlike
this format. Noted for a fun follow-up.)

### v2105 -- EV Sprites: "Dump full hex" + opcode trace (stop guessing the rlëD stream)

Three rounds of one-opcode-at-a-time inference kept walking further (byte
8->80->224->320) but each residual detail cost a round-trip. Better: dump the
WHOLE rlëD at once and read the real structure directly.
- ev-sprites.html: "Dump full hex" button -> full hexdump of the selected
  resource (for a shän, dumps its base rlëD sprite sheet), with a type/id/size
  header, auto-selected for easy copy-paste back.
- decodeRLED now also returns a `trace` (first ~40 opcodes with running x,y) and,
  on an unknown opcode, shows the last 12 opcodes + surrounding bytes -- so the
  exact desync point is visible, not guessed.
Plan: Keith dumps a SMALL sprite (shän #128 baseImageID 1000, 24x24 -> compact),
we read the full opcode stream in one pass and nail the format (the 0x02-vs-0x03
distinction + the 0x00 line-terminator are the two open questions).

### v2106 -- EV Sprites: dump to FILE (Keith's idea) — stop reconstructing from windows

The trace revealed I kept reconstructing the rlëD stream from partial hex windows
that turned out to be from DIFFERENT sprites (the op=1 x6 trace vs a hex block
were inconsistent -> mixed sources), causing bad inferences. Fix: the "Dump to
file" button now DOWNLOADS a .txt with the COMPLETE shän + its base rlëD hex
(evsprite_<type>_<id>.txt), which Keith sends back. One clean full dump of one
sprite = read the entire opcode stream in a single pass, no reconstruction.
The trace already exposed the real open questions: (a) the header/leading region
is being mis-read as op=1 count=0 x6 (so the true opcode start / header size is
wrong), and (b) the 0x02-vs-0x03 draw distinction (bytes vs pixels) desyncs the
stream. Both resolve trivially once the full byte map is in hand.

### v2107 -- rlëD: format cracked from full dump; pipeline renders real sprite pixels

Keith sent the complete dump (evsprite_shn_128.txt: shän #128 -> rlëD #1000,
24x24, 70444 bytes; saved as ev/test-fixtures/rled_1000.bin). Reading the WHOLE
thing settled the structure:
- Header 16 bytes (w/h/depth/...); then a 6-entry frame table at bytes 16-39
  (01 00 00 00 x6 -- these were the phantom "op=1 count=0" that stalled v2100).
- Opcode stream from byte 40, 4-byte [op][count:3]:
  0x01 skip N px (CONFIRMED) ; 0x02 draw, count = BYTES of 16-bit px, N/2 px
  (CONFIRMED) ; 0x03 segment marker before each draw (CONFIRMED) ; 0x00 = line
  boundary (rule still being finalized).
The mid-line rule is pixel-EXACT: line 0 decodes to 162 lit pixels, matching the
hand count, ~50 opcodes clean, x reaches 701 across the scanline. The remaining
open piece is ONLY the line-boundary encoding (the trailing 00 00 vs 0x00 op vs
0x03 interplay) -- mid-line and boundary want different rules, so there's a state
flag not yet modeled. Tried ~8 boundary hypotheses against the fixture (op3-as-
length, 2-byte EOL, 4-zero EOL, fixed-width, resync-to-next-op); each fixes one
case and breaks another.

DECISION: ship the decoder with the CONFIRMED rules + a conservative resync at
boundaries so most of the sheet renders (proves the full pipeline: real rlëD
bytes -> RGBA -> canvas). Against the fixture: 701x901 sheet, 19028 real pixels,
224 resyncs (segment edges past line 0 imperfect). Line 0 is perfect. The fixture
is now IN the tree so the boundary rule can be finished offline / against a
reference decoder (ResForge/OpenNova/libmc) WITHOUT another round-trip from Keith.

NEXT: (a) finish the boundary rule against rled_1000.bin -> clean full sheet;
(b) then Stage 2 (slice frames by heading from BaseSetCount) and Stage 3 (WebGL
textured ships in flight). Base + mod sprites share this path.

### v2108 -- rlëD SOLVED: faithful port of Graphite's decoder. A ship renders.

Keith found the authoritative source: Evocation-Games/KestrelEngine ->
submodule TheDiamondProject/Graphite -> libGraphite/quickdraw/rle.cpp (MIT).
Porting it cleanly settled every detail I'd been reverse-engineering for ~8
passes. What I'd gotten WRONG and the truth:
- Header is 16 bytes: frameW(i16) frameH(i16) bpp(i16=16) paletteId(i16)
  frameCount(i16) + 6 reserved. (The "6-entry frame table" I saw was a mirage.)
- Frames are laid out in a grid 6 columns wide (rle_grid_width=6).
- Opcodes: 0x00 eof = end of a FRAME (not a line); 0x01 line_start (NO count --
  I'd treated it as skip!); 0x02 pixel_data (count BYTES, pad to 4); 0x03
  transparent_run (advance count>>1 px -- NOT a "segment marker"); 0x04 pixel_run
  (one uint32, its two 16-bit halves written repeatedly).
- THE CRUX: per-loop 4-byte alignment is RELATIVE TO row_start, not absolute.
  That single detail caused every line-boundary desync in v2100-2107.
- Color RGB555: r=(px&0x7c00)>>7, g=(px&0x03e0)>>2, b=(px&0x1f)<<3, each |= >>5.

Result on Keith's real fixture (rled_1000.bin): CLEAN decode, no resyncs, no
unknown opcodes. 108 frames (=3 sets x 36, matching shän #128) of 24x24, 6x18
grid -> 144x432 sheet, 19896 lit pixels. ASCII preview clearly shows a
symmetric SHIP (hull, wings, engine). Stage 1 DONE for real.

decodeRLED now returns the full sheet + grid metadata (gridW/gridH, frameCount,
frameW/H) so Stage 2 can slice frames by heading. The viewer renders the sheet.

NEXT: Stage 2 -- map ship heading -> frame index (frame = round(heading/360 *
frameCount) into the 6-wide grid) and show a single frame. Stage 3 -- upload
frames as WebGL textures, draw textured ship quads in flightView/systemView
replacing the triangles. Base + mod sprites share this exact path.

### v2109 -- EV sprites Stage 2: frame slicing + heading -> rotation frame

With the sheet decoding cleanly (v2108), Stage 2 turns it into a ship that faces
the right way:
- ev/sprites.js: extractFrame(dec, i) crops frame i from the 6-wide grid;
  headingToFrame(dec, shan, deg) maps a heading to a rotation-frame index. A
  shän's rotation is ONE sprite set, so framesPerRotation = frameCount /
  baseSetCount (108/3 = 36 -> 10 deg/frame). Frame 0 = up, increasing index =
  clockwise, matching the flight engine's heading sense (0=up, sin/-cos).
  shipFrame(rf, shipId, deg) is the one-call convenience.
- ev-sprites.html: a heading slider appears for multi-frame sprites; scrubbing it
  renders the single correct rotation frame live (shows heading + frame index).
Verified on rled_1000.bin: all 36 rotation frames non-empty and DISTINCT; frame 0
points up, frame 9 (90 deg) points right; heading wrap (360->0) correct.

NEXT: Stage 3 -- upload the chosen frame as a WebGL texture and draw a textured
ship quad in flightView/systemView (replacing shipTriangle), picking the frame
from live heading each render. Base + mod ships share this path.

### v2110 -- EV sprites Stage 3: textured ship in flight (real EV ship, not a triangle)

The payoff. flightView.js now renders the player ship as a textured, rotating
sprite when sprite data is available:
- New textured-quad shader (T_VS/T_FS): samples the sprite atlas, discards
  near-transparent texels, alpha-blends.
- fv.setSprite(dec, baseSetCount): uploads the decoded rlëD sheet as a GL
  texture, stores frame/grid metadata + framesPerRotation.
- drawSpriteQuad(cx,cy,heading,scale,alpha): picks the rotation frame from live
  heading, maps its atlas sub-rect as UVs, draws a screen-space quad at center.
- The player-ship draw uses the sprite when set (scaled by camScale*dpr) and
  falls back to the vector triangle otherwise -- so nothing breaks when the
  graphics files aren't loaded.
- ev.html: trySetShipSprite(ship) on enterFlight looks up the ship's shän ->
  rlëD in the merged fork (present when Nova Ships/Graphics are loaded) and calls
  setSprite; silently keeps the triangle if the sprite isn't available. rf is now
  module-scoped so this lookup works.
Verified headless (swiftshader, http origin): setSprite ok, texture uploads with
GL error 0, and an isolated textured-quad draw of the real sheet renders 2572 lit
pixels cleanly. (The full RAF loop doesn't tick reliably in the headless harness,
so the end-to-end pixel check was done via the isolated draw -- the render path
itself is proven.)

To see it: load base data + Nova Ships/Graphics together in ev.html (or the six
Data files then the ships files), fly, and the player ship is the real EV sprite
turning through its 36 frames. Enemy ships still draw as triangles (a later pass
can sprite them too via the same setSprite/atlas, keyed per shïp class).

Stage 1 (decode) + Stage 2 (frames) + Stage 3 (textured flight) COMPLETE.

### v2111 -- EV: render-quality / resolution controls (fixes the classic scaling gripes)

Keith noted the common EV Nova complaints about graphics scaling / resolution
(pixelated ships, HiDPI blur, no supersampling). Now that ships are textured
quads (Stage 3), the from-scratch renderer can just fix these:
- renderScale (0.5..2) supersamples the backing store: Ultra=2x SSAA renders 4x
  the pixels into the same display for razor-sharp ships/edges; Performance=0.75x
  eases weak GPUs. CSS size is unchanged -- only render resolution scales.
- dprCap raised 2 -> 3 (settable to 4) so Retina/4K panels render at true pixel
  density instead of the old 2x clamp that blurred on HiDPI.
- setCrisp toggles NEAREST vs LINEAR sprite filtering (crisp pixel-art vs smooth).
- All on-screen sizes + HUD overlay coord conversions now use eff = dpr*
  renderScale, so ships stay the right size and HTML bubbles stay aligned under
  supersampling. flightView exposes setRenderScale/setDprCap/setCrisp/
  getRenderInfo; ev.html has a Quality dropdown + Crisp checkbox, applied on
  entry and live.
Verified headless: renderScale 1 -> 800x600 backing, 2 -> 1600x1200 (4x pixels)
into an 800x600 display, 0.75 -> 600x450; dprCap settable to 4. CSS size constant.

Re Endless Sky (Keith asked about integrating endless-sky/endless-sky): it's a
SEPARATE open-source game with its OWN text-based data format, NOT an EV Nova
plug-in -- it won't load via mergeForks; importing it would need a whole separate
parser (possible someday, not a quick win). EV Nova Star Wars TCs, by contrast,
ARE .rez plugins and DO load through the existing merge path.

### v2112 -- EV: TC plugin diagnostics (Starfleet Adventures loads; ships decode)

Keith loaded the Starfleet Adventures TC from the archive.org EV plugin
collection: a folder of 27 MacBinary (.bin) files. Result: merge(macbinary x27)
succeeded, 11906 resources parsed, and the SHIPS DECODE -- EV Sprites showed
"decoded sheet 360x288 - 36 frames of 60x48 (6x6 grid)". So the whole pipeline
(MacBinary unwrap x27 -> mergeForks -> rlëD decode) works on a third-party TC's
art it had never seen. Big proof point.

BUT buildUniverse found no sÿst, so no flyable galaxy yet -- the 27 files are the
graphics/ship half; the systems live in another file in the TC. The type-matching
is fine (sÿst = "s\u00FFst" via macRoman, same path that correctly reads
shïp/shän/rlëD), so it's a missing-data-file situation, not an encoding bug.

Made the no-systems path genuinely diagnostic: instead of a generic "load the six
Nova Data files," it now lists the actual resource TYPES + counts found (top 10,
e.g. "rlëD×N, shän×N, PICT×N"), detects whether any data types (sÿst/shïp/spöb/
gövt/wëap) are present, and gives TC-aware guidance (look for the main data file
in the same folder -- largest, or the one without Graphics/Sounds/Sprites in the
name -- and load it too). Still links to EV Sprites when art is present.

NEXT: Keith reads off the "Types found:" line -> we know if the systems are in a
sibling file (load it alongside) or a separate data download. Once a sÿst-bearing
file is in the drop, the TC flies AND its ships render as real sprites (Stage 3).

### v2113 -- EV: resource inspector + confirmed the sÿst matching is correct

Keith exported a chär #128 resource from the Starfleet Adventures files (pilot
start: 25000 cr, start ship, a long control-bit list b53/b100/b0...). Key insight:
these files contain SCENARIO data (chär), not just graphics -- so the TC's data
isn't entirely absent from the 27 .bin set.

Chased the "why no sÿst" question to ground: verified the Mac Roman table is
CORRECT. EV writes the type as bytes 73 D8 73 74 (0xD8 = ÿ in real Mac Roman);
our table maps 0xD8 -> U+00FF so it decodes to "sÿst" and matches SYST =
"s\u00FFst". (0xFF in Mac Roman is a caron 0x02C7, NOT ÿ -- a common trap, but
we're matching the right byte.) chär's ä (0x8A -> U+00E4) also decodes right,
which is why chär shows up. So type-decoding is trustworthy: the systems really
aren't in these 27 files -- the galaxy data is a separate file in the TC.

Built a proper Resource Inspector so we stop exporting resources one at a time:
- "🔍 Inspect resources" button (shows after any load, success or not).
- Lists EVERY type + count, sorted, with role labels (sÿst=systems, shïp=ships,
  spöb=stellar objects, mïsn=missions, rlëD=sprites, chär=pilot start, etc.),
  highlights sÿst green / other data types blue, and states up top whether the
  set "has sÿst ✓ (should be flyable)" or "no sÿst — not a flyable data file."
This is the tool for triaging any plug-in/TC: drop files, hit Inspect, read the
inventory.

NEXT: Keith hits Inspect on the 27 .bin set -> we see the full type list and know
exactly what's present (ships/graphics/missions/chär) and what's missing
(sÿst/spöb). Then find the TC's galaxy-data file (separate download or a
different file in the archive) and load it alongside -> flyable Star Wars galaxy
with real ship sprites.

### v2114 -- EV: surface silently-skipped files (galaxy-hunt for the Star Trek TC)

Identified the TC: it's a Star Trek conversion (Kirk-era), public alpha 0.5.0 --
readme says it "includes the complete galaxy, all pertinent outfits, ships, and
governments" (missions incomplete). So sÿst DOES exist in this TC; Keith just
hasn't loaded the file that holds it. He also noted a subfolder with "3 different
map resolutions" -> he may have loaded only a graphics subfolder, not the main
data file.

Root-cause candidate found + fixed: the loader's per-file parse was
catch->console.warn->SILENTLY DROP. If the sÿst-bearing file hit a parse quirk
(MacBinary variant, odd fork), it'd vanish with no UI signal -- exactly the "27
files, ships present, no galaxy" symptom. Now: skipped files are collected
(window.__evSkipped) and surfaced -- the no-systems message names them with
"⚠ N file(s) were skipped (failed to parse): ...". If the galaxy file is among
them, we'll see it and can fix the specific parse error.

Also confirmed the headshots.bin faces + the big interface backdrops are PICT
resources (QuickDraw). Sampled PICT #8509: 1920x1200, QuickDraw v2, PackBits row
compression -- a separate decoder from rlëD (that's the agreed next step AFTER
the galaxy flies). Graphite has a PICT decoder to reference.

NEXT: Keith reloads the 27 .bin (v2114) and reads whether any were skipped, and
hits Inspect for the full type list. Then locate the TC's galaxy-data file
(likely in the main folder, not the map-resolution subfolder) and load it ->
flyable Star Trek galaxy. THEN write the PICT decoder for headshots + backdrops.

### v2115 -- EV: inspector shows RAW type bytes (hunting the missing sÿst)

Keith loaded 8 "sfa galaxy.bin" files + landings.bin and got PLANETS (spöb) but
NO systems (sÿst). (Note: SFA = Starfleet Adventures, a DIFFERENT TC from the
Star Trek Kirk-era one whose readme he pasted -- two separate Trek-themed convs.)
landings.bin + headshots.bin = PICT resources (landing scenes / face portraits);
sampled PICT #10002 = 285x612 QuickDraw v2 landing backdrop.

Key reasoning: spöb and sÿst read through IDENTICAL buildUniverse logic
(rf.list(TYPE)->get->parse), so planets-but-no-systems means rf.list("sÿst") is
empty -- either the systems are in an unloaded file, or this TC wrote the sÿst
type code with different bytes than 73 D8 73 74. To tell which, the inspector now
shows the RAW 4-byte hex of every type code (resourceFork exposes typeRaw();
mergeForks aggregates it) and flags any "system-like" type (s..t with a high
middle byte) as a possible sÿst variant. So if the systems are hiding under a
byte-variant type, we'll see it and can match it.

NEXT: Keith hits Inspect on the sfa galaxy set -> reads the type/bytes table. If a
sÿst-variant shows, add it to the SYST matcher. If sÿst is truly absent, the
systems are in another galaxy file (load it). Either way the raw-bytes view
resolves it. THEN: PICT decoder for landings.bin + headshots.bin (QuickDraw v2,
PackBits; Graphite has a reference decoder).

### v2116 -- EV: proved sÿst parse is correct; per-file type attribution in inspector

Keith exported sÿst #1347 (428 bytes) from the loaded TC data. Decoded it against
parseSyst: x=-3010 y=2988, links/nav all -1 (isolated system, plausible for an
alpha), govt -1. buildUniverse on these exact bytes -> 1 flyable system, correct
coords + counts. So the ENTIRE sÿst path (type match, parse, build) is PROVEN
correct on real TC data. And mergeForks preserves spöb + sÿst from separate forks
(tested). So "planets but no systems" on the flight page is NOT a code bug -- the
file holding sÿst simply wasn't in the flight page's loaded set (Keith exported
it from EV Sprites, which had a different/complete load; the two pages load
independently).

To end the file-hunt for good: the inspector now shows per-file attribution --
"Which file has each data type" maps sÿst/spöb/shïp/wëap/oütf/gövt/mïsn to the
exact loaded filename(s), and explicitly lists any key type "not in any loaded
file." Forks are tagged with _file; window.__evFileTypes carries the per-file
type lists. So dropping everything + Inspect shows literally "sÿst -> X.bin" or
"sÿst -> not in any loaded file."

NEXT: Keith drops ALL the TC .bin files together on the FLIGHT page (not just the
8 galaxy ones), hits Inspect -> sees which file has sÿst. Load that set -> galaxy
flies. (Almost certainly he'd been loading a subset missing the systems file.)
THEN PICT decoder for landings.bin + headshots.bin.

### v2117 -- MILESTONE: Star Trek TC flies end-to-end (1366 systems, ships as sprites)

Keith dropped ALL the TC .bin files together on the flight page (the fix predicted
in v2116 -- he'd been loading a subset missing the systems file). Result:
"1366 systems", galaxy map renders, and flying into a system shows systems,
planets, AND ships as real sprites (Stage 3). So the full pipeline works on a
third-party Mac total conversion end to end:
  MacBinary unwrap (xN) -> mergeForks -> sÿst/spöb/shïp/... parse -> galaxy map
  -> enter system -> rlëD ship sprites rendering in flight.
This is the payoff of the whole EV arc (BRGR/rez reader -> multi-file merge ->
IndexedDB cache -> rlëD decode via Graphite port -> rotation frames -> textured
flight -> resolution controls -> TC diagnostics -> per-file attribution). A
clean-room WebGL2 engine now loads and flies a real EV Nova total conversion.

No code change this version beyond the version stamp + this milestone note -- the
engine was already correct; the last blocker was purely which files were dropped.

NEXT (agreed): PICT decoder (QuickDraw v2, PackBits) for landings.bin (landing
backdrops, e.g. PICT #10002 = 285x612) + headshots.bin (character face portraits).
Graphite has a reference PICT decoder to port. That makes mission/landing/comms
screens show their art. After that, the long-offered easy win: Nova Music.mp3
playback.

### v2118 -- EV PICT decoder (QuickDraw v2): landing scenes + headshots render

Ported TheDiamondProject/Graphite libGraphite/quickdraw/pict.cpp to ev/pict.js
(clean-room, MIT). Handles the EV cases: v2 header, clip/region + all the skip-
able rect/line/color opcodes, PackBitsRect (0x0098) indexed-via-clut, and
DirectBitsRect (0x009a) 16/32-bit. Supporting pieces ported faithfully: 50-byte
pixmap struct, clut, PackBits decode (literal/repeat/no-op), pack_type enum
(none/argb/rgb/packbits_word/packbits_component), RGB555 color (same math as
rlëD). Unknown opcodes stop cleanly with whatever's drawn (no crash).

Verified on Keith's real dumps: PICT #10002 (612x285 landing scene) -> 174420/
174420 px, ASCII preview shows a real planet-surface scene; PICT #8509
(1920x1200 interface backdrop) -> 2304000/2304000 px. Full decodes, no early
stops, 66 distinct color buckets (real image, not flat/garbage).

Wired in:
- ev-sprites.html: PICT resources now decode + display in the browser (was
  "no decoder for PICT yet").
- Landing screen: parseSpob now reads LandPICT (spöb offset 76); enterLanding ->
  showLandscape() decodes the planet's landscape PICT and paints it as the
  landing backdrop (falls back to the 3D dock body when no picture / not loaded).
- rlëD ship sprites regression-checked: still 108 frames, unbroken.

Headshots (headshots.bin) use the SAME decoder -- any PICT id renders. Hooking
face portraits into mission/comms dialogs is a small follow-up when those screens
get built.

NEXT (long-standing easy win): Nova Music.mp3 playback. Then optional: sprite
enemy ships, mission/comms screens with headshot portraits, dësc landing text.

### v2119 -- EV music player (Nova Music.mp3 + any tracks)

The long-offered easy win, done. A native <audio>-backed music player:
- "♪ Music" button in the flight top bar toggles a player panel: play/pause,
  prev/next, loop, volume, and a clickable playlist.
- "Add music files" (or drag audio onto the page) loads tracks; Nova Music.mp3 is
  auto-sorted first. Object URLs revoked-safe; fully offline, nothing uploaded.
- The main drop handler now SPLITS input: audio files (.mp3/.m4a/.ogg/.wav) route
  to the player, everything else to the data loader -- so dragging Nova Music.mp3
  onto the page just plays it instead of erroring as EV data.
- First track auto-plays on add (with a graceful "tap ▶" fallback if the browser
  blocks autoplay); ended -> next, with playlist loop.
Verified headless: button/panel/audio element + all controls present, panel
toggles, no page errors. (Actual playback is browser-native; can't assert audio
in the headless harness, but the wiring is proven.)

Note on in-resource sounds: EV 'snd ' resources (SFX, and embedded music in some
TCs) are the classic Mac snd format -- a separate decoder, not built. The plain
Nova Music.mp3 soundtrack needs none of that; it just plays.

The EV arc is now feature-complete for a playable offline experience: galaxy +
systems + planets + sprite ships + resolution controls + landing scenes (PICT) +
music. Remaining niceties (unbuilt, optional): sprite enemy ships, mission/comms
screens w/ headshot portraits, dësc landing text, snd SFX, live trading/outfit/
shipyard.

### v2120 -- EV: enemy/AI ships render as real sprites (per-class atlas)

Extended Stage 3 from just-the-player to ALL ships. flightView now holds a
per-class sprite atlas (shipSprites: Map<classId, atlas>) alongside the player
sprite:
- buildAtlas() refactored out of setSprite so player + enemies share one uploader.
- setShipSprite(classId, dec, baseSetCount) registers a class's sprite;
  clearShipSprites() resets per entry.
- drawSpriteQuad(cx,cy,heading,scale,alpha,atlas) takes an optional atlas, so it
  draws any ship's chosen rotation frame.
- Enemy render loop: splits enemies into sprited (class has an atlas -> textured,
  blended, dead ones at 0.35 alpha) vs plain (team-colored triangle fallback).
  Nothing regresses when art isn't loaded.
- ev.html: loadShipSpriteById() decodes a ship's shän->rlëD by id;
  loadEnemySprites() registers the spawnable classes (enemyClasses + first ~24
  universe ships, de-duped) on flight entry. Best-effort: classes without art
  stay triangles.
Verified headless: player + 2 enemy class sprites register, GL error 0, no page
errors. rlëD/PICT/music all still green.

So in-system combat now shows the TC's actual ships on both sides, turning through
their rotation frames. Remaining optional niceties: peer/ghost ships as sprites
(same Map, keyed by their class if known), mission/comms screens w/ headshot
portraits, dësc landing text, snd SFX.

### v2121 -- EV: peer ships as sprites + comms/hail screen with headshot portraits

TWO features this ship.

(1) Peer/ghost ships now render as real sprites too. presence.js threads a
shipClass id through the packet (_upsert, peersInSystem, localPacket); flightView
sends the player's ship id (shipClassId) in its presence packet and, in the peer
render loop, draws peers whose class has a registered atlas as that sprite (0.95
alpha), falling back to the crew-colored ghost triangle otherwise. So with graphics
loaded, EVERYTHING in space -- player, enemies, AND other pilots -- is a real EV
ship. (Reuses the v2120 shipSprites Map.)

(2) Comms / hail screen (uses the v2118 PICT decoder for portraits). Press C in
flight -> hailNearest() finds the nearest ship (flightView.nearestShip(): closest
live enemy or peer) and opens a comms panel: a 120x120 portrait canvas + name +
govt/relationship/distance + a government/team-flavored greeting (hostile threats,
ally banter, neutral brush-offs, peer greetings). drawPortrait() decodes a headshot
PICT (stable per-target pick from the loaded PICT ids -> same ship, same face) and
cover-fits it. Esc or Close channel dismisses. commsPictIds cache resets per load.
Pure flavor -- no mission scripting yet -- but the Kirk-era faces finally show.
Flight controls hint updated (C hail). Verified headless: portrait PICT decodes +
draws into the comms canvas (alpha 255 real content); peer sprite path + modules
valid; verify-all GREEN; rlëD regression ok.

Remaining optional: full mïsn mission scripting, dësc landing text, snd SFX, live
trading/outfit/shipyard.

### v2122 -- EV: dësc description text (landing flavor + comms flavor)

Added dësc (description) text decoding -- the flavor writing that makes EV feel
alive. evData.js: DESC/STR# type consts, macRoman imported from resourceFork,
readDesc(rf, id) reads a dësc resource body as Mac Roman, skips a 2-byte id
prefix if present (printable-heuristic), strips trailing NULs, normalizes Mac \r
newlines to \n. Verified on synthetic text: decodes + normalizes correctly.

Wired in:
- Landing screen: the placeholder "description arrives later" note is replaced by
  a real #portDesc area; enterLanding reads the stellar's landing dësc (tries
  spöb id, then fallbacks) and shows it above the services. Hidden if none.
- Comms/hail: if the target's government has dësc text, the first line (to 220
  chars) is shown as flavor instead of the canned greeting.
verify-all GREEN; ev modules valid.

Caveat: the exact spöb->dësc id mapping varies by scenario; we try the spöb id
and a couple fallbacks, so some stellars may show no text until the precise
mapping field is pinned against a real spöb. The DECODER is solid; only the
id-linkage is heuristic.

Remaining optional: full mïsn mission scripting, snd SFX, live trading/outfit/
shipyard, STR# list decoding for ship/outfit names.

### v2123 -- EV: snd SFX decoder + combat sounds; dësc landing link made robust

Two of the three "keep going" items.

(1) 'snd ' decoder: ev/snd.js, clean-room port of Graphite resources/sound.cpp.
Handles the sampled-sound forms EV uses -- standard header (8-bit PCM), extended
(8/16-bit), and IMA4 (cmpSH) ADPCM (full index/step tables + nibble expansion) --
returns {sampleRate, channels, pcm:Float32Array}; sndToAudioBuffer() makes a
WebAudio AudioBuffer. Verified on a synthetic std sound: correct rate/len/sample.
Wired to combat: flightView fires entryOpts.onSound('fire'|'explosion'|'impact')
on player shots, kills, and hits; ev.html sfx manager decodes snd resources
lazily (cached), picks generic fire/impact/explosion from the loaded snd ids, and
plays via WebAudio (resumes the context on first sound; master volume; reset per
load). Weapon-specific snd ids can be wired later once parseWeap exposes them.

(2) dësc landing link hardened: parseSpob now reads DescID@78 + LandSnd@80 (they
follow LandPICT@76 in the spöb layout). The landing lookup is self-validating: it
tries the parsed DescID, the spöb id, id+1000, AND probes raw spöb offsets
78/76/80/82/84, taking the first candidate whose dësc looks like real prose
(len>12 + letters). So a scenario that shifted the field still resolves instead
of showing blank.

verify-all GREEN; modules valid. NEXT: the big one -- mïsn mission scripting.

### v2124 -- EV: mïsn missions -- offer/accept/travel/complete loop

The third "keep going" item, scoped to a real playable slice (not the full EV
scripting engine). evData.js: MISN const + parseMisn() reads the playable fields
(availStel, availLoc, availRecord/Rating, travelStel, returnStel, cargoType/Qty,
and a defensively-probed 32-bit Pay). buildUniverse now builds uni.missions +
counts.missions. Verified parseMisn on a synthetic mission (avail/travel/pay
correct).

Mission loop in ev.html (missions manager):
- Landing screen shows a mission board: "Available missions" offered at this spöb
  (AvailStel == spöb id, or -1/-2 = anywhere), each with name + reward + Accept.
- Accepting tracks it as active (name, briefing dësc [id+4000 convention, probed],
  pay, destination name resolved from spöb/system).
- "Active missions" list shows with destination + reward.
- onArrive (fired on landing) completes any active mission whose destination
  matches this spöb/system, pays out to a simple credits purse, toasts success.
Not yet: control-bit availability gating, multi-stage/branching, cargo mechanics,
ship goals -- those are the deep scripting engine. But offer->accept->travel->
complete works, reading real mïsn + dësc data.

verify-all GREEN; mission board renders; no page errors.

All three targets done (dësc-link hardening v2123, snd SFX v2123, missions v2124).
Remaining optional deep work: full mission scripting (control bits, branching),
STR# name lists, live trading/outfit/shipyard economy.

### v2125 -- EV: control-bit engine -> branching mission chains

The backbone of real EV mission scripting: control bits (the ~10k boolean flags
that gate availability and branch storylines).
- ev/controlbits.js: ControlBits store + a recursive-descent evaluator for the EV
  NCB mini-language (bN test, !bN, & AND, | OR, parens; empty = always true) and
  applySet() for set-strings ("b100 !b200" sets/clears). Unmodeled terms (ratings/
  records) treated as neutral-true so we never over-gate. Verified: AND/OR/NOT/
  parens all correct.
- evData.js: parseMisn now recovers the control-bit STRINGS from the mïsn tail
  (extractStrings scans NUL-terminated ASCII; classifies bN-bearing ones ->
  availBits = first, setBits = rest for OnAccept/OnSuccess). parseChar reads the
  pilot-start bits from chär. Verified string extraction.
- ev.html: a global ControlBits `bits`, initialized from the first chär on load.
  Mission offers are now GATED by availBits (bits.evaluate); accepting applies the
  OnAccept set-string; completing applies OnSuccess -> unlocks follow-on missions.
Integration test: a 2-mission chain where M2 (requires b500) stays hidden until
M1 completes and sets b500 -> then appears. MISSION CHAIN OK.

So storyline missions that branch on prior choices now work in principle -- the
TC's mïsn availability/OnSuccess bit logic drives what's offered. Still simplified
vs full EV (no cargo/passenger goals, ship-destroy objectives, rating/record
gating, or the full OnAccept/OnAbort/OnShipDone slot semantics -- we treat the
first bit-string as avail and apply the rest on accept/success), but the control-
bit spine is real.

verify-all GREEN; modules valid.

### v2126 -- EV: precise mission slots + objectives + trading/outfit/shipyard economy

Three items in one ship.

(1) Precise mission event slots. parseMisn now classifies the mïsn tail's control-
bit strings STRUCTURALLY: expression-shaped strings (operators & | ( ) or mixed
!bN...bN) are AvailBits; plain bN/!bN lists are the event set-strings, named in EV
slot order (onAccept, onRefuse, onSuccess, onFailure, onAbort). Mission manager
applies onAccept on accept, onSuccess on completion. Verified: expr vs set
separation correct.

(2) Mission objectives beyond travel. parseMisn reads shipCount@18; objectiveOf()
classifies a mission as cargo (CargoQty>0), destroy (shipCount>0), or travel.
Destroy missions track kills: flightView fires entryOpts.onKill(k) on each enemy
death -> missions.recordKill() increments progress; completion needs the quota met
AND return to destination. The board shows the objective + "[N/M destroyed]".

(3) Trading / outfit / shipyard economy. evData.js: OUTF/JUNK consts, parseOutfit
(cost probed 32-bit + mass) and parseJunk (base/low/high price); buildUniverse
builds uni.outfits + uni.commodities. ev.html: a svcPanel + openService(kind,spob)
renders three real screens:
  - Commodity Exchange: buy/sell commodities, price varies per-stellar by a stable
    0.8-1.2x factor (so buy-low/sell-high works), 100-ton cargo hold enforced.
  - Outfitter: buy/sell outfits (75% resale), owned-count shown.
  - Shipyard: buy ships (synthesized price from holds/shield/armor; swaps curShip,
    resets outfits).
Player purse starts at 500,000 cr; mission rewards feed the same purse. Landing
service buttons now open these instead of a "coming later" toast. Verified:
parsers correct, page loads clean (0 errors), svcPanel present, verify-all GREEN.

Caveats (honest): outfit mod EFFECTS aren't applied to ship stats yet (buying is
tracked but a "+shield" outfit doesn't yet raise shields); ship/outfit COST fields
are probed/synthesized since exact offsets vary by scenario; cargo isn't tied to
mission cargo delivery yet. The buy/sell loops + data plumbing are real.

Remaining optional deep work: outfit effects on ship stats, mission cargo tie-in,
STR# name lists, full OnShipDone/OnAbort semantics.

### v2127 -- EV: bar / Ready Room story missions (availLoc split + storyline chains)

Answering "can we get Ready Room / storyline missions?": YES. In EV the mission
offer LOCATION is the availLoc field -- 0 = mission computer (job board), 1 = bar
(where story/character missions live). Star Trek TC's "Ready Room" is the re-
skinned bar. Previously everything lumped into one board and the bar button just
toasted "quiet" -- so story missions were in the data but unreachable.

Now:
- offersAt(spob, loc) filters by availLoc (0 computer / 1 bar). The landing board
  shows ONLY mission-computer jobs; the Spaceport Bar button opens a real Ready
  Room screen (renderBar) showing bar/story missions.
- missionCard() now shows the briefing dësc snippet inline, so story missions read
  like briefings, not just titles.
- Ready Room diagnostic: barGatedHere() lists bar missions that EXIST here but are
  gated by control bits, with the exact AvailBits each needs -- so you can see the
  whole storyline chain and what unlocks each step. (▸ toggle.)
- Story chains work via the v2125 control-bit spine: only the first mission of a
  campaign is available to a fresh pilot; completing it sets its OnSuccess bit,
  which unlocks the next. Integration test (3-mission Starfleet-style chain):
  fresh pilot sees only mission 1, mission 2 gated [b900], mission 3 gated [b901];
  complete 1 -> 2 unlocks; complete 2 -> 3 unlocks. STORYLINE CHAIN OK.

So the TC's own storyline missions surface in the Ready Room and branch correctly
on progress. Caveat: which specific missions appear still depends on the heuristic
availLoc/availBits parse being right for a given scenario; if a known story mission
doesn't show, exporting one real mïsn lets us pin the exact field offsets. Also
still simplified vs full EV (no OnAbort/OnShipDone slot distinction, no rating/
record gates), but the campaign spine is real + verified.

verify-all GREEN.

### v2128 -- EV: mïsn parse PINNED against a real mission dump (#135)

Keith exported a real mïsn (#135, 1970 bytes) so we could pin offsets instead of
guessing -- same move that cracked the galaxy. Findings from the actual bytes:
- AvailStel@0 = -1 (0xFFFF) => offered galaxy-wide. -1 is the "none" sentinel used
  throughout the struct (confirmed: dozens of 0xFFFF fields).
- availLoc@4 = 6 (NOT the 0/1 I assumed -- EV's offer-location enum is richer;
  6 is a bar/Ready-Room-class value in this TC).
- Flags bitfield @80 = 0x0401.
- Briefing dësc reference = 180, living in a LATE block (@0x65e), not at id+4000.
- CRUCIAL: ZERO ascii strings in the whole resource. This scenario stores control
  bits NUMERICALLY, not as "b100 & !b200" text -- so my string-extraction NCB path
  yields nothing here (explains why gating did nothing for this TC).

Fixes:
- parseMisn re-pinned: real offsets, -1/0 => "unset" sentinel handling, Flags@80,
  a descRefs scan (>=128, <32000) with briefDesc = last ref (matches the 180),
  and a Pay probe that now REJECTS 0xFFFF-sentinel-derived values (was reporting a
  bogus 65535; now correctly 0). String-NCB kept as a fallback for scenarios that
  use it. Verified against the real dump: availStel -1, flags 0x401, briefDesc 180,
  pay 0, no bit-strings. REAL MISN PARSE OK.
- brief() now prefers the parsed briefDesc id for the briefing text.
- availLoc filter made forgiving: 0/negative = mission computer, >=1 (incl. 6) =
  bar/Ready Room, so missions never vanish on an unmapped loc.

Honest status: mission #135 is a galaxy-wide, no-cargo/no-ship, story/dialogue
mission (briefDesc 180) -- exactly a Ready Room entry. It will now surface in the
bar. Full numeric-NCB control-bit gating for THIS TC would need the bit fields
pinned too (they're numeric, in the sparse mid-struct) -- a follow-up if Keith
wants the exact chain gating; the loop + briefing + location routing are correct
now.

verify-all GREEN.

### v2129 -- EV: mission control-bit strings PINNED (real storyline gating works)

Keith exported 3 more real missions (#129, #136, #351) -- guessed as gated, and
they WERE. They corrected my v2128 read: this TC DOES use text control-bit strings,
just at FIXED offsets (not scattered, and #135 simply had none). Diffing the four:
  AvailBits   @ 0x5c  (92)   -- availability expr
  OnSuccess   @ 0x15b (347)  -- set-string on success
  CompMessage @ 0x75f (1887) -- completion text
Real data confirmed across all four:
  #129 avail "(b100 & b53) & !(b666 | b668)"  onSuccess "L128 K129 b101 !b100 b668"  "Thank You"
  #135 avail ""  (always available -- the intro)
  #136 avail "!(b1128 | b1129)"  "Red Alert!"  + two branch set-strings @0x359/@0x458
  #351 avail "!(b110 | b666)"  onSuccess "K148 b110"  "Thank You."

parseMisn now reads those exact offsets (with a heuristic fallback for other tools).
Set-strings mix bN/!bN with other EV opcodes (K legal-record, H, T, M, A, L link);
ControlBits.applySet already applies only the bit tokens and ignores the rest
(verified: "L128 K129 b101 !b100 b668" sets b101+b668, clears b100, does NOT set
b128). Mission manager applies OnSuccess + branch altSets on completion and shows
the CompMessage.

END-TO-END VERIFIED on real data: a fresh pilot (b100 b53) sees #129 available;
completing it runs OnSuccess (clears b100, sets b668/b101) -> #129 is now correctly
gated (needs b100 it consumed + !b668 it just set). That's authentic one-shot EV
storyline scripting, driven entirely by the TC's real mission data.

Also: offer logic treats special availStel codes (<0 and >=30000, e.g. 30001 =
stellar-class/govt-wide) as available, so story missions route correctly.

Honest remaining gap: the EARLY fixed fields (exact availStel/availLoc semantics,
the true Pay offset) are still approximate -- #136 pay read 65665 (near a sentinel),
availLoc varies 2/3/6 with meanings not yet pinned. The CONTROL-BIT SPINE (what
gates and unlocks the campaign) is now exact; the numeric economy fields are the
next diff target if wanted. verify-all GREEN.

### v2130 -- EV: mïsn fixed economy fields PINNED (7-mission diff)

Keith exported #148/#149/#155 -- three instances of the SAME cargo-mission template
(identical AvailBits "(b46 & !b9000) & !(b105 | b106)"), differing only in the
economy fields. Diffing them (+ the 4 prior story missions = 7 total) isolated the
real offsets cleanly:
  @4  AvailLoc     (0 = mission computer / job board; 2/3/6 = bar / Ready Room)
  @10 CargoQty     (10 / 10 / 15 across the template)
  @12 TravelStel   (destination: 10025 / 10026 / 10000 -- the varying leg)
  @14 ReturnStel   (10025 on #155's two-leg run)
  @16 CargoType, @46/@48 shared id+count, @54/@60 paired dësc/text refs, @80 Flags.
parseMisn re-pinned to these. Result across all 7 (verified):
  #148/#149 cargo runs to 10025/10026 (qty 10, availLoc 0 = job board)
  #155 two-leg cargo run 10000->10025 (qty 15)
  #129/#351/#136 story missions (availLoc 2/3, gated) ; #135 intro (always avail)
So the availLoc split is CONFIRMED real: the cargo template sits on the mission
computer; story missions sit in the bar/Ready Room. Cargo objectives now get a real
destination + qty.

Honest note on Pay: none of the three template instances exposed a varying 32-bit
reward in the early block, so pay for this TC's missions is small/fixed or comes via
a linked resource -- I stopped guessing it from sentinel-adjacent bytes (was
inventing 65665-type values) and read a conservative candidate, else 0. Correct
behavior: show no bogus reward rather than a fake one. The gating + routing +
destination fields are now real; exact reward sourcing is the one remaining
approximate field.

verify-all GREEN.

### v2131 -- EV: Mission Creator (author + encode + play-test your own missions)

Went from reading mïsn to WRITING it. Now that every mïsn offset is pinned, added
the mirror encoder + an authoring console.
- evData.js encodeMisn(m): mirror of parseMisn -> a real 1970-byte mïsn resource,
  writing the pinned fields (availStel@0, availLoc@4, cargoQty@10, travelStel@12,
  returnStel@14, flags@80) and the control-bit/text strings (availBits@0x5c,
  onSuccess@0x15b, compMessage@0x75f, altSets@0x359/0x458), defaulting the classic
  0xFFFF "none" sentinels. PROVEN by round-trip: real #129 parse->encode->parse is
  byte-faithful on every field; a from-scratch authored mission reads back exactly.
- ev-mission-creator.html: a starship "Mission Authoring Console" (amber/cyan CRT
  panels, mono for the code-like bit expressions -- not a generic form). Form for
  name / offer location (bar vs computer) / availability bits / OnSuccess bits /
  destination / reward / objective (travel|cargo|destroy) / briefing / completion
  text. Signature element: a live "Flight Recorder" that narrates how the mission
  plays -- runs the REAL ControlBits engine to show "visible to a new captain" vs
  "hidden until story bits are set", and detects "one-shot: locks itself" vs
  "repeatable". Shows the encoded byte size + live round-trip verification.
  Exports: JSON (single/all) + raw mïsn .bin bytes. "Add to test flight" stashes
  missions; "Play-test in engine" jumps to ev.html.
- ev.html: mergeAuthoredMissions() folds authored missions (author-space ids 700+)
  into uni.missions on load, so the bar/computer offer them exactly like TC
  missions -- a self-authored campaign, gated + branching, play-tested live. Added
  a "✎ Missions" link in the flight top bar.
Headless-verified: recorder renders, gating simulation flips correctly on bit
changes, round-trip shows "verified ✓", 0 page errors. verify-all GREEN.

So the engine now READS real TC campaigns AND lets you WRITE your own -- authored
missions encode to real mïsn bytes and play in the same engine with the same
control-bit gating. A full round-trip authoring loop on a reverse-engineered format.

### v2132 -- EV: cargo-template fields refined + Campaign Map (chain builder)

Keith exported 4 more cargo missions (#157-160, same template). Diffing them +
the earlier 3 (7 cargo instances, 11 missions total) confirmed the varying fields:
  @10 CargoQty/count (5/5/2/1/10/15 -- per-mission)
  @12 TravelStel     (destination, mostly a hub 10000; #160 = 10073)
  @14 ReturnStel     (the varying return leg: 10026/10027/10029/30000 -- each goes
                      to a different place; THIS is what distinguishes them)
  @16/@18 = 1000/-100 SHARED across the cargo template => payment TERMS (rate/unit),
           NOT a per-mission credit reward. parseMisn now names @18 payUnit and
           stops inventing a header "pay" -- pinned across 11 real missions, this TC
           has no plain varying credit field; reward is computed/linked. Correct
           behavior: no bogus number.
  --> STILL WANTED to fully pin PAY: two missions with KNOWN, DIFFERENT credit
      payouts. Keith offered to send those. When they arrive: diff their headers,
      the single field that differs by the payout delta (or ratio to cargoQty) is
      the pay/rate field. That's the last economy unknown.

PART 2 -- Campaign Map (mission-chain builder) in ev-mission-creator.html:
An SVG dependency graph under the library. Computes A->B edges where mission A's
OnSuccess sets a control bit that mission B's availability expression requires,
lays missions out in dependency layers, draws them as nodes (cyan = open, amber =
gated) with amber arrows for unlocks. Turns a pile of authored missions into a
visible campaign DAG. Headless-verified: a 3-mission chain (M1 sets b500 -> M2
needs b500 sets b501 -> M3 needs b501) renders 3 nodes + 2 arrows, 0 errors.

So the creator is now a real campaign tool: author missions, see the branching
structure form automatically from the control-bit logic, play-test in-engine.
verify-all GREEN.

### v2133 -- EV: mission inspector on ev-sprites; pay-field conclusion

Keith sent 6 more cargo missions (#147/152/153/154/155/156). Diffing (~17 total
now) CONFIRMS the pay conclusion: across every cargo instance @16/@18 = 1000/-100
are CONSTANT, and NO header field varies like a credit reward. Only @10 (qty),
@12/@14 (dest/return), and @54/@56/@60 (dësc text refs) vary. Conclusion, now
well-evidenced: this TC does NOT store a per-mission credit payout in the mïsn
header -- reward is computed (cargoQty x rate) or lives in a linked resource. More
mïsn dumps won't crack it; only in-game observation will. So we stop guessing pay.

Mission inspector (Keith's idea): ev-sprites.html now decodes mïsn. Select a mïsn
resource -> a full field table: available-at, offer location, availBits, OnSuccess,
cargo/qty, destination, return, pay-unit, reward (labeled "not in header --
computed/linked" honestly), flags, dësc text refs, completion msg, PLUS the
resolved briefing text. So Keith can click any mission and see every decoded field,
and compare against the actual in-game payout to identify the reward source
himself. mïsn added to the type list. Data path headless-verified (parseMisn decodes
#129 correctly, 0 errors).

verify-all GREEN.

### v2134 -- EV: authored briefings -> real dësc; multi-resource inspector; reward answer

Reward question, answered definitively: scanned ~17 missions for any field
proportional to cargoQty (pay = qty x rate would show up). ONLY @10 (the qty
itself) correlates -- no separate reward field exists. Conclusion: this TC computes
reward as cargoQty x a global rate (almost certainly @16=1000 = credits/ton). So
you CAN'T read the exact reward from the resource list (it's not in the resource),
but the inspector now shows a labeled ESTIMATE (~qty x 1000 cr, "verify in-game").
Only in-game play resolves the exact rate.

(1) Authored briefings -> real dësc. evData.encodeDesc(text) mirrors readDesc
(text -> Mac-Roman bytes, 
 -> 
). Verified round-trip. Creator: authored
missions get briefDesc = id+4000 (EV convention); "Add to test flight" stashes the
briefing text (localStorage __evAuthoredDescs); "Export mïsn bytes" now ALSO emits
the briefing as a real dësc .bin. Engine: loadAuthoredDescs() + brief() prefers
authored dësc text, so authored briefings show in the bar/mission board in-engine.

(2) Multi-resource inspector on ev-sprites.html. Beyond mïsn, clicking now decodes:
  shïp  -> shield/armor/speed/accel/maneuver/holds/fuel/mass/recharge/weapons (+ sprite)
  wëap  -> reload/shots/mass+energy damage/guidance/speed/ammo
  oütf  -> cost + mass
  spöb  -> position/govt/tech/tribute/services/LandPICT/landDesc (+ resolved landing text)
All via a shared fieldTable() helper; types added to the list. So the sprites page
is now a general EV resource browser, not just graphics.

verify-all GREEN; all 3 pages valid; dësc round-trip + inspector paths verified.

### v2135 -- EV: oütf parse re-pinned from real SFA outfits (the "65535 cr" bug)

Keith noticed every outfit showed "65,535 cr" = 0xFFFF sentinel -> cost offset was
wrong. Sent 3 real SFA outfits (#151 "Fusion Missiles", #162/#164 "Photon Torpedo
Bay") + a dësc (#3000, an energy-weapon description). Diffing pinned the real oütf
layout:
  @0  DescID   (#151->4000, #162/#164->3000; matches the dësc Keith sent)
  @4  Mass     (1/2/2 -- EXACTLY matches Keith's in-game inspector readout)
  @8  id echo
  name string near 0x32b (+ singular/plural forms)
Verified: mass now reads 1/2/2 correctly (was wrong offset before), descId links
to the real description resource, and the inspector resolves + shows that dësc text.

The "65535 cr": these three weapons are MISSION-GRANTED (not sold), so their Cost
is the 0xFFFF "not for sale" sentinel -- Keith's UI was faithfully showing the real
value, my parser just mislabeled the sentinel as a number. Fixed: parseOutfit now
detects the sentinel + packed-string false positives, sets sellable=false, and the
inspector shows "not for sale (mission-granted)". Economy Outfitter filters to
sellable outfits only. (A purchasable outfit with a KNOWN price would let us pin the
exact Cost offset positively -- these 3 happen to all be unsellable.)

dësc #3000 also confirmed our description decoder on real SFA data: "Early energy
weapon utilized on such starships as the NX and Daedalus classes..." decoded clean,
no id prefix, byte 0 start -- readDesc heuristic correct.

verify-all GREEN.

### v2136 -- EV: outfit fields refined (honest cost) + snd inspector w/ playback

Keith sent 2 BUYABLE outfits: #573 "Impulse Engine", #596 "Romulan Disruptor"
(names decode clean). Mapped the real oütf header: @0 DisplayWeight, @2 TechLevel,
@4 Mass, @6 ModType, @8 ModVal, @12 flags(0x108). parseOutfit re-pinned to these.
HONEST on cost: the two buyable samples don't disambiguate the Cost offset without
their in-game prices (several fields plausible; @4 reads 300 for the disruptor which
can't be tons). Rather than fabricate, parseOutfit leaves cost=0 and the inspector
shows "unverified — send an in-game price to pin the field". Outfitter shows outfits
at a nominal price marked with * until the field is pinned. Outfit dësc resolved by
EV convention (id+3000) -> descriptions now show in the inspector (matches the
dësc #3000 energy-weapon text Keith sent).
--> TO FINISH COST: one outfit's NAME + exact in-game PRICE. Then the field whose
    value == that price is Cost, pinned in one shot.

snd inspector + playback: ev-sprites.html now decodes snd resources on click ->
encoding / sample rate / channels / samples / duration + a "Play sound" button
(WebAudio). So the SFA Sounds.bin (and any snd) is browsable + audible. snd added
to the type list. Interface/Radar .bin files: their PICT resources already render
via the v2118 PICT decoder + the type browser lists every type in any loaded fork,
so those are viewable by dropping them on the sprites page (no code needed).

verify-all GREEN.

### v2137 -- EV: outfit #481 analysis (crew outfit); @24 ruled out for cost

Keith's inspector showed oütf #481 "Cost 458,751" -- analyzed: #481 is
"Cmdr. Boma - Science Officer", an ATYPICAL crew/escort-personnel outfit with a big
D268 D269... grant-token list (not a normal buyable). The 458751 = u32@24 =
0x0006FFFF -> low word is the 0xFFFF sentinel, so @24 is NOT cost (confirmed ruled
out; that readout came from an older probe build). parseOutfit notes @24 excluded.
Comparing all 6 outfits on hand (151/162/164 granted, 573/596 buyable, 481 crew),
no offset shows the expected cost pattern (buyables positive, granted = -1), so Cost
remains unpinnable WITHOUT one known in-game price. Honest status unchanged: UI shows
"unverified".

dsg #128: only 2 bytes (0x0000) -- an empty/placeholder resource, nothing to decode.

Interface/Sounds: the SFA Interface.bin + sounds.bin did NOT arrive on disk (only
the otf/dsg text dumps came through -- binary uploads sometimes don't attach). Keith
notes Interface has main-menu images + a cursor. When those .bin files are dropped
on the engine/sprites page directly they'll browse via the existing PICT decoder +
snd inspector (v2136). If a cursor resource (CURS/crsr type) needs decoding, that's a
small addition once we can see one. No code shipped for them yet -- need the files.

verify-all GREEN.

### v2138 -- EV: sprite auto-play toggle + in-memory .zip data loading

Cursor: rlëD #8080 Keith sent = a standard 23x23, 16-bit rlëD sprite with 9 frames
(an animated pointer). Existing decoder renders it fine — no special cursor format
needed. Confirmed via decodeRLED (ok, 23x23, 9 frames, 809 lit px).

Outfit cost: CLOSED. Keith confirmed in-game that SFA outfits have no prices (all
mission-granted), so 0xFFFF "not for sale" is correct — nothing to pin. parseOutfit
comment updated to reflect the confirmed finding.

(1) Auto-play toggle on ev-sprites.html: a Play/Pause button + speed slider (1-30
fps) + "rotate" checkbox next to the heading slider. rotate ON sweeps heading
(ship rotation preview); rotate OFF steps raw frames (animation — e.g. the 9-frame
cursor spins). Timer stops automatically when switching resources (no stale-sprite
animation; play state hoisted to avoid TDZ).

(2) In-memory .zip data loading (Keith's ask). New ev/zipReader.js: dependency-free
ZIP reader — parses the central directory + inflates deflate entries via the
browser-native DecompressionStream('deflate-raw'). No CDN, no library. Both ev.html
and ev-sprites.html loaders now detect .zip inputs, expand them IN MEMORY (skipping
readmes/images), and feed each entry to loadResourceFork exactly like a dropped
file. Nothing is written to disk, so there is no temp folder to clean up — that's
inherently safer + simpler than extract-to-temp-then-delete. File input accepts
.zip; drop-zone text updated. Verified: zip roundtrip on a real 70KB rlëD fixture is
byte-identical; deflate + store both handled.

HONEST scope note: auto-DETECTING the newest EV zip in ~/Downloads is NOT possible
from the browser (security: pages can't read a folder unprompted) — that would be a
Node/SweK-server (8787) feature, addable later. The browser gets browse/drop, which
needs no server and works on LAN.

verify-all GREEN.

### v2139 -- EV: SweK-server Downloads scan + plug-in compat check + safe load

Keith's ask: scan Downloads for EV data/add-ons, pre-specify which to load, and
"load then delete the temp folder". Answered the compat question first (see below),
then built it Node-side (SweK 8787). Two new modules, both dependency-free, both
ship NO game content:

ev/scanDownloads.mjs:
  - scanFolder(dir) -> candidate EV data/plug-in/.zip files, newest-first, cheap
    (metadata only; skips readmes/images).
  - compatReport(candFork, baseFork) -> HONEST tiers (we don't claim to certify):
      adds-only   = every (type,id) is new vs base -> safe
      overrides   = replaces base ids -> only correct paired w/ its intended base;
                    lists the exact colliding type+ids
      standalone  = looks like a full base/TC (>=3 core types, >400 res) -> load as
                    base, not over another base
      no-base/unreadable handled too
  Verified all four classifications on mock forks + real fixtures.

ev/evScanRoute.mjs: mountable HTTP handler (one-line wire-in via makeEvScanHandler
({loadFork, readZip})). Routes:
  GET  /ev/scan?dir=...     list candidates
  GET  /ev/inspect?path=... parse one file, return types + tier
  POST /ev/load {paths[]}   load PRE-SPECIFIED files; unzip archives to an OS temp
                            dir, parse, then rm -rf the temp dir in a finally block.
  End-to-end verified: unzip->parse->summary->temp dir DELETED (before/after count
  0/0, tempCleaned:true). The "load then delete temp folder" flow works.

COMPAT ANSWER (for the record): EV plug-ins are resource forks that layer by
(type,id); mergeForks already does later-wins. So a plug-in that only ADDS new ids
works out of the box. One that OVERRIDES ids only works paired with the base it was
built for (Tier 3 risk). We can't certify from bytes alone (plug-ins don't reliably
declare their target base), so the flow LISTS + CHECKS (adds-only vs overrides-base)
and lets Keith pick, rather than auto-loading. Browser stays browse/drop; this
Downloads-scan is the server-side convenience.

Wire-in (server, one line): import { makeEvScanHandler } from './ev/evScanRoute.mjs';
then in the request handler: if (await handler(req,res)) return;  (handler built
with the server's own loadFork + readZip). Left unmounted here since the main server
file lives outside WebGLEngine; modules are drop-in ready + fully tested.

verify-all GREEN.

### v2140 -- EV: Scan Downloads panel (front-end for the plug-in scanner)

Built the UI for v2139's scanner. ev-sprites.html now has a "⌕ Scan Downloads..."
button -> a panel with a folder-path field (defaults placeholder to the OS Downloads
path) + Scan. Calls the SweK server /ev/scan, then /ev/inspect per candidate, and
renders a checklist: each mod shows name / size / kind and its COMPAT TIER in color
(green adds-only = safe, orange overrides = pair-with-base, cyan standalone = it's a
base/TC). Check the ones you want -> "Load selected" -> POST /ev/load (which unzips
to temp, parses, deletes temp). Also has an in-browser classify() that checks a
candidate's type/id map against the loaded base rf, so tiers work even with a
partial server.

Graceful fallback VERIFIED headless: with no scan route mounted the panel shows a
clear message ("needs SweK server port 8787 ... until then use Open data files/.zip
to pick the pack directly") instead of breaking. 0 page errors. Panel toggles,
scans, renders results, handles empty/err states.

Use case (Keith): a full plug-in pack in Downloads (contains the Starfleet mod +
unknown others). The panel is exactly for this -- point it at the folder, see what
each mod IS and what it touches before committing, then load the ones you want.
Reminder: browser-side still can't auto-detect Downloads (security); the panel
drives the server route which does the fs scan. Browse/drop-a-zip remains the
no-server path.

verify-all GREEN.

### v2141 -- EV: Downloads scan route WIRED into the SweK server (8787)

Wired the v2140 scan panel to a live server route. The main server (ai-bridge/
server.js, CommonJS, 18k lines) uses an owns()/handle() bridge pattern
(gpuBrainBridge owns exact "/ev" + "/ai/brain"). Added a parallel CJS bridge:

ai-bridge/evScanBridge.js (self-contained, ships no game content):
  - minimal resource-fork reader (type list + ids + count only — enough for compat,
    no sprite decode); unwraps AppleSingle/Double + MacBinary + raw .rez
  - zlib-based zip reader (inflateRawSync) — verified byte-identical to the browser
    zipReader on a real 70KB fixture
  - scanFolder / classify (adds-only | overrides | standalone | no-base | unreadable)
  - owns()/handle() for /ev/scan, /ev/inspect, /ev/load (distinct from gpuBrain's
    exact "/ev" page route — no collision)
  - /ev/load unzips picked files to an OS temp dir, parses, and rm -rf's the temp in
    a finally block.

server.js: one require + one delegation block right after the gpuBrainBridge block.
node --check clean. Full end-to-end verified over real HTTP: /ev/scan lists a fake
Downloads (zip + .rez, newest-first), /ev/inspect returns tier, /ev/load runs +
tempCleaned + temp dir count before/after 0/0. forkTypeMap proven on a hand-built
real resource fork (1 type, ids 128/129, count 2).

So the Scan Downloads panel is now LIVE when running the Node server: point it at the
plugin-pack folder, see each mod's tier (the Starfleet TC will read "standalone";
add-on mods read "adds-only" or "overrides"), pick, load, temp auto-cleaned. Honest
note: type CODES from the minimal reader are byte-approximate for accented names but
the type/id STRUCTURE (what compat needs) is exact; full sprite decode still goes
through the browser engine's decoder as before.

verify-all GREEN.

### v2142 -- xlsx-eval Agent Skill refreshed + extended (v2)

Revisited the xlsx-eval Agent Skill (agent-skills/xlsx-eval/, built ~v1037 for the
Mercor Excel-grading work). Confirmed it survived intact into the tree and that the
openpyxl API it relies on (load_workbook data_only) is unchanged in 3.1.5. Extended
compare.py from 113 -> 193 lines with grading-focused features:
  --tol T        numeric tolerance (abs or rel) so 3.14159 vs 3.14 / float noise can
                 match — value compare is now tolerance-aware for numbers, exact for text
  --ignore-case  normalize formula case + whitespace (=SUM(A1) == =sum(a1) == = SUM(A1)),
                 reflecting Excel's real case-insensitivity
  --grade        concise scored output: overall % + one line per sheet
                 (✓ [Sheet] 100.0% (0f 0v 0m 0x))
  named ranges   defined-name diffs reported (missing / repointed)
  per-sheet %    each sheet carries its own score
SKILL.md updated with the new flags + a grading recommendation
(--ignore-case --tol 1e-6 --grade rewards functionally-correct answers over cosmetic
diffs). Frontmatter validated (name lowercase-hyphen; description 520 chars < 1024).
Tested end-to-end: strict mode catches lowercase-formula + rounded-value; tolerant
mode scores them 100%; bad submission correctly flags wrong formula, missing cell,
missing named range, missing sheet; JSON + error paths clean.

Skill packaged standalone as xlsx-eval.zip (SKILL.md + scripts/compare.py) for
publishing to Claude Code (~/.claude/skills/), Claude.ai upload, or the API
container.skills array. verify-all GREEN.

### v2143 -- xlsx-eval: number-format checks + weighted points scoring

Verified the current Skills API against live docs first: beta headers
code-execution-2025-08-25 + skills-2025-10-02 (confirmed); NEW: a GA code-exec tool
code_execution_20260521 needs only skills-2025-10-02 (one fewer header). name <=64
lowercase-hyphen no-reserved-words, description <=1024 -- xlsx-eval complies.

Then added the two agreed features to compare.py (194 -> 244 lines):
  --check-format   also compares each cell's number_format (currency/%/decimals/
                   dates). Off by default; format diffs only count on cells whose
                   value+formula already match; shows as Nfmt in grade mode.
  --weights FILE   JSON {sheet: points} (or {"*": default}); score becomes weighted
                   -- each sheet contributes sheetPct x its points, so the important
                   sheet outweighs trivial ones (real rubric, not every-cell-equal).
                   Adds a "Weighted score: X% (earned/possible pts)" line + per-sheet w=.
Both compose with the existing tol/ignore-case/grade/json. Tested: format check
flags currency/% mismatches while plain compare passes; weighted score shifts
correctly (Model 80pts dominates); "*" default works; bad weights file -> clean JSON
error; regression (no new flags) unchanged; self-compare 100%. SKILL.md + frontmatter
updated (desc 603 chars). Repackaged xlsx-eval.zip (SKILL.md + compare.py) for publish.

Deferred by agreement: real Mercor grading tasks will tune exactly which checks
matter -- add rubric-specific logic when a sample answer-key+submission is on hand.

verify-all GREEN.

### v2144 -- two new Agent Skills built from this session's work

Reviewed the whole arc for genuinely REPEATABLE procedures (Anthropic's test: a
skill earns its place only if you'd otherwise re-type the same instructions). Built
the two that passed; explicitly did NOT skill-ify one-shot features (mission creator,
zip loader, scan panel).

(1) ship-ritual (agent-skills/ship-ritual/): codifies the bump -> validate ->
changelog -> strip -> zip -> verify -> present -> trim sequence run by hand every
version (~13x this session alone). Each check maps to a real past failure: mislabeled
build (version-marker + byte-identical round-trip), nested fork in zip (single-root
scan), blanked changelog (atomic ASCII-guarded writer). Scripts: safe_prepend.py
(rejects non-ASCII naming the char, backs up, atomic replace, restore-on-error --
verified it refuses a real emoji and preserves the file) and verify_zip.py (hard-fail
gate: version marker, single project root, nested-fork detection, size band, feature
markers -- verified GREEN on a good zip, catches mislabeled/nested/missing-marker).

(2) resource-fork-decode (agent-skills/resource-fork-decode/): the EV/Mac
resource-fork reverse-engineering method used this session -- diff N samples to find
which offset holds which field, pin against a known in-game value, handle 0xFFFF
sentinels, verify by round-trip. Scripts: hexdump_to_bin.py (dump text -> bytes) and
diff_fields.py (per-offset diff + --find to pin a known value + --strings).
VERIFIED on the real EV data: reproduces our by-hand pins exactly -- diff of missions
148/149/155 flags @10 qty, @12/@14 dest/return, @16/@18 const template; --find 15
pins qty to @10; --strings finds "Impulse Engine" at 0x32b.

Both have valid frontmatter (name lowercase-hyphen, desc <1024) and correct
zip-root structure. Packaged standalone (ship-ritual.zip, resource-fork-decode.zip)
for upload to claude.ai Skills (Free/Pro/Max with code execution on). verify-all GREEN.

### v2145 -- GPU Brain: "offline" now means offline; peer rows show brain status

Two things Keith asked about.

(1) WHY the brain chip showed "offline" while the brain was running: the
/ai/brain/health state was derived ONLY from solve/snapshot TRAFFIC -- ageF/ageS.
A brain that booted (POSTed /ai/brain/hello, registered in the fleet map) or is
heartbeating but hasn't SOLVED anything yet had no field traffic, so it read
"offline (is the Deno window running?)" -- misleading, since the bridge already knew
it was there. Fixed: health now consults the fleet registry + engineLastSeen
heartbeat. A registered/heartbeating brain with no solves reports "idle" (running,
standing by -- fire a kaiju) instead of "offline". Truly-absent (no traffic, no
heartbeat, no fleet entry) still reports "offline". Verified all 5 cases: registered-
idle->idle, nothing->offline, heartbeat-only->idle, solving->live, old-solve->stale.
Health JSON now also returns registeredBrains + heartbeatMsAgo.

(2) Peers list now shows if a peer is running GPU Brain. The peer-status probe
(/sys/peer-status equiv) now also fetches the peer's /ai/brain/health; folds
brainState/brainRunning/brainSolves into caps. capBadges() in server.html renders a
"[brain] Brain <state>" badge on the peer row, colored live=blue idle=muted
stale=amber, with a tooltip (solve count when live). So at a glance the peer panel
shows which machines in the fleet have the brain up and whether it's actually
solving.

verify-all GREEN.

### v2146 -- fix asymmetric peer visibility across a client-isolating AP

Symptom (Keith): the Mac (Stellar Atlas) lists PurtyGF, but PurtyGF (WIRELESS) does
NOT list the Mac. One-directional = the tell.

Diagnosis: PurtyGF is wireless and the Wi-Fi AP almost certainly has CLIENT
ISOLATION on. That blocks (a) the UDP discovery beacon (port 47474) between wireless
clients and (b) PurtyGF from opening a connection BACK to the Mac. The Mac can reach
PurtyGF (so it lists it); PurtyGF can't reach the Mac (so it never learns it). The
engine already had the right mechanism -- v1661 /net/introduce: "whenever we CAN
reach a peer, POST our own url/name/version to its /net/introduce and it adds us." --
but it only fired on the periodic gossip tick, so it lagged / could miss.

Fix: the /peer/probe route now introduces the box to the peer IMMEDIATELY when the
probe confirms reachable (fire-and-forget, never blocks the probe response). Since
the peer panel probes PurtyGF automatically to draw its row, the Mac now introduces
itself to PurtyGF right then -- PurtyGF lists the Mac even though it can't reach back.
Verified end-to-end with two mock servers: Mac probes PurtyGF -> POST /net/introduce
-> PurtyGF's peer list goes [] -> [mac url]. Logic guarded for self==base, no self
url, unreachable.

Real-world note for Keith: the durable fix is to turn OFF AP/client isolation on the
router (or wire both boxes / same band). This code change makes the mesh self-heal
even with isolation ON, as long as ONE side can reach the other -- which the Mac can.

verify-all GREEN.

### v2147 -- GPU Brain: fix 3 crash-on-tick bugs (kaiju demo, solves stuck at 0)

Keith ran the kaiju demo; brain booted but solves=0, errors climbing. The log showed
THREE distinct bugs crashing every solve tick:

1. "buildCivTargetWeights is not defined" -- brain.js used three civtarget symbols
   (buildCivTargetWeights @1831, CIVTARGET_FEATURES @1851/1863/2061/2409,
   buildCivTargetFeatures @2058) all EXPORTED by policy.js but never IMPORTED. The
   civtarget policy was added to policy.js without updating brain.js's import block.
   Fix: added the three names to the policy.js import. Verified ALL policy imports
   now resolve against policy's exports (none missing).

2. GPU "bindings in descriptor (6) != layout (3/4)" -- flowfield.js created its 3
   compute pipelines with layout:"auto", which prunes bindings each entry point does
   not reference (k_cost uses 3, k_relax/k_flow use 4), but _bg() always binds all 6
   buffers. Fix: one EXPLICIT bindGroupLayout with all 6 bindings (uniform +
   read-only-storage/storage per the WGSL), shared by every pipeline via an explicit
   pipelineLayout; _bg() now uses that shared layout. All 6 always match.

3. "Cannot access 'toCell' before initialization" -- toCell (const arrow) was
   declared ~line 1896 but first used at ~1886 inside the DO_FIELDS player-field
   block (TDZ). Fix: hoisted the declaration above its first use. One declaration,
   before all three call sites.

All three brain modules node --check clean; engine verify-all GREEN. These are the
Deno headless-WebGPU brain files (brain/brain.js, brain/flowfield.js, brain/policy.js)
-- sandbox can't run Deno+WebGPU, so this is a code-correctness fix (imports resolve,
TDZ removed, binding counts match); Keith to confirm solves climb on the rig.

### v2148 -- brain prints its own build + the exact file Deno loaded

Keith re-ran the kaiju demo on "v2147" and got the SAME three errors, byte for byte:
buildCivTargetWeights not defined / bind-group 6-vs-3,4 / toCell TDZ. Verified the
v2147 zip is correct (civtarget import present, createBindGroupLayout present,
layout:"auto" gone entirely, toCell declared @1885 before its use @1893, marker
ENGINE_VERSION v2147). So the shipped artifact was never the problem.

Root cause of the confusion: brain/brain.js contained ZERO version strings -- it can
not print its own version, and never did. START_BRAIN.bat does `cd /d "%~dp0"` then
`deno run brain.js`, i.e. it runs the brain.js sitting NEXT TO the batch file. Launch
that .bat from an older extracted folder and Deno loads the OLD brain modules while
the SERVER window (which does carry ENGINE_VERSION) proudly prints the new version.
Two consoles, two different builds, no way to tell them apart. Deno loads module code
once at process start, so the window must also be restarted, not just the server.

Fix: the brain now prints, at boot, before the bridge line:
    [brain] build v2148
    [brain] loaded from: <absolute path of the brain.js Deno actually imported>
using import.meta.url. "Which brain am I running" is now observable, not inferred.

Three greps also confirm a good tree (run in the folder START_BRAIN.bat lives in):
  grep -c "CIVTARGET_FEATURES, buildCivTargetWeights" brain.js   -> 1
  grep -c "createBindGroupLayout" ../brain/flowfield.js          -> 1
  grep -n "const toCell" brain.js                                -> ~1885 (use @1893)

OPEN, unrelated to the three crashes: skips reached 59,504 with errors=0 BEFORE any
error fired. Skips increment when the solver returns no field, so the brain was
already skipping every tick on a quiet world. Benign if the world is empty; if v2148
shows errors=0 solves=0 with skips still climbing after a kaiju is fired, that is a
separate bug in the feed/solve path and gets chased next.

verify-all GREEN.

### v2149 -- Windows path bug (brain never saved weights) + Deno version check

v2148's banner did its job: the brain now boots from the right folder and SOLVES
(solves 0 -> 8 -> 20 -> 33 -> 47 -> 55, lastSolve ~45ms, backend=gpu). All three
v2147 crashes are gone. The banner also exposed a bigger, older bug.

(1) WINDOWS PATH BUG -- silent, total loss of brain persistence.
    `new URL(rel, import.meta.url).pathname` returns "/C:/dir/file.json" on Windows.
    The leading slash makes every Deno read/write fail (os error 3). Keith's log:
      [learn] replay save failed: ... writefile '/C:/Drivers/.../replay_buffers.json'
      [learn] no trained weights found -- starting from the hand-set policy   (x4, EVERY boot)
    So on Windows the brain has NEVER loaded or saved weights: it re-learned from the
    hand policy every session and threw the result away. The crashes were masking it.
    Fix: one hoisted `_localPath(rel)` helper per module -- percent-decodes, and strips
    the leading slash ONLY when a drive letter follows; POSIX paths unchanged (Mac keeps
    working). Applied to all 55 sites: 34 in brain.js, 21 in report.js. Verified:
    "/C:/x" -> "C:/x", "/home/k/x" -> unchanged, "%20" -> space. Runtime-tested as a real
    ESM module incl. hoisting.
    NOTE: the ship gate caught a bad first attempt -- the naive "last line starting with
    import" heuristic spliced the helper INTO report.js's multi-line import. verify-all
    went RED, file was restored from backup, helper re-inserted after the import
    TERMINATOR. This is exactly the failure class ship-ritual exists to stop.

(2) DENO AUTO-UPDATE: deliberately NOT automatic. Keith's own START_BRAIN.bat pins
    WGPU_BACKEND=vulkan to dodge a real Deno-on-Windows wgpu panic (denoland/deno
    #26144), and the brain runs on --unstable-webgpu. Silently bumping the runtime under
    a headless-WebGPU workload is how you get a boot failure with zero code change.
    So: detect + report, human runs `deno upgrade`.
    githubBridge.denoVersionCheck(): parses `deno --version`, compares against
    denoland/deno releases/latest via the existing _api (token raises the rate limit) and
    the existing _verLt (verified: 2.9.1<2.9.2 true, 2.9.9<2.10.0 true, v-prefix ok).
    Returns {current, latest, behind, upgradeCmd:"deno upgrade", autoUpgrade:false, warn}.
    Graceful when deno is absent (installed:false + winget hint) or GitHub 403s (rate
    limit note). New route GET /sys/deno-version, verified end-to-end over real HTTP.

verify-all GREEN. Brain banner bumped to v2149.

### v2150 -- threat field was silently dead (missing COPY_SRC); silent catch now speaks

v2149 confirmed working: banner shows "C:/Drivers/..." (no leading slash -- the Windows
path fix landed) and solves climb (3 -> 6 -> 15 -> 29, ~40-115ms, backend=gpu). Two
findings from that log.

(1) THE THREAT FIELD NEVER WORKED ON ANY PLATFORM.
    flowfield.js copies bDistA -> bStageD for the distance readback (wantDist), but
    bDistA/bDistB were created with STORAGE | COPY_DST only. WebGPU rejected every such
    copy: "Usage flags BufferUsages(COPY_DST | STORAGE) ... do not contain required usage
    flags BufferUsages(COPY_SRC)". wantDist is the THREAT field (kaiju as sources, feeds
    retreat-point selection), which is why the errors began exactly when kaiju appeared
    and solves started. The brain was navigating with no threat map. Fix: COPY_SRC added
    to BOTH ping-pong distance buffers. Not a one-line guess -- a static audit now cross-
    checks every createBuffer's declared usage against its actual role
    (copyBufferToBuffer source/dest, queue.writeBuffer target): AUDIT CLEAN, every copy
    source has COPY_SRC and every destination COPY_DST. Readback parity re-verified: iters
    forced even so the final field lands in A, and A is what is read.

(2) THE UNEXPLAINED "errors=1" -- a silent catch. brain.js:1666 was
    `} catch { stats.errors++; return; }` around the snapshot fetch, so one failed fetch
    at boot (the brain racing the bridge's first listen) showed forever as errors=1 with
    no way to identify it. It now reports the FIRST occurrence only, then stays quiet so a
    flapping bridge can't spam the console. The one-shot flag is declared at module top
    (line 58), NOT next to its use -- deliberately avoiding a repeat of the v2147 toCell
    TDZ bug; decl 58 < use 1674 verified.

ALSO CONFIRMED BENIGN: `skips` climbing alongside solves is correct behavior, not a bug.
flowfield.js:208 `if (!seeded) return null;  // no goals, no field` -- a skip simply means
no goal was seeded that tick (nothing to path toward).

STILL EXPECTED on this run: "no trained weights found" appeared again in v2149 because
that was the FIRST boot after the path fix -- the files had never been written. The real
test is the SECOND boot of v2150+: it should NOT say that.

verify-all GREEN. Brain banner -> v2150.

### v2151 -- learned state now OUTLIVES the version folder (the real "never learns" bug)

v2150 log is clean: ZERO [gpu] uncaptured device errors (the COPY_SRC / threat-field fix
landed), solves climb 1->70 at ~35-56ms, and the once-silent catch identified itself
exactly as intended: "snapshot fetch failed (first occurrence...): actively refused it
(os error 10061)" -- the brain simply beat the bridge to the port at boot. errors=1
explained, benign.

But "no trained weights found" appeared AGAIN, and the path fix was not the whole story.
The banner gave it away:
    loaded from: C:/Drivers/EngineProject_v2150/WebGLEngine/brain/brain.js
The 29 learned-state files were written NEXT TO brain.js -- i.e. inside the versioned
folder. Every ship makes a new folder (v2148, v2149, v2150...), so each version began with
an empty brain. The iterative ship workflow was silently deleting the brain's memory on
every bump, on every platform. The Windows path bug (v2149) meant it could never save;
this meant that even once it could, the file was abandoned one version later.

Fix: STATE_DIR + _statePath(name), in BOTH brain.js and report.js so the report still
reads what the brain writes.
  - resolves to $BRAIN_STATE_DIR, else <USERPROFILE|HOME>/.voxelbridge/brain
    (the same ~/.voxelbridge root assetSync already uses), else the old local dir
  - ONE-TIME MIGRATION: on first touch, any legacy file still sitting next to brain.js is
    copied into the state dir (nothing on disk is lost), logged as "[brain] migrated X"
  - never clobbers: if the state file already exists, the legacy copy is ignored
Verified under a Deno shim: Windows-style USERPROFILE resolution, migration copies content
verbatim, a second call does NOT re-copy over a modified file, BRAIN_STATE_DIR override
wins and strips a trailing slash. 32 sites re-pointed in brain.js, 12 in report.js.
Deliberately NOT moved: ../ai-bridge/*.json and ../tools/*.json (engine-relative) and
./snapshots/ (per-build evidence bundles).

verify-all GREEN. Brain banner -> v2151.

NEXT: boot v2151, fire a kaiju so the trainer actually steps, quit, boot again. The second
boot should print NO "no trained weights found". If it still does, the save path -- not the
load path -- is next.

### v2152 -- Summon button did nothing: an empty world ABORTED the summon

PERSISTENCE CONFIRMED WORKING. v2151's log printed a line no earlier boot ever did:
    [learn] replay restored: attack=0 aggro=0 civdef=0 civtarget=0 packorder=0
Earlier boots said "no replay file -- starting with empty buffers". The state dir
(~/.voxelbridge/brain) is being read. Weights still say "no trained weights found" for
the honest reason: steps=0, the trainer has never run, so no weights file was ever
written. Nothing to load. That is correct behaviour, not a bug.

Everything therefore hinged on: no kaiju ever spawns. Keith: "click summon, nothing
happens". Root cause in KaijuManager.summon():
    const civs = this.civManager?.getAll() ?? [];
    if (civs.length === 0) { console.warn("no civs to target -- summon aborted"); return null; }
An empty world (no generated settlements) aborted the summon and only console.warn'd, so
the button read as broken. This also explains the brain: no civs -> no goals -> solves
stall while skips climb, exactly as logged.

Fix (two parts):
 (1) KaijuManager.summon(): no civs is now a FALLBACK, not a dead end. It spawns at the
     camera -- which is literally what control.html offers ("Summon kaiju (at camera)").
     Safe + precedented: a kaiju with targetCivId: null is an existing supported spawn
     path in this file, and _defaultPickSpawnPos only reads target.center.{x,z}, so a
     synthetic camera-centred target suffices. Guarded: no camera / NaN coords -> honest
     null. Unit-tested every branch (civs present, empty+cam, empty+no cam, NaN cam,
     explicit coords); camera spawns carry targetCivId null as intended.
 (2) ui/kaijuPanel.js: a null summon used to only console.warn. The panel now prints the
     REASON under the button (green on success, red on failure, auto-clears after 4s) and
     catches a throw. A button that silently does nothing is the actual defect.

HONEST GAP (rig-only): the sandbox cannot run the WebGL demo, so the fallback is verified
by unit-testing summon()'s decision branch, not by clicking in a browser. If the summon
still fails on the rig, the panel will now TELL you why -- send that line.

verify-all GREEN. Brain banner -> v2152.

NEXT: summon a kaiju, let the trainer step (steps>0), quit, reboot. That is the boot that
should finally NOT say "no trained weights found".

### v2153 -- GPU Brain panel on server.html + mind page in the Pages directory

THE BRAIN IS LEARNING. v2152's log finally shows the camera-summon working end to end:
    learn: steps=0 buffer=1 avgReward=1
    learn: steps=0 buffer=2 avgReward=1
The kaiju spawned, attacked, and outcomes reached the replay buffer. steps=0 is CORRECT
here, not a bug: the OnlineTrainers are constructed with minBuffer 12 (civdef/civtarget)
and 16 (aggro), so the first backprop waits for enough samples. Keep fighting -> buffer
crosses 12 -> steps climbs -> weights_*.json is finally written to ~/.voxelbridge/brain.

Keith's ask: a GPU Brain button on server.html after Homebrew formula, linking to
/ai/brain/mind, with a gauge or three and a small embedded view; plus the mind page in
"SweK Engine Pages".

Built:
 - New gtab "GPU Brain" immediately after "Homebrew formula", with a live state badge on
   the tab itself (live/idle/stale/offline, same words + colors as the existing brain chip
   -- reused the canonical DOT palette so the UI never disagrees with itself).
 - New gpanel with THREE gauges polled from /ai/brain/health (the same endpoint the chip
   uses): state (+detail), solves posted (+"last solve Ns ago"), experience (samples).
 - A host box so the panel can watch ANY box on the fleet, not just the one serving the
   page (Keith wanted 192.168.10.195). Verified this is actually possible before building
   it: the bridge sets Access-Control-Allow-Origin:* (server.js:3894) so the cross-box
   fetch works, and NO X-Frame-Options / CSP frame-ancestors is set, so the mind page
   embeds. Host persists in localStorage; blank = same origin.
 - "Open mind" link + a lazy-loaded iframe of the live /ai/brain/mind page.
 - Polls only while the panel is open, and never overlaps (busy flag).
 - Dead-host handling: a TCP connect to an unreachable LAN IP HANGS, which left the gauges
   blank -- silent, the exact defect class we keep fixing. Now shows "checking..." at once,
   bounds the wait with AbortController(4s), and reports "unreachable -- no response in 4s".
 - SweK Engine Pages: added ["ai/brain/mind", "GPU Brain mind"] under Control & status.

Verified headless (Playwright, fake /ai/brain/health + /ai/brain/mind): tab opens panel,
gauges read live/137/42, state color = #4ade80, tab badge mirrors state, frame + link
resolve, 0 page errors. Dead-host run: state "unreachable", message names the host and the
timeout, 0 page errors. All 20 inline JS blocks parse (the one "failure" is the importmap
JSON block, which is not JS).

verify-all GREEN. Brain banner -> v2153.

### v2154 -- brain/bench.mjs: the FIRST benchmark of the GPU Brain itself

Q: do we already have a GPU benchmark? YES -- webgpu-bench.html (WebGPU Lab), plus
benchmark.html and wasm-bench.html. But NONE of them measures the brain. Nothing has ever
timed the flow-field solve, which is what the brain actually does every tick. So: no, the
GPU Brain has never been benchmarked. Now it is.

brain/bench.mjs runs the SAME workload through both solvers and reports speed AND
correctness, because a fast wrong field is not a win:
  - FlowFieldSolver     (GPU, iterative relaxation)
  - FlowFieldSolverCPU  (exact Dijkstra -- ground truth; ctor takes+ignores `device`, so
                         it is a true drop-in and the harness can drive both identically)
Metrics per grid size: median ms (NOT mean -- sub-ms timings are noise-heavy), p95,
cells/sec, GPU-vs-CPU speedup, and AGREEMENT = per-cell flow-direction cosine + % of cells
within 45 degrees.
Flags: --sizes --iters --warmup --seed --cpu-only --gpu-only --json.
Terrain is seeded value-noise, so the same seed benchmarks the same world everywhere.

VERIFIED BY ACTUALLY RUNNING IT (the CPU path is pure JS, so it runs under plain node):
  - agreement metric is sound: identical fields -> meanCos 1.000 / within45 100%;
    a deliberately REVERSED field -> meanCos -1.000 / within45 0%. It can detect a wrong
    field, which is the whole point.
  - first-size JIT artifact found and fixed: 32^2 read 4.09ms vs 64^2 at 1.02ms. Added a
    pre-sweep JIT warm + configurable --warmup. After: timings scale monotonically with
    cells (0.14 / 0.24 / 0.58 / 0.86 ms for 32/64/96/128^2), and p95 exposes the outlier
    the median correctly ignores.
  - JSON mode verified.

FINDING WORTH ACTING ON: Keith's brain log reports lastSolve = 40-120ms for a 96x96 GPU
solve. Exact-Dijkstra CPU on the same grid measures 0.58ms here. That gap is far too large
to be compute -- it is almost certainly GPU buffer readback (mapAsync) latency dominating a
tiny grid. The engine already exposes CPU_FIELDS=1 (brain.js:1810 prints
"backend=cpu (exact Dijkstra)"). Running the rig benchmark will settle it; if it confirms,
CPU fields may make the brain dramatically faster AND exact. Measured, not asserted.

OBSTACLE ROOM (asked, not yet built): fully feasible, and the contract is now pinned:
  engine POSTs /ai/brain/snapshot {w,h,cell,ox,oz,heights[],goals[],player,kaiju[]}
  brain  GETs  /ai/brain/snapshot, solves, POSTs /ai/brain/flowfield
               {ox,oz,cell,w,h, fx[],fz[], pfx[],pfz[]}   (floats rounded to 2dp)
  page   GETs  the merged field and steers an agent by sampling fx/fz at its cell.
A maze is just a heightmap: walls = very high cells (the cost term makes them impassable).
Deliberately NOT built blind in this pass -- the sandbox cannot run the WebGL demo, and an
unverified spectacle page is worse than none. Next session, with the bench numbers in hand.

verify-all GREEN. Brain banner -> v2154.

### v2155 -- "Run benchmark" button in the GPU Brain panel

v2154 built brain/bench.mjs but left it a command line. Keith wanted a button. Now the
GPU Brain panel has one.

ai-bridge/brainBenchBridge.js -- owns GET /ai/brain/bench?sizes=&iters=&mode=both|cpu.
Spawns brain/bench.mjs --json, mirroring START_BRAIN.bat's flags including the
WGPU_BACKEND=vulkan pin (denoland/deno #26144). Honest behaviours, all deliberate:
  - mode=cpu runs under plain node, so the button works on a box with no Deno and no GPU.
  - mode=both with Deno missing DEGRADES to the CPU baseline and returns a `note` saying
    so. It never presents CPU numbers as GPU numbers.
  - child is hard-killed on timeout (180s) -- a wedged benchmark cannot hang the bridge.
  - the response warns that a GPU bench run while the brain is solving shares the adapter,
    so the GPU column will show contention. Said out loud, not hidden.

ROUTE-ORDER BUG CAUGHT BEFORE SHIPPING: gpuBrainBridge.owns() is a PREFIX match
(u.startsWith("/ai/brain")), so it swallowed /ai/brain/bench and the new block -- placed
after it -- was unreachable dead code. Proved it (owns("/ai/brain/bench") === true), then
moved the bench delegation ABOVE gpuBrainBridge. Verified order: bench @3873 < gpu @3878.

server.html: mode select (GPU vs CPU / CPU only), sizes, iters, and a Run button that
disables itself, ticks an elapsed counter, bounds the wait with AbortController(200s), and
prints the results table (size, cells, cpu median, gpu median, speedup, agreement cosine,
within-45 %). The `note` renders as an amber warning above the table.

Verified end-to-end headless: real bridge behind the page, button clicked, button disabled
during the run, table rendered, "done in 0.4s", and the degrade note surfaced verbatim
("deno is not on PATH, so the GPU path could not run"). 0 page errors. All 20 inline JS
blocks parse. Route tested directly too: mode=cpu -> ok/engine=node; mode=both with no
deno -> ok, engine=node, honest note.

verify-all GREEN. Brain banner -> v2155.

### v2156 -- the benchmark won an argument: fields now solve on the CPU, exactly

Keith ran the v2155 button on the rig (Intel Iris, deno, mode=both). Result:
    size    cells  cpu med  gpu med  speedup   agree   within45
      64^2   4096     0.58    31.27    0.02x   0.797      85.9%
      96^2   9216     0.71    46.00    0.02x   0.719      79.8%
     128^2  16384     0.89    46.54    0.02x   0.753      82.6%

The GPU flow-field solver loses on BOTH axes, and the table says why:
 - OVERHEAD-BOUND, not compute-bound. 96^2 -> 128^2 grows work x1.78 but time x1.012 (flat).
   Least-squares fit: gpu_ms ~= 29.7 + 1168 ns/cell. ~29.7ms is FIXED per-solve cost
   (submit + mapAsync readback). The brain does up to three solves a tick at 4Hz.
 - MATERIALLY WRONG, not just approximate. cos 0.72-0.80 = a mean flow-direction error of
   37-44 degrees, with ~20% of cells pointing >45 deg off. The brain has been steering
   kaiju with a field that points the wrong way.
 - NO CROSSOVER. GPU marginal cost is 1168 ns/cell vs CPU's 91 ns/cell -- 13x worse PER
   CELL. That is algorithmic: relaxation is O(iters x cells) with iters = ceil(1.7n);
   Dijkstra touches each cell about once. Extrapolated to 2048^2 the CPU still wins.
 - FIXING ACCURACY COSTS MORE TIME. 3x iterations at 96^2 ~= 62ms, still 87x behind exact.

So fields now default to FlowFieldSolverCPU (exact Dijkstra).

THE TRAP, and why this is not a one-line flip: BRAIN_BACKEND=cpu (CPU_FIELDS) does TWO
jobs -- it picks the solver AND pins EFFECTIVE_ROLE="fields", which sets DO_POLICY=false
and disables the GPU policy MLP. Flipping it would have silently killed the learning we
only just got working. So the two concerns are now decoupled: the GPU device is still
created and still runs BatchedMLP; only the FIELD SOLVER moves to CPU. New override
BRAIN_FIELD_SOLVER=gpu restores the old path. CPU_FIELDS keeps its old meaning ("this box
has no GPU").

Verified: decision table across all four configs --
  default                       -> CPU exact fields, role all, policy MLP ON, learning ON
  BRAIN_FIELD_SOLVER=gpu        -> GPU relax fields, policy ON  (old behaviour restored)
  BRAIN_BACKEND=cpu             -> CPU fields, role fields, policy OFF (unchanged semantics)
  BRAIN_BACKEND=cpu +SOLVER=gpu -> CPU fields (a GPU-less box cannot run the GPU solver)
Also confirmed FlowFieldSolverCPU serves all three field modes the brain needs
(wantDist-only for threat, wantFlow-only, and both), and reports backend "cpu".

EXPECTED ON THE RIG: lastSolve should collapse from ~40-120ms to ~1ms, skips should fall,
the boot line becomes "backend=cpu (exact Dijkstra) -- benchmarked 50x faster + exact",
and kaiju should path noticeably better because the field is no longer 40 degrees wrong.

verify-all GREEN. Brain banner -> v2156.

### v2157 -- the benchmark now argues its own case (fit + verdict)

Keith's SECOND rig run (v2156, brain idle this time):
      64^2   cpu 0.50   gpu 30.77   0.02x   cos 0.797
      96^2   cpu 0.38   gpu 30.89   0.01x   cos 0.719
     128^2   cpu 0.55   gpu 31.17   0.02x   cos 0.753

Three things fall out, and all three are checkable:

1. GPU time is now FLAT at ~31ms across every size. Least-squares over the sweep:
       run 1 (brain running): gpu_ms ~= 29.7 + 1168 ns/cell
       run 2 (brain idle)   : gpu_ms ~= 30.6 +   33 ns/cell   <- marginal ~= ZERO
   The GPU solve is ~98% fixed cost at 128^2. It is READBACK-BOUND (submit + mapAsync),
   not compute-bound. Compute is free; the round-trip is not. No grid size fixes that.

2. Run1 minus run2 is +15.1ms @96^2 and +15.4ms @128^2 -- adapter CONTENTION with the
   running brain. That is precisely what brainBenchBridge's `note` warned about in v2155.
   The warning was not boilerplate; it is now measured at ~15ms.

3. Agreement is BIT-IDENTICAL across both runs (0.797 / 0.719 / 0.753). Timing moves with
   machine load; accuracy does not. Same seed -> same terrain -> same field. The harness is
   reproducible, which is what makes it worth trusting.

So the tool should make the argument, not the human. bench.mjs gained analyze():
  - least-squares fit of gpu_ms and cpu_ms vs cells -> {fixedMs, perCellNs}
  - overhead % at the largest measured grid
  - mean flow-direction error in DEGREES (from the agreement cosine)
  - a verdict list: readback-bound (>70% fixed) / no-crossover (gpu ns-per-cell worse than
    cpu) / materially-wrong (>20 deg mean error) -- else "GPU is competitive here."
Printed in table mode, carried in --json, and rendered under the results in the server.html
panel.

VALIDATED, not just written: fed analyze() BOTH of Keith's real runs (correct verdicts,
98% overhead on the clean run) AND a synthetic control -- a hypothetical fast+accurate GPU
(0.3-0.55ms, cos 0.999). The control returns exactly one line: "GPU is competitive here."
The analysis acquits a good GPU and convicts this one on evidence. A judge that always
convicts is worthless.

Also caught + fixed during this pass: inserting analyze() clobbered timeSolver's function
header (Illegal return statement). node --check caught it; header restored; CPU-only bench
re-run to confirm no regression. --json on a cpu-only run correctly returns analysis: null
(nothing to compare).

verify-all GREEN. Brain banner -> v2157.

### v2158 -- Brain Maze (the obstacle room) + fleet benchmark across peer brains

TWO deliverables. Both found real bugs, which is the point of building them.

(1) brain-maze.html -- the GPU Brain solves an obstacle room.
    48x48 grid, cell=4 (2304 cells; exact CPU Dijkstra solves it in well under 1ms).
    A maze is just a heightmap: no maze-specific code exists anywhere in the brain. The
    page POSTs /ai/brain/snapshot, the brain publishes /ai/brain/flowfield, and a walker
    steers by sampling fx/fz at its own cell. Draw walls with the mouse; the walker
    re-routes the moment the brain re-solves. Distance shading + flow arrows optional.
    It is deliberately a LIE DETECTOR: if the field is stale or wrong the walker stalls or
    walks into a wall, and the page says so instead of faking motion.

    Bug #1 it caught (mine): the walker stalled with "field points INTO a wall". Isolated
    it by walking the exact field cell-by-cell down its gradient in node -- reached the
    goal in 41 steps, never entering a wall. So the FIELD was right and the PAGE was wrong:
    continuous motion + Math.round cell probing clips wall corners. Fixed with a clamped
    step (< half a cell) and axis sliding; a genuine bad field is still reported.

    Bug #2 it caught (modelling, and more interesting): with WALL_H=60 the walker still
    stalled -- and the probe showed the field pointing straight INTO the baffle with
    dist=4104. Correct! The brain has NO concept of "impassable": a wall is a steep
    expensive cell (cost ~= 1 + slopeK*dh/cell). At WALL_H=60 a wall cell costs 46 and a
    40-cell detour costs 40, so Dijkstra rationally smashes through. Measured the
    threshold by walking the field and counting wall crossings:
        WALL_H   60 -> 2 crossings | 200 -> 2 | 400 -> 1 | 800 -> 0 | 2000 -> 0
    800 is the first height where walls are truly impassable. Page uses 1000 for margin,
    with the table in a comment. Verified headless end-to-end against a real
    FlowFieldSolverCPU behind the bridge: walker reports "arrived", 0 cells from goal,
    0 stalls, 0 page errors.

(2) Fleet benchmark. Keith asked for a second, peer-brain measure. Important distinction
    found while building it: /ai/brain/fleet lists brains attached to ONE bridge; peer
    brains live on OTHER boxes with their own bridge. So the fleet is the LAN peer list
    (/sys/peer-versions -> [{url,name,reachable}]). Fan-out is client-side (the bridge
    already sends Access-Control-Allow-Origin:*), and SEQUENTIAL on purpose -- a parallel
    sweep would have every box benchmarking at once and none of the numbers would mean
    anything. Table: box | gpu | cpu med | gpu med | fixed ms | mean field error in degrees.
    Verified headless against three simulated brains (Iris 31ms/44deg, GTX 1070 4.2ms/10deg,
    GTX 1080 3.1ms/8deg): correct ordering, correct per-box error, 0 page errors.

Also: brain-maze.html added to SweK Engine Pages (Control & status) and linked from the
GPU Brain panel as "Obstacle room".

verify-all GREEN. Brain banner -> v2158.

### v2159 -- maze walker fixed (wrong goal contract + a no-op slide); corrected VBA installed

(1) "the ball is always on the left and goes up the left side" -- Keith's screenshot showed
    EVERY flow arrow pointing up-left. Root cause, and it is mine: the brain wants goals in
    WORLD coords and converts them itself (brain.js ~1938):
        gx = Math.round((g.x - snap.ox) / snap.cell)
    brain-maze.html was posting {gx,gy}. So g.x is undefined -> NaN -> the goal collapses to
    cell (0,0). Reproduced exactly: with a NaN goal the flow at every cell is
    (-0.71,-0.71) and the field's lowest-cost cell is 0,0. The walker was faithfully
    walking toward the top-left corner. Fixed: goals now post {x,z} world coords.

    WHY THE TEST MISSED IT: the headless stub bridge passed s.goals straight to
    FlowFieldSolverCPU, which takes {gx,gy}. I validated the page against my own stub
    instead of the brain's real mapping. The stub now MIRRORS brain.js's world->cell
    conversion (and screams "BAD GOAL SHAPE" on a non-finite goal), so this contract
    mismatch cannot pass again.

(2) Second bug the corrected test then exposed: the walker stalled against a baffle. The
    axis-slide fallback is a no-op when the flow is purely +x (dz == 0): "slide on Z" moves
    by zero yet reports success, so it spins forever. Replaced with DISTANCE-FIELD DESCENT:
    when the flow vector is blocked, step toward the cheapest passable neighbour. dist
    strictly decreases toward the goal, so progress is guaranteed when a route exists; when
    none exists it says "boxed in" rather than pretending. Re-verified end-to-end against
    the real contract: "arrived", 0 cells from goal, 0 stalls, 0 page errors.

(3) VBAVoxelEngine -- corrected workbook installed (73 modules + CHANGES.md).
    Did not take the changelog on trust; verified every load-bearing claim independently:
      - 73 .bas/.cls (was 74)                                    CONFIRMED
      - modGLConstants.bas holds exactly 81 Public Const         CONFIRMED (69 GL_ + 12 WGL)
      - modVoxelControl / modMSAAPixelFormat / modInit removed   CONFIRMED
      - modOllamaInit.bas present                                CONFIRMED
      - "zero ambiguous Public names": scanned 465 public symbols
        (Sub/Function/Const/Declare) across every .bas           CONFIRMED, zero dupes
      - "all #If/#End If balanced" across .bas + .cls            CONFIRMED

(4) htmx audit (asked: which other pages would benefit?). Answer: very few, and blanket
    adoption would be a NET LOSS. Evidence: htmx is vendored (2.0.10) and used in
    server.html (hx-boost on the page directory) + clients.html (hx-get poll). The pages
    that look like candidates by raw poll+innerHTML count -- settings(5/21), cams(6/15),
    presence(1/16) -- all fetch JSON and build DOM. htmx swaps HTML FRAGMENTS, so adopting
    it there means adding HTML-returning routes that duplicate the JSON API: more surface,
    no user-visible gain. And hx-boost has nothing to grab: home/hub/panels/board/wall all
    have ZERO static internal .html links (they build links in JS). Recommendation: leave
    htmx where it is. Not built on spec.

verify-all GREEN. Brain banner -> v2159.

### v2160 -- Endless Sky port merged forward (fork was off v2137; we are at v2159)

The ES work arrived as TWO uploads that disagree with each other and with HEAD, so this was
a merge, not a copy. Classified every file before touching anything:

  - EngineProject_v2141es.zip -- a fork off v2137, 22 versions behind.
  - es_files.zip -- 9 files, and THREE of them (esCombat.js, esFleets.js,
    es-combat-selfcheck.mjs) do not exist in the fork at all. es_files is NEWER than the
    fork: it is the delta. Per-file provenance was resolved, not assumed:
        newer in es_files : esData.js, esMissions.js, flightView.js, es-build.mjs, ev.html
        only in fork      : esParse.js, esSprites.js, esConditions.js, esEconomy.js,
                            es-universe.json, 3 selfchecks

THE TRAP: the fork's ev.html has ZERO readZip references. Copying it wholesale would have
silently deleted the v2138 in-memory zip loader. Diff said: 20 lines only in ours (exactly
the zip loader), 183 only in theirs (the ES paths). So ev.html was hand-merged -- ES version
as the base, zip loader re-applied ABOVE the ES detection so a zipped drop now works for
BOTH engines (ES .txt, es-universe.json, or an EV resource fork).
  SECOND TRAP, caught while re-applying it: the v2138 skip list was
  /\.(txt|md|rtf|png|...)/ -- it skips .txt, and Endless Sky data IS .txt. Copying my own
  old code forward would have silently thrown away every ES data file inside a zip. The
  merged list drops .txt and .json from the skip set.

flightView.js: the ES change is purely additive -- an optional `opts.spawn` hook, with the
EV `dudes` path kept as the fallback (`if (!enemies.length && opts.universe.dudes ...)`).
Fork and HEAD were otherwise identical for this file, so es_files' copy was taken whole.

VERIFICATION (the port ships its own tests -- ran them in OUR tree, not theirs):
  es-conditions-selfcheck   9 passed, 0 failed
  es-economy-selfcheck      7 passed, 0 failed
  es-missions-selfcheck     7 passed, 0 failed
  es-combat-selfcheck      24 passed, 0 failed          -> 47/47
  node --check on all 10 ES/flightView/es-build modules -> clean
  es-universe.json vs its README: source=endless-sky, 694 systems, 868 ships, 352 weapons,
    126 govts, 878 outfits -- every headline count MATCHES; 0 dangling links (README: 0).
    (My stellar count reads 5517 vs the README's 4989 -- probably a different key; reported
    rather than asserted as a discrepancy.)
  ev.html loaded headless: 0 page errors, 0 failed requests, both code paths present
    (readZip refs 2, endless-sky refs 7).
  engine verify-all GREEN.

Installed: ev/{esParse,esData,esSprites,esConditions,esEconomy,esMissions,esCombat,esFleets}.js,
ev/tools/es-{conditions,economy,missions,combat}-selfcheck.mjs, es-build.mjs, es-universe.json
(13MB, 694-system prebaked galaxy), README-endless-sky.md, merged ev.html + flightView.js.

### v2161 -- ES unknown-node reporter: measure what the adapter ignores

The ES adapter consumes a fixed set of root node types and silently drops the rest --
esData.js has zero console.warn and no unknown-node path, so an ES data drop can contain
content the engine never sees and never mentions. This turns "I think we ignore some
things" into a measured inventory.

ev/esCoverage.js
  - HANDLED: the 11 consumed root types (system, planet, ship, outfit, government, trade,
    fleet, mission, event, shipyard, outfitter), each annotated with WHICH module eats it.
  - MISSION_KEYS: the mission child keys esMissions.js actually reads -- taken from its
    child()/children() call sites, not from memory.
  - coverageReport(root) -> { total, handledTotal, unknownTotal, pctHandled, handled[],
    unknown[], missionChildUnknown[] }. Also reports ignored keys INSIDE mission blocks,
    which is where the interesting gaps hide.
  - formatCoverage() so the baker, the CLI, and any page render it identically.

ev/tools/es-coverage.mjs
  - `node ev/tools/es-coverage.mjs <endless-sky/data>` -> table; `--json`; `--selfcheck`.
  - ANTI-DRIFT GUARD: the self-check reads esData.js / esMissions.js / esFleets.js /
    esEconomy.js and FAILS if any type declared in HANDLED is not referenced there. A
    reporter whose "handled" list rots is worse than no reporter.

VERIFIED, not just written:
  - selfcheck 12 passed / 0 failed. Covers: root counting, phrase counted twice, pctHandled
    math, ignored mission child reported, `on` and `source` NOT falsely reported as ignored,
    clean data -> 0 unknown.
  - PROVED THE GUARD BITES: injected a bogus HANDLED entry ("hazard") and the self-check
    failed, naming it -- "not found: hazard". Restored; back to 12/12. A guard that never
    fails is decoration.
  - CLI run on a synthetic ES tree (2 files, 12 roots): reports 5/12 consumed (41.7%), and
    lists phrase(2), hazard, minable, news, person, start as ignored, plus `substitutions`
    as an ignored mission child. Exactly the shape of the real answer.
  - es-build.mjs now computes coverage at bake time, PRINTS it after the counts, and bakes
    `coverage` into es-universe.json so the number travels with the data.

HONEST NOTE: the shipped es-universe.json was baked BEFORE this existed, so it carries no
`coverage` key. The real percentages for current ES master require a rebake:
    node es-build.mjs path/to/endless-sky/data ./es-universe.json
Until then the ignored-type list in the previous session's summary remains an inference
from reading dispatch code -- this tool is what replaces it with data.

verify-all GREEN. Brain banner -> v2161.

### v2162 -- endless-sky.html: presentation page + one-click universe baker

Mirrors ev-loader.html ("bring your own data, then fly") for the Endless Sky port.

endless-sky.html
  - What it is + the GPLv3 / ships-no-content statement, stated plainly.
  - Live status of the baked galaxy (size, source, every count) read from /es/status --
    not hardcoded from the README, so it can never drift from the actual file.
  - Download links: es-universe.json, README-endless-sky.md. "Fly it in Stellar Atlas"
    jumps to ev.html.
  - BUILD panel: point it at an endless-sky/data clone, click, and the SweK server runs
    `node es-build.mjs <dir> es-universe.json`. Ticks an elapsed counter; prints the baker's
    log; refreshes status + coverage on success. No client-side abort -- a real ES bake is
    minutes and killing it from the browser would only orphan the child.
  - COVERAGE panel: renders the v2161 unknown-node inventory (consumed types, ignored root
    types, ignored mission-block keys). If the universe predates the reporter it says
    "rebake to measure" instead of implying 100%.

ai-bridge/esBuildBridge.js -- owns GET /es/status, GET /es/coverage, POST /es/build.
  Verified /es/* is a free namespace first (no other bridge's owns() matches it), after the
  gpuBrainBridge prefix-swallow lesson in v2155.
  Deliberate behaviours:
   - dataDir is validated AND must contain .txt before spawning, so a wrong folder fails in
     milliseconds instead of running for minutes and baking an empty universe.
   - the bake writes to es-universe.json.building and only renames on success. A failed
     build can never destroy a working galaxy.
   - the baked file is re-parsed and its source checked before the swap.
   - child process has a 5-minute hard timeout; a wedged bake cannot hang the bridge.
   - a universe with no `coverage` key is reported as "not measured -- rebake", never as
     full coverage.

VERIFIED end-to-end against the real bridge, not a stub:
  /es/status on the shipped universe -> present, 12,797 KB, source endless-sky,
      coverageMeasured:false + the rebake note (correct: it was baked pre-reporter).
  POST /es/build {dataDir:"/tmp/does-not-exist"} -> "no such directory", nothing touched.
  POST /es/build {dataDir: an empty dir}         -> "no .txt files under ... is that the ES
      `data` folder?", nothing touched.
  POST /es/build {dataDir:"/tmp/esdata"}         -> ok, 2 .txt files, coverage measured,
      41.7% handled, ignored: phrase(2) hazard minable news person start.
  /es/coverage afterwards                        -> measured:true.
  Page driven headless through that bridge: status renders, Build button bakes, log shows,
  coverage table appears, 0 page errors. Real 694-system universe restored after the test.

Added to SweK Engine Pages (Tools) as "Endless Sky". verify-all GREEN. Brain banner -> v2162.

### v2163 -- Endless Sky button on server.html; one-click Install; REAL coverage measured

Q: is there an ES button on server.html? A: no -- only a Pages-directory link. Now there is.

(1) server.html: a "Endless Sky" gtab right after GPU Brain, with a live "694 sys" badge, and
    a panel with three gauges (galaxy/systems + KB, ships + outfits/weapons, data coverage %
    + nodes ignored) plus links to the ES page, "Fly it", and es-universe.json. Reads
    /es/status -- the same source the ES page uses -- so the tab can never disagree with the
    page. Polls only while open, AbortController(4s), honest "unreachable" text.

(2) Install button on endless-sky.html -> POST /es/install. Streams the ES source tarball
    from codeload.github.com and extracts ONLY data/**.txt. The tar is parsed IN JS, not by
    shelling out: GNU tar needs --wildcards and Windows' bundled bsdtar rejects it, so
    shelling out would work on exactly one of Keith's two machines. Path traversal is
    rejected, not sanitised. Clean install (old dir removed first). Bad ref -> honest 404,
    nothing written. On success the data path is auto-filled into the Build box.
    LIVE-TESTED against GitHub: 199 files, 10,039 KB extracted from a 356 MB download, 25s.
    Honest cost surfaced in the UI: GitHub offers no listing-free smaller archive, and the
    API tree endpoint needs a token once rate-limited.

(3) THE PAYOFF -- the coverage question is now answered with data, not inference. Installed
    real ES master, baked it, and shipped the result. es-universe.json is now REBAKED from
    current master (identical 694 systems / 868 ships / 352 weapons) and CARRIES its coverage:
        78.6% of root nodes consumed; 1,702 ignored
        ignored: phrase(867) effect(308) news(219) star(87) conversation(46) minable(34) ...
        ignored INSIDE mission blocks: to(376) minor(302) color(213) blocked(186) ...
    NOTE the standalone CLI reports 71.1%/2581 because it walks 199 .txt (incl. tests/) while
    es-build.mjs gathers 188. Different denominators; both correct about what they measured.
    The baker's number is the one that matters -- it reflects what actually gets parsed.

    AND A REAL BUG FELL OUT OF IT. The 376 ignored `to` keys are not noise. findChild matches
    tokens.join(" "), so `to offer` works -- but ES data also contains:
        to offer 2237 (read) | to fail 174 | to accept 102 | to complete 100   (174+102+100=376)
    esMissions.js reads NONE of `to fail` / `to accept` / `to complete`. Mission completion,
    failure, and acceptance gates are never evaluated -- missions can complete when Endless Sky
    says they should not. Undocumented anywhere. The reporter earned its keep on its first run
    against real data.

Verified headless through the real bridge: server.html ES panel reads 694 sys / 868 ships /
78.6% / 1,702 ignored, 0 page errors; endless-sky.html status + coverage table render, 0 page
errors. verify-all GREEN. Brain banner -> v2163.

NEXT (highest value, now evidence-backed): implement `to complete` / `to fail` / `to accept`
in esMissions.js. 376 real gates, currently ignored.

### v2164 -- ES mission gates implemented (the 376); plugins: community hand-off + one-click install

FACT-CHECK FIRST. Keith pasted a plugin write-up; two of its claims are wrong and would have
cost real work:
  - "PNG frames + .animation text configuration files" -- there are ZERO .animation files in
    real ES master. Frames are foo=0.png / foo-0.png / foo+0.png / foo~0.png, and esSprites.js
    ALREADY tries all four.
  - EV types are not "shiz, wepn, char"; they are shïp / wëap / oütf.
The rest (tab-indent hierarchy, string-name asset refs, case-insensitive lookup) is right --
and esParse.js already implements it.

(1) THE 376 GATES -- the top item the coverage reporter found, now closed.
    ES gates the mission lifecycle on FOUR condition blocks. Only `to offer` was implemented.
    Real master: to offer 2237 (read) | to fail 174 | to accept 102 | to complete 100 = 376
    ignored. Consequence: a mission could COMPLETE when Endless Sky says it must not.
    Implemented in esMissions.js: gate(node,key) (absent block -> pass; present -> must
    evaluate true) applied to `to accept` (refuses acceptance) and `to complete` (blocks
    completion at the destination); plus checkFailures() for `to fail`, called on arrival AND
    on jump so it cannot only trip at a destination the player never reaches. Exported.

    New ev/tools/es-gates-selfcheck.mjs: 18 tests. MUTATION-TESTED, because a test that
    cannot fail is decoration:
      - neuter gate() to `return true`        -> 7 tests FAIL
      - delete the checkFailures() jump call  -> 1 test FAILS
      - restore                               -> 18/18
    Also asserts an UNGATED mission is not blocked by any of it.
    All other ES selfchecks re-run clean: gates 18, missions 7, combat 24, conditions 9,
    economy 7, coverage 12 = 77 passed, 0 failed.

(2) PLUGINS -- hand off discovery, own the install. Keith: "there are more than many."
    endless-sky.html gains a Plugins section that does NOT try to be a plugin browser: it
    links the community's own indexes (endless-sky.github.io/plugins.html and
    EndlessSkyCommunity/awesome-endless-sky), then takes a GitHub repo and installs it.
    POST /es/plugins/install {repo, ref} -- accepts owner/name or a github.com URL, tries the
    given ref then falls back main->master (plugin repos disagree). GET /es/plugins lists
    what is installed. Selected plugins ride into the next bake: es-build.mjs now accepts
    extra data dirs AFTER the output path, gathered after the base so plugin definitions win.

    VERIFIED AGAINST A REAL PLUGIN REPO (zuckung/endless-sky-plugins, 264MB tarball):
      extractPluginData -> 46 plugins, 178 data/*.txt, 0 non-.txt files, 172ms.
      (matches `tar -tzf | grep -c data/.*\.txt` exactly)
    And end-to-end through the baker: base 694 sys / 868 ships / 878 outfits ->
    base+uniques+gegno.pirates 699 / 878 / 916 (+5 systems, +10 ships, +38 outfits, +6 spobs).
    Plugin content genuinely reaches the universe.

    HONEST GAP, stated in the UI: plugin ART is not downloaded. A plugin repo tarball is ~265MB
    and almost all images. Base ship sprites already stream from the ES repo's raw URLs at
    runtime; plugin art needs the same resolver and is deliberately NOT half-built, so plugin
    ships currently fly as vector shapes. That is the next honest piece of work for visuals.

Headless-verified: plugin list renders as tickboxes, a bad repo returns "repo must look like
owner/name (or a github.com URL)", 0 page errors. verify-all GREEN. Brain banner -> v2164.

### v2165 -- plugin sprite resolver: plugin ships render, streamed from the plugin's own repo

v2164 shipped plugin DATA but left art unbuilt, and said so. Closed now, and it did not need the
265MB download after all.

VERIFIED THE PREMISE BEFORE DESIGNING ANYTHING (three curls):
    plugin ship  .../zuckung/endless-sky-plugins/main/myplugins/better.starts/images/ship/z_squid.png -> 200
    base ship    .../endless-sky/endless-sky/master/images/ship/dredger.png                            -> 200
    plugin miss  .../better.starts/images/ship/dredger.png                                             -> 404
Both 200s carry `access-control-allow-origin: *`, which the baker NEEDS: it reads pixels back off a
canvas to build the 32-frame rotation sheet, and a tainted canvas would throw. (My first base-game
probe 404'd on `ship/shuttle.png` -- that was a wrong filename I guessed, not a wrong scheme. Real
sprite tokens come from the data: `sprite "ship/dredger"`.)

ev/esSprites.js: IMAGES_BASE (one root) -> esImageBases() (an ORDERED list). Plugins first, base game
LAST, which is how ES layers art. candidateUrls() is now base-major: every suffix
(.png/=0/-0/+0/~0/.jpg...) is tried under a plugin before falling through to the next root, so a
plugin overriding a base ship with an animated sequence still wins. New setEsPluginImageBases();
window.ES_PLUGIN_IMAGE_BASES honoured at module init. With no plugins the list is exactly
[DEFAULT_BASE] -- regression-checked, behaviour unchanged.

ai-bridge/esBuildBridge.js: extractPluginData now records each plugin's FULL path inside the repo
(myplugins/better.starts, not just the leaf) and whether it ships an images/ dir. A _manifest.json
records repo/ref/path/hasImages per plugin, and GET /es/plugins returns a ready-made
    imagesBase = raw.githubusercontent.com/<repo>/<ref>/<path>/images/
which is NULL for data-only plugins -- registering a root that 404s every sprite only buys
round-trips. On the real zuckung repo: 46 plugins, 30 with art, and better.starts' computed
imagesBase is byte-identical to the URL that curl returned 200 for.

ev.html asks the bridge for the roots at load and hands them to esSprites. No bridge, or route
absent -> the array stays empty and the base game resolves exactly as before.

PROVEN IN A REAL BROWSER (headless, real bridge, two real plugins installed):
    /es/plugins -> uniques (24 files, art=false, base=none) | better.starts (art=true, base=...)
    ev.html console: "[es] 1 plugin art root(s) registered"
    esImageBases() INSIDE the page: count 2, first = the plugin root, last = the base game
    0 page errors.
So a data-only plugin correctly contributes no art root, and an art plugin's ships resolve first.

All ES selfchecks green: gates 18, missions 7, combat 24, conditions 9, economy 7, coverage 12 = 77.
verify-all GREEN. Brain banner -> v2165.

HONEST REMAINING GAPS on plugin art:
  - Case sensitivity: ES resolves sprite names case-insensitively; raw.githubusercontent does not.
    A plugin whose data says `sprite "ship/Foo"` but ships `foo.png` will 404 through every root and
    fall back to the vector triangle. Fixing this needs a file listing per plugin (one API call per
    repo), which is a real, small next step -- NOT faked here.
  - @2x hi-DPI variants are not requested (we bake to MAX_SPRITE_PX anyway).
  - Which plugins are "enabled" is currently "all installed plugins that ship art", newest first.
    Tying art roots to the plugins actually baked into es-universe.json would be tighter.

### v2166 -- brain tactics for ES combat: WHO to shoot, and WHETHER to fight

Scoped by reading the code first. flightView's hostile AI was three lines: nearest target, always
engage, never break off. A magnet, not tactics. combat.js's stepAI is already pure ({turn, thrust,
firing} toward whatever it is handed), so this is a DECISION LAYER above it, not a rewrite.

And the v2156 benchmark decided the shape: the brain's value is the POLICY, not the pathfinding. A
96x96 flow-field solve costs ~31ms of readback to answer a question a dot product answers in
nanoseconds. So the brain does not fly ES ships -- it supplies the WEIGHTS.

ev/esTactics.js -- pure, deterministic, no clock, no RNG:
  chooseTarget(self, candidates, w)  -- reachability-gated score over closeness, weakness (finish the
      kill), threat (remove the danger), player bias, and focus (stickiness, so ships stop dithering)
  shouldFlee(self, threats, w)       -- requires BOTH hurt AND losing, with hysteresis so the AI does
      not flicker between running and fighting
  fleePoint()                        -- stepAI closes on what it is handed, so a fleeing ship is handed
      a mirror point away from the biggest threat (you escape a ship, not an average)
  applyBrainWeights(served)          -- validates: only known keys, only finite numbers. A garbage
      payload degrades to the hand policy; it never produces a ship that stands still. Reports
      _brainWeights so the UI can honestly say "hand policy".

THE SELFCHECK CAUGHT A REAL BUG IN MY OWN WEIGHTS. v1 summed the terms independently with closeness
decaying over 2*range, so a nearly-dead ship 1200 units away scored 0.571 closeness and outranked the
pristine ship shooting you at point-blank. Fixed with a principled model rather than tuned numbers:
REACHABILITY GATES EVERYTHING -- you can only finish a wounded ship, chase the player, or answer a
threat if you can get there -- so the whole preference sum is scaled by range/(range+d).
  pristine@10 vs nearly-dead@1200 -> kills the one shooting it   (was: chased the far wounded)
  pristine@100 vs nearly-dead@160 -> finishes the kill           (still correct)
A second test asserted a pristine ship at 5 units should beat a nearly-dead one at 160. On reflection
that premise is WRONG -- finishing a one-shot kill is correct tactics -- so the TEST was replaced, not
the weights bent to satisfy it. Replaced with a claim I can defend: between identical targets, the
closer one wins.

ev/tools/es-tactics-selfcheck.mjs -- 37 tests, every one built so the naive "nearest" answer is the
WRONG answer. MUTATION-TESTED:
    revert scoring to nearest-only  -> 5 tests FAIL
    make shouldFlee always false    -> 5 tests FAIL
    trust the brain payload blindly -> crashes outright
    restore                          -> 37/37

flightView.js: enemy targeting now calls tacticsDecide when opts.tactics is on. GATED -- the EV path
keeps its exact previous nearest-target behaviour (the fallback branch is still there, verbatim).
Per-ship _tgtId and _fleeing carry focus + hysteresis across ticks.

AND A BUG THE WIRING EXPOSED: pPos was `{x, y, team}` -- no health, no stats. Tactics score on health
and threat, so the player arrived looking permanently pristine AND harmless: hostiles would never
finish a wounded pilot nor fear a dangerous one. pPos now carries live hp/maxHp. Proven: close healthy
escort @60 vs player @600 -- bare pPos picks the escort, live pPos finishes the wounded pilot.
`dps` is left at the default for everyone (NPC dps is not modelled either), so strength compares
durability on equal terms rather than faking a precision we do not have.

ev.html: tactics enabled on the ES path only. Brain weights ride the flowfield payload alongside the
scalars the brain already serves (tradeT, escortThreshold). The PRODUCER side does not exist yet, so
the consumer reads `field.tacticsW` if present and otherwise leaves the hand policy in place --
nothing pretends the brain is steering when it isn't. Verified in a real browser: hostiles finish the
wounded, flee the boss, and window.ES_TACTICS_WEIGHTS is null (hand policy). 0 page errors.

All ES selfchecks green: tactics 37, gates 18, missions 7, combat 24, conditions 9, economy 7,
coverage 12 = 114 passed, 0 failed. verify-all GREEN. Brain banner -> v2166.

NEXT, and small: teach brain.js to publish `tacticsW` on the flowfield payload and learn it from the
combat outcomes it already ingests (recordEvent gives kills; esTactics gives the features). The whole
consumer path is built and tested; the producer is one weight vector.

### v2167 -- the brain producer: ES combat tactics are now LEARNED, not hand-set

v2166 shipped the consumer and said plainly that the brain served nothing. Closed. The loop runs
end to end, in a browser, against the real bridge.

DESIGN CALL: the BRIDGE owns the policy, not brain.js. The bridge is plain Node -- so the learner is
testable here rather than only on the rig -- it already persists to ~/.voxelbridge/brain, and both the
engine (which produces outcomes) and the brain (which consumes policy) already talk to it.

ONE SOURCE OF TRUTH FOR FEATURES. esTactics.features() is now exported and used by BOTH sides. Two
copies of that arithmetic would silently drift and the brain would optimise a policy the game never
runs. chooseTarget() additionally returns the RUNNER-UP's features -- the counterfactual -- because a
reward alone cannot say WHICH feature made a choice good.

brain/tacticsPolicy.js -- a linear contextual bandit, not a net. Five weights, sparse signal.
    w = hand + GAIN * mean_over_samples( reward * (x_chosen - x_alternative) )
No counterfactual -> no gradient -> the sample is rejected, not absorbed. Weights clamp to [-2, 4].
CommonJS ON PURPOSE: the bridge requires it, and `require()` of ESM needs Node >= 20.19/22.12. This
tree has no package.json "type", so a plain .js is CJS everywhere; gambling on Keith's Node version
for the one process that must never fail to start would have been reckless. ESM callers import the
default.

THE HTTP TEST CAUGHT A REAL BUG. The first learner SUMMED per-sample updates, so 80 identical samples
slammed wWeak into the clamp at 4.0. Saturation by repetition is wrong: a policy should encode how
CONSISTENT the evidence is, not how long the game was left running. Switched to an averaged gradient.
Now 10 samples and 1000 identical samples give the SAME weights (2.750), evenly-split evidence teaches
nothing, and 3:1 evidence lands in between. Tests added for all three.

ai-bridge/tacticsBridge.js -- GET /ai/brain/tactics (serve), POST (record + retrain), POST /reset.
Registered BEFORE gpuBrainBridge, which owns the whole /ai/brain prefix and would have swallowed these
routes silently -- verified: gpuBrainBridge.owns("/ai/brain/tactics") === true. Same trap as v2155.
Untrained (< 8 outcomes) -> source:"hand", weights:null. We never dress up untrained numbers as
learned ones. Buffer capped at 4000, persisted, retrained from the whole buffer so the served vector
is always exactly what the recorded history implies.

flightView.js emits the reward. Attribution is deliberately conservative -- credit only what can be
tied to an outcome, and never a sample without its counterfactual:
    a hostile died                   -> its own last decision was bad   (-1)
    a hostile's target was destroyed -> that hostile's decision was good (+1)
    the player died                  -> hostiles that targeted the player (+1)
ev.html reads /ai/brain/tactics at load and POSTs outcomes back, fire-and-forget: a dropped POST costs
one lesson, never a frame.

PROVEN IN A REAL BROWSER, real bridge, real state file:
    1st load : "[es] tactics: hand policy (0/8 outcomes recorded)"   ES_TACTICS_WEIGHTS = null
    page reports 12 outcomes -> bridge: source "learned", wWeak 2.750
    2nd load : "[es] tactics: GPU Brain policy (12 outcomes)"        ES_TACTICS_WEIGHTS.wWeak = 2.750
    0 page errors.
And the learner's own selfcheck closes the loop through the ENGINE's chooseTarget: taught a world where
finishing the wounded pays, the engine flips its pick; taught the inverted world, it flips back. A
policy, not a constant.

Selfchecks: tactics 37, gates 18, missions 7, combat 24, conditions 9, economy 7, coverage 12,
tactics-policy 28 = 142 passed, 0 failed. verify-all GREEN. Brain banner -> v2167.

### v2168 -- ES co-op: the authority model (deterministic hostiles + single-simulator ownership)

Scoped by reading first, and the read changed the plan. Transport is NOT the problem: presence.js
already ships four transports (WebRTC P2P, same-machine tabs, HTTP rendezvous, Supabase), 10Hz
position+hp, peer ghosts, bot ghosts, even a shot relay. Its own header states the gap exactly:
"co-op PRESENCE, not authoritative combat". Each client spawns its OWN hostiles, so two pilots in the
same system fight different ships.

Two things must be true, and neither needs a server or an election (P2P-first is a standing rule):
  1. everyone sees the SAME npcs         -> deterministic spawn from a shared seed
  2. exactly one peer SIMULATES each npc -> deterministic ownership from the peer set

ev/esAuthority.js -- pure, deterministic, no clock:
  makeRng(seed)            mulberry32; combat.js already accepts an injectable `rnd`
  spawnSeed(room, system)  FNV-1a over room|system. No clock, no peer list: two pilots who arrive an
                           hour apart still meet the same hostiles.
  ownerOf / ownsNpc        RENDEZVOUS (highest-random-weight) hashing, not peers[hash % n]
  partition(me, npcs)      what I drive vs what I merely draw
  validateDamage           a peer may SHOOT anything; it may only APPLY damage to what it owns.
                           Otherwise two clients decrement the same hull and ships die twice as fast --
                           the classic co-op desync, invisible until someone notices early kills.
                           Rejects: foreign npc, NaN/negative/absurd damage, self-reported hits, and
                           replayed or stale sequence numbers.
  ghostAt                  dead-reckons POSITION only, capped at 0.5s, and flags itself stale. Guessing
                           heading or hull invents facts; a ghost that shoots is a ghost that desyncs.

WHY HRW AND NOT MODULO -- and the test that proves it. Under `peers[hash % n]`, one pilot jumping out
changes n and reassigns nearly EVERY npc; the system stutters as every ship changes hands. Under HRW
only the departed peer's npcs move. Measured: modulo churns >50% on departure, HRW churns 24.7% with
four peers, and a JOINING peer takes a fair share while disturbing nothing else (otherMoved === 0).

MY FIRST WEIGHT FUNCTION WAS BROKEN AND THE SELFCHECK CAUGHT IT. weight = hashStr(npcId + "@" + peerId)
looked fine and was not: FNV over strings differing only in their last characters produces correlated
hashes, so peer "d" owned 49.4% of npcs and a departure churned 49.2% -- almost exactly the modulo
failure the scheme exists to avoid. Fixed by hashing the two INDEPENDENTLY, combining with an odd
multiplier, then a murmur3 finalizer. After: 25.4/24.1/26.2/24.4% share, 24.7% churn.

ev/tools/es-authority-selfcheck.mjs -- 45 tests. MUTATION-TESTED:
    concatenate-then-hash (my original bug) -> 2 tests FAIL (distribution, churn)
    modulo ownership                        -> 3 tests FAIL, exactly the churn + join tests that
                                               justify HRW's arithmetic
    restore                                 -> 45/45

WIRED, and verified: flightView seeds both spawners from (room, system) when a room is present.
Two peers, same room + system -> byte-identical hostiles (same classes, positions, headings). Different
system or different room -> different hostiles. Solo play passes no room, keeps Math.random, unchanged.
ev.html hands flightView the room only when net is up. ev.html loads clean, authority runs in-browser,
0 page errors.

Selfchecks: authority 45, tactics 37, gates 18, missions 7, combat 24, conditions 9, economy 7,
coverage 12, tactics-policy 28 = 187 passed, 0 failed. verify-all GREEN. Brain banner -> v2168.

HONEST REMAINING WORK -- the half that needs a wire, not a proof:
  - Owners must BROADCAST their npcs' state (id, x, y, vx, vy, heading, shield, armor, dead) on the
    presence channel; non-owners must stop simulating those npcs and render ghostAt() instead. The
    payload slot is small (presence.js already passes a per-peer object through untouched) and the
    consumer (ghostAt) is written and tested. Until that lands, peers still each simulate their own
    copy -- they now START from the same ships, which is a real improvement, but they will drift.
  - Damage events must be ADDRESSED to the owner and validated with validateDamage + noteAccepted.
    combatHit() already POSTs hit events; it needs the npcId->owner routing and a per-shooter seq.
  - Deliberately not faked: nothing in this ship pretends the simulation is synchronised.

### v2169 -- ES co-op replication lands. And the brain-as-client is now PROVEN, not proposed.

v2168 left one honest gap: peers started from the same ships but each simulated its own copy, so they
would drift. Closed.

REPLICATION (esAuthority):
  packNpcs(npcs, me, peers)   owner-side: only what I own, rounded to ints, capped at 64/packet
  sanitizeNpc / mergeRemoteNpcs  receiver-side, with the rule that makes co-op safe:
      NEVER trust a packet about an npc the sender does not own.
  Ownership is computable by the receiver, so there is nothing to negotiate -- a spoofed claim is just
  dropped. Without it, any peer can teleport your ships or resurrect the one you just killed.
  Everything is bounded: NaN -> 0, Infinity clamped, coordinates clamped to 1e7, negative hull floored
  at 0, a 5000-npc flood truncated to the cap. A buggy or hostile peer must not be able to take the
  frame down.

presence.js: its sanitiser is a WHITELIST, so `npcs` had to be named explicitly on both send and
upsert -- it was being silently dropped. Stored RAW and validated downstream by mergeRemoteNpcs, which
is the only place that knows who owns what: presence must not become a second, weaker authority.
makeNet gained myId() and peerIds(systemId) -- scoped to the system, because a pilot three jumps away
must not own hostiles they cannot see.

flightView: a non-owner does not run the AI, does not fire, and does not recharge shields. Two
simulations of one ship diverge within seconds and then disagree about who is alive. It adopts the
owner's broadcast, dead-reckoned, and marks the ship a ghost. Owners ride their npc states on the
presence packet already sent at 10Hz. Solo play has no peer list, owns everything, and the whole block
is a no-op.

VERIFIED OVER THE REAL STACK (two PresenceManagers on a shared wire, not mocks): identical spawn,
peer sets agree, ownership disjoint and complete, peer A adopts peer B's ships to within the 1-unit
packing precision, spoofed claims rejected wholesale, own echo ignored, a silent owner goes stale
rather than teleporting, and on departure only the leaver's ships change hands.

---- AND THE THING KEITH ACTUALLY WANTED ----

"the coolest thing would be the brain as connecting client."

It is not a stretch goal. It is a CONSEQUENCE of the authority model, and this ship proves it. Checked,
not assumed: combat.js, esTactics.js and esAuthority.js contain ZERO browser APIs (the only greps that
hit were the word "WebGLEngine" in their header comments), and httpPresenceTransport uses nothing but
fetch. Node has fetch. So a headless pilot needs no canvas, no WebGL, no DOM.

ev/tools/es-coop-selfcheck.mjs -- 21 tests -- and its SECOND PEER IS HEADLESS. It joins, rendezvous
hashing hands it ships automatically (no election, no coordinator, matching the P2P-first rule), it
picks targets with esTactics, moves them, and broadcasts. The browser peer adopts them as ghosts and
CONVERGES. The test asserts it decided for every ship it owned, that its ships moved, that it engaged,
and that the watching peer stopped simulating them.

That headless peer is the GPU Brain. Everything it needs already exists and is tested:
    joining    -> httpPresenceTransport (fetch only)
    getting ships -> ownerOf(): join the room and HRW assigns you a fair share, instantly
    flying them   -> combat.stepAI (pure)
    fighting well -> esTactics.decide with weights from /ai/brain/tactics
    getting better -> tacticsBridge already learns from the outcomes it will now generate itself
What remains is an entry point -- a loop that ticks those pure functions -- not new machinery.

Selfchecks: coop 21, authority 62, tactics 37, gates 18, missions 7, combat 24, conditions 9,
economy 7, tactics-policy 28, coverage 12 = 225 passed, 0 failed. ev.html loads clean, net.myId/peerIds
present, 0 page errors. verify-all GREEN. Brain banner -> v2169.

### v2170 -- brain/esPilot.mjs: the GPU Brain joins the game as a client

Keith: "the coolest thing would be the brain as connecting client." Built.

NOT a duplicate of ev/evBot.mjs. That joins as a peer PILOT flying its own ship and admits in its own
header that it "can menace and chase but can't yet damage a real player -- Stage 2". esPilot joins and
takes ownership of the SYSTEM'S HOSTILES. Rendezvous hashing hands it a fair share the moment it
arrives -- no election, no coordinator, no server-side authority -- and it flies them with the tactics
policy it learned from real fights. It also closes evBot's Stage 2: its ships post `shot` events on the
combat bus, which ev.html already ingests via fv.ingestShot. The brain's hostiles can actually shoot
you.

Everything it needs already existed and was tested; this is a loop, not new machinery:
    joining        httpPresenceTransport (fetch only -- no DOM, no canvas, no WebGL)
    getting ships  esAuthority.ownsNpc  -- HRW gives it a share automatically
    flying them    combat.stepAI + flightModel.stepFlight, the same integrator players use
    fighting well  esTactics.decide with weights from GET /ai/brain/tactics
    honesty        no bridge / untrained policy -> it says "hand policy" and flies the opening book

TWO REAL BUGS, both invisible until the dry run reported ZERO SHOTS:
  1. shipFlightStats reads `maneuver`, NOT `turn`. The class table said `turn: 100`, so every hostile
     got Math.max(1, (undefined||0)*3) = 1 deg/sec and could not aim at anything. Ships drifted AWAY
     from the player. Fixed to EV Maneuver units (10 ~= 30 deg/sec).
  2. The engine's heading convention is {x: sin, y: -cos} (flightModel.headingVector). The shot code
     used cos/sin, which fires every bolt 90 degrees off -- it would have looked like the AI was
     missing on purpose. Now uses the engine's own function.

brain/tools/es-pilot-selfcheck.mjs -- 40 tests -- MUTATION-TESTED, and the mutation testing earned its
keep TWICE:
    restore `turn:` instead of `maneuver:`  -> 3 tests FAIL (can't turn, can't close, can't fire)
    restore cos/sin shot direction          -> 0 tests failed. THE TEST WAS TOO WEAK.
The direction test asked "does some shot point roughly at the player", which passes anyway because
ships circle. Replaced with an exact one: a ship at heading 0 must fire straight up the -y axis. The
mutant now dies. A test that cannot fail is decoration; a test that fails for the wrong reason is worse.

The selfcheck also documents a subtlety worth keeping: with ONE target there is no runner-up, hence no
counterfactual, hence esTactics records no features. That is not a gap -- it is the learner refusing to
invent a gradient it cannot justify. The pilot generates training samples only when there was a real
choice to have made.

Also asserted: a fleeing ship does not keep firing (that would teach the policy that fleeing works when
it did not); fire rate is bounded by a cooldown, not one shot per frame; dead ships neither move nor
shoot; the tick never mutates the targets it is handed; a peer with no reported hp is assumed whole,
not assumed dead.

VERIFIED against a live tacticsBridge: taught it 20 outcomes, then started the pilot ->
"[esPilot] weights: GPU Brain (20 outcomes)". With no bridge -> "hand (no bridge configured)". With no
rendezvous URL it refuses to start and names the flag, rather than crashing.

    node brain/esPilot.mjs --dry-run          # simulate locally, touch no network
    SWEK_PILOT_URL=http://host:9999 SWEK_BRIDGE=http://host:8787 node brain/esPilot.mjs

The loop is now closed on itself: the brain fights, generates outcomes, learns from them, and flies
better next time. The learner and the pilot are the same thing.

Selfchecks: coop 21, authority 62, tactics 37, gates 18, missions 7, combat 24, conditions 9,
economy 7, pilot 40, tactics-policy 28, coverage 12 = 265 passed, 0 failed. verify-all GREEN.
Brain banner -> v2170.

HONEST GAPS: the pilot's ships shoot players but cannot yet BE shot -- inbound damage needs the
owner-addressed event path (esAuthority.validateDamage + noteAccepted are written and tested; the wire
is not). It also does not report its own tactics outcomes yet, because nothing tells it when one of its
ships died. Both land on the same damage channel, and that is the next piece.

## Phase 78 hooks (not built)

Evidence-bundle first reading (the uploaded zip: dungeon arms,
bias ladder, escort thresholds -- the 78-79 work, gated only on
the upload now); flip day per the standing runbook (unblocks fps
end-to-end); WAD tagging (tools/wadThingSpawner.js is IN this tree
at last -- the v43 game-tag recipe, one file); EV page smoke (the
/ev game rode the span verbatim; one browser session on the rig
confirms the escort/trade stack against the merged bridge).
