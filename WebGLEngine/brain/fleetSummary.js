// WebGLEngine/brain/fleetSummary.js — v2255
//
// Turn the raw /ai/brain/fleet list into a training scoreboard: per-brain rows plus a pool total. Each brain
// already reports learn.attack = { steps, buffer, avgReward } (the primary policy trainer) inside its field
// POST; the bridge now retains it on the fleet entry. This is the pure shaping the fleet panel renders, kept
// out of the HTML so it can be tested without a DOM.

// the named policy trainers a brain runs; attack is the headline, the rest are the domain breakdown
const TRAINER_ORDER = ["attack", "aggro", "civdef", "civtarget", "packorder"];
function extractTrainers(learn) {
    if (!learn) return [];
    const seen = new Set(), out = [];
    const take = (name) => {
        const t = learn[name];
        if (t && typeof t === "object" && t.steps != null && !seen.has(name)) {
            seen.add(name);
            out.push({ name, steps: t.steps, buffer: t.buffer != null ? t.buffer : 0, avgReward: t.avgReward != null ? t.avgReward : null });
        }
    };
    for (const name of TRAINER_ORDER) take(name);                     // stable, known order first
    for (const k of Object.keys(learn)) if (k !== "domains") take(k); // future trainers, minus the domainStats aggregate
    return out;
}

export function fleetTrainingSummary(brains, nowMs = Date.now()) {
    const rows = (brains || []).map((b) => {
        const at = b && b.learn && b.learn.attack ? b.learn.attack : null;
        const steps = at && at.steps != null ? at.steps : 0;
        const buffer = at && at.buffer != null ? at.buffer : 0;
        const avgReward = at && at.avgReward != null ? at.avgReward : null;
        const ageMs = b.ageMs != null ? b.ageMs : (b.lastSeen != null ? nowMs - b.lastSeen : null);
        const solveMs = b.solveMsEwma != null ? b.solveMsEwma : (b.lastSolveMs != null ? b.lastSolveMs : null);
        const trainers = extractTrainers(b.learn);
        return {
            id: b.id, gpu: b.gpu || "?", role: b.role || "all",
            ageMs, solveMs, steps, buffer, avgReward,
            trainers,                                   // full per-domain breakdown (attack first, then aggro/civdef/civtarget/packorder)
            domains: trainers.filter((t) => t.name !== "attack"),   // just the sub-policies, for the card breakdown
            training: steps > 0 || buffer > 0,          // it has attack experience -> it is learning
            live: ageMs == null || ageMs < 15000,       // reporting recently
        };
    });
    const training = rows.filter((r) => r.training);
    const totalSteps = rows.reduce((s, r) => s + r.steps, 0);
    const totalBuffer = rows.reduce((s, r) => s + r.buffer, 0);
    const rewarded = rows.filter((r) => r.avgReward != null);
    const meanReward = rewarded.length ? Math.round((rewarded.reduce((s, r) => s + r.avgReward, 0) / rewarded.length) * 1000) / 1000 : null;
    // fastest-first, then most-trained: the pool leaders float to the top
    rows.sort((a, b) => (a.solveMs ?? 1e9) - (b.solveMs ?? 1e9) || b.steps - a.steps);
    return { count: rows.length, training: training.length, totalSteps, totalBuffer, meanReward, rows };
}

if (typeof module !== "undefined" && module.exports) module.exports = { fleetTrainingSummary };
