# The GPU Brain in the 6-DOF space duel -- registered before any code (WIP note, UNNUMBERED)

Keith chose this on 2026-11-02, from the brain backlog. It is the one empty brain cell on the 6-DOF ship duel in
`docs/BRAIN-CAPABILITY-MAP.md`: the fruit fly's circuit holds three trained pilots there (Default, League, Close; retrained
at damage 6 in v4896), and the GPU Brain has none. This note belongs to the chat that wrote it. It touches no file another
chat owns: none of the active branches changes a 6-DOF, jet or GPU Brain file (checked 2026-11-02 against
`claude/sweet-lovelace-8leivh`, `claude/wizardly-einstein-wr30pd` and `ccr-6c3eeb7c-pxz6kx`).

> **Started from the same PD laws and trained by the same recipe that made the fruit fly's Default 6-DOF pilot, does the
> GPU Brain's MLP learn a pilot that beats its own hand twin by the rule the fly had to meet -- and, if it does, does it fly
> as well as the fly's pilot, head to head?**

## The pilot (`brain/pilot6dofMlp.mjs`, to be built)

- **The senses are the fly's own.** The twelve features of `brain/pilot6dofPolicy.mjs` (`geometry()`, `features()`), imported,
  not restated: the pointing error in the body frame, the spin, the facing cosine, the range, the closing speed and the two
  gates. "The same senses" is the point, as it is for the flight and jet MLPs.
- **The network is the GPU Brain's shape:** 12 -> 32 relu -> 32 relu -> 5, so 384 + 32 + 1,024 + 32 + 160 + 5 = **1,637
  weights** (the fly's circuit has 930).
- **The outputs are read exactly as the fly's are:** tanh on all five; torque about each body axis is that axis's inertia
  times `TORQUE_GAIN` times the output; thrust when the fourth is positive; fire when the fifth is.
- **The hand weights are the PD autopilot, written through this network.**
  - Neurons 0 to 7 of the first layer carry the fly's own hand rows: a pair of channels per axis, the thrust gate and the
    fire gate.
  - The second layer passes those eight on unchanged.
  - The third reads them back with the fly's readout weights and biases.
  - The other 24 neurons of each layer are zero: the room a search has to grow into.
- **The arithmetic is the fly pilot's own:** `render/brainTsl.mjs`'s `mlpLayerCpu`, the float32 mirror of the GPU kernel.
  - Every zero term adds exactly 0 in float32, and the non-zero terms are summed in the same order. So the hand MLP should
    fly **bit-identically** to the fly's hand weights: the same duel fingerprints.
  - That is a gate row, and the reason both brains can be said to start from the same pilot.
- **Not claimed:** that the duel runs on a GPU. A duel is two ships, and the flight MLP's round (v4870) found that a GPU
  does not make that kind of loop faster. `layersOf()` hands the weights to `brain/mlp.js`'s BatchedMLP for a page.
- **`duel()` learns one new input:** a pilot function, beside "autopilot", "hand", "zero" and the fly's weight vectors.
  - Every existing input flies exactly as before, and `brain/pilot6dofPolicy-selfcheck.mjs`'s fingerprints must not move.

## The duel and the recipe (the fly Default's, unchanged)

- **The duel:** `pilot6dofPolicy.duel()` as the page now flies it: damage 6 (17 hits kill), standoff 85, thrust 16, the
  standoff start, no collisions, side A. This is the duel the fly's Default was retrained on in v4896.
- **The recipe:** `tools/ship/train6dofPilot.mjs`'s `RECIPE` and its `run()`, with the network swapped.
  - 5 searches x 1,500 iterations of the sparse (1+1)-ES (1 to 4 weights a child, sigma 0.3) from the hand weights, against
    the PD autopilot.
  - Each search is pruned toward the hand weights.
  - **Train seeds 1-12 and held-out seeds 21-28: the fly's own.** The same training data and the same choice set, so the
    brains differ by the network alone. They are training and choice data, not an audit.
  - **Search seeds 7000-7004,** fresh. The fly's were 2000-2004.
- **The audit is fresh: duel seeds 6101-6120** (20, the size of the fly's), read once, for the champion and its hand twin.
  - No 6-DOF tool or gate uses them. The used blocks are 1-12, 21-28, 41-60, 101-120, 201-248, 301-324, 401-440, 501-540,
    601-648, 701-724, 801-840, and in `brain/shipCollision6dof-selfcheck.mjs` 900-923, 1000-1039 and 1100-1111.

## The hypotheses

- **H1, the GPU Brain learns the duel.** The champion QUALIFIES by `train6dofPilot.qualifies()` against its own hand twin.
  That is word for word the rule the fly's Default met:
  - its held-out score is above the hand twin's;
  - its audit score is above;
  - its audit wins minus losses is above;
  - its held-out wins minus losses is not behind.
  If it qualifies, `brain/pilot6dofMlpWeightsDefault.json` is written.
- **H2, which brain flies better (read only if H1 is met).** The champion against the fly's shipped Default pilot (hash
  215e26d9), on **fresh duel seeds 6201-6240, from both sides**: 80 games, `evaluate()` with the Default as the league's one
  opponent. LEAD is the champion's wins minus losses over the 80.
  - **GPU better** if LEAD is at least 8. That is `train6dofLeague.mjs`'s `LEAD_FLOOR`, a chosen floor so a coin-flip lead
    cannot count, not a test statistic.
  - **Fly better** if LEAD is at most -8.
  - **No difference shown** otherwise.
  - Reported beside it, testing nothing: the Default against its own mirror on the same 80 games, since the duel favours
    the side that acts first.

## Controls and what is reported

- **C-twin:** the hand MLP's duel fingerprints equal the fly hand twin's on all 20 train and held-out seeds. If they do not,
  nothing is trained: the brains would not start from the same pilot.
- **C-determinism:** a search run twice gives the same weights to the bit, as the fly's recipe does.
- **Reported, testing nothing:**
  - per search: train score, improvements and neutral moves, weights kept after pruning, held-out result;
  - the champion against the PD autopilot on the fresh audit from both sides;
  - the fly's own numbers with this recipe (below).

## What each outcome buys

- **H1 met:** the file is written. The capability map's cell becomes TRAINED. Offering it on `es-box3d-6dof.html` as a
  pilot choice beside the fly's is a page round of its own, asked before it is built.
- **H1 not met:** nothing is written. "No GPU pilot beat its hand twin by the fly's rule" is the result, and the cell
  becomes NO CHAMPION. This note authorises no second recipe.
- **H2** is recorded whichever way it falls.

## Predictions, fixed now, deciding nothing

- **P1: H1 is met** (about 70%). The hand twin draws every game: on the held-out seeds it scores 18.60 with 0 wins, 0 losses
  and 8 draws, a mutual kill each time. So any change that breaks the symmetry in its favour wins games. The fly's first
  search was its champion.
- **P2: if H1, the champion wins at least 15 of the 20 audit games** (the fly's Default won 20).
- **P3: H2 reads "no difference shown"** (50%), fly better (30%), GPU better (20%).
- **P4: the champion keeps 30 to 150 weights after pruning** (the fly's kept 84 of 930). Its best search finds 20 to 45
  improvements (the fly's champion found 42), fewer per iteration than the fly's: a move on a zero neuron's input changes
  nothing until its output is connected, so more moves are neutral.

## What was seen first

- **The fly's Default with this recipe** (its `by` record): held-out 20.57 (W5/L0/D3); audit 41-60 21.56 (W20/L0/D0), where
  the hand twin scores 18.58.
- **The hand twin on the held-out seeds:** 18.60 (W0/L0/D8, hits 136, taken 136). Measured while timing a duel: 13.3 ms.
- **Nothing of the MLP exists.** No fresh seed has been flown.

## Cost

About 13 ms a duel, so a search is about 18,000 duels (4 minutes) plus its prune passes. Five searches take about 15 to 25
minutes on four workers.

## Built, 2026-11-02, before the registered run (nothing of the registration above is changed)

**What exists:**
- `brain/pilot6dofMlp.mjs` and its gate, `brain/pilot6dofMlp-selfcheck.mjs`.
- `tools/ship/train6dofMlp.mjs` (the library), with `tools/ship/trainMlp6dof.mjs` (the command) and the gate
  `tools/ship/train6dofMlp-selfcheck.mjs`.
- In `brain/pilot6dofPolicy.mjs`: `duel()` takes a pilot function, and `featuresFrom()` is exported. Its gate has a new
  section for both, and its fingerprints did not move.
- The backlog entry `sixdof-gpu-brain-pilot`.

**C-twin holds in the gate.** Over 300 random states the hand MLP's five outputs equal the fruit fly's hand pilot's to the
bit, and on all 20 train and held-out seeds the duel fingerprints are the same. The hand MLP's held-out tally is the
fruit fly's: 18.60 (W0/L0/D8).

**How the run is shaped.**
- The command writes `brain/sixdofGpuBrainResults.json` and prints no score. That file is committed before it is read.
- The weight file is a separate, later step, `--write-from` that committed file, and only if the champion qualified.
- `run()` takes substitute audit and H2 seeds, so the gates and the smoke test never fly the registered ones.

**Sabotaged with the byte-safe runner: 26 runs of 24 designs, each file restored byte-identical.** S7 and T3 ran twice,
and the first C1 is the incident below, replaced by C1 and C1b. Every other design went red by name; the counts are in
the three gates' headers. Two went 0 red on the first draft, and both are findings:
- **S7, a search that accepts every child.** The row checked the score the search reports, which a worse child never
  lowers. It now re-scores the weights the search returns.
- **T3, the champion picked on train score.** The miniature's two searches tied on held-out, so either order picked the
  same one. A planted pair whose orders disagree now holds the pick.

**An incident, said in full.**
- The first draft of the trainer's gate ran the command against an existing results file to watch it refuse. With the
  guard sabotaged away (C1) it did not refuse: the child began the registered round.
- Before the runner's 900 s timeout killed the gate, it flew the **hand twin** on the **registered audit seeds**
  (6101-6120). Its output went to a pipe nobody read, and the command prints no score anyway.
- Its process was found still running afterwards and killed before it wrote anything: its results file was still the
  planted 3 bytes, and was deleted unread.
- **No number from it was printed, stored or seen, and no choice was made on it.** The hand twin's audit is deterministic,
  and the registered run computes it again. No search reached the audit seeds; a search had barely started.
- Since then the guard is a library function the gate holds directly, the gate never starts a run, and the runner kills
  a timed-out gate's whole process group.

**The registered run:** `node tools/ship/trainMlp6dof.mjs --workers 4`. By the smoke test, 30 iterations and their prune
take 4-6 s a search, so expect about 10 minutes a search at 1,500, and six searches in all (five plus the determinism
re-run) on four workers.

## The verdict, 2026-11-02 (read from the committed file, after it was committed)

The registered run wrote `brain/sixdofGpuBrainResults.json` at head 920540f7. It was committed byte for byte at 42e8a0c1
before anyone read it. It flew the registered seeds and says so (`registeredSeeds: true`). The searches took 172 to 181 s
each, not the ten minutes this note expected. Every number below is re-derived from that file in section 5 of
`tools/ship/train6dofMlp-selfcheck.mjs`, and the tallies are re-flown there from the weights in it.

**The controls held.**
- **C-twin:** the hand MLP flew the fruit fly's hand pilot to the bit on all 20 train and held-out seeds.
- **C-determinism:** the champion's search, run a second time, gave the same weights (hash 0ffd8554 both times).

**The hand twin draws every game.** Train 18.58 (W0/L0/D12), held-out 18.60 (W0/L0/D8), audit 6101-6120 18.59
(W0/L0/D20, hits 340, taken 340): a mutual kill each time.

**The five searches** (train score, the held-out result, and what pruning left):

| search | train | held-out | improvements | neutral | moved | kept |
|---|---|---|---|---|---|---|
| 7000 | 20.15 | 17.84 (W1/L2/D5, hits 134, taken 134) | 12 | 946 | 1,141 | 29 |
| 7001 | 20.31 | 19.46 (W3/L0/D5, hits 136, taken 132) | 18 | 959 | 1,150 | 40 |
| **7002** | 19.94 | **20.02 (W4/L0/D4, hits 136, taken 126)** | 14 | 977 | 1,161 | 29 |
| 7003 | 20.82 | 14.41 (W2/L2/D4, hits 102, taken 131) | 27 | 942 | 1,124 | 31 |
| 7004 | 20.11 | 17.85 (W1/L2/D5, hits 134, taken 134) | 21 | 933 | 1,157 | 74 |

"Moved" is how many weights differed from the hand weights before pruning; "kept" is how many still differ after it.

**H1 is met.** The champion is search 7002, hash 0ffd8554, with 29 of the 1,637 weights kept. It qualifies by
`train6dofPilot.qualifies()` against its hand twin on all four counts:
- held-out 20.02 (W4/L0/D4) against 18.60;
- audit 19.94 (W10/L0/D10, hits 340, taken 319) against 18.59 (W0/L0/D20);
- audit wins minus losses 10 against 0;
- held-out wins minus losses 4 against 0.

**H2 reads fly better.** Against the fruit fly's shipped Default (215e26d9), on duel seeds 6201-6240 from both sides, the
champion went W0/L70/D10 (hits 1,239, taken 1,360). LEAD is -70, well past the -8 floor.

**Reported, testing nothing:**
- **Against the PD autopilot,** from both sides on the audit seeds, the champion went 19.93 (W20/L0/D20). Counting
  the train and held-out games too, it lost none of 60 games against the autopilot and won 30.
- **Against the Default, the games were close in hits.** Re-flown game by game (the file keeps only the totals):
  - the champion was killed in all 80, and no game went past 17 hits on either ship (17 hits kill);
  - it killed the Default back in the 10 draws;
  - in the 70 it lost it had landed 1,069 hits, 12 to 16 a game, against the 17 a kill needs.
  The Default got to 17 first every time.
- **The Default against its own mirror** on the same 80 games: W9/L9/D62.
- **The train score did not predict the held-out.**
  - The search with the best train score (7003, 20.82, the most improvements at 27) had the worst held-out result,
    14.41, landing 102 hits against 131 taken.
  - The champion had the lowest train score of the five.
  - Three of the five searches ended below the hand twin on held-out.
  - Picking on held-out, as the fly's recipe does, is what kept those from being the champion.

**The predictions:**
- **P1: right.** H1 is met; I gave that about 70%.
- **P2: wrong.** The champion won 10 of the 20 audit games, not at least 15. The other 10 were draws, with no losses.
  (The fly's Default won 20 of 20 on its own audit, seeds 41-60. Those are different seeds, so that comparison is not
  H2.)
- **P3: wrong.** H2 reads fly better, the outcome I gave 30%, and not narrowly: LEAD -70 against a floor of -8.
- **P4: wrong.** The champion kept 29 weights, one under the 30-150 range, and its search found 14 improvements, not
  20-45.
  - The direction held: fewer improvements than the fly's 42, with 977 of its 1,500 children neutral.
  - The ranges were what was registered, and both missed.
  - The reason I gave, that more of the MLP's moves would be neutral, cannot be checked: the fly's neutral count is not
    in its record.

**What this says, and what it does not.**
- **It says:** started as the PD autopilot and trained by the fly's recipe, the GPU Brain's MLP learns a pilot that beats
  its hand twin by the rule the fly had to meet. It lost none of its 60 games against the autopilot.
- **It also says:** the MLP's pilot does not fly as well as the fly's. Head to head on 40 fresh seeds from both sides,
  it won none of 80.
- **It does not say that the network is the reason.** Each brain had one recipe run of five searches, and the spread
  across search seeds is wide (held-out 14.41 to 20.02). This round compares one champion with one champion, so it does
  not separate the network from the luck of the search.

**What follows, as registered.**
- **The weight file is written** from the committed file:
  `node tools/ship/trainMlp6dof.mjs --write-from brain/sixdofGpuBrainResults.json` wrote
  `brain/pilot6dofMlpWeightsDefault.json` (hash 0ffd8554). The gate holds it to be `blobOf()` of the committed file.
- **The capability map's cell** for the GPU Brain on the 6-DOF duel is TRAINED, quoting this note.
- **The page round is not built.** Offering this pilot on `es-box3d-6dof.html` beside the fly's is asked before it is
  built. Worth saying when it is asked: on this evidence the pilot would lose every game to the fly's Default.
- **This note authorises nothing further.** Retraining the GPU Brain, against the fly's Default or with more searches, is
  a new registration.

## The page round, 2026-11-02 (Keith asked for it; written before its code)

Keith: "put the pilot on the page". The verdict above said to ask first, and he did.

**What is built.**
- **The choice.** The GPU Brain's pilot (`brain/pilot6dofMlpWeightsDefault.json`, hash 0ffd8554) becomes a choice on
  `es-box3d-6dof.html`'s Load Pilots panel, for either team, beside the fruit fly's three (shipped, league,
  close-quarters).
- **The roster.** `brain/pilotRoster.mjs` gains one choice, `gpu`, that carries its own network.
  - Until now every brain choice was a choice of weights through one network, and the roster's header says so. This one
    is the MLP, so the resolved team carries the MLP module and `teamPilot()` flies it through that.
  - It is offered only when the page holds both the weights and the network. A saved `gpu` the page cannot fly falls
    back to the hand pilot and says so, as every other choice does.
  - The MLP's weights can never be flown through the fly's network.
- **The file.** The page fetches it once, through `brain/peerBrain.mjs` with the MLP's own descriptor. A missing or
  refused file is said on the pilot line, and the choice is not offered.
- **It runs on the CPU,** in float32 through `render/brainTsl.mjs`'s `mlpLayerCpu`: the arithmetic it was trained and
  measured in.
  - Not on a GPU device: for six ships a dispatch is no faster (the flight MLP's round, v4870).
  - And only this arithmetic flies the measured pilot to the bit.

**How it is checked (gates, before it is committed).**
- **In `brain/pilotRoster-selfcheck.mjs`:**
  - `gpu` is offered only when held, after the close-quarters pilot;
  - it flies its own network on every ship (its decisions are `pilot6dofMlp.pilotFor()`'s to the bit);
  - the fly's choices still fly the fly's network;
  - a saved `gpu` with no weights or no network falls back to the hand pilot by name.
- **In a new gate, `brain/pilot6dofMlpPage-selfcheck.mjs`, in the page's own browser:**
  - the file loads, `gpu` is offered after `close`, and the pilot line names its hash and held-out score;
  - choosing it flies it: every ship of the team on the file's vector, under its own label;
  - **the page's own pilot function, flown through the headless duel inside the page's browser, reproduces the measured
    held-out tally (20.02, W4/L0/D4) and Node's duel fingerprints seed for seed.** The pilot on the page is the pilot
    that was measured;
  - a fight on the page shows it: a GPU team moves and deals damage, and a zero team holds still and is hurt;
  - a saved choice of it survives the next load;
  - the GPU file offered to the page's importer is refused (another network), with the reason on the line.
- **The fly's page rows** (`brain/pilot6dofPolicy-selfcheck.mjs` section 5) stay green, with `gpu` added to the pilots that
  arrive by fetch.
- **Each new row is sabotaged** with the byte-safe runner, red by name, and logged.

**Not claimed.**
- Anything about how it does in the page's own fight: three ships a side, fleet targeting, collisions and ram damage on.
  That fight was not measured for this pilot. The duel evidence says the fly's Default beats it every time.
- That it runs on a GPU.

**No measurement, so nothing is committed unread.**

**Built, 2026-11-02 (nothing of the page round's registration above is changed).**
- **What exists:**
  - `brain/pilotRoster.mjs`'s `gpu` choice;
  - in `es-box3d-6dof.html`, the file's fetch, the choice, and the GPU pilot named on the pilot line;
  - five rows in `brain/pilotRoster-selfcheck.mjs`;
  - the new gate `brain/pilot6dofMlpPage-selfcheck.mjs` (a browser, about 8 s).
  - `brain/pilot6dofPolicy-selfcheck.mjs` counts `gpu` among the pilots that arrive by fetch.
- **The check that matters held on the first run:** the page's own pilot function, flown through the headless duel in
  the page's browser, gave the committed held-out tally 20.02 (W4/L0/D4) and 8 of 8 of Node's fingerprints.
- **The fourteen gates around the page and the roster stayed green.** That includes the fruit fly's page rows, the
  aircraft's, the flight page's and the browser-safety guards.
- **Sabotaged with the byte-safe runner: nine designs, each red by name.**
  - On the page: never offered 4; no network handed to the roster 4; the file read with the fruit fly's descriptor 5;
    left off the pilot line 1; the importer taking it as a fruit-fly pilot 1.
  - In the roster: offered when not held 7; `teamPilot()` ignoring the choice's network 3; resolved without its
    network 1; resolved to the fruit fly's weights 4.
  - The counts by gate are in both gates' headers.

**Measured since (2026-11-02, `brain/SIXDOF_PAGE_FIGHT_WIP.md`, its own registered round):** in the page's own fight, the
GPU Brain's pilot ties the PD autopilot (it lost 107 and won 92 of 200, no difference shown) and loses to the fruit fly's
Default, W76 against 123. The close-quarters pilot ranks first there.

## Round 2: the GPU Brain's league round against the fruit fly's Default -- registered before any code (2026-11-02)

Keith chose it ("Do 1, then 2").

> **Started from the GPU Brain's champion (0ffd8554) and trained by the recipe that made the fruit fly's League pilot --
> but against a league of the fruit fly's Default and the PD autopilot -- does the MLP learn to beat the Default?**

**Why it is a question.**
- The champion lost 70 of 80 to the Default in the duel (this note's H2, seeds 6201-6240).
- The fruit fly's League pilot was made from the Default by this recipe, against a league of itself and the autopilot.
  It beat the Default W20/L4/D56 on its audit.
- Round 1 (`brain/SIXDOF_PAGE_FIGHT_WIP.md`) found that the duel's results barely carry to the page's own fight. This
  round asks a duel question, as chosen. Its champion's record on the page would be a check of its own.

**The trainee and the league.**
- **The network** is `brain/pilot6dofMlp.mjs`, unchanged. **The start** is `brain/pilot6dofMlpWeightsDefault.json`
  (0ffd8554), imported the way the page imports it.
- **The league** is the PD autopilot and the fruit fly's Default (215e26d9), every seed from both sides
  (`pilot6dofPolicy.evaluate()` with an opponent array). In the fly's league the second opponent was the pilot being
  trained from; here it is the pilot to beat.
- **Each search is pruned toward the start**, as the fly's league prunes toward its own start, so what is kept is the
  start's delta.

**The recipe: `tools/ship/train6dofLeague.mjs`'s `RECIPE`, with only the search seeds changed.**
- 4 searches of 800 iterations of the sparse (1+1)-ES: 1 to 4 weights a child, sigma 0.3.
- **48 train seeds:** the fly league's own `LEAGUE_TRAIN_SEEDS` (201-248).
- **Search seeds 7100-7103.** The fly's were 4000-4003, and the GPU round's 7000-7004.
- **The champion is picked on the league score** over the fly league's 24 held-out seeds (301-324), and on nothing
  else.
- **The standoff start, no collisions:** the profile the fly's League pilot was trained in.

**The audit is fresh: duel seeds 6301-6340** (40), read once. No 6-DOF tool or gate has flown them. On them:
- the champion against the Default, from both sides (80 games);
- the Default against its own mirror, on the same games;
- the start against the Default, on the same games (H2's baseline).

**The check against the PD autopilot** uses the first round's audit seeds, 6101-6120, from both sides. They are spent
there, and are used here as a check (no regression), not as a test.

**H1, the champion beats the Default.** It qualifies by the fruit fly's league rule, `train6dofLeague.qualifies()`
word for word, with the Default as the pilot to beat:
- it leads the Default by at least 8 (`LEAD_FLOOR`) over the 80 audit games, and its audit score against the Default is
  above the Default's own score against itself on the same games;
- it leads the Default on the held-out seeds: more wins than losses over the 48 games;
- it has not regressed against the PD autopilot: on 6101-6120 from both sides, no more losses than the start, and a
  score no more than 0.5 below the start's.

If it qualifies, `brain/pilot6dofMlpWeightsLeague.json` is written from the committed file. Offering it on the page is
asked first.

**H2, the gap narrows** (read whatever H1 says). The champion's audit LEAD against the Default exceeds the start's
LEAD against the Default on the same 80 games by at least 8.

**Controls.**
- **C-files:** the start is 0ffd8554 and the Default 215e26d9, both through the page's importers.
- **C-determinism:** search 7100 is run a second time, in its own process alongside the four, and must give the same
  weights to the bit.

**Reported, testing nothing:**
- per search: the train score, improvements and neutral moves, weights moved and kept, and the held-out league score;
- the champion's audit against the Default and against the PD autopilot (both sides), and its held-out record against
  the Default;
- the Default's mirror, and the start's audit against the Default.

**Predictions, fixed now, deciding nothing.**
- **P1: H1 is not met** (75%). The start lost 70 of 80, and the fly's League pilot closed a smaller gap, from a level
  start against itself.
- **P2: H2 is met** (60%): training directly against the Default gains at least 8 games.
- **P3: the start's audit LEAD against the Default is -50 or worse.** It was -70 on 6201-6240.
- **P4: the champion keeps 10 to 150 weights different from the start.**

**What was seen first.** Timing only: one league evaluation on scratch seeds 99501-99548 took 1.2 s (192 duels). No
score was read.

**Cost.** 800 iterations at 1.2 s is 16 minutes a search, and the prune about as much again. Five processes on four
cores take about 45 minutes.

**To be built.**
- `tools/ship/train6dofMlpLeague.mjs`, the library.
- `tools/ship/trainMlp6dofLeague.mjs`, the command. It refuses to overwrite, runs the five searches in five processes,
  writes `brain/sixdofGpuLeagueResults.json`, and prints only where the file is. `--write-from` writes the weight file
  only if the champion qualified.
- `tools/ship/train6dofMlpLeague-selfcheck.mjs`, the gate: the registration as code; the rule at its edges on made-up
  numbers; a miniature on scratch seeds; and the command held, never executed.

### Round 2: built, 2026-11-02, before the registered run (nothing of the registration above is changed)

**What exists:** `tools/ship/train6dofMlpLeague.mjs` (the library), `tools/ship/trainMlp6dofLeague.mjs` (the command) and
the gate `tools/ship/train6dofMlpLeague-selfcheck.mjs` (about 17 s, 23 rows).

**How the run is shaped.**
- **C-files come first.** The start and the Default must be the registered files, or nothing is searched.
- **The four searches and the determinism twin of the first run in five processes at once.**
- **Then the finish,** in `train6dofLeague.finish()`'s order: each search's held-out league score, the champion picked
  on it alone, the audit read once, and the verdict by `qualifies()`. Then H2, from the same audit games.
- **The command writes `brain/sixdofGpuLeagueResults.json` and prints only where it is.** The weight file is a later
  step, `--write-from` that committed file, and only if the champion qualified.

**The gate never starts the command's round and flies only scratch seeds** (99600-99661).

**Sabotaged with the byte-safe runner: 15 designs, each red by name** (the counts are in the gate's header). Four rows
were found unable to go red before the sabotages ran, and each was fixed:
- **The miniature was empty.** Its first searches (6 iterations) pruned back to the start, so "pruned toward the start"
  and the determinism twin were 0 = 0. It now runs 40 iterations, with a row that says a search kept weights.
- **The planted pick's two searches agreed in both orders** (the first round's T3 again). It is now a pilot of zeros
  with the higher train score, against the start.
- **The audit could have been read against the wrong opponent unseen,** since the verdict row recomputed from the same
  object. It is now recomputed independently.
- **The start's hash check was never exercised.** A good file with other weights now exercises it.

**The registered run:** `node tools/ship/trainMlp6dofLeague.mjs --workers 5`.

### Round 2: the verdict, 2026-11-02 (read from the committed file, after it was committed)

The registered run wrote `brain/sixdofGpuLeagueResults.json` at head c465c6b3. It was committed byte for byte at
7425ba66 before anyone read it. It flew the registered seeds and says so (`registeredSeeds: true`).
The searches took 40 to 47 minutes each. Every number below is re-derived from that file in section 5 of
`tools/ship/train6dofMlpLeague-selfcheck.mjs`, and the champion's tallies are re-flown there from its weights.

**The controls held.**
- **C-files:** the start was 0ffd8554 and the Default 215e26d9.
- **C-determinism:** search 7100, run twice in two processes at once, gave 95b8cbc2 both times.

**The four searches:**

| search | train | held-out league score | improvements | neutral | moved | kept |
|---|---|---|---|---|---|---|
| 7100 | 17.94 | 18.24 (W47/L35/D14, hits 1586, taken 1531) | 35 | 350 | 610 | 46 |
| 7101 | 18.68 | 17.25 (W46/L30/D20, hits 1469, taken 1530) | 51 | 407 | 674 | 60 |
| **7102** | 18.72 | **18.91 (W51/L24/D21, hits 1601, taken 1521)** | 58 | 404 | 714 | 97 |
| 7103 | 18.05 | 17.83 (W45/L37/D14, hits 1569, taken 1553) | 42 | 357 | 612 | 57 |

"Kept" counts the weights that still differ from the start after pruning toward it.

**H1 is not met.** The champion is search 7102 (hash 6934d951, 97 weights different from the start). By
`train6dofLeague.qualifies()`, with the Default as the pilot to beat, it fails three of the five conditions:
- **the audit:** W9/L46/D25 against the Default on 6301-6340, a lead of -37 against the floor of 8;
- **the score:** 16.35 against the Default, not above the Default's own 18.35 against itself (W11/L11/D58);
- **the held-out seeds:** W5/L24/D19 against the Default, which is not a lead.

It passes the check against the PD autopilot. On 6101-6120 from both sides it went W32/L0/D8 against the start's
W20/L0/D20: no more losses, and a higher score. So **no weight file is written**, and the champion is not offered
anywhere.

**H2 is met: the gap narrowed by 37 games.** On the same 80 audit games, the start went W0/L74/D6 against the Default
(a lead of -74), and the champion went W9/L46/D25 (-37): a gain of 37 against the floor of 8.

**The predictions:**
- **P1: right.** H1 is not met; I gave that 75%.
- **P2: right.** H2 is met; I gave that 60%.
- **P3: right.** The start's audit lead against the Default is -74, at or below -50.
- **P4: right.** The champion keeps 97 weights different from the start, inside 10-150.

**What this says, and what it does not.**
- **It says:** trained directly against the Default by the fly's league recipe, the GPU Brain's MLP closes half the gap.
  Its losses to the Default fall from 74 to 46 of 80, and it wins 9. It also gets better against the autopilot.
- **It also says:** it still loses to the Default clearly, on the audit and on the held-out seeds. It does not reach the
  rule the fly's League pilot met.
- **It does not say** whether more iterations, more searches or another network would close the rest, or how this
  champion does on the page. None of that was tested.
  - Round 1 found that a duel win barely carries to the page's own fight.

**What follows.**
- Nothing is written, so the page and the capability map's TRAINED cell keep the first round's pilot. The cell cites
  this round's result beside it.
- This note authorises no third recipe.

**Round 2's verdict, as code:** section 5 of `tools/ship/train6dofMlpLeague-selfcheck.mjs` re-derives every number above
from the committed file and re-flies the champion's tallies from its weights. It also holds that nothing was written:
`--write-from` refuses the file. Sabotaged with the byte-safe runner: 10 designs, each red by name. They edit the
committed file, this note or the command, and the counts are in the gate's header.

## Round 3: the GPU Brain trained by the close-quarters recipe -- registered before any code (2026-11-03)

Keith chose it ("Let's do item 3, train gpu brain").

> **Started from the GPU Brain's champion (0ffd8554) and trained by the recipe that made the fruit fly's close-quarters
> pilot -- collisions on with the page's ram damage, every game in both the standoff and the joust start, against a
> league of the fruit fly's Default and the PD autopilot -- does the MLP learn to beat the Default in close quarters?**

**Why it is a question.**
- Round 1 (`brain/SIXDOF_PAGE_FIGHT_WIP.md`) found the close-quarters pilot the only one whose training carried to the
  page's own fight. It is the page's default now.
- Round 2 trained the MLP in the standoff duel against the Default. It halved the gap and did not qualify.
- **This round changes the profile and nothing else:** the same start and the same league, under
  `train6dofLeague.mjs`'s `PROFILES.close`.

**The recipe: the close profile's own, with only the search seeds changed.**
- 4 searches of 500 iterations of the sparse (1+1)-ES: 1 to 4 weights a child, sigma 0.3.
- **32 train seeds:** the close profile's own (601-632). Every game is played in both starts, from both sides, with
  collisions on.
- **Search seeds 7200-7203.** The fly's were 5000-5003.
- **The champion is picked on the league score** over the close profile's held-out seeds (701-724), and on nothing
  else.
- **Each search is pruned toward the start.**

**The audit is fresh: duel seeds 6401-6440** (40), read once: in both starts and from both sides, 160 games against the
Default. On the same games: the Default against its own mirror, and the start against the Default (H2's baseline).

**The check against the PD autopilot:** the first round's audit seeds 6101-6120 (spent), in both starts and from both
sides, used as a check and not a test.

**H1, the champion beats the Default in close quarters.** It qualifies by `train6dofLeague.qualifies()` with
`PROFILES.close`, word for word, with the Default as the pilot to beat:
- it leads the Default by at least 16 (`LEAD_FLOOR` per start) over the 160 audit games, and its audit score is above
  the Default's own mirror score;
- it is behind the Default in neither start;
- it leads the Default on the held-out seeds;
- it has not regressed against the PD autopilot: no more losses than the start, and a score no more than 0.5 below.

If it qualifies, `brain/pilot6dofMlpWeightsClose.json` is written from the committed file. Offering it on the page is
asked first.

**H2, the gap narrows** (read whatever H1 says). The champion's audit lead against the Default exceeds the start's on
the same 160 games by at least 16.

**Controls.**
- **C-files:** the start (0ffd8554), the Default (215e26d9) and the fruit fly's close-quarters pilot (360580a7) are the
  registered files.
- **C-determinism:** search 7200 is run twice, in its own process alongside the four.

**Reported, testing nothing:**
- per search: the train score, improvements, neutral moves, weights moved and kept, and the held-out league score;
- the champion and the start against the Default, start by start;
- **the champion against the fruit fly's close-quarters pilot** on the audit (160 games): how far it is from the page's
  best;
- the rams in the champion's audit games against the Default, and its check against the autopilot.

**Predictions, fixed now, deciding nothing.**
- **P1: H1 is not met** (80%). The MLP lost 70 to 74 of every 80 standoff games to the Default, and the joust is new to
  it.
- **P2: H2 is met** (55%).
- **P3: the start's audit lead against the Default is -80 or worse** over the 160 games.
- **P4: the champion loses more than it wins against the fruit fly's close-quarters pilot** (90%).

**What was seen first.** Timing only: one close-profile league evaluation on scratch seeds 99801-99832 took 3.6 s (256
duels). No score was read.

**Cost.** 500 iterations at 3.6 s is 30 minutes a search, and the prune about as much again. Five processes on four
cores take about 75 minutes.

**To be built.** `tools/ship/train6dofMlpClose.mjs` (the library), `tools/ship/trainMlp6dofClose.mjs` (the command) and
`tools/ship/train6dofMlpClose-selfcheck.mjs` (the gate), on Round 2's pattern.

### Round 3: built, 2026-11-03, before the registered run (nothing of the registration above is changed)

**What exists:** `tools/ship/train6dofMlpClose.mjs` (the library), `tools/ship/trainMlp6dofClose.mjs` (the command) and
the gate `tools/ship/train6dofMlpClose-selfcheck.mjs` (about 27 s, 28 rows).

**How the run is shaped.** Round 2's design, with the duel changed and nothing else.
- **C-files come first.** The start, the Default and the close-quarters pilot must be the registered files, or nothing
  is searched.
- **Every duel is the close profile's,** from `train6dofLeague.mjs`'s own `duelOf(PROFILES.close)`. That covers the
  searches, the prune, the held-out pick, the audit, the mirror, the start's baseline, the autopilot check and the
  report.
- **The four searches and the determinism twin of the first run in five processes at once.**
- **Then the finish:** each search's held-out league score, the champion picked on it alone, the audit read once, and
  the verdict by `qualifies(champion, PROFILES.close)`. Then H2, from the same audit games.
- **The champion's audit against the Default keeps every game with its start.** The rule reads each start from them.
- **The command writes `brain/sixdofGpuCloseResults.json` and prints only where it is.** The weight file is a later
  step, `--write-from` that committed file, and only if the champion qualified.

**The gate never starts the command's round and flies only scratch seeds** (99900-99961).

**Sabotaged with the byte-safe runner: 28 designs, each red by name** (the counts are in the gate's header).
- **Two went red only through a section's guard at first.** G20 (C-files ignoring the close file given) and G21 (the
  close pilot's hash not checked) let a planted run reach its searches, which threw and ended the section before the
  C-files row. The row now catches the throw itself. Both were run again: 1 and 2 red, by the rows' own names.
- **Designed in before the sabotages, so the rows could go red:**
  - every independent recomputation takes the close duel from `train6dofLeague.mjs`, not from the library under test;
  - the trained-and-pruned row carries its contrast: the same search without the close duel comes out different;
  - a row holds that every audit game keeps its start. A game without one falls out of both per-start subsets, each
    start then reads 0-0, and the rule's per-start check passes on nothing (G13 is that sabotage);
  - each crossed edge on made-up numbers must carry exactly one reason. A first draft's lead of 15 also put the score
    under the mirror's, so that row would have gone red for the wrong cause.

**The registered run:** `node tools/ship/trainMlp6dofClose.mjs --workers 5`.

### Round 3: the verdict, 2026-11-03 (read from the committed file, after it was committed)

The registered run wrote `brain/sixdofGpuCloseResults.json` at head 91e8a90f. It was committed byte for byte at
86674dae before anyone read it. It flew the registered seeds and says so (`registeredSeeds: true`).
The searches took 37 to 44 minutes each, in five processes at once. Every number below is re-derived from that file in
section 5 of `tools/ship/train6dofMlpClose-selfcheck.mjs`, and the champion's tallies are re-flown there from its
weights.

**The controls held.**
- **C-files:** the start was 0ffd8554, the Default 215e26d9 and the close-quarters pilot 360580a7.
- **C-determinism:** search 7200, run twice in two processes at once, gave 9477bfac both times.

**The four searches:**

| search | train | held-out league score | improvements | neutral | moved | kept |
|---|---|---|---|---|---|---|
| 7200 | 19.19 | 19.25 (W118/L36/D38, hits 3138, taken 2262) | 65 | 153 | 395 | 104 |
| 7201 | 18.65 | 18.58 (W110/L43/D39, hits 3149, taken 2373) | 38 | 185 | 408 | 11 |
| 7202 | 19.62 | 19.13 (W116/L42/D34, hits 3146, taken 2228) | 47 | 185 | 400 | 53 |
| **7203** | 19.84 | **19.34 (W114/L43/D35, hits 3143, taken 2224)** | 69 | 167 | 415 | 68 |

"Kept" counts the weights that still differ from the start after pruning toward it. The held-out league score is over
192 games: 24 seeds, both starts, both sides, against the PD autopilot and the Default.

**H1 is not met.** The champion is search 7203 (hash 23ab24c1, 68 weights different from the start). By
`train6dofLeague.qualifies()` with `PROFILES.close`, the Default the pilot to beat, it fails two of the six conditions:
- **the audit lead:** W79/L67/D14 against the Default on 6401-6440, a lead of 12 against the floor of 16;
- **the standoff start:** W0/L66/D14 there, behind the Default.

It passes the other four:
- its audit score, 17.39 against the Default, is above the Default's own 14.46 against itself (W25/L25/D110);
- the held-out seeds: W48/L36/D12 against the Default, a lead;
- the check against the PD autopilot, on 6101-6120 in both starts and from both sides: W60/L7/D13 against the start's
  W26/L31/D23. That is fewer losses and a higher score (20.69 against 14.08).

So **no weight file is written**, and the champion is not offered anywhere.

**The two conditions it fails are the two the close profile adds for its two starts:** the floor counted per start (8
each, so 16), and no start behind. The league profile's rule (a floor of 8, no start checked) passes the same numbers.
A pilot that wins one start and loses the other is what the per-start check refuses, and this is one.

**H2 is met: the gap narrowed by 79 games.** On the same 160 audit games the start went W30/L97/D33 against the Default
(a lead of -67), and the champion W79/L67/D14 (a lead of 12): a gain of 79 against the floor of 16.

**Start by start, against the Default on the audit games** (reported, testing nothing):

| start | 0ffd8554 (the start) | 23ab24c1 (the champion) | the Default against itself |
|---|---|---|---|
| standoff | W1/L70/D9 | W0/L66/D14 | W8/L8/D64 |
| joust | W29/L27/D24 | W79/L1/D0 | W17/L17/D46 |

- **All of the gain is in the joust.** There the champion killed the Default in 79 of the 80 games and died once.
- **In the standoff it barely moved.** The champion died in all 80 standoff games. In 14 of them the Default died too,
  which count as draws.
- **Rams:** 39 in the champion's 160 games against the Default (559 hit points), all in the joust. The start's games had
  37 (546), and the Default's against itself 38 (584).

**Against the fruit fly's close-quarters pilot** (the page's default), on the same audit seeds: W35/L108/D17. Every
decided standoff game went to the fruit fly's pilot (W0/L68/D12), and the joust was close (W35/L40/D5). The page's best
is still well ahead.

**The predictions:**
- **P1: right.** H1 is not met; I gave that 80%.
- **P2: right.** H2 is met; I gave that 55%.
- **P3: wrong.** The start's audit lead against the Default is -67, not -80 or worse.
- **P4: right.** The champion lost 108 and won 35 against the close-quarters pilot; I gave that 90%.

**What this says, and what it does not.**
- **It says:** trained by the close-quarters recipe, the GPU Brain's MLP learned the joust against the Default almost
  completely, from W29/L27/D24 to W79/L1/D0. It also got much better against the PD autopilot.
- **It also says:** in the standoff it did not learn to survive, so it does not qualify. Over the 160 games it leads the
  Default by 12, short of the floor of 16, and it is behind in the standoff.
- **It does not say** why the standoff did not move, or whether more iterations, more searches, another network or a
  recipe that weighs the two starts differently would move it. It also does not say how this champion does on the page.
  None of that was tested.
  - Round 1 found that only the close-quarters pilot's training carried to the page's own fight.

**What follows.**
- Nothing is written, so the page and the capability map's TRAINED cell keep the first round's pilot. The cell cites
  this round's result beside Round 2's.
- This note authorises no fourth recipe.

**Round 3's verdict, as code:** section 5 of `tools/ship/train6dofMlpClose-selfcheck.mjs` re-derives every number above
from the committed file and re-flies the champion's tallies from its weights. It also holds that nothing was written:
`--write-from` refuses the file. Sabotaged with the byte-safe runner: 19 designs, each red by name. They edit the
committed file, this note or the command, and the counts are in the gate's header.
- **Found while writing it:** the first two rounds' gates read their verdict's fragments from its heading to the end of
  this note. Once this verdict sat below theirs, its own "**P1: right.**" answered for both: this note saying Round 1's
  P1 wrong, or Round 2's, went 0 red. Each now reads its own section alone, and the same edits go 1 red. This round's
  gate reads its own section alone from the start.

## Round 4: network or luck -- registered before any code (2026-11-03)

Keith chose it ("Network or luck").

> **The first round's verdict compared one champion with one champion: the fruit fly's Default beat the GPU Brain's
> champion 70-0. Trained by that same recipe twenty times each, do the fruit fly's searches beat the GPU Brain's as a
> rule (the network), or did it depend on which searches won (luck)?**

**Why it is a question.**
- The first round's H2 put the best of five fruit fly searches against the best of five MLP searches. Each brain had one
  draw.
- A 70-0 can come from the networks, or from a strong fruit fly draw meeting a weak MLP draw. One pairing cannot tell
  them apart.
- Twenty searches a side, every one against every other, shows the spread within each brain beside the gap between them.

**The searches: the first round's recipe, unchanged, twenty times for each brain.**
- `train6dofPilot.mjs`'s `RECIPE`: 1,500 iterations of the sparse (1+1)-ES, 1 to 4 weights a child, sigma 0.3, from
  the hand weights, against the PD autopilot, on train seeds 1-12. Each search is pruned toward the hand weights.
- **The fruit fly's network (930 weights) on search seeds 7300-7319; the GPU Brain's MLP (1,637) on 7400-7419.** Both
  fresh. Two blocks, so the two brains' mutation streams are not the same stream.
- **Nothing is picked.** Every search's pruned pilot enters the round robin.
- Each search's held-out score against the PD autopilot (seeds 21-28) is recorded, as the recipe does. It is reported
  and tests nothing.

**The round robin: fresh duel seeds 6501-6520** (20), clear of every block flown before.
- The 40 pilots each play every other pilot on each seed, from both sides: 780 pairings of 40 games, 31,200 games.
- Each pairing is `pilot6dofPolicy.evaluate()` with the other pilot as the league's one opponent, the way the first
  round's H2 was read. The duel is the recipe's: the standoff start, no collisions, damage 6.
- **A pilot's score is its wins minus losses** over its 1,560 games.

**H1, the network decides it.** The fruit fly's 20 scores and the GPU Brain's 20 differ by an exact two-sided rank-sum
test at p < 0.01 (Wilcoxon-Mann-Whitney on the 40 scores, mid-ranks for ties, p from the exact permutation distribution).
- **"The fruit fly's network"** if the fruit fly's ranks are the higher, **"the GPU Brain's network"** if they are the
  lower, and **"not shown"** if p is 0.01 or more.
- "Not shown" would not prove luck. It would say that twenty searches a side cannot tell the two networks apart.
- The permutation test is valid although the 40 scores come from games among the same pilots: if the network made no
  difference, the 40 pilots would be exchangeable, and so would their scores.

**Reported, testing nothing:**
- per search: the train score, improvements, neutral moves, weights moved and kept, the held-out score against the PD
  autopilot, and its round-robin record;
- **the cross-play:** the 400 pairings of a fruit fly search with a GPU Brain search. How many each side leads, and how
  many are at least as lopsided as the first round's 70-0: a lead of 35 or more over the 40 games;
- **the two shipped pilots against the field:** the fruit fly's Default (215e26d9) and the GPU Brain's champion
  (0ffd8554) each play the 40, and each other, on the same seeds. This shows where each would place, and whether the
  first round's pairing was an ordinary draw.

**Controls.**
- **C-twin:** the hand MLP flies the fruit fly's hand pilot to the bit on the train and held-out seeds
  (`train6dofMlp.mjs`'s `twinCheck()`), or nothing is searched. The two brains must start from the same pilot.
- **C-files:** the two shipped pilots are the registered files (215e26d9 and 0ffd8554), or nothing is searched.
- **C-determinism:** the first search of each brain (7300 and 7400) is run a second time, in its own process.

**Predictions, fixed now, deciding nothing.**
- **P1: H1 reads "the fruit fly's network"** (65%). The 70-0 margin was wide, and the MLP's champion kept 29 weights to
  the fruit fly's 84.
- **P2: the fruit fly's search leads in at least 300 of the 400 cross-play pairings** (50%).
- **P3: the fruit fly's Default scores above at least 15 of the 20 fruit fly searches** against the field (55%). It was
  the best of five on held-out.
- **P4: the GPU Brain's searches keep fewer weights than the fruit fly's,** by the median (75%). The first round's five
  MLP searches kept 29 to 74.

**What was seen first.** Timing only, on scratch train seeds 99962-99973 with the hand weights, and no score was read:
one train evaluation (12 duels) took 74 ms for the fruit fly's network and 38 ms for the MLP, and one duel of the two
hand pilots 7.5 ms. The first round's committed results file says its MLP searches took 3 minutes each.

**Cost.** A search is about 6 minutes for the fruit fly and 3 for the MLP, with its prune. The 42 searches (the 40 and
the two determinism re-runs) take about 50 minutes on four workers, and the round robin and the shipped pilots' games
(34,440 games) about 5 to 10 more.

**What each outcome buys.** Nothing is written, whatever H1 reads: no pilot file and no page change. The capability
map's GPU cell cites the result.
- **"The fruit fly's network":** the first round's gap is the networks. More searches of the same recipe would not be
  expected to close it; another network or another recipe might.
- **"Not shown":** the 70-0 says little on its own, and the MLP's best draws may fly level with the fruit fly's.
- This note authorises no further round.

**To be built.** `tools/ship/train6dofMlpLuck.mjs` (the library), `tools/ship/trainMlp6dofLuck.mjs` (the command) and
`tools/ship/train6dofMlpLuck-selfcheck.mjs` (the gate), on Round 3's pattern. The results go to
`brain/sixdofGpuLuckResults.json`, committed before it is read.

### Round 4: built, 2026-11-03, before the registered run (nothing of the registration above is changed)

**What exists:** `tools/ship/train6dofMlpLuck.mjs` (the library), `tools/ship/trainMlp6dofLuck.mjs` (the command) and
the gate `tools/ship/train6dofMlpLuck-selfcheck.mjs` (about 20 s, 34 rows).

**How the run is shaped.**
- **C-twin, then C-files, come first.** The hand MLP must fly the fruit fly's hand pilot to the bit, and the two shipped
  pilots must be the registered files, or nothing is searched.
- **The 42 searches run in four processes at a time:** each brain's twenty, then each brain's determinism re-run. Every
  job carries the recipe as well as its brain and seed, and the searches must come back in the order asked.
- **Then the finish:** the 40 pilots in the round robin, H1's test on their scores (the fruit fly's twenty first), the
  cross-play, and the two shipped pilots against the field.
- **The shipped pilots are placed on common opponents.** Set against search k, a shipped pilot's lead over the other 39
  is compared with k's own score over those 39.
- **Each pilot travels as its difference from its brain's hand weights,** exactly, so the results file holds all 40.
  It is JSON with every array of numbers on one line.
- **The command writes `brain/sixdofGpuLuckResults.json` and prints only where it is.** Nothing else is written.

**The gate never starts the command's round and flies no round-robin seed.**
- Its miniature flies scratch duel seeds 99974-99978.
- The command runs only as a worker: one search, on the recipe's own train and held-out seeds. Every such run names a
  planted results file that exists, so a worker whose search branch broke would stop at the refusal (G33 is that
  sabotage).

**The test is checked against brute force** over every relabelling of small samples, with and without ties. On twenty
against twenty completely apart it gives exactly 2 in C(40, 20).

**Found while building, before the sabotages:**
- **The miniature's searches ran at the recipe's 1,500 iterations, not the 80 asked.** `run()` handed the searcher each
  job's brain and seed but not the recipe, so an in-process searcher took the defaults. The row that re-runs each search
  independently went red on it. Every job now carries the recipe; G25 puts the bug back.
- **Two rows could not have gone red.** The brute-force check took its mid-ranks from the library under test (it now
  computes its own), and no made-up lead sat at the 70-0 threshold's edge (a lead of 34 now does).
- **As first drafted, two of the gate's runs of the command could have started the registered round under a
  sabotage.** One ran it against an existing results file to watch it refuse; it is gone, and the refusal is held as a
  library function. The other is the worker run, which now names the planted file.

**Sabotaged with the byte-safe runner: 33 designs, each red by name** (the counts are in the gate's header).
- **One went 0 red on the first run: G18,** the shipped pilots placed on their whole total rather than on common
  opponents. The miniature's shipped pilots sat so far above every search that the two rules agreed. The rule is now
  `placesAbove()`, held on made-up numbers where they disagree; G18 was run again and went 1 red.
- **G33 inverts the command's search branch.** The worker fell through to the refusal on the planted file and stopped,
  with nothing flown.

**The registered run:** `node tools/ship/trainMlp6dofLuck.mjs --workers 4`.
