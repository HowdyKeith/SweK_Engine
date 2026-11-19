// WebGLEngine/tools/ship/subAquariumGpuSwitch-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subAquariumGpuSwitch-selfcheck.mjs      (about 15 s; headless Chromium with WebGPU on its software adapter; with no browser or no adapter the live half is SKIPPED and said so)
//
// THE GATE OF sub-aquarium.html's "fly circuit on the GPU" switch (PART B of "A TANK PILOT TYPE ON THE DEVICE, ONE TICK LATE", brain/RESERVOIR_GPU_WIP.md). The pilot type itself is gated by
// render/subAquariumFlyCxGpu-selfcheck.mjs; this gate drives the page:
//   1 THE SOURCE   the switch is a checkbox, OFF by default; the CPU type is registered first and stays the default; a device that cannot be had falls back to it and says so.
//   2 LIVE         with the champions offered: on, the line says how many fly-circuit subs are on the GPU and how late (a number of ticks), and if later than 4 ticks, that this is later than was
//                  measured; off, the CPU type again and the line says so; no page error either way.
// SAID PLAINLY: on this box's software adapter in a headless shell the subs run tens of ticks late (47 to 71 when this gate was written), far beyond the 4 ticks PART A measured; the gate does
// not assert a lateness, only that the page reports it, and says the beyond-measured line when it applies.
// SABOTAGE LOG (each broken in sub-aquarium.html, run, restored; red = failing rows):
//   C1 the switch checked by default 4 | C2 off does not re-register the CPU type 1 | C3 the beyond-measured words dropped 1 | C4 the line never reports 2 | C5 the GPU kind never registered 2
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
console.log("subAquariumGpuSwitch-selfcheck -- the page's switch to fly the fly-circuit subs on the GPU\n");

sec("1. THE SOURCE");
const raw = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
{
    ok("!! the switch is a checkbox and OFF by default (no checked attribute); it starts disabled until the page knows there is WebGPU", /<input type="checkbox" id="gpuFly" disabled>/.test(raw) && !/id="gpuFly"[^>]*checked/.test(raw));
    ok("!! the CPU type is registered first and handed to the switch, which re-registers it on the way off and on any failure (the CPU type stays the default)", /tank\.registerPilotKind\(fx\.CIRCUIT, cpuKind\);\s*mountGpuSwitch\(circuit, cpuKind\);/.test(raw) && /const off = \(why\) => \{ tank\.registerPilotKind\("flycx", cpuKind\);/.test(raw) && /catch \(e\) \{ off\("the GPU is not available here/.test(raw));
}

sec("2. LIVE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_), skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) console.log("  live half SKIPPED -- " + skip + " (a skip, not a pass)");
    else {
        const B = require_(path.join(ENG, "ai-bridge/subAquariumBridge.js")), bridge = B.createBridge({ root: ENG }), types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
        const server = http.createServer((req, res) => {
            const sendJson = (o, c = 200) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
            if (bridge.owns(req.url)) return bridge.handle(req, res, { sendJson, isTrusted: () => true }).catch((e) => sendJson({ ok: false, error: String(e) }, 500));
            const fp = path.join(ENG, decodeURIComponent(req.url.split("?")[0]));
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: [...webglLaunchArgs().args, "--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-webgpu-adapter=swiftshader"] });
        try {
            const pg = await b.newPage(), errs = []; pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
            await pg.goto("http://127.0.0.1:" + server.address().port + "/sub-aquarium.html", { waitUntil: "load" });
            const hasGpu = await pg.evaluate(async () => !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null)));
            if (!hasGpu) console.log("  live half SKIPPED -- this browser offers no WebGPU adapter (a skip, not a pass)");
            else {
                await pg.waitForFunction(() => !document.getElementById("gpuFly").disabled, null, { timeout: 15000 }).catch(() => {});
                const def = await pg.$eval("#gpuFly", (e) => ({ checked: e.checked, disabled: e.disabled }));
                ok("!! the switch is off when the page has loaded, and usable once the fly kind is registered on a browser with WebGPU", def.checked === false && def.disabled === false, JSON.stringify(def));
                await pg.click("#seedBtn"); await pg.waitForFunction(() => /offered/.test(document.getElementById("msg").textContent), null, { timeout: 10000 }).catch(() => {});
                await pg.check("#gpuFly");
                await pg.waitForFunction(() => /ticks late/.test(document.getElementById("msg").textContent), null, { timeout: 20000 }).catch(() => {});
                const on = await pg.textContent("#msg"), m = /(\d+) fly-circuit subs? on the GPU, (\d+) to (\d+) ticks late/.exec(on);
                ok("!! on: the line says how many fly-circuit subs are on the GPU and how late, in ticks", !!m && Number(m[1]) >= 1 && Number(m[2]) >= 1, on);
                ok("!! later than 4 ticks is said to be later than was measured; 4 or fewer is not", !!m && (Number(m[3]) > 4) === /later than the 4 ticks that were measured/.test(on));
                await pg.uncheck("#gpuFly"); await pg.waitForTimeout(300);
                ok("!! off: the CPU type again, and the line says so", /fly on the CPU again/.test(await pg.textContent("#msg")) && !(await pg.$eval("#gpuFly", (e) => e.checked)));
                ok("!! no page or console error, on or off", errs.length === 0, errs.join(" | ").slice(0, 300));
            }
        } finally { await b.close(); server.close(); }
    }
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
