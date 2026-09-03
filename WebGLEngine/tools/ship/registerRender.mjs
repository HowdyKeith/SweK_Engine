// WebGLEngine/tools/ship/registerRender.mjs -- v4400
//
// *** THE RED REGISTER KEEPS A RENDERING WHERE IT SHOULD KEEP THE SOURCE. ***
//
// docs/EXPLAIN-ITSELF.md item 1. redCensus.mjs stores a hand-typed `fails:` string for each red gate -- a
// PROJECTION of a run, frozen at the moment somebody typed it -- while tools/ship/register-audit.mjs holds the
// runs themselves. Three rounds of one session each found the projection stale in a different way: v4380 filed
// shaderCensus at 4 where the gate said 14, v4383 found the 14 itself was false, v4386 found referenceKind's
// line describing SWEEP BUCKETING rather than the gate. One shape, three symptoms -- THE STORED PROJECTION WENT
// STALE BECAUSE THE CANONICAL THING WAS ELSEWHERE. It is the shipyard's lesson applied to a register: keep the
// thing where it is exact, project it for viewing.
//
// ---- *** MEASURED BEFORE ANYTHING WAS BUILT, AND THE TYPED LINE ADDS NOTHING *** ------------------------------
//
// Against the audit as it stood (frozen at v4380, read nineteen rounds later), of 27 entries:
//
//     4  match a recorded line EXACTLY
//    17  are a whitespace-normalised TRUNCATION of one -- a rendering, by definition
//     5  match nothing any recorded run produced, in THREE species:
//          the number drifted UPWARD and the register kept the smaller one (boundaryLint 89 filed / 90
//            recorded, referenceKind 221 / 222, winPathGuard 17 / 19)
//          the named INSTANCE moved (canvasFill files atmosphereHarness.html#c; the run names
//            gpu-rig-check.html#stage)
//          the audit captured NOTHING (shaderRefs runs 380 s past the capture cap, so its `all` is empty and
//            its filed line cannot be derived from the source it is supposed to render)
//
// *** AND NO FILED LINE CARRIES A WORD ITS RUN DOES NOT. *** Asked directly -- which words in the typed line
// appear in no recorded line of that gate -- four entries answer with a FILENAME CUT IN HALF by the 110-column
// clip ("ai-bridge/vbaarchive", "engine/framedirtycensus-sel", "tools/roundhouse/assumptions-selfch"), which is
// not information, it is a broken rendering. Only shaderRefs carries real sentences, and only because its row
// is empty. THE TYPED LINE IS A LOSSY COPY OF SOMETHING THE TREE ALREADY HAS.
//
// ---- WHAT THIS DOES AND DOES NOT CHANGE ------------------------------------------------------------------------
//
// It does not delete `fails:`. That string is the HISTORICAL CLAIM -- what the line said when somebody filed it
// -- and deleting it would destroy the only record of the drift this file measures. It is demoted, not removed:
// the DISPLAY line is derived here, the typed one is history, and the distance between them is a number.
//
// The reasoning stays typed. A register entry's `note:` and its comments say what a red MEANS, which no run
// prints and no derivation can supply. THE QUOTED LINE IS THE ONLY PART THAT WAS EVER A COPY.

const WIDTH = 110;                 // the clip the register has always used, named rather than repeated

export const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

/** The line a reader should SEE for a gate: its recorded first failure, rendered at the register's own width. */
export function renderFor(gate, audit) {
    const row = (audit.rows || []).find((r) => r.gate === gate);
    if (!row) return { line: null, why: "no audit row -- this gate was not in the sweep the audit froze" };
    const all = (row.all || []).map(norm).filter(Boolean);
    if (!all.length) return { line: null, why: "the audit captured no failing line: exit " + row.exit +
                              " after " + row.ms + " ms, past the capture cap" };
    return { line: all[0].slice(0, WIDTH), from: all.length, why: null };
}

/**
 * How the typed line stands to the recorded ones. FIVE OUTCOMES, NOT TWO, because "differs" hid three different
 * problems and a register that reports one bucket for three species is the defect this file is about.
 */
export function classify(entry, audit) {
    const row = (audit.rows || []).find((r) => r.gate === entry.gate);
    const filed = norm(entry.fails || "");
    if (!row) return { kind: "no-row", detail: "the audit has no run for this gate" };
    const all = (row.all || []).map(norm).filter(Boolean);
    if (!filed) return { kind: "no-line", detail: "the entry records no failing line at all" };
    if (!all.length) return { kind: "uncaptured", detail: "exit " + row.exit + " after " + row.ms +
                              " ms and no line captured, so the filed text cannot be checked against a run" };
    if (all.some((l) => l === filed)) return { kind: "exact", detail: "the filed line IS a recorded line" };
    if (all.some((l) => l.startsWith(filed))) return { kind: "truncation", detail: "a prefix of a recorded line" };
    // *** SAME CHECK, DIFFERENT READING -- AND THE FIRST DRAFT OF THIS TEST MISCLASSIFIED THREE OF THEM. ***
    // It compared the text up to the first RUN OF TWO SPACES, which a gate's output has between the assertion
    // name and its detail. The FILED line does not: the register stores it whitespace-collapsed, so the split
    // never fired, the head was the whole line, and three entries that had merely counted differently were
    // reported as naming something the gate no longer says. A COMPARISON THAT NORMALISES ONE SIDE AND NOT THE
    // OTHER measures its own normalisation. The shared prefix answers it without depending on either side's
    // spacing: 40 characters is well past every assertion name in this register and well short of any number.
    const SHARE = 40;
    const shared = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
    const near = all.find((l) => shared(l, filed) >= SHARE);
    if (near) return { kind: "drifted",
        detail: "the same check, a different reading -- " + shared(near, filed) + " characters shared: filed " +
                JSON.stringify(filed.slice(0, 90)) + " against " + JSON.stringify(near.slice(0, 90)) };
    return { kind: "moved", detail: "no recorded line begins the same way; the register names something this " +
             "gate no longer says. Recorded: " + JSON.stringify(all[0].slice(0, 90)) };
}

/** Every entry classified, plus the counts a gate can ratchet on. */
export function divergence(entries, audit) {
    const rows = entries.map((e) => ({ gate: e.gate, ...classify(e, audit) }));
    const counts = {};
    for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;
    // DERIVABLE means the tree can render this entry's line from a run it recorded. The other kinds each name a
    // reason it cannot, and they are NOT folded together: a stale number and an uncaptured gate need different work.
    const derivable = rows.filter((r) => r.kind === "exact" || r.kind === "truncation").length;
    return { rows, counts, derivable, unbacked: rows.length - derivable };
}

/**
 * *** HOW OLD IS THE SOURCE. *** The audit is the canonical thing, and a canonical thing that nobody re-takes
 * is a projection with extra steps -- which is the whole defect one level up. Measured in ROUNDS, because that
 * is the unit this tree ships in and a date would say "recent" for a tree that had moved forty times.
 */
export function auditAge(audit, currentVersion) {
    // `at`, not `frozenAt`: the field is called `at` and reading the wrong name returns undefined forever,
    // which is how "how old is the source" went unasked. The freezer DERIVES it from main.js now -- it used to
    // write the string "v4380" as a literal, so every re-freeze produced a file claiming a version it was not
    // taken at, including one taken while measuring this very species of defect.
    const at = Number(String(audit.at || "").replace(/[^0-9]/g, "")) || null;
    const now = Number(String(currentVersion || "").replace(/[^0-9]/g, "")) || null;
    return { frozenAt: audit.at || null, current: currentVersion || null,
             rounds: at && now ? now - at : null };
}
