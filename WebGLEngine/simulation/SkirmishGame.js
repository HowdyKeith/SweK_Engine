// simulation/SkirmishGame.js — v1448
// A pure, render-free tactical skirmish engine for the "Testfire-style" 3D
// front-end prototype: an 8x8 grid, 4 war machines per side, alternating unit
// activations, with move / direct-fire / area-attack / push / ram.
//
// IMPORTANT (IP): these are ORIGINAL generic skirmish rules inspired by the
// mech-skirmish genre — NOT a copy of any published game's stat cards / values /
// rules. They exist to demo the engine as a 3D front-end; align them to a real
// ruleset only with that designer's permission.
//
// Everything here is deterministic + side-effect-free on the inputs except apply
// functions which mutate a passed game object, so it unit-tests cleanly in node.
//
// Commanders (this is how the three multiplayer answers plug in):
//   - a "commander" is  async (game, side) => plan   ({unitId, moveTo?, action?})
//   - heuristicCommander  : built-in AI               (smart-vs-client / vs-AI)
//   - llmCommander(fetch)  : an Ollama strategist      (smarter-vs-smarter)
//   - remoteCommander(...) : a peer SweK engine        (SweK-vs-SweK)
//   - perUnitCommander(map): different source per unit  (distributed enemy AI)

export const ARCHETYPES = {
    scout:   { name: "Scout",     hp: 6,  move: 4, weapon: { name: "Autocannon", type: "direct", range: 3, dmg: 2 } },
    trooper: { name: "Trooper",   hp: 9,  move: 3, weapon: { name: "Rifle",      type: "direct", range: 4, dmg: 3 } },
    heavy:   { name: "Heavy",     hp: 14, move: 2, weapon: { name: "Cannon",     type: "direct", range: 5, dmg: 5 } },
    arty:    { name: "Artillery", hp: 8,  move: 2, weapon: { name: "Mortar",     type: "area",   range: 6, dmg: 3, aoe: 1 } },
};
const SQUAD = ["scout", "trooper", "heavy", "arty"];

function key(x, y) { return x + "," + y; }
const cheby = (x0, y0, x1, y1) => Math.max(Math.abs(x0 - x1), Math.abs(y0 - y1));

function defaultTerrain(size) {
    if (size === 8) return [[3, 3], [4, 4], [2, 5], [5, 2]];   // original 8x8 layout, unchanged
    const feats = [], seen = new Set(), n = Math.max(4, Math.round(size * size / 14));
    let st = (size * 2654435761) % 2147483647; const rnd = () => (st = (st * 48271) % 2147483647) / 2147483647;
    const lo = 2, hi = size - 3;   // keep terrain clear of the deploy rows at each end
    for (let i = 0; i < n * 4 && feats.length < n; i++) {
        const x = lo + Math.floor(rnd() * (hi - lo + 1)), y = lo + Math.floor(rnd() * (hi - lo + 1));
        const k = x + "," + y; if (seen.has(k)) continue; seen.add(k); feats.push([x, y]);
    }
    return feats;
}
export function newGame(opts = {}) {
    const size = opts.size || 8;
    const terrain = new Set();
    // modular terrain: a few blocking features mid-board (mountains/trees), deterministic by seed.
    // Scales with the board so larger fields aren't empty (the 8x8 layout is preserved exactly).
    const feats = opts.terrain || defaultTerrain(size);
    for (const [x, y] of feats) terrain.add(key(x, y));

    const units = [];
    let uid = 0;
    const roster = opts.roster || null;   // optional {A:[{kind,name,hp,move,weapon}], B:[...]} — e.g. an imported game's real units
    const place = (side, row) => {
        const defs = roster ? roster[side] : SQUAD.map(k => ({ kind: k, name: ARCHETYPES[k].name, hp: ARCHETYPES[k].hp, move: ARCHETYPES[k].move, weapon: ARCHETYPES[k].weapon }));
        defs.forEach((d, i) => {
            const x = Math.min(size - 1, Math.floor((i + 0.5) * size / defs.length));   // spread evenly across the row (=>1,3,5,7 at size 8)
            const y = side === "A" ? row : (size - 1 - row);
            units.push({ id: "u" + (uid++), side, kind: d.kind, name: d.name || d.kind, x, y, hp: d.hp, maxHp: d.hp, move: d.move, weapon: { ...d.weapon }, activated: false });
        });
    };
    place("A", 0);
    place("B", 0);

    return { size, terrain, units, turnSide: "A", round: 1, log: [], winner: null };
}

export const alive = (u) => u && u.hp > 0;
export function unitAt(game, x, y) { return game.units.find(u => alive(u) && u.x === x && u.y === y) || null; }
export function unitById(game, id) { return game.units.find(u => u.id === id) || null; }
export const sideUnits = (game, side) => game.units.filter(u => u.side === side && alive(u));
export const activeUnits = (game, side) => game.units.filter(u => u.side === side && alive(u) && !u.activated);
function blocked(game, x, y) { return x < 0 || y < 0 || x >= game.size || y >= game.size || game.terrain.has(key(x, y)); }

// line of sight (Bresenham); blocked by terrain + intervening units (for direct fire)
export function los(game, x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    let x = x0, y = y0;
    while (!(x === x1 && y === y1)) {
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
        if (x === x1 && y === y1) break;
        if (game.terrain.has(key(x, y))) return false;
        if (unitAt(game, x, y)) return false;
    }
    return true;
}

// reachable cells within move (8-dir BFS, can't pass through blocked/occupied)
export function reachable(game, unit) {
    const out = new Map(); out.set(key(unit.x, unit.y), { x: unit.x, y: unit.y, cost: 0 });
    let frontier = [{ x: unit.x, y: unit.y, cost: 0 }];
    while (frontier.length) {
        const next = [];
        for (const c of frontier) {
            if (c.cost >= unit.move) continue;
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const nx = c.x + dx, ny = c.y + dy;
                if (blocked(game, nx, ny)) continue;
                if (unitAt(game, nx, ny)) continue;
                const k = key(nx, ny), cost = c.cost + 1;
                if (!out.has(k) || out.get(k).cost > cost) { out.set(k, { x: nx, y: ny, cost }); next.push({ x: nx, y: ny, cost }); }
            }
        }
        frontier = next;
    }
    out.delete(key(unit.x, unit.y));
    return [...out.values()];
}

// what a unit could do FROM a given cell (after moving there)
export function actionsFrom(game, unit, fx, fy) {
    const acts = [];
    const enemies = game.units.filter(u => alive(u) && u.side !== unit.side);
    const w = unit.weapon;
    if (w.type === "direct") {
        for (const e of enemies) if (cheby(fx, fy, e.x, e.y) <= w.range && los(game, fx, fy, e.x, e.y))
            acts.push({ type: "fire", unitId: unit.id, targetUnitId: e.id, dmg: w.dmg });
    } else if (w.type === "area") {
        const cells = new Set();
        for (const e of enemies) if (cheby(fx, fy, e.x, e.y) <= w.range) cells.add(key(e.x, e.y));
        for (const ck of cells) { const [cx, cy] = ck.split(",").map(Number);
            const hits = enemies.filter(e => cheby(cx, cy, e.x, e.y) <= (w.aoe || 1));
            acts.push({ type: "area", unitId: unit.id, cell: { x: cx, y: cy }, dmg: w.dmg, hits: hits.map(h => h.id) }); }
    }
    // melee: push / ram an ADJACENT enemy
    for (const e of enemies) if (cheby(fx, fy, e.x, e.y) === 1) {
        acts.push({ type: "push", unitId: unit.id, targetUnitId: e.id });
        acts.push({ type: "ram", unitId: unit.id, targetUnitId: e.id });
    }
    return acts;
}

function damage(game, u, amt, src) {
    u.hp = Math.max(0, u.hp - amt);
    game.log.push(`${src} hits ${u.name}(${u.side}) for ${amt} → ${u.hp}hp` + (u.hp <= 0 ? " (destroyed)" : ""));
}

// apply one unit's whole turn: optional move, then optional action, then end activation
export function applyTurn(game, plan) {
    if (game.winner) return game;
    const u = unitById(game, plan && plan.unitId);
    if (!u || !alive(u) || u.side !== game.turnSide || u.activated) { _endActivation(game, u); return game; }

    if (plan.moveTo && (plan.moveTo.x !== u.x || plan.moveTo.y !== u.y)) {
        const ok = reachable(game, u).some(c => c.x === plan.moveTo.x && c.y === plan.moveTo.y);
        if (ok) { u.x = plan.moveTo.x; u.y = plan.moveTo.y; }
    }
    const a = plan.action;
    if (a) {
        if (a.type === "fire") { const t = unitById(game, a.targetUnitId); if (t && alive(t)) damage(game, t, u.weapon.dmg, u.name); }
        else if (a.type === "area") { for (const e of game.units) if (alive(e) && e.side !== u.side && cheby(a.cell.x, a.cell.y, e.x, e.y) <= (u.weapon.aoe || 1)) damage(game, e, u.weapon.dmg, u.name + " mortar"); }
        else if (a.type === "push" || a.type === "ram") {
            const t = unitById(game, a.targetUnitId);
            if (t && alive(t) && cheby(u.x, u.y, t.x, t.y) === 1) {
                const dx = Math.sign(t.x - u.x), dy = Math.sign(t.y - u.y);
                const nx = t.x + dx, ny = t.y + dy;
                const free = !blocked(game, nx, ny) && !unitAt(game, nx, ny);
                if (a.type === "ram") { damage(game, t, 3, u.name + " ram"); damage(game, u, 1, "ram recoil"); }
                if (free) { t.x = nx; t.y = ny; } else { damage(game, t, 2, "crushed against obstacle"); }   // blocked push = collision dmg
            }
        }
    }
    _endActivation(game, u);
    return game;
}

function _endActivation(game, u) {
    if (u) u.activated = true;
    // win check
    const aAlive = sideUnits(game, "A").length, bAlive = sideUnits(game, "B").length;
    if (!aAlive || !bAlive) { game.winner = !aAlive ? "B" : "A"; return; }
    // hand to the other side if it still has un-activated units; else that side keeps going; else new round
    const other = game.turnSide === "A" ? "B" : "A";
    if (activeUnits(game, other).length) game.turnSide = other;
    else if (activeUnits(game, game.turnSide).length) { /* same side continues */ }
    else { game.units.forEach(x => x.activated = false); game.round++; game.turnSide = "A"; }
}

// ---- heuristic AI: pick a plan for `side` (chooses which unit + move + action) ----
export function heuristicPlan(game, side) {
    const mine = activeUnits(game, side);
    if (!mine.length) return null;
    const enemies = game.units.filter(u => alive(u) && u.side !== side);
    let best = null;

    for (const u of mine) {
        const froms = [{ x: u.x, y: u.y, cost: 0 }, ...reachable(game, u)];
        for (const c of froms) {
            const acts = actionsFrom(game, u, c.x, c.y);
            // score the best action available from this cell
            let act = null, aScore = 0;
            for (const a of acts) {
                let s = 0;
                if (a.type === "fire") { const t = unitById(game, a.targetUnitId); s = u.weapon.dmg + (t && t.hp <= u.weapon.dmg ? 6 : 0) + (10 - t.hp); }
                else if (a.type === "area") { s = (a.hits.length * u.weapon.dmg) + a.hits.length * 2; }
                else if (a.type === "ram") { const t = unitById(game, a.targetUnitId); s = 3 + (t && t.hp <= 3 ? 5 : 0) - 1; }
                else if (a.type === "push") s = 1;
                if (s > aScore) { aScore = s; act = a; }
            }
            // positional value: closer to nearest enemy is better when we can't shoot
            const dNear = enemies.length ? Math.min(...enemies.map(e => cheby(c.x, c.y, e.x, e.y))) : 99;
            const posScore = act ? 0 : Math.max(0, 8 - dNear);
            const total = aScore * 10 + posScore;
            if (!best || total > best.total) best = { total, unitId: u.id, moveTo: { x: c.x, y: c.y }, action: act };
        }
    }
    if (!best) { const u = mine[0]; return { unitId: u.id, moveTo: { x: u.x, y: u.y }, action: null }; }
    return { unitId: best.unitId, moveTo: best.moveTo, action: best.action };
}

// ---- commanders ----
export const heuristicCommander = () => async (game, side) => heuristicPlan(game, side);

// an Ollama strategist (smarter-vs-smarter): asks the LLM for a unit + move + target,
// validates it, and falls back to the heuristic on any miss. fetchFn defaults to window.fetch.
export function llmCommander(opts = {}) {
    const fetchFn = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
    const base = opts.ollamaBase || "/api";   // engine proxies /api/generate to Ollama
    return async (game, side) => {
        if (!fetchFn) return heuristicPlan(game, side);
        try {
            const mine = activeUnits(game, side).map(u => ({ id: u.id, kind: u.kind, x: u.x, y: u.y, hp: u.hp, range: u.weapon.range }));
            const foes = game.units.filter(u => alive(u) && u.side !== side).map(u => ({ id: u.id, kind: u.kind, x: u.x, y: u.y, hp: u.hp }));
            const prompt = `You command side ${side} in an 8x8 grid mech skirmish. Your units: ${JSON.stringify(mine)}. Enemies: ${JSON.stringify(foes)}. Choose ONE of your units to activate, a cell to move to (within its move range), and a target enemy id to attack. Reply ONLY compact JSON: {"unitId":"...","moveTo":{"x":N,"y":N},"targetUnitId":"..."}`;
            const r = await fetchFn(base + "/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, stream: false, options: { temperature: 0.4, num_predict: 80 } }) });
            const j = await r.json();
            const txt = (j && (j.response || j.text)) || "";
            const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error("no json");
            const d = JSON.parse(m[0]);
            const u = unitById(game, d.unitId);
            if (!u || u.side !== side || !alive(u) || u.activated) throw new Error("bad unit");
            const moveOk = d.moveTo && reachable(game, u).some(c => c.x === d.moveTo.x && c.y === d.moveTo.y);
            const moveTo = moveOk ? d.moveTo : { x: u.x, y: u.y };
            const acts = actionsFrom(game, u, moveTo.x, moveTo.y);
            const action = acts.find(a => a.targetUnitId === d.targetUnitId) || acts[0] || null;
            return { unitId: u.id, moveTo, action };
        } catch { return heuristicPlan(game, side); }   // LLM unavailable / malformed → heuristic
    };
}

// a remote SweK engine commander (SweK-vs-SweK): asks a peer/relay for this side's plan.
// The peer is expected to answer POST {game, side} -> {plan}. Falls back to heuristic.
export function remoteCommander(opts = {}) {
    const fetchFn = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
    const url = opts.url;   // e.g. "http://192.168.50.50:8787/skirmish/plan"
    return async (game, side) => {
        if (!fetchFn || !url) return heuristicPlan(game, side);
        try {
            const r = await fetchFn(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ side, game: serialize(game) }) });
            const j = await r.json();
            if (j && j.plan && j.plan.unitId) return j.plan;
            throw new Error("no plan");
        } catch { return heuristicPlan(game, side); }
    };
}

// distributed enemy AI: route each unit to its own commander (different engines/brains).
// map: { unitId: commander }. Falls back to heuristic for unmapped units.
export function perUnitCommander(map = {}) {
    return async (game, side) => {
        const mine = activeUnits(game, side);
        if (!mine.length) return null;
        // prefer a unit that has a dedicated commander
        const u = mine.find(x => map[x.id]) || mine[0];
        const cmd = map[u.id] || heuristicCommander();
        const plan = await cmd(game, side);
        // ensure the returned plan activates THIS unit (so each engine owns its unit)
        if (plan && plan.unitId === u.id) return plan;
        return heuristicPlan(game, side);
    };
}

// drive a full match (used for AI-vs-AI self-play + tests). onTurn(game, plan) per step.
export async function runMatch(game, commanders, { maxRounds = 40, onTurn } = {}) {
    let steps = 0;
    while (!game.winner && game.round <= maxRounds && steps < 2000) {
        const side = game.turnSide;
        const cmd = commanders[side];
        const plan = cmd ? await cmd(game, side) : heuristicPlan(game, side);
        if (!plan) { _endActivation(game, null); steps++; continue; }
        applyTurn(game, plan);
        if (onTurn) onTurn(game, plan);
        steps++;
    }
    return { winner: game.winner, round: game.round, steps };
}

// compact serializable snapshot (for the relay / remote commander)
export function serialize(game) {
    return { size: game.size, terrain: [...game.terrain], turnSide: game.turnSide, round: game.round, winner: game.winner,
        units: game.units.map(u => ({ id: u.id, side: u.side, kind: u.kind, x: u.x, y: u.y, hp: u.hp, activated: u.activated })) };
}
