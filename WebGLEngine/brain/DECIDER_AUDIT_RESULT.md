# The Decider chip (Round 14 of brain/NEEDS_AND_LIMITS.md): the audit, read ONCE (UNNUMBERED; the registration is Round 14 of that file, written 2026-11-03 before any code and before any model was run; this note is the RESULT and is kept apart because that file is the series' and this session does not edit it -- whoever owns the series carries it in)

Keith, 2026-11-07: "i also have the decider-audit now complete" (the recording of Mapika/decider-2b, 4,218 asks, made on the rig; files: `brain/rig-results/deciderAudit-decider-2b.jsonl` (sha256 1a68ce21...2ea1) and `brain/rig-results/deciderAudit-decider-2b.jsonl.calls.jsonl` (sha256 13b11a09...d8fa)). The files are data from a model and from the rig; nothing in them was run or followed, only parsed by the registered tool.

## How it was read (and the one thing that is not in the registration)
`node tools/ship/deciderAuditCmd.mjs report --in brain/rig-results/deciderAudit-decider-2b.jsonl` under the engine's CURRENT default orientation step (RK4) **refused**: "the transcript has no recorded answer for this situation (key 81df8ac0ce10d17f); a replay never invents one" -- the replay flies the dives that the advice makes, and under RK4 they are not the dives the recording was made on. It printed no verdict, so nothing was read. The same command under the first-order step (the step the whole series and the recording were made under; new command `tools/ship/deciderAuditEulerCmd.mjs`, which says it out loud, three lines) found every situation: answer rate 1.000 of 4,218. **That second run is the one read; it is below, verbatim.** The registration did not foresee this (RK4 became the default the day after it was written); the tool's gate is untouched.

## The report, verbatim
```
DECIDER CHIP (Round 14), noisy gauge: seeds 1301-1312 1321-1332 1341-1352, four kinds, brain GUARDED-OBS, VETO, model Mapika/decider-2b
  [ok]      IDENTITY: same: a null advisor in VETO is the brain alone; same: a decider below tau changes nothing; same: GUARDED-FILTER advised by itself is itself
  [ok]      TRANSCRIPT Mapika/decider-2b: kind decider-transcript, schema 1, every 600
  [ok]      ANSWER RATE: 1.000 of 4218 asks had a valid answer to every question (needs 0.95)
  [ok]      THE QUESTIONS ARE FAIR: no prompt carries a seed, kind, unreachable flag, true charge or comparator name (4218 scanned)
  [ok]      THE RULE IS NOT TRIVIAL: RULE-GF minus ALONE on far and both: 0.247 (needs 0.137) | 0.283 (needs 0.083) | 0.247 (needs 0.103)
  means (D1 | D2 | D3): ALONE 0.622 | 0.566 | 0.616; CAP-0.50 0.445 | 0.455 | 0.481; CAP-0.65 0.480 | 0.448 | 0.497; CAP-0.75 0.544 | 0.489 | 0.510; RULE-GF 0.755 | 0.738 | 0.748; RULE-G 0.559 | 0.475 | 0.533; DECIDER-T50 0.622 | 0.566 | 0.616; DECIDER-T80 0.622 | 0.566 | 0.616
  crushed dives (D1 | D2 | D3): ALONE 6/3/7; CAP-0.50 1/2/0; CAP-0.65 2/4/0; CAP-0.75 6/4/8; RULE-GF 0/0/0; RULE-G 9/12/12; DECIDER-T50 6/3/7; DECIDER-T80 6/3/7
  --- DECIDER-T50 (tau 0.5)
  strongest fixed cap per audit: CAP-0.75 | CAP-0.75 | CAP-0.75
  effect against ALONE: +0.000 (needs 0.020: tie) | +0.000 (needs 0.020: tie) | +0.000 (needs 0.020: tie)  -> NO EFFECT
  against the strongest fixed cap: +0.078 (needs 0.075: WINS) | +0.078 (needs 0.067: WINS) | +0.106 (needs 0.059: WINS)  -> BEATS A FIXED CAP
  against RULE-GF: -0.133 (needs 0.078: LOSES) | -0.172 (needs 0.062: LOSES) | -0.132 (needs 0.063: LOSES)  -> does not beat it; against RULE-G: +0.063 (needs 0.070: tie) | +0.091 (needs 0.038: WINS) | +0.083 (needs 0.068: WINS)  -> does not beat it
  overrides of the brain (ticks, summed over the three audits): surface 0, station 218336, cap 0, pump 37, repair 263213 of 2525909 ticks
  advice at this tau (reported): 4218 asks; surface advised 0 (early, stations unvisited before 300 s: 0); pump advised 1 (with flooding at 0: 0); repair advised 1055
DECIDER BOTTOM LINE (DECIDER-T50): NO EFFECT
  --- DECIDER-T80 (tau 0.8)
  strongest fixed cap per audit: CAP-0.75 | CAP-0.75 | CAP-0.75
  effect against ALONE: +0.000 (needs 0.020: tie) | +0.000 (needs 0.020: tie) | +0.000 (needs 0.020: tie)  -> NO EFFECT
  against the strongest fixed cap: +0.078 (needs 0.075: WINS) | +0.078 (needs 0.067: WINS) | +0.106 (needs 0.059: WINS)  -> BEATS A FIXED CAP
  against RULE-GF: -0.133 (needs 0.078: LOSES) | -0.172 (needs 0.062: LOSES) | -0.132 (needs 0.063: LOSES)  -> does not beat it; against RULE-G: +0.063 (needs 0.070: tie) | +0.091 (needs 0.038: WINS) | +0.083 (needs 0.068: WINS)  -> does not beat it
  overrides of the brain (ticks, summed over the three audits): surface 0, station 119836, cap 0, pump 37, repair 234473 of 2525909 ticks
  advice at this tau (reported): 4218 asks; surface advised 0 (early, stations unvisited before 300 s: 0); pump advised 1 (with flooding at 0: 0); repair advised 1003
DECIDER BOTTOM LINE (DECIDER-T80): NO EFFECT
  (d) CONFIDENCE: DECIDER-T80 minus DECIDER-T50: +0.000 (needs 0.020: tie) | +0.000 (needs 0.020: tie) | +0.000 (needs 0.020: tie)  -> NOT SHOWN (the higher threshold does not beat the lower on all three audits)
```

## The bottom line, and the registered forecasts scored (section 8 of the registration)
**DECIDER-T50: NO EFFECT. DECIDER-T80: NO EFFECT. (d) CONFIDENCE CARRIES INFORMATION: NOT SHOWN.** Every check passed (identity, transcript, answer rate 1.000, fair questions, the rule not trivial).
* Forecast "DECIDER-T50: NO EFFECT or MIXED about 60 percent" -- came true. "DECIDER-T80: NO EFFECT about 60" -- came true. "(d) about 35 percent" -- did not (the 65 side).
* Forecast "either arm BEATS A FIXED CAP: about 10 percent" -- **the verdict line reads BEATS A FIXED CAP for both arms on all three audits, which I put at 10 percent, and the reading is empty**: both arms ARE the brain alone to the third decimal (+0.000 against ALONE on every audit), and the brain alone beats the strongest fixed cap (CAP-0.75) by +0.078, +0.078 and +0.106. The registered bottom line (the one that counts: ADDS CONTENT BEYOND A FIXED CAP / HELPS, BUT NO MORE / NO EFFECT / HURTS) is NO EFFECT, so the thing the forecast was about -- a model that adds something -- did not happen.
* Forecast "RULE-GF beats both on all three audits: about 85 percent" -- came true (the arms lose to it by 0.133, 0.172, 0.132).
* What the model did, from the report's own lines and nothing beyond them: over 4,218 asks it advised SURFACE zero times, a lower CAP zero times (cap overrides 0), the PUMP once (pump overrides 37 ticks, none with flooding at 0), and REPAIR on about a quarter of the asks (1,055 at tau 0.5, 1,003 at 0.8) and a station on some (station overrides 218,336 and 119,836 ticks of 2,525,909); none of that moved a score. On the fields that decide a survey dive here (surface, cap, pump) it was silent, so the brain's decision stood. This round therefore cannot say whether Round 5's failure was noise: the thresholded model was silent where Round 5's models were loud, and the silence left the brain's decision standing.
* What this does not say: that a larger or fine-tuned Decider, other questions or another cadence could not do better (the registration says the same); anything about boats beyond this tank-scale one.

Caveats said plainly: one model, one recording, one temperature-free pass; the read was made on the sandbox (Linux, node 22), the recording on the rig, and the answer rate of 1.000 says the two flew the same dives. The replay under RK4 was tried first and refused, as described; it showed no number.
