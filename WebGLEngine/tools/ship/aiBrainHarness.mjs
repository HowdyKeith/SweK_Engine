// WebGLEngine/tools/ship/aiBrainHarness.mjs -- v4605
//
// A minimal DOM/global stub that lets ai/aiBrain.js -- a page script with DOM/WebSocket side effects at module
// TOP LEVEL, not a class -- import for real in plain Node, so tools/ship/aiHuntBrain-selfcheck.mjs can drive
// its actual (never-exported) aiTick() rather than a re-implementation of it. See that gate's own header for
// why this exists instead of a class-shaped mock the way the four prior migrations' gates used.
//
// WHAT MAKES THIS SAFE TO KEEP SMALL: aiBrain.js's render() loop is only ever reached through
// requestAnimationFrame(render) -- stubbed here as a no-op that never actually invokes its callback -- so this
// harness never needs a real 2D canvas context; render() (and the ctx calls inside it) simply never runs.
// aiTick() itself is captured, not scheduled: this module intercepts the module's own `setInterval(aiTick,
// 250)` call and returns the callback reference instead of a real timer, so the gate can invoke it exactly
// when it wants to, with exactly the world state it wants active. WebSocket is stubbed the same way -- the
// stub's addEventListener capture is how the gate drives the real, private ingestState() path with a
// synthetic bridge:state frame, the same message shape the VBA bridge actually sends over the wire.
"use strict";

function makeStubElement() {
    return {
        textContent: "", innerHTML: "", value: "",
        style: {}, classList: { add() {}, remove() {}, toggle() {} },
        clientWidth: 800, clientHeight: 600, width: 0, height: 0,
        addEventListener() {}, removeEventListener() {},
        // Real DOM appendChild inserts a node; this stub only ever receives leaf `<div>...</div>` cards built
        // via innerHTML (aiBrain.js's own updateSidePanel()/renderThinkLog() pattern), so concatenating their
        // markup onto the parent's innerHTML is a faithful-enough stand-in for what the gate inspects.
        appendChild(child) { this.innerHTML += child.innerHTML ?? ""; },
        remove() {},
        getContext() { return stubCtx; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    };
}
const stubCtx = {
    fillStyle: "", strokeStyle: "", font: "", textAlign: "", lineWidth: 1, globalAlpha: 1,
    clearRect() {}, fillRect() {}, fillText() {}, strokeText() {},
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
    setLineDash() {}, createRadialGradient() { return { addColorStop() {} }; },
};

let mounted = null;

/**
 * Install the stub globals (idempotent -- a second call returns the same mounted handle rather than
 * re-importing, since ES module top-level side effects only ever run once per process regardless) and import
 * the real ai/aiBrain.js. Returns { mod, elements, driveTick, sendState }:
 *   mod        -- the module's real exports (enemyDecideEvent, SEEK_DIST, ATTACK_DIST)
 *   elements   -- id -> stub element, keyed exactly as aiBrain.js's own document.getElementById() calls are
 *   driveTick  -- () => void, calls the REAL captured aiTick() synchronously
 *   sendState  -- (state) => void, feeds a synthetic bridge:state frame through the REAL ingestState() path
 */
export async function mount() {
    if (mounted) return mounted;

    const elements = {};
    globalThis.document = {
        getElementById(id) { return elements[id] || (elements[id] = makeStubElement()); },
        querySelector() { return makeStubElement(); },
        querySelectorAll() { return []; },
        createElement() { return makeStubElement(); },
    };
    globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
    globalThis.requestAnimationFrame = () => 0;   // never invokes -- render() intentionally never runs, see header

    let capturedTick = null;
    const realSetInterval = globalThis.setInterval.bind(globalThis);
    globalThis.setInterval = (fn, ms) => {
        // aiTick's own `setInterval(aiTick, DECIDE_INTERVAL_MS)` is the FIRST 250ms interval the module
        // registers (module top-to-bottom order); the sim-stats-refresh interval near the bottom of the file
        // is also 250ms but registers second, so it falls through to a real (harmless) timer here.
        if (ms === 250 && !capturedTick) { capturedTick = fn; return 0; }
        return realSetInterval(fn, ms);
    };

    let wsListeners = null;
    globalThis.WebSocket = class {
        constructor() { wsListeners = {}; }
        addEventListener(type, fn) { wsListeners[type] = fn; }
    };
    globalThis.location = { protocol: "http:", host: "localhost" };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

    const mod = await import("../../ai/aiBrain.js");

    if (!capturedTick) throw new Error("aiBrainHarness: aiTick's setInterval(...,250) was not captured -- did aiBrain.js's decide-loop wiring change shape?");
    if (!wsListeners) throw new Error("aiBrainHarness: WebSocket was never constructed -- did aiBrain.js's connect() change shape?");

    mounted = {
        mod, elements,
        driveTick: () => capturedTick(),
        sendState: (state) => wsListeners.message({ data: JSON.stringify({ type: "bridge:state", state }) }),
    };
    return mounted;
}
