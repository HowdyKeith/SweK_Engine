// ai-bridge/musterBridge.js -- convene a squad of brain bots into a LAN room and put on a skirmish, from the lobby.
//
// ev/esMuster.mjs plans the ownership split (who flies what, verified fair + complete before anything launches);
// this bridge is the hands: it spawns the actual brain pilots (brain/esPilot.mjs, one process per bot) pointed at a
// shared presence room, tracks them, and can dismiss them. Each pilot takes its rendezvous-hashed share of the
// system's hostiles with no coordinator, so adding bots just works. planMuster is ESM, so we reach it by dynamic
// import from this CJS bridge.
//
// dryRun spawns each pilot with --dry-run: it simulates a fight locally, touches no network, and exits -- which is
// how the skirmish orchestration is verified off-rig. A live muster (dryRun false) needs a running presence relay.
"use strict";

const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");                 // WebGLEngine/
const running = new Map();                               // botId -> { child, meta, startedAt, exitCode }

function squadIds(n, prefix) { prefix = prefix || "gpu"; return Array.from({ length: Math.max(1, n | 0) }, (_, i) => `${prefix}-${i + 1}`); }

// plan a muster without launching anything: the ownership split + the exact launch commands + a go/no-go.
async function plan(opts = {}) {
    const { planMuster } = await import("../ev/esMuster.mjs");
    const squad = opts.squad && opts.squad.length ? opts.squad : squadIds(opts.count || 4, opts.prefix);
    const npcCount = opts.npcCount || 40;
    const npcIds = Array.from({ length: npcCount }, (_, i) => "h" + i);
    return planMuster(squad, npcIds, { room: opts.room || "default", system: opts.system != null ? opts.system : 128, url: opts.url });
}

// launch the squad: one brain/esPilot.mjs per bot. Returns the roster of what came up.
async function launch(opts = {}) {
    const p = await plan(opts);
    if (!p.ok && !opts.force) return { ok: false, reason: "muster plan not viable (not complete/fair/viable)", plan: p };
    const room = p.room, system = p.system, url = opts.url || process.env.SWEK_PILOT_URL || "http://127.0.0.1:9999";
    const dry = !!opts.dryRun, roster = [];
    for (const id of p.squad) {
        if (running.has(id)) { roster.push({ id, already: true }); continue; }
        const env = Object.assign({}, process.env, { SWEK_PILOT_URL: url, SWEK_PILOT_ROOM: room, SWEK_PILOT_SYSTEM: String(system), SWEK_PILOT_ID: id, SWEK_PILOT_NPCS: String(opts.npcsPer || 8) });
        const args = ["brain/esPilot.mjs"]; if (dry) args.push("--dry-run");
        const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: "ignore", detached: false });
        const rec = { child, meta: { id, room, system, url, dry }, startedAt: Date.now(), exitCode: null };
        running.set(id, rec);
        child.on("exit", (code) => { rec.exitCode = code; rec.child = null; if (!dry) running.delete(id); });
        roster.push({ id, pid: child.pid, dry });
    }
    return { ok: true, room, system, url, launched: roster, plan: p };
}

function status() {
    const bots = []; for (const [id, r] of running) bots.push({ id, pid: r.child ? r.child.pid : null, alive: !!r.child && r.exitCode == null, dry: r.meta.dry, room: r.meta.room, system: r.meta.system, uptimeMs: Date.now() - r.startedAt, exitCode: r.exitCode });
    return { count: bots.length, alive: bots.filter(b => b.alive).length, bots };
}

function dismiss(id) {
    const kill = (r) => { try { if (r.child) r.child.kill("SIGTERM"); } catch {} };
    if (id) { const r = running.get(id); if (!r) return { ok: false, reason: "no such bot", id }; kill(r); running.delete(id); return { ok: true, dismissed: [id] }; }
    const ids = [...running.keys()]; for (const [, r] of running) kill(r); running.clear(); return { ok: true, dismissed: ids };
}

module.exports = { plan, launch, status, dismiss, squadIds };
