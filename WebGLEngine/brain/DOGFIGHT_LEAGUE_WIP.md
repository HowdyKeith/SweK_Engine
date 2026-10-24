# Dogfight league training -- the first two real runs (WIP note, unnumbered)

Both brains were trained once each with `tools/ship/trainLeagueDogfight.mjs` (library `tools/ship/trainDogfightLeague.mjs`, gate
`trainDogfightLeague-selfcheck.mjs`) under the rules fixed in the library's header BEFORE any audit was read. **Neither champion
qualifies, nothing was written, and no shipped weight file changed.** The audit sets each brain was graded on are now spent.

    node tools/ship/trainLeagueDogfight.mjs --brain fly --workers 4 --cache <dir> --dump <file> --write     (4 runs x 400 iterations, seeds 10000..10003, sigma 0.3, maxK 4)
    node tools/ship/trainLeagueDogfight.mjs --brain gpu --workers 4 --cache <dir> --dump <file> --write     (the same recipe, seeds 11000..11003)

Searches start from the shipped fighter, are scored against the autopilot, a copy of the shipped fighter ("self") and the OTHER brain's
shipped fighter ("other"), each fight flown from both seats; the champion is the best held-out of the runs that are eligible on the
pools, and is then graded once on audit sets it never saw. Wall time: the fruit fly's searches took 26 to 29 minutes each in
parallel, the GPU Brain's 49 to 80.

## The fruit fly (Giant Fiber Circuit, 1,099 weights, starts from pilotDogfightWeightsDefault.json, hash dc5ee8ed)

* Champion seed 10000. Held-out 0.8783 against the shipped fighter's 0.3390; league audit 0.7773 against 0.2673.
* Head to head against the shipped fighter: **168 wins, 2 draws, 30 losses, edge 1.2847 +- 0.0796 (16.13 paired standard errors).**
* Lost to the ground or a collision on the league audit: 0 vs the autopilot, 1 vs self, 0 vs the other brain (the shipped fighter: 1, 36, 5).
* **DOES NOT QUALIFY: the classic turning audit fights score 0.2605, more than 0.05 below the shipped fighter's 0.4771.** The classic audit as a whole
  is better (0.8683 against 0.7212; tail 1.159, offset 1.078, duel 0.976) -- the champion learned to win duels against a fighter that hunts and
  forgot to chase an opponent that merely turns. The reserve set agrees (turning 0.226 against 0.642).
* Two of the four runs were not eligible on the classic pool (a full stall in 1 fight against the autopilot's 0; 7 fights lost to the ground or a
  collision and 13 stalls).

## The GPU Brain (18-32-32-4 MLP, 1,796 weights, starts from pilotDogfightMlpWeightsDefault.json, hash 6c2cb228)

* Champion seed 11003. Held-out 0.0957 against the shipped fighter's 0.0112; league audit 0.0869 against 0.0048.
* Head to head: **58 wins, 93 draws, 49 losses, edge 0.0644 +- 0.0467 (1.38 paired standard errors)** -- under the 2 the rules demand.
* **DOES NOT QUALIFY** on three counts: the edge (1.38 < 2), one fight lost to the ground or a collision against self on the audit duels (the shipped
  fighter 0, the rule allows 0), and the classic offset audit fights score 1.0445, more than 0.05 below the shipped fighter's 1.0983.
* Eligible runs: 2 of 4 (seeds 11001 and 11003). Run 1 lost a fight to the other brain on the league pool and 3 classic fights; run 3 lost 24
  fights to the autopilot on the league pool.

## What it means and what is NOT claimed

* The fruit fly's gain is large and real on the fights it was trained on and it breaks a clause that was fixed before the audit was read. The
  rules were not loosened. A fruit-fly retrain that keeps the turning fights in its objective (for example by adding turning fights to the
  league's training set, or a turning term in the champion's pick) needs FRESH audit sets: LEAGUE_AUDIT_SET, AUDIT5 and SAFETY5 (fruit fly) and
  LEAGUE_AUDIT2_SET, AUDIT6 and SAFETY6 (GPU Brain) are spent.
* The GPU Brain's league gain is small (58-93-49) and the MLP is the slower, noisier search; this recipe did not find a fighter that beats its
  shipped one by the margin the rules ask for.
* Not checked: whether a longer search (more iterations or runs) closes the GPU gap; whether the fruit fly's turning loss comes from the
  objective (duels only) or from the circuit's capacity; any league run against a THIRD opponent (the jets' fighters are not in the league).

# The jets -- the fruit fly's league run (WIP note, unnumbered)

`node tools/ship/trainLeagueDogfight.mjs --aircraft jet --brain fly --workers 4 --cache <dir> --dump <file> --write` (library `tools/ship/trainDogfightLeague.mjs`, sets `brain/jetLeagueSets.mjs`, gate
`trainDogfightLeague-selfcheck.mjs`). The Giant Fiber Circuit (1,099 weights) starts from the jet autopilot's hand weights (hash 8d909ea0) -- there is no shipped jet fighter -- and is scored against the jet
autopilot, itself (the hand twin) and the GPU Brain's hand twin (368e32cd), each fight flown from both seats with the jet's physics, gun and guidance. 4 runs x 400 iterations, search seeds 12000..12003.

## First try (search seeds 12000..12003): NO CHAMPION, nothing written, the audit sets NOT read

The shipped (hand-twin) fighter, for comparison: held-out 0.0133; on the league pool 4 fights lost to the ground or a collision against each opponent (of 200 fights each; a search may lose no more than 8); classic pool 0.8417.

| run | seed | train | held-out | league pool, lost vs autopilot / self / other | classic pool |
|---|---|---|---|---|---|
| 1 | 12000 | 0.4650 | 0.3064 | 17 / 16 / 16 | 0.7829 |
| 2 | 12001 | 0.3122 | 0.0615 | 11 / 11 / 11 | 0.5883 |
| 3 | 12002 | 0.4246 | 0.1472 | 39 / 37 / 37 | 0.6455 |
| 4 | 12003 | 0.4230 | 0.3168 | 22 / 22 / 22 | 0.9136 |

All four are ineligible on the same count: they lose between 11 and 39 of 200 pool fights to the ground or a collision where the limit is 8. They did raise the score a great deal (held-out up to 0.317 against 0.013);
what they bought it with is safety. The reading I take, said as a reading: the training set is 12 duels (72 fights) and the hand twin loses about one of them to the ground, so the objective sees a crash a handful of
times at most and can trade it away; the pool (100 duels) sees it. NOT CHECKED: that reading, and whether any seed of this recipe can be eligible.

## Retry, written down BEFORE it runs (search seeds 12100..12103)

The same recipe and the same rules: only the search seeds change (`--seed 12100`, so runs 12100..12103). eligibility(), qualifies() and every set are untouched, and the audit sets are unread, so they are still
unspent. Counted honestly: a champion from this batch is the best of the eligible among EIGHT searches drawn against the same pool and held-out sets (the four above and these four), and the verdict is still the one
read of the audit, which no earlier search has seen.
If this batch is also entirely ineligible, the next step is NOT more seeds: it is a change of recipe -- a larger training set on fresh seeds and a crash guard in the objective, as the drones' second round had -- decided
in writing before it runs.

## A correction to the reading above, and what to take into the flight-characteristics round (nothing built; parked at Keith's word)

The reading in the first-try section ("the objective sees a crash a handful of times and trades it away") treated the lost fights as ground losses. A throwaway probe (flown from both seats on the 100 league-pool duels,
height and sink rate read each tick; NOT committed, NOT gated -- these numbers are unchecked until a gated tool reproduces them) says they are not all that:

* the hand-flown twin: 0 fights lost to the ground, 4 collisions;
* the search of seed 12003 (22 lost): **0 to the ground, 22 collisions** -- it learned to fly into the opponent (a collision inside 6 m loses the fight for both), and no ground alert could help it;
* the search of seed 12002 (39 lost): **26 to the ground and 13 collisions**.
The other two searches were not examined. So "crash guard in the objective" in the retry terms above means a guard on collisions as well as on the ground, and the first thing the recipe-change round has to do is look at which.

A GROUND ALERT, as Keith asked (what real jets give a pilot): the same probe tried two alert rules on the 26 ground losses of seed 12002 and on its 161 fights that were not lost to the ground or a collision.
  * time to impact (height / sink rate) under 5 s: warned 26 of 26, 4.1 to 4.6 s ahead of the impact; fired in 1 of the 161 other fights (0.02% of the time). Under 8 s: 5.8 to 6.9 s ahead, 10 of 161 fights (0.6% of the time).
  * a pull-out rule (the height a 4 g pull-out from here would lose, plus 1 s of reaction, against the height left): warned 26 of 26, 3.3 to 4.4 s ahead, in none of the 161 other fights; on the hand-flown twin's 196 other fights neither rule ever fired.
  * at the alert the aircraft was at about 200 m/s with the wings banked about 80 degrees (none inverted): a recovery has to level the wings before it can pull, so 3 to 4 s is not slack. NOT CHECKED: that a pilot (hand or network) can recover from that state in that time; the 4 g is an assumption, not the jet's measured limit.
  * how the networks would receive it is a design question for that round: the fruit fly's eighteen features have no slot named for it (the jet's layout is already spent on the schedule and the limiter), and the alert could instead be a protection layer around ANY pilot (what the F-16's automatic ground collision avoidance is) that
    needs no change to the network at all. Neither was built.
Parked together with stall, afterburner and the other characteristics the jet model leaves out, for after the named work is done.

### The list for the flight-characteristics round, as Keith gave it (after the named work is done; none of it is started)

ground alert (what real jets give the pilot) -- stall -- afterburners -- landing and take-offs ("if possible") -- "the other characteristics" the jet model leaves out. What the jet model already has of each (the trainer's flight model has a stall, the
jet's engine has a spool lag and Mach drag) is for that round to check from the code, not from this list.

## Second try (search seeds 12100..12103, as written down above): NO CHAMPION again, nothing written, the audit sets still NOT read

Run alone on four cores the four searches took 1,912 to 2,928 s. Same shipped fighter as before (held-out 0.0133; 4 of 200 pool fights lost against each opponent, limit 8; classic pool 0.8417).

| run | seed | train | held-out | league pool, lost vs autopilot / self / other | classic pool | also |
|---|---|---|---|---|---|---|
| 1 | 12100 | 0.2585 | 0.0849 | 25 / 24 / 24 | 0.8655 | 7 classic-pool fights lost that the autopilot does not lose |
| 2 | 12101 | 0.3147 | 0.3145 | 17 / 17 / 17 | 0.5742 | classic pool 0.28 below the shipped fighter's; 6 fights lost |
| 3 | 12102 | 0.4183 | 0.2302 | 16 / 16 / 16 | 0.9115 | 5 classic-pool fights lost |
| 4 | 12103 | 0.3846 | 0.2149 | 9 / 9 / 9 | 0.8522 | 3 classic-pool fights lost (one over the league limit of 8, and the classic rule allows none) |

A champion, had there been one, would have been the best held-out of the eligible among eight searches. There is none.

### What the probes say (throwaway scripts, NOT committed, NOT gated: unchecked until a gated tool reproduces them; flown on the league pool and the training duels with the three league members, both seats)
* **Every pool loss of all four retry searches is a COLLISION; none is to the ground** (hand twin: 0 ground, 4 collisions of 200 against the autopilot; seeds 12100/12101/12102/12103: 25/17/16/9 collisions, 0 ground). The first batch's seed 12003 was the same (22 collisions, 0 ground); its seed 12002 alone had ground losses (26). A ground alert would not have changed this failure.
* **The training set shows the search no failure at all, and the pool shows plenty**: lost fights on the 72 training fights, 0 for the hand twin and for every one of the four searches; on the 600 pool fights, 12 (2.0%) for the hand twin and 73 (12.2%), 51 (8.5%), 48 (8.0%) and 27 (4.5%) for seeds 12100..12103.
* **The searched pilots fly the training duels differently from the pool duels**: median closest approach to the opponent on the training duels 54, 115, 77 and 161 m (hand twin 12 m); on the pool 14, 56, 55 and 29 m (hand twin 13 m). Read as: the weights found something that works in twelve geometries and does not transfer.
* **A near-miss penalty (closest approach under X metres) is REJECTED as a remedy**: the hand twin itself passes within 15 m in 100% of the training fights and 79% of the pool's, so such a penalty would punish the baseline it is meant to protect.

### Recipe change (decided in writing here, BEFORE anything is built or run; the rules -- eligibility(), qualifies(), the pool, the held-out set, the audits -- do not change)
The training objective needs to see the scenarios the pool contains. Candidate: a much larger set of training duels on FRESH seeds (the next free block is 16100 and up; jetLeagueSets.mjs), drawn a minibatch at a time (the parent and the child scored on the same twelve duels per iteration, the minibatch changing every iteration), so that 400 iterations meet ~100 different scenarios at about twice the cost of now instead of eight times; the prune step on a fixed fresh subset. The retrain would use new search seeds and be counted again in the note. Not decided: the minibatch size and the pool of duels (the two numbers the first run would have to guess); the GPU Brain's verdict (running) is read first, since the same change would serve it.

## The GPU Brain's jet league run, first recipe (search seeds 13000..13003): NO CHAMPION, nothing written, the audit sets NOT read

Same recipe as the fruit fly's first try (400 iterations, sigma 0.3, 1 to 4 weights per child, the 12 training duels, prune toward the start). Start: the network's hand weights (hash 368e32cd, the jet autopilot's laws in the weights); the other brain's fighter is the fruit fly's hand twin (8d909ea0). Searches took 3,076 to 3,266 s each, four processes on four cores. The shipped fighter (the hand weights) scores held-out 0.0133, loses 4 of 200 pool fights against each opponent (limit 8), classic pool 0.8417.

| run | seed | train | held-out | league pool, lost vs autopilot / self / other | classic pool | why not eligible |
|---|---|---|---|---|---|---|
| 1 | 13000 | 0.4201 | 0.2476 | 11 / 11 / 11 | not read | 11 lost on the league pool against a limit of 8 |
| 2 | 13001 | 0.3230 | 0.2238 | 14 / 16 / 16 | not read | 14 to 16 lost on the league pool |
| 3 | 13002 | 0.4395 | 0.2697 | 3 / 3 / 3 | one fight lost to the ground or a collision that the autopilot does not lose (duel:15082) | the classic pool's rule allows none |
| 4 | 13003 | 0.3246 | 0.2690 | 2 / 2 / 2 | one such fight (duel:15034), and the classic pool score 0.0799 is more than 0.02 below the shipped fighter's 0.8417 | the same rule, and the score slack |

* Two of the four (13002, 13003) were INSIDE the league pool's limit (3 and 2 lost against the shipped fighter's 4) and fell on the classic pool, by one fight lost each. The classic pool rule is the one fixed before any audit was read ("loses no fight to the ground or a collision that the shipped fighter does not"); it is NOT loosened here, and a search that misses it by one fight is not a champion. Said plainly because these are the closest the jets have come.
* The same shape as the fruit fly's: the train score (0.32 to 0.44) is well above the held-out (0.22 to 0.27) and the pool (0.22 to 0.32); 12 duels are not enough to teach the weights what the pool contains. Not checked for the GPU Brain: whether its pool losses are collisions (the fruit fly's were, 0 to the ground); the probe was run on the fruit fly's searches only.
* Counted: the GPU Brain has had 4 jet searches, none eligible. The fruit fly has had 8, none eligible.

## Recipe v2 (`--train wide`) -- the terms, written down BEFORE it runs
What it is (built, gated and sabotaged; brain/dogfightTrain.trainBatchedWith, brain/jetLeagueSets.mjs, tools/ship/trainDogfightLeague.mjs): the objective is judged on ONE of EIGHT BATCHES of twelve fresh duels per iteration (96 fresh duels, seeds 16100..16195; the parent and the child are scored on the same batch, a different batch each iteration, the parent's score on a batch is remembered until the parent changes), the prune is on 24 further fresh duels (16200..16223). The held-out set, the pool, the classic pool, the eligibility rules, the champion rule and `qualifies()` are the first recipe's, word for word. Iterations (400), sigma (0.3), maxK (4) and the start (the hand weights) are unchanged.
New search seeds: the fruit fly 12200..12203, the GPU Brain 13200..13203; four searches each; the fruit fly first. Nothing from the first recipe's eight (or four) searches is pooled with these: the recipe is the experiment, and a champion is chosen among the eligible of THESE four searches only, on the held-out set, and its audit is read once.
What is written down as the outcomes, before they are known:
  * a champion of the four that passes `qualifies()` is shipped (a jet file for that brain, as the trainers' were), with the note saying it was the second recipe, that the first recipe found nothing in 8 (fruit fly) or 4 (GPU Brain) searches, and that this was the second look at the same pool;
  * no eligible search in the four: the recipe is reported as not enough, with the per-search table as above and the pool losses broken into collisions and ground contacts. This note does NOT authorise a third recipe, more seeds, a looser rule or a changed pool; those would be Keith's call, written down before they run.
  * what is compared whatever happens, so the result is a measurement and not only a yes or no: the pool loss rate of each search against the first recipe's (fruit fly 4.5 to 12.2 percent of 600 pool fights, GPU Brain 1.0 to 7.7 percent of the 600, from the table above: 6, 9, 33 and 46 lost), and the train-versus-pool gap in score. If the wide objective closes the gap and the pool losses fall, the sets were the problem; if it closes the gap and the losses do not fall, the objective is the problem.
Cost: an iteration scores the child on 12 duels as before, plus the parent when it has no remembered score on that batch, so up to twice the first recipe's time (the first recipe took 1,900 to 3,300 s per search on four cores). NOT measured yet.

## Recipe v2 on the fruit fly (search seeds 12200..12203, as written down above): NO CHAMPION, nothing written, the audit sets still NOT read

Run on four cores (`--train wide --workers 4`, 400 iterations, sigma 0.3, 1 to 4 weights per child): the searches took 9,315 s (12201), 11,631 s (12202), 14,245 s (12203) and 15,032 s (12200) -- 2.6 to 4.2 hours each, against 32 to 49 minutes for the first recipe (the whole run 4 h 15 min). Same shipped fighter (held-out 0.0133; 4 of 200 pool fights lost against each opponent, limit 8; classic pool 0.8417).

| run | seed | score on its prune set | held-out | league pool score | pool lost vs autopilot / self / other (limit 8 each) | classic pool | weights kept of 1,099 (moved) |
|---|---|---|---|---|---|---|---|
| 1 | 12200 | 0.3548 | 0.1331 | 0.2046 | 7 / 7 / 7 (inside the limit) | **1 fight lost that the autopilot does not lose (duel:15001)** | 168 (341) |
| 2 | 12201 | 0.3409 | 0.2659 | 0.2167 | 14 / 12 / 12 | 2 lost; 5 past the full-stall angle where the autopilot has none; score 0.676 | 307 (327) |
| 3 | 12202 | 0.4102 | 0.2735 | 0.3114 | 10 / 10 / 10 | 3 lost; score 0.617 | 111 (340) |
| 4 | 12203 | 0.3615 | 0.2059 | 0.2269 | 11 / 11 / 11 | 5 lost; score 0.0347 | 324 (356) |

A champion, had there been one, would have been the best held-out of the eligible among four searches. There is none. Seed 12200 is, like the GPU Brain's seeds 13002 and 13003, one classic-pool fight short; the rule is not loosened.

### Against the two earlier fruit fly tries (all from the dumps; the same pool)
| | pool fights lost, per search (of 600) | score on what it was trained on minus the pool score |
|---|---|---|
| first try, 12000..12003 (12 training duels) | 5.5, 8.2, 11.0, 18.8 percent | 0.11 to 0.20 |
| second try, 12100..12103 (the same recipe) | 4.5, 8.0, 8.5, 12.2 percent | 0.07 to 0.18 |
| recipe v2, 12200..12203 | 3.5, 5.0, 5.5, 6.3 percent | 0.10 to 0.15 |
(The hand-flown twin loses 2.0 percent of the pool.) The score column is not the same quantity in the two recipes: v2's is the score on its 24 prune duels, the first recipe's on its 12 training duels.

### What a throwaway probe says (NOT committed, NOT gated: scratchpad `wide_probe.mjs`; the same 3 members, both seats)
* **Every pool loss of all four v2 searches is a COLLISION again; none is to the ground** (21, 38, 30 and 33 collisions in 600). Seed 12203 is the only one with ground losses anywhere (6, on its own 96 training duels).
* **The objective now sees failures.** On the 96 fresh training duels (576 fights) the hand twin loses 18 (3.1 percent) and the searches 15, 17, 15 and 39 (2.6, 3.0, 2.6 and 6.8 percent); the first recipe's twelve duels showed its searches 0 of 72. On the 24 prune duels: 0, 1, 0 and 3 lost.
* **The gap between what it was trained on and the pool is smaller and not closed.** Collision rate on the pool minus on the 96 training duels: +0.9, +3.3, +2.4 and -1.3 points (the first recipe: +4.5 to +12.2). Three of the four still lose more on the pool than on what they were judged on, and all four lose more than the hand twin on the pool (2.0 percent).
* **One search stays far away from the opponent.** Median closest approach on the pool: hand twin 13 m, seeds 12200 21 m, 12201 31 m, 12203 16 m, and **12202 167 m** (on the prune duels 175 m, on the 96 duels 171 m). It has the best pool score of the four and, with it, almost no engagement: it flies a way of not being near the opponent at all. NOT checked: what it does instead, and whether its pool score comes from fights the opponent loses to the ground; a pilot that never closes cannot beat the shipped fighter head-to-head, which `qualifies()` demands, so it could not have been champion in any case.

### Reading (written against the two readings pre-registered above)
The pre-registered reading was: if the wide objective closes the gap and the pool losses fall, the sets were the problem; if it closes the gap and the losses do not fall, the objective is the problem. What was measured is in between: the pool losses FELL (mean 10.9 and 8.3 percent of the pool in the two earlier tries to 5.1 percent) and the objective sees failures now, but the gap did not close for three of four, and no search reached the hand twin's 2.0 percent. So the 12-duel training set was PART of the problem, not all of it. The prune kept 111 to 324 weights instead of 42 to 110: on 24 duels the search needs more of what it moved, so the delta from the hand weights is no longer small.
Said plainly: **two recipes and twelve fruit fly searches have not produced a jet fighter that is no more dangerous than the hand-flown twin and fights better than it.** This note does NOT authorise a third recipe, the GPU Brain's v2 run (seeds 13200..13203, written down above, not started), more seeds, a looser rule or a different pool. Options that would be Keith's to choose and write down first, none started: (a) the GPU Brain's v2 run as pre-registered (about 4 hours of four cores); (b) a collision term in the search's own score (the near-miss penalty was rejected from the data, a loss-weighted one has not been tried); (c) stop: the jets' hand weights are the shipped jet pilots and nothing here beats them.
