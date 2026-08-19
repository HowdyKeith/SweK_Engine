// tools/render/renderCluster-selfcheck.mjs
//
// Run: node tools/render/renderCluster-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The distributed-render coordinator, checked to the bit. It plans a band for each peer, covering every row exactly once;
// with honest peers the assembled frame is identical to a solo render; and -- the point of the whole thing -- when one
// peer returns garbage, or returns nothing at all, the coordinator catches it by recomputing and comparing, recovers the
// band itself, and the final frame is STILL identical to solo. The sabotage makes the coordinator trust each peer's own
// self-reported checksum instead of recomputing the truth, and the faulty peer's garbage sails through, because a peer
// that lies about its pixels can also report a checksum that matches its lie -- only independent recomputation catches it.
import { renderWhole, frameSum, renderRegion } from "./render.js";
import { planWork, honestTransport, faultyTransport, renderCluster } from "./renderCluster.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const W = 80, H = 60;
const solo = renderWhole(W, H);
const identical = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

// ---- 1. THE WORK PLAN COVERS EVERY ROW EXACTLY ONCE -------------------------------------------------
{
    const covered = new Array(H).fill(0);
    for (const b of planWork(H, 8, 4)) for (let y = b.y0; y < b.y1; y++) covered[y]++;
    ok("!! the work plan covers every row of the frame exactly once -- no gaps, no overlaps", covered.every((c) => c === 1),
       "eight bands across four peers tile all " + H + " rows with each row assigned once -- the frame is partitioned cleanly before a single peer is contacted.");
}

// ---- 2. HONEST PEERS ASSEMBLE TO THE SOLO RENDER ---------------------------------------------------
{
    const r = renderCluster(W, H, 8, 4, honestTransport());
    ok("!! with honest peers the assembled frame is identical to a solo render", identical(r.frame, solo) && r.verified === 8 && r.recovered === 0,
       "all eight bands verify and stack into an image bit-for-bit equal to the solo render -- distribution with no loss when everyone is honest.");
}

// ---- 3. A FAULTY PEER IS CAUGHT AND THE FRAME RECOVERS ----------------------------------------------
{
    const r = renderCluster(W, H, 8, 4, faultyTransport(2));
    ok("!! a peer returning garbage is caught by recomputation and the frame still comes out correct", identical(r.frame, solo) && r.recovered > 0,
       "peer 2 returns corrupted pixels, the coordinator's recompute-and-compare rejects them and rebuilds those " + r.recovered + " bands, and the final frame is still identical to solo -- a dishonest peer cannot corrupt the result.");
}

// ---- 4. AN OFFLINE PEER IS HANDLED ------------------------------------------------------------------
{
    const r = renderCluster(W, H, 8, 4, honestTransport(1));
    ok("!! a peer that drops offline is recovered without corrupting the frame", identical(r.frame, solo) && r.recovered > 0,
       "peer 1 returns nothing at all; the coordinator recomputes its " + r.recovered + " bands locally and the frame is unaffected -- missing work is just work to redo, not a hole in the image.");
}

// ---- 5. THE VERIFICATION ACTUALLY DISCRIMINATES ----------------------------------------------------
{
    const truth = renderRegion(0, 20, W, 40, W, H); const truthSum = frameSum(truth);
    const honest = honestTransport().renderBand(0, 20, 40, W, H);
    const bad = faultyTransport(0).renderBand(0, 20, 40, W, H);
    ok("!! recompute-and-compare passes an honest band and fails a corrupted one", frameSum(honest.pixels) === truthSum && frameSum(bad.pixels) !== truthSum,
       "the honest band's checksum matches the locally recomputed truth and the corrupted band's does not -- the check is real, not a rubber stamp.");
}

// ---- 6. DETERMINISTIC ------------------------------------------------------------------------------
{
    const a = renderCluster(W, H, 8, 4, honestTransport()), b = renderCluster(W, H, 8, 4, honestTransport());
    ok("!! deterministic", identical(a.frame, b.frame) && a.verified === b.verified,
       "the same cluster render gives the same frame and the same verification report every run.");
}

console.log(fails ? "\nrenderCluster-selfcheck: " + fails + " FAILED" : "\nrenderCluster-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
