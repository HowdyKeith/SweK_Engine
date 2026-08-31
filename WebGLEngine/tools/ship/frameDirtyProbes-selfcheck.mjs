#!/usr/bin/env node
// tools/ship/frameDirtyProbes-selfcheck.mjs -- v4232
//
// Run: node tools/ship/frameDirtyProbes-selfcheck.mjs     (source checks always; the live section skips loudly)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** A PROBE THAT CANNOT REPORT CLEAN IS NOT A PROBE, AND THE TREE HAD ONE FOR EIGHT ROUNDS. ***
//
// #60 asked for three things: guard the animators, examine the rest, then MEASURE before enabling. v4231 did
// the first two. This is the measurement, and it found that the thing being measured could never have worked.
//
// MEASURED IN A REAL HEADLESS CHROMIUM ON THE REAL index.html, flag enabled, three runs per scenario, fresh
// page each run, 4-second windows:
//
//     idle (as it boots)      0.0 / 0.0 / 0.0 %   held by "demo"          -- a demo runs on boot
//     demo stopped            0.0 / 0.0 / 0.0 %   held by "dayNight"      -- THE CONSTANT
//     + day/night paused      0.0 / 0.0 / 0.0 %   held by "domAnimation"  -- a CSS animation in the chrome
//     camera moving           0.0 / 0.0 / 0.0 %   held by "camera"        -- correct
//
// A REPEATED CONTROL GAVE 0.0 POINTS OF SPREAD, which is why the zero is reported as real rather than as
// sampling luck -- #86's rule, that a delta may not be read before its noise floor is.
//
// *** THE DEFECT. *** The dayNight probe read:
//
//     !!(window.dayNight?.isRunning?.() ?? dayNightCycle?.isRunning?.() ?? true)
//
// window.dayNight is a plain console helper (main.js:10253) whose keys are t, label, cycleSec, paused,
// setTime and the time presets. DayNightCycle has pause(), resume() and _paused. NEITHER HAS EVER HAD AN
// isRunning. Both optional calls short-circuited to undefined and the `?? true` answered for them, so the
// probe returned true on every frame of every scene forever -- and it is declared to cover FOUR animators
// (dayNightCycle, sunFlare, cloudLayer, atmosphereSystem), so coveredIn() counted four systems as guarded by
// a constant. The fix reads dayNight.paused, a getter over weatherSystem._paused that was already sitting on
// the object the probe was dereferencing: FOUND, not invented.
//
// Falling back to `true` is itself correct -- a probe that cannot tell must say dirty, because the cost of a
// wrong "clean" is a frozen screen. What was wrong is that the fallback was doing ALL the work, silently.
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { codeOnly, proseHas } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("frameDirtyProbes-selfcheck -- a probe must be a measurement, not a constant\n");

const MAIN = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");

/** Every addSource(...) call body, sliced out of main.js. */
function probeBodies(src) {
    const out = [];
    const re = /frameDirty\.addSource\(\s*"([^"]+)"\s*,/g;
    let m;
    while ((m = re.exec(src))) {
        // take from the call to the matching close of the addSource( ... ) argument list
        let i = m.index + m[0].length, depth = 1, body = "";
        for (; i < src.length && depth > 0; i++) {
            const c = src[i];
            if (c === "(") depth++;
            else if (c === ")") { depth--; if (!depth) break; }
            body += c;
        }
        out.push({ name: m[1], body });
    }
    return out;
}

// ---- 1. NO PROBE MAY BE A CONSTANT -------------------------------------------------------------------------
console.log("1. *** THE RULE THE DEFECT BROKE: A PROBE'S ANSWER MUST DEPEND ON SOMETHING ***");
{
    const probes = probeBodies(MAIN);
    ok("every registered source is found in the source", probes.length >= 18, `${probes.length} addSource calls`);

    // `?? true` as the LAST resort of a chain of optional calls is the shape that hid this: it answers when
    // every reading failed, so a chain of names that do not exist becomes an unconditional true.
    const constants = probes.filter((p) => /\?\?\s*true\s*\)/.test(codeOnly(p.body)));
    ok("!! *** NO PROBE FALLS THROUGH A CHAIN OF OPTIONAL CALLS INTO `?? true` ***",
        constants.length === 0,
        constants.length ? "still constant: " + constants.map((c) => c.name).join(", ")
                         : "the dayNight probe did exactly this from v4174 to v4231 and nothing ran it");

    // The catch is a DIFFERENT thing and must stay: a probe that THREW cannot tell, and must say dirty.
    const guarded = probes.filter((p) => /catch\s*\([^)]*\)\s*\{\s*return true/.test(p.body));
    ok("...while `catch -> return true` stays, because a probe that threw genuinely cannot tell",
        guarded.length >= 10, `${guarded.length} of ${probes.length} probes fail safe`);

    const dn = probes.find((p) => p.name === "dayNight");
    ok("!! the dayNight probe now reads state that EXISTS on the object it dereferences",
        !!dn && /window\.dayNight\?\.paused/.test(codeOnly(dn.body)) && !/isRunning/.test(codeOnly(dn.body)),
        "dayNight.paused is a getter over weatherSystem._paused");
    ok("...and the reason it was wrong is written down where the next reader will be",
        proseHas(MAIN, /NEITHER OF WHICH HAS EVER HAD THAT METHOD/i) || proseHas(MAIN, /has ever had that method/i));
}

// ---- 2. THE NAMES THE PROBES CALL MUST EXIST ---------------------------------------------------------------
console.log("\n2. the method a probe calls has to be defined somewhere");
{
    // A conservative check: any `?.NAME?.()` inside a probe must be a name this repository defines as a method
    // SOMEWHERE. It cannot tell which object a module-scope binding points at -- that needs the live section
    // below -- but it catches a name that exists nowhere at all, which is what isRunning was for dayNight.
    const probes = probeBodies(MAIN);
    const called = new Set();
    for (const p of probes) for (const m of codeOnly(p.body).matchAll(/\?\.([a-zA-Z_$][\w$]*)\?\.\(/g)) called.add(m[1]);
    const defined = (name) => {
        const re = new RegExp("(^|[^\\w.])" + name + "\\s*\\(", "m");
        for (const dir of ["simulation", "world", "render", "engine", "ui", "atmosphere", "physics"]) {
            const d = path.join(ROOT, dir);
            if (!fs.existsSync(d)) continue;
            const stack = [d];
            while (stack.length) {
                const cur = stack.pop();
                for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
                    const q = path.join(cur, e.name);
                    if (e.isDirectory()) { stack.push(q); continue; }
                    if (!/\.(js|mjs)$/.test(e.name)) continue;
                    if (re.test(fs.readFileSync(q, "utf8"))) return true;
                }
            }
        }
        return false;
    };
    const missing = [...called].filter((n) => !defined(n));
    ok("!! every method a probe optional-calls is defined somewhere in the tree", missing.length === 0,
        missing.length ? "defined NOWHERE: " + missing.join(", ") : [...called].sort().join(", "));
}

// ---- 3. LIVE: THE PROBE MUST ACTUALLY FLIP --------------------------------------------------------------
console.log("\n3. *** THE ONLY CHECK A CONSTANT CANNOT PASS: MAKE THE WORLD QUIET AND WATCH THE PROBE CHANGE ***");
{
    const { chromium, from } = resolvePlaywright(createRequire(import.meta.url));
    const skip = browserSkipReason(chromium, from);
    if (skip) {
        console.log("  skip  the live section: " + skip);
        console.log("        SECTIONS 1 AND 2 CANNOT REPLACE THIS. They check the SHAPE of a probe; only running");
        console.log("        one against the real engine can show that its answer moves when the world does,");
        console.log("        which is the exact thing the dayNight probe failed at for eight rounds.");
    } else {
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        try {
            const page = await browser.newPage();
            await page.route("**/*", (r) => {
                const u = new URL(r.request().url());
                if (u.hostname === "swek.local") {
                    const p = path.join(ROOT, decodeURIComponent(u.pathname));
                    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                        const e = path.extname(p);
                        const t = (e === ".mjs" || e === ".js") ? "text/javascript" : e === ".html" ? "text/html"
                                : e === ".json" ? "application/json" : e === ".css" ? "text/css"
                                : e === ".wasm" ? "application/wasm" : "application/octet-stream";
                        return r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(p) });
                    }
                    return r.fulfill({ status: 404, body: "nf" });
                }
                return r.fulfill({ status: 404, body: "nf" });   // no third-party network in a gate
            });
            await page.goto("http://swek.local/index.html", { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => !!window.frameDirty, null, { timeout: 60000 });
            await page.waitForTimeout(2500);

            const r = await page.evaluate(async () => {
                const probe = () => { try { return !window.dayNight?.paused; } catch (e) { return true; } };
                const before = probe();
                window.dayNight.pause();
                const paused = probe();
                window.dayNight.play();
                const after = probe();
                // ...and the OLD expression, evaluated on the same live objects, for the contrast.
                const old = () => !!(window.dayNight?.isRunning?.() ?? true);
                const oldRunning = old();
                window.dayNight.pause();
                const oldPaused = old();
                window.dayNight.play();
                return { before, paused, after, oldRunning, oldPaused,
                         hasIsRunning: typeof window.dayNight?.isRunning,
                         hasPaused: typeof Object.getOwnPropertyDescriptor(window.dayNight, "paused")?.get };
            });

            ok("!! the fixed probe reports ACTIVE while the cycle runs", r.before === true);
            ok("!! ...and CLEAN once it is paused -- the transition a constant can never make",
                r.paused === false, "true -> false -> " + r.after);
            ok("...and active again on play()", r.after === true);
            ok("!! *** THE OLD EXPRESSION RETURNS true IN BOTH STATES, ON THESE SAME LIVE OBJECTS ***",
                r.oldRunning === true && r.oldPaused === true,
                "running:true paused:true -- it was never reading anything");
            ok("!! ...because isRunning is not defined on the object the probe reached for",
                r.hasIsRunning === "undefined", "typeof window.dayNight.isRunning === 'undefined'");
            ok("...while `paused`, the state it should have read, was right there as a getter",
                r.hasPaused === "function");
        } finally { await browser.close(); }
    }
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT THE FLAG NOW SAVES ANYTHING. It does not, and it is still shipped disabled. The");
console.log("      measurement above found 0.0% skipped in every scenario, and fixing the constant did not");
console.log("      change that number -- because with the day/night cycle paused the next perpetual animator");
console.log("      is domAnimation, a CSS animation in the page chrome. What the fix buys is that dayNight is");
console.log("      now a reading instead of an answer, so the NEXT layer is the real obstacle rather than a");
console.log("      hidden one. Whether a scene exists in which this engine is genuinely still is still open.");
console.log("      AND SECTION 3 EVALUATES BOTH EXPRESSIONS INLINE RATHER THAN READING THE SHIPPED PROBE OUT");
console.log("      OF frameDirty. It proves that the old form cannot flip and the new one can, on the real");
console.log("      live objects -- but it is sections 1 and 2 that pin what main.js actually registers. A");
console.log("      check that drove the registered probe through a real frame would be stronger, and this");
console.log("      is not that; saying so is cheaper than discovering it later.");
console.log("      AND THE FRAME RATE HERE IS ~5.5 fps ON SWIFTSHADER, so nothing above is a timing result.");
console.log("      Skip RATE is a logic measurement and survives a slow rasteriser; a saving in milliseconds");
console.log("      would not, and none is claimed.");

console.log("\nframeDirtyProbes-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
