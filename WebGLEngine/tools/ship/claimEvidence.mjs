// WebGLEngine/tools/ship/claimEvidence.mjs -- v4404
//
// *** A CLAIM NAMES ITS OWN FALSIFIER IN PROSE, AND NOTHING EVER PULLS THE TRIGGER. ***
//
// docs/EXPLAIN-ITSELF.md item 4, and it is the register's defect one level over. predictions.html holds 241
// claims -- 204 settled, 28 open, 9 broken -- and each carries `kill:`, the condition that would kill it, and
// `where:`, the files it rests on. BOTH ARE SENTENCES. Nothing resolves the path, nothing runs the gate, and
// nothing has ever asked whether a claim's own stated killer is currently firing.
//
// *** ONE OF THEM IS. *** "The selfchecks and the server survive Windows paths" is marked SETTLED. Its kill
// reads "tools/ship/winPathGuard-selfcheck.mjs. SABOTAGE: reintroduce either idiom in any file and the gate
// fails". Its measured reads "it is, so every straggler was caught". That gate is in the red register and
// reports TWENTY OFFENDING OCCURRENCES. The claim's own kill condition is met twenty times over and the claim
// still reads settled.
//
// ---- *** THE SABOTAGE CLAUSE IS NOT AN EVIDENCE CLAUSE, AND THE FIRST DRAFT COUNTED IT AS ONE *** -------------
//
// A `kill:` field usually ends with "SABOTAGE: <how to break it>", and that sentence names files ON PURPOSE
// THAT SHOULD NOT RESOLVE -- one claim names brain/nonexistent-brain.js, which is the point of the sabotage.
// Reading paths out of it reports a dangling reference for a file the claim intends not to exist. THAT IS THE
// SHADER CENSUS'S DEFECT AGAIN: a detector that counts the word rather than the thing, caught here by looking
// at the ten it flagged instead of trusting the ten.

const PATH = /[A-Za-z0-9_.\-]+(?:\/[A-Za-z0-9_.\-]+)+\.(?:mjs|js|html|json|wgsl)/g;

/** Everything from a SABOTAGE marker onward describes how to BREAK the claim, not what supports it. */
export function beforeSabotage(text) {
    const s = String(text || "");
    const i = s.search(/\bSABOTAGE\b/);
    return i < 0 ? s : s.slice(0, i);
}

/** The files a claim rests on: kill and where and measured, with each field's sabotage clause removed. */
export function evidencePaths(claim) {
    const blob = [claim.kill, claim.where, claim.measured].map(beforeSabotage).filter(Boolean).join(" ");
    return [...new Set(blob.match(PATH) || [])];
}

export const isGate = (p) => /-selfcheck\.mjs$/.test(p);

/**
 * What a claim's evidence is worth, in four outcomes.
 *
 *   contradicted  a SETTLED claim whose own named gate is currently red -- the trigger is being pulled
 *   dangling      it names a file that is not there, so the evidence cannot be followed at all
 *   gated         it names at least one gate that exists: the falsifier is runnable
 *   prose         it names no runnable thing, so "settled" rests on a sentence
 *
 * `redGates` is the register's set. THE FOUR ARE NOT FOLDED: v4401 learned that one bucket for three species
 * sends different work to the same place, and these four need four different answers.
 */
export function classify(claim, { exists, redGates }) {
    const paths = evidencePaths(claim);
    const gates = paths.filter(isGate);
    const missing = paths.filter((p) => !exists(p));
    const firing = gates.filter((g) => redGates.has(g));
    if (claim.state === "settled" && firing.length)
        return { kind: "contradicted", paths, detail: "settled, and its own named gate is RED: " + firing.join(", ") };
    if (missing.length)
        return { kind: "dangling", paths, detail: "names a file that is not in the tree: " + missing.join(", ") };
    if (gates.length) return { kind: "gated", paths, detail: gates.join(", ") };
    return { kind: "prose", paths, detail: paths.length ? "names files but no gate: " + paths.join(", ")
                                                        : "names no file at all" };
}

export function census(claims, opts) {
    const rows = claims.map((c) => ({ name: c.name, state: c.state, since: c.since, ...classify(c, opts) }));
    const counts = {};
    for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;
    return { rows, counts };
}
