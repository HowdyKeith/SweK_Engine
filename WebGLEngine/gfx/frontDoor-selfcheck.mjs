// WebGLEngine/gfx/frontDoor-selfcheck.mjs -- v4407
//
// *** THE FRONT DOOR ADVERTISED WEBGPU AND REACHED NONE OF IT. ***
//
// Measured with the tree's own resolver -- tools/ship/moduleRefs.mjs's specifiers() and resolveSpec(), walked
// FORWARD from main.js -- the front door reached 692 modules and not one of the ten in WEBGPU_STACK. Not
// gfx/device.js (538 lines, two backends, 39 mentions of compute and storage), not render/tslSource.mjs
// (v4320-v4338, a TSL graph compiled to WGSL and GLSL and held to the hand-written pipeline's picture byte for
// byte on both backends), not any of the six TSL modules, not the device post chain, not webrtx.
//
// All of it lives on tsl-rig.html, tsl-probe.html, orrery-gpu.html and webrtx.html -- pages main.js never
// reaches. And main.js carried a line that printed "this browser HAS WebGPU" and then offered nothing using it.
//
// ---- WHAT THIS ROUND CLOSES, AND WHAT IT DOES NOT --------------------------------------------------------------
//
// One of ten: gfx/device.js, through a lazily-imported door on the pattern window.fire already uses. The other
// nine are still on the far side and this gate SAYS the number rather than implying the stack arrived. The
// ratchet is on the DIFFERENCE between the population and what is closed, computed here rather than read from a
// third list.
//
// ---- AND THE REASON IT IS A DOOR AND NOT A REROUTE -------------------------------------------------------------
//
// gfx/device.js's detectBackends() reads `!!navigator.gpu` and nothing else, so an undefined navigator.gpu means
// "this browser has none" and "this URL may not have it" AT THE SAME TIME. Those have different fixes: one is a
// machine, the other is an address. SweK's primary origin is http://<lan-ip>:8787, neither https nor loopback,
// so on the address Keith opens the whole stack is unreachable for a reason that is nothing to do with the GPU.
//
// v4118 has the scar: voxtral.html's Load button did NOTHING AT ALL on the LAN, and its gate could not see it
// because the gate served the page from localhost, which IS a secure context. A probe run on the wrong ORIGIN
// measures a different browser. So section 4 drives a NON-LOOPBACK address and section 5 a loopback one.
//
// *** AND THE THIRD READING IS THE ONE I DID NOT EXPECT. *** Section 5b runs the SAME loopback origin under one
// extra launch flag. Three reasons a WebGPU device does not arrive, on one machine:
//
//     LAN address, any launch            the ADDRESS withholds navigator.gpu entirely      -> withheld
//     loopback, plain launch             navigator.gpu exists, requestAdapter() is NULL    -> no-device
//     loopback, --enable-unsafe-webgpu   an adapter arrives and the backend is webgpu      -> present
//
// detectBackends() reports webgpu:false for the first two and cannot tell them apart, and the difference
// between the second and third is a command-line argument. I had written "the canvas context" into the
// module's header as the cause; the gate measured "adapter" and the header was corrected to match.
"use strict";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { specifiers, resolveSpec } from "../tools/ship/moduleRefs.mjs";
import { noComments } from "../tools/ship/sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "../tools/ship/playwrightResolve.mjs";
import { createRequire } from "node:module";
import * as FD from "./frontDoor.mjs";
import { gateReport } from "../tools/ship/gateReport.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..");
const require_ = createRequire(import.meta.url);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ....  " + m);
const GR = gateReport("gfx/frontDoor-selfcheck.mjs");

/** Forward reach from a root, using the tree's OWN scanner and resolver so the number is comparable. */
function reachFrom(rootRel) {
    const root = path.join(ENG, rootRel);
    const seen = new Set([root]), queue = [root], edge = new Map();
    while (queue.length) {
        const f = queue.shift();
        let src = ""; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        for (const { spec, route } of specifiers(src)) {
            const hit = resolveSpec(f, spec, ENG);
            if (!hit || seen.has(hit)) continue;
            seen.add(hit); edge.set(hit, { from: f, route, spec }); queue.push(hit);
        }
    }
    return { seen, edge };
}
const rel = (p) => path.relative(ENG, p).split(path.sep).join("/");
const chainTo = (R, absTarget) => {
    const hops = []; let c = absTarget;
    while (R.edge.has(c)) { hops.push(rel(c)); c = R.edge.get(c).from; }
    hops.push(rel(c));
    return hops.reverse().join(" -> ");
};

// =============================================================================================================
console.log("1. *** THE REACH, WALKED FORWARD FROM main.js WITH THE TREE'S OWN RESOLVER ***");
const R = reachFrom("main.js");
let stillUnreached = [];
{
    ok("main.js's reach is a real graph walk and not a number somebody typed",
       R.seen.size > 400, `${R.seen.size} modules reached, resolved by tools/ship/moduleRefs.mjs`);
    // *** DERIVED, NOT TYPED. *** The population is frozen and what this round closed is frozen; what is STILL
    // unreached is the DIFFERENCE, computed here. A third list would be a count beside the rows it totals.
    const closed = new Set(FD.CLOSED_AT_V4407);
    const reachedNow = FD.WEBGPU_STACK.filter((m) => R.seen.has(path.join(ENG, m)));
    stillUnreached = FD.WEBGPU_STACK.filter((m) => !R.seen.has(path.join(ENG, m)));
    console.log(`        the WebGPU/TSL population is ${FD.WEBGPU_STACK.length}; reached now ${reachedNow.length}; still outside ${stillUnreached.length}`);
    for (const m of FD.WEBGPU_STACK)
        console.log("          " + (R.seen.has(path.join(ENG, m)) ? "REACHED     " : "outside     ") + m);
    ok("*** gfx/device.js is reached from the front door, which it was not before this round ***",
       R.seen.has(path.join(ENG, "gfx/device.js")),
       chainTo(R, path.join(ENG, "gfx/device.js")) + " -- a dynamic import, which moduleRefs counts as a route");
    ok("...and exactly what CLOSED_AT_V4407 claims is closed, no more",
       reachedNow.length === closed.size && reachedNow.every((m) => closed.has(m)),
       `closed: ${reachedNow.join(", ")}. A round that connected one module and implied ten would be the ` +
       "shape this gate exists to refuse");
    ok("!! *** and the ratchet is on the DIFFERENCE: nine are still outside, and that may only shrink ***",
       stillUnreached.length === FD.WEBGPU_STACK.length - closed.size,
       `${stillUnreached.length} still outside: ${stillUnreached.join(", ")}. The TSL chain did NOT arrive ` +
       "with the device, and saying so is the point");
    ok("...and the reach grew by exactly what the module records",
       R.seen.size === FD.MAIN_REACH_AFTER_V4407 && FD.MAIN_REACH_BEFORE_V4407 < FD.MAIN_REACH_AFTER_V4407,
       `${FD.MAIN_REACH_BEFORE_V4407} before, ${R.seen.size} now -- the door, the device, and what the device ` +
       "imports that nothing else on this path did");
    GR.table("the WebGPU/TSL population and whether the front door reaches it",
             ["module", "reached from main.js"],
             FD.WEBGPU_STACK.map((m) => [m, R.seen.has(path.join(ENG, m)) ? "yes" : "no"]),
             `${R.seen.size} modules reached in total, walked with tools/ship/moduleRefs.mjs`);
}

// =============================================================================================================
console.log("\n2. WITHHELD IS NOT ABSENT, WHICH IS THE DISTINCTION detectBackends() CANNOT MAKE");
{
    const dev = fs.readFileSync(path.join(ENG, "gfx/device.js"), "utf8");
    ok("detectBackends really does decide on !!navigator.gpu alone",
       /out\.webgpu\s*=\s*\(typeof navigator[^;]*!!navigator\.gpu\)/.test(noComments(dev)),
       "so an undefined navigator.gpu is reported as webgpu:false whether the browser lacks it or the ORIGIN " +
       "was refused it, and requestDevice then falls through to webgl2 without saying which happened");
    const insecure = { secure: false, origin: "http://192.168.1.50:8787" };
    const secure = { secure: true, origin: "http://127.0.0.1:8787" };
    const a = FD.backendState({ webgpu: false, webgl2: true }, insecure);
    const b = FD.backendState({ webgpu: false, webgl2: true }, secure);
    const c = FD.backendState({ webgpu: true, webgl2: true }, insecure);
    ok("*** the same detected value reads WITHHELD on an insecure origin and ABSENT on a secure one ***",
       a.webgpu === FD.BACKEND_STATE.WITHHELD && b.webgpu === FD.BACKEND_STATE.ABSENT,
       `{webgpu:false} + insecure -> "${a.webgpu}"; the identical {webgpu:false} + secure -> "${b.webgpu}". ` +
       "One is an address to change and the other is a machine to replace");
    ok("...and a browser that HAS it reads present regardless of the origin's verdict",
       c.webgpu === FD.BACKEND_STATE.PRESENT,
       "the origin only explains an absence; it never contradicts a presence the browser actually reported");
    ok("*** and a fourth state exists because PRESENT was not the same as ANSWERED ***",
       FD.BACKEND_STATE.NO_DEVICE === "no-device" && Object.keys(FD.BACKEND_STATE).length === 4,
       "withheld / absent / present / no-device. The fourth was added when section 5 caught the door saying " +
       "there was nothing to explain over a downgrade it could see");
    ok("...and webgl2 is never called withheld, because no origin withholds it",
       a.webgl2 === FD.BACKEND_STATE.PRESENT && FD.backendState({ webgpu: true, webgl2: false }, insecure).webgl2 === FD.BACKEND_STATE.ABSENT,
       "SECURE_ONLY lists what a browser actually gates: " + FD.SECURE_ONLY.join(", "));
}

// =============================================================================================================
console.log("\n3. THE ORIGIN IS TAKEN FIRST, AND THE ORDER IS THE THING v4118 PAID FOR");
{
    const src = noComments(fs.readFileSync(path.join(HERE, "frontDoor.mjs"), "utf8"));
    const iOrigin = src.indexOf("originVerdict(w)"), iImport = src.indexOf('await import("./device.js")');
    ok("*** open() asks the ORIGIN before it imports a device, in source order ***",
       iOrigin > 0 && iImport > 0 && iOrigin < iImport,
       "reporting 'no WebGPU adapter' on a LAN address blames the machine for what the URL did. v4118's " +
       "voxtral.html Load button did nothing at all on the LAN and its gate could not see it, because the " +
       "gate served from localhost -- A SECURE CONTEXT");
    const lan = FD.originVerdict({ location: { hostname: "192.168.1.50", protocol: "http:", origin: "http://192.168.1.50:8787" }, isSecureContext: false });
    const loop = FD.originVerdict({ location: { hostname: "127.0.0.1", protocol: "http:", origin: "http://127.0.0.1:8787" }, isSecureContext: true });
    const https = FD.originVerdict({ location: { hostname: "swek.example", protocol: "https:", origin: "https://swek.example" }, isSecureContext: true });
    ok("a LAN address is insecure and the reason NAMES THE ADDRESS, not the hardware",
       lan.secure === false && /THE MACHINE AND THE GPU ARE FINE/.test(lan.why) && /192\.168\.1\.50/.test(lan.why),
       lan.why.slice(0, 120) + "...");
    ok("...and loopback and https are secure, with no reason to give",
       loop.secure === true && loop.why === null && https.secure === true && https.why === null &&
       loop.loopback === true && https.loopback === false,
       "127.0.0.1 is a loopback host; swek.example is https. Both get the secure-only APIs");
    ok("...and no window at all is reported as not-a-page rather than as insecure",
       FD.originVerdict(undefined).why === "no window.location -- this is not a page",
       "a Node caller is not an insecure origin, and conflating them would put a browser's excuse in a " +
       "gate's mouth");
}

// =============================================================================================================
console.log("\n4. *** LIVE, ON A NON-LOOPBACK ADDRESS -- THE ORIGIN THE ENGINE ACTUALLY SHIPS FROM ***");
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
const lanAddr = Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address)[0];
let liveRows = [];
if (skip || !lanAddr) {
    say("live halves SKIPPED -- " + (skip || "no non-loopback IPv4 address"));
    say("*** A SKIP, NOT A PASS: source cannot show what a browser hands out on the address Keith opens.");
    GR.skip("the live origin halves", skip || "no non-loopback IPv4 address on this box");
} else {
    const srv = http.createServer((rq, rs) => {
        const u = decodeURIComponent(String(rq.url).split("?")[0]);
        const f = path.join(ENG, u === "/" ? "/gfx-door-probe.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end("nf"); }
        const e = path.extname(f);
        rs.writeHead(200, { "Content-Type": e === ".js" || e === ".mjs" ? "text/javascript" : e === ".html" ? "text/html" : "application/octet-stream" });
        rs.end(fs.readFileSync(f));
    });
    await new Promise((r) => srv.listen(0, "0.0.0.0", r));
    const port = srv.address().port;
    const probe = `<!doctype html><title>door</title><body><pre id="o">…</pre><script type="module">
import * as FD from "/gfx/frontDoor.mjs";
const r = await FD.open({ canvas: document.createElement("canvas") });
document.getElementById("o").textContent = JSON.stringify({
  secure: window.isSecureContext, origin: r.origin.origin, state: r.state, detected: r.detected,
  ready: r.ready, backend: r.backend, why: r.why,
  diagnosis: r.diagnosis === null ? null : r.diagnosis }, null, 1);
window.__door = r;
</script></body>`;
    fs.writeFileSync(path.join(ENG, "gfx-door-probe.html"), probe);
    // TWO LAUNCHES, because the flag turns out to matter as much as the address -- see section 5.
    const bPlain = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const bFlag = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-unsafe-webgpu"] });
    const read = async (host, b = bPlain) => {
        const pg = await (await b.newContext()).newPage();
        const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.goto(`http://${host}:${port}/gfx-door-probe.html`, { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(900);
        const txt = await pg.evaluate(() => document.getElementById("o").textContent);
        await pg.close();
        let d = null; try { d = JSON.parse(txt); } catch { /* left null */ }
        return { d, errs, txt };
    };
    const lanR = await read(lanAddr);
    console.log(`        from http://${lanAddr}:${port} -> ` + (lanR.d ? `secure=${lanR.d.secure} webgpu=${lanR.d.state.webgpu} backend=${lanR.d.backend}` : "no parse: " + String(lanR.txt).slice(0, 80)));
    ok("the LAN origin is insecure, as it is for the real engine",
       !!lanR.d && lanR.d.secure === false, `http://${lanAddr}:${port}`);
    ok("*** and the door calls WebGPU WITHHELD there, naming the address rather than the adapter ***",
       !!lanR.d && lanR.d.state.webgpu === FD.BACKEND_STATE.WITHHELD &&
       /THE MACHINE AND THE GPU ARE FINE/.test(String(lanR.d.why)) && !/no WebGPU adapter/.test(String(lanR.d.why)),
       lanR.d ? String(lanR.d.why).slice(0, 150) + "..." : "no verdict");
    ok("...and it still opens a device rather than failing, so the page is not worse for asking",
       !!lanR.d && lanR.d.ready === true && lanR.d.backend === "webgl2",
       lanR.d ? `backend ${lanR.d.backend} -- requestDevice falls through, and now the fall is EXPLAINED` : "-");
    ok("...with no script error on the insecure origin",
       lanR.errs.length === 0, lanR.errs.join(" | ") || "clean");

    // =========================================================================================================
    console.log("\n5. *** AND THE SAME SERVER, THE SAME BROWSER, THE SAME GPU, FROM LOOPBACK ***");
    const loopR = await read("127.0.0.1");
    console.log(`        from http://127.0.0.1:${port} -> ` + (loopR.d ? `secure=${loopR.d.secure} webgpu=${loopR.d.state.webgpu} backend=${loopR.d.backend}` : "no parse"));
    // The API fact and the answered fact are read from DIFFERENT fields on purpose: `detected` is what the
    // browser handed out, `state` is what the door concluded. Asserting the first on `state` is what made the
    // first draft of this check go stale the moment the door learned to diagnose.
    ok("*** loopback is secure and the WebGPU API IS handed out there -- one server, two origins ***",
       !!loopR.d && loopR.d.secure === true && loopR.d.detected && loopR.d.detected.webgpu === true &&
       !!lanR.d && lanR.d.detected && lanR.d.detected.webgpu === false,
       "the same machine, the same server, the same adapter: navigator.gpu EXISTS from 127.0.0.1 and is " +
       "UNDEFINED from the LAN address. THE ADDRESS IS THE WHOLE DIFFERENCE, which is what v4118 measured and " +
       "what a gate serving only localhost cannot see");
    // *** THIS CHECK IS WHY THE DOOR HAS A FOURTH STATE, AND IT CAUGHT THE DOOR LYING. *** Its first draft
    // asserted loopback opens WebGPU "with nothing to explain". It does not: the API is there, the origin may
    // use it, and gfx/device.js still hands back webgl2 -- so the door reported why:null over a downgrade
    // sitting in plain view. PRESENT is a fact about the API; ANSWERED is a fact about the pipeline. The door
    // now diagnoses which of four steps stopped it and names that step instead.
    ok("*** on loopback WebGPU is present and STILL does not answer, and the door names the step ***",
       !!loopR.d && loopR.d.ready === true && loopR.d.state.webgpu === FD.BACKEND_STATE.NO_DEVICE &&
       loopR.d.diagnosis && loopR.d.diagnosis.step === "adapter" && /did not answer at the "adapter" step/.test(String(loopR.d.why)),
       loopR.d ? `backend ${loopR.d.backend}, stopped at "${loopR.d.diagnosis && loopR.d.diagnosis.step}". ` +
                 "MY OWN PROSE GUESSED \"canvas\" HERE AND THE MEASUREMENT SAID \"adapter\" -- navigator.gpu " +
                 "exists and requestAdapter() returns null. Same fallback to webgl2, a third distinct reason" : "-");

    // =========================================================================================================
    console.log("\n5b. *** AND THE SAME ORIGIN AGAIN WITH ONE LAUNCH FLAG, WHICH IS A THIRD ANSWER ***");
    const flagR = await read("127.0.0.1", bFlag);
    console.log(`        from http://127.0.0.1:${port} with --enable-unsafe-webgpu -> ` +
                (flagR.d ? `secure=${flagR.d.secure} webgpu=${flagR.d.state.webgpu} backend=${flagR.d.backend}` : "no parse"));
    ok("*** one launch flag turns 'no adapter' into an adapter, on the SAME origin and the SAME box ***",
       !!flagR.d && flagR.d.detected && flagR.d.detected.webgpu === true &&
       flagR.d.state && flagR.d.state.webgpu !== FD.BACKEND_STATE.NO_DEVICE,
       "--enable-unsafe-webgpu is what tools/ship/webgpuHarness.mjs's LAUNCH_ARGS carries, which is why a " +
       "compute dispatch there returns real numbers while this probe without it gets nothing. SO \"NO ADAPTER\" " +
       "IS A STATEMENT ABOUT THE LAUNCH, NOT ONLY ABOUT THE ADDRESS");
    ok("!! *** three reasons a WebGPU device does not arrive, on one machine, and detectBackends() can name none of them ***",
       [lanR, loopR, flagR].every((r) => r && r.d && r.d.state) &&
       lanR.d.state.webgpu === FD.BACKEND_STATE.WITHHELD &&
       loopR.d.state.webgpu === FD.BACKEND_STATE.NO_DEVICE &&
       flagR.d.state.webgpu !== loopR.d.state.webgpu,
       // *** REPORTED, NOT THROWN, AND SABOTAGE F IS WHY. *** This line read lanR.d.state.webgpu directly.
       // When the door was sabotaged into importing node:fs the page could not load it, every live read came
       // back with d === null, and this template THREW -- so the gate died here and SECTION 6 NEVER RAN,
       // which is the section whose whole subject is that node: import. One stack trace where six named
       // failures and a seventh belonged. v4399's sabotage A taught this tree the same thing.
       [lanR, loopR, flagR].every((r) => r && r.d)
           ? `LAN -> ${lanR.d.state.webgpu} (the address); loopback -> ${loopR.d.state.webgpu} at the ` +
             `"${loopR.d.diagnosis && loopR.d.diagnosis.step}" step (the launch); loopback + flag -> ` +
             `${flagR.d.state.webgpu}. detectBackends() reports webgpu:false for the first two and cannot ` +
             "tell them apart, and the third differs from the second by a command-line argument"
           : "one or more live reads returned nothing to parse -- see the FAILs above for which");
    ok("...and that is NOT the LAN's failure, which is the address and not the adapter",
       !!lanR.d && !lanR.d.diagnosis && lanR.d.state && lanR.d.state.webgpu === FD.BACKEND_STATE.WITHHELD,
       "the LAN never reaches an adapter question: the API is withheld before there is anything to ask for");
    ok("!! *** the two origins DISAGREE, which is what makes section 4 a measurement and not a tautology ***",
       !!lanR.d && !!loopR.d && lanR.d.state && loopR.d.state && lanR.d.state.webgpu !== loopR.d.state.webgpu &&
       String(lanR.d.why) !== String(loopR.d.why),
       lanR.d && loopR.d && lanR.d.state && loopR.d.state ? `LAN: ${lanR.d.state.webgpu} vs loopback: ${loopR.d.state.webgpu}. Both fall back to ` +
         `${loopR.d.backend} and THE REASONS ARE DIFFERENT, which is the whole distinction this round is about` : "-");
    liveRows = [["loopback + --enable-unsafe-webgpu", String(flagR.d && flagR.d.secure), String(flagR.d && flagR.d.state.webgpu),
                 String(flagR.d && flagR.d.backend), String(flagR.d && flagR.d.diagnosis && flagR.d.diagnosis.step)],
                ["LAN " + lanAddr, String(lanR.d && lanR.d.secure), String(lanR.d && lanR.d.state.webgpu),
                 String(lanR.d && lanR.d.backend), String(lanR.d && lanR.d.diagnosis && lanR.d.diagnosis.step)],
                ["loopback 127.0.0.1", String(loopR.d && loopR.d.secure), String(loopR.d && loopR.d.state.webgpu),
                 String(loopR.d && loopR.d.backend), String(loopR.d && loopR.d.diagnosis && loopR.d.diagnosis.step)]];
    GR.table("one server, two origins, in a real browser",
             ["origin", "isSecureContext", "webgpu state", "backend the door opened", "step that stopped webgpu"], liveRows,
             "the adapter here is swiftshader, so this says which BACKEND answered and never how fast");
    await bPlain.close(); await bFlag.close(); srv.close();
    try { fs.unlinkSync(path.join(ENG, "gfx-door-probe.html")); } catch { /* already gone */ }
}

// =============================================================================================================
console.log("\n6. THE DOOR IS BROWSER-PURE, AND main.js NO LONGER ADVERTISES WHAT IT DOES NOT USE");
{
    const doorReach = reachFrom("gfx/frontDoor.mjs");
    // *** READ THE SOURCE, NOT specifiers()'s OUTPUT, AND A SABOTAGE IS WHY THIS CHECK EXISTS TWICE. *** Its
    // first draft scanned [...specifiers(src)] for a spec matching /^node:/ -- and moduleRefs.specifiers()
    // NEVER EMITS ONE. Measured directly: given `import fs from "node:fs"; import x from "./y.js";` it yields
    // exactly [{spec:"./y.js"}]. It reports resolvable specifiers, which is the right job for a reference
    // graph and the wrong tool for this question, so the check could not fail and sabotage F read six reds
    // from the LIVE sections and none from the one whose whole subject it was. A CHECK THAT CANNOT FAIL IS
    // NOT A CHECK -- v2494's mutation lesson, in my own file, one round after v4405 hit the same shape.
    const specs = [];
    const IMPORT_NODE = /(?:^|[\s;{(])(?:import|export)[^;]*?["']node:[^"']+["']|import\s*\(\s*["']node:[^"']+["']/g;
    for (const f of doorReach.seen) {
        let src = ""; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        for (const hit of noComments(src).match(IMPORT_NODE) || []) specs.push(rel(f) + " -> " + hit.trim().slice(0, 60));
    }
    ok("*** nothing the door reaches imports a node: module, which is what lets a page import it ***",
       specs.length === 0,
       `${doorReach.seen.size} modules reachable from the door: ${[...doorReach.seen].map(rel).join(", ")}` +
       (specs.length ? " -- OFFENDERS: " + specs.join("; ") : "") +
       ". v4400's first fix reached node:fs from a page and browserNodeGuard went red inside one verify");
    const mj = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    ok("main.js opens the door, and lazily, which is its own idiom",
       /await import\("\.\/gfx\/frontDoor\.mjs"\)/.test(mj) && /window\.gfx\s*=/.test(mj),
       "123 other await import() sites in this file; a dynamic import still counts as a route to moduleRefs");
    ok("*** and the line that said \"this browser HAS WebGPU\" now points at something that uses it ***",
       /window\.gfx\.open\(\) opens it/.test(mj) && !/HAS WebGPU — run/.test(mj),
       "it advertised a capability the front door reached none of; it now names the door, and the else branch " +
       "says whether an absence is the BROWSER or the ADDRESS");
}

// ---- v4407 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
//    gfx/frontDoor.mjs   0ed5971512b7176d9e5ed2004c1f2e14
//    main.js             c451077457ed9075bfa49a44046fa23d
//
//   A  the origin check moved to AFTER the device import        -> 1 RED: the source-order check.
//   B  WITHHELD collapsed back into ABSENT                      -> 4 RED, including the live LAN reading and
//      the three-reasons check. This is the round's whole claim and four checks hold it.
//   C  the NO_DEVICE state never set, so PRESENT covers a
//      downgrade again -- the exact dishonesty the gate found   -> 2 RED.
//   D  main.js's import of the door replaced with another
//      module's, so the REACH falls back to what it was         -> 5 RED: device.js unreached, the closed set
//      empty, the ratchet's difference wrong, the reach count, and the door's own wiring.
//   E  CLOSED_AT_V4407 claims the whole stack arrived           -> 2 RED: the closed set and the ratchet. A
//      round that connected one module and implied ten fails here, which is what that check is for.
//   F  the door imports node:fs, as v4400's first fix did       -> 10 RED including the purity check by name.
//
// *** AND F TOOK THREE ATTEMPTS, BECAUSE IT FOUND TWO DEFECTS IN THIS GATE BEFORE IT FOUND THE ONE IT WAS
// AIMED AT. ***
//
//   The first attempt read 6 RED and the purity check was not among them. THE CHECK COULD NOT FAIL: it scanned
//   moduleRefs.specifiers() output for a spec matching /^node:/, and specifiers() NEVER EMITS ONE. Measured
//   directly -- given `import fs from "node:fs"; import x from "./y.js";` it yields exactly [{spec:"./y.js"}].
//   It reports RESOLVABLE specifiers, which is the right job for a reference graph and the wrong tool for this
//   question. The check reads the source text now.
//
//   The second attempt still did not fire it, because THE GATE THREW BEFORE REACHING SECTION 6. With the door
//   unloadable every live read came back null and a template literal dereferenced `.state` on it -- one stack
//   trace where six named failures and a seventh belonged, and the section whose whole subject was that
//   node: import never ran. v4399's sabotage A taught this tree the same lesson; it is written down again here
//   because a gate that dies is a gate that reports one thing.
//

GR.skip("the TSL chain from the front door",
        "nine of the ten named modules are still outside the reach and the gate says the number. Routing " +
        "render/tslSource.mjs and an effect through the door is its own round; this one opens the device");
GR.skip("any timing", "the adapter reachable here is google/swiftshader, a software rasteriser. Every number " +
        "in these tables is a backend name or a boolean, never a rate");
GR.note("The reach numbers are walked with the tree's own resolver at run time, not read from a record.");
{
    const w = GR.write();
    console.log("\n  ----  gate report: " + (w.written ? "written to " + w.file : w.why) +
                ` -- ${w.doc.tables.length} tables, ` +
                `${w.doc.tables.reduce((n, t) => n + t.rows.length * t.columns.length, 0)} cells`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER ANYTHING IS DRAWN. This round opens the device from the front door and " +
    "reports honestly which backend answered; it renders nothing new, and the default render path is untouched " +
    "on purpose -- on the origin the engine ships from there is no WebGPU to render with, and rerouting the " +
    "front door before saying that out loud would make the LAN worse to fix the localhost. Also unchecked: the " +
    "nine remaining modules, named above rather than counted; and whether a real GPU behaves as swiftshader " +
    "does, which nothing in this container can ask.");
process.exit(fails ? 1 : 0);
