// demos_code/aquarium.js — underwater terrarium
// VERSION: v3 — round 420 (algae-on-glass + grazing snails)
//
// A glass-tank demo. Different creatures with different AI styles all
// share the same volume:
//
//   • Sea monkey schools — Reynolds-style flocking like boids.js,
//     tight separation, weaker cohesion, fast direction changes.
//     Mass quantity, small size — they're the swarm.
//   • Jellyfish — slow vertical drift via sinusoidal bob. No flocking;
//     they just waft.
//   • Shark — slow patrol loop around the tank periphery. Aggro
//     state when a sea monkey comes within strike range; lunges and
//     scatters the school.
//   • Mini-kaiju — a "decorative aquarium ornament" parked on the
//     tank floor. v2 (round 406): periodically fires a radial BLAST
//     that scatters monkeys; monkeys caught at the blast EDGE pick up
//     a fading "firefly" glow effect (GPU particles around them).
//   • Night fish (v2) — slow drifters that carry their own lure
//     light: a steady stream of bright GPU particles emitted from
//     their head. Reads as a glowing anglerfish dragging a lantern
//     through the dark, especially visible at night.

const TANK_Y          = 30;
const TANK_HEIGHT     = 40;
const HOME_RADIUS     = 32;

// v420 — algae/snail ecosystem on the glass walls.
import { AquariumEcosystem } from "./aquariumEcosystem.js";
const TANK_HALF       = HOME_RADIUS;          // glass walls sit at ±this, containing the school
const NUM_SNAILS      = 4;
const SNAIL_KIND      = "wad_pickup_o2";      // small rounded mesh — reads as a snail blob
const SNAIL_SCALE     = 0.5;
const ALGAE_BUDGET    = 6;                    // algae film particles spawned per tick (cheap)

const NUM_MONKEYS     = 48;
const MONKEY_MAX_SPEED = 5.0;
const MONKEY_MAX_FORCE = 0.30;
const VISION_RADIUS   = 8;
const VISION_RADIUS_SQ = VISION_RADIUS * VISION_RADIUS;
const SEP_RADIUS      = 2.5;
const SEP_RADIUS_SQ   = SEP_RADIUS * SEP_RADIUS;
const W_SEP           = 2.4;
const W_ALI           = 1.0;
const W_COH           = 0.7;
const W_HOMING        = 0.5;
const W_SHARK_FLEE    = 4.0;
const SHARK_FLEE_RANGE = 12;
const SHARK_FLEE_RANGE_SQ = SHARK_FLEE_RANGE * SHARK_FLEE_RANGE;
const W_BLAST_FLEE    = 6.0;

const NUM_JELLIES     = 8;
const JELLY_BOB_AMP   = 1.8;
const JELLY_BOB_HZ    = 0.4;

const SHARK_PATROL_R  = HOME_RADIUS * 0.85;
const SHARK_PATROL_HZ = 0.05;
const SHARK_STRIKE_RANGE = 6;
const SHARK_STRIKE_COOLDOWN = 4.0;

// Mini-kaiju blast (v406)
const BLAST_PERIOD_S  = 18.0;
const BLAST_WARMUP_S  = 6.0;
const BLAST_RADIUS    = 18;
const BLAST_EDGE_THICK = 5;
const BLAST_SCATTER_STRENGTH = 12;
const BLAST_EDGE_VELOCITY = 4;
const FIREFLY_LIFE_S = 3.5;
const FIREFLY_RATE_HZ = 12;

// Night fish (v406)
const NUM_NIGHT_FISH  = 2;
const NIGHT_FISH_SPEED = 1.2;
const NIGHT_FISH_LURE_RATE_HZ = 10;

const MONKEY_KINDS = ["remote_player_marker"];
const JELLY_KIND      = "wad_pickup_o2";
const SHARK_KIND      = "kaiju_water";
const MINI_KAIJU      = "kaiju_underground";
const NIGHT_FISH_KIND = "wad_pickup_bullet_pen";

let monkeys = [];
let jellies = [];
let shark   = null;
let kaiju   = null;
let nightFish = [];
let t       = 0;
let blast   = { nextFireT: BLAST_WARMUP_S, active: null };
let eco     = null;   // v420 — AquariumEcosystem (algae + snails)

function rand(ctx, min, max) {
    return min + ctx.rand() * (max - min);
}

function gpu() {
    return (typeof window !== "undefined" && window.gpuParticles?.isSupported?.())
        ? window.gpuParticles
        : null;
}

function nightFactor() {
    const time = typeof window !== "undefined" ? window.time : null;
    if (!time?.getDarkness) {
        if (time?.getHour) {
            const h = time.getHour();
            return Math.max(0, Math.cos((h / 24) * Math.PI * 2) * 0.5 + 0.5 - 0.5);
        }
        return 0;
    }
    return time.getDarkness();
}

export default {
    id:    "aquarium",
    label: "AQUARIUM (mixed AI sandbox)",
    hint:  "Sea monkeys flock, jellies drift, shark patrols, mini-kaiju blasts, night fish glow",
    controls: [
        "Auto — watch the tank for a few minutes",
        NUM_MONKEYS + " sea monkeys (flocking) · " + NUM_JELLIES + " jellies (drift) · 1 shark · 1 mini-kaiju · " + NUM_NIGHT_FISH + " night fish",
        "Mini-kaiju blasts every ~18s; monkeys at blast edge glow like fireflies",
        "Try `time.set('night')` to see the night fish lures pop against the dark",
    ],

    start(ctx) {
        // v422 — if a custom OBJ fish kind was registered via
        // fishModels.useInAquarium(name), the flocking school swims as
        // that model; otherwise the default marker mesh.
        const schoolKind = (typeof window !== "undefined" && window._aquariumFishKind) || MONKEY_KINDS[0];
        monkeys = [];
        for (let i = 0; i < NUM_MONKEYS; i++) {
            const a = ctx.rand() * Math.PI * 2;
            const r = ctx.rand() * 12;
            const x = Math.cos(a) * r;
            const z = Math.sin(a) * r;
            const y = TANK_Y + rand(ctx, -6, 6);
            const id = ctx.spawnMesh(schoolKind, x, y, z, 0.5);
            if (id == null) continue;
            monkeys.push({
                id, x, y, z,
                vx: rand(ctx, -1, 1),
                vy: rand(ctx, -0.5, 0.5),
                vz: rand(ctx, -1, 1),
                ax: 0, ay: 0, az: 0,
                yaw: 0,
                fireflyT: 0,
                emitCarry: 0,
            });
        }

        jellies = [];
        for (let i = 0; i < NUM_JELLIES; i++) {
            const a = (i / NUM_JELLIES) * Math.PI * 2;
            const r = HOME_RADIUS * 0.55;
            const baseX = Math.cos(a) * r;
            const baseZ = Math.sin(a) * r;
            const baseY = TANK_Y + rand(ctx, -5, 5);
            const id = ctx.spawnMesh(JELLY_KIND, baseX, baseY, baseZ, 1.2);
            if (id == null) continue;
            jellies.push({
                id, baseX, baseY, baseZ,
                phase:  ctx.rand() * Math.PI * 2,
                driftA: ctx.rand() * Math.PI * 2,
                driftR: rand(ctx, 0, 3),
            });
        }

        {
            const x0 = SHARK_PATROL_R;
            const id = ctx.spawnMesh(SHARK_KIND, x0, TANK_Y - 2, 0, 2.5);
            shark = id == null ? null : {
                id,
                phase: 0,
                strikeCooldown: SHARK_STRIKE_COOLDOWN,
                striking: false,
                strikeT: 0,
                strikeTargetId: -1,
                x: x0, y: TANK_Y - 2, z: 0,
                yaw: 0,
            };
        }

        {
            const x = rand(ctx, -10, 10);
            const z = rand(ctx, -10, 10);
            const y = TANK_Y - TANK_HEIGHT / 2 + 1.5;
            const id = ctx.spawnMesh(MINI_KAIJU, x, y, z, 0.4);
            kaiju = id == null ? null : { id, x, y, z, phase: 0 };
        }

        // v406 - Night fish
        nightFish = [];
        for (let i = 0; i < NUM_NIGHT_FISH; i++) {
            const a = ctx.rand() * Math.PI * 2;
            const r = HOME_RADIUS * 0.4;
            const x = Math.cos(a) * r;
            const z = Math.sin(a) * r;
            const y = TANK_Y - TANK_HEIGHT / 2 + 6 + rand(ctx, 0, 8);
            const id = ctx.spawnMesh(NIGHT_FISH_KIND, x, y, z, 1.5);
            if (id == null) continue;
            nightFish.push({
                id, x, y, z, yaw: 0,
                pathA:   rand(ctx, 12, 22),
                pathB:   rand(ctx, 12, 22),
                pathYAmp: rand(ctx, 2, 5),
                pathCenterY: y,
                phase:    ctx.rand() * Math.PI * 2,
                phaseRate: NIGHT_FISH_SPEED / 18,
                emitCarry: 0,
            });
        }

        blast = { nextFireT: BLAST_WARMUP_S, active: null };
        t = 0;

        // v420 — seed the algae/snail ecosystem on the glass walls.
        eco = new AquariumEcosystem({
            half: TANK_HALF, cy: TANK_Y, hh: TANK_HEIGHT / 2,
            rng: () => ctx.rand(),
        });
        for (let i = 0; i < NUM_SNAILS; i++) {
            const s = eco.addSnail();
            const w = eco.snailWorld(s);
            s.id = ctx.spawnMesh(SNAIL_KIND, w.x, w.y, w.z, SNAIL_SCALE);
        }
        // v421 — switch on the glass walls + floor caustics for this demo.
        if (typeof window !== "undefined" && window.aquariumTank) {
            window.aquariumTank.setActive(true, { half: TANK_HALF, cy: TANK_Y, hh: TANK_HEIGHT / 2 });
        }

        try { ctx.lookAt?.(0, TANK_Y, 0); } catch {}
        ctx.kpop?.info?.("Aquarium",
            monkeys.length + " monkeys · " + jellies.length + " jellies · " + (shark ? 1 : 0) + " shark · " + (kaiju ? 1 : 0) + " mini-kaiju · " + nightFish.length + " night fish");
        console.log("[aquarium v406] started — " + monkeys.length + " monkeys, " +
                    jellies.length + " jellies, " + (shark ? 1 : 0) + " shark, " +
                    (kaiju ? 1 : 0) + " mini-kaiju, " + nightFish.length + " night fish");
    },

    tick(ctx, dt) {
        if (dt > 0.1) dt = 0.1;
        t += dt;

        // ----- Mini-kaiju + blast (v406) -----
        if (kaiju) {
            kaiju.phase += dt;
            const sway = Math.sin(kaiju.phase * 0.6) * 0.1;
            ctx.router?.exec?.({
                type: "entity:move",
                id: kaiju.id,
                x: kaiju.x, y: kaiju.y, z: kaiju.z,
                yaw: kaiju.phase * 0.2 + sway,
            });

            if (!blast.active && t >= blast.nextFireT) {
                blast.active = {
                    cx: kaiju.x, cy: kaiju.y + 2, cz: kaiju.z,
                    age: 0,
                    duration: 0.4,
                };
                blast.nextFireT = t + BLAST_PERIOD_S + (ctx.rand() - 0.5) * 4;

                const G = gpu();
                if (G) {
                    const count = 80;
                    for (let i = 0; i < count; i++) {
                        const a = (i / count) * Math.PI * 2;
                        const speed = BLAST_RADIUS / blast.active.duration;
                        G.spawn({
                            x: blast.active.cx,
                            y: blast.active.cy,
                            z: blast.active.cz,
                            vx: Math.cos(a) * speed,
                            vy: rand(ctx, -1, 3),
                            vz: Math.sin(a) * speed,
                            life: blast.active.duration + 0.4,
                            size: 0.5,
                            r: 0.75, g: 0.5, b: 1.0, shape: 3, // kaiju blast — violet flare
                        });
                    }
                }
                console.log("[aquarium] mini-kaiju blast fired");

                for (const m of monkeys) {
                    const dx = m.x - blast.active.cx;
                    const dy = m.y - blast.active.cy;
                    const dz = m.z - blast.active.cz;
                    const d  = Math.hypot(dx, dy, dz);
                    if (d > BLAST_RADIUS + BLAST_EDGE_THICK) continue;
                    const ndx = d > 0 ? dx / d : 1;
                    const ndy = d > 0 ? dy / d : 0;
                    const ndz = d > 0 ? dz / d : 0;
                    if (d <= BLAST_RADIUS) {
                        m.vx += ndx * BLAST_SCATTER_STRENGTH;
                        m.vy += ndy * BLAST_SCATTER_STRENGTH * 0.4;
                        m.vz += ndz * BLAST_SCATTER_STRENGTH;
                    } else {
                        m.vx += ndx * BLAST_EDGE_VELOCITY;
                        m.vy += ndy * BLAST_EDGE_VELOCITY;
                        m.vz += ndz * BLAST_EDGE_VELOCITY;
                        m.fireflyT = FIREFLY_LIFE_S;
                    }
                }
            }

            if (blast.active) {
                blast.active.age += dt;
                if (blast.active.age >= blast.active.duration + 0.5) {
                    blast.active = null;
                }
            }
        }

        // ----- Shark -----
        if (shark) {
            if (shark.striking) {
                shark.strikeT += dt;
                const STRIKE_SPEED = 14;
                const target = monkeys.find(m => m.id === shark.strikeTargetId);
                if (target && shark.strikeT < 0.9) {
                    const dx = target.x - shark.x;
                    const dy = target.y - shark.y;
                    const dz = target.z - shark.z;
                    const d  = Math.hypot(dx, dy, dz) || 1;
                    shark.x += (dx / d) * STRIKE_SPEED * dt;
                    shark.y += (dy / d) * STRIKE_SPEED * dt;
                    shark.z += (dz / d) * STRIKE_SPEED * dt;
                    shark.yaw = Math.atan2(dx, dz);
                } else {
                    shark.striking = false;
                    shark.strikeT = 0;
                    shark.strikeCooldown = SHARK_STRIKE_COOLDOWN;
                }
            } else {
                shark.phase += SHARK_PATROL_HZ * Math.PI * 2 * dt;
                shark.x = Math.cos(shark.phase) * SHARK_PATROL_R;
                shark.z = Math.sin(shark.phase) * SHARK_PATROL_R;
                shark.y = TANK_Y - 2 + Math.sin(t * 0.3) * 1.5;
                shark.yaw = shark.phase + Math.PI / 2;
                shark.strikeCooldown -= dt;
                if (shark.strikeCooldown <= 0) {
                    for (const m of monkeys) {
                        const dx = m.x - shark.x;
                        const dz = m.z - shark.z;
                        const d2 = dx*dx + dz*dz;
                        if (d2 < SHARK_STRIKE_RANGE * SHARK_STRIKE_RANGE) {
                            shark.striking = true;
                            shark.strikeT = 0;
                            shark.strikeTargetId = m.id;
                            break;
                        }
                    }
                }
            }
            ctx.router?.exec?.({
                type: "entity:move",
                id: shark.id, x: shark.x, y: shark.y, z: shark.z, yaw: shark.yaw,
            });
        }

        // ----- Sea monkeys -----
        if (monkeys.length) {
            const G = gpu();
            for (const m of monkeys) { m.ax = 0; m.ay = 0; m.az = 0; }
            for (let i = 0; i < monkeys.length; i++) {
                const a = monkeys[i];
                let sepX=0,sepY=0,sepZ=0,sepN=0;
                let aliX=0,aliY=0,aliZ=0,aliN=0;
                let cohX=0,cohY=0,cohZ=0,cohN=0;
                for (let j = 0; j < monkeys.length; j++) {
                    if (i === j) continue;
                    const b = monkeys[j];
                    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
                    const d2 = dx*dx + dy*dy + dz*dz;
                    if (d2 < VISION_RADIUS_SQ && d2 > 0) {
                        if (d2 < SEP_RADIUS_SQ) {
                            const d = Math.sqrt(d2);
                            sepX += dx/d; sepY += dy/d; sepZ += dz/d; sepN++;
                        }
                        aliX += b.vx; aliY += b.vy; aliZ += b.vz; aliN++;
                        cohX += b.x;  cohY += b.y;  cohZ += b.z;  cohN++;
                    }
                }
                if (sepN > 0) {
                    a.ax += sepX/sepN * MONKEY_MAX_SPEED * W_SEP;
                    a.ay += sepY/sepN * MONKEY_MAX_SPEED * W_SEP;
                    a.az += sepZ/sepN * MONKEY_MAX_SPEED * W_SEP;
                }
                if (aliN > 0) {
                    a.ax += (aliX/aliN - a.vx) * W_ALI;
                    a.ay += (aliY/aliN - a.vy) * W_ALI;
                    a.az += (aliZ/aliN - a.vz) * W_ALI;
                }
                if (cohN > 0) {
                    a.ax += (cohX/cohN - a.x) / VISION_RADIUS * MONKEY_MAX_SPEED * W_COH;
                    a.ay += (cohY/cohN - a.y) / VISION_RADIUS * MONKEY_MAX_SPEED * W_COH;
                    a.az += (cohZ/cohN - a.z) / VISION_RADIUS * MONKEY_MAX_SPEED * W_COH;
                }
                const hd = Math.hypot(a.x, a.y - TANK_Y, a.z);
                if (hd > HOME_RADIUS) {
                    const k = (hd - HOME_RADIUS) / HOME_RADIUS;
                    a.ax += -a.x/hd * MONKEY_MAX_SPEED * W_HOMING * k;
                    a.ay += -(a.y - TANK_Y)/hd * MONKEY_MAX_SPEED * W_HOMING * k;
                    a.az += -a.z/hd * MONKEY_MAX_SPEED * W_HOMING * k;
                }
                if (shark) {
                    const dx = a.x - shark.x, dy = a.y - shark.y, dz = a.z - shark.z;
                    const d2 = dx*dx + dy*dy + dz*dz;
                    if (d2 < SHARK_FLEE_RANGE_SQ && d2 > 0) {
                        const d = Math.sqrt(d2);
                        const k = 1 - d / SHARK_FLEE_RANGE;
                        a.ax += dx/d * MONKEY_MAX_SPEED * W_SHARK_FLEE * k;
                        a.ay += dy/d * MONKEY_MAX_SPEED * W_SHARK_FLEE * k;
                        a.az += dz/d * MONKEY_MAX_SPEED * W_SHARK_FLEE * k;
                    }
                }
                // v406 - Blast flee
                if (blast.active) {
                    const dx = a.x - blast.active.cx;
                    const dy = a.y - blast.active.cy;
                    const dz = a.z - blast.active.cz;
                    const d  = Math.hypot(dx, dy, dz);
                    const fleeR = BLAST_RADIUS + BLAST_EDGE_THICK + 5;
                    if (d < fleeR && d > 0) {
                        const k = 1 - d / fleeR;
                        a.ax += dx/d * MONKEY_MAX_SPEED * W_BLAST_FLEE * k;
                        a.ay += dy/d * MONKEY_MAX_SPEED * W_BLAST_FLEE * k;
                        a.az += dz/d * MONKEY_MAX_SPEED * W_BLAST_FLEE * k;
                    }
                }
                const al = Math.hypot(a.ax, a.ay, a.az);
                const maxA = MONKEY_MAX_FORCE * MONKEY_MAX_SPEED;
                if (al > maxA) { const s = maxA/al; a.ax*=s; a.ay*=s; a.az*=s; }
            }
            for (const b of monkeys) {
                b.vx += b.ax * dt;
                b.vy += b.ay * dt;
                b.vz += b.az * dt;
                b.vy *= 0.99;
                const vl = Math.hypot(b.vx, b.vy, b.vz);
                if (vl > MONKEY_MAX_SPEED) {
                    const s = MONKEY_MAX_SPEED/vl; b.vx*=s; b.vy*=s; b.vz*=s;
                }
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.z += b.vz * dt;
                const yLo = TANK_Y - TANK_HEIGHT/2, yHi = TANK_Y + TANK_HEIGHT/2;
                if (b.y < yLo) { b.y = yLo; b.vy *= -0.3; }
                if (b.y > yHi) { b.y = yHi; b.vy *= -0.3; }
                if (Math.abs(b.vx) > 0.01 || Math.abs(b.vz) > 0.01) {
                    b.yaw = Math.atan2(b.vx, b.vz);
                }

                // v406 — firefly glow
                if (b.fireflyT > 0 && G) {
                    b.fireflyT = Math.max(0, b.fireflyT - dt);
                    const intensity = b.fireflyT / FIREFLY_LIFE_S;
                    b.emitCarry += dt * FIREFLY_RATE_HZ * intensity;
                    while (b.emitCarry >= 1) {
                        b.emitCarry -= 1;
                        const ox = (ctx.rand() - 0.5) * 1.5;
                        const oy = (ctx.rand() - 0.5) * 1.5;
                        const oz = (ctx.rand() - 0.5) * 1.5;
                        G.spawn({
                            x: b.x + ox, y: b.y + oy, z: b.z + oz,
                            vx: (ctx.rand() - 0.5) * 0.5,
                            vy: 0.5 + ctx.rand() * 0.8,
                            vz: (ctx.rand() - 0.5) * 0.5,
                            life: 0.7 + ctx.rand() * 0.5,
                            size: 0.15,
                        });
                    }
                }

                ctx.router?.exec?.({
                    type: "entity:move",
                    id: b.id, x: b.x, y: b.y, z: b.z, yaw: b.yaw,
                });
            }
        }

        // ----- Jellies -----
        for (const j of jellies) {
            j.phase += dt;
            const y  = j.baseY + Math.sin(j.phase * JELLY_BOB_HZ * Math.PI * 2 + j.phase) * JELLY_BOB_AMP;
            j.driftA += dt * 0.05;
            const x = j.baseX + Math.cos(j.driftA) * j.driftR;
            const z = j.baseZ + Math.sin(j.driftA) * j.driftR;
            ctx.router?.exec?.({
                type: "entity:move",
                id: j.id, x, y, z, yaw: j.driftA,
            });
        }

        // ----- Night fish (v406) -----
        const G = gpu();
        const night = nightFactor();
        const lureRate = NIGHT_FISH_LURE_RATE_HZ * (0.4 + 0.6 * night);
        for (const f of nightFish) {
            f.phase += f.phaseRate * Math.PI * 2 * dt;
            const newX = Math.cos(f.phase) * f.pathA;
            const newZ = Math.sin(f.phase) * f.pathB;
            const newY = f.pathCenterY + Math.sin(f.phase * 1.3) * f.pathYAmp;
            const dx = newX - f.x, dz = newZ - f.z;
            if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
                f.yaw = Math.atan2(dx, dz);
            }
            f.x = newX; f.y = newY; f.z = newZ;
            ctx.router?.exec?.({
                type: "entity:move",
                id: f.id, x: f.x, y: f.y, z: f.z, yaw: f.yaw,
            });

            if (G) {
                f.emitCarry += dt * lureRate;
                while (f.emitCarry >= 1) {
                    f.emitCarry -= 1;
                    const fwdX = Math.sin(f.yaw);
                    const fwdZ = Math.cos(f.yaw);
                    const lureX = f.x + fwdX * 1.5;
                    const lureY = f.y + 0.4;
                    const lureZ = f.z + fwdZ * 1.5;
                    G.spawn({
                        x: lureX + (ctx.rand() - 0.5) * 0.2,
                        y: lureY + (ctx.rand() - 0.5) * 0.2,
                        z: lureZ + (ctx.rand() - 0.5) * 0.2,
                        vx: (ctx.rand() - 0.5) * 0.2,
                        vy: 0.3 + ctx.rand() * 0.3,
                        vz: (ctx.rand() - 0.5) * 0.2,
                        life: 1.2 + ctx.rand() * 0.6,
                        size: 0.20,
                        r: 0.55, g: 0.9, b: 1.0, shape: 2,  // anglerfish lure (ring)
                    });
                }
            }
        }

        // ----- v420: algae/snail ecosystem -----
        if (eco) {
            eco.update(dt);
            const G = gpu();
            if (G) {
                // Algae film: green particles on the densest glass cells,
                // intensity ∝ density. Grazed cells fade as their density
                // drops, so you can watch snails clear trails through it.
                const cells = eco.topCells(48);
                for (let k = 0; k < ALGAE_BUDGET && cells.length; k++) {
                    const c = cells[(ctx.rand() * Math.min(cells.length, 24)) | 0];
                    if (!c) continue;
                    const flatJ = () => (ctx.rand() - 0.5) * 3;
                    G.spawn({
                        x: c.world.x + c.inward.x * 0.4 + (c.inward.x ? 0 : flatJ()),
                        y: c.world.y + flatJ(),
                        z: c.world.z + c.inward.z * 0.4 + (c.inward.z ? 0 : flatJ()),
                        vx: 0, vy: 0, vz: 0,
                        life: 1.6, size: 0.35 + c.density * 0.45,
                        r: 0.10 + 0.08 * (1 - c.density), g: 0.42 + 0.28 * c.density, b: 0.12,
                        shape: 0,   // soft blob — reads as fuzz
                    });
                }
                // Faint cyan glints so the glass faces read as glass.
                if (ctx.rand() < 0.4) {
                    const wall = (ctx.rand() * 4) | 0;
                    const p = eco.toWorld(wall, ctx.rand(), ctx.rand());
                    G.spawn({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0,
                        life: 0.8, size: 0.5, r: 0.5, g: 0.7, b: 0.9, shape: 2 });
                }
            }
            // Crawl the snails to their (grazed) positions on the glass.
            for (const s of eco.snails) {
                if (s.id == null) continue;
                const w = eco.snailWorld(s);
                ctx.router?.exec?.({ type: "entity:move", id: s.id, x: w.x, y: w.y, z: w.z, yaw: s.u * 6.283 });
            }
        }
    },

    stop(ctx) {
        for (const m of monkeys) ctx.despawnEntity?.(m.id);
        for (const j of jellies) ctx.despawnEntity?.(j.id);
        for (const f of nightFish) ctx.despawnEntity?.(f.id);
        if (shark) ctx.despawnEntity?.(shark.id);
        if (kaiju) ctx.despawnEntity?.(kaiju.id);
        if (eco) { for (const s of eco.snails) if (s.id != null) ctx.despawnEntity?.(s.id); eco = null; }
        if (typeof window !== "undefined" && window.aquariumTank) window.aquariumTank.setActive(false);
        monkeys = []; jellies = []; shark = null; kaiju = null; nightFish = [];
        blast = { nextFireT: BLAST_WARMUP_S, active: null };
        console.log("[aquarium] stopped");
    },
};
