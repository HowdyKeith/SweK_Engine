// FILE: simulation/DungeonAI.js
//
// v1400 — lightweight CHASE + ATTACK AI for dungeon monsters. Reuses the dungeon's
// own 1=wall occupancy grid for BFS pathing (NavGrid dilates walls by a cell, which
// closes the 1-wide corridors here, so we path on the dungeon grid directly) and
// drives each monster entity via the supplied moveEntity(id,x,y,z,yaw).
//
// A few behaviour KINDS give variety on top of the model variety the dungeonMonster
// role pick already provides:
//   chaser  — wide aggro, rushes from across the room
//   lurker  — short aggro, ambushes when you get close
//   brute   — slow but big hits
//
//   const ai = makeDungeonAI({ GW, GH, isWall, cellToWorld, worldToCell, floorY,
//                              getPlayer, moveEntity, onHitPlayer });
//   ai.add(entityId, worldX, worldZ);   // on spawn
//   ai.update(dt);                       // each first-person tick
//   ai.clear();                          // on teardown / descend

import { WallFollower, dirToward } from "./wallFollow.mjs";   // v4187 -- a hand on the wall when the path is gone

const KINDS = {
    chaser: { aggro: 14, speed: 3.6, atkR: 1.7, dmg: 6,  cool: 0.8, flees: true },
    lurker: { aggro: 7,  speed: 3.0, atkR: 1.6, dmg: 5,  cool: 1.0, flees: true },
    brute:  { aggro: 10, speed: 2.4, atkR: 2.1, dmg: 11, cool: 1.5 },
    // v1416 — ranged kinds: fire a projectile on LOS at distance (still melee if cornered).
    archer: { aggro: 16, speed: 2.4, atkR: 1.5, dmg: 4, cool: 1.0, ranged: true, shootR: 11, shootDmg: 7,  shootCool: 1.6, proj: "arrow" },
    mage:   { aggro: 18, speed: 2.0, atkR: 1.4, dmg: 4, cool: 1.2, ranged: true, shootR: 13, shootDmg: 10, shootCool: 2.2, proj: "magic" },
    // v1431 — boss/champion: tanky, hits hard, melee + a ranged VOLLEY; enrages under 30% HP.
    boss:   { aggro: 24, speed: 2.6, atkR: 2.6, dmg: 14, cool: 1.5, ranged: true, shootR: 17, shootDmg: 9, shootCool: 2.2, proj: "magic", boss: true },
};
const KIND_CYCLE = ["chaser", "lurker", "brute", "archer", "mage"];

export function makeDungeonAI(opts) {
    const { GW, GH, isWall, cellToWorld, worldToCell, floorY,
            getPlayer, moveEntity, onHitPlayer, onRangedAttack, getHP } = opts;
    const mon = new Map();   // entityId -> state
    let _k = 0;

    function add(id, wx, wz, kindOverride) {
        const kind = kindOverride || KIND_CYCLE[_k++ % KIND_CYCLE.length];
        const spec = KINDS[kind] || KINDS.chaser;
        mon.set(id, { id, x: wx, z: wz, kind, spec, cool: 0, repath: 0, step: null, yaw: 0, aggroed: false });
        return kind;
    }
    function remove(id) { mon.delete(id); }
    function clear() { mon.clear(); _k = 0; }
    function count() { return mon.size; }

    // BFS from the monster cell toward the player cell over OPEN cells; returns the
    // FIRST step [gx,gz], or null if already there / unreachable (caller straight-lines).
    function bfsStep(sgx, sgz, tgx, tgz) {
        const startIdx = sgz * GW + sgx, goalIdx = tgz * GW + tgx;
        if (startIdx === goalIdx) return null;
        const seen = new Uint8Array(GW * GH); seen[startIdx] = 1;
        const prev = new Int32Array(GW * GH).fill(-1);
        const q = [startIdx]; let head = 0;
        const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        let found = false;
        while (head < q.length) {
            const cur = q[head++];
            if (cur === goalIdx) { found = true; break; }
            const cx = cur % GW, cz = (cur / GW) | 0;
            for (const [dx, dz] of NB) {
                const nx = cx + dx, nz = cz + dz;
                if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
                const ni = nz * GW + nx;
                if (seen[ni] || isWall(nx, nz)) continue;
                seen[ni] = 1; prev[ni] = cur; q.push(ni);
            }
        }
        if (!found) return null;
        let cur = goalIdx;
        while (prev[cur] !== startIdx) { cur = prev[cur]; if (cur < 0) return null; }
        return [cur % GW, (cur / GW) | 0];
    }

    // v1415 — line-of-sight over the wall grid (sample the world-space segment; blocked
    // if it crosses any wall cell). Monsters only WAKE when they can actually see you.
    function hasLOS(mx, mz, px, pz) {
        const dx = px - mx, dz = pz - mz;
        const dist = Math.hypot(dx, dz);
        const steps = Math.max(1, Math.ceil(dist / 0.4));
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const [cgx, cgz] = worldToCell(mx + dx * t, mz + dz * t);
            if (isWall(cgx, cgz)) return false;
        }
        return true;
    }
    function canSee(id) { const m = mon.get(id); const p = getPlayer && getPlayer(); if (!m || !p) return false; return hasLOS(m.x, m.z, p.x, p.z); }
    function aggro(id) { const m = mon.get(id); if (m) m.aggroed = true; }   // force-wake (e.g. when shot)
    function slow(id, secs) { const m = mon.get(id); if (m) m._slowT = Math.max(m._slowT || 0, secs); }   // v1428 — ice slow

    function update(dt) {
        const p = getPlayer && getPlayer(); if (!p) return;
        const [pgx, pgz] = worldToCell(p.x, p.z);
        for (const m of mon.values()) {
            const dxp = p.x - m.x, dzp = p.z - m.z;
            const dist = Math.hypot(dxp, dzp);
            m.cool = Math.max(0, m.cool - dt);
            if (m._slowT > 0) m._slowT -= dt;   // v1428 — ice grenade slow
            const enr = !!(m.spec.boss && getHP && getHP(m.id) != null && getHP(m.id) < 0.3);   // v1431 — boss enrage

            // aggro gate — wake only when the player is near AND in line-of-sight (no
            // sensing through walls); once provoked, chase around corners until they flee far.
            if (!m.aggroed) {
                if (dist <= m.spec.aggro && hasLOS(m.x, m.z, p.x, p.z)) m.aggroed = true;
                else continue;
            } else if (dist > m.spec.aggro * 1.8) {
                m.aggroed = false; continue;
            }

            // v1430 — flee: skittish kinds break off and retreat when badly hurt (<30% HP).
            if (m.spec.flees && getHP) {
                const hpf = getHP(m.id); 
                if (hpf != null && hpf < 0.3) {
                    let ux = m.x - p.x, uz = m.z - p.z, dn = Math.hypot(ux, uz) || 1;
                    // PATCH-B16 -- GPU Brain phase 12: flee along the NEGATED
                    // player-flow (ascend distance-to-player through corridors)
                    // blended 60/40 with straight-away. Straight-away corners
                    // fleeing monsters against walls; the negated field routes
                    // them out through openings. The existing slide fallback
                    // below remains the collision authority. No brain -> the
                    // original v1430 flee, unchanged.
                    if (typeof window !== "undefined" && window.sampleBrainPlayerFlow) {
                        const f = window.sampleBrainPlayerFlow(m.x, m.z);
                        if (f) {
                            const bx = 0.6 * (-f.x) + 0.4 * (ux / dn);
                            const bz = 0.6 * (-f.z) + 0.4 * (uz / dn);
                            const bn = Math.hypot(bx, bz);
                            if (bn > 1e-4) { ux = bx / bn; uz = bz / bn; dn = 1; }
                        }
                    }
                    const sp = m.spec.speed * (m._slowT > 0 ? 0.5 : 1) * dt;
                    const ax = (ux / dn) * sp, az = (uz / dn) * sp;
                    const tryMove = (sx, sz) => { const [ngx, ngz] = worldToCell(sx, sz); if (!isWall(ngx, ngz)) { m.x = sx; m.z = sz; return true; } return false; };
                    if (!tryMove(m.x + ax, m.z + az)) { if (!tryMove(m.x + az, m.z - ax)) tryMove(m.x - az, m.z + ax); }   // away, else slide
                    m.yaw = Math.atan2(-ux, uz);   // face away while fleeing
                    if (moveEntity) moveEntity(m.id, m.x, floorY + 1, m.z, m.yaw);
                    continue;
                }
            }

            // melee attack — in range + off cooldown
            if (dist <= m.spec.atkR) {
                if (m.cool <= 0) { m.cool = m.spec.cool * (enr ? 0.6 : 1); if (onHitPlayer) onHitPlayer(m.spec.dmg, m); }
                m.yaw = Math.atan2(dxp, -dzp);
                if (moveEntity) moveEntity(m.id, m.x, floorY + 1, m.z, m.yaw);
                continue;
            }

            // v1416 — ranged attack: archer/mage fire a projectile when in shooting range
            // (beyond melee) AND in line-of-sight; they KITE to keep their distance.
            if (m.spec.ranged) {
                m.shootCool = Math.max(0, (m.shootCool || 0) - dt);
                const seen = hasLOS(m.x, m.z, p.x, p.z);
                if (dist <= m.spec.shootR && m.shootCool <= 0 && seen) {
                    // PATCH-B22 -- GPU Brain phase 24: ranged cadence follows the
                    // brain's published boldness (same 1.55-0.9a curve as the
                    // raycaster v1.7), stacked on the enrage multiplier. No
                    // brain / stale map -> stock cadence, unchanged.
                    let cad22 = 1;
                    try {
                        const ag = (typeof window !== "undefined" && window.getBrainAggro) ? window.getBrainAggro("dgn-" + m.id) : null;
                        if (ag != null) cad22 = 1.55 - 0.9 * ag;
                    } catch {}
                    m.shootCool = m.spec.shootCool * (enr ? 0.6 : 1) * cad22;
                    m.yaw = Math.atan2(dxp, -dzp);
                    if (moveEntity) moveEntity(m.id, m.x, floorY + 1, m.z, m.yaw);
                    // PATCH-B17 -- brain-consulted projectile choice (PATCH-B9
                    // pattern): bosses and mages carry a two-attack repertoire
                    // (arrow: fast/low, magic: slow/high); the brain scores both
                    // from the same spec-driven features the kaiju use and its
                    // pick is honored when fresh. No brain -> spec.proj, stock.
                    let projPick = m.spec.proj;
                    m._projSrc = "rotation";   // PATCH-B18 -- provenance (spec default)
                    if ((m.spec.boss || m.kind === "mage") && typeof window !== "undefined" && window.getBrainAttack) {
                        try {
                            const rec = window.getBrainAttack("dgn-" + m.id);
                            if (rec?.name === "arrow" || rec?.name === "magic") {
                                projPick = rec.name;
                                m._projSrc = rec.explore ? "brain-explore" : "brain";   // PATCH-B18
                            }
                        } catch {}
                    }
                    if (onRangedAttack) onRangedAttack(m, m.spec.shootDmg, projPick);
                    continue;   // hold + fire this frame
                }
                // hold — don't crowd the player: once at a comfortable range with a clear
                // shot, stay put and keep firing (no free-move so it can't drift into a wall).
                if (seen && dist < m.spec.shootR * 0.6) {
                    m.yaw = Math.atan2(dxp, -dzp);
                    if (moveEntity) moveEntity(m.id, m.x, floorY + 1, m.z, m.yaw);
                    continue;
                }
            }

            // chase — BFS a step toward the player, advance toward that cell centre
            m.repath -= dt;
            const [mgx, mgz] = worldToCell(m.x, m.z);
            if (m.repath <= 0 || !m.step) {
                m.repath = 0.35;
                m.step = bfsStep(mgx, mgz, pgx, pgz);
                if (m.step) {
                    // the path is back: take the hand off the wall. The follower is DISCARDED rather than
                    // kept, or the next time the path is lost it would inherit this hunt's visited states
                    // and cry loop on its first honest step.
                    m.follow = null;
                } else {
                    // *** NO PATH. PUT A HAND ON THE WALL AND WALK. *** This is where a straight line at the
                    // player used to be -- a beeline that fired PRECISELY when a wall was in the way, which
                    // is how a monster ended up 17 frames deep inside solid stone. Refusing the move instead
                    // would only trade a monster that cheats for one standing at the wall waiting to be
                    // killed. Right-hand rule: turn right if you can, else straight, else left, else back.
                    if (!m.follow) m.follow = new WallFollower(dirToward(dxp, dzp));
                    const nx = m.follow.next(mgx, mgz, isWall);
                    if (nx) m.step = [nx.gx, nx.gz];
                    else {
                        // Walled in on all four sides, or the follower PROVED it is going in circles -- the
                        // right-hand rule's known limit, a detached pillar. Losing the player is a better
                        // answer than orbiting a column forever.
                        m.step = null; m.follow = null; m.aggroed = false; continue;
                    }
                }
            }
            // *** AND THERE IS NO STRAIGHT-LINE TARGET ANY MORE. *** With no step there is nothing legitimate
            // to walk toward; holding still for one frame is honest, and the next repath supplies one.
            if (!m.step) { if (moveEntity) moveEntity(m.id, m.x, floorY + 1, m.z, m.yaw); continue; }
            const _wc = cellToWorld(m.step[0], m.step[1]);
            let tx = _wc[0], tz = _wc[1];
            let ddx = tx - m.x, ddz = tz - m.z, dd = Math.hypot(ddx, ddz) || 1;
            // PATCH-B14 -- GPU Brain phase 11. When the local BFS found no
            // path (the straight-line case above), blend the brain's
            // player-seeking flow field 60/40 into the heading -- dungeon
            // walls are voxels, so the terrain-cost field routes corridors
            // the 8x8 BFS grid can't see. No brain -> no change, exactly
            // like the kaiju planner-failed hook (PATCH-B3).
            if (!m.step && typeof window !== "undefined" && window.sampleBrainPlayerFlow) {
                const f = window.sampleBrainPlayerFlow(m.x, m.z);
                if (f) {
                    const bx = 0.6 * f.x + 0.4 * (ddx / dd);
                    const bz = 0.6 * f.z + 0.4 * (ddz / dd);
                    const bn = Math.hypot(bx, bz);
                    if (bn > 1e-4) { ddx = bx / bn; ddz = bz / bn; dd = 1; }
                }
            }
            const adv = Math.min(dd, m.spec.speed * (m._slowT > 0 ? 0.5 : 1) * (enr ? 1.5 : 1) * dt);
            // *** THE MOVE IS COLLISION-TESTED, THE SAME WAY THE FLEE BRANCH ALREADY DID IT. *** This file
            // wrote a monster's position in exactly two places and only ONE of them checked isWall: fleeing
            // was careful, chasing was not. Move if the destination is open, else slide along the wall.
            const _ax = (ddx / dd) * adv, _az = (ddz / dd) * adv;
            const tryMove = (sx, sz) => { const [ngx, ngz] = worldToCell(sx, sz); if (!isWall(ngx, ngz)) { m.x = sx; m.z = sz; return true; } return false; };
            if (!tryMove(m.x + _ax, m.z + _az)) { if (!tryMove(m.x + _az, m.z - _ax)) tryMove(m.x - _az, m.z + _ax); }
            if (dd < 0.3) m.step = null;   // reached the step cell -> repath
            m.yaw = Math.atan2(ddx, -ddz);
            if (moveEntity) moveEntity(m.id, m.x, floorY + 1, m.z, m.yaw);
        }
    }

    // PATCH-B17 -- GPU Brain phase 13: expose the live AI so the snapshot
    // publisher can list ranged monsters in the brain roster.
    const api = { add, remove, clear, update, count, aggro, slow, canSee, monsters: mon, KINDS };
    if (typeof window !== "undefined") window._dungeonAI = api;
    return api;
}
