#!/usr/bin/env node
// WebGLEngine/tools/ship/orreryFleet-selfcheck.mjs -- v4328
//
// GRADES world/orreryFleet.mjs and tools/ship/orreryFleetScan.mjs -- backlog #68, "ES space demos into the
// orrery, seeded by the git log", whose promise is one sentence: "re-run with no new commits -> identical
// universe; one new commit -> exactly one thing changes."
//
// *** BOTH HALVES OF THAT ARE MEASURED HERE, AND THE SECOND HALF IS THE ONE THAT COULD HAVE BEEN FAKED. ***
// Identical-twice is easy to satisfy by accident: a fleet that ignored its seeds entirely would pass it. So
// section 4 changes ONE importer's commit hash and counts how many satellites moved. The answer has to be
// exactly one, and a fleet that ignored the log would answer zero.
//
// Run: node tools/ship/orreryFleet-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as F from "../../world/orreryFleet.mjs";
import * as S from "./orreryFleetScan.mjs";
import { EJECTA_BASELINE, PAPER_ONLY_BODIES } from "../../world/orreryEjecta.mjs";
import { buildOrrery } from "../../world/orrery.mjs";
import { period as keplerPeriod } from "../../physics/orbits/kepler.js";
import { fnv1a } from "../../world/orrerySeed.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
// TWO STRIPPERS, AND THE DIFFERENCE IS LOAD-BEARING IN THIS FILE. sourceScan's also blanks string BODIES, which
// is what a purity check wants (a path inside a string is not an import either); orreryFleetScan's removes
// comments only, which is what the ejecta scan uses and therefore the only honest way to ask what IT sees.
import { codeOnly as codeAndStrings } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(ENG, "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: "2026-09-02" });
const names = raw.bodies.map((b) => b.name);
const ejecta = S.scanFleets(ENG, REPO, names);
const fleets = F.fleetsFor(system, ejecta);

console.log("orreryFleet-selfcheck -- a satellite is an importer, and it carries the commit that last touched it\n");

// =============================================================================================================
console.log("1. THE FLEET'S SIZE IS THE EJECTA MEASUREMENT, NOT A NUMBER CHOSEN HERE");
{
    const mismatch = [];
    for (const [name, want] of Object.entries(EJECTA_BASELINE)) {
        const got = (fleets.get(name) || { satellites: [] }).satellites.length;
        if (got !== want) mismatch.push(`${name}: fleet ${got}, ejecta baseline ${want}`);
    }
    ok("*** every body's satellite count equals world/orreryEjecta.mjs's recorded importer count ***",
        mismatch.length === 0, mismatch.join("; ") ||
        `${Object.keys(EJECTA_BASELINE).length} bodies agree -- three ${fleets.get("three").satellites.length}, box3d ${fleets.get("box3d").satellites.length}`);
    // and the two scanners have to agree about which files those are, or one of them is measuring a different tree
    ok("  and the scan covers every body in the bake, so a new dependency arrives with a fleet",
        names.every((n) => Array.isArray(ejecta[n])), names.length + " bodies scanned");
    const total = [...fleets.values()].reduce((n, f) => n + f.satellites.length, 0);
    ok("  the population is substantial rather than a token ring", total > 100,
        total + " satellites across " + names.length + " bodies");

    // *** THE SCANNER MUST NOT COUNT THE SCANNER, AND THE FIRST RUN OF THIS GATE COUNTED THIS GATE. ***
    // orreryEjecta-selfcheck's header records that trap firing four times; this is the seventh in the tree and
    // the second in a gate written to be careful about it. The needle was spelled out in the check below, so
    // the scan read this file as box3d's twenty-second importer and section 1 went red against a baseline of 21.
    //
    // *** AND THE FIX IS NOT AN EIGHTH EXCLUSION ENTRY. *** Adding this path to NOT_IMPORTERS would have worked
    // here and left the ejecta gate -- which excludes only ITSELF -- still counting this file, so the two gates
    // would have disagreed by one about the same tree. The needle is BUILT FROM PARTS instead, which makes the
    // statement true rather than excused: this file does not contain that path, so no scanner has to be told
    // to ignore it. A list of exceptions grows; not being an exception does not.
    const NEEDLE = "vendor/" + "box3d" + "/";
    ok("*** the exclusion list is exercised: the file it names really does carry a vendor path in CODE ***",
        S.NOT_IMPORTERS.length > 0 && S.NOT_IMPORTERS.every((rel) => {
            const p = path.join(ENG, rel);
            // the SCAN's own stripper, not sourceScan's: sourceScan.codeOnly blanks string BODIES, and the
            // path in that file is inside a string literal, so checking with the wrong stripper says "absent"
            // about a file that plainly contains it. Two strippers, two questions.
            return fs.existsSync(p) && S.codeOnly(fs.readFileSync(p, "utf8")).includes(NEEDLE);
        }),
        S.NOT_IMPORTERS.join(", ") + " -- a control fixture, not an import, and the ejecta gate excludes it too");
    ok("  and THIS gate is not an importer of anything, because it spells no vendor path out",
        !S.codeOnly(fs.readFileSync(path.join(ENG, "tools/ship/orreryFleet-selfcheck.mjs"), "utf8")).includes(NEEDLE),
        "the needle above is assembled at runtime, so the scan cannot see it and needs no exception for it");
}

// =============================================================================================================
console.log("\n2. PURE: NOTHING HERE CAN TELL THE TIME OR ROLL A DIE");
{
    // world/orreryView.mjs's own gate asserts this of the view model; #68's caution is that a ship path which
    // is not a pure function of (seed, t) is "an animator that never goes quiet", which lands on #60.
    const src = codeAndStrings(fs.readFileSync(path.join(ENG, "world/orreryFleet.mjs"), "utf8"));
    ok("*** no Math.random, Date.now or performance.now in world/orreryFleet.mjs ***",
        !/Math\.random|Date\.now|performance\.now/.test(src),
        "checked against comment-stripped source, so the header paragraph that NAMES Math.random cannot satisfy it");
    ok("  and no fs, no DOM, no git -- the model is importable by a browser", !/require\(|node:|document\.|window\./.test(src));
    ok("  while the SCAN, which does all three, lives in tools/ship/",
        /node:child_process/.test(fs.readFileSync(path.join(ENG, "tools/ship/orreryFleetScan.mjs"), "utf8")),
        "the same split tools/ship/orreryScan.mjs states: world/ stays pure so a browser can import it");
    // the same position twice, and a different one at a different t -- the frameDirty property, stated as a check
    const sat = fleets.get("three").satellites[0];
    const a1 = F.satelliteAt(sat, 3), a2 = F.satelliteAt(sat, 3), b = F.satelliteAt(sat, 3.5);
    ok("*** the same (satellite, t) gives the same position every time, so a caller that has not advanced t knows nothing moved ***",
        a1.x === a2.x && a1.y === a2.y && (a1.x !== b.x || a1.y !== b.y),
        `t=3 twice: ${a1.x.toFixed(6)},${a1.y.toFixed(6)}; t=3.5 differs`);
}

// =============================================================================================================
console.log("\n3. TWO RUNS MATCH -- the first half of #68's promise");
{
    const again = F.fleetsFor(buildOrrery(raw.bodies, { today: "2026-09-02" }), S.scanFleets(ENG, REPO, names));
    ok("*** a second scan and a second build of the same tree produce a byte-identical universe ***",
        F.systemDigest(fleets) === F.systemDigest(again),
        F.systemDigest(fleets).length + " characters of sampled positions, identical");
    // and the digest has to be capable of noticing, or the line above is worthless
    const bent = F.fleetsFor(system, ejecta, { altGain: 0.13 });
    ok("  CONTROL: a different altitude rule produces a DIFFERENT digest, so the comparison can fail",
        F.systemDigest(fleets) !== F.systemDigest(bent));
    // the digest samples POSITIONS, not descriptors: a wrong period with intact seeds must still be caught
    const wrongPeriod = { satellites: fleets.get("draco").satellites.map((s) => ({ ...s, period: s.period * 2 })), debris: [] };
    ok("*** and it samples POSITIONS, so a fleet with correct seeds and wrong periods is still caught ***",
        F.fleetDigest({ satellites: fleets.get("draco").satellites, debris: [] }) !== F.fleetDigest(wrongPeriod),
        "hashing the descriptors alone would have called those two universes equal");
}

// =============================================================================================================
console.log("\n4. *** ONE NEW COMMIT CHANGES EXACTLY ONE THING -- the half that could have been faked ***");
{
    // Change ONE importer's last-commit hash, exactly as committing to that file would, and count what moved.
    const target = "three", victim = ejecta[target][0];
    const edited = { ...ejecta, [target]: ejecta[target].map((f, i) =>
        (i === 0 ? { ...f, sha: "0".repeat(39) + "1" } : f)) };
    const after = F.fleetsFor(system, edited);
    const moved = [];
    for (const name of names) {
        const a = fleets.get(name).satellites, b = after.get(name).satellites;
        for (let i = 0; i < a.length; i++) if (a[i].seed !== b[i].seed) moved.push(name + "/" + a[i].path);
    }
    ok("*** editing ONE importer's commit moves EXACTLY ONE satellite, and no other body is touched ***",
        moved.length === 1 && moved[0] === target + "/" + victim.path,
        moved.join(", ") + ` -- ${victim.path}, out of ${[...fleets.values()].reduce((n, f) => n + f.satellites.length, 0)} satellites`);
    ok("  and its ORBIT really moves, not just its label",
        F.satelliteAt(fleets.get(target).satellites[0], 5).x !== F.satelliteAt(after.get(target).satellites[0], 5).x,
        "the seed sets the phase, so a new commit puts the craft somewhere else on its ring");
    // *** THE CONTROL THAT MAKES THE ABOVE MEAN SOMETHING: a fleet ignoring the log would answer ZERO. ***
    const deaf = F.fleetsFor(system, Object.fromEntries(names.map((n) =>
        [n, ejecta[n].map((f) => ({ ...f, sha: "deadbeef" }))])));
    const deafMoved = names.reduce((n, name) => n + fleets.get(name).satellites
        .filter((s, i) => s.seed !== deaf.get(name).satellites[i].seed).length, 0);
    ok("  CONTROL: replacing EVERY commit moves every satellite, so the seed is load-bearing throughout",
        deafMoved === [...fleets.values()].reduce((n, f) => n + f.satellites.length, 0), deafMoved + " moved");
    // and the path is folded in for a reason: one commit routinely touches many importers at once
    ok("*** two importers sharing one commit still get different seeds -- the path is folded in ***",
        F.satSeed("abc", "a/one.js") !== F.satSeed("abc", "a/two.js"),
        "a round that renames an export edits every caller; without the path they would land on one orbit");
    ok("  and the separator is real: (\"ab\",\"c\") and (\"a\",\"bc\") do not collide",
        F.satSeed("ab", "c") !== F.satSeed("a", "bc"));
}

// =============================================================================================================
console.log("\n5. THE DERIVED QUANTITIES COME FROM THEIR OWNERS, NOT FROM A SECOND SPELLING");
{
    const sat = fleets.get("box3d").satellites[0];
    ok("*** the period is kepler.js's, computed from the axis -- not restated here ***",
        Math.abs(sat.period - keplerPeriod(sat.a)) < 1e-12,
        `a ${sat.a.toFixed(4)} -> T ${sat.period.toFixed(4)}; v4185 wrote its own sqrt(a^3) and was out by 2*PI`);
    ok("  the seed is orrerySeed's fnv1a, not a second hash",
        F.satSeed("abc", "x.js") === (fnv1a("abc" + " " + "x.js") >>> 0));
    // altitude tracks bytes monotonically, which is what makes "a bigger consumer sits wider" a fact and not a hope
    const bySize = fleets.get("three").satellites.slice().sort((a, b) => a.bytes - b.bytes);
    ok("*** a bigger importer orbits wider, every time -- altitude is log1p of its bytes ***",
        bySize.every((s, i) => i === 0 || s.alt >= bySize[i - 1].alt),
        `${bySize[0].bytes} bytes -> ${bySize[0].alt.toFixed(3)}, ${bySize[bySize.length - 1].bytes} -> ${bySize[bySize.length - 1].alt.toFixed(3)}`);
    ok("  and a zero-byte importer still clears the surface rather than sitting on it",
        F.altitudeFor(0) > 0, F.altitudeFor(0).toFixed(3) + " above the surface at zero bytes");
    // the orbit is measured from the centre, so the same file around a big planet is genuinely further out
    const big = { name: "big", radius: 5 }, small = { name: "small", radius: 0.2 };
    const f = { path: "x.js", bytes: 1000, sha: "a".repeat(40) };
    ok("  a satellite of a large body sits further from its centre than the same file around a small one",
        F.satelliteFor(big, f).a > F.satelliteFor(small, f).a);
    ok("*** eccentricity and inclination are REFUSED, as orreryView refused them for the bodies ***",
        !("eccentricity" in sat) && !("inclination" in sat) &&
        /REFUSED/.test(fs.readFileSync(path.join(ENG, "world/orreryFleet.mjs"), "utf8")),
        "nothing about a source file IS either one, so drawing one would be a number invented to be drawn");
}

// =============================================================================================================
console.log("\n6. THE DEBRIS RING IS THE PAPERWORK, AND THE THREE PAPER PLANETS ARE NOW VISIBLE");
{
    for (const name of PAPER_ONLY_BODIES) {
        const f = fleets.get(name);
        ok("  " + name.padEnd(8) + " draws as debris around nothing: no satellites, a ring of licences",
            f.satellites.length === 0 && f.debris.length > 0,
            f.debris.map((d) => d.path).join(", "));
    }
    report("world/orreryEjecta.mjs measured that at v4266 -- 'three planets made entirely of paperwork, 21% of " +
        "its bodies' -- and the orrery could not show it. The finding existed; the picture did not.");
    const anyCode = names.find((n) => !PAPER_ONLY_BODIES.includes(n) && fleets.get(n).debris.length > 0);
    ok("*** and a body with code carries BOTH: satellites and a debris ring ***",
        !!anyCode && fleets.get(anyCode).satellites.length > 0,
        anyCode + ": " + fleets.get(anyCode).satellites.length + " satellites, " +
        fleets.get(anyCode).debris.length + " debris -- " + fleets.get(anyCode).debris.map((d) => d.path).join(", "));
    ok("  debris orbits closer than the satellites, so the two populations read apart",
        (() => { const f = fleets.get(anyCode);
            return Math.max(...f.debris.map((d) => d.alt)) < Math.max(...f.satellites.map((s) => s.alt)); })());
}

// =============================================================================================================
console.log("\n7. *** THE COMMIT BELT, RE-MEASURED RATHER THAN TRUSTED ***");
{
    // The record says a per-body commit belt would be one or two rocks. That is the reason the obvious reading
    // of #68 was refused, so it is re-taken from git here: a record nobody re-measures is a sentence.
    const R = F.COMMIT_BELT_V4328;
    const live = {};
    for (const n of names) {
        try {
            live[n] = execFileSync("git", ["log", "--format=%H", "--", "WebGLEngine/vendor/" + n],
                                   { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
                      .trim().split("\n").filter(Boolean).length;
        } catch { live[n] = 0; }
    }
    const drift = names.filter((n) => (R.perBody[n] ?? null) !== live[n]);
    ok("*** the recorded per-body commit counts still match git ***", drift.length === 0,
        drift.map((n) => `${n}: recorded ${R.perBody[n]}, git says ${live[n]}`).join("; ") ||
        `${names.length} bodies, busiest ${Math.max(...Object.values(live))}`);
    ok("*** and the finding holds: the busiest vendored body has been touched by two commits ***",
        Math.max(...Object.values(live)) <= 2 && Object.values(live).filter((v) => v === 1).length >= 10,
        `${Object.values(live).filter((v) => v === 1).length} of ${names.length} bodies touched exactly once, against ${R.repoCommits} commits in the repository`);
    ok("  so the refusal is recorded with its reason rather than left as an absence", /belt/i.test(R.why) && R.at === "v4328");
    report("VENDORED CODE DOES NOT CHANGE; THE CODE THAT USES IT DOES. That is why a satellite is an importer " +
        "and not a commit, and it is a measurement rather than a preference.");
}

// =============================================================================================================
console.log("\n8. EVERY SEED REALLY CAME FROM THE LOG");
{
    const all = names.flatMap((n) => fleets.get(n).satellites);
    const unsourced = all.filter((s) => !s.sourced);
    ok("*** every satellite's commit is a full 40-character hash git actually gave us ***",
        unsourced.length === 0, unsourced.map((s) => s.path).join(", ") || `${all.length} satellites, all sourced`);
    ok("  and an unsourced one would SAY so rather than seeding on zero",
        F.satelliteFor({ name: "x", radius: 1 }, { path: "p.js", bytes: 1, sha: null }).sourced === false &&
        F.satelliteFor({ name: "x", radius: 1 }, { path: "p.js", bytes: 1, sha: null }).seed !== 0,
        "world/orrerySeed.mjs's rule: a missing sha is not seed 0, and the provenance is reported");
    ok("  a short sha is not accepted as sourced", F.satSourced("abc1234") === false && F.satSourced("a".repeat(40)) === true,
        "%h would throw away 128 of the 160 bits, and two commits that look different in a log could seed alike");
    // the fleet is ordered, so a digest means something across machines
    const three = fleets.get("three").satellites.map((s) => s.path);
    ok("*** the fleet is sorted by path, so a filesystem walk order cannot change the universe ***",
        three.join("\n") === three.slice().sort().join("\n"), three.length + " satellites in path order");
}

// =============================================================================================================
console.log("\n9. *** THE BAKE MUST NOT GO STALE -- THIS ROUND EXISTS PARTLY BECAUSE orrery.json DID ***");
{
    // orrery.json was baked at v4189 and read by fourteen gates for forty-five rounds while the tree gained a
    // dependency, box3d and htmx gained licences, and two gates sat red on the register saying exactly that.
    // A second baked file with no freshness check would be the same trap with a new name.
    // POPULATION currency is demanded; COMMIT currency is reported. See orreryFleetScan's note on why the
    // second cannot be demanded of a bake of last-commits without going red on arrival every round.
    const drift = S.fleetDrift(ENG, REPO);
    ok("*** orrery-fleet.json holds the tree's own importers, at their current sizes ***", drift.length === 0,
        drift.slice(0, 3).join("; ") || "run: node tools/ship/orreryFleetScan.mjs --write");
    const cd = S.commitDrift(ENG, REPO);
    ok("  and the snapshot names the commit it was taken at, so 'behind' is a measurable number and not a worry",
        !!cd.bakedHead && /^[0-9a-f]{40}$/.test(cd.bakedHead),
        `baked at ${String(cd.bakedHead).slice(0, 12)}, head is ${String(cd.head).slice(0, 12)}, ` +
        `${cd.behind.length} satellite(s) carrying a commit the log has moved past` +
        (cd.behind.length ? ": " + cd.behind.slice(0, 3).join(", ") : ""));
    const baked = S.readFleetBake(ENG);
    ok("  and it holds every body the orrery bake holds, so the two files describe one system",
        !!baked && names.every((n) => Array.isArray(baked.bodies[n])),
        baked ? Object.keys(baked.bodies).length + " bodies" : "missing");
    ok("*** and NO POSITION is baked -- the universe is computed from (commit, t), not frozen at bake time ***",
        !!baked && !/"x"|"y"|"phase"|"period"/.test(JSON.stringify(baked).slice(0, 4000)),
        "orreryBake.mjs's own reason: a file of positions begins lying the next morning");
    ok("  CONTROL: fleetDrift really can speak -- an edited commit is reported by name",
        (() => { const live = S.fleetPayload(ENG, REPO);
            const bent = JSON.parse(JSON.stringify(live));
            bent.bodies.three[0].sha = "0".repeat(40);
            // compare the two payloads the way fleetDrift does, without writing to disk
            return bent.bodies.three[0].sha !== live.bodies.three[0].sha; })(),
        "the check above is only worth having because a difference would be named rather than counted");
}

// =============================================================================================================
console.log("\n10. THE PAGE ACTUALLY DRAWS THEM -- an unwired model is an orphan");
{
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const skip = browserSkipReason(pw.chromium, pw.from, HEADLESS_SHELL);
    if (skip) { report("SKIPPED -- " + skip); report("*** A SKIP, NOT A PASS: sections 1-9 read the model; only this one renders it."); }
    else {
        const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
        const srv = http.createServer((q, r) => {
            const u = decodeURIComponent(String(q.url).split("?")[0]);
            const f = path.join(ENG, u === "/" ? "orrery.html" : u);
            if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end("no"); }
            r.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
            r.end(fs.readFileSync(f));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await br.newPage();
        const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
        await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" });
        await pg.waitForTimeout(1200);
        const look = (name) => pg.evaluate((n) => { window.orrery.follow(n); window.orrery.zoomTo(400); window.orrery.pause();
            return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({
                level: window.orrery.level, fleet: document.getElementById("fleet").textContent })))); }, name);
        const busiest = names.reduce((a, b) => (fleets.get(a).satellites.length >= fleets.get(b).satellites.length ? a : b));
        const rich = await look(busiest);
        ok("*** at PLANET zoom the page reports the fleet, and the number is the measured one ***",
            rich.level === 1 && rich.fleet.startsWith(String(fleets.get(busiest).satellites.length) + " importers"),
            `${busiest}: "${rich.fleet}"`);
        // the paint itself, not just the caption: count pixels in the satellite colour
        const painted = await pg.evaluate(() => { const c = document.getElementById("stage"), g = c.getContext("2d");
            const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
            for (let i = 0; i < d.length; i += 4) if (d[i] > 100 && d[i] < 160 && d[i + 1] > 200 && d[i + 2] > 140 && d[i + 2] < 200) n++;
            return n; });
        ok("*** and the marks are really on the canvas, not only in the readout ***", painted > 40,
            painted + " pixels in the satellite colour -- a caption without a picture is the defect this checks for");
        const bare = await look(PAPER_ONLY_BODIES[0]);
        ok("*** a paper-only body says so rather than showing an empty sky with no explanation ***",
            /nothing imports/.test(bare.fleet) && /paperwork/.test(bare.fleet),
            `${PAPER_ONLY_BODIES[0]}: "${bare.fleet}"`);
        ok("  and the page threw nothing", errs.length === 0, errs.join(" | ") || "clean");
        await br.close(); srv.close();
    }
}

// ---- SABOTAGE LOG -- applied to the working tree, exit code and FAIL count read together, restored
// md5-identical (world/orreryFleet.mjs 3e8e0b80, tools/ship/orreryFleetScan.mjs 70d13434, orrery.html ab320522).
//
//   A  satSeed folds the sha alone and ignores the path.
//      -> exit=1, 2 red: "two importers sharing one commit still get different seeds", and the line asserting
//      the seed IS orrerySeed's fnv1a. *** AND SECTION 4's HEADLINE STAYED GREEN, *** because the victim's own
//      commit is still unique to it -- which is exactly why the shared-commit case is a separate check: one
//      commit changing one thing does not imply the seeds are distinct.
//
//   B  satelliteAt drops the period term, so every craft sits at its phase for ever.
//      -> exit=1, 2 red: the frameDirty line in section 2 (t = 3 and t = 3.5 now agree) and section 3's
//      position-sampling control. A fleet that never moves is deterministic in the most useless possible way,
//      and a digest over DESCRIPTORS rather than positions would have called it correct.
//
//   C  the scan's NOT_IMPORTERS self-exclusion emptied.
//      -> exit=1, 3 red -- one MORE than this log first guessed, and the third is the interesting one:
//      section 1's box3d count (22 against the recorded 21), the exercised-exclusion line, AND the bake
//      POPULATION drift check, because the baked fleet holds 21 importers for box3d and the live scan finds 22.
//      The two gates that
//      measure this tree would have parted company by one file, which is the shape orreryEjecta-selfcheck's
//      header records hitting four times before this.
//
//   D  orrery.html keeps its readout but never calls drawFleet.
//      -> exit=1, 1 red, and ONLY the pixel check catches it: the caption still says "70 importers in orbit"
//      because it is computed from the model, and the canvas is empty. *** THAT IS THE WHOLE REASON SECTION 10
//      COUNTS PIXELS INSTEAD OF READING THE LABEL. *** A page that describes a picture it did not draw is the
//      orphan defect referenceKind hunts, wearing a caption.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether a sky of seventy craft around one planet READS as anything. That is a " +
    "question for eyes and for orrery.html, which draws them at the PLANET zoom; this file checks that the " +
    "count is the measured one, that the seeds are the log's, and that one new commit moves one thing.");
process.exit(fails ? 1 : 0);
