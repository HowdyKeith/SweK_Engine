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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { RUNNER, GITHUB, refusalSource } from "../../world/traderGraph.mjs";

// Defined before anything that reads it: v4534's sibling round put a lookup ABOVE its `const ENG` and the
// temporal-dead-zone ReferenceError was swallowed by a try/catch as a missing file.
export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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
    // v4534: a malformed entry is SKIPPED, not thrown on. Sabotage FG emptied one gate's `mark` and this
    // line raised a TypeError inside stack(), so the gate died before the row that checks the record could
    // name the problem -- a crash is not a verdict, and the check that exists for exactly this defect sat
    // twenty lines downstream of the throw.
    for (const g of GATES) if (g.mark instanceof RegExp && g.mark.test(t)) return g.gate;
    return null;
}

/**
 * Given probe rows `{path, code, body}`, say for each whether it is open, and if not, which gate holds it
 * and whose refusal it is. `unnamed` is the set this session cannot classify, which is the set that makes
 * the record above stale.
 */
// ---- *** v4534 -- THE DISCRIMINATION v4483 NAMED IN PROSE, AND DID NOT PUT IN THE ASSERTION *** -----------
//
// v4534 SABOTAGES, RESULTS BY NAME:
//   FA. an UNBOUND path opens (users/but0n reads 200)      -> 2 RED   <- THE INVITATION, still firing
//   FB. isOwnRepoPath calls every path the own repo        -> *** 0 RED, THEN 2 RED ***
//   FC. isOwnRepoPath matches nothing                      -> 3 RED
//   FD. ownRepoOf returns a typed name instead of deriving -> 2 RED
//   FE. two of the three gates share one holder            -> 2 RED
//   FF. a GATES entry is deleted, so "three" is two        -> 2 RED
//   FG. a gate's `mark` is emptied, so it is unnameable    -> *** CRASH, THEN 3 RED ***
//
// *** FB WENT 0 RED AND IT IS THE ONE THAT MATTERS. *** Making the discriminator answer true for every path
// empties openElsewhere by construction, so THE INVITATION CAN NEVER FIRE AGAIN -- and the only row that
// could have caught that is the row built on top of it. A discriminator that widens to swallow its own alarm
// is this session's fifth control-built-from-the-defect; a fixture pins it on fixed strings now.
//
// FG CRASHED BEFORE IT COULD FAIL. `mark` is a RegExp and gateOf called .test() on whatever it found, so a
// malformed record raised a TypeError inside stack() and the gate died twenty lines upstream of the row that
// exists to name exactly that. A crash is not a verdict; gateOf skips a malformed entry now and the record
// check reports it.
//
// v4483's own report line says it exactly: "What is NOT an invitation is a 200 arriving because this session
// happens to be bound to the repository." Then the assertion is `s.open.length === 0`, which cannot tell the
// two apart, so the gate goes red on precisely the 200 that note excludes. *** THE DISTINCTION WAS WRITTEN
// DOWN AND NOT IMPLEMENTED. ***
//
// AND IT IS THE SAME MISTAKE FROM BOTH SIDES. v4481 asserted `own.code === 200` -- a reading of the box --
// and went red when that path closed. v4483 restored the direction and asserted the path is SHUT, which goes
// red when it opens. MEASURED: the contested path answers 200 ten times out of ten in this container and was
// 403 throughout v4483's, while users/but0n and repos/but0n/vixel are 403 in both. *** THE VALUE IS A
// PROPERTY OF WHICH CONTAINER RUNS THE GATE, STABLE WITHIN A SESSION AND VARYING BETWEEN THEM, so an
// assertion about it in EITHER direction is an assertion about the box. ***
//
// What is assertable is the part that does not vary: a path OUTSIDE this tree's own repository. That is
// derivable rather than typed -- the git remote says which repository this is -- so a session bound to some
// other repo gets the same answer without editing a list.
export function ownRepoOf(root) {
    try {
        const url = execFileSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
        const m = /github\.com[/:]([^/]+)\/([^/.]+)/i.exec(url);
        return m ? `${m[1].toLowerCase()}/${m[2].toLowerCase()}` : null;
    } catch { return null; }
}

/** Is this API path addressed at the repository this tree IS? `repos/<owner>/<repo>/...`, case-insensitively. */
export function isOwnRepoPath(apiPath, ownRepo) {
    if (!ownRepo) return false;
    const m = /^repos\/([^/]+)\/([^/]+)(?:\/|$)/i.exec(String(apiPath || ""));
    return !!m && `${m[1].toLowerCase()}/${m[2].toLowerCase()}` === ownRepo;
}

export function stack(probes) {
    // *** A PROBE THAT NEVER REACHED THE NETWORK IS NOT A REFUSAL. *** curl absent, curl killed, DNS gone:
    // the caller reports code -1 and there is no response to attribute. Folding that in with the 403s would
    // say "the proxy reworded its message" about a box that never sent a request -- the same misattribution
    // playwrightResolve.mjs's header says this tree has already paid for twice. Keith's rig reports -1 on all
    // three, and the answer it needs is "install curl", not "re-take the record".
    const ownRepo = probes.ownRepo !== undefined ? probes.ownRepo : ownRepoOf(ENG);
    const rows = probes.map((p) => {
        const reached = p.code >= 100;
        const open = p.code === 200;
        const source = !reached || open ? null : refusalSource(p.body);
        return Object.freeze({
            path: p.path,
            code: p.code,
            reached,
            open,
            source,
            // v4534: a 200 here is expected whenever the session is bound to this repository, so it is not
            // an axis opening to anybody else. Derived from the git remote, not from a typed name.
            ownRepo: isOwnRepoPath(p.path, ownRepo),
            gate: !reached || open ? null : gateOf(p.body),
        });
    });
    const refused = rows.filter((r) => r.reached && !r.open);
    const unreached = rows.filter((r) => !r.reached);
    return Object.freeze({
        rows: Object.freeze(rows),
        ownRepo,
        open: Object.freeze(rows.filter((r) => r.open).map((r) => r.path)),
        // *** THE ASSERTABLE SET. *** An axis that opens somewhere this session has no binding is an
        // invitation to anybody; one that opens on this tree's own repository is the container talking.
        openElsewhere: Object.freeze(rows.filter((r) => r.open && !r.ownRepo).map((r) => r.path)),
        openOwnRepo: Object.freeze(rows.filter((r) => r.open && r.ownRepo).map((r) => r.path)),
        refused: Object.freeze(refused.map((r) => r.path)),
        unreached: Object.freeze(unreached.map((r) => r.path)),
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
