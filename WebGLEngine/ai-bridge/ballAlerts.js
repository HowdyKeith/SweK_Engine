// FILE: ai-bridge/ballAlerts.js
// VERSION: v1357 — the Ball alert system. Pulses a light (or light group) on
// selected engine events, with two routes (direct HA, or via an Alexa Echo),
// two pulse styles (a colour "blip" or a red "alarm"), per-event on/off + colour,
// and mode-C restore: capture the light's current colour/level, flash, then put
// it back — or, if "own the Ball" is on, re-assert a base colour every ~20s so
// the engine keeps ownership even if HA/another app changes it.
//
// Off-behaviour: if a target light is OFF, leaveOffIfOff skips it unless
// wakeForAlerts is set (then it lights up for the alert and goes back off after).
//
// Deps are injected (init) so this module doesn't import server.js:
//   callService(domain, service, data)   -> haBridge.callService
//   states(domainFilter)                 -> haBridge.states  (entities w/ state,rgb_color,brightness)
//   alexa(text, deviceId, mode)          -> server's alexaCommand
const fs = require("fs");
const path = require("path");

const CFG = path.join(__dirname, "ball.json");
const EVENTS = ["newEmail", "consoleError", "genDone", "arrival", "haAlert"];

const DEFAULT = {
    enabled: false,
    targets: ["light.ball"],          // light GROUP — every entity here pulses together
    route: "ha",                      // "ha" (direct) | "alexa" (via an Echo)
    alexaDevice: "Ball",              // spoken name used in the Alexa text command
    alexaEcho: "",                    // device_id of the Echo to issue the command through
    ownBall: false,                   // mode C: engine owns the Ball — re-assert baseColor
    baseColor: [60, 180, 120],
    reassertSec: 20,
    pulseMs: 1400,                    // how long the colour holds before restore
    offBehavior: { leaveOffIfOff: true, wakeForAlerts: false },
    events: {
        newEmail:     { on: true,  style: "blip",  color: [120, 200, 255] },
        consoleError: { on: false, style: "alarm", color: [255, 40, 40] },
        genDone:      { on: true,  style: "blip",  color: [140, 255, 170] },
        arrival:      { on: true,  style: "blip",  color: [255, 200, 90] },
        haAlert:      { on: false, style: "alarm", color: [255, 40, 40] },
    },
};

let _cfg = null;
let deps = { callService: null, states: null, alexa: null };
let reTimer = null;

function _read() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return {}; } }
function _merge(base, over) {
    const out = JSON.parse(JSON.stringify(base));
    for (const k of Object.keys(over || {})) {
        if (k === "events" && over.events) { for (const e of EVENTS) if (over.events[e]) out.events[e] = Object.assign({}, out.events[e], over.events[e]); }
        else if (k === "offBehavior" && over.offBehavior) out.offBehavior = Object.assign({}, out.offBehavior, over.offBehavior);
        else out[k] = over[k];
    }
    return out;
}
function getConfig() { if (!_cfg) _cfg = _merge(DEFAULT, _read()); return _cfg; }
function setConfig(patch) {
    _cfg = _merge(getConfig(), patch || {});
    if (Array.isArray(_cfg.targets)) _cfg.targets = _cfg.targets.map((x) => String(x).trim()).filter(Boolean);
    try { fs.writeFileSync(CFG, JSON.stringify(_cfg, null, 2)); } catch {}
    _startReassert();
    return _cfg;
}

async function pulse(style, color) {
    const c = getConfig();
    if (!c.enabled || !c.targets.length || !deps.callService) return { ok: false, reason: "disabled or no targets" };
    color = color || (style === "alarm" ? [255, 40, 40] : [120, 200, 255]);

    // Alexa route — fire-and-forget spoken command, no precise restore.
    if (c.route === "alexa") {
        if (!deps.alexa || !c.alexaEcho) return { ok: false, reason: "alexa route needs alexaEcho device_id" };
        const word = style === "alarm" ? "red" : "blue";
        try { deps.alexa(`turn the ${c.alexaDevice} ${word}`, c.alexaEcho, "devices"); } catch {}
        return { ok: true, route: "alexa" };
    }

    // HA route — capture state, flash, restore (mode C).
    let list = [];
    try { list = (await deps.states("light")) || []; } catch {}
    const byId = {}; list.forEach((s) => { byId[s.entity_id] = s; });
    const acted = [];
    for (const tgt of c.targets) {
        const st = byId[tgt];
        const isOff = st ? (st.state !== "on") : false;
        if (isOff && c.offBehavior.leaveOffIfOff && !c.offBehavior.wakeForAlerts) continue;
        acted.push({ tgt, wasOff: isOff, saved: st ? { state: st.state, rgb: st.rgb_color, bri: st.brightness } : null });
    }
    if (!acted.length) return { ok: true, acted: 0, reason: "all targets off (left off)" };

    const on = () => acted.forEach((a) => { try { deps.callService("light", "turn_on", { entity_id: a.tgt, rgb_color: color, brightness: 255 }); } catch {} });
    const off = () => acted.forEach((a) => { try { deps.callService("light", "turn_off", { entity_id: a.tgt }); } catch {} });
    const restore = () => acted.forEach((a) => {
        try {
            if (a.wasOff) { deps.callService("light", "turn_off", { entity_id: a.tgt }); return; }
            if (c.ownBall) { deps.callService("light", "turn_on", { entity_id: a.tgt, rgb_color: c.baseColor, brightness: 255 }); return; }
            if (a.saved && a.saved.state === "on") {
                const data = { entity_id: a.tgt };
                if (Array.isArray(a.saved.rgb)) data.rgb_color = a.saved.rgb;
                if (a.saved.bri != null) data.brightness = a.saved.bri;
                deps.callService("light", "turn_on", data);
            } else { deps.callService("light", "turn_off", { entity_id: a.tgt }); }
        } catch {}
    });

    if (style === "alarm") {
        on(); setTimeout(off, 200); setTimeout(on, 400); setTimeout(off, 600); setTimeout(on, 800);
        setTimeout(restore, Math.max(c.pulseMs, 1000));
    } else {
        on();
        setTimeout(restore, c.pulseMs);
    }
    return { ok: true, route: "ha", acted: acted.length };
}

function fire(event) {
    const c = getConfig();
    if (!c.enabled) return { ok: false, reason: "disabled" };
    const ev = c.events[event];
    if (!ev || !ev.on) return { ok: false, reason: "event off: " + event };
    return pulse(ev.style, ev.color);
}

function _startReassert() {
    if (reTimer) { clearInterval(reTimer); reTimer = null; }
    const c = getConfig();
    if (!c.enabled || !c.ownBall || !deps.callService) return;
    const ms = Math.max(5, c.reassertSec || 20) * 1000;
    reTimer = setInterval(() => {
        const cc = getConfig();
        if (!cc.enabled || !cc.ownBall) return;
        cc.targets.forEach((t) => { try { deps.callService("light", "turn_on", { entity_id: t, rgb_color: cc.baseColor, brightness: 255 }); } catch {} });
    }, ms);
}

function init(d) { deps = Object.assign(deps, d || {}); getConfig(); _startReassert(); }

module.exports = { init, getConfig, setConfig, fire, pulse, EVENTS };
