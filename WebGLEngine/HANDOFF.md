# SweK Engine -- handoff

Written at the end of a very long session. BACKLOG.md carries the reasoning for every round in order and is the
real record; this file is only the things that are *open*, which nothing else states in one place.

## State

*** THIS SECTION USED TO DECLARE NUMBERS AND EVERY ONE OF THEM HAD GONE WRONG. *** At v3527 it still read
"Engine v3034", "79 checks", "482 gates", "27 devices" -- against a tree at v3527 with 77 checks, 862 gates and
63 devices. 493 versions of drift, not through carelessness but through being a SECOND DECLARATION of something
the tree already knows. That is the same failure this lab keeps finding in its own instruments: promptCost's
device count, case-study's gate count, gateReach's population pin.

So the numbers are no longer written here. Read them:

```
node tools/ship/shipRitual.mjs      # version, brain build, gate count, and the ship steps in order
node tools/ship/nextRounds.mjs      # what is open, and what is blocking each item
node tools/render-qa/deviceOwed.mjs # which pages owe a measurement from real hardware
```

What is worth stating, because it is a RULE rather than a count: the full suite takes minutes;
`node tools/ship/selfchecks.mjs --affected <file>` runs only the gates a change can reach and is a PRE-FILTER,
never a ship. And `tools/ship/verify.mjs` REFUSES to run without `--version` -- that refusal is deliberate, since
a gate cannot check a claim it has not been told, and running it bare reports a failure that looks like a broken
tree and is not one.

## Open, from Keith's rig run at v3023 -- the highest-value list here

Everything below FAILED on real Windows hardware. Three were fixed at v3033/v3034; these were not:

- **caseStudy** -- page bakes 487 gates against the live count. Derived-fact class; `staleness.mjs` already
  checks six of these and this is a seventh instance, not a new kind.
- **roundhouseDevices / deviceBridge** -- hardcoded 27-device expectations. `labDevices` had the identical shape
  and was converted to a FLOOR at v2999 (`>= 27`, "the registry has not shrunk"). Same fix applies.
- **freshMachine** -- `/sync/status` now reports **TIMED OUT after 4000ms** rather than a bare `HTTP 0`. v3003's
  instrumentation worked; the answer is a timeout, not a refusal. `/sync/status` calls `listModels(root)` which
  WALKS THE ASSET TREE -- a slow walk on a cold Windows filesystem is the leading candidate.
- **mesherFlag** -- `pickMesher` fallthrough no longer returns the page's own builder.
- **zeroRangeSweep** -- the "re-finds the known zero" check prints "exactly 0 at nowhere"; a message/logic bug.
- **corroborateFully** -- RED BY DESIGN. The battery rejected `deltaBest` on the criterion it was registered
  against, and caught `rayleighFactor` as quantised. Working as intended; do not "fix" it.
- **range** -- 52/52 pass, then a libuv assertion on exit. Node 24 on Windows teardown, not a logic failure.
- **libmSensitivity / responseCensus / labDevices** -- 180s timeouts on the rig runner.

## The tolerance production line -- 4 of 38

`tools/ship/floors.mjs`. Scaffolding is paid for; a conversion is now ONE ENTRY (a spec + a line in
`FINDINGS_V3032`). Counts are DERIVED -- done is the registry's length, total is read from `physicsSuite` -- so
nothing goes stale.

Findings so far, and the reason to continue: **gain spans 136x across four samples** (0.50x to 68x), and **one
of four cannot be summarised by a floor at all**. A tolerance's number says nothing about what it catches.

## Standing rules that cost the most to relearn

- **A control that cannot fail is decoration.** Sabotage every check.
- **Measure, do not trust the code.** Run the function; do not trust the sentence you just wrote about it.
- **Every tool needs a front door.** A CLI-only deliverable is unfinished. So is a module whose only consumer
  is its own gate -- SEVEN of those shipped this session before the census caught them.
- **Name the thing once.** Duplicated tables have cost this tree eight separate defects, including a bridge
  that was unreachable for 35 rounds because two declared `/bench`.
- **Read it instead of running it** for anything platform-specific. Three crashes shipped that a Linux sandbox
  structurally could not execute; all three are now guarded by STATIC checks.
- **Silence is not agreement.** Unknown is not false; a missing field is not "no"; a stale artefact is not a pass.

## What to be suspicious of in my work

Late in a long session I start inventing identifiers that do not exist (`readJsonSafe`, `PHONE`, a CSS class
`.brainCore` that styled nothing) and writing modules I forget to wire. Every one was caught by a gate. If a
round is going badly, that is the shape it takes.
