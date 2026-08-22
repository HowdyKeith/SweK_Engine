// brain/rl/watchdog.js -- do the GPU brains ever stop working? They don't crash randomly, but ES training has real
// failure modes, and this catches them: (1) NaN/Inf blowup -- too-hot a step can explode the weights; the elitist
// best already shields the LIVE policy, and the watchdog confirms the best stays finite; (2) STALL -- stuck in a
// local optimum, no improvement for a while; the watchdog re-centers exploration on the best-known params (a "kick")
// to escape; (3) it snapshots the last-good weights so a caller can always fall back to a policy that worked.
// Wrap a steppable trainer (idleTrainer) with this and step through check() to keep training healthy + recoverable.
"use strict";

function isFiniteVec(p) { for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) return false; return true; }
function scoreFromEv(ev) { return ev ? (ev.dockRate * 1000 - ev.avgDist - (ev.avgCrashes || 0) * 200) : -Infinity; }

function createWatchdog(trainer, opts = {}) {
    const patience = opts.patience || 8, minDelta = opts.minDelta || 0.5;
    let lastGood = trainer.best(), bestScore = scoreFromEv(trainer.bestEval()), sinceImprove = 0, reverts = 0, kicks = 0;
    // call once per training step; returns the health status + performs recovery when needed
    function check() {
        const params = trainer.best();
        if (!isFiniteVec(params)) { trainer.setParams(lastGood); reverts++; return { status: "reverted-nan", healthy: false, reverts }; }
        const sc = scoreFromEv(trainer.bestEval());
        if (sc > bestScore + minDelta) { bestScore = sc; lastGood = params.slice(); sinceImprove = 0; return { status: "improving", healthy: true, best: sc }; }
        sinceImprove++;
        if (sinceImprove >= patience) { sinceImprove = 0; kicks++; trainer.setParams(lastGood); return { status: "stalled-kicked", healthy: true, stalled: true, best: sc, kicks }; }
        return { status: "ok", healthy: true, best: sc };
    }
    return { check, snapshot: () => lastGood.slice(), stats: () => ({ reverts, kicks, bestScore }) };
}

export { createWatchdog, isFiniteVec };
if (typeof module !== "undefined" && module.exports) module.exports = { createWatchdog, isFiniteVec };
