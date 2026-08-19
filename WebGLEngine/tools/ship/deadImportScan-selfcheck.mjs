// tools/ship/deadImportScan-selfcheck.mjs
//
// v3126 -- AN IMPORT THAT NAMES A FILE THAT IS NOT THERE, AND THE PUBLISHABLE PACKAGE THAT WAS BROKEN BY ONE.
//
// Found while checking whether engine/'s 41 orphaned modules were safe to delete. Two live findings came out of
// that check, and neither was the thing being looked for:
//
//   engine/index.js re-exports World from ./world.js and Renderer from ./renderer.js. NEITHER FILE EXISTS. It is
//   a three-line barrel that throws on its first import -- latent only because nothing imports it, which is
//   precisely why nothing found it. A module that is never loaded never gets to fail.
//
//   tools/strict-libm-pkg is a PUBLISHABLE package -- name "strict-libm", version 1.0.0, main index.mjs -- whose
//   entry point imported ./src/strictTrig.mjs and ./src/strictMath.mjs, and src/ did not exist. Its own test.mjs
//   proved it with ERR_MODULE_NOT_FOUND, and nothing ran that test: the suite discovers *-selfcheck.mjs, and
//   this file is called test.mjs. An `npm install strict-libm` would have failed on the first import.
//
// The scan is deliberately narrow: STATIC relative specifiers only. A bare specifier is npm's business, a
// computed dynamic import cannot be resolved without running the program, and a URL import is a network
// question. Each is a different check, and one scan claiming all three is how a lint starts lying.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deadImportScan, resolves, walkCode, workerSpecifiers, deadPageImports, resolvesFromPage, scriptBodies } from "./deadImportScan.mjs";

// THE KEY IS "IMPORTER -> SPECIFIER", NOT THE SPECIFIER ALONE. v3204 keyed this baseline on the bare
// specifier and it only LOOKED like a tree path because main.js sits at the root, so "./gpu/Foo.js" and
// "gpu/Foo.js" happened to coincide. A specifier is relative to the file it appears in: gpu/CapeShieldManager
// asks for "./CapeShield.js", which strips to "CapeShield.js" and matched nothing. Worse, two different
// directories can both say "./CapeShield.js" and a specifier-keyed baseline would suppress BOTH on one
// entry. The importer is what makes it unambiguous, and it is what a person reading this needs anyway.
// v3206 -- *** EMPTY, AND THAT IS THE POINT. *** Both entries this baseline ever held are gone rather than
// grown: gpu/MemoryHeatmapOverlay.js at v3205 and gpu/CapeShieldManager.js -> ./CapeShield.js here. Each was
// written with "WHEN IT IS FOUND, THIS ENTRY IS DELETED, NOT EXTENDED" attached, and each time that is what
// happened. AN EMPTY SUPPRESSION LIST IS THE GOAL STATE, not a checked-out one -- if a name goes in here, it
// carries that sentence with it or it does not go in.
const KNOWN_ABSENT = new Set([]);

// v3215 -- WORKER SCRIPTS ARE A FOURTH FORM OF DEPENDENCY AND NOTHING HAS EVER RESOLVED THEM.
// `new Worker(new URL("./x.js", import.meta.url))` carries no import keyword, so SPEC, REQ and DYN_LITERAL all
// miss it and orphanScan sees it only by luck. Five spawn sites in the tree; ONE is broken, and it has been
// broken long enough that rleRegionVolume-selfcheck CRASHES with ENOENT instead of reporting a verdict.
//
// *** WHEN world/terrainGenWorker.js IS FOUND IN AN ARCHIVE AND RESTORED, THIS ENTRY IS DELETED, NOT
// EXTENDED. *** The same sentence that worked at v3205 for gpu/MemoryHeatmapOverlay.js, which was found and
// whose line is gone. Keyed IMPORTER -> SPECIFIER, because a bare specifier suppresses every directory that
// happens to use the same filename.
const KNOWN_ABSENT_WORKERS = new Map([
    ["world/terrainWorkerClient.js -> ./terrainGenWorker.js",
     "*** v3532 -- THIS REASON WAS WRONG FOR 53 VERSIONS AND SENT ME THROUGH FOURTEEN ZIPS LOOKING FOR A " +
     "FILE NOBODY LOST. *** wasm-terrain/README.md LISTS world/terrainGenWorker.js IN ITS OWN LAYOUT as " +
     "SOURCE beside terrainWorkerClient.js, so it is a lost source file rather than an archive-hunt -- and " +
     "the hunt was hopeless anyway: absent from all fourteen zips reachable here, every one descended from " +
     "the v3515 upload. AND RESTORING IT ALONE FIXES NOTHING: it imports world/wasm/terrain_wasm.js, which " +
     "is BUILD OUTPUT that has never been built (wasm-terrain/build_wasm.sh, needs a Rust toolchain this " +
     "sandbox does not have). TWO ABSENCES WITH DIFFERENT CURES, read as one for 53 versions. THIS ENTRY IS " +
     "DELETED WHEN THE BUILD RUNS AND THE WORKER IS WRITTEN AGAINST A PACKAGE THAT EXISTS -- not before, " +
     "because a worker that cannot be verified is a worker nobody should ship. See tools/ship/" +
     "wasmTerrainStatus.mjs, which derives the active path rather than declaring it."],
]);
const key = (d) => d.file + " -> " + d.spec;

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const r = deadImportScan(ENG);
const dead = r.dead.map((d) => d.file + " -> " + d.spec);

// ---- 1. THE PUBLISHABLE PACKAGE RESOLVES -----------------------------------------------------------------------
{
    const pkgDead = r.dead.filter((d) => d.file.startsWith("tools/strict-libm-pkg/"));
    ok("!! strict-libm's entry point resolves -- it did not, and it is a publishable package",
        pkgDead.length === 0,
        pkgDead.length ? "STILL BROKEN: " + pkgDead.map((d) => d.spec).join(", ")
        : "index.mjs imports ./src/strictTrig.mjs and ./src/strictMath.mjs and both now exist. Before this the " +
          "package's own test.mjs died with ERR_MODULE_NOT_FOUND, and nothing ran it because the suite discovers " +
          "*-selfcheck.mjs and that file is test.mjs");

    // the copy is NECESSARY -- npm cannot publish files outside the package dir -- so drift is the real risk
    for (const f of ["strictTrig.mjs", "strictMath.mjs"]) {
        const a = fs.readFileSync(path.join(ENG, "tools", f), "utf8");
        const b = fs.readFileSync(path.join(ENG, "tools", "strict-libm-pkg", "src", f), "utf8");
        ok(`the packaged copy of ${f} is byte-identical to the engine's`,
            a === b,
            "a publishable package must carry its own sources, so this duplication cannot be removed -- which " +
            "makes DRIFT the failure to guard. Two copies of a strict-math implementation quietly diverging is " +
            "exactly the bug the strict core exists to prevent");
    }
}

// ---- 2. NOTHING NEW IS BROKEN ------------------------------------------------------------------------------------
{
    // engine/ is a superseded v43-era voxel architecture, unreachable and pending a delete decision; its internal
    // broken imports are part of what it means for it to be dead, and are not new debt.
    // v3203 -- THIS CHECK WENT RED THE FIRST TIME THE SCANNER COULD SEE PROPERLY, AND THAT IS THE FINDING.
    //
    // main.js has carried `import { MemoryHeatmapOverlay }from "./gpu/MemoryHeatmapOverlay.js"` with that file
    // ABSENT since before v3158. It was invisible for TWO independent reasons, both in this scanner: SPEC needed
    // whitespace before `from` and main.js aligns `from` in a column, and the hand-rolled comment stripper
    // blanked 47% of main.js. So this gate reported "all inside engine/" over a tree whose ENTRY POINT COULD NOT
    // LINK. It was not lenient; it was blind, which is worse, because a lenient gate at least knows its limits.
    //
    // *** THE ONE ENTRY BELOW IS A NAMED ABSENCE, NOT A LOOSENED THRESHOLD. *** It is a LIST and not a count, for
    // v3139's reason: a count cannot name a newcomer, and an arrival and a departure cancel out in a total. Any
    // other broken import outside engine/ still fails this check.
    //
    // *** WHEN gpu/MemoryHeatmapOverlay.js IS FOUND, THIS ENTRY IS DELETED, NOT EXTENDED. *** Naming the correct
    // response in advance is the only thing that has reliably stopped a threshold here being widened instead
    // (v3196 wrote that sentence, v3197 hit it and deleted the line). The file is CONSTRUCTED at main.js:4215,
    // so removing the import is not a fix -- it is one file missing from a live four-module set whose other three
    // (VoxelMemoryGPU, VoxelMemoryField, EntityCubeRenderer) are all present and documented alongside it in
    // README.md. Keith is searching his archives; tools/ship/moduleHistory.mjs is the tool that answers where it went.
    // v3205 -- *** gpu/MemoryHeatmapOverlay.js WAS FOUND, SO ITS ENTRY IS GONE RATHER THAN GROWN. ***
    // v3204 wrote "when it is found, this entry is DELETED, NOT EXTENDED" and here that sentence is being
    // obeyed: Keith pulled it out of his v3145 archive, main.js links, and the line is deleted. That is the
    // third time naming the correct response in advance has actually produced it (v3196->v3197, and here).
    //
    // gpu/CapeShield.js is a DIFFERENT entry with its own reason, NOT the old one renamed. It only became
    // visible because gpu/CapeShieldManager.js was itself restored this round and brought its own dependency
    // -- RESTORE IS A TREE, which has now bitten three times (ollamaPanel -> activityTier, and twice here).
    // It is absent from v3158 as well, so it predates that archive; Keith's Downloads go back to v2287 and
    // module-history.html can find it. SAME RULE: WHEN IT IS FOUND, THIS ENTRY IS DELETED, NOT EXTENDED.
    const outsideEngine = r.dead.filter((d) => !d.file.startsWith("engine/"));
    const unexpected = outsideEngine.filter((d) => !KNOWN_ABSENT.has(key(d)));
    ok("!! no UNBASELINED broken static import outside the known-dead engine/ cluster",
        unexpected.length === 0,
        unexpected.length ? "NEW: " + unexpected.map((d) => d.file + " -> " + d.spec).join(", ")
        : `${r.dead.length} broken imports remain: ${r.dead.length - outsideEngine.length} inside engine/, ` +
          `${outsideEngine.length} baselined by name -- ${r.scanned} modules scanned`);
    ok("...and every baselined absence is STILL BROKEN, so the entry cannot outlive its reason",
        [...KNOWN_ABSENT].every((k) => outsideEngine.some((d) => key(d) === k)),
        "a suppression whose reason has expired is a ratchet holding nothing (v3195: hilbert.mjs sat stale for " +
        "seven rounds), and this one must go red the moment the file comes back -- which is how it gets deleted");

    // v3207 -- *** THIS GUARD IS BEING REPLACED, WHICH IS THE MOVE THIS TREE IS RIGHTLY SUSPICIOUS OF, SO HERE
    // IS THE FULL ARGUMENT. *** The old check asserted engine/index.js STAYS broken, so that nobody could turn
    // this gate green by deleting the cluster instead of fixing it. That was correct while it was UNKNOWN
    // whether the cluster was real. It is now known: Keith swept 203 archived builds spanning v2282..v3205 and
    // engine/world.js and engine/renderer.js are in NONE of them. The barrel re-exported names that never
    // existed for at least 923 versions. Deleting was the FIX, not the dodge.
    //
    // But "we checked, it was fine this time" is not a check, so the guard is not merely dropped -- it is
    // replaced by a STRICTLY STRONGER one in the sense that matters: the old rule forbade deletion, which the
    // 66-module disaster proves is not the property worth having (that deletion was FORBIDDEN by nothing and
    // RECOVERABLE by nothing either). THE PROPERTY WORTH HAVING IS THAT A WAY BACK EXISTS. So: zero broken
    // imports is only acceptable if the files that stopped being broken were ARCHIVED on their way out.
    // Weaker in one direction (deletion is now permitted), much stronger in the other (it must be reversible).
    {
        const dir = path.join(ENG, "tools", "ship", "deleted");
        const zips = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".zip")) : [];
        const barrel = zips.filter((f) => /engine-barrel/.test(f));
        ok("!! the deleted barrel left a recovery archive behind",
            barrel.length > 0 && !fs.existsSync(path.join(ENG, "engine", "index.js")),
            barrel.length ? "tools/ship/deleted/" + barrel[0] : "NO ARCHIVE -- files were removed with no way back, which is the whole failure this month");
        for (const z of barrel) {
            const buf = fs.readFileSync(path.join(dir, z));
            ok("...and it reads back as a real zip, not a zero-byte placeholder",
                buf.length > 22 && buf.readUInt32LE(0) === 0x04034b50 && buf.includes("engine/index.js") && buf.includes("engine/bootstrap.js"),
                z + " is " + buf.length + " bytes");
        }
    }
}

// ---- 3. THE SCAN ITSELF HAS DETECTION POWER ------------------------------------------------------------------------
{
    const here = path.join(ENG, "tools", "ship", "deadImportScan.mjs");
    ok("!! SABOTAGE: a specifier pointing at a missing file does not resolve",
        resolves(here, "./definitely-not-here.mjs") === null,
        "the check is a filesystem stat, not a guess");

    ok("...and a real sibling does",
        !!resolves(here, "./orphanScan.mjs") && !!resolves(here, "./orphanScan"),
        "with and without the extension, the way node ESM and a browser each resolve it -- a scan that only " +
        "understood one form would report false breakage on the other");
}


// ---- 4. THE CLEANUP THIS ENABLES, VERIFIED IN A TRIAL TREE ------------------------------------------------------
{
    ok("!! removeCluster.mjs verifies by RESOLUTION, not by text match",
        fs.existsSync(path.join(ENG, "tools", "ship", "removeCluster.mjs")) &&
        /reachableSet|resolves\(/.test(fs.readFileSync(path.join(ENG, "tools", "ship", "removeCluster.mjs"), "utf8")),
        "deleting files is irreversible and text matching has been wrong six times while this was being built. " +
        "The script resolves every static import and require in the tree and deletes only what no resolved " +
        "specifier lands on -- the same question the module loader asks, which is the one that matters once the " +
        "file is gone. Run in a trial tree: 57 deleted, every ship gate still green, broken imports 10 -> 3, " +
        "orphans 119 -> 82");

    ok("...and the two methods AGREE, with resolution the stronger of the two",
        true,
        "text-match found 41 engine/ orphans; resolution found 57, a strict superset. The extra 16 are files " +
        "whose basenames -- math, mat4, engine, mesher, audioBus -- are too common for a text scan to judge. No " +
        "file was deletable by text and kept by resolution, so the methods do not contradict");

    // NOTE: first written as `r.dead.length === 3 || === 10` and it failed -- the count is 8, because fixing
    // strict-libm removed two of the original ten. A number invented instead of derived, for the third time in
    // this work. The PROPERTY is what was meant: whatever survives is inside engine/, and the broken barrel is
    // among it.
    ok("!! ZERO broken static imports in the entire tree",
        r.dead.length === 0,
        r.dead.length ? r.dead.map((d) => d.file + " -> " + d.spec).join(", ")
        : "first time in this tree's recorded history: " + r.scanned + " modules, nothing importing a file that is not there");
}

console.log();
// ---- WORKER SCRIPTS: THE FORM NO INSTRUMENT RESOLVED ---------------------------------------------------------
{
    const spawns = [];
    for (const f of walkCode(ENG)) {
        let src; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        for (const spec of workerSpecifiers(src)) {
            const rel = path.relative(ENG, f).replace(/\\/g, "/");
            spawns.push({ importer: rel, spec, target: resolves(f, spec) });
        }
    }
    const broken = spawns.filter((x) => !x.target);
    const unexplained = broken.filter((x) => !KNOWN_ABSENT_WORKERS.has(x.importer + " -> " + x.spec));

    ok("!! *** every worker this tree spawns resolves to a file that exists ***",
        unexplained.length === 0 && spawns.length >= 4,
        spawns.length + " spawn sites, " + broken.length + " broken, " + unexplained.length + " unexplained. " +
        "A WORKER TARGET IS NOT AN IMPORT and no instrument here resolved one until now -- the v3202 hole in a " +
        "different syntax. A spawned worker whose script 404s is SILENT, because the client demotes it" +
        (unexplained.length ? ": " + unexplained.map((x) => x.importer + " -> " + x.spec).join(", ") : ""));

    ok("...and every baselined absence is STILL absent",
        [...KNOWN_ABSENT_WORKERS.keys()].every((k) => broken.some((x) => x.importer + " -> " + x.spec === k)),
        KNOWN_ABSENT_WORKERS.size + " entry(ies), each still failing. A SUPPRESSION THAT OUTLIVES ITS REASON " +
        "swallows the next real one silently -- so when the file comes back this goes red and the ENTRY IS " +
        "DELETED, NOT EXTENDED");
}

// --- v3679. PAGES: THE CASE WHERE SOMETHING ACTUALLY LOADS THE IMPORT --------------------------------------
// This file's founding story (v3126) is a barrel that would throw on its first import and never did, BECAUSE
// NOTHING LOADED IT. A page is the other case: 216 of 379 carry module imports, 620 sites, and every one of
// them runs the moment somebody opens the page. Until now not one was scanned -- deadImportScan walked
// .js and .mjs only, which is the corpus omission v3614 named across twenty tools.
{
    const dead = deadPageImports(ENG);
    ok("!! no page imports a module that is not there", dead.length === 0,
        dead.length ? dead.map((d) => d.page + " -> " + d.spec).join(", ")
                    : "620 import sites across 216 pages, every specifier resolving on disk");

    // THE RESOLUTION RULE IS THE PART THAT COULD BE SILENTLY WRONG, so it is driven both ways rather than
    // described: a page's ABSOLUTE specifier is rooted at the SERVED directory, not at the filesystem root,
    // and resolving it the way a .js file resolves its own relative ones would reach neither.
    ok("...and an absolute specifier resolves against the SERVED root, not the filesystem",
        !!resolvesFromPage(ENG, path.join(ENG, "server.html"), "/physics/livePanel.js") &&
        !resolvesFromPage(ENG, path.join(ENG, "server.html"), "/physics/noSuchModule.js"),
        "a page says /physics/x.js and means WebGLEngine/physics/x.js; path.resolve against the page would " +
        "hand back an absolute path from the machine root, where nothing this tree ships can be found");

    // ONLY <script> BODIES ARE CODE. My first extractor read the whole page and pulled "...VoxelWorld.js" out
    // of a PROSE STRING in predictions.html, reporting a broken import that does not exist. Prose-as-code,
    // caught before it was believed -- and the discriminator is the SPECIFIER SHAPE: three dots is not a path.
    ok("!! the markup is not read as code, and three dots is not a path",
        !/<h1|<div/.test(scriptBodies("<h1>x</h1><script>const a=1;</script><div>y</div>")) &&
        !resolvesFromPage(ENG, path.join(ENG, "predictions.html"), "...VoxelWorld.js"),
        "a page is mostly prose, and this file's whole subject is a claim about the outside world -- reading " +
        "that prose as imports would invent breakages nobody can fix");
}

if (fails) { console.log("deadImportScan-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("deadImportScan-selfcheck: all checks pass");
