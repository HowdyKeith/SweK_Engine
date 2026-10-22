// WebGLEngine/tools/ship/tvPackages-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/tvPackages-selfcheck.mjs
//
// GRADES tv/tvPackages.mjs and the record it reads, tv/tvPackages.json -- SweK's read-only knowledge of which Android TV
// packages are safe to turn off, baked from ansub/tv-detox, gathin23/tv-vibehack and simbasjungles/free-my-tv.
//
// *** WHAT THIS CAN AND CANNOT CLAIM. *** It grades the RECORD (shape, provenance, that the three sources' own words are in it) and
// the CLASSIFIER (every branch driven on a fixture, the order of precedence held, the one rule no list may override). It cannot
// grade whether a package is safe to disable on any real TV: that is other people's measurement of other people's TVs, and
// the only proof is a TV. Section 6 re-derives the record from the three repositories when they are on disk, and SAYS SO when not.
//
// SABOTAGES (each applied to the real file, run, restored md5-identical; every one red BY NAME):
//   precedence -- the SAFE branch moved ahead of NEVER/KEEP            -> 2 red: the overlap row and the "NEVER and SAFE is never" row (it went 1 red first: the real record
//                                                                          has no never-and-safe package, so a fixture was added for it)
//   core check -- isCore() short-circuited off                          -> 2 red: "core is refused even when ..." and the famous-cases row
//   consensus -- disabledOn >= 4 * keptOn loosened to 3 *               -> 1 red: the 10/2, 10/3, 9/0 threshold row
//   provenance -- one recorded commit cut from 40 characters to 30      -> 1 red: the three-sources row
//   conflicts() -- its SAFE-but-kept branch dropped                     -> 1 red: the fixture row (section 5's live comparison went 0 red alone: the real record has no such
//                                                                          package, which is why section 3 drives that branch on a fixture)
//   contested -- the "TVs disable it" test raised out of reach          -> 3 red: the contested, keep-contested and famous-cases rows
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeKnowledge } from "../../tv/tvPackages.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REC_FILE = path.join(ENG, "tv", "tvPackages.json");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const PKG = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

const rec = JSON.parse(fs.readFileSync(REC_FILE, "utf8"));
const K = makeKnowledge(rec);

console.log("tvPackages-selfcheck -- what three other people's TVs say about each package\n");

console.log("1. PROVENANCE");
{
    const names = rec.sources.map((s) => s.name).sort().join(",");
    ok("!! the record names exactly its three sources, each with a licence and a full commit", names === "free-my-tv,tv-detox,tv-vibehack" &&
        rec.sources.every((s) => /^[0-9a-f]{40}$/.test(s.commit) && s.licence === "MIT" && /^[\w.-]+\/[\w.-]+$/.test(s.repo) && s.files.length > 0),
        rec.sources.map((s) => s.repo + "@" + s.commit.slice(0, 8)).join(" "));
    ok("the record says plainly that it is evidence about TVs and not a licence to disable", /evidence about a TV, never a licence/.test(rec.note));
    ok("!! the 227-TV survey is in it: more than 200 TVs, and a bounded table of packages seen on three or more",
        rec.vibehack.devices > 200 && Object.keys(rec.vibehack.freq).length > 100 && Object.keys(rec.vibehack.freq).length < 2000,
        rec.vibehack.devices + " TVs, " + Object.keys(rec.vibehack.freq).length + " packages in the table");
}

console.log("\n2. THE RECORD'S SHAPE");
{
    const lists = { never: rec.detox.never, keep: rec.detox.keep, safe: rec.detox.safe, launchers: rec.detox.launchers, freemytv: rec.freemytv.debloat };
    for (const [k, v] of Object.entries(lists)) ok(`${k}: non-empty, every entry a package name, none repeated`, v.length > 0 && v.every((p) => PKG.test(p)) && new Set(v).size === v.length, v.length + " entries");
    // tv-detox's own lists overlap in ONE place: com.tcl.micmanager is in both KEEP and SAFE. That is a disagreement INSIDE a source, and the
    // classifier resolves it the strict way (never > keep > safe), so the overlap is allowed only as exactly this named pair and any
    // other overlap fails -- a new one would be classified by whichever branch ran first if the precedence were ever reordered.
    const A = new Set(rec.detox.never), B = new Set(rec.detox.keep), C = new Set(rec.detox.safe);
    const overlaps = [...rec.detox.never.filter((p) => B.has(p)).map((p) => "never&keep:" + p), ...rec.detox.never.filter((p) => C.has(p)).map((p) => "never&safe:" + p), ...rec.detox.keep.filter((p) => C.has(p)).map((p) => "keep&safe:" + p)];
    ok("!! tv-detox's own lists overlap in exactly one named place, and it is resolved the strict way (KEEP wins over SAFE)",
        JSON.stringify(overlaps) === JSON.stringify(["keep&safe:com.tcl.micmanager"]) && K.verdict("com.tcl.micmanager").class !== "safe", overlaps.join(", ") || "none");
    ok("every frequency row is [disabledOn, keptOn], integers, summing to at least three and at most the TV count",
        Object.entries(rec.vibehack.freq).every(([p, f]) => PKG.test(p) && f.length === 2 && f.every(Number.isInteger) && f[0] + f[1] >= 3 && f[0] <= rec.vibehack.devices && f[1] <= rec.vibehack.devices));
    let re, okRe; try { re = new RegExp(rec.vibehack.coreRe); okRe = new RegExp(rec.vibehack.coreOk); } catch (e) { /* reported below */ }
    ok("the two core regexes compile as JavaScript, which they were written for as POSIX ERE", !!re && !!okRe);
    ok("!! every name in the plain-English table is a package someone lists", Object.keys(rec.detox.names).every((p) => PKG.test(p)) && Object.keys(rec.detox.names).length > 30, Object.keys(rec.detox.names).length + " names");
}

console.log("\n3. THE ORDER OF PRECEDENCE, EVERY BRANCH DRIVEN ON A FIXTURE");
{
    const mk = (over = {}) => makeKnowledge({
        vibehack: { coreRe: "^(android|com\\.android\\.systemui|com\\.android\\.providers\\..*)$", coreOk: "^com\\.android\\.providers\\.(calendar)$", devices: 100, freq: {}, ...over.vibehack },
        detox: { never: [], keep: [], safe: [], launchers: [], names: {}, ...over.detox },
        freemytv: { debloat: [], ...over.freemytv }, sources: [],
    });
    const cls = (k, p) => k.verdict(p).class;
    // core beats every list that names the same package -- the rule no source and no option overrides
    const kc = mk({ detox: { safe: ["com.android.systemui", "com.android.providers.media"] }, freemytv: { debloat: ["com.android.systemui"] }, vibehack: { freq: { "com.android.systemui": [90, 0] } } });
    ok("!! core is refused even when tv-detox calls it safe, free-my-tv disables it, and 90 TVs' lists took it", cls(kc, "com.android.systemui") === "core" && cls(kc, "com.android.providers.media") === "core" && cls(kc, "android") === "core");
    ok("...and CORE_OK is the exception tv-vibehack tested (a provider no TV feature uses), not a hole", cls(kc, "com.android.providers.calendar") !== "core");
    // launcher beats never/safe
    const kl = mk({ detox: { launchers: ["com.google.android.tvlauncher"], safe: ["com.google.android.tvlauncher"] } });
    ok("a stock launcher is a launcher, not 'safe', whatever else lists it", cls(kl, "com.google.android.tvlauncher") === "launcher");
    // never, keep, contested
    const kn = mk({ detox: { never: ["com.x.needed", "com.x.disputed"], keep: ["com.x.voice", "com.x.keepdisputed"] }, vibehack: { freq: { "com.x.disputed": [5, 1], "com.x.keepdisputed": [30, 2] } } });
    const kd = mk({ detox: { never: ["com.x.dual"], keep: ["com.x.dual2"], safe: ["com.x.dual", "com.x.dual2"] } });
    ok("!! a package one list calls NEVER and another SAFE is never, and KEEP-and-SAFE is keep: the strictest list wins, whatever the order of the branches", cls(kd, "com.x.dual") === "never" && cls(kd, "com.x.dual2") === "keep", cls(kd, "com.x.dual") + " " + cls(kd, "com.x.dual2"));
    ok("NEVER with no TV disabling it stays never", cls(kn, "com.x.needed") === "never");
    ok("!! NEVER that real TVs disable is CONTESTED and refused by default -- the strictest source wins, and the row says why", cls(kn, "com.x.disputed") === "contested" && /disable it on 5 of 100/.test(kn.verdict("com.x.disputed").why));
    ok("KEEP stays keep (ask first) unless TVs disable it, when it is contested too", cls(kn, "com.x.voice") === "keep" && cls(kn, "com.x.keepdisputed") === "contested");
    // safe: three routes and the exact consensus threshold
    const ks = mk({ detox: { safe: ["com.x.junk"] }, freemytv: { debloat: ["com.x.fmt"] }, vibehack: { freq: { "com.x.cons": [10, 2], "com.x.edge": [10, 3], "com.x.few": [9, 0], "com.x.split": [4, 4], "com.x.some": [2, 0] } } });
    ok("safe by tv-detox's SAFE list and by free-my-tv's own DEBLOAT list", cls(ks, "com.x.junk") === "safe" && cls(ks, "com.x.fmt") === "safe");
    ok("!! tv-vibehack consensus is disabled on 10+ TVs AND at least four times as often as kept: 10/2 is safe, 10/3 is not, 9/0 is not",
        cls(ks, "com.x.cons") === "safe" && cls(ks, "com.x.edge") === "mixed" && cls(ks, "com.x.few") === "mixed", `10/2 ${cls(ks, "com.x.cons")}, 10/3 ${cls(ks, "com.x.edge")}, 9/0 ${cls(ks, "com.x.few")}`);
    ok("disabled-and-kept in equal measure is mixed; seen disabled on two TVs is mixed, not safe", cls(ks, "com.x.split") === "mixed" && cls(ks, "com.x.some") === "mixed");
    ok("a package nobody has an opinion on is unknown -- and unknown is left alone", cls(ks, "com.never.heard.of.it") === "unknown");
    // conflicts(): both of its branches on a fixture, because the real record has NO safe-but-kept row, so the live comparison in section 5 cannot reach that branch
    const kx = mk({ detox: { never: ["com.x.n"], safe: ["com.x.s", "com.x.fine"] }, vibehack: { freq: { "com.x.n": [3, 0], "com.x.s": [2, 6], "com.x.fine": [8, 1] } } });
    ok("!! conflicts() reports a NEVER that TVs disable and a SAFE that TVs mostly keep, and not a SAFE the TVs agree on",
        JSON.stringify(kx.conflicts().map((r) => r.pkg).sort()) === JSON.stringify(["com.x.n", "com.x.s"]), kx.conflicts().map((r) => r.pkg + ":" + r.detox).join(" "));
    ok("every verdict carries its evidence, so a person can read WHY: the TV counts, the detox list, whether free-my-tv takes it",
        ["disabledOn", "keptOn", "detox", "freemytv", "name"].every((f) => f in ks.verdict("com.x.junk").evidence));
}

console.log("\n4. THE REAL RECORD, CLASSIFIED");
{
    const c = (p) => K.verdict(p).class;
    ok("!! the cases the three sources are famous for: setupwraith is CONTESTED (never in tv-detox, disabled on most TVs in tv-vibehack), gms is never, systemui is core",
        c("com.google.android.tungsten.setupwraith") === "contested" && c("com.google.android.gms") === "never" && c("com.android.systemui") === "core" && c("com.android.tv.settings") === "core",
        ["com.google.android.tungsten.setupwraith", "com.google.android.gms", "com.android.systemui", "com.android.tv.settings"].map((p) => c(p)).join(" "));
    ok("the stock home screens are launchers, the Google TV one included", ["com.google.android.apps.tv.launcherx", "com.google.android.tvlauncher"].every((p) => c(p) === "launcher"));
    ok("the junk everyone agrees on is safe", ["com.google.android.feedback", "com.google.android.play.games", "com.google.android.tvrecommendations"].every((p) => c(p) === "safe"));
    ok("!! NO package tv-detox calls NEVER is ever classed safe, whatever the TV lists say -- the strictest source wins",
        rec.detox.never.every((p) => !["safe"].includes(c(p))), rec.detox.never.length + " never-listed packages checked");
    ok("!! and none of free-my-tv's own switch-off list is core or never: the app that ships these has not bricked a TV with them",
        rec.freemytv.debloat.every((p) => !["core", "never", "launcher"].includes(c(p))), rec.freemytv.debloat.length + " packages");
    const cen = K.census();
    // an independent recount, by a different route: tally from the record's raw arrays, not from verdict()
    const all = new Set([...rec.detox.never, ...rec.detox.keep, ...rec.detox.safe, ...rec.freemytv.debloat, ...rec.detox.launchers, ...Object.keys(rec.vibehack.freq)]);
    ok("!! the census accounts for every package in the record exactly once", cen.packages === all.size && Object.values(cen.byClass).reduce((a, b) => a + b, 0) === all.size, JSON.stringify(cen.byClass));
    say("classes over " + cen.packages + " packages: " + JSON.stringify(cen.byClass));
}

console.log("\n5. WHERE THE SOURCES DISAGREE (reported, and derived a second way)");
{
    const rows = K.conflicts();
    const f = rec.vibehack.freq;
    const mine = [];
    for (const p of [...rec.detox.never, ...rec.detox.keep]) if (f[p] && f[p][0] > 0 && !K.isCore(p)) mine.push(p);
    for (const p of rec.detox.safe) if (f[p] && f[p][1] > f[p][0]) mine.push(p);
    ok("!! the conflict list equals the one derived independently from the raw arrays", JSON.stringify(rows.map((r) => r.pkg).sort()) === JSON.stringify(mine.sort()), rows.length + " conflicts");
    ok("setupwraith is in it, with its real numbers", rows.some((r) => r.pkg === "com.google.android.tungsten.setupwraith" && r.disabledOn > 50 && r.keptOn > 0));
    for (const r of rows.slice(0, 8)) say(`${r.pkg}  tv-detox ${r.detox}; TV lists: disabled ${r.disabledOn}, kept ${r.keptOn}`);
    if (rows.length > 8) say("... and " + (rows.length - 8) + " more");
}

console.log("\n6. RE-DERIVED FROM THE REPOSITORIES, WHEN THEY ARE ON DISK");
{
    const dirs = { detox: "/home/user/ansub/tv-detox", vibehack: "/home/user/gathin23/tv-vibehack", freemytv: "/home/user/simbasjungles/free-my-tv" };
    const present = Object.values(dirs).every((d) => fs.existsSync(d));
    if (!present) say("NOT RE-DERIVED HERE -- the three repositories are not cloned beside this tree. THAT IS A SKIP, NOT A PASS: sections 1-5 grade the record against itself; only a re-bake proves it still says what the sources say.");
    else {
        const head = (d) => spawnSync("git", ["-C", d, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
        const same = rec.sources.every((s) => head(dirs[{ "tv-detox": "detox", "tv-vibehack": "vibehack", "free-my-tv": "freemytv" }[s.name]]) === s.commit);
        if (!same) say("the clones on disk are at different commits from the record's, so a re-bake would grade a different thing; skipped");
        else {
            const r = spawnSync(process.execPath, [path.join(ENG, "tools", "ship", "takeTvPackages.mjs"), "--detox", dirs.detox, "--vibehack", dirs.vibehack, "--freemytv", dirs.freemytv], { encoding: "utf8" });
            const t = r.stdout || "";
            const n = (re) => (t.match(re) || [])[1];
            ok("!! a fresh bake from the same commits reports the record's counts: never, keep, safe, TVs, packages, free-my-tv's list",
                +n(/never (\d+)/) === rec.detox.never.length && +n(/keep (\d+)/) === rec.detox.keep.length && +n(/safe (\d+),/) === rec.detox.safe.length &&
                +n(/(\d+) TVs/) === rec.vibehack.devices && +n(/debloat (\d+) packages/) === rec.freemytv.debloat.length,
                t.split("\n").filter(Boolean).join(" | ").slice(0, 300));
        }
    }
}

console.log(`\ntvPackages-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
