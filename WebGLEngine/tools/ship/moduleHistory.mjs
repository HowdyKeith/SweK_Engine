// tools/ship/moduleHistory.mjs
//
// v3203 -- WHICH SHIPPED ZIP LAST HELD THIS FILE, AND WHEN DID IT VANISH?
//
// THE SHIPPED ZIP HAS BEEN THE BACKUP FIVE TIMES: v3140 (an orphan-baseline overwrite), v3159 (SSAOPass and
// SpatialHash, which the gate caught), v3176 (ui/knownState.js, seventeen versions after it was swept), v3201
// (brain/blobAutoTrain.mjs, forty-one versions after) and v3202 (66 modules and render/entityDebugRenderer.js).
// Every one of those was the SAME QUESTION and every one was answered by hand, by unzipping candidate archives
// and looking. Twice the answer arrived so late that the loss had been rationalised as "a module built to be
// adopted looks exactly like one nobody wanted".
//
// A QUESTION ASKED FIVE TIMES IS A MISSING TOOL, and the useful form of it is not "is this file in that zip" but
// the pair of versions either side of the disappearance -- because that pair names the ROUND that did it, and a
// round has a changelog entry, a diff and an author. LAST-PRESENT AND FIRST-ABSENT ARE THE ANSWER; a bare
// present/absent list makes the reader do the bisection.
//
// WHY IT DOES NOT SHELL OUT TO unzip: tools/roundhouse/safeExtract.mjs already parses the ZIP container with
// zlib and fs, for reasons its own header sets out at length, and readCentralDirectory is exactly the primitive
// this needs. A SECOND ZIP READER IN THIS TREE WOULD BE THE THIRD, and two definitions of one question is the
// defect this whole round exists to repair -- see removeCluster.mjs's v3203 header. Reused, not copied.
//
// SCOPE, STATED SO IT CANNOT BE OVERSOLD:
//   - It reads the CENTRAL DIRECTORY only. It answers "did this path exist in that build", not "were the bytes
//     the same". A file present in both zips with different contents reads as present in both, correctly.
//   - AN ARCHIVE THAT HOLDS NO ZIPS IS A REFUSAL, NOT AN EMPTY HISTORY. A history with no versions in it looks
//     exactly like a file that never existed, and the second reads as a finding. Same law as renderQaDoor's
//     zero-match exit (v3126) and gatesBridge's refuse-with-the-fix rule (v2806).
//   - A GAP IN THE ARCHIVE IS NAMED. Keith keeps the two newest zips by the ship ritual's own trim step, so the
//     archive is SPARSE by design; "first absent at v3202" means the first archived version that lacks it, and
//     the round that removed it may be any version after the last present one. The gap is reported as a RANGE
//     rather than collapsed to a single guilty version, because narrowing it further needs a zip nobody kept.

import fs from "node:fs";
import os from "node:os";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCentralDirectory } from "../roundhouse/safeExtract.mjs";
import { walkCode, resolves, specifiersIn } from "./deadImportScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");

// v3205 -- THIS REJECTED HALF OF KEITH'S ARCHIVE AND NEVER SAID SO.
//
// A browser that downloads the same build twice writes "SweK_Engine_v2287 (1).zip", and this anchored pattern
// did not match it. Five of Keith's zips were suffixed that way, so those builds were INVISIBLE to every route
// on this page -- and a version that exists ONLY as a "(1)" copy would be reported "not in any archived build"
// with complete confidence. A PATTERN THAT CANNOT SPELL WHAT IT IS LOOKING AT REPORTS ABSENCE, which is the
// same shape as SPEC's `}from` and noComments' regex literals. Third time this week.
//
// The version is now taken by MATCH rather than by casting the whole tail, and anything after the digits is
// allowed. Sorting stays NUMERIC on the captured digits.
const ZIP_NAME = /^SweK_Engine_v(\d+)\b.*\.zip$/i;

// v3210 -- THIS SETTING LIVES OUTSIDE THE VERSION FOLDER, BECAUSE THE VERSION FOLDER IS DISPOSABLE.
//
// v3208 put it at tools/ship/archive-dirs.json -- INSIDE the build. Keith pointed the page at D:\SweK_Archives,
// it indexed 124 builds where it had seen two, and that setting WOULD HAVE BEEN GONE the moment he extracted the
// next zip. It even ships as {"dirs": []}, so the new folder would arrive quietly resetting it.
//
// I built that one round after telling him restored files are lost on the next update. THE VERSION FOLDER IS
// REPLACED WHOLESALE BY EVERY UPDATE -- anything a person configures must live where auth.json, the credential
// vault and just-updated.json already live, and those are in ~/.voxelbridge for exactly this reason.
//
// A setting that silently resets is worse than one that was never offered: the page keeps answering, out of a
// smaller archive, with no sign anything changed.
const HOME = process.env.HOME || process.env.USERPROFILE || os.tmpdir();
export const ARCHIVE_CONFIG = path.join(HOME, ".voxelbridge", "archive-dirs.json");
/** Where v3208 wrongly kept it. Read once, migrated, never written again. */
const LEGACY_ARCHIVE_CONFIG = path.join(ENG, "tools", "ship", "archive-dirs.json");

/**
 * v3208 -- WHERE THE ARCHIVES ACTUALLY ARE IS NOT SOMETHING THIS FILE CAN KNOW.
 *
 * This used to be a fixed list: the project parent, its parent, Downloads, Desktop. Keith keeps SweK zips going
 * back to v2282 ON A SECOND DRIVE, and this tool COULD NOT SEE ONE OF THEM. It did not say so -- it reported
 * "not in any archived build" about files sitting on D:\, with exactly the same confidence it uses for a file
 * that genuinely never shipped. THAT IS THE SAME DEFECT AS THE "(1)" SUFFIX AND AS SPEC's `}from`, one layer
 * out: A SEARCH THAT CANNOT REACH SOMEWHERE REPORTS ITS ABSENCE RATHER THAN ITS OWN LIMIT.
 *
 * Now: the defaults remain, plus anything in tools/ship/archive-dirs.json (written by the page) and anything in
 * SWEK_ARCHIVE_DIRS. The searched list travels WITH every answer so a caller can see what was actually looked at.
 */
export function defaultArchiveDirs() {
    const root = path.resolve(ENG, "..");
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const out = [root, path.resolve(root, "..")];
    if (home) out.push(path.join(home, "Downloads"), path.join(home, "Desktop"));
    for (const d of configuredArchiveDirs()) out.push(d);
    for (const d of String(process.env.SWEK_ARCHIVE_DIRS || "").split(path.delimiter)) if (d.trim()) out.push(d.trim());
    return out.filter((d, i, a) => a.indexOf(d) === i);
}

/** Extra directories the user has added. Never throws -- a corrupt config must not break the whole page. */
export function configuredArchiveDirs() {
    const read = (f) => {
        try {
            const j = JSON.parse(fs.readFileSync(f, "utf8"));
            return Array.isArray(j.dirs) ? j.dirs.filter((d) => typeof d === "string" && d.trim()) : [];
        } catch { return []; }
    };
    const live = read(ARCHIVE_CONFIG);
    if (live.length) return live;
    // MIGRATE ONCE, SILENTLY, AND ONLY UPWARDS. A v3208 folder still on disk may hold the only copy of a path
    // the user typed; reading it costs nothing and losing it costs them the whole D: archive again.
    const legacy = read(LEGACY_ARCHIVE_CONFIG);
    if (legacy.length) { try { writeDirs(legacy); } catch {} }
    return legacy;
}

function writeDirs(dirs) {
    fs.mkdirSync(path.dirname(ARCHIVE_CONFIG), { recursive: true });
    fs.writeFileSync(ARCHIVE_CONFIG, JSON.stringify({ dirs }, null, 2) + "\n");
}

/**
 * Add a directory. RETURNS A VERDICT RATHER THAN A BARE OK: a path that does not exist, or exists and holds no
 * SweK zips, is the single most likely mistake here (a typo, or the wrong drive letter), and silently accepting
 * it would put the tool straight back to answering "not in any archived build" from a folder it cannot read.
 */
export function addArchiveDir(dir) {
    const d = String(dir || "").trim();
    if (!d) return { ok: false, why: "empty path" };
    let exists = false, zips = 0;
    try { exists = fs.statSync(d).isDirectory(); } catch {}
    if (!exists) return { ok: false, why: "not a directory this machine can read: " + d };
    zips = indexArchive(d).length;
    const cur = configuredArchiveDirs();
    if (!cur.includes(d)) cur.push(d);
    writeDirs(cur);
    return { ok: true, dir: d, zips, config: ARCHIVE_CONFIG,
             why: zips ? null : "added, but it holds no SweK_Engine_v*.zip -- check the path" };
}

export function removeArchiveDir(dir) {
    const cur = configuredArchiveDirs().filter((d) => d !== String(dir || "").trim());
    writeDirs(cur);
    return { ok: true, dirs: cur };
}

/**
 * Every SweK_Engine_vNNNN.zip in a directory, newest last.
 * Returns [{ version, n, file }]. Sorted NUMERICALLY -- a string sort puts v999 after v3158.
 */
export function indexArchive(dir) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return []; }
    const found = [];
    for (const name of names) {
        const m = ZIP_NAME.exec(name);
        if (!m) continue;
        found.push({ version: "v" + m[1], n: Number(m[1]), file: path.join(dir, name) });
    }
    return found.sort((a, b) => a.n - b.n);
}

/** Index several directories at once, de-duplicating by version (the first directory wins). */
export function indexArchives(dirs = defaultArchiveDirs()) {
    const byVersion = new Map();
    const searched = [];
    for (const d of dirs) {
        const hits = indexArchive(d);
        searched.push({ dir: d, found: hits.length });
        for (const h of hits) if (!byVersion.has(h.n)) byVersion.set(h.n, h);
    }
    return { builds: [...byVersion.values()].sort((a, b) => a.n - b.n), searched };
}

/**
 * Every path inside one zip, normalised to be comparable with a path inside the working tree.
 * A shipped zip holds exactly one root (the ship ritual's own verify gate enforces that), so the first path
 * component is dropped and what is left is root-relative: "WebGLEngine/main.js".
 */
export function pathsIn(zipFile) {
    const buf = fs.readFileSync(zipFile);
    const entries = readCentralDirectory(buf);
    const out = new Set();
    for (const e of entries) {
        const name = String(e.name || "").replace(/\\/g, "/");
        if (!name || name.endsWith("/")) continue;              // a directory entry is not a file
        const cut = name.indexOf("/");
        if (cut < 0) continue;                                  // a file at the zip's top level has no project root
        out.add(name.slice(cut + 1));
    }
    return out;
}

/** An engine-relative path ("ui/PerfHUD.js") as it appears inside a zip ("WebGLEngine/ui/PerfHUD.js"). */
export function asArchivePath(engineRel) {
    const clean = String(engineRel).replace(/\\/g, "/").replace(/^\.?\//, "");
    return clean.startsWith("WebGLEngine/") ? clean : "WebGLEngine/" + clean;
}

/**
 * The history of one path across an archive.
 *
 * REFUSES rather than returning an empty history when there is nothing to read, because "absent from every
 * version" and "no versions were examined" are opposite claims that a list of zeroes cannot tell apart.
 */
export function historyOf(engineRel, { builds, cache = new Map() } = {}) {
    if (!Array.isArray(builds) || builds.length === 0) {
        return { refused: "no shipped zips found -- nothing to search", path: engineRel };
    }
    const want = asArchivePath(engineRel);
    const rows = [];
    for (const b of builds) {
        if (!cache.has(b.file)) {
            try { cache.set(b.file, pathsIn(b.file)); }
            catch (e) { rows.push({ version: b.version, n: b.n, unreadable: String(e.message || e) }); continue; }
        }
        rows.push({ version: b.version, n: b.n, present: cache.get(b.file).has(want) });
    }
    const readable = rows.filter((r) => r.present !== undefined);
    const present = readable.filter((r) => r.present);
    const lastPresent = present.length ? present[present.length - 1] : null;
    // The first version AFTER the last present one that lacks it. Not simply the first absent row: a file added
    // late is absent from early builds, and calling that a disappearance would be backwards.
    const firstAbsentAfter = lastPresent
        ? readable.find((r) => r.n > lastPresent.n && !r.present) || null
        : null;
    return {
        path: want,
        rows,
        examined: readable.length,
        everPresent: present.length > 0,
        lastPresent: lastPresent ? lastPresent.version : null,
        firstAbsent: firstAbsentAfter ? firstAbsentAfter.version : null,
        // THE GAP IS THE HONEST ANSWER. The archive is sparse by design, so the round that removed the file is
        // somewhere in (lastPresent, firstAbsent] and only a kept zip can narrow it further.
        vanishedBetween: lastPresent && firstAbsentAfter ? [lastPresent.version, firstAbsentAfter.version] : null,
        gapVersions: lastPresent && firstAbsentAfter ? firstAbsentAfter.n - lastPresent.n : null,
        inTree: fs.existsSync(path.join(ENG, want.replace(/^WebGLEngine\//, ""))),
    };
}

/**
 * Every path the CURRENT tree still asks for, that the tree does not have, that some archived build does.
 *
 * REFERENCED IS THE FILTER THAT MATTERS. A file absent from the tree and referenced by nothing is finished with;
 * a file absent and still imported is a defect somebody will meet. The reference test uses specifiersIn, so it
 * covers static, require AND literal dynamic imports -- which is the whole point, since the dynamic form is the
 * one removeCluster could not see and therefore the one that produced this list.
 */
/**
 * v3208 -- WHY A REFERENCE MIGHT NOT BE A DEFECT. Three things were wearing one label.
 *
 * The scan reports paths the tree imports and does not have. Three of the seven it reported at v3207 were not
 * missing files at all, and one was working exactly as designed:
 *
 *   COMMENTED  tools/ship/y.js -- a `//` comment in deadImportScan.mjs. noComments() could not strip it because
 *              the line above defines a regex literal containing a BACKTICK inside a character class, which
 *              flips the stripper into template-string mode. Not fixable by making the stripper cleverer without
 *              a parser (regex-vs-division is genuinely ambiguous), so the line itself is re-checked here.
 *   FIXTURE    tools/ship/ui/PerfHUD.js and tools/roundhouse/androidPeerBridge.js -- code-shaped STRINGS inside
 *              gates. GATES ARE THE FILES MOST LIKELY TO CONTAIN CODE-SHAPED STRINGS, and this tree has 604 of
 *              them, so a text-based reference scan over-reports precisely where it is densest.
 *   OPTIONAL   world/wasm/terrain_wasm.js -- a wasm-pack build output. world/terrainWasm.js loads it inside a
 *              try/catch and its header says "NEVER required... Shipping the engine without ever running the
 *              Rust build must keep working". THE 404 IS THE DESIGN. It has been on the missing list for
 *              nothing, and the v3050 render-QA failure it caused was a QA problem, not a code one.
 *
 * NONE OF THESE ARE DROPPED. A gate CAN have a genuinely broken import and an optional build CAN be one you
 * meant to run, so hiding them would trade over-reporting for the worse failure. They are LABELLED, and the
 * page groups by label -- because a list where most rows are noise trains you to skim past the one that is not.
 */
function classifyReference(engRoot, referrers, target) {
    const isGate = (f) => /-selfcheck\.mjs$/.test(f);
    // is EVERY mention of this specifier on a line that is a `//` comment?
    let everyMentionCommented = referrers.length > 0;
    for (const rel of referrers) {
        let src; try { src = fs.readFileSync(path.join(engRoot, rel), "utf8"); } catch { everyMentionCommented = false; break; }
        const base = target.split("/").pop();
        const lines = src.split("\n").filter((l) => l.includes(base));
        if (!lines.length || !lines.every((l) => l.trim().startsWith("//"))) { everyMentionCommented = false; break; }
    }
    if (everyMentionCommented) return { kind: "commented", note: "every mention is on a // comment line" };
    if (referrers.length && referrers.every(isGate)) return { kind: "fixture", note: "only gates reference it -- most likely a code-shaped string in a test fixture" };
    if (/\/wasm\/|\.wasm$|(^|\/)pkg\//.test(target)) return { kind: "optional-build", note: "a build output; the loader is expected to degrade when it is absent" };
    return { kind: "missing", note: null };
}

export function recoverable({ builds } = {}) {
    if (!Array.isArray(builds) || builds.length === 0) {
        return { refused: "no shipped zips found -- nothing to search" };
    }
    // what the tree wants but does not have
    const wanted = new Map();                       // engine-relative target -> [referring files]
    for (const f of walkCode(ENG)) {
        let src; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        const s = specifiersIn(src);
        for (const spec of [...s.statics, ...s.requires, ...s.dynamicLiteral]) {
            if (resolves(f, spec)) continue;         // it is there; not our business
            const base = path.resolve(path.dirname(f), spec);
            const rel = path.relative(ENG, base).replace(/\\/g, "/");
            if (rel.startsWith("..")) continue;      // outside the engine
            if (!wanted.has(rel)) wanted.set(rel, []);
            wanted.get(rel).push(path.relative(ENG, f).replace(/\\/g, "/"));
        }
    }
    const cache = new Map();
    const rows = [];
    for (const [rel, referrers] of wanted) {
        // a specifier may omit its extension, so try the same candidates resolves() would
        const cands = path.extname(rel) ? [rel] : [rel, rel + ".js", rel + ".mjs", rel + "/index.js", rel + "/index.mjs"];
        let hit = null;
        for (const c of cands) {
            const h = historyOf(c, { builds, cache });
            if (h.everPresent) { hit = h; break; }
        }
        const cls = classifyReference(ENG, referrers, rel);
        rows.push({
            target: rel,
            referrers: referrers.slice(0, 6),
            referrerCount: referrers.length,
            recoverable: !!hit,
            from: hit ? hit.lastPresent : null,
            archivePath: hit ? hit.path : null,
            vanishedBetween: hit ? hit.vanishedBetween : null,
            kind: cls.kind,
            kindNote: cls.note,
        });
    }
    // real ones first, then recoverable, so the row that needs a decision is never below the noise
    const rank = (r) => (r.kind === "missing" ? 0 : 1);
    rows.sort((a, b) => rank(a) - rank(b) || Number(b.recoverable) - Number(a.recoverable) || a.target.localeCompare(b.target));
    const counts = {};
    for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;
    return {
        rows, wanted: wanted.size,
        recoverableCount: rows.filter((r) => r.recoverable).length,
        realCount: rows.filter((r) => r.kind === "missing").length,
        counts,
    };
}

/**
 * The bytes of one file out of one zip.
 *
 * PATH CONTAINMENT IS CHECKED HERE AND NOT LEFT TO THE CALLER. This is reachable from a bridge, so the
 * requested name is treated as hostile: it must be one of the zip's OWN entry names, matched exactly, which
 * makes traversal impossible by construction rather than by pattern -- the same argument gatesBridge makes for
 * taking a NAME that must be a MEMBER of the discovered set.
 */
export function readFromZip(zipFile, engineRel) {
    const want = asArchivePath(engineRel);
    const buf = fs.readFileSync(zipFile);
    const entries = readCentralDirectory(buf);
    for (const e of entries) {
        const name = String(e.name || "").replace(/\\/g, "/");
        const cut = name.indexOf("/");
        if (cut < 0) continue;
        if (name.slice(cut + 1) !== want) continue;
        return { name, entry: e, buf };
    }
    return null;
}

/**
 * The bytes of one entry, inflated. Lives HERE and not in the bridge: reading a zip container is this module's
 * job, and its gate asserts the bridge contains no zip logic of its own.
 *
 * FIELD NAMES READ FROM readCentralDirectory, NOT ASSUMED. My first attempt used entry.offset and
 * entry.compressedSize; the real fields are localOff and compSize, so the wrong names would have thrown on the
 * first restore. Writing against an assumed signature has cost this project three rounds (parseRange,
 * coulombForces, dihedralForces), so the names are checked in code rather than trusted.
 */
export function inflateEntry(buf, entry) {
    for (const k of ["localOff", "compSize", "uncompSize", "method"]) {
        if (typeof entry[k] !== "number") throw new Error("central-directory entry has no numeric " + k);
    }
    const off = entry.localOff;
    if (buf.readUInt32LE(off) !== 0x04034b50) throw new Error("no local file header at the recorded offset");
    // The LOCAL header's own name/extra lengths, not the central copies: they are allowed to differ, and using
    // the central ones silently shifts the data window -- a corruption that inflates fine sometimes.
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const start = off + 30 + nameLen + extraLen;
    const comp = buf.slice(start, start + entry.compSize);
    let out;
    if (entry.method === 0) out = comp;
    else if (entry.method === 8) out = zlib.inflateRawSync(comp);
    else throw new Error("unsupported compression method " + entry.method);
    // A RESTORE THAT WRITES THE WRONG NUMBER OF BYTES MUST FAIL LOUDLY. A short file that still parses is worse
    // than no file, because the import resolves and the module misbehaves somewhere else entirely.
    if (out.length !== entry.uncompSize) throw new Error("inflated " + out.length + " bytes, directory says " + entry.uncompSize);
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const arg = process.argv[2];
    const { builds, searched } = indexArchives();
    if (!builds.length) {
        console.error("No SweK_Engine_v*.zip found. Looked in:");
        for (const s of searched) console.error("  " + s.dir);
        console.error("\nPass a directory:  node tools/ship/moduleHistory.mjs --dir <folder> [path]");
        process.exit(2);
    }
    console.log(`archive: ${builds.length} build(s) ${builds[0].version}..${builds[builds.length - 1].version}`);
    if (!arg) {
        const r = recoverable({ builds });
        // THE HEADLINE IS THE REAL COUNT, NOT THE TOTAL. A total that mixes a broken import with a comment and
        // an optional build output is the "crude count near a hundred" mistake in miniature.
        console.log(`\n${r.realCount} genuinely missing; ${r.recoverableCount} recoverable from the archive.`);
        const others = Object.entries(r.counts).filter(([k]) => k !== "missing");
        if (others.length) console.log(`also listed, NOT defects: ` + others.map(([k, n]) => n + " " + k).join(", "));
        const LABEL = { missing: "MISSING", commented: "commented out", fixture: "gate fixture", "optional-build": "optional build output" };
        for (const kind of ["missing", "optional-build", "fixture", "commented"]) {
            const group = r.rows.filter((x) => x.kind === kind);
            if (!group.length) continue;
            console.log(`\n${LABEL[kind]}:`);
            for (const row of group) {
                const where = row.recoverable ? `RECOVERABLE from ${row.from}` : "not in any archived build";
                console.log(`  ${row.target}  -- ${where}`);
                console.log(`      wanted by ${row.referrerCount}: ${row.referrers.slice(0, 2).join(", ")}`);
                if (row.kindNote) console.log(`      ${row.kindNote}`);
            }
        }
        process.exit(0);
    }
    const h = historyOf(arg, { builds });
    if (h.refused) { console.error("REFUSED: " + h.refused); process.exit(2); }
    console.log(`\n${h.path}   in tree now: ${h.inTree ? "YES" : "NO"}`);
    for (const row of h.rows) console.log(`  ${row.version}  ${row.unreadable ? "UNREADABLE " + row.unreadable : row.present ? "present" : "absent"}`);
    if (!h.everPresent) console.log("\nNot present in any examined build.");
    else if (h.vanishedBetween) console.log(`\nLast present ${h.vanishedBetween[0]}, first absent ${h.vanishedBetween[1]} -- removed somewhere in those ${h.gapVersions} version(s).`);
    else console.log(`\nPresent as recently as ${h.lastPresent}.`);
}
