import { pathToFileURL, fileURLToPath } from "node:url";
// tools/ship/orphanScan.mjs
//
// v3126 -- CODE NOTHING CAN REACH IS THIS TREE'S RECURRING DEFECT.
//
// Four instances found by hand, all the same shape and all found by accident:
//   meshMerge.mjs      shipped with idempotence and commutativity PROVEN, and unreachable for three versions.
//   portableSuite      the iOS page advertised a gate that did not exist; every iPhone ran four unverified checks.
//   SSAOPass.js        347 lines, 2 exports, zero referrers -- while a SECOND SSAO lives inside bloomPass.js.
//   SpatialHash.js     referenced by nothing outside itself.
//
// A passing gate says the code works. It says nothing about whether anything calls it, and this tree has no
// check for that at all.
//
// THE HARD PART IS THE FALSE POSITIVES, and a first attempt produced 113 candidates -- mostly wrong. demos_code/*
// topped the list and is loaded BY DIRECTORY from server.html; nothing mentions those filenames because nothing
// needs to. A scanner that cried wolf 113 times would be switched off in a week, which is worse than no scanner.
// So reachability here means any of:
//
//   1. another file mentions the basename                      -- the ordinary import
//   2. it lives in a REGISTERED directory-loaded folder        -- see DIRECTORY_LOADED below
//   3. another file mentions its path relative to the engine   -- string-path dynamic import
//   4. it is an entry point: a bin, a CLI, or an HTML sidecar  -- reached by a human or a launcher, not by code
//
// Only what survives all four is a candidate, and even then this REPORTS rather than accuses: a candidate is a
// question for a person, not a verdict.

import fs from "node:fs";
import path from "node:path";

// v3126 -- DIRECTORY-LOADED FOLDERS, REGISTERED RATHER THAN GUESSED.
//
// Two heuristics were tried for this and both were worse than useless. `t.includes(dir)` marked every module
// under render/ reachable because "render" is an ordinary English word appearing in hundreds of files.
// Tightening it to `dir + "/"` did not help either: "render/" appears in every import of every OTHER file in
// that folder, so one live module made all of its neighbours look live. BOTH silently hid the two known
// orphans, which is the worst possible failure for a scanner -- a green result that checked nothing.
//
// So the exemption is a LIST, with a reason each, and adding to it is a deliberate act a reviewer can see.
const DIRECTORY_LOADED = {
    "demos_code": "server.html enumerates this folder and loads snippets by path at runtime; nothing mentions the filenames because nothing needs to",
    "ai-bridge/kaggle_templates": "notebook templates read by filename constructed at call time",
};
const inRegisteredDir = (rel) => Object.keys(DIRECTORY_LOADED).some((d) => rel === d || rel.startsWith(d + "/"));

// v3126 -- A LINT TOOL'S CONSUMER IS ITS GATE, AND THAT COUNTS AS WIRED UP.
//
// Excluding selfchecks from the corpus is right for a FEATURE module: meshMerge was proven, gated, and used by
// no product code, and that is exactly the defect worth catching. It is wrong for tools/ship, where being run by
// a gate IS the module's purpose and the suite runs every gate it discovers. The first version of this scan did
// not draw that line and flagged deadImportScan.mjs the moment it was written -- a gate failing on the arrival
// of a working lint is a gate telling you to stop writing lints.
const GATE_TOOL_DIR = "tools/ship";
const isGateTool = (rel) => rel.startsWith(GATE_TOOL_DIR + "/");

// v3126 -- AND THE BASELINE ITSELF MUST NOT BE CORPUS. It lists all 147 orphan paths, so including it marks
// every one of them "mentioned" and the scan reports zero. Third time in a single round that this scanner was
// blinded by something describing it: first its own header comment, then prose docs, now its own output.
// A file that RECORDS references is not a file that MAKES them.
// v3900 -- *** THE RULE ABOVE WAS RIGHT AND WAS APPLIED TO ONE FILE BY NAME, SO TWO MORE WALKED IN. ***
// v3126 excluded orphan-baseline.json because "a file that RECORDS references is not a file that MAKES them",
// and then named a single file. Since then two more GENERATED RECORDS have arrived in tools/ship and both are
// corpus: population-census.json (a list of every module path, which marks simulation/SpatialHash.js reached)
// and duplicate-files-baseline.json (a list of byte-identical paths, which marks ai-bridge/haDiscovery.js
// reached). Keith's rig ran baselineHygiene and it duly reported both suppressions STALE -- prescribing the
// deletion of the protection on two files that are still orphans, one of which (SpatialHash) was ALREADY SWEPT
// ONCE AT v3159 and had to be restored from a shipped zip.
//
// *** SO THE EXCLUSION IS A PROPERTY, NOT A LIST. *** A generated artefact declares its own provenance in this
// tree -- populationCensus stamps `generatedFrom`, the baselines stamp `captured`/`generated` -- so the corpus
// asks the file what it is instead of matching its name. A name list would need editing every time somebody
// writes a new report, which is precisely the maintenance nobody does and how these two got in.
const SKIP = /orphan-baseline\.json|node_modules|(^|[\\/])vendor[\\/]|\.git|render-qa[\\/]out|[\\/]dist[\\/]|\.min\./;
/** A JSON file that declares it was generated is a RECORD of references, never a maker of them. */
const isGeneratedRecord = (file, text) =>
    /\.json$/.test(file) && /^\s*[{[]/.test(text) && /"(?:generatedFrom|generated|captured)"\s*:/.test(text.slice(0, 4096));

// v4009 -- A THIRD FILE WALKED IN, AND THIS TIME THE PROPERTY DID NOT EXIST TO ASK FOR.
// render/ssaoCompare.mjs is a hand-written report comparing two SSAO implementations. Its data table stores
// each one's path as documentation -- `file: "render/SSAOPass.js"` -- and that bare string satisfied rule 3
// (path-substring), un-orphaning SSAOPass.js by accident. A later baselineHygiene run read the disappearance
// from the candidate list as PROGRESS and deleted its baseline entry, exactly the outcome v3900 warned about.
//
// isGeneratedRecord() does not cover it: that check is JSON-only, keyed on a provenance property
// (generatedFrom/generated/captured) that GENERATED files carry for reasons that predate the gate. A
// hand-written report has no such property to ask for -- ssaoCompare.mjs's own key is `file:`, and grepping the
// corpus for that exact property turns up 60+ unrelated hits (URLs, Python paths, log strings, .uvtt map names)
// in ui/installPanel.js, tools/mutate/mutate.mjs and elsewhere. Keying the exclusion on that property name would
// silently blind the scanner to real references far past this one file.
//
// No safe PROPERTY exists here, so this follows DIRECTORY_LOADED below instead of forcing one: a short LIST,
// with a reason each, that costs a deliberate and reviewable edit to grow -- the same trade DIRECTORY_LOADED
// already made when its two general heuristics both turned out worse than useless.
// NOTE: this reason string deliberately avoids spelling out either implementation's literal path -- doing so
// would recreate the exact bug being excluded, this time inside orphanScan.mjs's own corpus text.
const REPORT_MODULE = {
    "render/ssaoCompare.mjs": "compares the two render/ SSAO implementations named in its own header from " +
        "source; its data table names each by path as documentation and loads neither -- the live one stays " +
        "reached on its own via main.js's real import",
    "ssao-compare.html": "the human-readable rendering of the same report -- imports ssaoCompare.mjs for real " +
        "(that import stands on its own) but its page text also NAMES both implementations by path in prose, " +
        "which is the same documentation-not-a-load-path shape as the .mjs table it renders",
};
const isReportModule = (rel) => Object.prototype.hasOwnProperty.call(REPORT_MODULE, rel);
const CODE = /\.(js|mjs)$/;
// v3126 -- PROSE IS NOT REACHABILITY, and this cost a round to learn. The corpus first included .md and .txt,
// and this scanner's OWN header names the orphans it was written for -- so documenting SSAOPass and SpatialHash
// as motivation made both invisible to it. Same for a design doc that mentions a class. A file is reached when
// CODE refers to it, so comments are stripped from source before matching and prose files are not corpus at all.
const CORPUS = /\.(js|mjs|html|json|sh|bat|command)$/;
// v3126 -- COMMENT STRIPPING, LINE-WISE, AFTER THE NAIVE VERSION ATE 71.7% OF server.js.
//
// The obvious `/\*[\s\S]*?\*\//g` is wrong on real JavaScript: a `/*` inside a string, a regex literal or a
// URL opens a "comment" that the non-greedy match then closes at the next `*/` thousands of lines later. On
// ai-bridge/server.js it deleted 965,179 of 1,345,736 characters and took every bridge mount with it -- so 25
// bridges that ARE mounted scanned as unreachable, and the orphan count was inflated by the scanner's own bug.
//
// Line-wise is the fix that fits the purpose. The thing being excluded is PROSE -- a header naming a module does
// not call it -- and prose lives in whole-line comments. A `/*` in the middle of a line of code is left alone,
// because it is far more likely to be a string than a doc block.
const stripComments = (t) => {
    const out = [];
    let inBlock = false;
    for (const line of t.split("\n")) {
        const trimmed = line.trimStart();
        if (inBlock) { if (/\*\//.test(line)) inBlock = false; out.push(""); continue; }
        if (trimmed.startsWith("/*")) { if (!/\*\//.test(trimmed.slice(2))) inBlock = true; out.push(""); continue; }
        if (trimmed.startsWith("//") || trimmed.startsWith("<!--")) { out.push(""); continue; }
        out.push(line);
    }
    return out.join("\n");
};

// v4009 -- A FOURTH FACE OF THE SAME DEFECT, THIS TIME A TOOLTIP. server.html's link to ssao-compare.html
// carries a `title="..."` naming both implementations by path, for a human hovering the link -- and that
// attribute value is neither a comment nor a load path, so stripComments() left it alone and rule 1 (basename)
// matched it. A `title` attribute is NEVER a load path in any runtime that reads HTML -- it exists solely for a
// tooltip -- so blanking it is a PROPERTY of the attribute, general across the whole corpus rather than a fact
// about this one page. Checked against the full corpus before shipping: the only candidate this newly reveals
// is render/SSAOPass.js: nothing that was reached only via a title attribute elsewhere loses its reason.
// `.title = "..."` (the JS-side assignment of the same tooltip text) is blanked for the identical reason;
// `title: "..."` (a colon, an ordinary object property that is sometimes real data) is deliberately left alone.
const stripTitleAttrs = (t) => t.replace(/\btitle\s*=\s*"[^"]*"/g, 'title=""').replace(/\btitle\s*=\s*'[^']*'/g, "title=''");

export function walk(root, test, acc = []) {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        const p = path.join(root, e.name);
        if (SKIP.test(p)) continue;
        if (e.isDirectory()) walk(p, test, acc);
        else if (test.test(e.name)) acc.push(p);
    }
    return acc;
}

/**
 * Find modules that export something and that nothing appears to reach.
 * `root` is the engine directory. Returns { candidates, scanned, corpus }.
 */
export { DIRECTORY_LOADED };

export function orphanScan(root) {
    const codeFiles = walk(root, CODE);
    const corpusFiles = walk(root, CORPUS);
    const texts = new Map();
    for (const f of corpusFiles) {
        try {
            const raw = fs.readFileSync(f, "utf8");
            const relF = path.relative(root, f).replace(/\\/g, "/");
            // v3900 -- a generated record is dropped from the corpus entirely rather than stripped, because
            // EVERY path in it is a mention and none of them is a call.
            // v4009 -- a listed report module gets the same treatment, for the same reason.
            texts.set(f, (isGeneratedRecord(f, raw) || isReportModule(relF)) ? "" : stripTitleAttrs(stripComments(raw)));
        } catch { texts.set(f, ""); }
    }

    const candidates = [];
    for (const f of codeFiles) {
        const rel = path.relative(root, f).replace(/\\/g, "/");
        const base = path.basename(f).replace(CODE, "");
        const dir = path.dirname(rel);

        let src = texts.get(f);
        if (src === undefined) { try { src = fs.readFileSync(f, "utf8"); } catch { continue; } }

        // a file with no exports cannot be orphaned in the sense that matters -- it is a script, not a module
        if (!/\bexport\b|module\.exports/.test(src)) continue;
        // gates, tests and entry points are reached by a runner or a person, not by an import
        if (/selfcheck|-test$|\.test$/.test(base)) continue;
        if (/^#!/.test(src) || /process\.argv\[1\]/.test(src)) continue;
        if (inRegisteredDir(rel)) continue;
        if (isGateTool(rel)) continue;

        let reached = false;
        for (const g of corpusFiles) {
            if (g === f) continue;
            // v3126 -- A GATE IS NOT A CALL SITE. Excluding selfchecks from the corpus is not a convenience: a
            // module whose ONLY referrer is its own test is still unreachable in the sense that matters, and that
            // is precisely the meshMerge case -- proven, gated, and called by nothing. Leaving them in also let
            // this gate's own message strings mark SSAOPass and SpatialHash reachable, which is the fourth face
            // of the same self-reference trap in one round.
            if (/selfcheck/.test(g)) continue;
            const t = texts.get(g);
            if (!t) continue;
            // (1) basename  (2) directory  (3) engine-relative path
            if (t.includes(base) || t.includes(rel)) { reached = true; break; }
        }
        if (!reached) candidates.push({ file: rel, bytes: src.length, exports: (src.match(/^export /gm) || []).length });
    }
    candidates.sort((a, b) => b.bytes - a.bytes);
    return { candidates, scanned: codeFiles.length, corpus: corpusFiles.length };
}

const ENGROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// v3219 -- A FRONT DOOR. *** RUNNING THIS FILE PRINTED NOTHING AND EXITED 0, WHICH READS AS A CLEAN BILL. ***
// EIGHT of this tree's analysis tools did that, not the two on record: an empty report and a tool that never
// ran are indistinguishable from a shell, and every one of them was ALSO reported by graveyard-selfcheck as an
// orphaned utility -- because its only consumer was its own gate. One main block answers both: the tool becomes
// runnable by a person, and it acquires a caller that is not a test.

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const r = orphanScan(ENGROOT);
    console.log("[orphanScan] " + r.candidates.length + " module(s) nothing reaches, of " + r.scanned + " scanned.");
    console.log("[orphanScan] SUBSTRING-MATCHED, not parsed -- it over-reports rather than under-reports, which is");
    console.log("[orphanScan] the safe direction for a list somebody might delete from.");
    for (const c of r.candidates) console.log("      " + (typeof c === "string" ? c : (c.file || JSON.stringify(c))));
}
