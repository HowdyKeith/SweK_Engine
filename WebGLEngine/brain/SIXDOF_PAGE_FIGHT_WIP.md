# The 6-DOF page's own fight, measured -- registered before any code (WIP note, UNNUMBERED)

Keith chose this on 2026-11-02 ("Do 1, then 2"). It is the first of the rounds suggested after the GPU Brain's pilot went on
the page. This note belongs to the chat that wrote it, and it touches no file another chat owns.

> **In the fight `es-box3d-6dof.html` actually shows -- three ships a side, fleet target assignment, collisions with ram
> damage, a staggered first shot -- how do the five pilots on its Load Pilots panel rank, and do the duel's verdicts
> carry over?**

## Why it is a question

Every trained pilot was trained and measured in `brain/pilot6dofPolicy.mjs`'s `duel()`: one ship a side, collisions off.
The close-quarters pilot was also trained with collisions on and in joust starts. The page fights three a side, with
collisions and ram damage on. No pilot has been measured in that fight, and the GPU Brain's page round said so.

## The pilots (the page's own choices, held to their files' hashes)

- `scripted`: the PD autopilot (`brain/autopilot6dof.mjs` with the page's `PAGE_AUTOPILOT`);
- `shipped`: the fruit fly's Default, 215e26d9;
- `league`: the fruit fly's League pilot, 32789ff9;
- `close`: the fruit fly's close-quarters pilot, 360580a7;
- `gpu`: the GPU Brain's pilot, 0ffd8554.

The hand, zero and noise choices are not pilots anyone trained, so they are left out.

## The fight

- **The page's own,** through `window.__sixdof.runBattles()`: the battle the page draws, stepped without drawing.
  - The spawns come from the battle seed, and the clock is simulated.
  - The page's limit is 900 ticks (30 s). After it, the fleet with more hull left wins; equal hull is a draw.
  - Both fleets dead is a draw.
- **Every pair is played from both sides** on the same seeds, because side A steps first in a tick.
- **Fresh battle seeds 80001-80100** (100 of them).
  - The page's gate flies 1-120 and v4895's balance measurement flew 1-300. Nothing has flown 80001-80100.
  - A pairing is 200 battles; 10 pairings are 2,000.
  - Each pilot is also flown against itself on the same 100 seeds (500 battles, reported only).

## The rule a pairing is read by

- **Decisive battles** are the wins and losses, by the page's own winner (a timeout's winner included). Draws are left
  out.
- **An exact two-sided sign test** on the decisive battles:
  - "X better" if X won more and p < 0.01;
  - "Y better" if Y won more and p < 0.01;
  - otherwise "no difference shown".
- **Why not the duel's floor (a lead of 8):** it was chosen for 80 games and is not a test. Here a pairing is 200
  battles and there are 10 pairings, so a real test at a strict level is affordable. Ten pairings at 0.01 expect 0.1
  false readings.
- **Reported beside it, testing nothing:** wins minus losses (LEAD) and the duel's floor reading of it.

## The hypotheses

- **H1, the duel's head-to-head carries over:** the fruit fly's Default reads better than the GPU pilot.
- **H2, training beats the autopilot on the page:** each of the four trained pilots against the PD autopilot, read by
  the rule. That is four readings.
- **H3, the close-quarters pilot ranks first:** the only pilot trained with collisions on has strictly the highest total
  wins minus losses over its four pairings (800 battles).

## Controls

- **C-pilots:** before any battle, each choice on the page is the registered file (by its hash). Each brain's page
  pilot function, flown through the headless duel in the page's browser on two scratch duel seeds (99401, 99402), gives
  Node's fingerprints. If either fails, nothing is run.
- **C-determinism:** one pairing (`shipped` on side A against `gpu`) is run a second time on its 100 seeds. It must give
  the same battles: winner, ticks, and both fleets' hull, battle for battle.

## Reported, testing nothing

- The table of pairings: W/L/D from both sides, LEAD, and the sign test's p.
- Each pilot's totals.
- The mirrors: A wins, B wins and draws, which is the page's side advantage.
- Timeouts, and the median battle length.

## Predictions, fixed now, deciding nothing

- **P1: H1 is met** (70%). A 0-70 duel loss is a large gap; a three-a-side fight blurs it but should not reverse it.
- **P2: all four trained pilots beat the autopilot** (50%).
- **P3: H3 is met** (40%).
- **P4: under 10% of battles time out.**

## What was seen first

- **Timing only:** a probe on scratch battle seeds 990001-990010 (three matchups, ten battles each) returned nothing but
  the time, 42 to 75 ms a battle. No winner was returned or seen.
- Nothing of 80001-80100 has been flown.

## What each outcome buys

- The verdict is recorded, and the capability map's 6-DOF cells can cite it.
- A pilot that ranks well on the page is a candidate for the page's default. That is a separate decision, asked first.
- Nothing is retrained by this note.

## Cost

2,500 battles at about 60 ms, plus the controls: about three minutes in one browser.

## To be built

- `tools/ship/sixdofPageFight.mjs`, the library: the pilots, the seeds, the plan, the sign test, the readings and the
  verdict, and the browser script the command runs.
- `tools/ship/sixdofPageFightCmd.mjs`, the command. It refuses to overwrite its results file, runs in one browser,
  writes `brain/sixdofPageFightResults.json`, and prints only where the file is.
- `tools/ship/sixdofPageFight-selfcheck.mjs`, the gate:
  - the registration as code, and the sign test at known values;
  - a browser miniature on scratch battle seeds through the command's own script;
  - the command never overwriting and printing no score, held without ever starting the registered round (the GPU
    Brain round's incident is why).

## Built, 2026-11-02, before the registered run (nothing of the registration above is changed)

**What exists:**
- `tools/ship/sixdofPageFight.mjs` (the library), `tools/ship/sixdofPageFightCmd.mjs` (the command) and the gate
  `tools/ship/sixdofPageFight-selfcheck.mjs` (a browser, about 7 s, 27 rows).
- The page is untouched by this round: it is measured through `window.__sixdof.runBattles()`, which it already had.

**How the run is shaped.**
- **The controls come first, in one browser.** C-pilots needs every brain on the page to be the registered file, its
  team to have flown it, and the page's own pilot function to fly Node's fingerprints on duel seeds 99401-99402.
  Nothing is flown on a battle seed unless C-pilots holds.
- **Then the plan, in a second browser:** 25 matchups of 100 battles, and the determinism matchup again. The second
  browser's C-pilots is recorded too.
- **Raw battles go to the file.** The command writes `brain/sixdofPageFightResults.json` and prints only where it is.
  The readings are made by the library's `verdictOf()` from the committed file.

**The gate never executes the command, and never flies a registered seed.**
- The command's guards are held as the library functions they are, together with the order the command calls them
  in. So no single sabotage of a guard can start the registered round, as the GPU Brain round's gate once did.
- The miniature flies all five pilots on scratch battle seeds 990101-990102, and a probe flies 990301.

**Sabotaged with the byte-safe runner: 15 designs, each red by name** (the counts are in the gate's header). Two findings
came before the sabotages:
- **The gate's own reference was wrong.** Its BigInt reference for the sign test truncated every p under 1e-18 to
  zero, so the agreement row went red on a correct library. It now shifts n + 64 bits first.
- **Two sabotages would have gone 0 red.** C-pilots echoing the asked id, and a matchup echoing the plan's lineup, could
  not be told from a correct reading by a page that flies what it is asked. A probe that asks for a choice the page does
  not hold was added before they were run, and they went 1 red each.

**Seen after the registration was committed, and said here:** the gate's first run printed its first matchup's two
scratch battles, seeds 990101 and 990102, the PD autopilot on side A against the Default on side B. The Default won
both. They are scratch seeds and decide nothing. The gate now prints a count instead of rows.

**The registered run:** `node tools/ship/sixdofPageFightCmd.mjs`.
