// WebGLEngine/tools/ship/refusalStack.mjs -- v4483
//
// *** "THE API IS SHUT" IS NOT ONE FACT. IT IS THREE INDEPENDENT GATES, AND THIS SESSION IS STOPPED AT A
// DIFFERENT ONE FOR EACH PATH IT ASKS FOR. ***
//
// world/traderGraph.mjs records three refusals verbatim and v4481 attributed them all, correctly, to the
// runner rather than to GitHub. What nobody then asked is whether they are the SAME refusal. They are not.
// Probed from this sandbox, api.github.com answers with three DIFFERENT messages naming three DIFFERENT
// remedies, each held by a different party:
//
//     users/but0n                                403  the PATH CLASS is refused  -- no remedy from here
//     repos/but0n/vixel                          403  the REPO is not attached   -- add_repo, by this session
//     repos/howdykeith/swek_engine/contributors  403  the ORG has not connected  -- an org admin, not this session
//     rate_limit                                 200  limit 15000, authenticated -- the connection is up
//
// Collapsing those into "the API is unavailable" loses the only part that is actionable: two of the three
// have a remedy, they are held by different people, and clearing one clears nothing about the other two.
//
// ---- *** AND THE THIRD ROW IS WHY THIS FILE EXISTS *** -------------------------------------------------------
//
// At v4480 that row answered 200, and traderGraph-selfcheck was rewritten to ASSERT it -- `own.code === 200`.
// It is 403 again now, with the message world/traderGraph.mjs had already recorded for it word for word:
// "GitHub access is not enabled for this session. An org admin must connect". So the module's original
// record was right, v4481's annotation that the axis "now ANSWERS 200" froze a transient, and the gate went
// red when the world returned to what the module says the world is.
//
// *** THAT INVERTED THE FILE'S OWN STATED DESIGN. *** Its header says, and still says: "If an axis OPENS,
// this goes red, and that red means 'go and use the thing you said you could not use'." An assertion that a
// path ANSWERS goes red when the path CLOSES -- the opposite direction, on the same line, in a file that
// describes the correct direction eighty lines above it.
//
// A STATUS CODE IS A READING, NOT A PROPERTY. This module asserts the direction the header states -- the
// recorded axes are shut, and each refusal is attributable to a NAMED gate -- and REPORTS the readings.
"use strict";
import { RUNNER, GITHUB, refusalSource } from "../../world/traderGraph.mjs";

/**
 * The three gates, innermost last. `mark` is what the proxy says when it is the one that stopped you; `who`
 * is who can clear it, which is the field that makes the distinction worth drawing at all.
 */
export const GATES = Object.freeze([
    Object.freeze({
        gate: "path-class",
        mark: /bound to their configured repositories/i,
        who: "nobody reachable from here -- the whole non-repo path class is refused",
        remedy: null,
    }),
    Object.freeze({
        gate: "repo-not-attached",
        mark: /not enabled for this session\. use add_repo|use add_repo/i,
        who: "THIS SESSION -- the only one of the three it holds itself",
        remedy: "add_repo, one repository at a time",
    }),
    Object.freeze({
        gate: "org-not-connected",
        mark: /github access is not enabled for this session\. an org admin must connect/i,
        who: "an org admin, who is not this session and cannot be reached from it",
        remedy: "connect the Claude GitHub App for the organization",
    }),
]);

/**
 * Which gate stopped this body, by its own words. Returns null for a body no gate claims -- a REFUSAL
 * NOBODY CAN NAME IS A FINDING, not a default, so this does not fall through to the last gate. That is
 * v4402's rule applied to a classifier: an unrecognised message read as a known one is an unknown read as a
 * pass, and the proxy rewording its text is exactly when this file gets read again.
 */
export function gateOf(body) {
    const t = String(body || "");
    if (!t.trim()) return null;
    for (const g of GATES) if (g.mark.test(t)) return g.gate;
    return null;
}

/**
 * Given probe rows `{path, code, body}`, say for each whether it is open, and if not, which gate holds it
 * and whose refusal it is. `unnamed` is the set this session cannot classify, which is the set that makes
 * the record above stale.
 */
export function stack(probes) {
    const rows = probes.map((p) => {
        const open = p.code === 200;
        const source = open ? null : refusalSource(p.body);
        return Object.freeze({
            path: p.path,
            code: p.code,
            open,
            source,
            gate: open ? null : gateOf(p.body),
        });
    });
    const refused = rows.filter((r) => !r.open);
    return Object.freeze({
        rows: Object.freeze(rows),
        open: Object.freeze(rows.filter((r) => r.open).map((r) => r.path)),
        refused: Object.freeze(refused.map((r) => r.path)),
        byRunner: refused.filter((r) => r.source === RUNNER).length,
        byGithub: refused.filter((r) => r.source === GITHUB).length,
        unnamed: Object.freeze(refused.filter((r) => !r.gate).map((r) => r.path)),
        distinctGates: new Set(refused.map((r) => r.gate).filter(Boolean)).size,
    });
}

/**
 * *** THE READINGS, WITH THE TRANSIENT NAMED AS A TRANSIENT. *** These are measured, and they are recorded
 * so that a later reading can be COMPARED rather than asserted. The gate below reports drift from this table
 * and goes red only on the two things that are findings in either direction: an axis that OPENS, and a
 * refusal no gate claims.
 */
export const STACK_AT_V4483 = Object.freeze({
    at: "v4483",
    probed: Object.freeze([
        Object.freeze({ path: "users/but0n", code: 403, gate: "path-class" }),
        Object.freeze({ path: "repos/but0n/vixel", code: 403, gate: "repo-not-attached" }),
        Object.freeze({ path: "repos/howdykeith/swek_engine/contributors", code: 403, gate: "org-not-connected" }),
        Object.freeze({ path: "rate_limit", code: 200, gate: null }),
    ]),
    gates: 3,
    // *** THE ONE THAT MOVED, AND WHAT ASSERTING IT COST. ***
    transient: Object.freeze({
        path: "repos/howdykeith/swek_engine/contributors",
        atV4480: 200,
        atV4483: 403,
        message: "GitHub access is not enabled for this session. An org admin must connect the Claude GitHub " +
                 "App for this organization.",
        recordedBy: "world/traderGraph.mjs AXES, 'our own repo's contributors', BEFORE the 200 was ever seen",
        cost: "traderGraph-selfcheck asserted code === 200 for one round and was red for the next, on a tree " +
              "where nothing about the repository had changed. A ship was blocked by a gate asserting a " +
              "configuration of the box it runs in.",
    }),
    // The control that keeps every row above meaningful, and what it really measures.
    control: Object.freeze({
        path: "rate_limit", code: 200, limit: 15000,
        says: "the connection is up and CREDENTIALED, so a 403 beside it is policy and not a dead link",
        doesNotSay: "that any of these paths would answer from an unproxied runner -- nothing here reaches " +
                    "GitHub directly, so the 403s are evidence about the proxy and about nothing else",
    }),
});

/** Instrument row: what this reports when asked, without probing. */
export function reportLines(s = null) {
    const out = ["the refusal stack -- three gates, three remedies, three different people"];
    for (const g of GATES) out.push(`    ${g.gate.padEnd(18)} cleared by ${g.who}`);
    if (s) {
        out.push(`  probed: ${s.open.length} open, ${s.refused.length} refused, ` +
                 `${s.distinctGates} distinct gate(s), ${s.unnamed.length} unnamed`);
        if (s.unnamed.length) out.push(`  *** UNNAMED REFUSAL(S): ${s.unnamed.join(", ")} -- the record is stale ***`);
    } else {
        out.push(`  recorded at ${STACK_AT_V4483.at}: ` +
                 STACK_AT_V4483.probed.map((p) => `${p.path} ${p.code}`).join(", "));
    }
    out.push("  a status code is a READING; the assertion is that the recorded axes stay shut and every " +
             "refusal is nameable. An axis that OPENS is the invitation, and it is a red on purpose.");
    return out;
}
