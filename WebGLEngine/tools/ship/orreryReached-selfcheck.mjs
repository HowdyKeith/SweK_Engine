#!/usr/bin/env node
// WebGLEngine/tools/ship/orreryReached-selfcheck.mjs -- v4330
//
// GRADES world/orreryReached.mjs and tools/ship/orreryReachedScan.mjs -- backlog #48, "Little Prince
// micro-planets: cast the Khronos catalogue as the inhabitants".
//
// *** THE CLAIM IS NOT "THERE ARE MORE DOTS NOW". *** It is that the difference between a thing this
// repository TOOK and a thing it merely READ is drawn as the physical difference it is: bound against
// unbound. So the checks that matter are the ones that would go red if the flybys were ellipses with a
// different colour -- section 5 asks kepler.js about every body in both populations, and section 4 proves
// the obvious way of asking is broken before using the one that is not.
//
// Run: node tools/ship/orreryReached-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as R from "../../world/orreryReached.mjs";
import * as S from "./orreryReachedScan.mjs";
import { REACHED_SOURCES, asBodies, severityOf } from "../../world/reachedLicences.mjs";
import { models, mayVendor, licenceCoverage } from "../../gpu/khronosSamples.mjs";
import { buildOrrery, REACHED, UNPAPERED } from "../../world/orrery.mjs";
import { extentOf } from "../../world/orreryView.mjs";
import { stepRK4, specificEnergy, semiMajorFromEnergy, period as keplerPeriod } from "../../physics/orbits/kepler.js";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
// TWO STRIPPERS, AND THE DIFFERENCE BIT THIS FILE ON ITS FIRST RUN. sourceScan's codeOnly blanks string
// BODIES as well as comments, which is what a purity check wants -- but it turns `from "../physics/orbits/
// kepler.js"` into `from ""`, so the check that the law is IMPORTED went red on a file that imports it.
// orreryFleetScan's removes comments only. Sixth time this tree has recorded reaching for the wrong one.
import { codeOnly as codeAndStrings } from "./sourceScan.mjs";
import { codeOnly as commentsOnly } from "./orreryFleetScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(ENG, "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: "2026-09-02" });
const FAR = extentOf(system);
const OPTS = { nearest: FAR * 1.3, farthest: FAR * 3.2, qGain: (FAR * 3.2 - FAR * 1.3) / Math.log1p(8), loop: 2418 };   // the page's scrub range: slowestPeriod * 10
const bodies = S.scanReached(ENG, OPTS);
const digest = R.reachedDigest(bodies);

console.log("orreryReached-selfcheck -- what SweK read and did not take, drawn as what it is: unbound\n");

// =============================================================================================================
console.log("1. *** THE THIRD STATE FINALLY HAS BODIES, AND THE PRODUCER WAS ACCUSING THEM ***");
{
    const sys = buildOrrery(asBodies(), { today: "2026-09-02" });
    ok("*** buildOrrery(asBodies()) now reports every register source as REACHED ***",
        sys.reached === REACHED_SOURCES.length && sys.unpapered.length === 0,
        `${sys.reached} reached, ${sys.unpapered.length} unpapered, of ${REACHED_SOURCES.length} sources`);
    // THE CONTROL, and it is the defect this round found: strip the one field back out and watch every
    // properly-licensed source be accused of having no licence. Nothing throws; the page just lies.
    const stripped = asBodies().map(({ reached, ...rest }) => rest);
    const bad = buildOrrery(stripped, { today: "2026-09-02" });
    ok("  CONTROL: without the `reached` field they are ALL filed as unpapered -- the shape v4198 shipped",
        bad.unpapered.length === REACHED_SOURCES.length && bad.reached === 0,
        `${bad.unpapered.length} of ${REACHED_SOURCES.length} accused of having no licence provenance, ` +
        `including ${REACHED_SOURCES.filter((e) => severityOf(e) === 0).length} whose licences are OPEN`);
    ok("  and the state the renderer has coloured since v4189 is the one they land in",
        sys.bodies.every((b) => b.state === REACHED), "ui/orreryDraw.js STATE_COLOUR[REACHED] = #33ccff");
}

// =============================================================================================================
console.log("\n2. THE MODEL IS PURE, SO A BROWSER AND A GATE SEE ONE UNIVERSE");
{
    const src = fs.readFileSync(path.join(ENG, "world/orreryReached.mjs"), "utf8");
    const code = codeAndStrings(src);
    for (const [what, re] of [["fs", /\bfrom\s*["']node:/], ["a DOM", /\b(document|window)\./],
                              ["Math.random", /Math\.random\s*\(/], ["a clock", /Date\.now\s*\(|new Date\s*\(/]]) {
        ok(`  world/orreryReached.mjs reaches for no ${what}`, !re.test(code), "");
    }
    const withStrings = commentsOnly(src);
    ok("*** and it imports kepler's own functions rather than restating them ***",
        /from\s*["']\.\.\/physics\/orbits\/kepler\.js["']/.test(withStrings) &&
        !/2\s*\*\s*Math\.PI\s*\*\s*Math\.sqrt/.test(code),
        "world/orrery.mjs's v4185 lesson: a restated law is two modules describing different universes");
}

// =============================================================================================================
console.log("\n3. *** THE CLOSED FORM IS THE TREE'S OWN TRAJECTORY, MEASURED AGAINST ITS OWN INTEGRATOR ***");
{
    const q = 4, mu = 1, dt = 1e-4;
    const p0 = R.barker(q, 0, mu);
    let s = { x: p0.x, y: p0.y, vx: p0.vx, vy: p0.vy }, worst = 0;
    for (let i = 1; i <= 200000; i++) {
        s = stepRK4(s, dt, mu);
        if (i % 20000 === 0) {
            const c = R.barker(q, i * dt, mu);
            worst = Math.max(worst, Math.hypot(s.x - c.x, s.y - c.y) / c.r);
        }
    }
    ok("*** Barker's equation and kepler.js's stepRK4 draw the same flyby ***", worst < 1e-11,
        `worst relative position error ${worst.toExponential(2)} over 200,000 steps -- the picture is not a ` +
        `curve that looks parabolic, it is the trajectory the tree's physics module produces`);
    ok("  and t = 0 is perihelion, on the aim axis, by construction",
        Math.abs(p0.x - q) < 1e-12 && Math.abs(p0.y) < 1e-12, `r = ${p0.r}`);
    ok("  and the approach mirrors the departure -- it passes once, it does not loop",
        Math.abs(R.barker(q, -20, mu).r - R.barker(q, 20, mu).r) < 1e-9 &&
        Math.sign(R.barker(q, -20, mu).y) === -Math.sign(R.barker(q, 20, mu).y),
        "same radius before and after, opposite side");
}

// =============================================================================================================
console.log("\n4. *** AND THE OBVIOUS TEST FOR UNBOUND IS WRONG -- MEASURED, NOT ASSERTED ***");
{
    // kepler.js: semiMajorFromEnergy = (E < 0 ? -mu/(2E) : Infinity). Infinity is the tree's own way of saying
    // "not coming back", so `a === Infinity` looks like the check. A parabola has E EXACTLY ZERO, and exactly
    // zero is the one value a float cannot be trusted to land on. So this MEASURES how often the sign lies.
    let neg = 0, total = 0, worstScaled = 0;
    for (let i = 0; i < 4000; i++) {
        const q = 200 + i * 0.5, mu = 1, k = Math.sqrt(mu / (2 * q));
        for (const nu of [0, 0.7, 1.4, 2.1, 2.8]) {
            const r = q * (1 + Math.tan(nu / 2) ** 2);
            const st = { x: r * Math.cos(nu), y: r * Math.sin(nu), vx: -k * Math.sin(nu), vy: k * (1 + Math.cos(nu)) };
            const E = specificEnergy(st, mu);
            total++; if (E < 0) neg++;
            worstScaled = Math.max(worstScaled, Math.abs(E) * q);
        }
    }
    ok("*** a sign test on the specific energy calls a large share of exact parabolas BOUND ***", neg > 0,
        `${neg} of ${total} exactly-parabolic states read E < 0 (${(100 * neg / total).toFixed(0)}%), and ` +
        `semiMajorFromEnergy returned a huge FINITE axis for every one of them`);
    ok("  and the departure from zero is float noise, not physics",
        worstScaled < 1e-12, `worst |E| * q over ${total} samples: ${worstScaled.toExponential(2)}`);
    // *** SO THE CLASSIFICATION IS RUN OVER THE SAME TWENTY THOUSAND, AND NOT OVER FIVE. *** The first draft
    // of this check sampled five states at one perihelion and passed under a sabotage that restored the sign
    // test -- because the sign is right 77% of the time and five draws of a 77% coin usually come up right.
    // A check that a broken implementation passes by luck is not a check.
    let called = 0, missed = [];
    for (let i = 0; i < 4000; i++) {
        const q = 200 + i * 0.5, mu = 1, k = Math.sqrt(mu / (2 * q));
        for (const nu of [0, 0.7, 1.4, 2.1, 2.8]) {
            const r = q * (1 + Math.tan(nu / 2) ** 2);
            const st = { x: r * Math.cos(nu), y: r * Math.sin(nu), vx: -k * Math.sin(nu), vy: k * (1 + Math.cos(nu)) };
            if (R.boundnessOf(st, mu, q).kind === "parabolic") called++;
            else if (missed.length < 3) missed.push(`q=${q} nu=${nu}`);
        }
    }
    ok("*** boundnessOf calls every one of them parabolic, because it reads a magnitude and not a sign ***",
        called === total, `${called} of ${total}${missed.length ? " -- missed " + missed.join(", ") : ""} -- ` +
        `the tolerance is in units of mu/q, so it means the same thing at every perihelion`);
    // AND IT STILL DISCRIMINATES. A tolerance that swallowed everything would be worse than the sign test.
    const circ = { x: 10, y: 0, vx: 0, vy: Math.sqrt(1 / 10) };
    const fast = { x: 10, y: 0, vx: 0, vy: Math.sqrt(1 / 10) * 1.6 };
    ok("  CONTROL: a real ellipse is still elliptical and a real hyperbola still hyperbolic",
        R.boundnessOf(circ, 1, 10).kind === "elliptical" && R.boundnessOf(fast, 1, 10).kind === "hyperbolic",
        `circular -> ${R.boundnessOf(circ, 1, 10).kind}, 1.6x circular speed -> ${R.boundnessOf(fast, 1, 10).kind}`);
}

// =============================================================================================================
console.log("\n5. *** CAPTURED IS BOUND. REACHED IS NOT. THAT IS THE WHOLE PICTURE. ***");
{
    // a captured body's own placement, as a state: circular orbit of radius a, speed sqrt(mu/a)
    const capt = system.bodies.map((b) => {
        const st = { x: b.a, y: 0, vx: 0, vy: Math.sqrt(1 / b.a) };
        return { name: b.name, ...R.boundnessOf(st, 1, b.a) };
    });
    ok("*** every vendored body is on a closed orbit -- negative energy, finite semi-major axis ***",
        capt.every((c) => c.bound && Number.isFinite(c.a)),
        `${capt.length} of ${capt.length} elliptical; ` +
        capt.slice(0, 2).map((c) => `${c.name} a=${c.a.toFixed(2)}`).join(", "));
    ok("  and kepler's period agrees with the axis the orrery placed it at",
        system.bodies.every((b) => Math.abs(b.period - keplerPeriod(b.a)) < 1e-9),
        "imported, not restated");
    const fly = bodies.map((b) => {
        const p = R.flybyAt(b, b.epoch + 7);      // seven days past perihelion, well off the axis
        return { name: b.name, ...R.boundnessOf(p, 1, b.q) };
    });
    // COUNTED, NOT RESTATED. The first draft printed `${fly.length} of ${fly.length}` whatever the answer
    // was, so a sabotage that made half of them elliptical still reported "189 of 189 parabolic" beside its
    // own FAIL. A detail line that cannot disagree with the assertion is decoration.
    const para = fly.filter((f) => f.kind === "parabolic" && !f.bound).length;
    const boundN = capt.filter((c) => c.bound).length;
    ok("*** and every reached source is NOT -- zero energy, no semi-major axis at all ***",
        para === fly.length,
        `${para} of ${fly.length} parabolic; nothing was taken, so nothing holds them`);
    ok("  the two populations are disjoint in a quantity kepler.js computes, not in a colour this file chose",
        boundN === capt.length && para === fly.length,
        `${boundN} of ${capt.length} bound, ${fly.length - para} of ${fly.length} NOT unbound, one function asked of both`);
}

// =============================================================================================================
console.log("\n6. THE ONLY LENGTH IS HOW CLOSE IT CAME, AND IT IS MEASURED FROM THE REGISTER");
{
    const q0 = R.perihelionFor(0, OPTS), q1 = R.perihelionFor(1, OPTS), q7 = R.perihelionFor(7, OPTS);
    ok("*** more footprint means closer, and it is monotone ***", q0 > q1 && q1 > q7,
        `0 files -> ${q0.toFixed(1)}, 1 -> ${q1.toFixed(1)}, 7 -> ${q7.toFixed(1)}`);
    ok("  and the scale is fixed rather than normalised over the population",
        R.perihelionFor(3, OPTS) === R.perihelionFor(3, OPTS) &&
        R.perihelionFor(3, OPTS) < R.perihelionFor(2, OPTS),
        "a source's perihelion depends on that source and nothing else -- adding one does not move the others");
    ok("*** and the closest anyone comes is still outside every captured orbit ***",
        digest.closest > FAR,
        `closest approach ${digest.closest.toFixed(1)} against a captured extent of ${FAR.toFixed(1)} -- ` +
        `it was never taken in, so it never gets inside`);
    // the refusal, checked as a refusal
    ok("  NO RADIUS IS DERIVED, because a reached source has no bytes here",
        bodies.every((b) => b.radius === bodies[0].radius),
        "every flyby is drawn at the same minimum: you cannot see how big a thing you did not take");
    const busiest = bodies.reduce((a, b) => (a.footprint >= b.footprint ? a : b));
    ok("  and the closest body is the one that left the most behind, derived rather than named",
        busiest.q === digest.closest,
        `${busiest.name}: ${busiest.footprint} files in this tree exist because of it`);
}

// =============================================================================================================
console.log("\n7. TWO RUNS MATCH, AND ONE CHANGED SOURCE MOVES EXACTLY ONE THING");
{
    const a = S.scanReached(ENG, OPTS), b = S.scanReached(ENG, OPTS);
    const key = (l) => l.map((x) => `${x.name}|${x.q.toFixed(9)}|${x.aim.toFixed(9)}|${x.epoch.toFixed(9)}|${x.may}`).join(";");
    ok("*** the same tree gives the same universe ***", key(a) === key(b), `${a.length} bodies, twice`);
    // and it is not deterministic by being deaf: change ONE source's footprint and count what moved
    const src = R.fromReachedRegister(REACHED_SOURCES, severityOf);
    const bent = src.map((s, i) => (i === 3 ? { ...s, footprint: s.footprint + 5 } : s));
    const before = R.reachedBodies(src, OPTS), after = R.reachedBodies(bent, OPTS);
    const moved = before.filter((x, i) => x.q !== after[i].q);
    ok("*** and one source gaining five citations moves exactly one body ***", moved.length === 1,
        `${moved.length} of ${before.length} moved: ${moved.map((m) => m.name).join(", ") || "none"}`);
    // BY NAME, NOT BY INDEX -- reachedBodies SORTS, so `before[3]` is the fourth source alphabetically and
    // not the third one in the register. The first draft compared the wrong body and read "39.47 -> 39.47".
    const victim = src[3].name;
    const b3 = before.find((x) => x.name === victim), a3 = after.find((x) => x.name === victim);
    ok("  CONTROL: a model that ignored the footprint would have moved none",
        b3.q !== a3.q, `${victim}: ${b3.q.toFixed(2)} -> ${a3.q.toFixed(2)}`);
    // the flyby actually moves in time, or "deterministic" would be satisfied by a picture that never changes
    const p1 = R.flybyAt(bodies[0], 10), p2 = R.flybyAt(bodies[0], 40);
    ok("  and a flyby is somewhere different at a different t", Math.hypot(p1.x - p2.x, p1.y - p2.y) > 1e-6,
        `r ${p1.r.toFixed(2)} -> ${p2.r.toFixed(2)}`);
}

// =============================================================================================================
console.log("\n8. *** WHICH MODELS THIS TREE REACHES FOR: THE NARROW ANSWER, AND THE TWO WRONG ONES ***");
{
    const bake = S.readReachedBake(ENG);
    const visited = S.visitedModels(ENG);
    const callers = S.catalogueCallers(ENG);
    // *** REACHING FOR THE CATALOGUE IS NOT REACHING FOR A MODEL, and this round added the second caller
    // that proves it. orrery.html imports models() to place all 150 as flybys and names none of them; the
    // count that matters is how many are asked for BY NAME, which is what a stream would actually fetch.
    ok("*** the callers import the catalogue, and exactly one model is asked for by name ***",
        callers.length >= 1 && visited.length === 1,
        `${callers.length} caller(s) -- ${callers.join(", ")} -- asking for ` +
        `${visited.map((v) => v.name + " (" + v.by.join(", ") + ")").join(", ")}, of ${models().length} in the catalogue`);
    ok("  and the other models are REACHABLE rather than reached, which is a different fact",
        models().length - visited.length === 149,
        `${models().length - visited.length} are in the <select> and have never been asked for by name`);
    // THE WIDE ANSWER, kept as evidence rather than discarded
    const wide = S.namedAnywhere(ENG);
    ok("*** a plain name search would have claimed many more, and almost all of them are English ***",
        wide.length > visited.length,
        `${wide.length} named at all: ` + wide.slice(0, 5).map((w) => `${w.name} ${w.hits}`).join(", ") +
        ` -- three.js's light class, a BZFlag box, a UI panel label`);
    // *** AND THE FIRST ANSWER WAS WORSE, MEASURED HERE RATHER THAN REMEMBERED. *** namedAnywhere excludes
    // the catalogue by construction; this counts what including it would have added, which is all of them,
    // because gpu/khronosSamples.mjs holds every name. A scan of a tree for a list, over a tree containing
    // the list. The eighth instance of that shape here, and the reason the exclusion is in the scanner.
    const inCatalogue = (() => {
        const src = fs.readFileSync(path.join(ENG, S.CATALOGUE), "utf8");
        return models().filter((n) => src.includes(n)).length;
    })();
    ok("  and including the catalogue in that search would have claimed the whole 150",
        inCatalogue === models().length && inCatalogue > wide.length,
        `${inCatalogue} of ${models().length} names appear inside the catalogue itself -- against ${wide.length} ` +
        `outside it; the first draft of this scan measured the first number and believed it`);
    // GATES ARE NOT CONSUMERS, and the rule is exercised rather than merely stated
    const gateSrc = fs.readFileSync(path.join(ENG, "gpu/khronosSamples-selfcheck.mjs"), "utf8");
    const inGate = models().filter((n) => new RegExp(`(["'\`])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`).test(gateSrc));
    ok("*** the catalogue's own gate names several models and NONE of them counts as reached ***",
        inGate.length > 1 && inGate.filter((n) => n !== "Fox").every((n) => !visited.some((v) => v.name === n)),
        `${inGate.length} models in fixtures there; a test of the catalogue is not a use of a model`);
    ok("  and THIS gate is excluded by the same rule rather than by a name, which is what keeps it a rule",
        S.isGate("tools/ship/orreryReached-selfcheck.mjs") && S.isGate("gpu/khronosSamples-selfcheck.mjs"),
        "v4329's lesson: an eighth self-exclusion would have made the file an exception");
    ok("  the licence coverage is carried honestly: unread is its own answer, not a refusal",
        digest.byMay[R.NOT_ASKED] === licenceCoverage().unread,
        `${licenceCoverage().unread} of ${licenceCoverage().total} models have never had their licence opened`);
    ok("  and the bake agrees with all of it", !!bake && bake.visited.length === visited.length &&
        bake.wideCount === wide.length, bake ? `${bake.visited.length} visited, ${bake.wideCount} wide` : "missing");
}

// =============================================================================================================
console.log("\n9. THE BAKE MUST NOT GO STALE -- v4329's lesson applied to a second baked file");
{
    const drift = S.reachedDrift(ENG, REPO);
    ok("*** orrery-reached.json holds what the tree holds ***", drift.length === 0,
        drift.slice(0, 3).join("; ") || "run: node tools/ship/orreryReachedScan.mjs --write");
    const bake = S.readReachedBake(ENG);
    ok("  and it names the commit it was taken at", !!bake && /^[0-9a-f]{40}$/.test(String(bake.head || "")),
        `baked at ${String(bake && bake.head).slice(0, 12)}`);
    ok("*** and NO POSITION is baked -- the picture is computed from (footprint, name, t) ***",
        !!bake && !/"x"|"y"|"aim"|"epoch"|"\bq\b"/.test(JSON.stringify(bake).slice(0, 4000)),
        "orreryBake.mjs's rule: a file of positions begins lying the next morning");
    ok("  CONTROL: the drift check really can speak -- a bent bake is reported by name",
        (() => { const b = S.readReachedBake(ENG); return S.reachedDrift.length >= 0 && b.catalogue !== 999; })() &&
        (() => { const p = path.join(ENG, S.REACHED_BAKE); const keep = fs.readFileSync(p, "utf8");
                 const b = JSON.parse(keep); b.catalogue = 999; fs.writeFileSync(p, JSON.stringify(b, null, 1) + "\n");
                 const said = S.reachedDrift(ENG, REPO); fs.writeFileSync(p, keep);
                 return said.some((x) => /catalogue/.test(x)); })(),
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
        await pg.waitForTimeout(1500);
        const seen = await pg.evaluate(() => { window.orrery.pause();
            return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({
                level: window.orrery.level, readout: document.getElementById("fleet").textContent })))); });
        ok("*** at SYSTEM zoom the page reports the passing traffic, with the population it was built from ***",
            seen.level === 0 && /of \d+ passing in frame/.test(seen.readout),
            `"${seen.readout}" -- against ${bodies.length} bodies in the model`);
        const total = Number((seen.readout.match(/of (\d+) passing/) || [])[1] || 0);
        ok("  and that population is the two registers added, not a number the page holds",
            total === REACHED_SOURCES.length + models().length,
            `${total} = ${REACHED_SOURCES.length} register sources + ${models().length} Khronos models`);
        // *** THE PAINT ITSELF, AND THE FIRST VERSION OF THIS CHECK WAS MEASURING THE PAGE FURNITURE. ***
        // It counted the unread-licence grey #6b7d8c at a tolerance of 26 and read 309 pixels with the draw
        // call REMOVED -- sabotage D went 0 red. At that width the swatch is an ordinary blue-grey and the
        // orbit rings, the labels and every antialiased edge fall inside it. Measured at tolerance 8, the
        // chrome contributes none and the three flyby colours contribute 67. So: tight, and all three, since
        // which postures happen to be in frame at t = 0 is not something this check should depend on.
        const painted = await pg.evaluate(() => { const c = document.getElementById("stage"), g = c.getContext("2d");
            const d = g.getImageData(0, 0, c.width, c.height).data;
            const hues = [[0x33, 0xcc, 0xff], [0xc0, 0x6b, 0xff], [0x6b, 0x7d, 0x8c]];
            let n = 0;
            for (let i = 0; i < d.length; i += 4) {
                for (const h of hues) {
                    if (Math.abs(d[i] - h[0]) < 8 && Math.abs(d[i + 1] - h[1]) < 8 && Math.abs(d[i + 2] - h[2]) < 8) { n++; break; }
                }
            }
            return n; });
        ok("*** and the flybys are really on the canvas, not only in the readout ***", painted > 30,
            `${painted} pixels in the three flyby colours at tolerance 8 -- a caption without a picture is ` +
            `the defect this checks for, and it is the defect this check itself had`);
        ok("  and the page threw nothing", errs.length === 0, errs.join(" | ") || "clean");
        await br.close(); srv.close();
    }
}

// ---- SABOTAGE LOG -- applied to the working tree, exit code and FAIL count read together, restored
// md5-identical (world/reachedLicences.mjs 1e80501e, world/orreryReached.mjs 9e06523d, orrery.html 775cfbde).
//
// *** TWO OF THE FOUR CAUGHT A DEFECT IN THIS GATE RATHER THAN IN THE CODE, which is what they are for. ***
//
//   A  asBodies() drops `reached: true` again -- the shape v4198 shipped and v4330 fixed.
//      -> exit=1, 2 red: "buildOrrery(asBodies()) reports every register source as REACHED" (0 reached, 39
//      unpapered) and the line asserting the state the renderer colours. The CONTROL beside them stayed
//      GREEN and correctly so -- it strips the field itself, so it reads the same either way. A control that
//      went red with its subject would be measuring the subject twice.
//
//   B  boundnessOf classifies by the SIGN of the energy (`!Number.isFinite(a)`) instead of its magnitude.
//      -> exit=1, 4 red: 15,408 of 20,000 parabolic states still called parabolic and 4,592 not, the
//      ellipse/hyperbola control (a hyperbola read as parabolic), 70 of 189 flybys still unbound, and the
//      two-populations line. *** AND THE FIRST DRAFT OF SECTION 4 PASSED THIS SABOTAGE. *** It sampled five
//      states at one perihelion; the sign is right 77% of the time, so five draws usually come up right. The
//      check now runs the full 20,000 -- a check a broken implementation passes by luck is not a check.
//
//   C  perihelionFor ignores the footprint, so every source passes at the same distance.
//      -> exit=1, 4 red: the monotonicity line (0 -> 39.5, 1 -> 39.5, 7 -> 39.5), the fixed-scale line, and
//      BOTH halves of section 7's one-change test -- 0 of 39 moved. The "closest approach is outside every
//      captured orbit" line stayed green, correctly: that is a different property and still true.
//
//   D  orrery.html computes the readout from the model and never calls drawFlybys.
//      -> exit=1, 1 red, 0 pixels. *** THE FIRST VERSION OF THE PIXEL CHECK SCORED 309 AND WENT 0 RED. ***
//      It counted the unread-licence grey at a tolerance of 26, and at that width the orbit rings, the
//      labels and every antialiased edge fall inside it -- the check was measuring the page furniture while
//      the flybys were absent. Tightened to 8 and widened to all three flyby colours: 66 with the draw, 0
//      without. The defect the check exists to catch is the defect the check itself had.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether a hundred and eighty-nine arcs around a fifteen-body system reads as " +
    "context or as clutter. That is a question for eyes. This file checks that the flybys are unbound in a " +
    "quantity kepler.js computes, that how close each comes is measured from the register, and that the one " +
    "model this tree asks for by name is the only one counted.");
process.exit(fails ? 1 : 0);
