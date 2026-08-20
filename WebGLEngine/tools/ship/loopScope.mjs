// tools/ship/loopScope.mjs -- v3755
//
// *** STEP 0, AND THE WHOLE DESIGN IS IN ONE SENTENCE: THE PAGE DECLARES, THE RUNNER RE-CHECKS. Keith asked
// whether step 0 could be a page to select from. It can, with the constraint that decides everything else --
// A PAGE THAT GRANTS PERMISSION BY BEING CLICKED IS A CONTROL THAT CAN BE WRONG; A PAGE THAT RECORDS A CHOICE
// THE RUNNER THEN RE-CHECKS IS A SETTING. This file is the setting. The precedent is v3739's
// swek_one_terminal.flag: the panel writes it, the .bat tests it, and neither trusts the other. ***
//
// *** AND THE SCOPE IS NEVER READ BY THE SEARCHER ITSELF. loopSearch.search() takes the scope AS AN ARGUMENT
// and throws without one, so the file-reading lives HERE at the boundary and the searcher keeps the property
// v3753 asserted -- NO fs IMPORT AT ALL, no way to reach a source file. A scope check bolted inside the
// searcher would have quietly destroyed the strongest thing the searcher had to say about itself. ***
//
// THE SCOPES, from the chart at v3752. Each names WHAT IT MAY CHANGE and WHAT WOULD ENFORCE THE BOUND, because
// a menu whose entries are numbers teaches nobody what they are choosing between.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
export const SCOPE_FLAG = path.join(ENG, "ai-bridge", "swek_loop_scope.flag");

export const SCOPES = [
    { n: 0, id: "referee", label: "Referee only",
      may: "nothing -- grade a change a human made",
      enforced: "no runner exists", ready: true },
    { n: 1, id: "params", label: "Parameter search",
      may: "the `opts` object handed to the solver",
      enforced: "the searcher passes ARGUMENTS and has no fs import -- asserted by its gate", ready: true },
    { n: 2, id: "propose", label: "Propose only",
      may: "writes a candidate diff; applies nothing",
      enforced: "a human applies it, and frozenReferee proves the gates unchanged", ready: false,
      needs: "a diff writer, and a reviewer who reads it -- a plausible diff nobody reads carefully is the risk" },
    { n: 3, id: "onefile", label: "One allowlisted file",
      may: "exactly one named source file",
      enforced: "an allowlist plus frozenCheck hashing every gate before and after", ready: false,
      needs: "a runner that applies edits, and the allowlist itself" },
    { n: 4, id: "onedir", label: "Allowlisted directory",
      may: "any file under one named directory",
      enforced: "the same, wider", ready: false,
      needs: "everything scope 3 needs, and a reason the blast radius is still covered by the referee" },
    { n: 5, id: "open", label: "Unbounded", may: "anything", enforced: "nothing", ready: false,
      needs: "REFUSED -- a loop that can reach its own referee has no referee" },
];

export function scopeOf(n) { return SCOPES.find((s) => s.n === n) || null; }

/** The declared scope, or 0. AN UNREADABLE OR ABSENT FLAG MEANS SCOPE 0 -- the narrowest, never the widest. */
export function currentScope() {
    try {
        const raw = fs.readFileSync(SCOPE_FLAG, "utf8").trim();
        const n = Number(raw.split(/\s/)[0]);
        const s = scopeOf(n);
        // *** A SCOPE THAT IS NOT READY IS NOT HONOURED EVEN IF THE FILE SAYS IT. The file is a DECLARATION and
        // this is the RE-CHECK: somebody editing the flag by hand to "3" does not thereby build a runner, and
        // reading it back as 3 would be the page granting permission with extra steps. ***
        if (!s || !s.ready) return 0;
        return s.n;
    } catch { return 0; }
}

/** Written only by the panel's route. Refuses a scope that is not ready, BY NAME. */
export function setScope(n) {
    const s = scopeOf(n);
    if (!s) throw new Error("loopScope: unknown scope " + n);
    if (!s.ready) {
        throw new Error("loopScope: scope " + n + " (" + s.label + ") is NOT READY -- " + (s.needs || "") +
                        ". The selector offers it so the list is honest about what exists, not so it can be chosen.");
    }
    if (n === 0) { if (fs.existsSync(SCOPE_FLAG)) fs.unlinkSync(SCOPE_FLAG); }
    else fs.writeFileSync(SCOPE_FLAG, n + "  " + s.id + "  -- written by server.html; delete this file for scope 0\n");
    // Read back rather than trusting the write: THE DISK IS THE SETTING, because the disk is what the runner reads.
    if (currentScope() !== n) throw new Error("loopScope: the flag did not reach scope " + n);
    return currentScope();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    console.log("[loopScope] current: " + currentScope());
    for (const s of SCOPES) {
        console.log("  " + s.n + "  " + s.label.padEnd(24) + (s.ready ? "READY    " : "not ready") +
                    "  may change: " + s.may);
        if (!s.ready) console.log("       needs: " + s.needs);
    }
}
