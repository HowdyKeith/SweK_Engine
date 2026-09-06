#!/usr/bin/env node
// WebGLEngine/tools/ship/playwrightResolve-selfcheck.mjs -- v4484 -- the gate for tools/ship/playwrightResolve.mjs.
//
// Run: node tools/ship/playwrightResolve-selfcheck.mjs
//
// *** THE FILE THIS GRADES EXISTS BECAUSE THREE GATES EACH GREW THEIR OWN GUESS AT WHERE CHROMIUM LIVES. IT
// THEN HELD ONE HARDCODED GUESS OF ITS OWN, ONE LINE BELOW THE LIST IT WAS WRITTEN TO REPLACE. *** So the
// resolution is driven here against SYNTHETIC LAYOUTS -- Linux, Windows, macOS, an unpinned build number --
// because a resolver graded only on the box it was written on is a resolver graded on the one layout it
// already knew.
//
// ---- *** SIX SABOTAGES *** ------------------------------------------------------------------------------------
//
//  A. Pin the build number back to 1194                    -> 3 RED
//  B. Drop every root but /opt/pw-browsers                 -> 3 RED
//  C. Drop the Windows and macOS leaves                    -> 2 RED
//  D. Ignore PLAYWRIGHT_BROWSERS_PATH                      -> 2 RED
//  E. Return the first candidate whether it exists or not  -> 4 RED
//  F. A gate re-spells the path by hand                    -> 1 RED
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** --------------------------------------------------------------------
//
// That a browser is present. It is not, on this box, and that is reported rather than asserted -- a resolver
// is graded on WHERE IT LOOKS, and a machine with nothing installed is the one case where every candidate
// correctly comes back empty.
//
// *** AND IT DOES NOT CLAIM THE RIG WILL NOW RUN THE DEVICE GATES. *** There is a second half, measured and
// deliberately NOT done here: `browserSkipReason` refuses whenever no SEPARATE shell binary is found, even
// when playwright resolved and could launch ITS OWN bundled browser with no executablePath at all. Closing
// that means 96 call sites passing `executablePath: HEADLESS_SHELL || undefined`, which is a sweep across 96
// files whose only test is those files -- v3202's sweep deleted 61 live modules. It is named here as owed.
"use strict";
import { shellRoots, resolveHeadlessShell, SHELL_LEAVES, SHELL_DIR, HEADLESS_SHELL,
         HEADLESS_SHELL_TRIED, PLAYWRIGHT_PATHS, browserSkipReason, askPlaywright,
         resolvePlaywright } from "./playwrightResolve.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("playwrightResolve-selfcheck -- where chromium lives, on a box this file has never seen\n");

// A fake filesystem: a set of paths that exist, and a directory listing derived from it.
const fakeFs = (paths) => {
    const set = new Set(paths.map((p) => path.normalize(p)));
    return {
        exists: (p) => set.has(path.normalize(p)),
        readdir: (d) => {
            const nd = path.normalize(d) + path.sep;
            const out = new Set();
            for (const p of set) if (p.startsWith(nd)) out.add(p.slice(nd.length).split(path.sep)[0]);
            if (!out.size) throw new Error("ENOENT " + d);
            return [...out];
        },
    };
};

// ---- 1. THE THREE PLATFORMS, EACH ON A LAYOUT THIS BOX DOES NOT HAVE ------------------------------------------
console.log("1. a browser found on Linux, on Windows and on macOS");

{
    // *** THE DIRECTORY NAMES ARE BUILT BY CONCATENATION, NOT SPELLED. *** Written as literals they land in
    // section 4's census of files that spell the path by hand -- which is v4409's rule (a fixture is not a
    // gate) arriving through a string, and section 4 caught this file doing it on its first run.
    const SH = "chromium" + "_headless_shell-";
    const cases = [
        ["linux", "/pw", SH + "1194", path.join("chrome-linux", "headless_shell")],
        ["windows", "C:\\Users\\Keith\\AppData\\Local\\ms-playwright", SH + "1208",
            path.join("chrome-win", "headless_shell.exe")],
        ["macos", "/Users/k/Library/Caches/ms-playwright", "chromium" + "-1177",
            path.join("chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium")],
    ];
    for (const [name, root, dir, leaf] of cases) {
        const want = path.join(root, dir, leaf);
        const io = fakeFs([want]);
        const r = resolveHeadlessShell({ env: { PLAYWRIGHT_BROWSERS_PATH: root }, home: "", ...io });
        say(`${name.padEnd(8)} ${r.shell === want ? "found" : "MISSED"}  ${want}`);
        ok(`!! a ${name} install is found`, r.shell === want,
            name === "linux" ? "" :
            "sabotage C: with only the Linux leaves this returns nothing on the box that has the GPU");
    }
    ok("!! ...and the build number is NOT pinned, so a playwright upgrade does not blind 96 gates",
        SHELL_DIR.test("chromium" + "_headless_shell-1208") && SHELL_DIR.test("chromium" + "-9999") &&
        !/1194/.test(String(SHELL_DIR)),
        "sabotage A: 1194 was a DATE STAMP written as a constant -- true when typed, false on the next install");
}

// ---- 2. THE ROOTS, AND THE ENV VAR THE NEIGHBOURING EXPORT ALREADY HONOURED ------------------------------------
console.log("\n2. where it looks, and in what order");

{
    const roots = shellRoots({ PLAYWRIGHT_BROWSERS_PATH: "/custom" }, "/home/k");
    say(roots.join("\n  ----  "));
    ok("!! PLAYWRIGHT_BROWSERS_PATH is tried FIRST", roots[0] === "/custom",
        "sabotage D: headlessGpu.mjs was ALREADY reading this variable for the Vulkan ICD, in the same tree, " +
        "while the line beside it hardcoded a root -- one file honouring an override and its neighbour not");
    ok("...and the sandbox's own root is still there, so this box is unchanged",
        roots.includes("/opt/pw-browsers"));
    ok("!! ...and a Windows and a macOS cache root are both reachable without one",
        roots.some((r) => /ms-playwright/.test(r) && /Local/.test(r)) &&
        roots.some((r) => /Library/.test(r)),
        "sabotage B: a Linux-only root list is why the rig has never run a device gate");
    ok("...and no root is tried twice", new Set(roots).size === roots.length,
        "PLAYWRIGHT_BROWSERS_PATH is often the literal below it");
}

// ---- 3. *** IT MUST NOT RETURN A PATH THAT IS NOT THERE *** ----------------------------------------------------
console.log("\n3. absence, and the difference between 'missing' and 'never looked'");

{
    const empty = resolveHeadlessShell({ env: {}, home: "", exists: () => false, readdir: () => { throw new Error("x"); } });
    ok("!! a box with no browser resolves to \"\", not to a plausible path",
        empty.shell === "" && empty.from === "",
        "sabotage E: returning the first candidate makes existsSync the only thing standing between a gate " +
        "and a launch of a file that is not there");
    const io = fakeFs([path.join("/pw", "chromium" + "_headless_shell-1194", "chrome-linux", "headless_shell")]);
    const partial = resolveHeadlessShell({ env: { PLAYWRIGHT_BROWSERS_PATH: "/pw" }, home: "",
        exists: () => false, readdir: io.readdir });
    ok("...and a browser DIRECTORY with no executable in it resolves to \"\" too",
        partial.shell === "" && partial.tried.length > 0,
        `${partial.tried.length} candidate(s) looked at, none present -- the directory is not the binary`);
    ok("!! the refusal message names WHAT WAS TRIED rather than one path",
        /candidate\(s\) under|no browser directory under/.test(browserSkipReason(null, "", "")),
        "'no headless shell at <one Linux path>' reads as 'that file is missing' on a Windows box, when the " +
        "truth is that the box was never looked at -- two different things to go and fix");
    ok("...and it still names the playwright paths, which is the half that already worked",
        PLAYWRIGHT_PATHS.every((p) => browserSkipReason(null, "", "").includes(p)));
    ok("...and a present shell with no playwright is reported as THAT, not as a missing shell",
        /playwright is not installed/.test(browserSkipReason(null, "", ENG)),
        "the misattribution this file's header says the tree has already paid for twice");
}

// ---- 4. *** THE CENSUS: NO GATE MAY RE-SPELL THE PATH *** ------------------------------------------------------
console.log("\n4. one definition, counted rather than asked for");

{
    const walk = (d, out = []) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (/node_modules|[\\/]vendor[\\/]|[\\/]dist[\\/]/.test(p)) continue;
            if (e.isDirectory()) walk(p, out);
            else if (/\.(mjs|js)$/.test(e.name)) out.push(p);
        }
        return out;
    };
    const NEEDLE = new RegExp("chromium" + "_headless_shell-\\d");
    const HERE = path.resolve(fileURLToPath(import.meta.url));
    const RESOLVER = path.join(ENG, "tools", "ship", "playwrightResolve.mjs");
    const spellers = walk(ENG).filter((p) => p !== HERE && p !== RESOLVER)
        .filter((p) => NEEDLE.test(fs.readFileSync(p, "utf8")))
        .map((p) => path.relative(ENG, p).replace(/\\/g, "/"));
    say(spellers.length ? spellers.join(", ") : "nothing outside the resolver spells the path");
    ok("!! *** NO FILE OUTSIDE THE RESOLVER SPELLS THE BROWSER PATH BY HAND ***",
        spellers.length === 0,
        spellers.length ? "RE-SPELT BY: " + spellers.join(", ")
                        : "sabotage F: this file's own header warned that 'a fourth gate that copies the list " +
                          "instead of importing it is the same defect happening a fourth time' -- and four " +
                          "gates had already done it underneath that sentence, with nothing counting");
    // *** THE NEEDLE IS BUILT BY CONCATENATION, per v4409's rule that a fixture is not a gate: spelled as a
    // literal it would find THIS FILE and the census would be measuring its own text.
    ok("...and the census's own needle cannot match this file, so it is not counting itself",
        !NEEDLE.test(fs.readFileSync(HERE, "utf8")),
        "v4480 found five suspects in the gate that hunted them, for exactly this reason");
    ok("the walk really reaches the tree rather than a corner of it", walk(ENG).length > 3000);
}

// ---- 4b. *** v4486 -- THE AUTHORITY AND THE GUESS NAME DIFFERENT BINARIES *** ------------------------------------
console.log("\n4b. asking playwright, and why it is the fallback rather than the answer");

{
    // An installed playwright KNOWS which browser it will launch, which the layout scan is only guessing at.
    // This round's first draft therefore asked first -- and a measurement refused it: the two name DIFFERENT
    // FILES, the full browser fetches a favicon where the shell does not, and rigidCouple-selfcheck (which
    // asserts the page logs no errors) went green -> red on a 404 the moment the binary changed. Ninety-six
    // gates were calibrated against the shell. So the scan goes first and asking is the fallback.
    const SHELL = path.join("/pw", "chromium" + "_headless_shell-1194", "chrome-linux", "headless_shell");
    const ASKED = "/from/playwright/chrome";
    const io = fakeFs([SHELL, ASKED]);
    const both = resolveHeadlessShell({ env: { PLAYWRIGHT_BROWSERS_PATH: "/pw" }, home: "",
                                        ask: () => ASKED, ...io });
    ok("!! *** THE CALIBRATED SHELL WINS WHERE BOTH ARE PRESENT -- the binary 96 gates were written against ***",
        both.shell === SHELL && both.from === "/pw",
        "sabotage A: asking first swaps what every one of those gates launches, which is not a repair but an " +
        "untested change to all of them at once -- and one gate is measurably red under it");
    const onlyAsk = resolveHeadlessShell({ env: {}, home: "", ask: () => ASKED,
                                           exists: (p) => p === ASKED, readdir: () => { throw new Error("x"); } });
    ok("!! *** ...and where the scan knows no layout, playwright is asked and answers ***",
        onlyAsk.shell === ASKED && onlyAsk.from === "playwright",
        "sabotage D: this is the whole value -- a box with playwright installed the ordinary way and a " +
        "layout nobody here anticipated resolved NOTHING before, and 96 gates counted that skip as a failure");
    ok("...and the ROUTE says which one answered, so asked and guessed cannot be read alike",
        both.from !== "playwright" && onlyAsk.from === "playwright",
        "sabotage B: one route name for both hides which binary a gate actually launched");
    ok("...and a playwright naming a browser that is NOT on disk resolves to nothing rather than to it",
        resolveHeadlessShell({ env: {}, home: "", ask: () => "/gone/chrome",
                               exists: () => false, readdir: () => { throw new Error("x"); } }).shell === "",
        "sabotage C: the authority is authoritative about intent, not about the filesystem");
    ok("!! ...and a playwright with no browser downloaded THROWS, which must not be fatal",
        (() => { try {
            return resolveHeadlessShell({ env: {}, home: "", ask: () => { throw new Error("no browser"); },
                                          exists: () => false, readdir: () => { throw new Error("x"); } }).shell === "";
        } catch { return false; } })(),
        "sabotage E: the catch inside askPlaywright protects askPlaywright; the seam a CALLER injects at is " +
        "a second place, and the first draft left it unguarded");

    ok("!! askPlaywright agrees with what playwright itself reports, or is empty on a box without one",
        (() => { const r = resolvePlaywright();
                 return !r.chromium ? askPlaywright() === "" : askPlaywright() === r.chromium.executablePath(); })(),
        askPlaywright() || "no playwright here");
    ok("!! *** and the two really do name DIFFERENT files here, which is the measurement the order rests on ***",
        !resolvePlaywright().chromium || askPlaywright() !== HEADLESS_SHELL,
        `scan: ${HEADLESS_SHELL}  vs  playwright: ${askPlaywright() || "n/a"} -- if these ever converge the ` +
        "order stops mattering, and this row is how anybody would find out");

    // *** THE CHECK THAT CATCHES A SILENT WRONG ANSWER, AND IT IS NOT THE OBVIOUS ONE. ***
    ok("!! *** the exported constant AGREES with a live resolution -- load time against call time ***",
        HEADLESS_SHELL === resolveHeadlessShell().shell,
        "sabotage F: the resolution ran ABOVE resolvePlaywright for one draft. Function declarations hoist; " +
        "PLAYWRIGHT_PATHS is a `const` in the temporal dead zone, so the call threw, askPlaywright's catch " +
        "swallowed it, and the scan RETURNED A WORKING PATH. *** WHICH OF THE TWO ROWS BELOW CATCHES IT " +
        "DEPENDS ON THE BOX, AND BOTH ARE HERE FOR THAT REASON. *** Where only playwright can answer, the " +
        "TDZ empties the constant and THIS row fires. Where the scan answers too -- this container -- the " +
        "constant is right either way and only the SOURCE-ORDER row below sees it. A live call to " +
        "resolveHeadlessShell catches it on no box at all: by then the module is initialised. Measured, not " +
        "reasoned: relocating the block reds the source-order row here and this one nowhere");
    ok("...and the source really does define the resolution after what it depends on",
        (() => { const src = fs.readFileSync(path.join(ENG, "tools/ship/playwrightResolve.mjs"), "utf8");
                 return src.indexOf("export const PLAYWRIGHT_PATHS") < src.indexOf("const RESOLVED =") &&
                        src.indexOf("export function resolvePlaywright") < src.indexOf("const RESOLVED ="); })(),
        "the position is load-bearing, so it is checked rather than described in a comment");
}

// ---- 4c. *** THE HALF v4484 LEFT OWED, AND WHAT CLOSING IT COSTS *** ---------------------------------------------
console.log("\n4c. the refusal that kept 96 gates from ever running on the rig");

{
    // v4484 named this and did not do it: browserSkipReason refused whenever no SEPARATE shell binary was
    // found, even where playwright resolved and could launch its own. Closing it looked like 96 call sites
    // passing `executablePath: HEADLESS_SHELL || undefined` -- a sweep across 96 files whose only test is
    // those files, which is v3202's shape. IT IS ONE LINE IN THE RESOLVER INSTEAD: ask playwright, and
    // HEADLESS_SHELL is a real path, so every one of those call sites launches unchanged.
    const before = resolveHeadlessShell({ env: {}, home: "", ask: () => "",
                                          exists: () => false, readdir: () => { throw new Error("x"); } });
    ok("!! a box with NO layout the scan knows resolved to nothing before this round",
        before.shell === "",
        "which is every Windows box that installed playwright the ordinary way -- and 96 gates read that " +
        "as 'no headless shell' and counted the skip as a failure");
    // browserSkipReason stats the REAL filesystem, so the fixture names a file that is really there --
    // this gate itself. A fixture path would make the row test the fixture rather than the refusal.
    const REAL = fileURLToPath(import.meta.url);
    const after = resolveHeadlessShell({ env: {}, home: "", ask: () => REAL,
                                         exists: (p) => p === REAL, readdir: () => { throw new Error("x"); } });
    ok("!! *** ...and the SAME box with playwright installed now resolves, with no call site touched ***",
        after.shell === REAL && after.from === "playwright" && browserSkipReason({}, "x", after.shell) === "",
        "the 96 call sites pass HEADLESS_SHELL to executablePath unchanged; what moved is what it holds");
    ok("...and the refusal still fires when there is genuinely nothing, so it did not become a rubber stamp",
        browserSkipReason(null, "", "") !== "" && /playwright/.test(browserSkipReason(null, "", "")));
}

// ---- 5. THIS BOX, REPORTED RATHER THAN ASSERTED ----------------------------------------------------------------
console.log("\n5. what this container actually has");

say(HEADLESS_SHELL ? `resolved: ${HEADLESS_SHELL}` : `no browser here; ${HEADLESS_SHELL_TRIED.length} candidate(s) tried`);
ok("the live resolution agrees with the filesystem, whichever way it went",
    HEADLESS_SHELL === "" || fs.existsSync(HEADLESS_SHELL),
    "the one thing that must hold on ANY box: a non-empty answer is a file that is there");
ok("...and every leaf the resolver knows is a platform-shaped path rather than a bare name",
    SHELL_LEAVES.length >= 6 && SHELL_LEAVES.every((l) => l.includes(path.sep)));

console.log(`\nplaywrightResolve-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
