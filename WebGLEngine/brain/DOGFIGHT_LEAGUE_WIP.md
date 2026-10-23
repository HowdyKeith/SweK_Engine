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
