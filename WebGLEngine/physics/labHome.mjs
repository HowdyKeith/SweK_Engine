// physics/labHome.mjs -- v4585
//
// THE PHYSICS LAB'S FRONT DOOR, AS DATA. lab-home.html is a plain landing page anyone can open: one Initiate button, a
// 2D live strip of what the engine is doing (which scene, which proposer, the adjudicator's verdicts as they land), the
// curated presets as buttons, and under each a plain line naming what the Physics AI pulls from -- the instrument, its
// key, and the device or peer that runs it. This module derives every one of those from the tree's own records, so the
// page holds no facts of its own and a gate can grade the derivation headless:
//
//   presetButtons(PRESETS, scenes)                         the curated presets as buttons, joined to the scene triage; a
//                                                          registered scene no preset names gets a button of its own,
//                                                          marked "from the registry", so the race is reachable
//   sourcesLine(sceneId, scenes, proposers, INSTRUMENTS,   "pulls from <instrument> (<gate>); key: <sentence>; runs on
//               routed)                                    <device or peer>" -- or, for a scene nothing is registered
//                                                          for, WHY (candidate: a key and no adjudicator; refused: reason)
//   doorLine(scenes, proposers)                            the sentence under Initiate: what pressing it runs first
//   liveStrip(runJson, sceneRow)                           the run's three columns: the scene, the proposer and what it
//                                                          proposed, the verdicts newest first; and the outcome
//   whereItRuns(sceneId, routed)                           the device or peer: the hub's own node process, and for the
//                                                          race the peers the routing ledger names (v4584)
//
// WHAT IS SAID PLAINLY: the proposer runs IN THE BRIDGE'S NODE PROCESS (ai-bridge/fingerprintBridge.js imports
// physics/proposers.mjs and calls runProposer in-process), so "the device that runs it" is this hub for every scene;
// the one scene whose work is routed elsewhere is the race, whose training episodes and lockstep ticks the v4584 ledger
// attributes to named peers -- and those peers are named here only when the ledger has rows, never assumed.
//
// Run: node tools/ship/labHome-selfcheck.mjs
"use strict";

/** The first sentence of a key or reason: up to the first ". " past 40 characters, the *** markers stripped. */
export function firstSentence(text, max = 220) {
    const t = String(text || "").replace(/\*\*\*/g, "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    const i = t.indexOf(". ", 40);
    const s = i > 0 && i < max ? t.slice(0, i + 1) : t.slice(0, max) + (t.length > max ? "..." : "");
    return s;
}

/** The scene row for an id, or null. */
export const sceneRow = (scenes, id) => (scenes || []).find((r) => r.scene === id) || null;

/**
 * The curated presets as buttons, each joined to its scene's triage row. Order: the presets in their curated order,
 * then every REGISTERED scene no preset names (the race, at v4527), so a scene the AI can actually work is never
 * unreachable from the door. A preset whose scene has no triage row is kept and says so.
 */
export function presetButtons(PRESETS, scenes) {
    const out = [], named = new Set();
    for (const p of PRESETS || []) {
        const row = sceneRow(scenes, p.scene); named.add(p.scene);
        out.push({ label: p.name, scene: p.scene, params: p.params || {}, preset: true, registered: !!(row && row.registered),
                   eligible: row ? row.eligible : "untriaged", knob: row ? row.knob : null });
    }
    for (const row of scenes || []) if (row.registered && !named.has(row.scene)) {
        named.add(row.scene);
        out.push({ label: row.scene + " (from the registry)", scene: row.scene, params: {}, preset: false, registered: true, eligible: row.eligible, knob: row.knob });
    }
    return out;
}

/** The device or peer that runs a scene's work: the hub's node process, plus the routed peers for the race. */
export function whereItRuns(sceneId, routed) {
    const hub = "this hub's node process (the bridge runs the proposer in-process)";
    if (sceneId !== "race") return { device: hub, peers: [], line: hub };
    const peers = ((routed && routed.summary && routed.summary.peers) || []).filter((p) => p.kinds && (p.kinds.race || p.kinds.train));
    if (!peers.length) return { device: hub, peers: [], line: hub + "; no training or race ticks routed yet (POST /ai/brain/route fills the ledger)" };
    const names = peers.map((p) => `${p.id} (${p.gpu || "?"}, ${(p.kinds.train || 0)} training, ${(p.kinds.race || 0)} race)`);
    const last = peers[0].last && (peers[0].last.what || peers[0].last.line);
    return { device: hub, peers: peers.map((p) => p.id), line: hub + "; the race's training and lockstep ticks routed to " + names.join(", ") + (last ? "; last: " + last : "") };
}

/**
 * The plain line under a preset naming what the Physics AI pulls from. Registered: the instrument (by id, from
 * physics/instruments.mjs, with its gate), the key's first sentence, and where it runs. Not registered: the reason,
 * in the triage's own words, so the door never implies an adjudicator that was not written.
 */
export function sourcesLine(sceneId, scenes, proposers, INSTRUMENTS, routed = null) {
    const row = sceneRow(scenes, sceneId);
    if (!row) return { registered: false, text: "no triage row for this scene: the Physics AI has not assessed it" };
    if (!row.registered) {
        const why = row.eligible === "candidate"
            ? "an independent key exists but no adjudicator has been written, so nothing runs"
            : "refused: " + firstSentence(row.reason || row.key || "no independent measurable a knob search could be right or wrong about");
        return { registered: false, eligible: row.eligible, knob: row.knob, text: `knob ${row.knob}; ${why}` };
    }
    const props = (proposers || []).filter((p) => row.proposerIds.includes(p.id));
    const inst = (INSTRUMENTS || []).find((i) => i.id === row.instrument) || null;
    const where = whereItRuns(sceneId, routed);
    const instText = inst ? `${inst.id} (${inst.gate || "no gate"})` : `${row.instrument || "unnamed"} (not in the instrument registry)`;
    const key = firstSentence(row.key || (inst && inst.key) || "");
    return {
        registered: true, eligible: row.eligible, knob: row.knob, instrument: inst ? inst.id : row.instrument || null, gate: inst ? inst.gate : null,
        proposers: props.map((p) => p.id), tier: props.length ? props[0].tier : null, key, where,
        text: `pulls from ${instText}; proposer ${props.map((p) => p.id).join("+") || "none"} on knob ${row.knob} (tier ${props.length ? props[0].tier : "?"}); key: ${key}; runs on ${where.line}`,
    };
}

/** The sentence under the Initiate button: what pressing it runs first, and what it will not do. */
export function doorLine(scenes, proposers) {
    const reg = (scenes || []).filter((r) => r.registered);
    if (!reg.length) return { scene: null, text: "Initiate has nothing to run: no scene has a registered proposer with an adjudicator" };
    const first = reg[0], props = (proposers || []).filter((p) => first.proposerIds.includes(p.id));
    return { scene: first.scene, count: reg.length,
             text: `Initiate runs the proposer for ${first.scene} (${props.map((p) => p.id).join("+") || "?"} on knob ${first.knob}) and shows every verdict; ${reg.length} scene${reg.length === 1 ? "" : "s"} registered. It PROPOSES and never applies: tier 'propose' means a person or a gate sets the value.` };
}

/** The 2D live strip from a run's JSON: the scene, the proposer and its pick, the verdicts newest first, the outcome. */
export function liveStrip(runJson, row = null) {
    if (!runJson || !runJson.ok) {
        const err = runJson ? runJson.error : "no response";
        return { ok: false, scene: { id: (runJson && runJson.scene) || (row && row.scene) || null, knob: row ? row.knob : null }, proposer: null, verdicts: [],
                 outcome: err === "no-proposer" ? "no proposer: " + (runJson.message || "") : err === "unknown-scene" ? "unknown scene" : "request failed: " + err };
    }
    const r = runJson.runs && runJson.runs[0];
    if (!r) return { ok: true, scene: { id: runJson.scene, knob: runJson.knob }, proposer: null, verdicts: [], outcome: "no run" };
    const verdicts = (r.scored || []).map((s, i) => ({ rank: i + 1, candidate: s.candidate, score: s.score, pass: s.pass,
        word: s.pass === true ? "accepted" : s.pass === false ? "refused" : "not adjudicated" })).filter((v) => v.pass !== null && v.pass !== undefined);
    const outcome = r.accepted === null || r.accepted === undefined
        ? "no candidate survived adjudication: the proposer offered nothing the key stands behind"
        : `adjudicated: ${r.knobs.join(",")} = ${r.accepted} (rank ${r.acceptedRank + 1} of ${r.tried})`;
    return {
        ok: true,
        scene: { id: runJson.scene, knob: runJson.knob, key: row ? firstSentence(row.key) : null },
        proposer: { id: r.id, knobs: r.knobs, tier: r.tier, proposed: r.greedy, proposedVerdict: r.greedyVerdict ? (r.greedyVerdict.pass ? "accepted" : "refused") : "?",
                    reason: r.greedyVerdict && r.greedyVerdict.evidence && r.greedyVerdict.evidence.reason || null, tried: r.tried, adjudicated: r.adjudicated, ms: r.ms },
        verdicts: verdicts.slice().reverse(),
        law: r.acceptedVerdict && r.acceptedVerdict.evidence && r.acceptedVerdict.evidence.law || null,
        outcome, applied: false, replay: r.replay || null,
    };
}

export function reportLines() {
    return [
        "labHome: the front door's buttons, sources lines, door sentence and live strip are DERIVED from physics/labPresets.js, labScenes.joinRegistered, proposers.listProposers, instruments.mjs and the v4584 routing ledger",
        "the proposer runs in the bridge's node process; the race is the one scene whose work is routed to named peers, and they are named only from the ledger",
    ];
}
