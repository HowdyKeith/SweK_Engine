// WebGLEngine/tools/ship/studyJobs.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/studyRunner.mjs; the gate is tools/ship/studyJobs-selfcheck.mjs)
//
// THE STUDIES A PEER MAY RUN (Keith, 2026-11-26: "Any reports that we want to have the rig run, let's use the new SweK peer report runner"). The Brain Job Repo Report Runner (tools/ship/peerJobs*.mjs) ran only the
// head-to-head series: a `rounds` job always became tools/ship/rigRunner.mjs --rounds N. A `study` job names one entry of THIS closed registry, and tools/ship/studyRunner.mjs runs that entry's fixed command lines.
// *** A JOB STILL CARRIES NO COMMAND. *** The job file holds only a study NAME (checked against a pattern by the queue, and against this registry by the runner AT THE JOB'S COMMIT, so a peer whose own engine is older
// cannot be told to run something its reviewed code does not hold). Every command line is built here from the entry and the part number; nothing from the job reaches it but the worker count.
//
// Two kinds of entry:
//   "replay" -- fly a registered set AGAIN into a scratch folder and compare it, row for row, with the files committed for it. The question is "does this machine reproduce the record?", and the answer is
//               IDENTICAL or DIFFERS with the first differing row named. Timing fields (each entry's `ignore`) are taken out first, and each row is compared on the COMMITTED row's own fields (fields the code
//               learned to record later are listed, not compared). Nothing is read: the verdict of the round is not recomputed.
//   "fly"    -- fly a registered set for the first time into its committed folder, so the files come back to be committed unread and read once in the session that registered it. (None is registered yet:
//               a new round adds its entry in the same commit that registers it.)
// What comes back: everything the runner writes flat into rig-out/ (the runner's job collector skips sub-folders): <id>-part<k>.log, <id>--<file> for each produced file, and <id>-report.json.
// Pure: no I/O. The runner does the I/O.
"use strict";

export const STUDY = /^[a-z0-9][a-z0-9-]{2,62}$/;
const partsOf = (set, K) => Array.from({ length: K }, (_, i) => `${set}-${i + 1}of${K}.json`);

/** The registry. Frozen; an entry is { id, what, mode, parts, argv(k, K, dir), committedDir?, files?, ignore? }. argv is relative to WebGLEngine/ and runs under node. */
export const STUDIES = Object.freeze([
    Object.freeze({
        id: "rock-nav-a-dev-replay", mode: "replay", parts: 4,
        what: "Rock nav Round A's DEV (space seeds 3101-3130 x 4 kinds, arms D and N; brain/ROCK_NAV_WIP.md), flown again and compared row for row with brain/rig-results/rock-nav/dev-*of4.json",
        argv: (k, K, dir) => ["tools/ship/rockNavStudyCmd.mjs", "dev", "--part", `${k}/${K}`, "--dir", dir],
        committedDir: "brain/rig-results/rock-nav", files: partsOf("dev", 4), ignore: Object.freeze({ file: ["seconds"], row: [], probe: [] }),
    }),
    Object.freeze({
        id: "rock-nav-c-dev-replay", mode: "replay", parts: 4,
        what: "Rock nav Round C's DEV (space seeds 3501-3530 x 4 kinds, arms L and F: the field that follows the ship), flown again and compared row for row with brain/rig-results/rock-nav/devC-*of4.json",
        argv: (k, K, dir) => ["tools/ship/rockNavStudyCmd.mjs", "devC", "--part", `${k}/${K}`, "--dir", dir],
        committedDir: "brain/rig-results/rock-nav", files: partsOf("devC", 4), ignore: Object.freeze({ file: ["seconds"], row: [], probe: ["buildMs"] }),
    }),
]);

/** The entry named `id`, or null. */
export const studyOf = (id) => (typeof id === "string" && STUDY.test(id) ? STUDIES.find((s) => s.id === id) || null : null);

/** The command lines of a study, one per part: [{ k, argv }]. Throws on an unknown study. */
export function planOf(id, dir) {
    const s = studyOf(id);
    if (!s) throw new Error(`studyJobs.planOf: no study ${JSON.stringify(id)} (known: ${STUDIES.map((x) => x.id).join(", ")})`);
    return Array.from({ length: s.parts }, (_, i) => ({ k: i + 1, argv: s.argv(i + 1, s.parts, dir) }));
}

const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** `v` cut down to the key tree of `shape` (objects recursively; arrays and values as they are), and the dotted paths `v` has that `shape` does not. */
export function projectOnto(v, shape, at = "", extra = []) {
    if (!isObj(v) || !isObj(shape)) return { value: v, extra };
    const out = {};
    for (const k of Object.keys(v)) { if (!(k in shape)) extra.push(at + k); }
    for (const k of Object.keys(shape)) if (k in v) out[k] = projectOnto(v[k], shape[k], at + k + ".", extra).value;
    return { value: out, extra };
}
/** A file's head and rows with the entry's timing fields taken out: { head, rows } (objects, not text). */
export function stripTiming(text, ignore) {
    const j = JSON.parse(text), { rows = [], ...head } = j;
    for (const k of ignore.file) delete head[k];
    return { head, rows: rows.map((r) => { const c = { ...r }; for (const k of ignore.row) delete c[k]; if (isObj(c.probe)) { c.probe = { ...c.probe }; for (const k of ignore.probe) delete c.probe[k]; } return c; }) };
}

/**
 * Compare one produced file with its committed copy, ON THE COMMITTED RECORD'S OWN FIELDS: each produced row is cut down to the key tree of the committed row before the two are compared, because the code may
 * have learned to record more since the record was flown (Round B and C added probe fields Round A's rows never had). The fields added since are listed (`added`), never compared and never a difference.
 * { file, rows, same, head, verdict: IDENTICAL | DIFFERS, firstDiff: { index, seed, kind, arm, keys } | null, added: [dotted paths] }.
 */
export function compareFile(name, producedText, committedText, ignore) {
    const a = stripTiming(committedText, ignore), b = stripTiming(producedText, ignore), added = new Set();
    let firstDiff = null, same = 0;
    const n = Math.max(a.rows.length, b.rows.length);
    for (let i = 0; i < n; i++) {
        const x = a.rows[i], y = b.rows[i];
        const proj = x && y ? projectOnto(y, x) : { value: y, extra: [] };
        for (const e of proj.extra) added.add(e);
        if (x && y && JSON.stringify(sorted(x)) === JSON.stringify(sorted(proj.value))) { same++; continue; }
        if (!firstDiff) {
            const X = x || {}, Y = proj.value || {};
            const keys = [...new Set([...Object.keys(X), ...Object.keys(Y)])].filter((k) => JSON.stringify(sorted(X[k])) !== JSON.stringify(sorted(Y[k]))).sort();
            firstDiff = { index: i, seed: X.seed ?? Y.seed ?? null, kind: X.kind ?? Y.kind ?? null, arm: X.arm ?? Y.arm ?? null, keys };
        }
    }
    const headProj = projectOnto(b.head, a.head);
    for (const e of headProj.extra) added.add("file." + e);
    const head = JSON.stringify(sorted(a.head)) === JSON.stringify(sorted(headProj.value));
    return { file: name, rows: n, same, head, verdict: head && same === n && a.rows.length === b.rows.length ? "IDENTICAL" : "DIFFERS", firstDiff, added: [...added].sort() };
}

/** The study's verdict from its per-file comparisons: IDENTICAL only when every file is; DIFFERS otherwise; INCOMPLETE when a file is missing (`null` in the list). */
export function verdictOf(results) {
    if (!results.length || results.some((r) => r === null)) return "INCOMPLETE";
    return results.every((r) => r.verdict === "IDENTICAL") ? "IDENTICAL" : "DIFFERS";
}

export function reportLines() {
    return ["[studyJobs] the studies a peer may run for the Brain Job Repo Report Runner (a `study` job names one; tools/ship/studyRunner.mjs runs it at the job's commit)",
        ...STUDIES.map((s) => `  ${s.id} (${s.mode}, ${s.parts} parts): ${s.what}`)];
}
