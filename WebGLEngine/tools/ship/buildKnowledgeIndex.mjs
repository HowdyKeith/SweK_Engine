// WebGLEngine/tools/ship/buildKnowledgeIndex.mjs -- v2888
//
// ONE SEARCHABLE ANSWER TO "DOES THIS ALREADY EXIST?"
//
// This session's most repeated failure was not a bug. Five separate times I proposed or rebuilt something the
// tree already had -- a broad phase (five of them existed), a coupled-physics instrument (thermal2d was already
// one), an SPH hydrostatic check (built and passing since v2494), occlusionRamp (wired at v2831). Each time the
// thing existed, was gated, and was unfindable without reading a file I did not know to open.
//
// v2878 made the 24 instrument PAGES findable. v2883 added the 38 suite checks after one of those rebuilds.
// That still left THE TWO LARGEST BODIES OF KNOWLEDGE IN THE TREE INVISIBLE: 381 gate files and 240 claims.
//
// A BROWSER CANNOT WALK A FILESYSTEM, so the page needs a prebuilt index. A prebuilt index ROTS -- which is the
// failure this whole session keeps meeting -- so buildIndex() is deterministic and a gate rebuilds it and
// compares. A stale index fails the ship rather than quietly answering yesterday's question.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractClaims } from "./claimsGate.mjs";
import { gateFiles } from "./staleness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const OUT = path.join(ENG, "knowledge-index.json");
const SKIP = /node_modules|[\\/]\.git|[\\/]vendor|GPU_Assets|demos_code/;

function walk(dir, test, out = []) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { return out; }
    for (const f of entries) {
        const p = path.join(dir, f);
        if (SKIP.test(p)) continue;
        let st; try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, test, out);
        else if (test(f)) out.push(p);
    }
    return out;
}

/**
 * A gate's PURPOSE, taken from its own header. Every gate in this tree opens with a comment block explaining what
 * it guards and why -- so the file already documents itself and this only has to find the sentence.
 */
function gatePurpose(src) {
    const lines = src.split("\n").slice(0, 40);
    for (const l of lines) {
        const t = l.replace(/^\s*\/\/ ?/, "").trim();
        if (!t) continue;
        if (/^(Run:|Gated by|WebGLEngine\/|tools\/|physics\/|simulation\/)/.test(t)) continue;
        if (t.length < 25) continue;
        return t.slice(0, 220);
    }
    return "";
}

export function buildIndex() {
    // USE THE AUTHORITATIVE WALKER, DO NOT WRITE A SECOND ONE -- the same law the claims block below states, which
    // this line spent from v2888 to v3041 breaking four lines above where it was written down.
    //
    // What was here: walk(ENG, (f) => /selfcheck.*\.mjs$/.test(f)). staleness.mjs uses /-selfcheck\.mjs$/. The two
    // differ on exactly one file, tools/ship/selfchecks.mjs -- THE RUNNER, matched as a gate by the loose pattern.
    // So the index has been claiming one more gate than exists for 153 versions, and nothing went red because the
    // NUMBER BAKED INTO THE FILE happened to agree with the other walk. The moment a gate was added the two
    // counters disagreed and staleness caught it. A count that is only correct while nothing changes is not a
    // measurement, it is a coincidence with a good record.
    const gates = gateFiles().map((p) => {
        const rel = path.relative(ENG, p).replace(/\\/g, "/");
        let purpose = "";
        try { purpose = gatePurpose(fs.readFileSync(p, "utf8")); } catch {}
        return { kind: "gate", id: path.basename(p, ".mjs"), path: rel, text: purpose };
    }).sort((a, b) => a.path.localeCompare(b.path));

    // USE THE AUTHORITATIVE PARSER, DO NOT WRITE A SECOND ONE. My first version regex-scraped predictions.html
    // and got 239 where claimsGate reads 240 -- a second implementation of one job, already disagreeing with the
    // original by one row on its first run. That is the precise drift this session kept paying for (five
    // structures that never met, a mutation patching a path no test runs), so: import extractClaims.
    let claims = [];
    try {
        const html = fs.readFileSync(path.join(ENG, "predictions.html"), "utf8");
        const parsed = extractClaims(html);
        claims = parsed.map((c) => ({ kind: "claim", id: String(c.since || "?"), state: String(c.state || "?"),
                                      text: String(c.name || "").slice(0, 220) }));
    } catch {}

    // v2994 -- FINDINGS. The nine ANALYSIS RECORDS the census identified exist to HOLD A MEASUREMENT, and none
    // of what they hold was searchable. Tested before building: "Tait", "detection floor", "vacuous", "prompt
    // cost", "crossover" -- ALL FIVE returned zero gates and zero claims. Every one is a real result this
    // project measured and wrote down.
    //
    // That is the same discoverability failure as v2883 (38 suite checks invisible) and v2888 (381 gates, 240
    // claims invisible), one level further in: the FINDINGS were unfindable even though the files holding them
    // were indexed. A gate's header says what it guards, not what it learned.
    const findings = [];
    for (const f of walk(ENG, (n) => /\.mjs$|\.js$/.test(n))) {
        let src = "";
        try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        // The same shape the census uses to recognise an analysis record -- derived, never declared.
        for (const m of src.matchAll(/export\s+const\s+(MEASURED[A-Z_0-9]*|[A-Z_0-9]*REGISTRATION|[A-Z_0-9]*OUTCOMES|[A-Z_0-9]*_V\d+)\s*=/g)) {
            // Take the contiguous run of // lines immediately above the export -- that is where the finding is
            // written. My first version walked backwards with a condition that stopped on the first line and
            // indexed almost nothing: 17 findings recorded, and four of five test searches still returned zero.
            // The symptom looked like "these findings are not written down" and the cause was a broken reader --
            // the same confusion this project has now had three times (a mutation whose find-string had drifted,
            // a lint scanning 4 of 9 files, a parser reporting "could not parse" for its own generator).
            const upto = src.slice(0, m.index).split("\n");
            const note = [];
            for (let i = upto.length - 2; i >= 0; i--) {
                const t = upto[i].trim();
                if (t.startsWith("//")) note.unshift(t.replace(/^\/\/ ?/, ""));
                else if (t === "") { if (note.length) break; }
                else break;
            }
            findings.push({ kind: "finding", id: m[1], path: path.relative(ENG, f).replace(/\\/g, "/"),
                            // THE TAIL, NOT THE HEAD -- and 1400 rather than 400. At 400 from the front, MEASURED_V2881 captured only its section header and "Tait" --
                            // the actual finding -- fell outside the window, so a search for it returned nothing while the
                            // finding sat indexed. A truncation that cuts before the substance indexes the filing, not the result.
                            text: note.join(" ").replace(/\s+/g, " ").slice(-1400) });
        }
    }
    findings.sort((a, b) => (a.path + a.id).localeCompare(b.path + b.id));

    return { built: "deterministic", gates, claims, findings,
             counts: { gates: gates.length, claims: claims.length, findings: findings.length } };
}

export function writeIndex() {
    const idx = buildIndex();
    fs.writeFileSync(OUT, JSON.stringify(idx, null, 0));
    return idx;
}

export function readIndex() {
    try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { return null; }
}

/**
 * WHAT CHANGED BETWEEN TWO INDEXES, KEYED BY PATH -- because the checks that compare them could only say
 * WHETHER, and one of them could not even say that.
 *
 * *** v4587 -- THE INDEX WAS STALE FOR THREE ROUNDS AND THE PRE-FLIGHT SAID "index agrees" EVERY TIME. ***
 * recordDrift's knowledge-index check was `K.gates.length !== onDisk` -- A POPULATION COUNT WEARING THE NAME OF
 * A CONTENT CHECK. Adding or removing a gate moves the count and it catches that; EDITING A GATE'S HEADER does
 * not, and the header text is the entire reason this index exists ("one searchable answer to does this already
 * exist?"). v4585 added redAction-selfcheck with a placeholder runtime line, filled in the real measurement the
 * same round, and the index kept the placeholder through v4585, v4586 and two commits of v4586's follow-up.
 * instruments-selfcheck DID compare bytes and was red the whole time -- read below for how that red read.
 *
 * *** AND KEYING THIS BY `id` IS THE TRAP THAT MANUFACTURED A PHANTOM FINDING. *** `id` is path.basename, and 25
 * of them collide across 50 files (physics/X vs tools/roundhouse/X, eighteen times; plus downloadScan, fleet,
 * frontDoor, fresnel, volume, mpmDevice). A throwaway comparison keyed on `id` built a Map that kept one entry
 * per basename, reported 26 entries "changed" between two identical builds, and that non-finding was carried
 * into a round summary as the next round's scope. THE REAL DRIFT WAS ONE ENTRY. Nothing in the tree keys on
 * `id` -- instruments.html renders it beside `path` and filters on both -- so the uniqueness was never owed;
 * what was owed was not assuming it. `path` is unique: 1643 entries, 1643 paths.
 *
 * Returns { same, added, removed, changed, summary } where changed names the fields that differ, so a red can
 * say WHAT moved instead of how many things exist.
 */
export function diffIndex(a, b) {
    const byPath = (idx) => new Map(((idx && idx.gates) || []).map((g) => [g.path, g]));
    const A = byPath(a), B = byPath(b);
    const added = [...B.keys()].filter((k) => !A.has(k)).sort();
    const removed = [...A.keys()].filter((k) => !B.has(k)).sort();
    const changed = [];
    for (const [k, gb] of B) {
        const ga = A.get(k);
        if (!ga) continue;
        const fields = ["kind", "id", "path", "text"].filter((f) => ga[f] !== gb[f]);
        if (fields.length) changed.push({ path: k, fields, was: ga.text, now: gb.text });
    }
    // The non-gate sections are counted rather than diffed: claims come from one parsed page and findings from a
    // comment scan, and neither has a stable per-entry key to diff ON. Saying so beats implying a comparison
    // that is not being made.
    const others = ["claims", "findings"].map((k) => {
        const na = ((a && a[k]) || []).length, nb = ((b && b[k]) || []).length;
        return na === nb ? null : `${k} ${na} -> ${nb}`;
    }).filter(Boolean);
    const same = !added.length && !removed.length && !changed.length && !others.length &&
                 JSON.stringify(a) === JSON.stringify(b);
    const bits = [];
    if (added.length) bits.push(`${added.length} added (${added.slice(0, 3).join(", ")}${added.length > 3 ? ", ..." : ""})`);
    if (removed.length) bits.push(`${removed.length} removed (${removed.slice(0, 3).join(", ")}${removed.length > 3 ? ", ..." : ""})`);
    if (changed.length) bits.push(`${changed.length} changed: ` +
        changed.slice(0, 3).map((c) => `${c.path} [${c.fields.join("+")}]`).join(", ") + (changed.length > 3 ? ", ..." : ""));
    if (others.length) bits.push(others.join("; "));
    // BYTE-IDENTICAL IS THE CLAIM, so a difference this function cannot name is still a difference: say that
    // rather than reporting "same" for a file whose bytes disagree.
    if (!bits.length && !same) bits.push("byte difference outside the gate list, claim count and finding count");
    return { same, added, removed, changed, summary: same ? "byte-identical" : bits.join("; ") };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const idx = writeIndex();
    console.log("[knowledge] " + idx.counts.gates + " gates, " + idx.counts.claims + " claims -> knowledge-index.json (" +
                (fs.statSync(OUT).size / 1024).toFixed(0) + " KB)");
}
