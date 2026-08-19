"use strict";
// v1616 — gossip name-resolution registry.
//
// The problem: on a Wi-Fi AP that isolates clients, UDP discovery beacons don't cross between boxes, so the
// radar/panel can only show peers by raw IP. mDNS names also don't propagate past the block.
//
// The fix: every bridge keeps a small ip -> { name, host, version, iid, lastSeen } registry. On each gossip
// tick it POSTs its WHOLE registry to every known peer's /gossip endpoint and merges what it gets back. Because
// each box shares everything it knows, names propagate transitively around the block: if A only talks to B and
// C only talks to B, then after a couple of ticks B knows {A,B,C} and hands the full set to both — so A learns
// C's name without ever reaching C directly. No hop counter needed; the set is bounded by the number of boxes.
//
// Bootstrap caveat: this needs ONE seed link per box (a saved peer, or a box on wired where the UDP beacon
// works). With zero links a box is an island and can't be gossiped to.

const fs = require("fs"), path = require("path"), os = require("os");
const CFG = path.join(os.homedir(), ".voxelbridge", "names.json");

let _reg = {};                       // ip -> entry
let _selfIid = "";
let _selfName = () => os.hostname();
let _selfIps = () => [];
let _selfVersion = "";

function _load() { try { const o = JSON.parse(fs.readFileSync(CFG, "utf8")); if (o && o.reg && typeof o.reg === "object") _reg = o.reg; } catch {} }
function _save() { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify({ reg: _reg })); } catch {} }
_load();

function init(opts) {
    opts = opts || {};
    if (opts.iid) _selfIid = String(opts.iid);
    if (typeof opts.name === "function") _selfName = opts.name;
    if (typeof opts.ips === "function") _selfIps = opts.ips;
    if (opts.version) _selfVersion = String(opts.version);
    _registerSelf();
}

// (Re)stamp this box's own LAN IPs -> our current name. Called on init and before every read, since the
// editable mDNS name can change at runtime. Self entries are marked src:"self" so a stale gossip entry can
// never overwrite our own name.
function _registerSelf() {
    const now = Date.now();
    let name = ""; try { name = _selfName() || os.hostname(); } catch { name = os.hostname(); }
    let ips = []; try { ips = _selfIps() || []; } catch {}
    for (const ip of ips) {
        if (!ip) continue;
        _reg[String(ip)] = { ip: String(ip), name: String(name).slice(0, 64), host: os.hostname(), version: _selfVersion, iid: _selfIid, lastSeen: now, src: "self" };
    }
    _save();
}

// Merge incoming entries; freshest lastSeen wins. Our own self entries are never clobbered by a remote one.
function upsert(entries) {
    if (!Array.isArray(entries)) return 0;
    const now = Date.now(); let changed = 0;
    for (const e of entries) {
        if (!e || !e.ip) continue;
        const ip = String(e.ip);
        const cur = _reg[ip];
        if (cur && cur.src === "self") continue;                 // never let gossip overwrite our own identity
        const ls = Number(e.lastSeen) || now;
        if (!cur || ls > (cur.lastSeen || 0)) {
            _reg[ip] = {
                ip, name: String(e.name || "").slice(0, 64), host: String(e.host || "").slice(0, 64),
                version: String(e.version || "").slice(0, 16), iid: String(e.iid || "").slice(0, 40),
                lastSeen: ls, src: "gossip",
            };
            changed++;
        }
    }
    if (changed) _save();
    return changed;
}

function all() { _registerSelf(); return Object.values(_reg); }   // refresh self (name may have changed) then dump
function digest() { return { entries: all() }; }
function resolve(ip) { const e = _reg[String(ip)]; return e ? e.name : ""; }

// drop gossip entries we haven't heard about in a while (self entries are kept forever).
function prune(maxAgeMs) {
    const cut = Date.now() - (maxAgeMs || 7 * 864e5); let n = 0;
    for (const k of Object.keys(_reg)) { if (_reg[k].src !== "self" && (_reg[k].lastSeen || 0) < cut) { delete _reg[k]; n++; } }
    if (n) _save();
    return n;
}

module.exports = { init, upsert, all, digest, resolve, prune, _registerSelf };
