"use strict";
// v1302 — bridge-side presence watcher. Two jobs, both opt-in (watch flag in
// presence-watch.json):
//   ROUTE presence to every connected display — on a people change it pushes an avatar
//   event (so the avatar greets / says bye on phone, pip-boy, Shield — anywhere an avatar
//   view is open) and broadcasts presence:person / presence:snapshot for any custom client.
//   ROOM OCCUPANCY drives action — on a room occupied/clear transition it broadcasts
//   presence:room AND fires any matching rule, which is just a control command the engine
//   already understands (demo:set / demo:next / console:exec / ...), reusing the same bus
//   the phone + Push2Run use.
const fs = require("fs"), path = require("path");
const CONFIG = path.join(__dirname, "presence-watch.json");

let cfg = { watch: false, rules: [], personRules: [
    // v1304 — example, pre-wired per the request: when Keith arrives AND Helga is away,
    // open the pip-boy on the Shield TV. url is relative so it resolves to this PC's LAN
    // address at fire time; edit names / Shield IP in the Presence panel. Only fires once
    // "Broadcast presence" is on. (Won't fire if a saved presence-watch.json already exists.)
    { match: "Keith", onArrive: { kind: "shield", url: "/pipboy-models.html", ip: "192.168.10.114" }, if: { person: "Helga", home: false } },
], avatars: {} };
try { if (fs.existsSync(CONFIG)) cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG, "utf8"))); } catch {}
function saveCfg() { try { fs.writeFileSync(CONFIG, JSON.stringify(cfg), { mode: 0o600 }); } catch {} }

let deps = null, timer = null, lastPeople = null, lastRooms = null, baseline = false, lastSnap = null, _curPeople = {};

// Run a rule action — either a control command on the engine bus, or open a page on the
// Shield TV (v1304). { cmd, args } => control;  { kind:"shield", ip, url } => Shield openUrl.
function runAction(act) {
    if (!act || !deps) return;
    if (act.kind === "shield" && act.url) {
        let url = act.url;
        if (!/^[a-z][a-z0-9+\-.]*:\/\//i.test(url)) url = (deps.lanBase || "") + (url.charAt(0) === "/" ? url : ("/" + url));   // resolve relative -> reachable LAN URL
        try { deps.shieldOpenUrl && deps.shieldOpenUrl(act.ip, url); } catch {}
        return;
    }
    if (act.kind === "ha" && act.entity_id && act.service) {                                  // v1306 — call an HA service (e.g. a camera spotlight)
        try { deps.haCall && deps.haCall(act.domain || String(act.entity_id).split(".")[0], act.service, act.entity_id); } catch {}
        return;
    }
    if (act.kind === "water") {                                                               // v1309 — run a watering zone for N seconds (auto-close + drives the avatar water visual)
        try { deps.waterStart && deps.waterStart(act.seconds || 30, act.zone || act.entity_id, act.entity_id); } catch {}
        return;
    }
    if (act.cmd) { try { deps.broadcast({ type: "control", cmd: act.cmd, args: act.args || {}, role: "commander", id: "presence", name: "Presence" }); } catch {} }
}

// Optional compound condition on a person rule: rule.if = { person, home }. Fires only if
// some currently-tracked person matching `person` is in the required home/away state. If
// that person can't be found, the condition is treated as NOT met (conservative).
function condOk(rule) {
    const c = rule && rule.if; if (!c || !c.person) return true;
    const want = !!c.home;
    for (const nm in _curPeople) { if (nm.toLowerCase().indexOf(String(c.person).toLowerCase()) >= 0) return (!!_curPeople[nm]) === want; }
    return false;
}

function applyRules(roomName, occupied) {
    if (!deps || !Array.isArray(cfg.rules)) return;
    for (const r of cfg.rules) {
        if (!r || !r.match) continue;
        if (String(roomName).toLowerCase().indexOf(String(r.match).toLowerCase()) < 0) continue;
        runAction(occupied ? r.onOccupied : r.onClear);
    }
}

// v1303/1304 — per-person rules: a specific person arriving / leaving runs an action,
// optionally gated by another person's state (rule.if).
function applyPersonRules(name, arrived) {
    if (!deps || !Array.isArray(cfg.personRules)) return;
    for (const r of cfg.personRules) {
        if (!r || !r.match) continue;
        if (String(name).toLowerCase().indexOf(String(r.match).toLowerCase()) < 0) continue;
        if (!condOk(r)) continue;
        runAction(arrived ? r.onArrive : r.onLeave);
    }
}

function announce(name, home) {
    try { deps.broadcast({ type: "presence:person", name, home: !!home }); } catch {}
    // v1305 — if this person has an assigned avatar, publish it so avatar views show THEM.
    if (home && cfg.avatars && cfg.avatars[name] && deps.setAvatar) { try { deps.setAvatar(cfg.avatars[name]); } catch {} }
    const title = home ? "\uD83C\uDFE0 " + name + " is home" : "\uD83D\uDC4B " + name + " left";
    const quip = home ? ("Welcome home, " + name + "!") : ("See you later, " + name + ".");
    try { deps.pushAvatarEvent({ kind: "toast", title, message: quip, level: "" }); } catch {}
    try { deps.pushAvatarEvent({ kind: "quip", text: quip }); } catch {}
}

async function tick() {
    if (!cfg.watch || !deps) return;
    let j; try { j = await deps.presence(); } catch { return; }
    if (!j || j.ok === false || !Array.isArray(j.people)) return;

    // people -> arrival / departure (routed everywhere via the avatar bus)
    const curP = {}; j.people.forEach(p => { curP[p.name] = !!p.home; });
    _curPeople = curP;                                       // current snapshot for rule conditions
    if (lastPeople && baseline) {
        for (const name in curP) { const was = lastPeople[name]; if (was === undefined) continue;
            if (!was && curP[name]) { announce(name, true); applyPersonRules(name, true); try { deps.onArrive && deps.onArrive(name); } catch {} }
            else if (was && !curP[name]) { announce(name, false); applyPersonRules(name, false); } }
    }
    lastPeople = curP;

    // rooms -> occupied/clear transitions drive rules + a presence:room broadcast
    const curR = {}; (j.rooms || []).forEach(r => { curR[r.name] = !!r.occupied; });
    if (lastRooms && baseline) {
        for (const name in curR) { const was = lastRooms[name]; if (was === undefined) continue;
            if (was !== curR[name]) { try { deps.broadcast({ type: "presence:room", name, occupied: curR[name] }); } catch {} applyRules(name, curR[name]); } }
    }
    lastRooms = curR;
    baseline = true;

    lastSnap = { homeCount: j.homeCount, awayCount: j.awayCount, rooms: j.rooms || [], people: (j.people || []).map(p => ({ name: p.name, home: p.home, zone: p.zone })), ts: Date.now() };
    try { deps.broadcast({ type: "presence:snapshot", homeCount: j.homeCount, awayCount: j.awayCount, rooms: lastSnap.rooms, people: lastSnap.people }); } catch {}
}

function start(d) { deps = d; if (timer) clearInterval(timer); timer = setInterval(tick, 10000); setTimeout(tick, 4000); }
function state() { return { ok: true, watch: !!cfg.watch, rules: cfg.rules || [], last: lastSnap }; }
function setWatch(on) { cfg.watch = !!on; saveCfg(); if (cfg.watch) { baseline = false; setTimeout(tick, 200); } return state(); }
function getRules() { return { ok: true, rules: cfg.rules || [] }; }
function setRules(rules) { if (Array.isArray(rules)) cfg.rules = rules.slice(0, 50); saveCfg(); return getRules(); }
function getPersonRules() { return { ok: true, rules: cfg.personRules || [] }; }
function setPersonRules(rules) { if (Array.isArray(rules)) cfg.personRules = rules.slice(0, 50); saveCfg(); return getPersonRules(); }
function getAvatars() { return { ok: true, avatars: cfg.avatars || {} }; }
function setAvatars(map) { if (map && typeof map === "object") cfg.avatars = map; saveCfg(); return getAvatars(); }

module.exports = { start, state, setWatch, getRules, setRules, getPersonRules, setPersonRules, getAvatars, setAvatars };
