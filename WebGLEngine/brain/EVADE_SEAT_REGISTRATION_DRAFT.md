# The evade seat: DRAFT registration (2026-11-22; UNNUMBERED)

**STATUS: KEITH'S ANSWERS TAKEN (2026-11-22, below); STILL NOTHING FLOWN AND NO SEED USED.** It is registered when the reflex and the study tool are built and this text,
as it then stands, is committed as the tool's header -- before any pair is flown. Once approved (with
whatever he changes), this text becomes the header of `tools/ship/takeEvadeSeat.mjs`, committed before any pair is flown, as `tools/ship/takeLc11Gunner.mjs`'s was.
Backlog: `brain/BACKLOG_2026-11-04_BRAINS.md`, `evade-seat-loom-circuits`. Keith: "start with the LC4/LPLC2 data pull and a draft registration".

## The circuits (data: pulled, baked and pinned; see `vendor/male-cns/PROVENANCE.md` and `brain/maleCnsCircuits-selfcheck.mjs` sections 8-12)

Four looming pathways off male-cns v1.0, each chosen by LC11's rule, stated before anything flew on any of them: **the descending neuron taking the most of the type's output,
directly and through one relay; the relays, the central-brain types taking at least 2,000 synapses from the type and giving at least 400 to that neuron.**

| circuit | file | cells | the rule's descending neuron | relay |
|---|---|---|---|---|
| LC6 (dark looming) | `lc6-loom-circuit.json` | 124 LC6, 4 PVLP151, 2 DNp103 | DNp103 | PVLP151 |
| LC16 (dark looming) | `lc16-loom-circuit.json` | 182 LC16, 2 pIP1 | pIP1 | none |
| LC4 (looming speed; a Giant Fiber input) | `lc4-loom-circuit.json` | 126 LC4, 2 DNp04 | DNp04 (11,597 direct; DNp01 6,362 + 4,816 through relays) | none (PVLP024 takes 6,850 from LC4 but gives DNp04 152) |
| LPLC2 (looming size; a Giant Fiber input) | `lplc2-loom-circuit.json` | 185 LPLC2, 4 PVLP151, 2 DNp01 | **DNp01, the Giant Fiber, BY 65 SYNAPSES** (4,862 + 2,393 = 7,255 against DNp103's 5,065 + 2,125 = 7,190) | PVLP151 (6,771 in, 603 out) |

Said plainly: the rule gives LC4 **DNp04**, not the Giant Fiber, and gives LPLC2 the Giant Fiber only narrowly. LC4 also feeds the Giant Fiber heavily (6,362 synapses), but
the rule takes one descending neuron per type. LC4 and LPLC2 are visual projection types, so neither counts as the other's relay (each feeds the other's descending
neuron: LPLC2 gives DNp04 2,552; LC4 gives DNp01 6,362). The loom bench (`tools/ship/takeLoomBench.mjs`, read once) found that LC6 and LC16 both tell which side a loom is on,
from its own side; LC4 and LPLC2 have not been on the bench. Across their sheets: LC4 feeds DNp04 with NO gradient (+0.14 / -0.04: every cell
feeds it); LPLC2 feeds the Giant Fiber a little more from the sheet's lateral end (-0.33 / -0.30), PVLP151 more so (-0.41 / -0.40); and PVLP151's synapses onto the Giant
Fiber mostly cross the midline (582 of 603). **A consequence for the reflex, said before anything flies:** LC4's read-out cannot depend on where along its sheet a loom falls,
only on which eye sees it -- so `lc4:medial`, `lc4:lateral` and `lc4:flat` may fly alike.

## The reflex (HAND-SET, NOT THE FLY'S; still to be built)

* **THE THREAT.** Each tick, the enemy ship (not a fighter, not a shot) with the shortest **time to contact**, range over closing speed, among those closing. A threat
  exists only while that time is under **tau0 = 4 s** and the ship is within **1,500 m**. With no threat the reflex does nothing.
* **THE TURN.** The threat's bearing in the hull's horizontal plane drives one eye's cells at their places, and the circuit runs as `brain/flyTracking.mjs pathwayOf` runs
  LC10a and LC11: the connectome's own signed weights, three steps, a constant drive on the descending neuron, sigma and overlap as LC10a's. The read-out is the
  descending neuron's **right less left, odd in the bearing, over its own peak**. Its **sense** is set once per circuit, before any pair: the way round that turns the hull
  **AWAY** from a threat at a quarter turn (a threat on the left turns the hull right), as `LC11_SENSE` was set for LC11.
* **THE HELM.** The reflex's turn is added to today's best-ship helm (the split helm with the cannon: the sine twin, as in `tools/ship/takeCarTodayRations.mjs`) as a yaw
  correction of up to the hull's torque fraction, scaled by the read-out (`tanh(2 S)`). Pitch, thrust, the gun and everything else are as they are.
* **ORIENTATION.** Which end of each sheet is the front of the visual field is not in the data, so each circuit is flown both ways: `medial` and `lateral`, as for LC10a and LC11.

## TWO STAGES (Keith, 2026-11-22: "Screen first")

**STAGE 1, THE ACTION SCREEN.** Which evasive action helps at all, with no circuit in it. Five arms, each against the plain side:
* `none` -- today's helm, no reflex.
* `turn` -- turn AWAY: a yaw correction of `tanh(2 S)` of the torque fraction, S the sine of the threat's bearing (left threat, right turn).
* `burst` -- a SPEED BURST: the pods' thrust to full while there is a threat.
* `climb` -- CLIMB OR DIVE: a pitch correction of the full torque fraction, away from the threat's elevation (down if it is above the hull's plane, up if it is level or below).
* `jink` -- a JINK: a yaw correction of the full torque fraction, its sign alternating every 0.5 s while the threat lasts, the first swing away from the threat.

Seeds: one ship a side 1681001-, fleets of three 1691001-; 300 pairs a fight, 75 of each kind; none flown by anything. **The action is chosen by this rule, written now:**
the action whose arm LEADS `none` (z >= 2) in at least one fight and TRAILS it (z <= -2) in none; if several, the larger mean lead over the two fights; **if none does,
stage 2 flies `turn`** (the drafted reflex), and says so -- the circuit question stands whatever the screen finds.

**STAGE 2, THE CIRCUITS,** on the action stage 1 chose: the ten arms below. How a circuit drives each action, fixed now:
* `turn` -- the circuit's read-out S (odd, over its own peak) in place of the sine.
* `jink` -- the sign of S sets the first swing (away); the swings are full, as in stage 1.
* `burst`, `climb` -- the side does not matter to these, so the circuit's EVEN read-out (its two descending neurons' activity together, over its own peak) scales the
  action: full at the circuit's strongest response, nothing where the circuit does not respond.

## The fights

* (Stage 2.) **ONE SHIP A SIDE** (seeds 1661001-; the helm alone decides where the hull points) and **FLEETS OF THREE A SIDE** (seeds 1671001-). 300 pairs a fight, 75 of each of the duel's
  four kinds. **None of these seeds has been flown by anything.**
* Side X flies today's best-ship helm with the arm's reflex; side Y is plain. The cannon is on on both sides.

## The arms

* **THE CIRCUITS, both orientations (8):** `lc6:medial`, `lc6:lateral`, `lc16:medial`, `lc16:lateral`, `lc4:medial`, `lc4:lateral`, `lplc2:medial`, `lplc2:lateral`.
* **THE BASELINES (2):** `none` (today's helm, no reflex: the bar to beat), and `sine` (the same reflex, its turn the sine of the bearing, no circuit).
* **THE CONTROLS, staged (2 per circuit, flown only where they are needed):** `<type>:flat` (no places) and `<type>:shuffled:4242` (connections shuffled within each type).
  They are flown, after the first stage is read, for the circuits whose better orientation beat `none`; for none at all if none did.

That is 10 arms x 2 fights x 300 pairs in the first stage, plus up to 8 controls x 2 fights x 300 pairs in the second.

## What is decided

* Readings in each fight: every arm against the plain side, and pair by pair **each arm less `none`**, each a mean with a word at |z| >= 2.
* **AN EVADE REFLEX SHIPS** if some circuit-and-orientation **leads `none` (z >= 2) in at least one fight and trails it (z <= -2) in none**. If several do, the one with the larger
  mean lead over the two fights. The best-ship and fleet buttons then fly that reflex. **Otherwise nothing ships** and the reading goes in the fly-wired helm's note.
* **For the record only**, no page change:
  * **The dark-looming cells against the Giant Fiber inputs:** the better of LC6 and LC16 (by mean lead over `none`) less the better of LC4 and LPLC2, pair by pair, in each fight.
  * For a circuit that shipped: its **places** credited if it leads its `flat` control somewhere and trails it nowhere; its **wiring** the same against `shuffled:4242`; and
    whether it can be told from `sine`.

## Forecast, for the record

No circuit can be told from `none` in fleets of three. One ship a side, where the reflex has the most say, any circuit that tells the side will look like `sine`, because
in this model the reflex reads the bearing and nothing else. The forecast is that the dark-looming cells cannot be told from the Giant Fiber inputs. Every fly-wired seat
so far has tied the sine; LC11 trailed LC10a one ship a side.

## Keith's answers (2026-11-22)

1. Separate runs for turning away, a speed burst, a climb and a jink: **yes, as the stage-1 screen** above, the circuits flown on the action it picks.
2. tau0 4 s and 1,500 m: **as drafted.**
3. **Ten arms** in the circuit stage.
4. LC4's descending neuron: **DNp04, the rule's**, chosen now -- before any fight is flown, so no result can bend it.

## The questions as asked (kept for the record)

1. **Is "turn away" the reflex you want?** The alternatives are a speed burst, a climb or dive, or a jink: a short turn either way. Only the turn has a model here so far.
2. **tau0 (4 s) and the 1,500 m reach**: hand-set. A shorter tau0 makes the reflex rarer and later.
3. **The arms:** 10 in the first stage is days on the rig. A smaller first stage would be one orientation per circuit, chosen by which end the loom bench or the sheet's
   gradient points at; that saves 4 arms but adds a choice before flying.
4. **LC4's descending neuron:** keep the rule's answer (DNp04), or read the Giant Fiber (DNp01) for both LC4 and LPLC2, since it is the escape neuron? The rule says DNp04;
   changing it is a choice made after seeing the numbers, and would be recorded as one.

## What must be built before anything flies (none of it is built yet)

* ~~The four pathways baked and their positions pinned~~ -- DONE 2026-11-22 (`brain/lc4*.mjs`, `brain/lplc2*.mjs`; gate sections 10-12).
* `brain/evadeReflex.mjs`: the threat picker, the turn, the helm hook; `wiringOf`-style names for the arms; its gate (the sense, the read-outs pinned, the threat picker's rules).
* `tools/ship/takeEvadeSeat.mjs` (this text as its header; the single read; the kept arms) and its gate.
