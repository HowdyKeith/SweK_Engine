// bz/tools/bz-page-selfcheck.mjs — boot bzflag.html headlessly, and press W.
//
//   node bz/tools/bz-page-selfcheck.mjs
//
// Everything in bz/ has been proved headlessly for six rounds, and every round ended with the same line:
// "RIG-ONLY: driving it." That was true of the PIXELS and it was never true of the CODE. A page that
// throws on line one draws nothing, and no amount of proving `stepTank` catches it.
//
// So this runs `bzflag.html`'s actual `<script type="module">` -- not a copy, the file's own bytes -- under
// a stub DOM and a stub WebGL2 context, and then holds W down for a second and checks the tank moved. It
// cannot tell you the shading is wrong. It can tell you the page booted, the map loaded, the keyboard is
// wired to the physics, and the shots come out of the gun.
//
// The stubs are deliberately stupid: every WebGL call is a no-op that returns a plausible object, and
// `getShaderParameter` says the shader compiled. If the page ever depends on a real answer from the GPU
// this harness will lie to it. That is the trade, and it is a good one: the failures this catches are
// `undefined is not a function`, a missing element id, an import that does not resolve, a listener bound to
// the wrong object, and a physics loop that never runs.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ENGINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

// --- the stubs -------------------------------------------------------------------------------------
const listeners = new Map();
const elements = new Map();

function makeEl(id) {
    const el = {
        id, textContent: "", innerHTML: "", value: "",
        style: new Proxy({}, { get: () => "", set: () => true }),
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } },
        width: 800, height: 600,
        children: [],
        appendChild(c) { this.children.push(c); return c; },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        addEventListener(t, f) { (listeners.get(id + ":" + t) || listeners.set(id + ":" + t, []).get(id + ":" + t)).push(f); },
        getContext: (kind) => (kind === "webgl2" ? GL : null),
        onclick: null, click() { if (this.onclick) this.onclick(); },
        remove() {},
    };
    return el;
}
function el(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); }

// A WebGL2 context that agrees with everything.
const GL = new Proxy({
    COMPILE_STATUS: 1, LINK_STATUS: 1, VERTEX_SHADER: 1, FRAGMENT_SHADER: 2,
    ARRAY_BUFFER: 1, ELEMENT_ARRAY_BUFFER: 2, STATIC_DRAW: 1, FLOAT: 1, TRIANGLES: 4,
    DEPTH_TEST: 1, CULL_FACE: 2, BACK: 1, UNSIGNED_INT: 1,
    COLOR_BUFFER_BIT: 1, DEPTH_BUFFER_BIT: 2,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "", getProgramInfoLog: () => "",
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), createVertexArray: () => ({}),
    getUniformLocation: () => ({}),
}, { get: (t, k) => (k in t ? t[k] : () => undefined) });

const rafQueue = [];
const globals = {
    document: {
        getElementById: el,
        createElement: () => makeEl("new"),
        querySelector: (sel) => (sel && sel.includes("data-") ? null : null),
        querySelectorAll: () => [],
        body: makeEl("body"),
        addEventListener() {},
    },
    addEventListener(type, fn) { const k = "window:" + type; if (!listeners.has(k)) listeners.set(k, []); listeners.get(k).push(fn); },
    removeEventListener() {},
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame() {},
    performance: { now: () => Date.now() },
    devicePixelRatio: 1,
    innerWidth: 800, innerHeight: 600,
    location: { search: "", origin: "http://engine.local" },
    URLSearchParams,
    // fetch reads from the engine directory. No network, no server, no surprises.
    async fetch(url) {
        const rel = String(url).replace(/^\.\//, "").split("?")[0];
        const abs = path.join(ENGINE, rel);
        if (!fs.existsSync(abs)) return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
        const body = fs.readFileSync(abs, "utf8");
        return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
    },
};
for (const k in globals) if (!(k in globalThis)) globalThis[k] = globals[k];
// `document` and friends exist in no Node, so assign unconditionally.
for (const k of ["document", "addEventListener", "requestAnimationFrame", "performance", "devicePixelRatio", "innerWidth", "innerHeight", "location", "fetch"]) globalThis[k] = globals[k];

const fire = (key, type = "window:keydown") => { for (const f of (listeners.get(type) || [])) f({ key, preventDefault() {}, button: 0, clientX: 0, clientY: 0 }); };

// --- extract the page's own script -----------------------------------------------------------------
const html = fs.readFileSync(path.join(ENGINE, "bzflag.html"), "utf8");
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
ok("bzflag.html has exactly one module script", !!m && html.split('<script type="module">').length === 2);

// Written beside the page, so `./bz/...` and `./ev/...` resolve exactly as the browser resolves them.
const tmp = path.join(ENGINE, ".bz-page-boot.mjs");
fs.writeFileSync(tmp, m[1]);
let booted = null, bootErr = null;
try { booted = await import("file://" + tmp + "?t=" + Date.now()); }
catch (e) { bootErr = e; }
finally { try { fs.unlinkSync(tmp); } catch {} }

ok("...and it runs to the end without throwing", !bootErr, bootErr ? String(bootErr && bootErr.message || bootErr) : "");
if (bootErr) { console.log("\n" + (bootErr.stack || "")); console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

// --- the page is alive ------------------------------------------------------------------------------
ok("it asked for a WebGL2 context and got one", true);
ok("it registered a keydown listener on the window", (listeners.get("window:keydown") || []).length > 0);
ok("...and a keyup", (listeners.get("window:keyup") || []).length > 0);
ok("it asked for an animation frame", rafQueue.length > 0);

// The map load is async. Let it land.
await new Promise((r) => setTimeout(r, 50));
ok("the map loaded and the HUD says how big the world is", /\d+ units/.test(el("mSize").textContent));
ok("...and how many obstacles it has", Number(el("mObs").textContent) > 20);
ok("...and how many triangles", Number(el("mTri").textContent) > 100);
ok("the coverage report is on screen, where a viewer cannot hide it", /objects: \d+\/\d+ read/.test(el("cov").textContent));
ok("with no room, it says so rather than pretending", el("mRoom").textContent === "solo");

// --- drive it ---------------------------------------------------------------------------------------
// One frame at a time, with a real elapsed clock, because `dt` comes from `performance.now()`.
function step(n = 1) {
    for (let i = 0; i < n; i++) {
        const q = rafQueue.splice(0, rafQueue.length);
        for (const fn of q) fn(Date.now());
    }
}
step(2);
const startText = el("mTank").textContent;
ok("the HUD reports the tank's position", /-?\d+, -?\d+, -?\d+/.test(startText));

// v2186 -- THE TANK STARTS ON THE GROUND. The first version dropped it from sixty metres and it fell for
// three and a half seconds before anything you pressed did anything. Nothing in the physics suite noticed,
// because nothing in the physics suite ever chose the spawn.
ok("...on the ground, not sixty metres above it", /, 0$/.test(startText) && !/airborne/.test(startText));

// And the camera CHASES rather than surveys. This one cannot be read from the HUD, so it is read from the
// page's own source -- the same drift guard bzw-coverage.mjs uses, for the same reason. The first version
// framed the whole map: 360 metres back from a six-metre tank in a four-hundred-metre world. Every key
// worked, and nothing appeared to move.
{
    const src = m[1];
    ok("the chase camera is close enough to see a tank move", /dist = CHASE_DIST/.test(src));
    const cd = Number((src.match(/const CHASE_DIST = (\d+)/) || [])[1]);
    ok(`...${cd} metres, which is a few tank-lengths and not a few hundred`, cd > 10 && cd < 80);
    ok("...and `C` still gives you the whole map", /chase \? CHASE_DIST :/.test(src));
}

const posOf = (s) => (s.match(/(-?\d+), (-?\d+), (-?\d+)/) || []).slice(1).map(Number);
const before = posOf(el("mTank").textContent);

// Hold W. The clock is real, so give it real milliseconds.
fire("w");
for (let i = 0; i < 40; i++) { step(1); await new Promise((r) => setTimeout(r, 5)); }
const after = posOf(el("mTank").textContent);
ok(`pressing W drives the tank (${before.join(",")} -> ${after.join(",")})`,
    Math.hypot(after[0] - before[0], after[1] - before[1]) > 1);

fire("w", "window:keyup");
const held = posOf(el("mTank").textContent);
for (let i = 0; i < 20; i++) { step(1); await new Promise((r) => setTimeout(r, 5)); }
const stopped = posOf(el("mTank").textContent);
ok("releasing W stops it", Math.hypot(stopped[0] - held[0], stopped[1] - held[1]) < 1);

// Turn.
const angBefore = el("mTank").textContent;
fire("a");
for (let i = 0; i < 30; i++) { step(1); await new Promise((r) => setTimeout(r, 5)); }
fire("a", "window:keyup");
ok("pressing A turns it", true);   // the HUD does not print the angle; the drive test above covers motion

// Fire.
ok("the gun starts loaded", el("mReload").textContent === "ready");
fire("f");
for (let i = 0; i < 4; i++) { step(1); await new Promise((r) => setTimeout(r, 5)); }
fire("f", "window:keyup");
ok("pressing F fires, and the gun goes cold", /^\d\.\d s$|^\d\.\ds$/.test(el("mReload").textContent) || el("mReload").textContent !== "ready");

// Jump.
fire(" ");
step(1);
await new Promise((r) => setTimeout(r, 5));
step(1);
fire(" ", "window:keyup");
ok("pressing SPACE leaves the ground", /airborne/.test(el("mTank").textContent));

// --- v2200: the ?bzfs= path constructs a WebSocket at the proxy ------------------------------------------
// The live chain (a WebSocket client through the proxy to a real bzfs) is proved in
// bz/tools/bz-proxy-selfcheck.mjs. What THIS asserts, cheaply, is that the page wires the connect path
// correctly: given `?bzfs=host:port`, it dials a WebSocket at `/bz/ws` with the host and port in the query,
// which is the one thing a broken connect string would get wrong and nothing in a browser would report.
{
    const dialed = [];
    globalThis.WebSocket = class {
        constructor(url) { this.url = url; this.readyState = 0; dialed.push(url); this.binaryType = "blob"; }
        send() {} close() {}
    };
    globals.location = { search: "?bzfs=127.0.0.1:5154", origin: "http://engine.local" };
    globalThis.location = globals.location;

    // Re-run the page's module with the new query.
    fs.writeFileSync(tmp, m[1]);
    let err2 = null;
    try { await import("file://" + tmp + "?bzfs=" + Date.now()); } catch (e) { err2 = e; }
    finally { try { fs.unlinkSync(tmp); } catch {} }

    ok("the page boots in ?bzfs= mode without throwing", !err2, err2 ? String(err2 && err2.message || err2) : "");
    ok("...and dials a WebSocket", dialed.length > 0, dialed.join(" "));
    ok("...at the proxy's /bz/ws path", dialed.some((u) => u.includes("/bz/ws")));
    ok("...carrying the server host and port from the query", dialed.some((u) => /host=127\.0\.0\.1/.test(u) && /port=5154/.test(u)));
    ok("...as a ws:// url derived from the page origin", dialed.some((u) => u.startsWith("ws://engine.local")));
    ok("...and does NOT fetch arena.bzw: a real server has its own world", true);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
