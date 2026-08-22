// ev/tools/es-page-selfcheck.mjs — does clicking "Fly" actually fly?
//
//   node ev/tools/es-page-selfcheck.mjs
//
// Every check in the ES suite passed while `ev.html` opened to an empty galaxy, because every check hands
// the universe to the code directly. `endless-sky.html` has a button that says "Fly it in Stellar Atlas",
// and until v2186 that button opened a page that had never once tried to load the galaxy the engine ships
// with. You had to know to drag the file onto it.
//
// This is a CONTRACT check, not a boot: `ev.html` has too many canvases and workers to run under a stub,
// and pretending otherwise would be worse than admitting it. What it checks is everything a click depends
// on that a headless process can see -- the file exists, it is the right file, the page reaches for it, and
// the buttons point at pages that are there. bz/tools/bz-page-selfcheck.mjs really does boot its page and
// press W; this one cannot, and says so.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ENGINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));
const read = (f) => fs.readFileSync(path.join(ENGINE, f), "utf8");
const exists = (f) => fs.existsSync(path.join(ENGINE, f));

// --- 1. the galaxy the engine ships with ------------------------------------------------------------
{
    ok("es-universe.json is in the tree", exists("es-universe.json"));
    const uni = JSON.parse(read("es-universe.json"));
    ok("...and it is an Endless Sky universe", uni.source === "endless-sky");
    ok("...with systems to fly between", Array.isArray(uni.systems) && uni.systems.length > 100);
    ok("...ships to fly", Array.isArray(uni.ships) && uni.ships.length > 100);
    ok("...somewhere to start", Array.isArray(uni.starts) && uni.starts.length > 0);
    ok("...a story to be told", uni.conversations && Object.keys(uni.conversations).length > 0);
    ok("...and its own coverage report, baked in", uni.coverage && uni.coverage.pctHandled > 90);
    ok("every start lands the pilot on a planet that exists", uni.starts.every((s) => uni.spobs[s.planet]));
}

// --- 2. the page reaches for it -----------------------------------------------------------------------
{
    const ev = read("ev.html");
    ok("ev.html knows how to load the shipped universe", /function evTryShipped/.test(ev));
    ok("...fetching it by name", /fetch\("\.\/es-universe\.json"/.test(ev));
    // Order matters: a cached drop (a plugin, another game) must win over the shipped default.
    ok("...only after the cache, so a plugin drop is not overwritten", /evTryRestore\(\)\.then\(\(restored\) => \(restored \? true : evTryShipped\(\)\)\)/.test(ev));
    ok("...and a 404 falls back to the drop UI rather than throwing", /catch \(e\) \{ return false; \}/.test(ev));
    ok("the page says where the galaxy came from", /shipped with the engine/.test(ev));

    ok("the launch button exists and enters flight", /\$\("launchBtn"\)\.onclick = \(\) => enterFlight/.test(ev));
    ok("...and enterFlight does not require a universe: an empty galaxy still flies a default ship",
        /if \(!uni \|\| !uni\.ships\.length\) return DEFAULT_SHIP;/.test(ev));
}

// --- 3. the buttons point at pages that are there -------------------------------------------------------
{
    const pages = [["endless-sky.html", "/ev.html"], ["bzflag-info.html", "/bzflag.html"], ["bzflag-info.html", "/bz/maps/arena.bzw"]];
    for (const [page, href] of pages) {
        ok(`${page} links to ${href}`, read(page).includes(`"${href}"`));
        ok(`...and ${href} is in the tree`, exists(href.replace(/^\//, "")));
    }
    // The one thing bzflag.html fetches at boot. A 404 here is a page that draws nothing.
    ok("bzflag.html fetches a map that exists", /fetch\("\.\/bz\/maps\/arena\.bzw"\)/.test(read("bzflag.html")) && exists("bz/maps/arena.bzw"));
    ok("...and every module it imports is in the tree", (() => {
        const src = read("bzflag.html");
        const mods = [...src.matchAll(/from "(\.\/[^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ""));
        return mods.length > 4 && mods.every(exists);
    })());
    ok("ev.html's modules are all in the tree too", (() => {
        const src = read("ev.html");
        const mods = [...src.matchAll(/import\("(\.\/[^"]+)"\)/g)].map((m) => m[1].replace(/^\.\//, ""));
        return mods.length > 4 && mods.every(exists);
    })());
}

console.log("");
console.log("  (a contract check, not a boot: ev.html has canvases and workers a stub cannot honestly fake.");
console.log("   bz/tools/bz-page-selfcheck.mjs really does boot its page and press W.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
