// WebGLEngine/ev/esCombat.js — Endless Sky NPC combat-objective tracker. Sits under esMissions.js and
// turns a mission's `npc` blocks into live combat goals: it spawns the mission's ships when the player
// reaches the right system, watches combat events (destroy / disable / board / scan / capture / assist /
// provoke), and decides when each NPC has SUCCEEDED or FAILED so the mission can complete or fail.
//
//   const trk = createNpcTracker(uni, store, { runBlock, toast, onDialog });
//   trk.armMission(rec);                       // rec = { name, node } from esMissions on accept
//   const ships = trk.onSystemEnter(sysId, {x,y}, opts);   // spawn this mission's NPCs here; add to scene
//   trk.recordEvent(entity, "destroy");        // called from the flight view when combat resolves
//   trk.onPlayerJump(fromSysId, toSysId);      // resolves `evade` (they got away) / drops off-system ships
//   trk.missionReady(name);  trk.missionFailed(name);       // esMissions gates completion on these
//
// ES NPC objective grammar (tokens on the `npc` line): kill / board / assist / disable / capture /
// provoke add a *succeed* event that must happen to every ship; `save` fails the mission if any ship is
// destroyed; `evade` needs every ship to leave; `accompany` needs every ship to survive and arrive with
// you; `scan cargo` / `scan outfits` need a scan. An NPC with no objective is flavor — it never blocks.
//
// Faithful for: kill / save / evade / accompany / board / disable and their `on <trigger>` side effects,
// system + `to spawn` gating, named / inline / multi-count fleets, explicit ships. Honest approximations
// (the sim doesn't model these yet, so they resolve on best-available signal): `accompany` is satisfied
// if the ships weren't destroyed by arrival (no cross-system escort flight); `evade` resolves when the
// player jumps out with the ships alive; `scan` / `capture` / `assist` / `provoke` are recorded when the
// flight layer reports the event, and left pending until it does.

"use strict";

function kids(n, key) { const o = []; if (n && n.children) for (const c of n.children) if (c.tokens[0] === key) o.push(c); return o; }
function kid(n, key) { if (n && n.children) for (const c of n.children) if (c.tokens[0] === key) return c; return null; }

// npc.tokens after "npc" carry the objective flags. Robust to the two-word scan flags arriving either as
// one token ("scan outfits") or as two ("scan","outfits").
function parseObjectives(npcNode) {
    const toks = npcNode.tokens.slice(1);
    const joined = toks.join(" ");
    const succeed = new Set();
    let failOnDestroy = false, mustEvade = false, mustAccompany = false;
    if (/scan outfits/.test(joined)) succeed.add("scanOutfits");
    if (/scan cargo/.test(joined)) succeed.add("scanCargo");
    for (let i = 0; i < toks.length; i++) {
        switch (toks[i]) {
            case "kill": succeed.add("destroy"); break;
            case "board": succeed.add("board"); break;
            case "assist": succeed.add("assist"); break;
            case "disable": succeed.add("disable"); break;
            case "capture": succeed.add("capture"); break;
            case "provoke": succeed.add("provoke"); break;
            case "save": failOnDestroy = true; break;
            case "evade": mustEvade = true; break;
            case "accompany": mustAccompany = true; break;
            // "scan"/"outfits"/"cargo" handled by the joined test above
        }
    }
    return { succeed, failOnDestroy, mustEvade, mustAccompany };
}

// Pull the concrete ship specs out of an npc block: explicit `ship "Model" "Name"`, named/counted
// `fleet "Name" [count]`, and inline `fleet { … variant … }`. Government defaults to the npc's.
function parseShipSpecs(npcNode, npcGovt) {
    const specs = [];
    for (const c of (npcNode.children || [])) {
        if (c.tokens[0] === "ship") {
            const model = c.tokens[1]; if (!model) continue;
            specs.push({ kind: "ship", model, name: c.tokens[2] || null, government: npcGovt });
        } else if (c.tokens[0] === "fleet") {
            if (c.tokens[1] != null && !(c.children && c.children.length)) {
                specs.push({ kind: "fleet", fleet: c.tokens[1], count: +c.tokens[2] || 1, government: npcGovt });
            } else if (c.children && c.children.length) {
                specs.push({ kind: "fleet", fleetNode: c, count: 1, government: npcGovt });
            }
        }
    }
    return specs;
}

// hint the spawner uses to pick a team: things you protect are friends; things you attack are foes.
function objectiveHint(obj) {
    if (obj.failOnDestroy || obj.mustAccompany || obj.succeed.has("assist")) return "friend";
    if (obj.succeed.has("destroy") || obj.succeed.has("disable") || obj.succeed.has("board") || obj.succeed.has("capture")) return "foe";
    return undefined;   // scan / evade / provoke: let govt stance decide
}

function createNpcTracker(uni, store, hooks = {}) {
    const runBlock = hooks.runBlock || (() => {});     // (node, ctx) -> apply an `on <trigger>` action block
    const evalTest = hooks.evalTest || (() => true);   // (node) -> boolean, evaluate a `to spawn`/`to despawn`
    const toast = hooks.toast || (() => {});
    const rng = hooks.rng || Math.random;

    const byMission = new Map();   // missionName -> [npcRec,...]
    let curSystemId = null;

    const systemByName = new Map();
    for (const s of (uni.systems || [])) systemByName.set(s.name, s);

    // does the npc's `system`/`planet` filter allow the given system? bare name matches by name; a filter
    // block matches on government / attributes; absent filter = spawn wherever the mission is relevant.
    function systemAllows(npcRec, systemId) {
        const spec = npcRec.systemFilter;
        const sys = uni.systemById && uni.systemById[systemId];
        if (!spec || !sys) return spec ? false : true;
        if (spec.tokens.length >= 2 && !(spec.children && spec.children.length)) return sys.name === spec.tokens[1];
        for (const c of (spec.children || [])) {
            const k = c.tokens[0];
            if (k === "government") { const gn = (uni.govts[sys.govt] && uni.govts[sys.govt].name) || null; if (!c.tokens.slice(1).includes(gn)) return false; }
            else if (k === "attributes") { /* systems rarely carry attributes here; accept */ }
        }
        return true;
    }

    function armMission(rec) {
        const list = [];
        for (const npc of kids(rec.node, "npc")) {
            const govtNode = kid(npc, "government");
            const npcGovt = govtNode ? govtNode.tokens[1] : null;
            const obj = parseObjectives(npc);
            list.push({
                mission: rec.name, node: npc, obj,
                government: npcGovt,
                specs: parseShipSpecs(npc, npcGovt),
                systemFilter: kid(npc, "system"),
                toSpawn: kid(npc, "to spawn"),
                toDespawn: kid(npc, "to despawn"),
                triggers: kids(npc, "on"),
                ships: [], spawned: false, succeeded: false, failed: false,
                _hint: objectiveHint(obj),
            });
        }
        if (list.length) byMission.set(rec.name, list);
        // an npc with no objective at all is non-blocking; pre-mark those succeeded
        for (const n of list) if (isTrivial(n)) n.succeeded = true;
        return list.length;
    }

    function isTrivial(n) {
        return !n.obj.failOnDestroy && !n.obj.mustEvade && !n.obj.mustAccompany && n.obj.succeed.size === 0;
    }

    // Spawn every armed NPC whose system filter + `to spawn` allow this system. Returns entities to add to
    // the flight scene; each carries `_npc` (back-ref) and `_missionName` so recordEvent can attribute it.
    function onSystemEnter(systemId, around, opts = {}) {
        curSystemId = systemId;
        const spawner = hooks.spawner;   // { spawnFleet, spawnShip } injected to avoid a hard import cycle
        if (!spawner) return [];
        const out = [];
        for (const list of byMission.values()) for (const n of list) {
            if (n.spawned || n.succeeded || n.failed) continue;
            if (!systemAllows(n, systemId)) continue;
            if (n.toSpawn && !evalTest(n.toSpawn)) continue;
            const ships = [];
            for (const spec of n.specs) {
                if (spec.kind === "ship") { const e = spawner.spawnShip(spec, uni, around, { ...opts, rng, objectiveHint: n._hint }); if (e) ships.push(e); }
                else { for (const e of spawner.spawnFleet(spec, uni, around, { ...opts, rng, objectiveHint: n._hint })) ships.push(e); }
            }
            for (const e of ships) { e._npc = n; e._missionName = n.mission; e._events = new Set(); }
            n.ships = ships; n.spawned = true;
            if (!ships.length) { if (isTrivial(n)) n.succeeded = true; }   // nothing to fly (missing art/data): don't wedge the mission
            for (const e of ships) out.push(e);
        }
        return out;
    }

    // Record a combat event against a ship entity. type: destroy|disable|board|scanCargo|scanOutfits|
    // capture|assist|provoke. Fires the matching `on <trigger>` block once, then re-checks the NPC.
    function recordEvent(entity, type) {
        const n = entity && entity._npc; if (!n) return null;
        if (!entity._events) entity._events = new Set();
        if (entity._events.has(type)) return null;   // once per ship per event
        entity._events.add(type);
        // ES trigger names line up with event names (kill uses trigger "kill", not "destroy")
        const trigName = type === "destroy" ? "kill" : type;
        const trg = n.triggers.find((t) => t.tokens[1] === trigName);
        if (trg) runBlock(trg, { name: n.mission });
        return reevaluate(n);
    }

    // Player jumped out of a system. `evade` targets left alive here "got away" (objective met). For
    // kill/board/disable/scan targets the player abandoned, tear their (now-despawned) ships down so they
    // re-encounter on return — ES keeps mission NPCs in their system. `accompany` ships are assumed to
    // travel with the player, so they're left in place. Off-system NPCs stop tracking in the new system.
    function onPlayerJump(fromSysId, toSysId) {
        for (const list of byMission.values()) for (const n of list) {
            if (!n.spawned || n.succeeded || n.failed) continue;
            const alive = n.ships.filter((s) => !s.dead);
            if (n.obj.mustEvade) {
                for (const s of alive) { if (!s._events) s._events = new Set(); s._events.add("evaded"); }
                reevaluate(n);
            } else if (n.obj.mustAccompany) {
                // stays with the player; a ship that died before the jump already failed it in recordEvent
                reevaluate(n);
            } else {
                // abandoned combat target: let it re-spawn when the player comes back to its system
                n.spawned = false; n.ships = [];
            }
        }
        curSystemId = toSysId;
    }

    // The player landed at the destination — resolve `accompany` (ships that survived came with you).
    function onArriveDestination() {
        for (const list of byMission.values()) for (const n of list) {
            if (!n.spawned || n.succeeded || n.failed || !n.obj.mustAccompany) continue;
            reevaluate(n);
        }
    }

    // Decide success / failure for one NPC from the events recorded on its ships. Mutates n.
    function reevaluate(n) {
        if (n.succeeded || n.failed) return n;
        const ships = n.ships;
        const anyDestroyed = ships.some((s) => s.dead || (s._events && s._events.has("destroy")));
        if (n.obj.failOnDestroy && anyDestroyed) { n.failed = true; onFail(n); return n; }
        if (n.obj.mustAccompany && anyDestroyed) { n.failed = true; onFail(n); return n; }

        // every succeed flag must have happened to every ship
        let succeedMet = true;
        for (const flag of n.obj.succeed) {
            for (const s of ships) {
                const got = (flag === "destroy") ? (s.dead || (s._events && s._events.has("destroy"))) : (s._events && s._events.has(flag));
                if (!got) { succeedMet = false; break; }
            }
            if (!succeedMet) break;
        }
        let evadeMet = true;
        if (n.obj.mustEvade) evadeMet = ships.every((s) => (s._events && (s._events.has("evaded") || s._events.has("destroy"))) || s.dead);
        let accompanyMet = true;
        if (n.obj.mustAccompany) accompanyMet = ships.length > 0 && ships.every((s) => !s.dead && !(s._events && s._events.has("destroy")));

        if (succeedMet && evadeMet && accompanyMet && (n.obj.succeed.size || n.obj.mustEvade || n.obj.mustAccompany)) {
            n.succeeded = true; onSucceed(n);
        }
        return n;
    }

    function onSucceed(n) { const done = kid(n.node, "on complete") || null; /* npc-level completes handled by mission */ }
    function onFail(n) { toast(`Mission failed: ${n.mission}`); }

    function missionReady(name) {
        const list = byMission.get(name);
        if (!list || !list.length) return true;   // no NPCs -> combat never blocks this mission
        return list.every((n) => n.succeeded) && !list.some((n) => n.failed);
    }
    function missionFailed(name) {
        const list = byMission.get(name);
        return !!(list && list.some((n) => n.failed));
    }
    function clearMission(name) { byMission.delete(name); }

    function npcState(name) {
        const list = byMission.get(name) || [];
        return list.map((n) => ({ objectives: [...n.obj.succeed, n.obj.failOnDestroy ? "save" : null, n.obj.mustEvade ? "evade" : null, n.obj.mustAccompany ? "accompany" : null].filter(Boolean),
            spawned: n.spawned, succeeded: n.succeeded, failed: n.failed, ships: n.ships.length, alive: n.ships.filter((s) => !s.dead).length }));
    }

    return { armMission, onSystemEnter, recordEvent, onPlayerJump, onArriveDestination, missionReady, missionFailed, clearMission, npcState,
        _byMission: byMission, parseObjectives, parseShipSpecs };
}

export { createNpcTracker, parseObjectives, parseShipSpecs, objectiveHint };
if (typeof module !== "undefined" && module.exports) module.exports = { createNpcTracker, parseObjectives, parseShipSpecs, objectiveHint };
