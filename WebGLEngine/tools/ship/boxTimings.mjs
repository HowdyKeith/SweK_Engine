// WebGLEngine/tools/ship/boxTimings.mjs -- v4679
//
// *** THE CROSS-BOX FALLBACK WRITES A FILE NOBODY READS. ***
//
// v4647 made sweep-timings.json refuse a foreign write, correctly, and for the reason the refusal states:
// "two machines' runtimes in one set of fields is not a record, it is whichever ran last". A foreign box is
// redirected to tools/ship/sweep-timings.local.json instead.
//
// THAT FILE WAS WRITTEN AND NEVER READ. Before this round `LOCAL_TIMINGS` occurred six times in the tree: its
// definition, one default parameter in timingsTarget, and four assertions in two gates that check the
// FILENAME and the ROUTING DECISION. Nothing consulted its contents.
//
// MEASURED CONSEQUENCE, from the rig's own v4667 verify:
//
//     [sweep] NOT writing tools/ship/sweep-timings.json: the record belongs to linux-x64-4c-16096mb-142c0d
//             and this box is win32-x64-12c-32678mb-b70b27 -- writing sweep-timings.local.json instead
//     [verify] NOTE: the membership list came from linux-x64-4c-16096mb-142c0d, not this box. 91 of the 1409
//              gates it named are over the 3000 ms budget HERE
//
// The rig produced 1,409 of its own readings, wrote them to the dead file, selected its gates from a cloud
// container's numbers, and discarded what it had measured. Every sweep it has ever run did this.
//
// *** AND THE SHARED RECORD IS NOW UNWRITABLE BY ANYONE. *** Its host is a LINUX 4-core container. The rig can
// never claim it; the container that could is ephemeral and gone, and a new one hashes differently because
// boxId() includes an md5 of the CPU model and the pool draws different Xeons. So every round that adds a gate
// leaves recordDrift's "sweep timings" row red, permanently, with no action that can clear it.
//
// *** THE REPAIR IS TO SEPARATE TWO QUESTIONS THAT HAVE BEEN ONE. ***
//
//   COVERAGE -- "has this gate ever been timed, anywhere?" A gate with no reading on any box is genuinely
//               unmeasured, and that is what a staleness check is for. ANY box's record answers it, so the
//               question must NOT be host-scoped.
//   COST     -- "what does this gate cost ON THIS BOX?" Only this box's record answers it, and a foreign
//               reading is not an answer; it is the thing hostScale exists to absorb.
//
// Conflating them is why a correct refusal produced a permanently red row: the check asked the COVERAGE
// question of a COST-scoped record.
//
// WHAT THIS ROUND CHANGES: coverage only, and the filename a foreign box writes. THE BUDGET READERS ARE NOT
// TOUCHED -- quickSweep's costOf, sweepCoverage, recordInputs and mechanical all still read the shared file,
// which on the rig still means a foreign box's numbers. That is the larger half, it changes WHICH GATES THE
// SWEEP RUNS, and quickSweep.mjs's own v4647 note already calls it "a different round with a different risk".
// It is task #87 and it is not pretended to be done here.
//
// AND THE OVERLAP IS NAMED RATHER THAN DISCOVERED LATER: origin/claude/v4672-relative-budget solves a
// DIFFERENT defect in this area -- it divides a reading by the measured scale of the capture pass, so a gate
// evicted because the hour was slow is readmitted ("the gate was not slow, the hour was"). It does not address
// an unwritable record or an unread file, and it touches quickSweep.mjs where this touches a new module. If
// both land, the cost half should be built on ITS scale machinery rather than a second copy.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { boxId } from "./hostScale.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The three names this module knows. `legacy` is the single-name file v4647 wrote and is still READ, so the
 *  rig's existing measurements are not orphaned by the rename to a per-box name. */
export const FILES = Object.freeze({
    shared: "tools/ship/sweep-timings.json",
    legacy: "tools/ship/sweep-timings.local.json",
    /** Named BY BOX so two machines cannot fight over one filename -- v4647's argument about FIELDS, applied
     *  one level up to FILES. A box that writes its own name can never overwrite another's readings. */
    perBox: (id = boxId()) => `tools/ship/sweep-timings.${id}.json`,
});

/** Every timings record present in the tree, shared first, each carrying the host that wrote it. */
export function records(root = ENG) {
    const out = [];
    const push = (rel, kind) => {
        try {
            const j = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
            if (j && j.timings) out.push({ file: rel, kind, host: j.host || null, rec: j });
        } catch { /* absent or unreadable: a box with no record simply has none, which is not an error */ }
    };
    push(FILES.shared, "shared");
    push(FILES.legacy, "legacy");
    let names = [];
    try { names = fs.readdirSync(path.join(root, "tools", "ship")); } catch {}
    for (const n of names.sort()) {
        if (!/^sweep-timings\..+\.json$/.test(n) || n === "sweep-timings.local.json") continue;
        push("tools/ship/" + n, "per-box");
    }
    return out;
}

/**
 * *** THE COVERAGE QUESTION: which gates have a reading on ANY box, and whose. ***
 * `mine` is per entry, so a caller can tell a local measurement from a foreign one WITHOUT being forced to
 * pick -- the distinction v4647's refusal is about, kept rather than collapsed into one number.
 */
export function coverage(root = ENG, { id = boxId() } = {}) {
    return coverageOf(records(root), { id });
}

/**
 * The same question over records HANDED IN rather than read off disk.
 *
 * *** THIS SPLIT EXISTS BECAUSE THE FIRST VERSION BROKE recordDrift'S OWN SABOTAGES. *** That gate injects a
 * timings record missing a stamp, or missing a reading, and asserts the staleness check notices. Routing the
 * check through a function that reads the REAL FILES made the fixture unreachable: two sabotage rows went red
 * and the check could no longer be driven at all. A staleness check nothing can falsify is a worse defect than
 * the unclearable ratchet this round set out to fix, and the gate caught it on the first run.
 */
export function coverageOf(recs, { id = boxId() } = {}) {
    const by = new Map();
    for (const r of recs) {
        const host = r.host || "(unclaimed)";
        const mine = host === id;
        for (const [gate, ms] of Object.entries(r.rec.timings || {})) {
            if (typeof ms !== "number") continue;
            const prev = by.get(gate);
            // This box's own reading wins when there is one; otherwise the first record carrying the gate.
            if (prev && !(mine && !prev.mine)) continue;
            by.set(gate, { gate, ms, mine, host, from: r.file,
                           at: (r.rec.at || {})[gate] || null, kind: (r.rec.kinds || {})[gate] || null });
        }
    }
    const vals = [...by.values()];
    return {
        thisBox: id,
        records: recs.map((r) => ({ file: r.file, kind: r.kind, host: r.host,
                                    entries: Object.keys(r.rec.timings || {}).length })),
        entries: by,
        covered: (gate) => by.has(gate),
        localCount: vals.filter((e) => e.mine).length,
        foreignCount: vals.filter((e) => !e.mine).length,
    };
}

/**
 * *** THE WRITER A ROUND THAT ADDS A GATE NEEDS. *** Times the named gates ON THIS BOX and merges them into
 * this box's own record. Serial on purpose: a contended sample and an uncontended one are different
 * quantities -- which is why the shared record carries `kinds` at all -- and these are filed as `alone`.
 *
 * A gate killed at the cap is recorded as `capped` with the cap as its ms: a FLOOR, not a runtime, and never
 * silently dropped, because a missing entry and a slow gate are the two things this whole file keeps apart.
 */
export function recordLocal(gates, { root = ENG, id = boxId(), capMs = 200000, run = null, now = null } = {}) {
    const rel = FILES.perBox(id);
    const abs = path.join(root, rel);
    let rec = null;
    try { const j = JSON.parse(fs.readFileSync(abs, "utf8")); if (j && j.timings) rec = j; } catch {}
    if (!rec) rec = { host: id, note: "", captured: null, timings: {}, at: {}, kinds: {}, codes: {} };
    rec.host = id;
    rec.note = "THIS BOX'S OWN gate runtimes, written by tools/ship/boxTimings.mjs. The shared " +
        "sweep-timings.json is host-claimed and a foreign box cannot write it (v4647, and that refusal is " +
        "right); this is how a box records what IT measured without overwriting another machine's numbers. " +
        "`kinds` says which quantity each ms is, as in the shared record: `alone` is an uncontended serial " +
        "reading, `capped` is a FLOOR and not a runtime. Read for COVERAGE -- has this gate ever been timed " +
        "-- and NOT for the ship-time budget, which still reads the shared file. See task #87.";
    const stamp = now || new Date().toISOString();
    rec.captured = stamp;
    const wrote = [];
    for (const g of gates) {
        const t0 = Date.now();
        const r = run ? run(g, capMs)
                      : spawnSync(process.execPath, [g], { cwd: root, timeout: capMs, stdio: "ignore" });
        const ms = Date.now() - t0;
        const capped = !!(r && r.signal);
        rec.timings[g] = ms;
        rec.at[g] = stamp;
        rec.kinds[g] = capped ? "capped" : "alone";
        rec.codes[g] = capped ? null : (r && typeof r.status === "number" ? r.status : null);
        wrote.push({ gate: g, ms, capped, code: rec.codes[g] });
    }
    fs.writeFileSync(abs, JSON.stringify(rec, null, 1) + "\n");
    return { file: rel, host: id, wrote, total: Object.keys(rec.timings).length };
}
