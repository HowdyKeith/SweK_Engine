// WebGLEngine/tools/ship/oceanSrcRebuild-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~0.2 s)
//
// Run: node tools/ship/oceanSrcRebuild-selfcheck.mjs
//
// THE VENDORED SEA'S MODULAR SOURCES, HELD TO THE VENDORED BUNDLE. vendor/web-ocean/ holds upstream's single-file bundle (ocean.html, pinned by oceanSpikePage-selfcheck) and, since v4895,
// the modular sources it is built from (index.html, build.mjs, js/main.js, js/wgsl/*.js). This gate:
//   1  PINS every one of those files by sha256, with the LICENSE, so a changed byte is red by name;
//   2  REBUILDS ocean.html from the sources by upstream's own readable-bundle rule and requires the result to equal the vendored bundle BYTE FOR BYTE -- the proof that the two forms are the same
//      code, which a pair of hashes alone does not give you;
//   3  holds this gate's copy of that rule to upstream's build.mjs (the two regexes and the module order are read out of the vendored build.mjs, so the rule cannot drift from it quietly);
//   4  states what the sources show about the bundle: `export const P` exists in js/main.js and not in ocean.html (the build strips it), yet the bundle applies every P key from the URL;
//   5  lists every network call the sources make (three, all to its own origin: log() to /__log and the ?shot= screenshot path to /__shot), and that no source names an http(s) address;
//   6  checks that only the patch layer (tools/ship/seaPatch.mjs, its generated seaMain.mjs) and the gates that read the sources name them -- no page loads them.
//
// SABOTAGES, each applied in place, restored, md5 verified; every one red by name (rows red): a line appended to js/main.js 2 | a renamed symbol in build.mjs 1 | a log call pointed off-origin 4 |
// the licence's copyright changed 2 | one byte appended to ocean.html 2 | an engine file importing the sources 1 | main.js no longer exporting P 3.
// (The first run of this gate also FAILED on my own claim: I had written that log() was the only network call, and the gate counted three -- the ?shot= screenshot path POSTs to /__shot twice.)
//
// NOT GRADED, said plainly: that the sea renders (this sandbox has no WebGPU adapter), or that upstream's main still equals these files.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const DIR = path.join(ENG, "vendor", "web-ocean");
const read = (rel) => fs.readFileSync(path.join(DIR, rel));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

const PINS = Object.freeze({
    "index.html": "cedc1bec1b60d3af7acf555fb70fea641bfaef9c524b87124817932a14d90ea1",
    "build.mjs": "c3b6e7099c4ba5ce420fd316de915ba7a7b3328b4f6c4af0808793adf49b50dc",
    "js/main.js": "ceca4404e1514cb8dd94990faf043bd8de2cb0fd201cbc2da803f150e34e3834",
    "js/wgsl/common.js": "d759a8d1c5d52ad93c46b92d274af5dc8afbe7da349cf63c1330a54cd2c13bff",
    "js/wgsl/sim.js": "cb9c6e0e5423ab32c8d9a6da147b6444c133479c7886a0fe25d6de42bd85de99",
    "js/wgsl/sky.js": "23a43cdc394b41e0b1e3610c76139b1bc2e6b7b4ffd3249c68cb08a4b7e9d45f",
    "js/wgsl/ocean.js": "6da8a8bb45b5ca3807013f491981141682a0a371c16a247fb7bcc5a54406a98a",
    "js/wgsl/post.js": "d19d7ad8301a4eb236d8bfec8ad1fd15bf736738c2501ca5695a7c65664df0ef",
    "ocean.html": "61e4fe5edf10253b0552570b574da7206754c2fb6033e2e6d73845daae4b36e8",
    "LICENSE": "b108a76735ab7cc0eab686fc3e85ca668bdb8866977093846d01bac5b6440453",
});

console.log("1. EVERY FILE IS PINNED");
{
    const bad = Object.entries(PINS).filter(([f, h]) => { try { return sha(read(f)) !== h; } catch { return true; } }).map(([f]) => f);
    ok("!! *** every vendored source, the bundle and the licence equal their pinned sha256 ***", bad.length === 0, bad.length ? "CHANGED OR MISSING: " + bad.join(", ") : Object.keys(PINS).length + " files");
    const lic = read("LICENSE").toString("utf8");
    ok("  the licence is MIT and carries upstream's copyright line, which must travel with the sources", /MIT License/i.test(lic) && /Copyright \(c\) 2026 Maksymilian Dendura/.test(lic), "Maksymilian Dendura, 2026");
    const prov = fs.readFileSync(path.join(DIR, "PROVENANCE.txt"), "utf8");
    ok("  and PROVENANCE.txt names every source file it vendored", ["index.html", "build.mjs", "js/main.js", "js/wgsl/common.js", "js/wgsl/sim.js", "js/wgsl/sky.js", "js/wgsl/ocean.js", "js/wgsl/post.js"].every((f) => prov.includes(f)) && /BYTE FOR BYTE/.test(prov.replace(/\s+/g, " ")), "");
}

console.log("\n2. THE SOURCES REBUILD THE BUNDLE BYTE FOR BYTE, BY UPSTREAM'S OWN RULE");
const build = read("build.mjs").toString("utf8");
const ORDER = ["js/wgsl/common.js", "js/wgsl/sim.js", "js/wgsl/sky.js", "js/wgsl/ocean.js", "js/wgsl/post.js", "js/main.js"];
const stripModuleSyntax = (src) => src
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, "")
    .replace(/^export\s+(const|function|async function|let|class)\s/gm, "$1 ");
const SCRIPT_TAG = '<script type="module" src="js/main.js"></script>';
function rebuild(files = ORDER, rule = stripModuleSyntax) {
    let code = "";
    for (const f of files) code += `// ---- ${f} ----\n${rule(read(f).toString("utf8"))}\n`;
    return Buffer.from(read("index.html").toString("utf8").replace(SCRIPT_TAG, () => `<script type="module">\n${code}\n</script>`), "utf8");
}
{
    const out = rebuild(), bundle = read("ocean.html");
    ok("!! *** index.html + the six modules, through upstream's strip-and-concatenate rule, are the vendored ocean.html to the byte ***", out.equals(bundle), `${out.length} bytes rebuilt, ${bundle.length} vendored`);
    ok("  the rebuild is sensitive: another module order, a rule that keeps `export`, or one changed source byte each give a different file", !rebuild([...ORDER].reverse()).equals(bundle) && !rebuild(ORDER, (s) => s.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, "")).equals(bundle) && !Buffer.from(out.toString("utf8").replace("const qs =", "const qz =")).equals(bundle), "3 variants all differ");
}

console.log("\n3. THIS GATE'S RULE IS UPSTREAM'S RULE");
{
    ok("!! *** the module order and both regexes above are read out of the vendored build.mjs, character for character ***",
        build.includes("const wgslModules = ['js/wgsl/common.js', 'js/wgsl/sim.js', 'js/wgsl/sky.js', 'js/wgsl/ocean.js', 'js/wgsl/post.js'];") && build.includes("const order = [...wgslModules, 'js/main.js'];")
        && build.includes(".replace(/^import[\\s\\S]*?from\\s+['\"][^'\"]+['\"];\\s*$/gm, '')") && build.includes(".replace(/^export\\s+(const|function|async function|let|class)\\s/gm, '$1 ');")
        && build.includes("<script type=\"module\" src=\"js/main.js\"></script>"), "wgslModules, order, the import strip, the export strip and the script tag");
}

console.log("\n4. WHAT THE SOURCES SHOW ABOUT THE BUNDLE (THE v4895 CORRECTION, IN THE FILES)");
{
    const main = read("js/main.js").toString("utf8"), bundle = read("ocean.html").toString("utf8");
    ok("!! *** js/main.js EXPORTS its parameter block; the bundle does not (the build strips the `export`) -- which is why P looked unreachable inside the bundle ***", /^export const P = \{/m.test(main) && /^const P = \{/m.test(bundle) && !/^export const P/m.test(bundle), "export const P in the source, const P in the bundle");
    ok("!! *** ...and both apply every P key from the URL in the same generic loop, so the sea is tunable through the query string either way ***", /for \(const k of Object\.keys\(P\)\) if \(qs\.has\(k\)\) P\[k\] = Number\(qs\.get\(k\)\);/.test(main) && /for \(const k of Object\.keys\(P\)\) if \(qs\.has\(k\)\) P\[k\] = Number\(qs\.get\(k\)\);/.test(bundle), "the loop is in both");
    const imports = [...main.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort().join(",");
    ok("  js/main.js imports exactly the five WGSL modules and nothing else", imports === "./wgsl/common.js,./wgsl/ocean.js,./wgsl/post.js,./wgsl/sim.js,./wgsl/sky.js", imports);
}

console.log("\n5. NETWORK CALLS AND ADDRESSES");
{
    const files = ["js/main.js", "js/wgsl/common.js", "js/wgsl/sim.js", "js/wgsl/sky.js", "js/wgsl/ocean.js", "js/wgsl/post.js", "index.html"];
    const calls = files.flatMap((f) => [...read(f).toString("utf8").matchAll(/\bfetch\(\s*([^,)]+)/g)].map((m) => f + ": fetch(" + m[1].trim() + ")"));
    ok("!! *** the sources make exactly three network calls, all POSTs to the page's OWN origin: log() to /__log, and the screenshot path (only when ?shot= is given) to /__shot twice -- PROVENANCE's earlier 'makes no network request' was not true ***",
        calls.length === 3 && calls.filter((c) => /fetch\('\/__log'\)/.test(c)).length === 1 && calls.filter((c) => /fetch\('\/__shot\?name='/.test(c)).length === 2 && calls.every((c) => c.startsWith("js/main.js")), calls.join(" | ") || "none");
    const urls = files.flatMap((f) => [...read(f).toString("utf8").matchAll(/https?:\/\/[^\s'"`)]+/g)].map((m) => f + ": " + m[0]));
    ok("  no source names an http(s) address, so nothing can leave the origin", urls.length === 0, urls.join(" | ") || "none");
}

console.log("\n6. NOTHING IN THE ENGINE IMPORTS THEM YET");
{
    const hits = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.git$|^vendor$/.test(e.name)) walk(p); continue; }
            if (!/\.(mjs|js|html)$/.test(e.name) || e.name === "oceanSrcRebuild-selfcheck.mjs") continue;
            const t = fs.readFileSync(p, "utf8");
            if (/vendor\/web-ocean\/js\//.test(t) || /web-ocean\/index\.html/.test(t)) hits.push(path.relative(ENG, p).split(path.sep).join("/"));
        }
    })(ENG);
    // v4895 step 2: the patch layer (tools/ship/seaPatch.mjs and its generated seaMain.mjs, which imports the wgsl modules by absolute path) and the two gates that READ the sources are
    // the only files that name them; no page loads them, and the opt-in page still loads the single-file bundle
    const ALLOWED = ["tools/ship/orphanSets.mjs", "tools/ship/seaPatch-selfcheck.mjs", "tools/ship/seaPatch.mjs", "ui/oceanLiveTune-selfcheck.mjs", "ui/seaFrame-selfcheck.mjs", "world/ocean/seaMain.mjs", "world/ocean/seaOceanWgsl.mjs"];
    ok("  only the patch layer and the gates that read the sources name the vendored sources: no page loads them, and the opt-in page still loads the single-file bundle", JSON.stringify(hits.sort()) === JSON.stringify(ALLOWED), hits.join(", ") || "0 importers");
}

say("UNCHECKED, said plainly: that the sea renders from the modular form (it is the same code, but this sandbox has no WebGPU); that upstream's main still equals these files; the minified bundle and upstream's server.mjs, which were not taken.");
console.log("oceanSrcRebuild-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
