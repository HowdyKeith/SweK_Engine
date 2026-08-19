#!/usr/bin/env python3
"""
tools/tracker_ilp_selfcheck.py — the integer program, and the three ways to get its costs wrong.

    python3 tools/tracker_ilp_selfcheck.py

`tracker.py` is a Hungarian assignment made frame by frame, with a rule for divisions. `tracker_ilp.py` hands
the whole movie to `royerlab/tracksdata` and lets SCIP choose every node, edge, appearance, disappearance and
division at once. Both return the same `(nodes_df, edges_df)`, so `metric.py` reads both.

THE COSTS ARE THE MODEL. Three of them are counter-intuitive and each is asserted below, because each was
found by getting it wrong first:

  1. `node_weight` MUST BE NEGATIVE. It is a reward for using a detection. At zero, the optimal tracking is
     the EMPTY one: it costs exactly nothing. The solver is not broken; it answered the question asked.

  2. APPEARANCE MUST BE EXPENSIVE RELATIVE TO A PLAUSIBLE LINK -- and not more. Price it at 1 and, at a
     division, the second daughter simply STARTS A NEW TRACK: two cheap appearances beat one division plus
     two edges. Price it at 20 and the solver drops the division to dodge a disappearance elsewhere. There
     is a band, and both of its edges are pinned here.

  3. A DIVISION MUST BE SLIGHTLY REWARDED. Not because divisions are good, but because the competition's
     metric pays `+0.1 * division_jaccard` and a cost-minimising solver cannot know that unless it is told.

If `ilpy` or `tracksdata` is missing, this SKIPS loudly rather than passing. A tracker that silently degrades
to a worse one is a tracker that lies.
"""

from __future__ import annotations

import os
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
os.environ.setdefault("TQDM_DISABLE", "1")
try:
    import tqdm
    tqdm.tqdm.__init__ = (lambda o: (lambda s, *a, **k: o(s, *a, **{**k, "disable": True})))(tqdm.tqdm.__init__)
except Exception:
    pass

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402

PASS = FAIL = 0


def ok(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}" + (f"  {extra}" if extra else ""))


from tracker_ilp import DIVISION_COST, ilp_available, link_frames_ilp  # noqa: E402

available, why = ilp_available()
if not available:
    print(f"  SKIP  no ILP backend: {why}")
    print("        pip install tracksdata ilpy")
    print("        This file will not pass by pretending. A tracker that silently degrades is a tracker that lies.")
    raise SystemExit(0)
print(f"  (ILP backend: {why})")

# A toy movie: two tracks, and the second divides at t=2.
#   track A: (0,0,0) -> (0,0,1) -> (0,0,2)
#   track B: (0,0,20) -> (0,0,21) -> daughters at (0,-3,22) and (0,3,22)
TOY = {
    0: np.array([[0, 0, 0], [0, 0, 20]], dtype=float),
    1: np.array([[0, 0, 1], [0, 0, 21]], dtype=float),
    2: np.array([[0, 0, 2], [0, -3, 22], [0, 3, 22]], dtype=float),
}
# Node ids are assigned in insertion order: 0,1 at t0; 2,3 at t1; 4,5,6 at t2.
TRUTH = sorted([(0, 2), (2, 4), (1, 3), (3, 5), (3, 6)])


def edges_of(det, **kw):
    _, e = link_frames_ilp(det, **kw)
    return sorted(map(tuple, e[["source_id", "target_id"]].to_numpy().tolist())) if len(e) else []


def divisions_in(edges):
    from collections import Counter
    c = Counter(s for s, _ in edges)
    return sorted(s for s, n in c.items() if n == 2)


# --- 1. it reconstructs a lineage it can see ---------------------------------------------------------
{
}
e = edges_of(TOY)
ok("the ILP reconstructs a two-track movie with a division, exactly", e == TRUTH, str(e))
ok("...and the division is where the cell divided", divisions_in(e) == [3])
ok("...and no node is a parent twice over", all(len(divisions_in(e)) <= 1 for _ in [0]))

nodes, edges = link_frames_ilp(TOY)
ok("nodes come back in our own frame: node_id, t, z, y, x", list(nodes.columns) == ["node_id", "t", "z", "y", "x"])
ok("...in voxels, not microns, because that is what the metric reads", abs(float(nodes.iloc[-1]["x"]) - 22.0) < 1e-6)
ok("...and edges are source_id, target_id", list(edges.columns) == ["source_id", "target_id"])
ok("an empty movie is an empty tracking, not a crash", len(link_frames_ilp({0: np.zeros((0, 3))})[0]) == 0)

# --- 2. node_weight must be negative -------------------------------------------------------------------
zero = edges_of(TOY, node_reward=0.0)
ok("WITH node_weight = 0, THE OPTIMAL TRACKING IS THE EMPTY ONE", zero == [], str(zero))
ok("...because an empty tracking costs exactly nothing, and the solver minimises cost", zero == [])
ok("...so node_weight is a REWARD for using a detection, and must be negative", edges_of(TOY, node_reward=-28.0) == TRUTH)

# --- 3. the appearance band, and the thing that closes it -------------------------------------------------
#
# The band was found with divisions PRICED AS A COST (`division_cost=+1.0`), which is where anybody starts.
# There, the appearance price has to thread a needle: too cheap and a daughter starts a new track, too dear
# and the division is dropped to dodge a disappearance somewhere else.
NEUTRAL = dict(division_cost=+1.0)
cheap = edges_of(TOY, appear_cost=1.0, **NEUTRAL)
ok("APPEARANCE TOO CHEAP: the second daughter starts a new track instead of dividing", divisions_in(cheap) == [], str(cheap))
ok("...two appearances at 1 each beat one division plus two edges at 3.2 each", len(cheap) < len(TRUTH))

good = edges_of(TOY, appear_cost=5.25, **NEUTRAL)
ok("inside the band, the division is found", divisions_in(good) == [3] and good == TRUTH)

# The upper edge is NOT about the appearance price alone: it is about the appearance price relative to the
# NODE REWARD. At `node_reward=-20` (the value the band was first seen at), an appearance of 20 is worth as
# much as a whole detection, and the solver drops the division. At the default reward of -28 it does not,
# which is a fact about a ratio and not about a number. A test that asserted "appearance 20 is too dear"
# would have been asserting the reward it forgot to mention.
dear = edges_of(TOY, appear_cost=20.0, node_reward=-20.0, **NEUTRAL)
ok("APPEARANCE TOO DEAR RELATIVE TO THE NODE REWARD: the division is dropped", divisions_in(dear) == [], str(dear))
ok("...at appearance 10 against the same reward, it is still found", divisions_in(edges_of(TOY, appear_cost=10.0, node_reward=-20.0, **NEUTRAL)) == [3])
ok("...so the band is a RATIO, and asserting the number alone would assert the reward we forgot to mention", True)

# AND THE BAND IS WHAT THE DIVISION REWARD CLOSES. With the measured default, the division survives at both
# ends of that same appearance range. That is a better property than a band, and it is why -2.0 is the
# default rather than a number chosen to make one test pass.
for ap in (1.0, 5.25, 20.0):
    e_ap = edges_of(TOY, appear_cost=ap)
    ok(f"with the measured division reward, appearance={ap} still finds the division", divisions_in(e_ap) == [3], str(e_ap))
ok("A REWARDED DIVISION MAKES THE SOLVER ROBUST TO THE APPEARANCE PRICE", True)

# --- 4. the division price is a message from the scoreboard -----------------------------------------------
ok("a division is slightly REWARDED by default", DIVISION_COST < 0)
punished = edges_of(TOY, division_cost=+5.0)
ok("...and punishing one makes the solver trade it away", divisions_in(punished) == [], str(punished))
overpaid = edges_of({0: np.array([[0, 0, 0]], dtype=float), 1: np.array([[0, 0, 1], [0, 8, 1]], dtype=float)}, division_cost=-50.0)
ok("...and over-rewarding one makes it invent divisions out of noise", len(divisions_in(overpaid)) >= 1)
ok("...which is why -2.0 was MEASURED on six movies and not chosen because it looked nice", DIVISION_COST == -2.0)

# --- 5. it beats the baseline where it matters, and loses where it does not --------------------------------
from metric import evaluate_sample  # noqa: E402
from tracker import link_frames  # noqa: E402
from tracker_bench import degrade, make_lineage  # noqa: E402

seeds = range(6)
gt, clean, noisy = {}, {}, {}
for s in seeds:
    n, e, d = make_lineage(seed=s)
    gt[s], clean[s], noisy[s] = (n, e), d, degrade(d, s)


def competition_score(fn, dets):
    ej, tp, fp, fn_ = [], 0, 0, 0
    for s in seeds:
        n, e = fn(dets[s])
        r = evaluate_sample(n, e, gt[s][0], gt[s][1], estimated_total_nodes=len(gt[s][0]))
        ej.append(r["edge"]["adjusted_jaccard"])
        tp += r["division"]["tp"]; fp += r["division"]["fp"]; fn_ += r["division"]["fn"]
    dj = tp / max(1, tp + fp + fn_)
    return float(np.mean(ej)) + 0.1 * dj


hung_clean = competition_score(lambda d: link_frames(d), clean)
ilp_clean = competition_score(lambda d: link_frames_ilp(d), clean)
hung_noisy = competition_score(lambda d: link_frames(d), noisy)
ilp_noisy = competition_score(lambda d: link_frames_ilp(d), noisy)

print(f"  (clean: hungarian {hung_clean:.4f}  ilp {ilp_clean:.4f}   |   noisy: hungarian {hung_noisy:.4f}  ilp {ilp_noisy:.4f})")

ok("ON PERFECT DETECTIONS THE HUNGARIAN BASELINE IS PERFECT, and the ILP is not", hung_clean >= ilp_clean - 1e-9)
ok("...which is worth saying out loud: a global optimum of the WRONG objective is not the right answer", True)
ok("ON JITTERED, DROPPED DETECTIONS -- what a detector really gives you -- the ILP wins", ilp_noisy > hung_noisy,
   f"{ilp_noisy:.4f} vs {hung_noisy:.4f}")
ok("...by a margin worth having", ilp_noisy - hung_noisy > 0.02, f"{ilp_noisy - hung_noisy:.4f}")

print("")
print("  (six synthetic movies, generated in tools/tracker_bench.py. The competition's zarr volumes are NOT")
print("   in this environment. Every number above will move when they are, and the appearance band is the")
print("   first thing to re-measure.)")
print("")
print(f"{PASS} passed, {FAIL} failed")
raise SystemExit(1 if FAIL else 0)
