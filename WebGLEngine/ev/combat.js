// WebGLEngine/ev/combat.js — AI ships + combat resolution for the EV-compatible engine. Pure logic (the math is
// unit-tested); the flight view drives it each frame. AI ships reuse the same flight model as the player (turn
// toward target, thrust to close, fire when lined up) and the same FireControl/shot pipeline, so they fly and shoot
// by the mod's real ship + weapon stats. Hostility this round is simple: spawned ships are hostile to the player
// (govt-relationship-driven hostility is a later refinement, alongside guided/beam/turret weapons).
//
// Milestone 5c.

import { shipFlightStats } from "./flightModel.js";
import { FireControl } from "./shots.js";
import { resolveLoadout, govtStanceToPlayer, isGrudged } from "./evData.js";

// Heading (deg, 0 = up, +y down) that points from `from` at `to`.
function aimAngleTo(from, to) {
    const a = Math.atan2(to.x - from.x, -(to.y - from.y)) * 180 / Math.PI;
    return (a % 360 + 360) % 360;
}
// Shortest signed turn (deg, -180..180) from heading a to heading b.
function angleDiff(a, b) { let d = ((b - a) % 360 + 360) % 360; return d > 180 ? d - 360 : d; }

// Decide an AI ship's control input this frame: turn toward the target, thrust to close, fire when lined up + in
// range. Returns the same {turn, thrust} a player produces, plus firing. Pure.
function stepAI(ship, target, opts = {}) {
    const desired = aimAngleTo(ship, target), diff = angleDiff(ship.heading, desired);
    const dist = Math.hypot(target.x - ship.x, target.y - ship.y);
    const range = opts.range || 1400, standoff = opts.standoff || 140;
    return {
        turn: diff > 4 ? 1 : diff < -4 ? -1 : 0,
        thrust: Math.abs(diff) < 35 && dist > standoff,
        firing: Math.abs(diff) < 12 && dist < range,
    };
}

// Apply a shot's damage to a ship: shields absorb first, overflow spills to armor. Returns true if destroyed.
// (Simplified vs EV's separate shield/armor damage channels — refine later.)
function applyDamage(ship, dmgShield, dmgArmor) {
    const total = (dmgShield || 0) + (dmgArmor || 0);
    const s = (ship.shield || 0) - total;
    if (s < 0) { ship.armor = (ship.armor || 0) + s; ship.shield = 0; } else ship.shield = s;
    return (ship.armor || 0) <= 0;
}

// Which teams a shot can damage. Player shots spare friendly escorts; enemy (hostile) shots hit the player AND his
// escorts; escort (ally) shots hit hostiles; neutral traffic doesn't fire. The player's team is "player".
function shotHits(shotTeam, targetTeam) {
    if (shotTeam === "player") return targetTeam === "enemy" || targetTeam === "neutral";
    if (shotTeam === "enemy")  return targetTeam === "player" || targetTeam === "ally";
    if (shotTeam === "ally")   return targetTeam === "enemy";
    return false;
}

// Resolve all shots against the player + AI ships, team-aware (ship-vs-ship). Each shot damages the first opposing-team
// ship (or the player) it overlaps. Shooting neutral traffic provokes it - it turns hostile. Mutates ship hp; returns
// surviving shots + impact points + killed ships + player-hit/dead flags. Pure aside from the documented hp mutation.
function resolveHits(shots, player, enemies, hitRadius = 90) {
    const out = [], impacts = [], killed = [], provoked = []; let playerHit = false, playerDead = false;
    const rr = hitRadius * hitRadius;
    for (const sh of shots) {
        let consumed = false;
        if (player && shotHits(sh.team, "player")) {
            const dx = player.x - sh.x, dy = player.y - sh.y;
            if (dx * dx + dy * dy <= rr) { if (applyDamage(player, sh.dmgShield, sh.dmgArmor)) playerDead = true; playerHit = true; impacts.push({ x: sh.x, y: sh.y }); consumed = true; }
        }
        if (!consumed) {
            for (const e of enemies) {
                if (e.dead || !shotHits(sh.team, e.team || "enemy")) continue;
                const dx = e.x - sh.x, dy = e.y - sh.y;
                if (dx * dx + dy * dy <= rr) {
                    const dead = applyDamage(e, sh.dmgShield, sh.dmgArmor);
                    if (!dead && sh.team === "player" && (e.team || "enemy") === "neutral") { e.team = "enemy"; if (e.govt != null && e.govt >= 0) provoked.push(e.govt); }   // shoot a trader, it (and its govt) turns on you
                    impacts.push({ x: sh.x, y: sh.y }); if (dead) { e.dead = true; killed.push(e); } consumed = true; break;
                }
            }
        }
        if (!consumed) out.push(sh);
    }
    return { shots: out, impacts, killed, provoked, playerHit, playerDead };
}

// Regenerate a ship's shields toward max. rate is shieldRech field * scale (points/sec). Mutates.
function rechargeShield(ship, dt, scale = 0.03) {
    const max = ship.maxShield || 0;
    if (ship.shield < max) ship.shield = Math.min(max, ship.shield + (ship.shieldRech || 0) * scale * dt);
}

// Build one enemy entity from a ship class. Reuses the player's flight + firing stack.
function makeEnemy(cls, weapons, x, y, opts = {}) {
    const rnd = opts.rnd || Math.random;
    let loadout = resolveLoadout(cls, weapons || {});
    if (!loadout.length) { const w = Object.values(weapons || {})[0]; if (w) loadout = [{ weapon: w, count: 1 }]; }
    const shield = cls.shield > 0 ? cls.shield : 50, armor = cls.armor > 0 ? cls.armor : 50;
    return {
        cls, id: opts.id || 0, name: cls.name || "ship", x, y, vx: 0, vy: 0, heading: rnd() * 360,
        shield, armor, maxShield: shield, maxArmor: armor, shieldRech: cls.shieldRech || 0,
        stats: shipFlightStats(cls, opts), fc: new FireControl(loadout), team: opts.team || "enemy", govt: opts.govt != null ? opts.govt : -1, dead: false,
    };
}

// Weighted pick over an array of weights. Returns an index, or -1 if no positive weight. Pure (rnd injectable).
function weightedPick(weights, rnd) {
    let total = 0; for (const w of weights) total += (w > 0 ? w : 0);
    if (total <= 0) return -1;
    let r = rnd() * total;
    for (let i = 0; i < weights.length; i++) { const w = weights[i] > 0 ? weights[i] : 0; if ((r -= w) < 0) return i; }
    return weights.length - 1;
}

// Spawn a system's real dude mix instead of a generic all-hostile wing. Reads the system's DudeTypes (weighted by its
// %Prob), picks a dude, picks one of that dude's up-to-16 ship types (weighted by the dude's probabilities), and tags
// the ship with its govt + stance toward the player: hostile govts (pirates/xenophobes) attack; "never attacks" govts
// are friendly escorts; everyone else is neutral traffic that ignores a clean pilot. `system` = parsed syst record,
// `uni` = buildUniverse output (dudes/govts/shipById/weapons). Pure aside from rnd; returns an array of ship entities.
function spawnFromDudes(system, uni, around, opts = {}) {
    const rnd = opts.rnd || Math.random, out = [];
    if (!system || !uni || !uni.dudes) return out;
    const dudes = uni.dudes, govts = uni.govts || {}, shipById = uni.shipById || {}, fleets = uni.fleets || {};
    const now = opts.now != null ? opts.now : Date.now();

    // build one ship of class `shipId` flying under `govtId`, with the player-stance team (grudges force hostile)
    let _seq = 0;
    function mk(shipId, govtId) {
        const cls = shipById[shipId]; if (!cls) return null;
        const stance = govtStanceToPlayer(govts, govtId);
        let team = stance === "hostile" ? "enemy" : (stance === "friendly" ? "ally" : "neutral");
        if (isGrudged(uni, govtId, now)) team = "enemy";   // provoked recently - they remember across systems (until the grudge fades)
        const ang = rnd() * Math.PI * 2, r = (opts.minR || 1000) + rnd() * (opts.spread || 800);
        const e = makeEnemy(cls, uni.weapons || {}, around.x + Math.cos(ang) * r, around.y + Math.sin(ang) * r, { ...opts, id: ++_seq, rnd, govt: govtId != null ? govtId : -1, team });
        if (team !== "enemy") { e.vx = (rnd() - 0.5) * 40; e.vy = (rnd() - 0.5) * 40; }   // gentle drift so traffic isn't frozen
        return e;
    }

    // each sÿst DudeTypes slot is either a dude (128..639) or a flët group (-128..-383); weight by its %Prob
    const dt = system.dudeTypes || [], dp = system.probs || [], slots = [], slotW = [];
    for (let i = 0; i < dt.length; i++) {
        const id = dt[i], w = dp[i] > 0 ? dp[i] : 1;
        if (id >= 128 && id <= 639 && dudes[id]) { slots.push({ kind: "dude", id }); slotW.push(w); }
        else if (id <= -128 && id >= -383 && fleets[-id]) { slots.push({ kind: "fleet", id: -id }); slotW.push(w); }
    }
    if (!slots.length) return out;

    // EV: AvgShips is the average; the real number is +/- 50%. Cap the auto count for the sim's sake, but honor an
    // explicit opts.count (used by tests / scripted scenes) rather than truncating it to the default cap.
    const avg = system.avgShips > 0 ? system.avgShips : 3;
    const target = opts.count != null ? opts.count : Math.max(1, Math.min(opts.maxShips || 18, Math.round(avg * (0.5 + rnd()))));
    const cap = Math.max(opts.maxShips || 18, target);

    let guard = 0;
    while (out.length < target && guard++ < target * 3 + 24) {
        const si = weightedPick(slotW, rnd); if (si < 0) break;
        const slot = slots[si];
        if (slot.kind === "dude") {
            const dude = dudes[slot.id];
            let shipId = -1; const pi = weightedPick(dude.probs || [], rnd);
            if (pi >= 0 && dude.shipTypes[pi] >= 128) shipId = dude.shipTypes[pi];
            else { const f = (dude.shipTypes || []).find((x) => x >= 128); if (f != null) shipId = f; }
            const e = mk(shipId, dude.govt); if (e) out.push(e);
        } else {   // flët: a flagship + min..max of each escort type, all under the fleet's govt
            const fl = fleets[slot.id], gv = fl.govt;
            const lead = mk(fl.lead, gv); if (lead) out.push(lead);
            for (let k = 0; k < 4 && out.length < cap; k++) {
                const et = (fl.escorts || [])[k]; if (!(et >= 128)) continue;
                const lo = Math.max(0, (fl.min || [])[k] | 0), hi = Math.max(lo, (fl.max || [])[k] | 0);
                const num = lo + Math.floor(rnd() * (hi - lo + 1));
                for (let m = 0; m < num && out.length < cap; m++) { const e = mk(et, gv); if (e) out.push(e); }
            }
        }
    }
    return out.slice(0, cap);
}

// Spawn a wing of enemies in a ring around a point.
function spawnEnemies(classes, weapons, around, opts = {}) {
    const rnd = opts.rnd || Math.random, n = opts.count || 3, out = [];
    if (!classes || !classes.length) return out;
    for (let i = 0; i < n; i++) {
        const cls = classes[Math.floor(rnd() * classes.length) % classes.length];
        const ang = rnd() * Math.PI * 2, r = (opts.minR || 900) + rnd() * (opts.spread || 700);
        out.push(makeEnemy(cls, weapons, around.x + Math.cos(ang) * r, around.y + Math.sin(ang) * r, { ...opts, id: i + 1, rnd }));
    }
    return out;
}

export { aimAngleTo, angleDiff, stepAI, applyDamage, resolveHits, shotHits, rechargeShield, makeEnemy, spawnEnemies, spawnFromDudes, weightedPick };
