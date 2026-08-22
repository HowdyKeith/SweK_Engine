// WebGLEngine/brain/tools/policy-mass.mjs — v2540
//
// DOES THE BRAIN PUT ITS PROBABILITY MASS ON THE OPTIONS THAT ACTUALLY WORK?
//
// ---- WHY THIS IS NOT THE CALIBRATION TEST I ANNOUNCED ------------------------------------------------------
//
// Last round I said the trace's `p` was "the brain's own confidence" and that it made a calibration test -- when
// the brain says 0.8, does it hit 80%? THAT WAS A MISREAD, and reading brain.js rather than my memory of it says
// so plainly:
//
//     p: _pk?.mode === "sampled" ? _pk.probs?.[o.name] : undefined,
//     // The softmax probability the brain gave the choice that fired
//
// `p` is a SOFTMAX WEIGHT OVER CHOICES, not a belief about success. It says "I picked B, and B held 40% of my
// probability mass." It does NOT say "I am 40% sure B will hit." A brain can put 0.9 on B and have B hit 20% of
// the time and be perfectly calibrated -- because B was simply the best of a bad set. The two quantities are not
// the same thing and no amount of bucketing turns one into the other.
//
// (The other `p` in brain.js -- emphasisShotProb() -- is the same kind of thing: it marginalises over which
// emphasis is live to get how likely an option is TO FIRE. Also a selection probability. The brain does not record
// a belief about success anywhere. It records HOW IT CHOSE.)
//
// ---- WHAT IS ACTUALLY ANSWERABLE, AND IT IS BETTER --------------------------------------------------------
//
// Use `p` for what `p` IS. For each option the brain can pick, it has:
//     MASS  -- the mean softmax weight it gives that option (how much it FAVOURS it)
//     MERIT -- the hit rate that option actually achieves (how well it WORKS)
//
// A policy that is learning puts mass where the merit is. So rank the options by mass, rank them by merit, and
// ask whether the orders agree (Spearman). Then:
//
//     rho near +1   the policy favours what works. It is learning.
//     rho near  0   mass and merit are unrelated. The policy is noise wearing a softmax.
//     rho near -1   THE POLICY IS BACKWARDS: it is confidently choosing the things that fail.
//
// The last case is the interesting one and NO AGGREGATE HIT-RATE CAN SHOW IT. A brain at 50% could be picking
// well half the time, or picking the worst option every time in a domain where half the options are coin flips.
// Those look identical in a ratio and opposite here.
//
// ---- WHAT THIS CANNOT SAY ---------------------------------------------------------------------------------
//
// `p` only exists on mode === "sampled" records -- the brain omits it rather than faking one for the argmax path.
// So this measures the SAMPLED policy only, which is typically the minority of decisions. It is a real answer
// about a real subset, and calling it "the brain's policy" would overclaim.
//
// Run: node brain/tools/policy-mass.mjs <session.jsonl>
"use strict";

import fs from "node:fs";

export function parseTrace(text) {
    const recs = [];
    let head = null, truncated = null, bad = 0;
    for (const line of text.split("\n")) {
        const s = line.trim();
        if (!s) continue;
        let r;
        try { r = JSON.parse(s); } catch { bad++; continue; }
        if (r.t === "session") { head = r; continue; }
        if (r.t === "truncated") { truncated = r; continue; }
        if (r.t === "d") recs.push(r);
    }
    return { recs, head, truncated, bad };
}

/**
 * Mass-vs-merit per option, per domain.
 * @param {Array} recs  decision records
 * @param {{minN?: number}} [opts]  minN: options seen fewer times than this are dropped, not reported --
 *                                  an option picked twice has a hit rate of 0%, 50% or 100% and means nothing.
 */
export function massVsMerit(recs, opts = {}) {
    const minN = opts.minN ?? 12;
    const out = {};
    const sampled = recs.filter((r) => r.mode === "sampled" && typeof r.p === "number" && Number.isFinite(r.p));
    for (const r of sampled) {
        const d = (out[r.dom] ||= { options: new Map(), n: 0, dropped: 0 });
        d.n++;
        const o = d.options.get(r.choice) || { n: 0, hits: 0, pSum: 0 };
        o.n++; o.hits += r.hit ? 1 : 0; o.pSum += r.p;
        d.options.set(r.choice, o);
    }
    for (const dom of Object.keys(out)) {
        const d = out[dom];
        const rows = [];
        for (const [name, o] of d.options) {
            if (o.n < minN) { d.dropped++; continue; }
            rows.push({ name, n: o.n, mass: o.pSum / o.n, merit: o.hits / o.n });
        }
        d.rows = rows.sort((a, b) => b.mass - a.mass);
        d.rho = rows.length >= 3 ? spearman(rows.map((r) => r.mass), rows.map((r) => r.merit)) : null;
        d.options = undefined;
    }
    return { domains: out, sampledN: sampled.length, totalN: recs.length };
}

/** Spearman rank correlation. Ranks, not values: the question is whether the ORDERS agree, and a softmax weight
 *  and a hit rate are not on the same scale and never will be. */
export function spearman(a, b) {
    const n = a.length;
    if (n < 3) return null;
    const rank = (v) => {
        const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
        const r = new Array(n);
        let i = 0;
        while (i < n) {
            let j = i;
            while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;   // ties share the average rank, or a domain
            const avg = (i + j) / 2 + 1;                            // where every option ties reports a fake -1
            for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
            i = j + 1;
        }
        return r;
    };
    const ra = rank(a), rb = rank(b);
    const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = ra[i] - ma, y = rb[i] - mb; num += x * y; da += x * x; db += y * y; }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
}

export function verdict(rho, n) {
    if (rho === null) return { text: "not enough distinct options to rank", cls: "dim" };
    // A rank correlation on 4 options is not evidence of anything. Say so rather than colouring it green.
    if (n < 4) return { text: "too few options to mean much (" + n + ")", cls: "dim" };
    if (rho > 0.5) return { text: "the policy favours what works", cls: "ok" };
    if (rho < -0.5) return { text: "BACKWARDS -- it favours what fails", cls: "hot" };
    if (rho > 0.15) return { text: "weakly favours what works", cls: "warn" };
    if (rho < -0.15) return { text: "weakly favours what fails", cls: "hot" };
    return { text: "mass and merit are unrelated -- noise wearing a softmax", cls: "warn" };
}

// ---- KNOWN-ANSWER TRACE GENERATOR --------------------------------------------------------------------------
//
// The gate built its own synthetic traces to prove the tool can say BACKWARDS. The PAGE needs the same thing --
// a trace whose verdict is known by construction -- so it can demonstrate the tool with NO real BRAIN_TRACE
// captured (that switch is off by default, and may never have been flipped). If the page kept its own copy of
// this generator it would drift from the gate's, and the two would quietly demonstrate different things while
// appearing to demonstrate the same one. So there is ONE generator, here, and both import it.
//
// mass[i] = the softmax weight the brain gives option i;  merit[i] = the rate it actually hits.
// Options are sampled in proportion to mass, exactly as a softmax draw would, and p is recorded as the
// normalised weight of the option that fired -- the real record shape (see brain/trace.mjs traceDecision).
export function syntheticTrace({ mass, merit, n = 400, seed = 7, dom = "attack" }) {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const lines = [JSON.stringify({ t: "session", at: 1, build: "test", pid: 1 })];
    for (let i = 0; i < n; i++) {
        const total = mass.reduce((a, b) => a + b, 0);
        let r = rnd() * total, k = 0;
        while (k < mass.length - 1 && r > mass[k]) { r -= mass[k]; k++; }
        lines.push(JSON.stringify({
            t: "d", seq: i + 1, id: "u0", dom, choice: "opt" + k,
            mode: "sampled", hit: rnd() < merit[k] ? 1 : 0, p: mass[k] / total,
        }));
    }
    return lines.join("\n");
}

// The three demonstrations the page offers, keyed by the answer they are built to have. A page that could only
// show "looks fine" would be the decoration this tool exists to refute, so BACKWARDS is one of the three and is
// not hidden behind a warning the way a real alarm would be.
export const DEMO_TRACES = {
    learning: { label: "a policy that favours what works", mass: [0.5, 0.3, 0.15, 0.05], merit: [0.9, 0.6, 0.3, 0.1], n: 1200 },
    backwards: { label: "a BACKWARDS policy -- confidently picks what fails", mass: [0.5, 0.3, 0.15, 0.05], merit: [0.1, 0.3, 0.6, 0.9], n: 1200 },
    noise: { label: "noise wearing a softmax -- every option equally good", mass: [0.4, 0.3, 0.2, 0.1], merit: [0.5, 0.5, 0.5, 0.5], n: 2000 },
};

/** Analyse raw session.jsonl text end to end: parse -> mass/merit -> verdict per domain. The bridge and the CLI
 *  both go through here so neither can quietly compute the answer a different way. */
export function analyseTrace(text, opts = {}) {
    const t = parseTrace(text);
    const m = massVsMerit(t.recs, opts);
    const domains = {};
    for (const [dom, d] of Object.entries(m.domains)) {
        const rows = d.rows || [];
        domains[dom] = { n: d.n, dropped: d.dropped || 0, rho: d.rho, rows, verdict: verdict(d.rho, rows.length) };
    }
    return {
        recs: t.recs.length, sampledN: m.sampledN,
        truncated: t.truncated ? t.truncated.after : null, bad: t.bad,
        head: t.head || null, domains,
    };
}

// ---- CLI ---------------------------------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith("policy-mass.mjs")) {
    const path = process.argv[2];
    if (!path) { console.error("usage: node brain/tools/policy-mass.mjs <session.jsonl>"); process.exit(2); }
    const t = parseTrace(fs.readFileSync(path, "utf8"));
    const m = massVsMerit(t.recs);
    console.log("trace: " + t.recs.length + " decisions, " + m.sampledN + " of them sampled-with-p" +
                (t.truncated ? "  [TRUNCATED after " + t.truncated.after + "]" : "") + (t.bad ? "  [" + t.bad + " unparseable]" : ""));
    if (!m.sampledN) { console.log("\nNo sampled decisions carry a p. Nothing to say -- and that is an answer, not a failure."); process.exit(0); }
    for (const [dom, d] of Object.entries(m.domains)) {
        const v = verdict(d.rho, (d.rows || []).length);
        console.log("\n" + dom + ": " + d.n + " sampled decisions, " + (d.rows || []).length + " options" +
                    (d.dropped ? " (" + d.dropped + " dropped, too few samples)" : ""));
        console.log("  rho = " + (d.rho === null ? "n/a" : d.rho.toFixed(3)) + "   " + v.text);
        console.log("  " + "option".padEnd(14) + "n".padStart(5) + "  mass".padStart(8) + "  merit".padStart(9));
        for (const r of d.rows || []) {
            console.log("  " + r.name.padEnd(14) + String(r.n).padStart(5) + "  " + r.mass.toFixed(3).padStart(6) + "  " + (100 * r.merit).toFixed(1).padStart(7) + "%");
        }
    }
}
