// milestones.js -- learning-milestone detection + narration. GPU Brain v7.
//
// Every EVAL_EVERY attack-train steps, the live nets are evaluated on a
// FIXED probe set. When a probe's argmax pick flips versus the previous
// evaluation, or the civ-defense hold radius drifts by 4+ units, that is
// a milestone: the policy has visibly changed its mind about a canonical
// situation. Milestones become one-line reports POSTed to the bridge's
// existing /sys/logs route, so they appear live in server.html's debug
// console next to the KPop listener chatter. With BRAIN_NARRATE=ollama
// the bridge's /ai/brain/narrate route (PATCH-B1d) rewrites the line as
// kaiju-documentary narration; the template line is always the fallback,
// so narration never depends on an LLM being up.
//
// The probes use a fixed synthetic attack triple (beam / projectile /
// aoe with representative range+damage). They measure the NETWORK's
// decision surface, not the game -- which is exactly what a milestone
// is: "the net now answers this canonical question differently."

import { buildAttackFeatures } from "./policy.js";
import { buildCivDefFeatures, CIVDEF_FEATURES } from "./policy.js";

const PROBE_ATTACKS = [
    { name: "beam-type",       family: "beam",       range: 42, damage: 0.06 },
    { name: "projectile-type", family: "projectile", range: 30, damage: 0.30 },
    { name: "aoe-type",        family: "aoe",        range: 16, damage: 0.12 },
];

const PROBES = [
    { label: "a lone target at long range (36u)", dist: 36, nGoals: 1 },
    { label: "a lone target up close (10u)",      dist: 10, nGoals: 1 },
    { label: "a packed crowd up close (12u)",     dist: 12, nGoals: 4 },
    { label: "a crowd at mid range (24u)",        dist: 24, nGoals: 3 },
];

export const EVAL_EVERY = 100;      // attack-train steps between evaluations

function goalsFor(c) {
    return Array.from({ length: c }, (_, i) => ({ x: 100 + i * 6, z: 100 + (i % 2) * 6 }));
}

// forward through the live deep-net layer arrays (CPU; 4 probes x 3 rows)
function fwdDeep(layers, x) {
    const L1 = layers[0], L2 = layers[1];
    let z2 = L2.b[0];
    for (let o = 0; o < L1.nOut; o++) {
        let z = L1.b[o];
        const off = o * L1.nIn;
        for (let i = 0; i < L1.nIn; i++) z += L1.W[off + i] * x[i];
        if (z > 0) z2 += L2.W[o] * z;
    }
    return 1 / (1 + Math.exp(-z2));
}

export class MilestoneWatcher {
    constructor() {
        this._lastPicks = null;       // probe label -> attack name
        this._lastHold = null;        // civdef hold radius (u)
        this._lastEvalStep = -1;
    }

    // Returns an array of milestone strings (usually empty).
    evaluate(atkLayers, civDefW, steps) {
        if (steps - this._lastEvalStep < EVAL_EVERY) return [];
        this._lastEvalStep = steps;
        const out = [];

        // attack probes
        if (atkLayers) {
            const picks = {};
            for (const pr of PROBES) {
                const goals = goalsFor(pr.nGoals);
                const k = { x: 100 - pr.dist, z: 100, tx: 100, tz: 100, energy: 0.9 };
                let best = null, bs = -1;
                for (const a of PROBE_ATTACKS) {
                    const s = fwdDeep(atkLayers, buildAttackFeatures(k, a, goals));
                    if (s > bs) { bs = s; best = a.name; }
                }
                picks[pr.label] = best;
            }
            if (this._lastPicks) {
                for (const pr of PROBES) {
                    const was = this._lastPicks[pr.label], now = picks[pr.label];
                    if (was && now && was !== now) {
                        out.push(`after ${steps} lessons, the kaiju now favor ${now} over ${was} against ${pr.label}`);
                    }
                }
            }
            this._lastPicks = picks;
        }

        // civ-defense hold radius: sweep distance at fixed threat/health;
        // the largest distance the gate still fires at
        if (civDefW && civDefW.length === CIVDEF_FEATURES) {
            let hold = 0;
            for (let d = 5; d <= 45; d += 1) {
                const x = buildCivDefFeatures(0.7, 0.8, 0.5, d);
                let z = 0;
                for (let i = 0; i < CIVDEF_FEATURES; i++) z += civDefW[i] * x[i];
                if (1 / (1 + Math.exp(-z)) > 0.5) hold = d;
            }
            if (this._lastHold != null && Math.abs(hold - this._lastHold) >= 4) {
                out.push(hold < this._lastHold
                    ? `the cities have tightened fire discipline: holding shots beyond ${hold}u (was ${this._lastHold}u)`
                    : `the cities have grown bolder: now firing out to ${hold}u (was ${this._lastHold}u)`);
            }
            this._lastHold = hold;
        }
        return out;
    }
}

// POST a milestone line to the bridge. Template always lands in
// /sys/logs; BRAIN_NARRATE=ollama asks the bridge to embellish first.
export async function reportMilestone(bridge, line, useOllama) {
    let text = line;
    if (useOllama) {
        try {
            const r = await fetch(bridge + "/ai/brain/narrate", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ line }),
            });
            const j = await r.json();
            if (j?.ok && j.text) text = j.text;
        } catch {}
    }
    try {
        await fetch(bridge + "/sys/logs", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ level: "log", msg: "[brain milestone] " + text, src: "brain" }),
        });
    } catch {}
    console.log("[brain] MILESTONE:", text);
}
