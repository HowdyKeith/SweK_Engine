// WebGLEngine/tools/ship/vbaArchive-selfcheck.mjs -- v4159
//
// Run: node tools/ship/vbaArchive-selfcheck.mjs     (fast -- one real scan of this repository, plus fixtures)
//
// GATES vba/archiveManifest.mjs, ai-bridge/vbaArchiveBridge.js, ai-bridge/run-macro.vbs, excel.html's front
// door, and the panel rename on the render page.
//
// *** THE ARCHIVE IS NOT HERE, WHICH IS THE HARD PART OF GATING THIS AT ALL. *** The transmitter, the OpenGL
// render engine and the connector workbook live on Keith's machine; this box has neither them nor Excel. A
// gate that could only speak once a real archive was attached would be a gate that never ran, and the code it
// was meant to protect would ship on nothing but a reading.
//
// So it checks THE THREE THINGS THAT ARE FULLY DETERMINED WITHOUT THE ARCHIVE, and says plainly that the
// fourth is unchecked:
//   1. THE REFUSALS. What this must never do -- mistake a folder, run a macro nobody allowed, write into the
//      archive, copy it in -- is decidable here and is where the damage would be.
//   2. THE RECOGNISER, against fixtures whose contents this file states outright, so a marker list that drifts
//      away from the manifest fails rather than co-varies with it.
//   3. THE REAL SCAN OF THIS REPOSITORY. Its correct answer is ZERO OF FOUR PARTS, and that is not a trivial
//      assertion: this tree holds six folders of genuine VBA source, one of which (Shared/Net/) carries three
//      of the transmitter's own Winsock modules. A recogniser that counted marker hits would link the engine's
//      650-line extract as the 189-module transmitter and report itself healthy.
//   UNCHECKED: everything past "Excel answered", and the marker lists themselves. Those names were read out of
//   this tree's changelog and NOTES, not out of a directory listing of the archive -- which is exactly why the
//   manifest carries `provisional: true` rather than a comment saying so, and why this gate asserts that flag
//   is still set. When a real archive is scanned, the flag comes down and the markers come from its listing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PARTS, PART_IDS, MIN_DECISIVE, PROVISIONAL, READ_AGAINST, VBA_EXT, DOC_MODULE,
         classifyFolder, linkReport, moduleKey, isVbaSource, nameHint, scorePart,
         importableCount } from "../../vba/archiveManifest.mjs";
import { noComments, codeOnly } from "./sourceScan.mjs";

const ENG  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(ENG, "..");
const require = createRequire(import.meta.url);
const bridge = require("../../ai-bridge/vbaArchiveBridge.js");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const read = (p) => { try { return fs.readFileSync(path.join(ENG, p), "utf8"); } catch { return ""; } };
console.log("vbaArchive-selfcheck -- the VBA half, linked rather than copied\n");

// ---- 1. THE MANIFEST IS INTERNALLY CONSISTENT -------------------------------------------------------------
console.log("1. the manifest");
ok("!! four parts, ids unique", PARTS.length === 4 && new Set(PART_IDS).size === 4, PART_IDS.join(", "));
ok("!! every part carries at least MIN_DECISIVE decisive markers",
    PARTS.every((p) => (p.decisive || []).length >= MIN_DECISIVE),
    "a part with fewer could never be recognised at all -- the threshold would exceed its whole evidence");
ok("!! no marker is both decisive AND shared for one part",
    PARTS.every((p) => !(p.decisive || []).some((d) => (p.shared || []).map(moduleKey).includes(moduleKey(d)))),
    "a module cannot both decide and merely corroborate");
{
    // *** v4160 -- THIS WAS "EXACTLY ONE OVERLAP, AND IT IS modGLConstants". THE REAL ARCHIVE SAYS ZERO. ***
    // v4159 put modGLConstants in BOTH workbooks' decisive lists on the reasoning that a GL renderer must
    // declare GL, and built a low-confidence tie branch to handle the collision it had just created. The
    // renderer declares GL in `GLConstants.bas`; only the voxel workbook has `modGLConstants.bas`. Checked
    // across all five folders of SweK_VBA_v3499. So the parts are cleanly separable and the correct assertion
    // is that NOTHING is shared -- which is strictly stronger, and would have caught the original mistake.
    const seen = new Map();
    for (const p of PARTS) for (const d of (p.decisive || [])) {
        const k = moduleKey(d); seen.set(k, (seen.get(k) || []).concat(p.id));
    }
    const overlaps = [...seen.entries()].filter(([, ids]) => ids.length > 1).map(([k, ids]) => k + " -> " + ids.join("+"));
    ok("!! NO decisive marker is shared between parts", overlaps.length === 0, overlaps.join("; ") || "none -- the four parts are cleanly separable");
    ok("!! and the two GL constants modules are genuinely different names",
        moduleKey("GLConstants.bas") !== moduleKey("modGLConstants.bas"),
        "GLConstants (render engine) vs modGLConstants (voxel workbook) -- v4159 assumed one module, there are two");
}
ok("!! the manifest is no longer provisional, because a real archive was read",
    PROVISIONAL === false && READ_AGAINST === "SweK_VBA_v3499",
    "corrected against " + READ_AGAINST + " -- markers widened from its listing, threshold untouched");
ok("!! document modules do not inflate a folder's module count",
    importableCount(["modGL.bas", "ThisWorkbook.cls", "Sheet2.cls", "OpenGLWindow.cls"]) === 2,
    "VBASyncCore holds 4 .bas/.cls and TWO are ThisWorkbook/Sheet2 -- reporting 4 overstates the smallest " +
    "part by a factor of two, and two markers out of two importable modules is a far stronger reading");
ok("!! document modules are excluded by pattern, not by hope",
    DOC_MODULE.test("ThisWorkbook") && DOC_MODULE.test("Sheet3") && !DOC_MODULE.test("modGPUBrain"),
    "ThisWorkbook/Sheet* cannot be imported, only pasted -- so they are never markers");
ok("!! .frx is not VBA source", isVbaSource("Form1.frm") && !isVbaSource("Form1.frx") && !VBA_EXT.has(".frx"),
    "a .frm's binary companion is not a module");
ok("!! module names compare case- and extension-insensitively",
    moduleKey("WinsockUtils.BAS") === moduleKey("winsockutils") && moduleKey("clsMQTTClient.cls") === "clsmqttclient",
    "a workbook exported on Windows and read on Linux differs in neither");
report("the transmitter's port is " + (PARTS.find((p) => p.id === "transmitter") || {}).port +
       ", which Shared/modEngineBridge.bas already probes");

// ---- 2. THE TRAP: Shared/Net/ IS NOT THE TRANSMITTER -------------------------------------------------------
console.log("\n2. the trap -- this repository's own Winsock extract");
{
    const netDir = path.join(REPO, "Shared", "Net");
    const netModules = fs.existsSync(netDir) ? fs.readdirSync(netDir).filter(isVbaSource) : [];
    ok("!! Shared/Net/ exists and holds real VBA source", netModules.length >= 3, netModules.join(", "));
    const tx = PARTS.find((p) => p.id === "transmitter");
    const shared = netModules.filter((m) => (tx.shared || []).map(moduleKey).includes(moduleKey(m)));
    ok("!! it carries THREE modules the transmitter also has", shared.length === 3, shared.join(", "));
    const c = classifyFolder({ name: "Net", modules: netModules });
    // *** THE LOAD-BEARING ASSERTION OF THIS WHOLE FILE. ***
    ok("!! and it is STILL NOT classified as the transmitter", c.part === null, c.reason);
    ok("!! its shared hits are reported rather than discarded", c.shared.length === 3, c.shared.join(", "));
    ok("!! a hit-counting classifier would have got this wrong",
        scorePart(tx, netModules).shared.length >= MIN_DECISIVE && scorePart(tx, netModules).score === 0,
        "3 shared hits, 0 decisive -- which is why only decisive hits decide");
    // The folder is even NAMED in a way that helps nothing: "Net" matches no hint, so the name could not have
    // rescued a classifier that leaned on it either.
    ok("!! and the folder name offers no rescue", !nameHint(tx, "Net"), "'Net' matches no transmitter hint");
}

// ---- 3. THE REAL SCAN: THIS ENTIRE REPOSITORY LINKS ZERO PARTS ---------------------------------------------
console.log("\n3. the real scan of this repository");
const scan = await bridge.scan(REPO);
ok("!! the scan succeeds", scan.ok === true, scan.error || "");
ok("!! it finds this tree's real VBA folders", scan.folders >= 6, scan.folders + " folders holding .bas/.cls/.frm");
ok("!! ZERO of the four parts are linked", scan.present === 0 && scan.linked === false, scan.summary);
ok("!! and every VBA folder here is reported unclassified rather than guessed at",
    scan.unclassified.length === scan.folders && scan.unclassified.every((u) => u.reason),
    scan.unclassified.map((u) => u.rel).join(", "));
ok("!! missing is ok:true, not an error",
    scan.ok === true && linkReport([]).ok === true && linkReport([]).linked === false,
    "the archive ships separately BY DESIGN -- a gate that cries about the ordinary case teaches people to ignore it");
ok("!! each unclassified folder still reports its size and a sample",
    scan.unclassified.every((u) => u.sources > 0 && Array.isArray(u.sample)),
    "naming what was found beats forcing it into one of four buckets");
ok("!! and the sample is a SAMPLE -- never the folder's full listing",
    scan.unclassified.every((u) => u.sample.length <= 5),
    "a folder's full module list is the archive's business");
report("largest here: " + scan.unclassified.map((u) => u.rel + " (" + u.sources + ")").sort().join(", "));

// ---- 4. THE RECOGNISER, ON FIXTURES WHOSE CONTENTS THIS FILE STATES ----------------------------------------
console.log("\n4. the recogniser");
{
    // Written out module-by-module ON PURPOSE. Deriving a fixture from PARTS would make this section pass for
    // any marker list at all, including an empty one -- the gate would co-vary with the thing it checks.
    // *** EVERY MODULE NAME BELOW WAS READ OUT OF SweK_VBA_v3499 AND VERIFIED EXCLUSIVE TO ITS FOLDER
    // ACROSS ALL FIVE. *** v4159's version of this list was written from changelog prose and got two of the
    // four wrong -- the engine's GL module and three of VBASyncCore's four names, which a changelog entry the
    // manifest itself cited had already recorded as deleted.
    const cases = [
        ["transmitter", "VBATransmitter", ["WinsockDeclares.bas", "WinsockUtils.bas", "modTaskerHost.bas",
                                           "BonjourUtils.bas", "clsMQTTClient.cls", "clsStringBuilder.cls"]],
        ["engine",      "VBAEngine",      ["GLConstants.bas", "OpenGLRenderer.cls", "OpenGLWindow.cls",
                                           "modWGLContext.bas", "Demo_BridgeFPS.cls", "modInit.bas",
                                           "modHAInstall.bas", "ThisWorkbook.cls"]],
        ["connector",   "VBAVoxelEngine", ["modGLConstants.bas", "modOllamaInit.bas", "modEngineBridge.bas"]],
        ["smaller",     "VBASyncCore",    ["VBASyncEngine.bas", "VBASyncBootstrap.bas",
                                           "ThisWorkbook.cls", "Sheet2.cls"]],
    ];
    for (const [want, name, modules] of cases) {
        const c = classifyFolder({ name, modules });
        ok("!! " + name + " -> " + want, c.part === want, c.reason + "  [" + c.confidence + "]");
    }
    // ONE MARKER IS A COINCIDENCE. Somebody copying a single module out of the transmitter to read it should
    // not relabel whatever folder it landed in.
    const one = classifyFolder({ name: "misc", modules: ["modTaskerHost.bas", "Utils.bas"] });
    ok("!! one decisive marker is not enough", one.part === null && one.score === 1, one.reason);
    // A FOLDER THE NAME ALONE WOULD CONVICT.
    const named = classifyFolder({ name: "VBATransmitter", modules: ["Readme.bas"] });
    ok("!! the folder name alone never decides", named.part === null, named.reason);
    // A TIE, CONSTRUCTED RATHER THAN FOUND -- and that change is itself the v4160 finding. In v4159 this case
    // was a real overlap between the two workbooks; the archive showed there is none, so a folder that ties
    // now has to be BUILT by mixing two parts' markers. The branch is still exercised, because an archive
    // somebody merges by hand could still produce one, but it is no longer claimed to exist in this archive.
    const tieMods = ["GLConstants.bas", "Demo_BridgeFPS.cls", "modGLConstants.bas", "modOllamaInit.bas"];
    const tie = classifyFolder({ name: "workbook", modules: tieMods });
    ok("!! a folder mixing two parts' markers is reported as a tie, not coin-tossed",
        tie.part !== null && tie.confidence === "low" && tie.runnerUp && tie.runnerUp.score === tie.score,
        tie.part + " over " + (tie.runnerUp || {}).id + " -- " + tie.reason);
    const tieNamed = classifyFolder({ name: "VBAVoxelEngine", modules: tieMods });
    ok("!! and the folder name breaks that tie toward the connector", tieNamed.part === "connector", tieNamed.reason);
    // AN EMPTY FOLDER SAYS SO IN ITS OWN WORDS rather than sharing the generic refusal.
    const empty = classifyFolder({ name: "docs", modules: ["README.md", "notes.txt"] });
    ok("!! a folder with no VBA source says exactly that", empty.part === null && /no VBA source/.test(empty.reason), empty.reason);
}

// ---- 5. A FIXTURE ARCHIVE ON REAL DISK, SCANNED END TO END -------------------------------------------------
console.log("\n5. a fixture archive, on disk");
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vba-archive-"));
    const put = (rel, names) => {
        const d = path.join(tmp, rel);
        fs.mkdirSync(d, { recursive: true });
        for (const n of names) fs.writeFileSync(path.join(d, n), "Attribute VB_Name = \"x\"\n");
    };
    // LAID OUT LIKE THE REAL ARCHIVE: the four parts as siblings, plus a stray. VBASyncCore is its own
    // top-level folder in SweK_VBA_v3499 -- v4159's fixture buried it under VBAEngine/addons/, which is where
    // the DEMOS live, and that mistake is why the nesting rule below had to be discovered from the real thing.
    put("VBATransmitter", ["WinsockDeclares.bas", "modWebGLEngineHost.bas", "modControlPanelHost.bas", "clsWebsocketClient.cls"]);
    put("VBAEngine",      ["GLConstants.bas", "OpenGLRenderer.cls", "modWGLContext.bas", "Demo_BridgeFPS.cls"]);
    put("VBAVoxelEngine", ["modOllamaInit.bas", "modGLConstants.bas", "modEngineBridge.bas"]);
    put("VBASyncCore",    ["VBASyncEngine.bas", "VBASyncBootstrap.bas", "ThisWorkbook.cls", "Sheet2.cls"]);
    put("VBAEngine/addons/VBAOpenGL_Demos", ["AntColonyVisualizer.cls", "ComputeBoidSystem.cls", "CameraEffectSystem.cls"]);
    put("notes", ["scratch.bas"]);
    const r = await bridge.scan(tmp);
    ok("!! all four parts link", r.present === 4 && r.linked === true, r.summary);
    ok("!! and the stray folder is unclassified, not forced into a bucket",
        r.unclassified.length === 1 && r.unclassified[0].rel === "notes", (r.unclassified[0] || {}).reason);
    // *** v4160 -- THE NESTING RULE, WHICH THE REAL ARCHIVE TAUGHT. *** VBAEngine/addons/VBAOpenGL_Demos holds
    // 69 modules and carries no decisive marker of its own, so v4159 reported it "unclassified" -- true in the
    // narrow sense and useless in every other, since it sits INSIDE the engine folder linked directly above
    // it. Three such folders came back as strangers on the first real scan and buried the one folder that
    // genuinely was unrecognised. Containment is by DIRECTORY, so a name cannot fool it.
    const eng = r.parts.find((p) => p.id === "engine");
    ok("!! a VBA folder inside a linked part is reported as that part's sub-folder, not a stranger",
        eng.subFolders.length === 1 && /VBAOpenGL_Demos$/.test(eng.subFolders[0].rel) &&
        !r.unclassified.some((u) => /VBAOpenGL_Demos/.test(u.rel)),
        "engine sub-folders: " + eng.subFolders.map((f) => f.rel + " (" + f.sources + ")").join(", "));
    ok("!! the nested folder is reached at depth 3 at all",
        eng.subFolders.length === 1,
        "an archive nests addons/VBAOpenGL_Demos/, so MAX_DEPTH " + bridge.MAX_DEPTH + " is not decoration");
    ok("!! and document modules are excluded from the importable count",
        r.parts.find((p) => p.id === "smaller").sources === 4 &&
        r.parts.find((p) => p.id === "smaller").importable === 2,
        "VBASyncCore: 4 files, 2 of them ThisWorkbook/Sheet2 -- so TWO importable modules, both of them markers");
    ok("!! a count that disagrees with the recorded one is REPORTED, not judged",
        r.parts.find((p) => p.id === "transmitter").countsAgree === false && r.ok === true,
        "fixture has 4 modules against 195 recorded -- the archive is the authority on its own size, and " +
        "SweK_VBA_v3499 already disagreed with this tree's notes in both directions (189->195, 73->64)");
    ok("!! each linked part carries the folder it was found in", r.parts.filter((p) => p.present).every((p) => p.dir && fs.existsSync(p.dir)));
    // TWO COPIES: the fuller one wins, so a half-extracted zip beside a whole one does not win by being first.
    put("old/VBATransmitter", ["modWebGLEngineHost.bas", "modTaskerHost.bas"]);
    const r2 = await bridge.scan(tmp);
    const tx = r2.parts.find((p) => p.id === "transmitter");
    ok("!! two copies of one part: the fuller folder wins", tx.sources === 4 && !/old/.test(tx.dir), tx.dir);
    // *** NOTHING WAS WRITTEN INTO THE FIXTURE. *** The bridge opened it read-only, and this proves it rather
    // than trusting the header that says so.
    const before = new Set(fs.readdirSync(path.join(tmp, "VBATransmitter")));
    await bridge.scan(tmp);
    const after = fs.readdirSync(path.join(tmp, "VBATransmitter"));
    ok("!! scanning wrote nothing into the archive", after.length === before.size && after.every((f) => before.has(f)),
        "a bridge that could write into the source of the workbooks could damage the one copy of it");
    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- 6. REFUSALS ------------------------------------------------------------------------------------------
console.log("\n6. refusals");
{
    const bad = await bridge.scan(path.join(REPO, "no-such-folder-" + Date.now()));
    ok("!! a missing root is refused, not linked", bad.ok === false && bad.error === "not-found", bad.error);
    const file = await bridge.scan(path.join(ENG, "main.js"));
    ok("!! a file is refused", file.ok === false && file.error === "not-a-folder", file.error);
    const zip = bridge.extractZip(path.join(ENG, "main.js"));
    ok("!! extract refuses anything that is not a .zip", zip.ok === false && /\.zip/.test(zip.error), zip.error);
    const nozip = bridge.extractZip(path.join(os.tmpdir(), "nope-" + Date.now() + ".zip"));
    ok("!! extract refuses a zip that is not there", nozip.ok === false, nozip.error);

    // THE ALLOWLIST, AND IT ANSWERS ON THIS BOX. See the note in runMacro: the platform check deliberately
    // comes SECOND, so every refusal below is a real refusal rather than a Linux shrug.
    const shell = await bridge.runMacro({ macro: "Shell", book: path.join(ENG, "main.js") });
    ok("!! a macro not on the allowlist is refused BY NAME", shell.ok === false && /not on the allowlist/.test(shell.error), shell.error);
    const blank = await bridge.runMacro({ macro: "", book: path.join(ENG, "main.js") });
    ok("!! an empty macro name is refused", blank.ok === false && /not on the allowlist/.test(blank.error), blank.error);
    const inject = await bridge.runMacro({ macro: "BridgeTick'!Shell(\"calc\")'", book: path.join(ENG, "main.js") });
    ok("!! a name that merely CONTAINS an allowed one is refused",
        inject.ok === false && /not on the allowlist/.test(inject.error),
        "membership is exact -- a prefix match here would be an argument-injection hole into Application.Run");
    ok("!! every allowed macro carries the reason it is allowed",
        bridge.MACROS.length >= 5 && bridge.MACROS.every((m) => m.why && m.part && bridge.MACRO_NAMES.has(m.name)),
        bridge.MACROS.length + " entries, each naming its part");
    if (process.platform !== "win32") {
        const good = await bridge.runMacro({ macro: "BridgeTick", book: path.join(ENG, "main.js") });
        ok("!! an ALLOWED macro is then refused for the platform, not the name",
            good.ok === false && /Windows \+ Excel/.test(good.error), good.error);
    } else report("on Windows -- the platform branch is the one that runs, not the refusal");
}

// ---- 7. THE BRIDGE'S SHAPE --------------------------------------------------------------------------------
console.log("\n7. the bridge's shape");
{
    const raw = read("ai-bridge/vbaArchiveBridge.js");
    const str = noComments(raw);     // string literals KEPT -- paths and route names live in them
    const code = codeOnly(raw);      // strings AND comments blanked -- code shapes only
    ok("!! the link file sits beside host-timings.local.json", /vba-archive\.local\.json/.test(str) && /"tools", "ship"/.test(str),
        bridge.LINK.replace(ENG, "<engine>"));
    ok("!! extraction lands outside this tree", bridge.VBA_HOME.includes(".voxelbridge") && !bridge.VBA_HOME.startsWith(REPO + path.sep),
        bridge.VBA_HOME);
    ok("!! the extract destination is NOT a caller parameter",
        /function extractZip\(zipPath\)/.test(code) && !/extractZip\([^)]*dest/.test(code),
        "a zip can carry ../ in its entries, so the destination is computed, never passed");
    ok("!! every write targets the link file or the extract home -- never a scanned root",
        (code.match(/fs\.(writeFileSync|appendFileSync|rmSync|unlinkSync|cpSync|copyFileSync)/g) || []).length <= 2 &&
        /writeFileSync\(LINK/.test(code) && /unlinkSync\(LINK\)/.test(code),
        "the archive is opened read-only");
    ok("!! mkdir only ever creates the link file's folder or the extract destination",
        (code.match(/mkdirSync/g) || []).length === 2 && /mkdirSync\(path\.dirname\(LINK\)/.test(code) && /mkdirSync\(dest/.test(code));
    ok("!! linking a root with nothing in it is refused",
        /!s\.linked && !s\.unclassified\.length/.test(code),
        '"linked" over an empty report reads as "the archive is here and empty"');
    ok("!! a pointer whose folder is gone reports STALE rather than 'not linked'",
        /stale: true/.test(code), "the quiet answer is the same lie a stale copy tells, in the other direction");
    ok("!! the walk is depth- and count-bounded", bridge.MAX_DEPTH >= 3 && bridge.MAX_DEPTH <= 6 && /maxFolders/.test(code),
        "MAX_DEPTH " + bridge.MAX_DEPTH + " -- a wrong root cannot walk a disk");
    ok("!! .git and node_modules are never walked", bridge.SKIP.has(".git") && bridge.SKIP.has("node_modules"));
}

// ---- 8. run-macro.vbs -------------------------------------------------------------------------------------
console.log("\n8. run-macro.vbs");
{
    const vbs = read("ai-bridge/run-macro.vbs");
    ok("!! it exists and takes <workbook> <macro>", vbs.length > 0 && /args\.Count < 2/.test(vbs));
    ok("!! the workbook is opened READ-ONLY", /Workbooks\.Open\(bookPath, False, True\)/.test(vbs), "UpdateLinks:=False, ReadOnly:=True");
    ok("!! and closed WITHOUT saving", /wb\.Close False/.test(vbs) && !/wb\.Save/.test(vbs),
        "running a macro should not silently rewrite the file it lives in");
    ok("!! Workbook_Open does not fire just to call one macro", /EnableEvents = False/.test(vbs));
    ok("!! it carries NO SECOND COPY of the allowlist",
        !bridge.MACROS.some((m) => vbs.includes(m.name)),
        "two allowlists that must agree are one allowlist and one stale list, and the stale one is permissive");
    ok("!! 'macro not found' is distinguished from 'macro failed'", /ERROR:no-macro/.test(vbs) && /ERROR:run-failed/.test(vbs),
        "different things for a caller to read");
    ok("!! it mirrors assemble-workbook.vbs's OK:/ERROR: contract", /"OK:"/.test(vbs) && /ERROR:no-excel/.test(vbs));
}

// ---- 9. WIRING ---------------------------------------------------------------------------------------------
console.log("\n9. wiring");
{
    const srv = read("ai-bridge/server.js");
    const srvCode = codeOnly(srv);
    ok("!! the bridge is required in server.js", /require\("\.\/vbaArchiveBridge\.js"\)/.test(noComments(srv)));
    ok("!! and mounted", /vbaArchiveBridge\.owns\(req\.url\)/.test(srvCode));
    // *** THE TDZ RULE, AS A RULE OVER EVERY MOUNT AND NOT A LINE NUMBER. *** `const readJson` shadows the
    // name for the whole enclosing block, so a mount passing it from ABOVE its declaration throws before it
    // reads a byte -- the class of defect that cost fifteen versions at v4133 and was caught again at v4154.
    const declAt = srvCode.indexOf("const readJson = (cb)");
    const mountAt = srvCode.indexOf("vbaArchiveBridge.owns(req.url)");
    ok("!! mounted BELOW the readJson it is handed", declAt > 0 && mountAt > declAt,
        "readJson declared at char " + declAt + ", mount at " + mountAt);
    ok("!! it is handed readJson, since every route but state/manifest is a POST", /vbaArchiveBridge\.handle\(req, res, \{ sendJson, readJson \}\)/.test(srvCode));

    const page = read("excel.html");
    ok("!! excel.html exists and is the front door", page.length > 0 && /\/vba\/state/.test(page) && /\/vba\/link/.test(page));
    ok("!! it reuses the workbook assembler rather than growing a second one", /\/workbook\/folders/.test(page) && /\/workbook\/assemble/.test(page));
    ok("!! it says no Excel has ever run against it", /No Excel has ever run against this/i.test(page),
        "the same per-row honesty sunshine.html and ios-tools.html carry");
    ok("!! it states the Shared/Net trap on the page, not only in the source", /Shared\/Net/.test(page) && /decisive/.test(page));
    ok("!! it says the archive is linked, never copied", /links.*copy|never copies|LINKS, IT NEVER COPIES|not copy one in/i.test(page));

    const front = read("server.html");
    ok("!! server.html carries an Excel button", /href="\/excel\.html"/.test(front) && /&#128202; Excel/.test(front));
    ok("!! whose title names the four parts and the allowlist",
        /transmitter/i.test(front) && /connector workbook/i.test(front) && /allowlist/i.test(front));

    const panel = read("ui/aiBrainPanel.js");
    const pStr = noComments(panel);
    ok('!! the render page\'s panel reads "Excel AI Brains"',
        /"Excel AI Brains"/.test(pStr) && !/textContent = "AI Brain"/.test(pStr),
        "the one label on that page that never said WHOSE brain it is");
    // Asserted against THE TAB'S OWN LINE rather than against the file. A file-wide search for the new name
    // passes the moment the header alone is renamed, which is the exact half-rename this is here to catch.
    const tabLine = (pStr.split("\n").find((l) => /tab\.textContent\s*=/.test(l)) || "");
    ok("!! its minitab was renamed too, not just the header", /Excel AI Brains/.test(tabLine), tabLine.trim() || "(no tab.textContent line)");

    const ign = (() => { try { return fs.readFileSync(path.join(REPO, ".gitignore"), "utf8"); } catch { return ""; } })();
    ok("!! the link file is gitignored", /vba-archive\.local\.json/.test(ign),
        "it says where a copy lives on THIS machine -- it is not a fact about the repository");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
            "\nunchecked here: anything past \"Excel answered\", and the marker lists themselves (the manifest " +
            "reports itself provisional until a real archive is scanned).");
process.exit(fails ? 1 : 0);
