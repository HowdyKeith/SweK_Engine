#!/usr/bin/env node
// WebGLEngine/tools/ship/orreryEjecta-selfcheck.mjs -- v4266
//
// Run: node tools/ship/orreryEjecta-selfcheck.mjs
//
// *** BACKLOG #46 ASKED FOR "VENDORING AS IMPACT EJECTA" AND NOTHING MODELLED IT. *** world/orrery.mjs places
// a body by licence state, size and arrival date -- "what did we take, and is it papered". It could not answer
// the question the metaphor is about: HOW FAR DID THE MATERIAL SPREAD. A dependency that landed and stayed
// where it fell and one whose fragments are embedded through the whole tree were drawn identically.
//
// *** AND MEASURING IT FOUND THE REGISTER WRONG IN BOTH DIRECTIONS AT ONCE. *** Three of the orrery's
// fourteen planets -- 21% of them -- contain NO CODE: vendor/grass is one LICENSE, vendor/keyhunt one
// ATTRIBUTION.txt, vendor/slug a LICENSE and a PROVENANCE.txt. They are licence RECORDS filed under vendor/
// because that is where the orrery looks, and it has been drawing them as captured code and counting their
// bytes as mass. Meanwhile v4263 found two bodies made of REAL copied code that the orrery cannot see at all,
// because its scanner reads one hardcoded directory.
"use strict";
import * as E from "../../world/orreryEjecta.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const BODIES = JSON.parse(fs.readFileSync(path.join(ROOT, "orrery.json"), "utf8")).bodies;

console.log("orreryEjecta-selfcheck -- how far the material spread, and three planets made of paperwork\n");

// =============================================================================================================
console.log("1. *** THE PAPERWORK PLANETS: 3 of 14 bodies contain no code at all ***");
{
    const subs = BODIES.map(E.substance);
    const paperOnly = subs.filter((s) => s.state === E.SUBSTANCE.PAPER_ONLY).map((s) => s.name);
    ok("*** three of the orrery's bodies are entirely paperwork ***",
        paperOnly.length === 3 && paperOnly.join(",") === E.PAPER_ONLY_BODIES.join(","),
        paperOnly.join(", ") + " -- " + (100 * paperOnly.length / BODIES.length).toFixed(0) + "% of the planets");
    // Asserted from the DISK, not from the bake, so a body cannot be paper-only in the record and code on disk.
    for (const name of E.PAPER_ONLY_BODIES) {
        const dir = path.join(ROOT, "vendor", name);
        const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
        ok("  vendor/" + name + " really holds only paperwork on disk",
            files.length > 0 && files.every((f) => E.isPaperFile(f)), files.join(" ") || "(missing)");
    }
    ok("and every OTHER body does have code", subs.filter((s) => s.state === E.SUBSTANCE.CODE).length === 11);
    // The consequence: mass. A licence file is not weight.
    const grass = BODIES.find((b) => b.name === "grass");
    ok("*** mass counted as code is 0 for a paper-only body, where total bytes said " + grass.bytes + " ***",
        E.massOf(grass) === 0 && grass.bytes > 0);
    ok("  and mass is unchanged for a body that is all code", (() => {
        const b = BODIES.find((x) => x.name === "box3d"); return E.massOf(b) === b.bytes; })(),
        "box3d " + E.massOf(BODIES.find((x) => x.name === "box3d")) + " bytes, no paperwork to discount");
    report("the orrery has been drawing 3 planets with a radius derived from a LICENSE file. They are not " +
        "captured dependencies -- they are filed licences for sources that were REACHED, and world/" +
        "reachedLicences.mjs is the register that was already meant to hold that shape.");
}

// =============================================================================================================
console.log("\n2. *** EJECTA: how far each body's material spread into the tree ***");
{
    // *** COMMENTS COME OUT FIRST, WHICH IS THE FIFTH TIME THIS SHAPE HAS BITTEN IN FOUR ROUNDS. ***
    // Excluding this gate by name fixed the count for exactly as long as it took to write the round's
    // ENGINE_VERSION note -- which quotes "vendor/box3d/box3d.js" while EXPLAINING the self-counting trap,
    // and thereby made main.js an importer of box3d. Naming offenders one at a time is not a fix. The rule
    // v4262 and v4264 both arrived at applies here too: a check about CODE strips the comments first.
    const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (/node_modules|^\.git$|^vendor$|GPU_Assets|demos_code/.test(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (/\.(mjs|js|html)$/.test(e.name))
            files.push({ path: path.relative(ROOT, p).replace(/\\/g, "/"),
                         source: codeOnly(fs.readFileSync(p, "utf8")) }); } };
    walk(ROOT);
    // *** THIS GATE EXCLUDES ITSELF, AND LEARNING WHY COST A WRONG BASELINE. *** Section 3's control fixture
    // contains the literal "../vendor/box3d/box3d.js", so the moment this file existed it became the 32nd
    // importer of box3d and the recorded 31 went red. A measuring instrument inside its own sample is the
    // fourth instance of this shape in three rounds (v4262's influence scan twice, v4263's licence phrase,
    // this one). The rule is the same every time: a scan must not count the scanner.
    const SELF = "tools/ship/orreryEjecta-selfcheck.mjs";
    for (let i = files.length - 1; i >= 0; i--)
        if (files[i].path.replace(/\\/g, "/") === SELF) files.splice(i, 1);
    ok("the sweep reaches the engine's own files, excluding vendor/ AND this gate", files.length > 3000,
        files.length + " files outside vendor/, self excluded");
    ok("  and this gate really would have counted itself -- it names vendor/box3d/ in a control",
        fs.readFileSync(path.join(ROOT, SELF), "utf8").includes("vendor/box3d/"),
        "which is why the exclusion is by path and not by hope");
    const measured = {};
    for (const b of BODIES) measured[b.name] = E.ejectaOf(b.name, files).length;
    for (const [name, want] of Object.entries(E.EJECTA_BASELINE))
        ok("  " + name.padEnd(11) + " " + String(measured[name]).padStart(3) + " importers",
            measured[name] === want, want === measured[name] ? "" : "recorded " + want);
    // The SHAPE is the finding: this discriminates, where the orrery's existing axes do not.
    const vals = Object.values(measured);
    ok("*** the measure discriminates: 0 to " + Math.max(...vals) + " across fourteen bodies ***",
        Math.max(...vals) >= 50 && Math.min(...vals) === 0,
        "three at " + measured.three + ", box3d at " + measured.box3d + ", three bodies at 0");
    ok("and every zero is a PAPER-ONLY body -- nothing with code is unimported",
        Object.entries(measured).filter(([, v]) => v === 0).map(([k]) => k).join(",") ===
        E.PAPER_ONLY_BODIES.join(","),
        "zeros: " + Object.entries(measured).filter(([, v]) => v === 0).map(([k]) => k).join(" "));
    report("THAT LAST LINE IS THE ONE WORTH READING: there is no vendored CODE in this tree that nothing " +
        "imports. The empty planets are empty because they hold no code, not because the code is unused.");
}

// =============================================================================================================
console.log("\n3. *** THE CITATION COUNT IS REFUSED, and the refusal is measured ***");
{
    // A first pass counted files that merely NAME a body. Shipping that would have made "wasm" the second
    // most-embedded dependency in the tree on the strength of an English word.
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (/node_modules|^\.git$|^vendor$|GPU_Assets|demos_code/.test(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (/\.(mjs|js|html)$/.test(e.name)) files.push(fs.readFileSync(p, "utf8")); } };
    walk(ROOT);
    const cites = (name) => { const re = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
        return files.filter((s) => re.test(s)).length; };
    const wasmCites = cites("wasm"), wasmImports = E.EJECTA_BASELINE.wasm;
    ok("*** 'wasm' is named in " + wasmCites + " files and imported from vendor/wasm by " + wasmImports + " ***",
        wasmCites > 100 && wasmImports <= 2,
        "a substring match on a directory name cannot tell a dependency from a common noun");
    const grassCites = cites("grass");
    ok("  and 'grass' scores " + grassCites + " on grassField and grassModel, while importing nothing",
        grassCites > 20 && E.EJECTA_BASELINE.grass === 0);
    // *** THE CONTROLS BELOW USED TO TEST A GUARD THAT DID NOTHING. *** ejectaOf once matched the path and
    // then required a quoted specifier; sabotage B deleted that second test and NO COUNT MOVED, because
    // `vendor/<name>/` is already unambiguous -- no sentence in 3,920 engine files contains it outside an
    // import. The redundant guard is gone and these now exercise the test that actually discriminates.
    ok("so ejectaOf matches the PATH FRAGMENT vendor/<name>/ and not a bare mention", (() => {
        const fake = [{ path: "x.js", source: "// this file talks about wasm and grass and box3d at length" }];
        return E.ejectaOf("wasm", fake).length === 0 && E.ejectaOf("grass", fake).length === 0 &&
               E.ejectaOf("box3d", fake).length === 0; })());
    ok("  and a near-miss path does not count either", (() => {
        const near = [{ path: "z.js", source: 'import x from "./vendor-notes/box3d/readme.js";' },
                      { path: "w.js", source: 'import y from "../box3d/thing.js";' }];
        return E.ejectaOf("box3d", near).length === 0; })(),
        "vendor-notes/box3d/ and a bare box3d/ are both refused");
    ok("  CONTROL: and it DOES fire on a real import specifier", (() => {
        const real = [{ path: "y.js", source: 'import x from "../vendor/box3d/box3d.js";' }];
        return E.ejectaOf("box3d", real).length === 1; })());
    ok("  CONTROL: and not on a different body's specifier", (() => {
        const real = [{ path: "y.js", source: 'import x from "../vendor/box3d/box3d.js";' }];
        return E.ejectaOf("jolt", real).length === 0; })());
}

// =============================================================================================================
console.log("\n4. *** THE SCANNER READS ONE DIRECTORY, AND THERE ARE TWO ***");
{
    const dirs = E.vendorDirs(ROOT, (d) => fs.readdirSync(d, { withFileTypes: true }), path.join);
    ok("*** there are TWO directories named vendor and the orrery's scanner reads one ***",
        dirs.length === 2 && dirs.includes("vendor") && dirs.includes("ui/vendor"), dirs.join(" and "));
    const scan = fs.readFileSync(path.join(ROOT, "tools/ship/orreryScan.mjs"), "utf8");
    ok("  orreryScan.mjs hardcodes path.join(engineRoot, \"vendor\")",
        /path\.join\(engineRoot, "vendor"\)/.test(scan),
        "so ui/vendor has been invisible to the orrery since the directory existed");
    ok("  and v4263 recorded what is in there: a 2,237-line QR generator", (() => {
        const cov = fs.readFileSync(path.join(ROOT, "world/copiedOutsideVendor.mjs"), "utf8");
        return /ui\/vendor\/qrcode\.mjs/.test(cov); })());
    // *** THIS CHECK COULD NOT FAIL ON THIS TREE AND A SABOTAGE PROVED IT. *** Removing the `continue` that
    // stops vendorDirs recursing into a vendor directory changed nothing: neither vendor/ nor ui/vendor/
    // happens to contain a nested folder called vendor, so the real tree cannot exercise the rule. Asserting
    // it against the live scan was an assertion that cannot fail -- the fourth of those this round. It is
    // asserted against a SYNTHETIC tree instead, which is what vendorDirs takes injected readdir/join for.
    {
        const tree = { "": ["a", "vendor"], "a": ["ui"], "a/ui": ["vendor"],
                       "vendor": ["nested", "three"], "vendor/nested": ["vendor"] };
        const fakeRead = (d) => (tree[d] || []).map((n) => ({ name: n, isDirectory: () => true }));
        const fakeJoin = (a, b) => (a ? a + "/" + b : b);
        const got = E.vendorDirs("", fakeRead, fakeJoin);
        ok("vendorDirs finds every vendor directory and does NOT recurse into one",
            got.join(" ") === "a/ui/vendor vendor",
            "found [" + got.join(" ") + "] -- vendor/nested/vendor is correctly NOT reported");
        ok("  CONTROL: the fixture really does contain a nested vendor that a recursing scan would find",
            tree["vendor/nested"].includes("vendor"));
    }
    ok("  and it skips the directories every scan in this tree skips",
        !dirs.some((d) => /node_modules|GPU_Assets|demos_code/.test(d)));
    report("*** THE REGISTER WAS WRONG IN BOTH DIRECTIONS AT ONCE: *** three planets here that are only " +
        "paperwork, and two bodies of real copied code that are not here at all. Section 1 is the first " +
        "half; v4263's world/copiedOutsideVendor.mjs is the second.");
}

// =============================================================================================================
// SABOTAGE LOG -- applied to a working tree, grep-confirmed before the result was read, EXIT CODE read as
// well as the red count, restored md5-identical.
//
//   A  isPaperFile stops recognising ATTRIBUTION and PROVENANCE.
//      -> 4 RED. keyhunt and slug stop being paper-only, the population falls 3 -> 1, and the zeros in
//      section 2 stop lining up with the paper-only set -- the check that ties the two halves together.
//
//   B  ejectaOf matches a bare NAME instead of the path fragment vendor/<name>/.
//      -> 18 RED, and the numbers are the citation count this round refused: three 67 -> 644, box3d 21 ->
//      176, krbn 7 -> 40. The measure that cannot tell a dependency from a common noun, re-inserted.
//
//   C  vendorDirs recurses into a vendor directory after finding it.
//      -> *** 0 RED ON THE FIRST TRY. *** Neither vendor/ nor ui/vendor/ contains a nested folder called
//      vendor, so the real tree cannot exercise the rule and the check was an assertion that could not fail.
//      It now runs against a SYNTHETIC tree -- which is what vendorDirs takes an injected readdir for -- with
//      a control that the fixture really does contain the nested vendor a recursing scan would report.
//      1 RED after.
//
// *** THIS ROUND PRODUCED FOUR MEASUREMENTS THAT WERE WRONG BEFORE THEY WERE RIGHT, and they are recorded
// *** because three of them share one cause: I kept measuring with something other than the code that ships.
//
//   1. The EJECTA baseline was first taken from a throwaway probe (box3d 29) while ejectaOf measured 31.
//   2. This gate then counted ITSELF: its control fixture names vendor/box3d/box3d.js.
//   3. main.js counted too -- the round's own ENGINE_VERSION note quotes that path while EXPLAINING the
//      self-counting trap. Naming offenders one at a time is not a fix; stripping comments is, and it is the
//      rule v4262 and v4264 each reached independently. Ten of box3d's 31 raw hits were comments.
//   4. A probe written to confirm the stripped numbers returned 20 instead of 21, because it used `return`
//      where it needed `continue` and silently abandoned a directory.
//
//   And one sabotage result was worthless before it was useful: an early attempt at B reported "0 RED" that
//   was a CRASH whose exit code I never read. That is why every entry above reports exit as well as red.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER EJECTA IS THE RIGHT MASS. This counts files that import a body, which " +
    "says how WIDELY it is reached and nothing about how DEEPLY -- one file importing three at seventy " +
    "places counts once, and a body reached only by a gate counts the same as one reached by the engine. " +
    "Dynamic loads are invisible too: a worker target, a fetch() or a <script src> naming a vendor path is " +
    "not an import specifier and is not counted, which is the same limit world/orrery.mjs's own directory " +
    "exemption documents. And nothing here CHANGES the orrery: massOf and the paper-only state are computed " +
    "and asserted, and orrery.json is still baked from total bytes -- rebaking it is a separate decision " +
    "because every recorded figure that cites a planet's size would move at once.");
process.exit(fails ? 1 : 0);
