// WebGLEngine/tools/ship/takeTvPackages.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/takeTvPackages.mjs --detox <dir> --vibehack <dir> --freemytv <dir> [--write]
//
// THE COMMAND THAT BAKES tv/tvPackages.json FROM THE THREE TV REPOS. NO EXPORTS ON PURPOSE: the library that reads
// the baked record is tv/tvPackages.mjs, named after its gate (tools/ship/tvPackages-selfcheck.mjs); this file is
// the export-free command that fills it, the way takeSeaPatch.mjs fills seaPatch.mjs.
//
// WHAT IT READS (all MIT, none of it vendored -- only the facts that matter are kept, with the commit each came from):
//   ansub/tv-detox                candidates.sh   the NEVER / KEEP / SAFE package lists and the plain-English names table
//   gathin23/tv-vibehack          tools/disable.sh   CORE_RE / CORE_OK, the refusal rule no switch overrides
//                                 examples/*/debloat.txt   227 real TVs: per package, on how many a list DISABLES it and on
//                                 how many it is left commented out (a package kept on some TVs and disabled on others is
//                                 exactly the disagreement a debloater has to know about)
//   simbasjungles/free-my-tv      app/src/io/freemytv/HomeMode.java   the DEBLOAT array the app switches off by itself
//
// Without --write it prints what it found and touches nothing. The three directories are shallow clones; the commit is read
// from each with `git rev-parse`, so the record says which bytes the lists came from.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseOrExit } from "./cliArgs.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = parseOrExit("takeTvPackages", {
    values: { "--detox": "path", "--vibehack": "path", "--freemytv": "path" },
    flags: ["--write"],
});
const need = (k) => { const v = cli.values[k]; if (!v) { console.error("takeTvPackages: " + k + " <dir> is required"); process.exit(2); } return path.resolve(v); };
const DETOX = need("--detox"), VIBE = need("--vibehack"), FMT = need("--freemytv");
const read = (...p) => fs.readFileSync(path.join(...p), "utf8").replace(/\r/g, "");
const head = (dir) => execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const PKG = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

// ---- tv-detox: three shell variables, each a double-quoted whitespace list --------------------------------------
const detoxSh = read(DETOX, "candidates.sh");
const shList = (name) => {
    const m = detoxSh.match(new RegExp("^" + name + '="([^"]*)"', "m"));
    if (!m) throw new Error("tv-detox candidates.sh has no " + name + " list -- the file changed shape, re-read it");
    return m[1].split(/\s+/).filter(Boolean);
};
const names = {};
const nm = detoxSh.match(/<<'EOF'\n([\s\S]*?)\nEOF/);
if (nm) for (const l of nm[1].split("\n")) { const [p, ...n] = l.split("\t"); if (PKG.test(p) && n.length) names[p] = n.join("\t"); }
const detox = { never: shList("NEVER"), keep: shList("KEEP"), safe: shList("SAFE"), names };
const launchers = (read(DETOX, "install.sh").match(/^LAUNCHERS="([^"]*)"/m) || [, ""])[1].split(/\s+/).filter(Boolean);

// ---- tv-vibehack: the two regexes, then the 227 lists -----------------------------------------------------------
const dis = read(VIBE, "tools", "disable.sh");
const rx = (name) => { const m = dis.match(new RegExp("^" + name + "='([^']*)'", "m")); if (!m) throw new Error("tv-vibehack tools/disable.sh has no " + name); return m[1]; };
const coreRe = rx("CORE_RE"), coreOk = rx("CORE_OK");
const freq = {};
let devices = 0;
for (const d of fs.readdirSync(path.join(VIBE, "examples"), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const f = path.join(VIBE, "examples", d.name, "debloat.txt");
    if (!fs.existsSync(f)) continue;
    devices++;
    const seen = new Set();
    for (const raw of read(f).split("\n")) {
        const s = raw.replace(/^﻿/, "").trim();
        if (!s) continue;
        const commented = s.startsWith("#");
        const tok = (commented ? s.replace(/^#+\s*/, "") : s).split(/\s+/)[0];
        if (!PKG.test(tok)) continue;
        const k = tok + (commented ? "#" : "+");
        if (seen.has(k)) continue;          // a package counts once per TV per side
        seen.add(k);
        (freq[tok] = freq[tok] || [0, 0])[commented ? 1 : 0]++;
    }
}
// keep the table bounded: a package seen on fewer than three TVs says little (the tail is each brand's own one-offs)
const vibeFreq = Object.fromEntries(Object.entries(freq).filter(([, [a, b]]) => a + b >= 3).sort((x, y) => (y[1][0] + y[1][1]) - (x[1][0] + x[1][1]) || (x[0] < y[0] ? -1 : 1)));

// ---- free-my-tv: the DEBLOAT array's quoted strings, comments stripped first ------------------------------------
const hm = read(FMT, "app", "src", "io", "freemytv", "HomeMode.java");
const a = hm.indexOf("static final String[] DEBLOAT");
const b = hm.indexOf("};", a);
const fmt = [...new Set(hm.slice(a, b).split("\n").map((l) => l.replace(/\/\/.*$/, "")).join(" ").match(/"[^"]+"/g).map((s) => s.slice(1, -1)).filter((s) => PKG.test(s)))];

const out = {
    note: "BAKED by tools/ship/takeTvPackages.mjs from three MIT repositories; the library is tv/tvPackages.mjs, graded by tools/ship/tvPackages-selfcheck.mjs. These are other people's measurements of other people's TVs: a package here is evidence about a TV, never a licence to disable it.",
    sources: [
        { name: "tv-detox", repo: "ansub/tv-detox", licence: "MIT", commit: head(DETOX), files: ["candidates.sh", "install.sh"] },
        { name: "tv-vibehack", repo: "gathin23/tv-vibehack", licence: "MIT", commit: head(VIBE), files: ["tools/disable.sh", "examples/*/debloat.txt"] },
        { name: "free-my-tv", repo: "simbasjungles/free-my-tv", licence: "MIT", commit: head(FMT), files: ["app/src/io/freemytv/HomeMode.java"] },
    ],
    detox: { ...detox, launchers },
    vibehack: { coreRe, coreOk, devices, freq: vibeFreq },
    freemytv: { debloat: fmt },
};
console.log("[takeTvPackages] tv-detox: never " + detox.never.length + ", keep " + detox.keep.length + ", safe " + detox.safe.length + ", names " + Object.keys(names).length + ", launchers " + launchers.length);
console.log("[takeTvPackages] tv-vibehack: " + devices + " TVs, " + Object.keys(freq).length + " distinct packages, " + Object.keys(vibeFreq).length + " seen on 3+ TVs; coreRe " + coreRe.length + " chars");
console.log("[takeTvPackages] free-my-tv: debloat " + fmt.length + " packages");
if (cli.flags.has("--write")) {
    const dst = path.join(ENG, "tv", "tvPackages.json");
    fs.writeFileSync(dst, JSON.stringify(out, null, 1) + "\n");
    console.log("[takeTvPackages] wrote tv/tvPackages.json (" + fs.statSync(dst).size + " bytes)");
}
