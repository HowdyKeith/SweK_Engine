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
import { NOT_IMPORTERS } from "./orreryFleetScan.mjs";

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
    // *** DERIVED, BECAUSE 11 WAS A NUMBER TYPED AGAINST A BAKE THAT HAD BEEN FROZEN SINCE v4189. *** The tree
    // gained vendor/three-webgpu on 2026-09-02 and orrery.json did not, so this read 11 of 14 and was right by
    // accident for forty-five rounds. The statement worth making is not "eleven": it is that every body which
    // is NOT on the paper-only list has code, which is true at any tree size.
    ok("and every OTHER body does have code",
        subs.filter((s) => s.state === E.SUBSTANCE.CODE).length === BODIES.length - E.PAPER_ONLY_BODIES.length,
        `${subs.filter((s) => s.state === E.SUBSTANCE.CODE).length} of ${BODIES.length}, the other ${E.PAPER_ONLY_BODIES.length} being paperwork`);
    // The consequence: mass. A licence file is not weight.
    const grass = BODIES.find((b) => b.name === "grass");
    ok("*** mass counted as code is 0 for a paper-only body, where total bytes said " + grass.bytes + " ***",
        E.massOf(grass) === 0 && grass.bytes > 0);
    // *** THIS NAMED box3d AND box3d STOPPED BEING ALL CODE. *** Backlog #61 was "box3d and htmx are vendored
    // with no licence provenance"; both have since gained a LICENSE, so box3d now carries paperwork and its
    // mass is correctly LESS than its bytes. The example is chosen by measurement now -- the first body with no
    // paper file at all -- so the check states the property rather than a body that happened to have it.
    // *** AND AT v4418 THERE IS NO ALL-CODE BODY LEFT, WHICH IS THE COMMENT ABOVE HAPPENING A SECOND TIME. ***
    // That comment records box3d ceasing to be the example when it gained a LICENSE, and says the example is
    // chosen by measurement now. Measurement returns NOTHING: v4418 delegated isPaperFile's licence half to
    // world/orrery.mjs's isLicenceFile after finding the same file was paperwork to one function and payload to
    // another, and IBMPlexSerif-OFL.txt and ASHIMA-LICENSE.txt came across with it. Every vendored body carries
    // paperwork. So the row states the INVARIANT rather than an example that keeps being spent: mass is bytes
    // minus paper, for every body, and it is checked on all fifteen instead of on whichever one still fits.
    const allCode = BODIES.filter((b) => !(b.files || []).some((f) => E.isPaperFile(f.path)));
    const paperBytes = (b) => (b.files || []).filter((f) => E.isPaperFile(f.path)).reduce((a, f) => a + f.bytes, 0);
    ok("!! *** mass is bytes MINUS paperwork, for every body, not for a chosen example ***",
        BODIES.every((b) => E.massOf(b) === b.bytes - paperBytes(b)),
        BODIES.filter((b) => E.massOf(b) !== b.bytes - paperBytes(b)).map((b) => b.name).join(", ") ||
        `${BODIES.length} bodies reconcile; ${allCode.length} carry no paperwork at all, against 1 before v4418`);
    ok("  ...and #61's two now DO carry paperwork, which is why neither is the example any more",
        ["box3d", "htmx"].every((n) => { const b = BODIES.find((x) => x.name === n);
            return b && (b.files || []).some((f) => E.isPaperFile(f.path)) && E.massOf(b) < b.bytes; }),
        ["box3d", "htmx"].map((n) => { const b = BODIES.find((x) => x.name === n);
            return n + " " + E.massOf(b) + " of " + b.bytes + " bytes is code"; }).join(", "));
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
    // *** v4410: A SECOND COPY OF THE EXCLUSION IS A SECOND CHANCE TO DISAGREE, AND IT TOOK ONE DAY. ***
    // This gate excluded ONE path -- itself -- while tools/ship/orreryFleetScan.mjs kept the real list in
    // NOT_IMPORTERS. v4410 added a second gate full of vendor-path fixtures, put it in NOT_IMPORTERS, and this
    // walker went red naming the arrival because it had never heard of that list. The name-frozen ratchet did
    // its job -- it said WHICH file, not that a number had moved -- and the fix is the list, not another line.
    const SELF = "tools/ship/orreryEjecta-selfcheck.mjs";
    for (let i = files.length - 1; i >= 0; i--) {
        const rel = files[i].path.replace(/\\/g, "/");
        if (rel === SELF || NOT_IMPORTERS.includes(rel)) files.splice(i, 1);
    }
    ok("the sweep reaches the engine's own files, excluding vendor/ AND this gate", files.length > 3000,
        files.length + " files outside vendor/, self excluded");
    ok("  and this gate really would have counted itself -- it names vendor/box3d/ in a control",
        fs.readFileSync(path.join(ROOT, SELF), "utf8").includes("vendor/box3d/"),
        "which is why the exclusion is by path and not by hope");
    // v4410 -- dependantsOf, not ejectaOf, and the record is now a LIST OF NAMES rather than a count, so an
    // arrival and a departure are reported BY NAME instead of as a number that moved.
    const measured = {};
    for (const b of BODIES) measured[b.name] = E.dependantsOf(b.name, files).length;
    for (const [name, want] of Object.entries(E.DEPENDANTS_AT_V4410)) {
        const have = E.dependantsOf(name, files);
        const arrived = have.filter((x) => !want.includes(x)), gone = want.filter((x) => !have.includes(x));
        ok("  " + name.padEnd(13) + " " + String(have.length).padStart(3) + " dependants",
            arrived.length === 0 && gone.length === 0,
            arrived.length || gone.length
                ? (arrived.length ? "ARRIVED: " + arrived.join(", ") + ". " : "") + (gone.length ? "GONE: " + gone.join(", ") : "")
                : "");
    }
    // *** A RATCHET THAT ONLY CHECKS ITS OWN KEYS HAS A HOLE THE SIZE OF THE NEXT DEPENDENCY. *** The loop above
    // iterates the BASELINE, so a body absent from it is not checked -- it is not even mentioned. vendor/
    // three-webgpu arrived on 2026-09-02 with seven importers and this gate stayed green over it, because the
    // baseline had no key to disagree with. The count is now asserted to COVER the tree.
    const unbaselined = BODIES.map((b) => b.name).filter((n) => !(n in E.DEPENDANTS_AT_V4410));
    ok("*** every body in the bake has a baseline entry -- a new dependency cannot arrive unmeasured ***",
        unbaselined.length === 0, unbaselined.join(", ") || `${BODIES.length} bodies, all covered`);
    // The SHAPE is the finding: this discriminates, where the orrery's existing axes do not.
    const vals = Object.values(measured);
    ok("*** the measure discriminates: 0 to " + Math.max(...vals) + " across " + BODIES.length + " bodies ***",
        Math.max(...vals) >= 50 && Math.min(...vals) === 0,
        "three at " + measured.three + ", box3d at " + measured.box3d + ", three bodies at 0");
    // *** v4410 SPLIT THIS ROW IN TWO, BECAUSE THE OLD RULE HAD MADE ONE CLAIM TRUE BY ACCIDENT. ***
    // It asserted that the bodies with zero importers ARE EXACTLY the paper-only bodies, and under the
    // substring rule both sets were {grass, keyhunt, slug} so it passed. Those are two different properties --
    // "holds no code" and "nothing reaches it" -- and the positional rule separates them: grass is reached by
    // tools/ship/grassField-selfcheck and orrery-selfcheck, keyhunt by physics/crypto/secp256k1-selfcheck,
    // through path.join("vendor", name) that no substring search could ever see. ONLY slug is unreached.
    const zeros = Object.entries(measured).filter(([, v]) => v === 0).map(([k]) => k);
    ok("*** every body with NO dependant holds no code -- there is no vendored CODE nothing reaches ***",
        zeros.every((z) => E.PAPER_ONLY_BODIES.includes(z)),
        "zeros: " + (zeros.join(" ") || "none") + ". That is the claim worth keeping, and it survives");
    const reachedPaper = E.PAPER_ONLY_BODIES.filter((b) => measured[b] > 0);
    ok("  ...and a PAPER-ONLY body may still be reached, which is a different fact and is now stated",
        reachedPaper.every((b) => E.DEPENDANTS_AT_V4410[b].length === measured[b]),
        reachedPaper.length ? reachedPaper.map((b) => b + " by " + measured[b] + " (" + E.DEPENDANTS_AT_V4410[b].join(", ") + ")").join("; ") +
            " -- the licence files are checked by gates, and the substring rule could not see a joined path"
            : "no paper-only body is reached");
    report("THE SURVIVING CLAIM: there is no vendored CODE in this tree that nothing reaches. What v4329's " +
        "version of this row ALSO claimed -- that the unreached bodies and the code-free bodies are the same " +
        "set -- was an artefact of a rule that could not see path.join, and it is retired rather than repaired.");
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
    ok("*** 'wasm' is named in " + wasmCites + " files and reached from vendor/wasm by " + wasmImports + " ***",
        wasmCites > 100 && wasmImports <= 6,
        "a substring match on a DIRECTORY NAME cannot tell a dependency from a common noun -- which is the same " +
        "species as v4410's finding one level down, where a match on the PATH could not tell one from a sentence");
    const grassCites = cites("grass");
    ok("  and 'grass' scores " + grassCites + " on grassField and grassModel, while " + E.EJECTA_BASELINE.grass + " file(s) reach vendor/grass",
        grassCites > 20 && E.EJECTA_BASELINE.grass < 5,
        "the ratio is the point, not the zero: v4329 read this as zero because the two gates that DO reach it " +
        "build the path with path.join, and a substring rule sees nothing there");
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
    // *** v4461: THE SECOND COPY OF THIS CHECK, AND IT HAD THE SAME DEFECT AS THE FIRST. ***
    // tools/ship/copiedOutsideVendor-selfcheck.mjs asks the same question and counted directory ENTRIES; a
    // stray EMPTY ai-bridge/vendor/ (untracked -- git cannot track an empty directory, so it exists in a
    // working checkout and in no fresh clone) made both read three. The finding is "vendored CODE sits where
    // the orrery's scanner does not look", and a directory holding nothing holds no code. `vendorDirs` stays
    // an honest census of NAMES -- it is browser-safe and takes its readdir injected -- so the content filter
    // lives here, in the gate, where the fs already is. Both copies print every candidate with its file count,
    // so an empty one is visibly empty rather than silently dropped.
    const allDirs = E.vendorDirs(ROOT, (d) => fs.readdirSync(d, { withFileTypes: true }), path.join);
    const nFiles = (rel) => {
        let n = 0;
        (function w(d) {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                if (e.isDirectory()) w(path.join(d, e.name)); else n++;
            }
        })(path.join(ROOT, rel));
        return n;
    };
    const counts = new Map(allDirs.map((rel) => [rel, nFiles(rel)]));
    const dirs = allDirs.filter((rel) => counts.get(rel) > 0);
    ok("*** there are TWO directories named vendor THAT HOLD ANYTHING, and the orrery's scanner reads one ***",
        dirs.length === 2 && dirs.includes("vendor") && dirs.includes("ui/vendor"),
        allDirs.map((rel) => rel + " (" + counts.get(rel) + " files)").join(" and "));
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
