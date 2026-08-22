// tools/ship/moduleHistory-selfcheck.mjs
//
// v3203 -- THE GATE FOR THE ROUND THAT FOUND removeCluster HAD BEEN DELETING LIVE MODULES.
//
// Three separate holes were measured, in two tools, with different blast radii. Each gets a check that fails on
// the OLD behaviour, because a claim about absence must be shown failing -- and here the adversarial input does
// not have to be invented, it is DERIVED FROM THE TOOL'S OWN DEFINITION:
//
//   HOLE A  SPEC required `\sfrom\s`, and main.js ALIGNS `from` IN A COLUMN. A long export name eats the padding
//           and leaves `import { X }from "./y.js"` -- valid JavaScript, invisible to the scan. Exactly two
//           imports in the tree are written that way and BOTH pointed at missing files, which is the whole
//           reason nobody knew main.js could not link. render/entityDebugRenderer.js was deleted through it.
//
//   HOLE B  reachableSet built `reached` from static imports and require ONLY. `import("./x.js")` matched
//           neither, so THE TARGET OF EVERY LITERAL DYNAMIC IMPORT WAS INVISIBLE BY CONSTRUCTION. 98 modules
//           were reachable only that way at v3158 and 66 were gone by v3202. There WAS a computed-import scan,
//           and all it did was fill a list that plan() returned and never read -- while the file header claimed
//           such files were "REFUSED rather than deleted". A DOCUMENTED CLAIM WITH NO CHECK BEHIND IT.
//
//   HOLE C  deadImportScan hand-rolled a comment stripper that is not string-aware. A `/*` inside an HTML string
//           opened a comment that ran 248,013 bytes. It blanked 47.0% of main.js, hiding THIRTEEN ordinary
//           imports. This is v3126's server.js finding repeated verbatim in a sibling tool: A FIX APPLIED TO ONE
//           TOOL IS NOT A FIX TO THE CLASS.
//
// THE GATE BUILDS ITS OWN ZIPS. A check that only passes when two particular archives happen to be sitting in a
// directory is a check that gets skipped, and a skipped check is worth nothing -- so the history fixtures are
// written here (stored entries, no compression) rather than borrowed from whatever Keith has on disk.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { specifiersIn, deadImportScan, resolves, walkCode } from "./deadImportScan.mjs";
import { reachableSet, plan } from "./removeCluster.mjs";
import { noComments } from "./sourceScan.mjs";
import * as MH from "./moduleHistory.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

// The one file no archive on hand contains. It is absent from v3158 too, so main.js has been unlinkable since
// before then. It is CONSTRUCTED at main.js:4215, so deleting the import is not a fix. Keith is searching his
// archives; the entry exists so the gate can stay green about a known absence without going quiet about it.
const KNOWN_MISSING = new Set([]);   // v3206 -- emptied; see deadImportScan-selfcheck for why that is the goal state

let pass = 0, fail = 0;
function ok(name, cond, detail = "") {
    if (cond) { pass++; console.log("  PASS  " + name + (detail ? "   " + detail : "")); }
    else { fail++; console.log("  FAIL  " + name + (detail ? "   " + detail : "")); }
}

// ---------------------------------------------------------------------------------------------------------
// a minimal zip WRITER, for fixtures only. Stored entries (method 0) so no compression is involved and the
// bytes in equal the bytes out -- the point is the container, not the codec.
function makeZip(files) {
    const locals = [], central = [];
    let off = 0;
    for (const [name, text] of Object.entries(files)) {
        const nb = Buffer.from(name, "utf8"), db = Buffer.from(text, "utf8");
        const crc = zlib.crc32 ? zlib.crc32(db) : crc32(db);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
        lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
        lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(db.length, 18); lh.writeUInt32LE(db.length, 22);
        lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
        locals.push(lh, nb, db);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
        ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(db.length, 20); ch.writeUInt32LE(db.length, 24);
        ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
        central.push(ch, nb);
        off += lh.length + nb.length + db.length;
    }
    const localBuf = Buffer.concat(locals), centralBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    const n = Object.keys(files).length;
    eocd.writeUInt16LE(n, 8); eocd.writeUInt16LE(n, 10);
    eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(localBuf.length, 16);
    return Buffer.concat([localBuf, centralBuf, eocd]);
}
function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    return (~c) >>> 0;
}

// the reachability derivation AS IT WAS, so the fix can be shown to change an answer rather than asserted to.
const OLD_SPEC = /(?:^|[\s;])(?:import|export)\s(?:[^"'`;]*?\sfrom\s)?["'](\.[^"']+)["']/gm;
const OLD_REQ = /require\(\s*["'](\.[^"']+)["']\s*\)/g;
function oldSpecifiers(src) {
    const out = [];
    for (const re of [OLD_SPEC, OLD_REQ]) { re.lastIndex = 0; for (const m of src.matchAll(re)) out.push(m[1]); }
    return out;
}

console.log("\nmoduleHistory-selfcheck -- reachability holes A/B/C, and the recovery tool\n");

// =========================================================================================================
console.log("1. HOLE A -- `}from` with no space");
{
    const line = 'import { MemoryHeatmapOverlay }from "./gpu/MemoryHeatmapOverlay.js";\n';
    const spaced = 'import { MemoryHeatmapOverlay } from "./gpu/MemoryHeatmapOverlay.js";\n';
    ok("!! the OLD pattern cannot see it, and CAN see the spaced form",
        oldSpecifiers(line).length === 0 && oldSpecifiers(spaced).length === 1,
        "that asymmetry is the entire bug: one space of alignment padding decided whether a broken import was visible");
    ok("the fixed scan sees both",
        specifiersIn(line).statics.length === 1 && specifiersIn(spaced).statics.length === 1);
    // DERIVED FROM THE TREE, not from a fixture: the real main.js must still contain the form, or this check has
    // quietly stopped testing anything real. It is asserted PRESENT rather than absent on purpose -- reformatting
    // main.js would be a fine change, and this line going red is how we would find out the fixture went stale.
    const main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    ok("main.js still actually contains the form this fixes", /\}from\s*["']\./.test(main),
        "if this ever goes red, main.js was reformatted and check 1 needs a synthetic fixture instead");
}

// =========================================================================================================
console.log("\n2. HOLE B -- a literal dynamic import target was invisible to reachability");
{
    const src = 'const m = await import("./ui/PerfHUD.js");\n';
    ok("!! the OLD derivation found NO specifier here", oldSpecifiers(src).length === 0,
        "so every module reached only by import(\"./x.js\") was deletable by construction -- 66 of them were");
    ok("the fixed definition finds it, and files it as dynamic",
        specifiersIn(src).dynamicLiteral.length === 1 && specifiersIn(src).statics.length === 0,
        "kept apart from static because the KEEP REASON must not claim a static import that was never there");
    ok("a COMPUTED specifier is counted and NOT resolved",
        specifiersIn('await import("./a/" + name + ".js");').computed === 1 &&
        specifiersIn('await import("./a/" + name + ".js");').dynamicLiteral.length === 0,
        "there is no target to list -- import(expr) cannot be resolved without running the program, and saying so is the honest answer");
}

// =========================================================================================================
console.log("\n3. HOLE B, against the real tree -- the modules it deleted are now KEPT, with the right reason");
{
    const p = plan(ENG, "world");
    const byRel = new Map(p.keep.map((k) => [k.rel, k.why]));
    const dynOnly = ["world/fireSystem.js", "world/lavaSystem.js", "world/kaijuAttackFx.js"];
    const kept = dynOnly.filter((r) => byRel.has(r));
    ok("!! the dynamic-only feature modules are in KEEP, not DELETE", kept.length === dynOnly.length,
        kept.length + "/" + dynOnly.length + " kept: " + dynOnly.filter((r) => !byRel.has(r)).join(", ") || "all");
    ok("...and the reason NAMES the dynamic form", dynOnly.every((r) => /dynamic import\(\)/.test(byRel.get(r) || "")),
        'it used to print "a static import resolves to it" for these -- a wrong explanation of a correct decision, and the next auditor would have gone hunting a static import that never existed');
    // the sabotage: run the OLD derivation over the same tree and show it disagrees
    const oldReached = new Set();
    for (const f of walkCode(ENG)) {
        let s; try { s = fs.readFileSync(f, "utf8"); } catch { continue; }
        for (const spec of oldSpecifiers(s)) { const t = resolves(f, spec); if (t) oldReached.add(path.resolve(t)); }
    }
    const wouldDie = dynOnly.filter((r) => !oldReached.has(path.join(ENG, r)));
    ok("!! SABOTAGE: the OLD derivation calls those same files unreached",
        wouldDie.length === dynOnly.length,
        "which is not a hypothetical -- it is what happened to " + wouldDie.length + " of them and 63 others");
}

// =========================================================================================================
console.log("\n4. HOLE B -- the refusal the header only used to claim");
{
    const p = plan(ENG, "world");
    ok("plan() carries incompleteness as a FLAG, not as a line of prose",
        p.incomplete === true && typeof p.computedCount === "number" && p.computedCount > 0,
        p.computedCount + " computed import() call(s) -- the old code collected this and plan() never read it");
    const src = fs.readFileSync(path.join(ENG, "tools/ship/removeCluster.mjs"), "utf8");
    const code = noComments(src);
    ok("--apply refuses while reachability is incomplete", /--accept-incomplete-reachability/.test(code) && /process\.exit\(3\)/.test(code),
        "an override exists and must be TYPED, so proceeding is a decision somebody made rather than a default");
    ok("...and the refusal is in the APPLY path, not the dry run", code.indexOf("process.exit(3)") > code.indexOf("DRY RUN"),
        "a dry run must always print -- only the irreversible half stops");
}

// =========================================================================================================
console.log("\n5. HOLE C -- the comment stripper");
{
    // DERIVED FROM THE FAILURE'S OWN SHAPE: a `/*` inside a string literal, exactly as main.js has it.
    // THE FIXTURE NEEDS THE CLOSING */ TOO, and my first version did not have one -- so the naive regex never
    // matched, nothing was eaten, and the check reported the bug absent. A fixture that cannot reproduce the
    // failure is a control that cannot fail. main.js's real shape is a `/*` inside a string with the matching
    // `*/` thousands of lines below, which is exactly why it swallowed 248,013 bytes.
    const src = 'const t = "</p><!--/*-->";\nimport { A } from "./a.js";\nimport { B } from "./b.js";\nconst u = "*/";\n';
    const naive = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    ok("!! the naive stripper eats real imports after a `/*` inside a string",
        oldSpecifiers(naive).length < 2, "kept " + oldSpecifiers(naive).length + " of 2");
    ok("noComments() keeps them", specifiersIn(src).statics.length === 2);
    // and on the real file, with the real numbers from the round
    const main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    const naiveMain = main.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    const kept = noComments(main).length / main.length, naiveKept = naiveMain.length / main.length;
    // *** v3925 -- THE CLAIM IS A COMPARISON AND IT WAS PINNED TO TWO ABSOLUTES, ONE OF WHICH DRIFTED. ***
    //
    // The sentence says "the naive stripper blanks FAR MORE OF THE FILE", which is a statement about the gap
    // between two strippers. It was tested as naiveKept < 0.60 AND kept > 0.70 -- and the second is not a fact
    // about either stripper, it is a fact about HOW MUCH OF main.js IS COMMENT. main.js carries the engine's
    // whole changelog, this session alone has added ten blocks to it, and noComments now keeps 41.7% because
    // FIFTY-EIGHT PERCENT OF THAT FILE IS PROSE. Nothing about the stripper changed.
    //
    // A COUNT IS NOT A PROPERTY, for the third time this session (areaHygiene's band, caseStudy's baked total,
    // and now this). The ratio IS the property: noComments keeps 1.57x what the naive stripper does, and that
    // holds whatever the comment density becomes. A floor stays underneath so a stripper returning nothing
    // cannot satisfy a ratio by making both numbers tiny.
    const ratio = kept / naiveKept;
    ok("!! measured on main.js: the naive stripper blanks far more of the file",
        ratio > 1.3 && kept > 0.20 && naiveKept < kept,
        "naive keeps " + (naiveKept * 100).toFixed(1) + "%, noComments keeps " + (kept * 100).toFixed(1) +
        "% -- a ratio of " + ratio.toFixed(2) + "x. THE RATIO IS THE CLAIM: main.js is " +
        ((1 - kept) * 100).toFixed(0) + "% comment and rising, so an absolute floor on `kept` measures the " +
        "changelog rather than the stripper");
    ok("...and that difference is worth real specifiers",
        new Set(specifiersIn(main).statics).size > new Set(oldSpecifiers(naiveMain)).size,
        "the gap is what made thirteen ordinary imports invisible");
    ok("deadImportScan no longer hand-rolls a stripper", /noComments/.test(fs.readFileSync(path.join(ENG, "tools/ship/deadImportScan.mjs"), "utf8")),
        "sourceScan.mjs exists to be the one definition; v3126 fixed this class in server.js and the fix never travelled");
}

// =========================================================================================================
console.log("\n6. ONE DEFINITION -- the deleter and the reporter cannot drift apart again");
{
    const rc = fs.readFileSync(path.join(ENG, "tools/ship/removeCluster.mjs"), "utf8");
    const code = noComments(rc);
    ok("removeCluster IMPORTS specifiersIn", /import\s*\{[^}]*specifiersIn[^}]*\}\s*from\s*["']\.\/deadImportScan\.mjs["']/.test(code));
    ok("!! ...and no longer keeps its own copy of the import regex",
        !/\(\?:\^\|\[\\s;\]\)\(\?:import\|export\)/.test(code),
        "two copies of one question is HOW the deleter and the reporter came to have different blind spots");
}

// =========================================================================================================
console.log("\n7. THE HISTORY TOOL -- positive and negative controls, on zips built here");
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-mh-"));
    fs.writeFileSync(path.join(dir, "SweK_Engine_v1000.zip"), makeZip({
        "SweK_Engine_v1000/WebGLEngine/main.js": "// main\n",
        "SweK_Engine_v1000/WebGLEngine/ui/Gone.js": "// doomed\n",
    }));
    fs.writeFileSync(path.join(dir, "SweK_Engine_v1002.zip"), makeZip({
        "SweK_Engine_v1002/WebGLEngine/main.js": "// main\n",
        "SweK_Engine_v1002/WebGLEngine/ui/Later.js": "// added later\n",
    }));
    const { builds } = MH.indexArchives([dir]);
    ok("both fixtures are indexed, ordered NUMERICALLY", builds.length === 2 && builds[0].version === "v1000" && builds[1].version === "v1002",
        "a string sort would put v999 after v1000; the archive spans hundreds of versions so this is not theoretical");

    const gone = MH.historyOf("ui/Gone.js", { builds });
    ok("!! a vanished file reports the PAIR, not a tick list",
        gone.lastPresent === "v1000" && gone.firstAbsent === "v1002" && gone.gapVersions === 2,
        "last present v1000, first absent v1002 -- the round that did it is in that gap, and the gap is stated rather than guessed at");

    const later = MH.historyOf("ui/Later.js", { builds });
    ok("!! a file ADDED later is not reported as vanished",
        later.everPresent && later.lastPresent === "v1002" && later.firstAbsent === null,
        "absent from early builds is the opposite of removed, and firstAbsent must look only AFTER the last present build");

    const never = MH.historyOf("ui/NeverExisted.js", { builds });
    ok("a file in no build is reported as such, distinctly", never.everPresent === false && never.refused === undefined);

    ok("!! an EMPTY archive REFUSES rather than returning an empty history",
        !!MH.historyOf("ui/Gone.js", { builds: [] }).refused,
        '"absent from every version" and "no versions examined" are opposite claims that a list of zeroes cannot tell apart');

    const hit = MH.readFromZip(path.join(dir, "SweK_Engine_v1000.zip"), "ui/Gone.js");
    ok("readFromZip matches the zip's OWN entry name exactly", hit && hit.name === "SweK_Engine_v1000/WebGLEngine/ui/Gone.js",
        "membership of the archive's real entry list, so traversal is impossible by construction rather than by regex");
    ok("...and refuses a name the zip does not hold", MH.readFromZip(path.join(dir, "SweK_Engine_v1000.zip"), "../../etc/passwd") === null);
    fs.rmSync(dir, { recursive: true, force: true });
}

// =========================================================================================================
console.log("\n8. THE FRONT DOOR delegates and never recomputes");
{
    // v3209 -- THE PAGE PRINTED "undefined genuinely missing" BECAUSE THE BRIDGE HAND-LISTED WHAT IT FORWARDED.
    // Every field the page reads off a scan must actually arrive. Derived from the PAGE's own source rather
    // than from a list kept here, so adding a field to the page cannot quietly outrun this check.
    {
        const page = fs.readFileSync(path.join(ENG, "module-history.html"), "utf8");
        const { builds } = MH.indexArchives();
        const answer = MH.recoverable({ builds });
        const read = [...new Set([...page.matchAll(/\bj\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))]
            .filter((k) => !["ok", "why", "builds", "searched", "rows", "dir", "zips", "restored", "refused"].includes(k));
        // v3215 -- *** THIS DERIVED "WHAT THE TOOL RETURNS" FROM A REFUSAL AND MANUFACTURED A DEFECT. ***
        // With no archives on the box, recoverable() correctly REFUSES and returns { refused } alone -- so
        // counts, realCount and recoverableCount are all "absent" and the gate reported the page as reading
        // fields the tool does not have. IT DOES HAVE THEM: moduleHistory.mjs returns all three, twelve lines
        // from the end of recoverable(). The check is real and the bridge's own header records the day this
        // mismatch bit somebody -- it was simply being fed an answer that had declined to answer.
        //
        // ON KEITH'S RIG (124 builds on D:) IT NEVER FIRED. A GATE THAT ONLY WORKS WHERE THE DATA HAPPENS TO BE
        // is one that lies on a fresh clone, which is where a newcomer meets it.
        if (answer.refused) {
            ok("!! the page/tool field agreement is CHECKED, or its absence is NAMED",
                true,
                "no archives on this box, so recoverable() refused and there is no answer shape to compare " +
                "against. NOT CLAIMING A MISMATCH FROM A REFUSAL -- the fields the page reads (j." +
                read.join(", j.") + ") are checked where archives exist");
        } else {
        const absent = read.filter((k) => !(k in answer));
        ok("!! every field the page reads off a scan is one the tool actually returns",
            absent.length === 0,
            absent.length ? "page reads j." + absent.join(", j.") + " -- not in the tool's answer" : "checked: " + read.join(", "));
        }
        const bsrc = fs.readFileSync(path.join(ENG, "ai-bridge/moduleHistoryBridge.js"), "utf8");
        ok("...and the bridge FORWARDS that answer rather than restating its shape",
            /Object\.assign\(\{ ok: true \}, r\)/.test(bsrc),
            "a hand-listed whitelist drops every field added after it was written -- which is how realCount " +
            "reached the page as undefined");
    }
    const b = fs.readFileSync(path.join(ENG, "ai-bridge/moduleHistoryBridge.js"), "utf8");
    const code = noComments(b);
    ok("the bridge imports the tool", /import\(["']\.\.\/tools\/ship\/moduleHistory\.mjs["']\)/.test(code));
    ok("!! ...and contains NO second zip walk", !/readCentralDirectory|0x06054b50|EOCD/.test(code),
        "v3046 shipped a bridge whose 17 checks passed while the module it delegated to did not exist, because nobody checked that it delegated");
    ok("the restore route refuses to overwrite", /already in the tree/.test(b),
        "writing an older copy over newer work is the ratchet-growing-back failure and the hardest kind to notice later");
    ok("the restore route is membership-checked, not pattern-checked", /recoverable set the tool just computed/.test(b));
    ok("every route is local-only", /local only/.test(code) && /localOk/.test(code));
    // v3204 -- KEITH OPENED THE PAGE AND EVERY ROUTE SAID "local only". The bridge had its own isLocal that
    // accepted 127.0.0.1 and nothing else, so a browser ON THE HOST reaching the bridge by the machine's LAN IP
    // read as REMOTE. server.js:3739 has counted this machine's own interface IPs since v1543 and says why in a
    // comment. THE CHECK THAT MATTERS IS THAT THE TWO ARE THE SAME ONE -- a second definition of "is this
    // request local" is the same defect as the second definition of "what does this file reach" that cost 66
    // modules, and this one silently locks the owner out of his own tool instead.
    ok("!! ...and 'local' is the SERVER'S definition, passed in, not a second copy",
        /ctx\.isLocal/.test(code) && !/a === "127\.0\.0\.1"/.test(code),
        "hand-rolled loopback-only checks read a same-machine LAN request as remote");
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge/server.js"), "utf8");
    ok("!! ...and server.js actually PASSES it to this bridge",
        /moduleHistoryBridge\.handle\(req, res, \{ sendJson, isLocal: _isLocalReq \}\)/.test(srv),
        "the bridge falls back to a STRICT check if it is missing, so forgetting this locks the page out rather than opening it up -- but then the page is broken, which is what happened");
    ok("the refusal NAMES the rejected address", /which the server does not count as this machine/.test(b),
        '"local only" with no address cannot be told apart from a bug in the check itself, which is what it was');
    const page = fs.readFileSync(path.join(ENG, "module-history.html"), "utf8");
    ok("the page exists and is linked from server.html",
        page.length > 0 && fs.readFileSync(path.join(ENG, "server.html"), "utf8").includes("module-history.html"),
        "a module with no caller is unfinished");
    ok("!! the page NAMES an empty archive instead of rendering it as a clean result",
        /not a clean result/.test(page),
        "zero builds and zero losses render identically, and the second reads as good news");
}

// =========================================================================================================
console.log("\n9. THE TREE, AFTER THE RESTORE");
{
    const r = deadImportScan(ENG);
    const outside = r.dead.filter((d) => !d.file.startsWith("engine/"));
    // THE PRECISE CLAIM, because my first attempt at this check was WRONG IN THE INFLATING DIRECTION: it
    // matched every `await import()` of a missing module in main.js, not the TOP-LEVEL ones, so it reported
    // eleven survivors that are all inside try{} or inside functions and are legitimately optional. Its own
    // comment said "deliberately narrowly" while it was broader. A check that over-reports gets switched off
    // just as fast as one that under-reports. So: the ELEVEN THAT WERE ACTUALLY FATAL are named and must
    // resolve. A named list cannot inflate, and if somebody re-breaks one of them this goes red for that file.
    const WERE_FATAL = [
        "./ui/DamageFlash.js", "./render/CascadedShadowPass.js", "./simulation/SatelliteFleet.js",
        "./simulation/DamageNumbers.js", "./simulation/RobotReactor.js", "./simulation/SnarkyListener.js",
        "./simulation/RobotIdleBehavior.js", "./ai/BrowserTTS.js", "./simulation/FpsStateSaver.js",
        "./render/ThrowCinematic.js",
    ];
    const stillBroken = WERE_FATAL.filter((spec) => !resolves(path.join(ENG, "main.js"), spec));
    ok("!! the ten top-level awaited imports that stopped main.js linking all resolve again",
        stillBroken.length === 0, stillBroken.join(", ") || "all ten restored from the v3158 archive");
    ok("...and the eleventh, in a gate rather than main.js, resolves too",
        !!resolves(path.join(ENG, "world/tools/water-attacks-selfcheck.mjs"), "../kaijuAttackFx.js"));
    ok("broken static imports outside the known-dead engine/ cluster are only the ones baselined",
        outside.every((d) => KNOWN_MISSING.has(d.file + " -> " + d.spec)),
        outside.map((d) => d.file + " -> " + d.spec).join(", ") || "none");
    ok("!! the suppression list is EMPTY -- every entry it ever held was deleted, not extended",
        KNOWN_MISSING.size === 0,
        "two entries, two deletions (MemoryHeatmapOverlay at v3205, CapeShield at v3206). Naming the correct " +
        "response in advance is the only thing that has reliably stopped a threshold here being widened instead");
    ok("!! ZERO broken static imports remain -- the barrel was deleted at v3207 with a recovery archive",
        r.dead.length === 0,
        r.dead.map((d) => d.file + " -> " + d.spec).join(", ") || "clean");
}

// =========================================================================================================
console.log("\n10. v3208 -- THE THREE THINGS THAT WERE WEARING ONE LABEL");
{
    const { builds } = MH.indexArchives();
    const r = MH.recoverable({ builds });

    // v3215 -- *** THIS SECTION CRASHED ON A MACHINE WITH NO ARCHIVES, AND THE TOOL WAS RIGHT. ***
    // recoverable() REFUSES a zero-build index -- v3203 built that on purpose, because "absent from every
    // version" and "no versions examined" are opposite claims. It returns { refused } and no rows. The gate
    // then did r.rows.every(...) and died with a TypeError, so a correct refusal read as a broken tool: exactly
    // the confusion the refusal exists to prevent, reproduced one level up by the thing checking it.
    //
    // ON KEITH'S RIG THIS NEVER FIRES -- 124 builds on D: -- WHICH IS WHY IT SURVIVED. A gate that only works
    // where the data happens to be is a gate that cannot be trusted on a fresh clone, and a crash is not a
    // verdict.
    if (r.refused) {
        ok("!! a zero-archive environment REFUSES rather than answering", typeof r.refused === "string" && r.refused.length > 0,
            "no SweK_Engine_v*.zip in any searched folder, so recoverable() refused: \"" + String(r.refused).slice(0, 90) +
            "\". THE ROW-SHAPE CHECKS BELOW NEED ARCHIVES AND ARE NOT RUN -- said out loud, because a section " +
            "that silently skipped would be indistinguishable from one that passed");
    } else {
    ok("every row carries a kind", r.rows.every((x) => typeof x.kind === "string"));
    ok("!! a `//` comment is not counted as a reference",
        (r.rows.find((x) => /tools\/ship\/y\.js$/.test(x.target)) || {}).kind === "commented",
        "deadImportScan.mjs has import(\"./y.js\") in a comment that noComments cannot strip, because the line " +
        "above defines a regex literal with a BACKTICK inside a character class -- it flips the stripper into " +
        "template-string mode. Not fixable without a parser, so the line itself is re-read");
    ok("!! a code-shaped string inside a GATE is labelled as one",
        r.rows.filter((x) => x.kind === "fixture").length >= 2,
        "gates are the files most likely to contain code-shaped strings and this tree has 604 of them, so a " +
        "text scan over-reports exactly where it is densest");
    ok("!! an OPTIONAL BUILD OUTPUT is not a defect",
        (r.rows.find((x) => /terrain_wasm\.js$/.test(x.target)) || {}).kind === "optional-build",
        "world/terrainWasm.js loads it in a try/catch and its header says NEVER required -- the 404 IS the design, " +
        "and the v3050 render-QA failure it caused was a QA problem, not a code one");
    ok("!! NOTHING IS DROPPED -- all four are still listed, just grouped",
        r.rows.length >= 4 && r.wanted >= 4,
        "a gate CAN have a genuinely broken import and an optional build CAN be one you meant to run; hiding " +
        "them trades over-reporting for the worse failure");
    ok("the headline count is the REAL one, not the total",
        typeof r.realCount === "number" && r.realCount === r.rows.filter((x) => x.kind === "missing").length,
        r.realCount + " genuinely missing of " + r.rows.length + " listed");
    }
}

// =========================================================================================================
console.log("\n11. THE ARCHIVE CAN BE POINTED SOMEWHERE THIS FILE DOES NOT KNOW ABOUT");
{
    const dirs = MH.defaultArchiveDirs();
    ok("the default list still includes Downloads", dirs.some((d) => /Downloads$/i.test(d)) || dirs.length >= 2);
    ok("!! addArchiveDir REFUSES a path that is not a readable directory",
        MH.addArchiveDir(path.join(os.tmpdir(), "swek-no-such-dir-" + Date.now())).ok === false,
        "a typo or a wrong drive letter is the likeliest mistake here, and accepting one silently puts the tool " +
        "back to reporting 'not in any archived build' out of a folder it cannot read");
    ok("...and refuses an empty path", MH.addArchiveDir("").ok === false);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "swek-empty-"));
    const added = MH.addArchiveDir(empty);
    ok("!! a real directory holding NO zips is accepted but SAYS SO",
        added.ok === true && added.zips === 0 && !!added.why,
        "silently accepting it would be the same defect one layer out -- an answer from a place with nothing in it");
    MH.removeArchiveDir(empty);
    fs.rmSync(empty, { recursive: true, force: true });
    ok("...and removing it leaves the config clean", !MH.configuredArchiveDirs().includes(empty));
    // v3210 -- A SETTING INSIDE THE VERSION FOLDER IS A SETTING THAT SILENTLY RESETS.
    ok("!! the archive config lives OUTSIDE the build, so an update cannot erase it",
        !MH.ARCHIVE_CONFIG.includes("SweK_Engine_v") && !MH.ARCHIVE_CONFIG.startsWith(ENG),
        MH.ARCHIVE_CONFIG + " -- v3208 kept it at tools/ship/archive-dirs.json, INSIDE the folder every update "
        + "replaces wholesale, and it shipped as an empty list so a new build would quietly reset it");
    ok("...and it sits with the other settings that must survive one",
        /\.voxelbridge/.test(MH.ARCHIVE_CONFIG),
        "auth.json, the credential vault and just-updated.json are all there for the same reason");
    ok("...and no in-tree copy ships to advertise the wrong home",
        !fs.existsSync(path.join(ENG, "tools", "ship", "archive-dirs.json")));

    const b = fs.readFileSync(path.join(ENG, "ai-bridge/moduleHistoryBridge.js"), "utf8");
    ok("the bridge exposes it and the page can reach it",
        /\/dirs/.test(b) && fs.readFileSync(path.join(ENG, "module-history.html"), "utf8").includes("/modulehistory/dirs"));
}

console.log("\n" + (fail === 0
    ? `moduleHistory-selfcheck: all ${pass} checks pass`
    : `moduleHistory-selfcheck: ${fail} FAILED, ${pass} passed`));
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(fail === 0 ? 0 : 1);
