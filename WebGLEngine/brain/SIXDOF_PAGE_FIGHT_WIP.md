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

## The verdict, 2026-11-02 (read from the committed file, after it was committed)

The registered run wrote `brain/sixdofPageFightResults.json` at head 28664671. It was committed byte for byte at
37c14c8b before anyone read it. It flew the registered seeds and says so (`registeredSeeds: true`). Every number below
is re-derived from that file by the library's `verdictOf()` in section 6 of `tools/ship/sixdofPageFight-selfcheck.mjs`,
and a sample of its battles is flown again there.

**The controls held.**
- **C-pilots, in both browsers:** every brain on the page was its registered file, its team flew it, and the page's own
  pilot function flew Node's fingerprints on duel seeds 99401-99402.
- **C-determinism:** `shipped` on side A against `gpu`, flown again on its 100 seeds, gave the same battles, 100 of 100.
- **Every matchup's lineup was the pair asked for.** That is 25 matchups of 100 battles.

**Every pairing**, from both sides (200 battles), from x's point of view:

| pairing (x vs y) | x: W/L/D | LEAD | p | reading | timeouts |
|---|---|---|---|---|---|
| `scripted` vs `shipped` | W117/L83/D0 | +34 | 0.019 | no difference shown | 23 |
| `scripted` vs `league` | W155/L44/D1 | +111 | 1.1e-15 | scripted better | 41 |
| `scripted` vs `close` | W1/L199/D0 | -198 | 2.5e-58 | close better | 4 |
| `scripted` vs `gpu` | W107/L92/D1 | +15 | 0.32 | no difference shown | 15 |
| `shipped` vs `league` | W159/L41/D0 | +118 | 1.3e-17 | shipped better | 102 |
| `shipped` vs `close` | W27/L171/D2 | -144 | 8.6e-27 | close better | 10 |
| `shipped` vs `gpu` | W123/L76/D1 | +47 | 0.0011 | shipped better | 42 |
| `league` vs `close` | W26/L164/D10 | -138 | 1.1e-25 | close better | 19 |
| `league` vs `gpu` | W63/L137/D0 | -74 | 1.8e-7 | gpu better | 79 |
| `close` vs `gpu` | W196/L4/D0 | +192 | 8.2e-53 | close better | 6 |

**H1 is met: the duel's head-to-head carries over, much narrower.** On the page the fruit fly's Default beats the GPU
pilot W123/L76/D1 (p 0.0011). In the duel it was 70 to none.

**H2: only the close-quarters pilot beats the autopilot on the page.**
- `close` beats it: the autopilot won 1 of 200 (W1/L199/D0 from its side).
- `league` LOSES to it: the autopilot won W155/L44/D1.
- `shipped` and `gpu` show no difference. The autopilot leads both, by 34 (p 0.019) and by 15 (p 0.32). Beside the
  test, the duel's floor of 8 would have called both "scripted better".

**H3 is met: the close-quarters pilot ranks first, far ahead.** The totals over each pilot's 800 battles:

| pilot | W/L/D over its 800 | LEAD |
|---|---|---|
| `close` | W730/L58/D12 | +672 |
| `shipped` | W392/L405/D3 | -13 |
| `scripted` | W380/L418/D2 | -38 |
| `gpu` | W309/L489/D2 | -180 |
| `league` | W174/L615/D11 | -441 |

**Reported, testing nothing:**
- **The mirrors** (each pilot against itself on the same 100 seeds):

  | mirror | side A won | side B won | draws | timeouts |
  |---|---|---|---|---|
  | `scripted` | 47 | 53 | 0 | 0 |
  | `shipped` | 47 | 51 | 2 | 33 |
  | `league` | 41 | 47 | 12 | 42 |
  | `close` | 45 | 54 | 1 | 0 |
  | `gpu` | 46 | 53 | 1 | 15 |

  Side B won more in all five mirrors, 258 to 226 over the 500 (p 0.16 by the same sign test). The duel favours side A,
  and this does not show the page favouring either side.
- **The fights are long:** 431 of the 2,500 battles timed out (17.2%), and the median battle ran 561 ticks (18.7 s).
  The timeouts gather where neither side closes. The Default against the League pilot timed out in 102 of 200, while
  the close-quarters pilot's own mirror and the autopilot's timed out in none.

**The predictions:**
- **P1: right.** H1 is met; I gave that 70%.
- **P2: wrong.** One of the four trained pilots beats the autopilot on the page, not all four. One loses to it.
- **P3: right.** H3 is met; I gave that 40%.
- **P4: wrong.** 431 of 2,500 battles timed out, 17.2%, not under 10%.

**What this says, and what it does not.**
- **It says:** in the fight the page shows, the only pilot better than the PD autopilot is the one trained with
  collisions on and in the joust start, and it beats every other pilot by a wide margin.
  - The three pilots trained in the standoff duel, a shooting contest at 84 m with no collisions, carry little of their
    duel advantage over the autopilot into the page. The Default and the GPU pilot are level with it.
  - The League pilot is the page's worst. It is the pilot trained to beat the Default in the standoff duel (it beat it
    20-4 on its audit), and on the page it loses to everyone.
- **It does not say why.** A guess, named as one: the page's fights last 18.7 s at the median, with collisions and ram
  damage on and three-a-side targeting. The standoff pilots were trained on fights of a few seconds at long range and
  never practised closing; the close-quarters pilot was. The file does not record rams, so this is untested, and it
  would be a round of its own.
- **It does not test** the hand, zero or noise choices, and no pilot was retrained by this round.

**What follows.**
- The page's default lineup is both teams on the PD autopilot. The close-quarters pilot is the candidate for a page
  default: a separate decision, asked first.
- The capability map's 6-DOF cells cite this verdict.
- For the GPU Brain's league round (Round 2, next): this says a pilot trained in the duel may not carry its result to
  the page. Round 2 asks a duel question, as chosen. The page question for its champion would be a check of its own.

**The verdict, as code.** Section 6 of `tools/ship/sixdofPageFight-selfcheck.mjs` re-derives every reading above from the
committed file. It ties this section's tables and numbers to the file, and it flies a sample of 12 battles again in the
page's browser, which came back the file's to the last tick and hull point.
- **Sabotaged with the byte-safe runner: 11 designs, each red by name.** They edit the committed file, this note, the
  page or the library. The counts are in the gate's header.
- **Found by the registered run's own data:** section 6's first draft went red on a correct file.
  - Its legality rule said a battle timed out exactly when it ran 900 ticks. One battle (the Default's mirror, seed
    80084) is a kill landed on the 900th tick, which is not a timeout.
  - The rule is now the page's own: a timeout has both fleets alive and goes to the fleet with more hull; any other
    battle ends with a fleet at zero hull. All 2,500 battles are legal by it. The miniature had the same latent bug.
  - No reading changes: the readings use the winner alone.

## The page default (Keith asked, 2026-11-02; written before its code)

Keith: "Make the close-quarters pilot the page default." The verdict above named it the candidate and said to ask first,
and he did.

**What changes.**
- **The default.** On `es-box3d-6dof.html`, "default for this team" becomes the fruit fly's close-quarters pilot
  (360580a7), for both teams. That is the close-quarters pilot's own mirror, which in this round's run was decided in
  99 of 100 battles and never timed out.
- **The roster.** `brain/pilotRoster.mjs` gains `ctx.defaultChoice`: a page may name its own default pilot, used once
  the page holds it.
  - Until its file has loaded, and if it never does, the default is the PD autopilot as before, and the pilot line says
    why.
  - A page that names none (`es-box3d-fly3d.html`, `es-aircraft.html`, `es-flight6dof.html`) is unchanged.
- **The panel.** The select's default entry names what it flies. "Default pilots" puts both teams back on it, and a
  choice saved in the browser is kept.
- **The words.** The page's description and the Load Pilots tooltip say so, and `page-index.json` is rebuilt from the
  description.

**How it is checked.**
- **`brain/pilotRoster-selfcheck.mjs`:** `defaultChoice` is honoured only when the page holds it, and the old rule holds
  otherwise and on every page that names none.
- **`brain/pilot6dofPolicy-selfcheck.mjs` section 5 (the page):** the default-lineup row becomes this. Once the
  close-quarters file has loaded, both teams on "default for this team" fly it, on the very weights the file carries,
  and the roster note names it.
- **`tools/ship/rigidBody6dofPage-selfcheck.mjs`** keeps measuring what it always measured, the page's physics and
  balance under the PD autopilot, by choosing it explicitly. A row says so.
- **Each new row is sabotaged** with the byte-safe runner, red by name.

**Not claimed:** nothing new is measured. The default is chosen on this round's numbers.
