// WebGLEngine/tools/roundhouse/claimTrace.mjs -- v3182
//
// IS A CLAIMED NUMBER SUPPORTED BY DATA ANYONE CAN GET BACK TO?
//
// The lab's gates are dense with measured numbers, written into prose so the next reader knows what was seen.
// That is the tree's best habit. *** BUT A NUMBER WITHOUT ITS CONFIGURATION IS NOT A RESULT, IT IS AN
// ANECDOTE *** -- and this session has been bitten by exactly that four times: kh's "76%" was one mode's error
// carried as the device's verdict; "114 round-trip controls" was occurrences reported as controls; "119
// orphans" undercounted by a third; "no PDF path exists" was a narrow grep.
//
// MEASURED, and the split matters more than the total: of the numeric claims in roundhouse gates that name
// exactly one device, TWENTY-SIX cannot be reproduced by running that device at ANY DECLARED MODE. Sweeping
// every mode instead of the default removed only ONE of them, so "wrong mode" is not the explanation.
//
// *** THE EXPLANATION IS THAT THEY ARE CONFIG-SPECIFIC AND THE CONFIG WAS NOT WRITTEN DOWN. *** A pair like
// 0.05226212549 and 0.05226212465 is a REFINEMENT SEQUENCE at two grid settings. 373.15 is an INPUT, not an
// output. 0.005 and 0.02 are TOLERANCES. The blackhole twelve-digit values come from one particular knob
// setting. Every one of those is legitimate; NONE of them can be re-derived from the prose alone.
//
// *** SO THIS IS A REPORT, NOT A RULE, AND THE DISTINCTION IS THE WHOLE DESIGN. *** It cannot tell a tolerance
// from a stale measurement -- both are numbers the device does not currently emit. Failing a build on that
// would punish every gate that states a threshold. What it CAN say is: HERE ARE THE CLAIMS NOBODY CAN CHECK
// WITHOUT ASKING THE AUTHOR, which is the question aipoch's traceability-review asks of a paper.

import fs from "node:fs";
import path from "node:path";

/** Numbers precise enough to be a measurement rather than a round constant. */
export function claimsIn(headerText) {
    return [...new Set((headerText.match(/\b\d+\.\d{2,}(?:e-?\d+)?\b/g) || []).map(Number))].filter((n) => isFinite(n));
}

/** The header is everything before the first import -- where a gate explains itself. */
export function headerOf(src) { return src.split(/\nimport /)[0]; }

/**
 * For every roundhouse gate naming exactly ONE device, which of its numeric claims can be reproduced by
 * running that device at any DECLARED mode?
 *
 * DECLARED, via checkMode -- build() silently defaults an unknown mode (v3144, 26 of 26 devices), so asking
 * build() which modes exist returns every string you try. That mistake cost a whole measurement at v3174.
 */
export async function claimTrace(engRoot, D, K, { modes = [], tol = 0.02 } = {}) {
    const dir = path.join(engRoot, "tools", "roundhouse");
    const gates = fs.readdirSync(dir).filter((f) => /-selfcheck\.mjs$/.test(f));
    const cache = {};
    const outsOf = async (n) => {
        if (cache[n]) return cache[n];
        const d = await D.getDevice(n);
        const declared = modes.filter((m) => { try { return K.checkMode(d, m).ok !== false; } catch { return false; } });
        const vals = [];
        for (const m of [...new Set([d.defaults({}).mode, ...declared])]) {
            try { for (const v of Object.values(await d.build({ mode: m }))) if (typeof v === "number" && isFinite(v)) vals.push(v); } catch {}
        }
        return cache[n] = vals;
    };
    const rows = [];
    for (const g of gates) {
        const src = fs.readFileSync(path.join(dir, g), "utf8");
        const nums = claimsIn(headerOf(src));
        if (!nums.length) continue;
        const named = D.DEVICE_NAMES.filter((n) => new RegExp('["\']' + n + '["\']').test(src));
        // A GATE NAMING TWO DEVICES IS SKIPPED, NOT GUESSED AT. Attributing a number to whichever device was
        // mentioned first would produce a confident wrong answer, which is worse than no answer.
        if (named.length !== 1) continue;
        let outs; try { outs = await outsOf(named[0]); } catch { continue; }
        if (!outs.length) continue;
        const unmatched = nums.filter((n) => !outs.some((v) => Math.abs(v - n) <= Math.abs(n) * tol + 1e-12));
        rows.push({ gate: g.replace("-selfcheck.mjs", ""), device: named[0], claims: nums.length, unmatched });
    }
    const total = rows.reduce((n, r) => n + r.claims, 0);
    const loose = rows.reduce((n, r) => n + r.unmatched.length, 0);
    return { rows, gates: rows.length, total, unreproducible: loose };
}
