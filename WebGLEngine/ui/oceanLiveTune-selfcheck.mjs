// WebGLEngine/ui/oceanLiveTune-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~3 s with a browser; sections 1-2 alone ~0.1 s)
//
// Run: node ui/oceanLiveTune-selfcheck.mjs
//
// STEP 1 OF ocean-src-integration, HELD TO UPSTREAM'S OWN PANEL CODE:
//   1  THE TABLE   SEA_SLIDERS equals the SLIDERS table in the vendored bundle AND in the modular js/main.js, row for row; the only key of the parameter block with no slider is swellSpread;
//   2  THE PLAN    planTune clamps to the slider's range, lists swellSpread as URL-only, and refuses non-numbers and unknown keys;
//   3  THE PANEL   (needs a browser; SKIPPED, and said, without one) upstream's own panel-building block, cut out of the bundle's text and run unmodified in a stand-in page, is driven by
//                  liveTune(): P[key] takes the value, needSpectrum rises for the spectrum sliders and needLUT for haze and for nothing else, a value past a slider's range reads back clamped,
//                  and with no panel built every key is reported missing and nothing is thrown.
// SABOTAGES, each applied to the real ui/oceanLiveTune.mjs, restored, md5 verified; every one red by name: no 'input' event dispatched 4 | snap by floor 3 | haze flagged 'spec' 3 | swellSpread treated as unknown 4.
// NOT GRADED, said plainly: a real GPU recomputing the spectrum after the flag rises (the sandbox has none; the rig reads it), and the sea's own device start-up, after which the panel exists.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as LT from "./oceanLiveTune.mjs";
import { SEA_TUNABLES, declaredDefaults } from "./oceanSea.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const bundle = fs.readFileSync(path.join(ENG, "vendor/web-ocean/ocean.html"), "utf8");
const modular = fs.readFileSync(path.join(ENG, "vendor/web-ocean/js/main.js"), "utf8");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("oceanLiveTune-selfcheck -- the vendored sea, tuned through its own panel\n");
console.log("1. THE TABLE");
{
    const fromBundle = LT.slidersFromSource(bundle), fromSrc = LT.slidersFromSource(modular);
    ok("!! SEA_SLIDERS equals the SLIDERS table of the vendored BUNDLE, row for row (key, label, min, max, step, kind)", !!fromBundle && same(fromBundle, LT.SEA_SLIDERS.map((r) => [...r])), (fromBundle ? fromBundle.length : 0) + " rows");
    ok("!! ... and the modular js/main.js's, so the bundle and the sources agree on the panel", !!fromSrc && same(fromSrc, fromBundle));
    const noSlider = SEA_TUNABLES.filter((k) => !LT.SEA_SLIDERS.some((r) => r[0] === k));
    ok("!! every slider key is a parameter of the sea, and the only parameter with NO slider is swellSpread -- the one a live tune cannot reach", LT.SEA_SLIDERS.every((r) => SEA_TUNABLES.includes(r[0])) && same(noSlider, ["swellSpread"]), "no slider: " + noSlider.join(", "));
    ok("  the table's defaults sit inside every slider's range (the bundle's own P block, read from its text)", (() => { const d = declaredDefaults(bundle); return LT.SEA_SLIDERS.every(([k, , lo, hi]) => d[k].value >= lo && d[k].value <= hi); })());
}

console.log("\n2. THE PLAN");
{
    const p = LT.planTune({ swellHs: 1.99, swellLength: 60, windSpeed: 99, haze: 0.1, swellSpread: 30, bogus: 1, foam: NaN, clouds: "x" });
    const g = (k) => p.steps.find((s) => s.key === k);
    ok("!! a value inside the range is kept, one past it is clamped and marked", g("swellLength").value === 60 && !g("swellLength").clamped && g("windSpeed").value === 20 && g("windSpeed").clamped && g("haze").value === 0.5 && g("haze").clamped);
    ok("!! swellSpread is URL-only, an unknown key and a non-number are refused, and none of them becomes a step", same(p.urlOnly, ["swellSpread"]) && p.unknown.includes("bogus") && p.unknown.includes("foam") && p.unknown.includes("clouds") && !p.steps.some((s) => ["swellSpread", "bogus", "foam", "clouds"].includes(s.key)));
    ok("!! a slider snaps to its step: swellHs 1.99 plans as 2 (step 0.05 from 0), swellLength 60 is kept, 0.1234 on the 0.001 bloom step plans as 0.123 -- the browser does the same, checked live in section 3", g("swellHs").value === 2 && g("swellHs").snapped && g("swellLength").value === 60 && !g("swellLength").snapped && LT.planTune({ bloom: 0.1234 }).steps[0].value === 0.123);
    ok("  each step carries the flag upstream raises: spec for the spectrum sliders, lut for haze, none for the rest", g("swellHs").kind === "spec" && g("haze").kind === "lut" && LT.planTune({ foam: 1 }).steps[0].kind === "");
    const L = LT.reportLines(LT.liveTune(null, { swellHs: 1.99, swellSpread: 30 }));
    ok("  with no document every key is missing, none applied, and the report says so without throwing", L[0].includes("0 of 1 sliders") && L.some((l) => l.includes("URL only") && l.includes("swellSpread")), L[0]);
}

console.log("\n3. THE PANEL");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    const a = bundle.indexOf("const panel = document.getElementById('panel');"), endMark = "panel.appendChild(row);\n  }", b = bundle.indexOf(endMark, a);
    ok("!! upstream's panel-building block is found in the bundle's text (cut out, not retyped)", a > 0 && b > a, "chars " + a + ".." + (b + endMark.length));
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-2 never dispatch an event, so they cannot show that upstream's listeners accept liveTune's");
    } else if (a > 0 && b > a) {
        const block = bundle.slice(a, b + endMark.length), defaults = Object.fromEntries(Object.entries(declaredDefaults(bundle)).map(([k, v]) => [k, v.value]));
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__lt.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body><div id=panel class=hidden></div></body>"); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": u.endsWith(".mjs") ? "text/javascript" : "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message)));
            await pg.goto(base + "/__lt.html", { waitUntil: "load" });
            const r = await pg.evaluate(async ({ block, defaults }) => {
                const LT = await import("/ui/oceanLiveTune.mjs");
                const early = LT.liveTune(document, { swellHs: 2 });
                const P = { ...defaults };
                const f = new Function("P", "document", block + "\n return { flags: () => ({ needSpectrum, needLUT, envFull }), clear: () => { needSpectrum = false; needLUT = false; envFull = 0; } };").bind(null);
                // the block assigns to needSpectrum / needLUT / envFull, which upstream declares with `let` just before it: declare them here, outside the block
                const g = new Function("P", "document", "let needSpectrum = false, needLUT = false, envFull = 0;\n" + block + "\n return { flags: () => ({ needSpectrum, needLUT, envFull }), clear: () => { needSpectrum = false; needLUT = false; envFull = 0; } };");
                const h = g(P, document);
                const run = (params) => { h.clear(); const res = LT.liveTune(document, params); return { res, flags: h.flags() }; };
                const spec = run({ swellHs: 1.99, swellLength: 60 }), lut = run({ haze: 5 }), plain = run({ foam: 2 }), clamp = run({ windSpeed: 99 }), mix = run({ swellSpread: 30, bogus: 1 });
                return { early, rows: document.querySelectorAll("#panel label").length, P, spec, lut, plain, clamp, mix };
            }, { block, defaults });
            ok("!! before the panel exists every key is reported missing and nothing is thrown", r.early.applied.length === 0 && same(r.early.missing, ["swellHs"]));
            ok("!! upstream's block built one row per slider (the stand-in runs the cut-out text, unmodified)", r.rows === LT.SEA_SLIDERS.length, r.rows + " rows");
            ok("!! liveTune on the spectrum sliders sets P (swellHs 1.99 -> 2 on its 0.05 step, swellLength 60) and raises needSpectrum -- upstream's own listener ran", r.P.swellHs === 2 && r.spec.res.steps[0].got === 2 && r.spec.res.steps[0].snapped && r.P.swellLength === 60 && r.spec.flags.needSpectrum === true && r.spec.flags.needLUT === false && same(r.spec.res.applied, ["swellHs", "swellLength"]), JSON.stringify(r.spec.flags));
            ok("!! haze raises needLUT and not needSpectrum; foam (no flag) raises neither; both raise envFull", r.lut.flags.needLUT && !r.lut.flags.needSpectrum && r.P.haze === 5 && !r.plain.flags.needSpectrum && !r.plain.flags.needLUT && r.P.foam === 2 && r.lut.flags.envFull === 2 && r.plain.flags.envFull === 2);
            ok("!! a value past the range reads back clamped (windSpeed 99 -> 20) in both the slider and P, and the result says so", r.clamp.res.steps[0].got === 20 && r.clamp.res.steps[0].clamped && r.P.windSpeed === 20);
            ok("  swellSpread is returned as URL-only and the unknown key as unknown, with nothing applied for them and P untouched", same(r.mix.res.urlOnly, ["swellSpread"]) && same(r.mix.res.unknown, ["bogus"]) && r.mix.res.applied.length === 0 && r.P.swellSpread === defaults.swellSpread);
            ok("  no page error", errs.length === 0, errs.join(" | "));
        } finally { await br.close(); server.close(); }
    }
}

console.log(`\noceanLiveTune-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
