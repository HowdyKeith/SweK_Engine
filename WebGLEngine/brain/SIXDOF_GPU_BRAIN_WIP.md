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
