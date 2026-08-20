// =============================================================================
// FILE: /world/birthSpawner.js
// ROUND: 203 (initial) → 205 (themed reveals)
// =============================================================================
//
// Hold-for-birth: when you request a kaiju (or any AI-generated entity),
// the generation pipeline runs invisibly in the background. Only when the
// real mesh lands do we materialize the entity, with a *themed* reveal
// animation chosen by the kaiju's kind (round 205).
//
// Reveal modes:
//
//   "scale"     — original 1.5s scale-up. Default for civ/neutral kinds.
//
//   "crater"    — kaiju falls from 50u above the target, accelerating
//                 with gravity. Tumbles during fall. At impact, briefly
//                 hidden by "compression" (scale dips). Then settles to
//                 full scale. Best for space/tech kaiju and meteors.
//                 3.5s total.
//
//   "hellhole"  — kaiju starts 6u BELOW ground (invisible). After a 0.6s
//                 "fissure opening" pause, climbs out with ease-out
//                 cubic. Best for hell kaiju. 3.0s total.
//
//   "skydrop"   — kaiju falls from directly above target with NO horizontal
//                 motion. No tumble. Quick (1.8s) for non-space hostile
//                 kaiju that should still feel sudden. Default for any
//                 kaiju kind without a more specific mode.
//
// Mode auto-selection (when caller doesn't specify):
//
//   kind matches /hell|infernal|demonic/   → "hellhole"
//   kind matches /space|tech|alien|meteor/  → "crater"
//   kind starts with "kaiju"                → "skydrop"
//   anything else                           → "scale"
//
// Public API unchanged from v203:
//   bs.request({ assetId, kind, x, y, z, scale, description, mode? })
//   bs.update(nowMs)
//   bs.snapshot()
// =============================================================================

import { Render, Position } from "../core/ecs/components.js";
// Round 321 — shared easing module. The inline easeOutCubic / easeInCubic /
// easeOutBack here were the canonical definitions and now live in simulation/easing.js.
import { easeOutCubic, easeInCubic, easeOutBack } from "../simulation/easing.js";

export const REVEAL_MODES = {
    scale: {
        durMs: 1500,
        spawnOffset: () => ({ dx: 0, dy: 0, dz: 0 }),
        trajectory(t, tgt) {
            const e = easeOutCubic(t);
            return {
                x: tgt.x, y: tgt.y, z: tgt.z,
                yaw: 0, tiltX: 0, tiltZ: 0,
                scale: tgt.targetScale * Math.max(0.05, e),
            };
        },
    },

    skydrop: {
        durMs: 1800,
        spawnOffset: () => ({ dx: 0, dy: 25, dz: 0 }),
        trajectory(t, tgt) {
            if (t < 0.85) {
                const fallT = t / 0.85;
                const fallE = easeInCubic(fallT);
                return {
                    x: tgt.x,
                    y: tgt.y + 25 * (1 - fallE),
                    z: tgt.z,
                    yaw: 0, tiltX: 0, tiltZ: 0,
                    scale: tgt.targetScale,
                };
            }
            const settleT = (t - 0.85) / 0.15;
            const sq = 1 - 0.25 * Math.sin(settleT * Math.PI);
            return {
                x: tgt.x, y: tgt.y, z: tgt.z,
                yaw: 0, tiltX: 0, tiltZ: 0,
                scale: tgt.targetScale * sq,
            };
        },
        effects: { onImpact: 0.85 },
    },

    crater: {
        durMs: 3500,
        spawnOffset: () => ({ dx: 0, dy: 50, dz: 0 }),
        trajectory(t, tgt) {
            if (t < 0.55) {
                const fallT = t / 0.55;
                const fallE = easeInCubic(fallT);
                const spin = fallT * Math.PI * 2.5;
                return {
                    x: tgt.x,
                    y: tgt.y + 50 * (1 - fallE),
                    z: tgt.z,
                    yaw:   spin,
                    tiltX: spin * 0.7,
                    tiltZ: spin * 0.4,
                    scale: tgt.targetScale,
                };
            }
            if (t < 0.65) {
                const sqT = (t - 0.55) / 0.10;
                const sq = 1 - 0.5 * Math.sin(sqT * Math.PI);
                return {
                    x: tgt.x, y: tgt.y, z: tgt.z,
                    yaw: 0, tiltX: 0.4 * (1 - sqT), tiltZ: 0,
                    scale: tgt.targetScale * sq,
                };
            }
            const climbT = (t - 0.65) / 0.35;
            const e = easeOutBack(climbT);
            return {
                x: tgt.x, y: tgt.y, z: tgt.z,
                yaw: 0, tiltX: 0, tiltZ: 0,
                scale: tgt.targetScale * (0.5 + 0.5 * e),
            };
        },
        effects: { onImpact: 0.55, onSettle: 0.65 },
    },

    hellhole: {
        durMs: 3000,
        spawnOffset: () => ({ dx: 0, dy: -8, dz: 0 }),
        trajectory(t, tgt) {
            if (t < 0.30) {
                return {
                    x: tgt.x, y: tgt.y - 8, z: tgt.z,
                    yaw: 0, tiltX: 0, tiltZ: 0,
                    scale: 0.01,
                };
            }
            const climbT = (t - 0.30) / 0.70;
            const climbE = easeOutCubic(climbT);
            return {
                x: tgt.x,
                y: tgt.y - 8 + 8 * climbE,
                z: tgt.z,
                yaw: climbT * 0.5,
                tiltX: 0,
                tiltZ: 0,
                scale: tgt.targetScale * (0.3 + 0.7 * climbE),
            };
        },
        effects: { onFissure: 0.0, onEmerge: 0.30 },
    },

    // Round 205 — slow ooze from a horizontal cave mouth. Distinct from
    // hellhole (vertical climb up): the kaiju emerges sideways at ground
    // level, oozing forward over 4 seconds. Best for primal/earth/cave
    // kaiju kinds. The default cave-mouth direction is -X (west). Caller
    // can override via spec.caveDir if needed (future extension).
    cave: {
        durMs: 4000,
        spawnOffset: () => ({ dx: -12, dy: 0, dz: 0 }),
        trajectory(t, tgt) {
            // Phase 1 (0–0.30): hunched, slow initial emergence (low scale,
            // body visible at the cave mouth)
            if (t < 0.30) {
                const phaseT = t / 0.30;
                return {
                    x: tgt.x - 12 + 4 * phaseT,
                    y: tgt.y,
                    z: tgt.z,
                    yaw: Math.PI * 0.5,    // facing +X (out of cave)
                    tiltX: 0,
                    tiltZ: 0,
                    scale: tgt.targetScale * (0.1 + 0.25 * phaseT),
                };
            }
            // Phase 2 (0.30–1.0): full body emerges, walks to target with
            // ease-out. Scale also ramps to full.
            const phaseT = (t - 0.30) / 0.70;
            const e = easeOutCubic(phaseT);
            return {
                x: tgt.x - 8 + 8 * e,
                y: tgt.y,
                z: tgt.z,
                yaw: Math.PI * 0.5 - phaseT * Math.PI * 0.5,    // turn to face target
                tiltX: 0,
                tiltZ: 0,
                scale: tgt.targetScale * (0.35 + 0.65 * e),
            };
        },
        effects: { onEmerge: 0.0, onFullBody: 0.30, onArrive: 0.95 },
    },

    // Round 205 — kaiju is launched upward out of a hellhole like a
    // cannon shot, peaks ~30u above the target, then tumbles back to
    // land at the target. Parabolic arc with continuous 4-axis tumble.
    // The launch and the impact are both punctuation moments worth a
    // visual/audio effect.
    cannon: {
        durMs: 4000,
        spawnOffset: () => ({ dx: 0, dy: -3, dz: 0 }),
        trajectory(t, tgt) {
            // y trajectory: linear from -3 to 0 (start below, end at target)
            // plus a sine bulge that peaks at +30u at t=0.5
            const linearY = -3 + 3 * t;
            const peakY   = 30 * Math.sin(t * Math.PI);
            // Tumble throughout — full revolution + extra
            const spin = t * Math.PI * 4;
            // Scale: grow from 30% during the first 10% of flight (launch
            // ramp-up so the launch impulse "spawns" the kaiju into being)
            let scale = tgt.targetScale;
            if (t < 0.10) {
                scale = tgt.targetScale * (0.3 + 0.7 * (t / 0.10));
            }
            return {
                x: tgt.x,
                y: tgt.y + linearY + peakY,
                z: tgt.z,
                yaw:   spin,
                tiltX: spin * 0.5,
                tiltZ: spin * 0.3,
                scale,
            };
        },
        effects: { onLaunch: 0.0, onPeak: 0.5, onImpact: 0.95 },
    },

    // Round 205 — airdrop: kaiju traverses the sky horizontally (the air
    // ogre carrier is implicit in v205 — no separate carrier entity), then
    // vertical drop at the release point. The flight path starts 40u west
    // and 20u up. Last 35% of the animation is the drop.
    //
    // Real "air ogre carrier" entity (a temp ogre that flies in, drops
    // payload, then despawns) is a follow-up round — needs the carrier
    // ogre asset wired up and a release-handoff between two entity
    // animations. For now, the trajectory makes the kaiju appear to fly
    // in by itself, which works as a delivery cinematic but doesn't yet
    // SHOW the carrier.
    airdrop: {
        durMs: 5000,
        spawnOffset: () => ({ dx: -40, dy: 20, dz: 0 }),
        trajectory(t, tgt) {
            // Phase 1 (0–0.65): horizontal flight from spawn to release
            if (t < 0.65) {
                const phaseT = t / 0.65;
                return {
                    x: tgt.x - 40 + 40 * phaseT,
                    y: tgt.y + 20,
                    z: tgt.z,
                    yaw: 0,
                    tiltX: 0.1,                                  // slight nose-down
                    tiltZ: Math.sin(phaseT * Math.PI * 4) * 0.05, // wobble
                    scale: tgt.targetScale,
                };
            }
            // Phase 2 (0.65–1.0): vertical drop with accelerating fall
            const phaseT = (t - 0.65) / 0.35;
            const e = easeInCubic(phaseT);
            return {
                x: tgt.x,
                y: tgt.y + 20 - 20 * e,
                z: tgt.z,
                yaw: 0,
                tiltX: phaseT * 0.5,                              // tumble during fall
                tiltZ: 0,
                scale: tgt.targetScale,
            };
        },
        effects: { onCarrierAppear: 0.0, onRelease: 0.65, onImpact: 0.98 },
    },

    // =========================================================================
    // Round 208 — Carrier-driven reveals.
    //
    // These modes spawn a SECOND entity (the carrier OGRE) alongside the
    // kaiju. The carrier follows its own trajectory; the kaiju follows
    // its own. BirthSpawner._spawnAndReveal detects `carrier` on the
    // mode def and spawns the carrier entity. update() drives both
    // entities each frame. At t=1, the carrier entity is despawned.
    //
    // Carrier asset IDs reference meshes installed by carrierAssets.js
    // (must be installed before these modes are used — main.js handles
    // this at boot, and birthTestBench.js does it lazy on first use).
    // =========================================================================

    // Submarine surfaces from water, kaiju climbs out onto deck, then
    // out to the target position. Sub submerges as kaiju walks away.
    // The kaiju starts hidden inside the submerged sub.
    sub_surface: {
        durMs: 5000,
        spawnOffset: () => ({ dx: 0, dy: -3, dz: 4 }),
        carrier: {
            assetId: "ogre_sub_carrier",
            kind:    "ogre_sub_carrier",
            spawnOffset: () => ({ dx: 0, dy: -3, dz: 4 }),
            trajectory(t, tgt) {
                // Sub sits 4u behind target in Z (so kaiju can walk forward)
                const subX = tgt.x;
                const subZ = tgt.z + 4;
                // Y profile:
                //  0.00–0.20: -3 (deep underwater, only bubbles visible)
                //  0.20–0.45: rising  -3 → 0  (breaches surface)
                //  0.45–0.70: 0  (on surface, kaiju climbs out)
                //  0.70–1.00: sinking 0 → -3
                let subY = tgt.y - 3;
                if (t >= 0.20 && t < 0.45) {
                    const p = (t - 0.20) / 0.25;
                    subY = tgt.y - 3 + 3 * easeOutCubic(p);
                } else if (t >= 0.45 && t < 0.70) {
                    subY = tgt.y;
                } else if (t >= 0.70) {
                    const p = (t - 0.70) / 0.30;
                    subY = tgt.y - 3 * easeInCubic(p);
                }
                return { x: subX, y: subY, z: subZ, yaw: -Math.PI * 0.5, scale: 1 };
            },
        },
        trajectory(t, tgt) {
            // Phase 1 (0.00–0.45): kaiju invisible, riding inside sub
            if (t < 0.45) {
                let subY = tgt.y - 3;
                if (t >= 0.20) {
                    const p = (t - 0.20) / 0.25;
                    subY = tgt.y - 3 + 3 * easeOutCubic(p);
                }
                return { x: tgt.x, y: subY, z: tgt.z + 4, yaw: 0, tiltX: 0, tiltZ: 0, scale: 0.01 };
            }
            // Phase 2 (0.45–0.55): kaiju materializes on sub deck
            if (t < 0.55) {
                const p = (t - 0.45) / 0.10;
                return {
                    x: tgt.x,
                    y: tgt.y + 2,            // standing on sub deck
                    z: tgt.z + 4,
                    yaw: 0, tiltX: 0, tiltZ: 0,
                    scale: tgt.targetScale * (0.4 + 0.6 * p),
                };
            }
            // Phase 3 (0.55–0.85): kaiju walks forward off sub onto land
            if (t < 0.85) {
                const p = (t - 0.55) / 0.30;
                const e = easeOutCubic(p);
                return {
                    x: tgt.x,
                    y: tgt.y + 2 * (1 - p),   // step down to ground
                    z: tgt.z + 4 - 4 * e,
                    yaw: 0, tiltX: 0, tiltZ: 0,
                    scale: tgt.targetScale,
                };
            }
            // Phase 4 (0.85–1.00): settled at target
            return { x: tgt.x, y: tgt.y, z: tgt.z, yaw: 0, tiltX: 0, tiltZ: 0, scale: tgt.targetScale };
        },
        effects: {
            onBubbles:    0.0,
            onBreach:     0.20,
            onSurface:    0.45,
            onHatchOpen:  0.50,   // round 209 — steam from conning tower
            onRelease:    0.55,
            onSubmerge:   0.70,
        },
    },

    // Boat cruises in from offshore, stations itself by the shore, drops
    // kaiju into the water. Kaiju surfaces and walks ashore. Boat sails
    // away after release.
    boat_dropoff: {
        durMs: 5500,
        spawnOffset: () => ({ dx: 0, dy: 0, dz: 30 }),
        carrier: {
            assetId: "ogre_boat_carrier",
            kind:    "ogre_boat_carrier",
            spawnOffset: () => ({ dx: 0, dy: 0, dz: 30 }),
            trajectory(t, tgt) {
                // Boat cruises from z+30 to z+6 over 0.0–0.45 (approach),
                // dwells at z+6 over 0.45–0.75 (drops kaiju), then
                // departs to z+30 over 0.75–1.0 (sails away)
                let boatZ;
                if (t < 0.45) {
                    const p = t / 0.45;
                    const e = easeOutCubic(p);
                    boatZ = tgt.z + 30 - 24 * e;
                } else if (t < 0.75) {
                    boatZ = tgt.z + 6;
                } else {
                    const p = (t - 0.75) / 0.25;
                    const e = easeInCubic(p);
                    boatZ = tgt.z + 6 + 24 * e;
                }
                // Slight bob with time
                const bob = Math.sin(t * Math.PI * 8) * 0.15;
                return {
                    x: tgt.x,
                    y: tgt.y + bob,
                    z: boatZ,
                    yaw: -Math.PI * 0.5,                 // prow facing -Z (toward shore)
                    tiltX: 0,
                    tiltZ: Math.sin(t * Math.PI * 6) * 0.03,    // gentle roll
                    scale: 1,
                };
            },
        },
        trajectory(t, tgt) {
            // Phase 1 (0.00–0.45): kaiju hidden inside boat as it approaches
            if (t < 0.45) {
                const p = t / 0.45;
                const e = easeOutCubic(p);
                const boatZ = tgt.z + 30 - 24 * e;
                return { x: tgt.x, y: tgt.y + 1, z: boatZ, yaw: 0, tiltX: 0, tiltZ: 0, scale: 0.01 };
            }
            // Phase 2 (0.45–0.65): kaiju climbs over the side, splashes into water
            if (t < 0.65) {
                const p = (t - 0.45) / 0.20;
                // Y arcs: 2 → -0.5 → 0 (jump over side, splash, surface)
                const yArc = 2 - 4 * p + 2.5 * p * p;
                return {
                    x: tgt.x,
                    y: tgt.y + yArc,
                    z: tgt.z + 6 - 1 * p,                // sliding forward off boat
                    yaw: 0,
                    tiltX: p * 0.4,                       // forward dive
                    tiltZ: 0,
                    scale: tgt.targetScale * (0.5 + 0.5 * p),
                };
            }
            // Phase 3 (0.65–1.00): kaiju wades forward to target
            const p = (t - 0.65) / 0.35;
            const e = easeOutCubic(p);
            return {
                x: tgt.x,
                y: tgt.y,
                z: tgt.z + 5 - 5 * e,                    // wade forward
                yaw: 0, tiltX: 0, tiltZ: 0,
                scale: tgt.targetScale,
            };
        },
        effects: {
            onHorn:    0.0,
            onArrive:  0.45,
            onAnchor:  0.50,    // round 209 — anchor drop after stopping
            onRamp:    0.53,    // round 209 — gangway/ramp extend
            onSplash:  0.55,
            onWade:    0.65,
            onDepart:  0.75,
        },
    },

    // Flying ogre carrier (with 4 demon propulsion pods) flies in from
    // offset, hovers over drop point, releases kaiju, then flies away.
    // The kaiju drops vertically while the carrier continues forward.
    //
    // Round 209 — added "demon propulsion" wobble to the carrier
    // trajectory: the four demons aren't perfectly synchronized, so the
    // chassis pitches and yaws subtly during flight. Combined with the
    // sine bob already present, this reads as "demons working hard to
    // keep this thing in the air."
    air_carrier: {
        durMs: 6000,
        spawnOffset: () => ({ dx: -40, dy: 25, dz: 0 }),
        carrier: {
            assetId: "ogre_flying_carrier",
            kind:    "ogre_flying_carrier",
            spawnOffset: () => ({ dx: -40, dy: 25, dz: 0 }),
            trajectory(t, tgt) {
                // X trajectory: -40 → 0 (drop point) over 0.0–0.55,
                // continues to +40 (fly away) over 0.55–1.0
                let cx;
                if (t < 0.55) {
                    const p = t / 0.55;
                    cx = tgt.x - 40 + 40 * easeOutCubic(p);
                } else {
                    const p = (t - 0.55) / 0.45;
                    cx = tgt.x + 40 * easeInCubic(p);
                }
                // Y: stays at +25 throughout. Two-frequency bob — primary
                // 0.5 Hz drift plus a 3 Hz "demon strain" wobble.
                const drift = Math.sin(t * Math.PI * 2 * 0.5) * 0.6;
                const strain = Math.sin(t * Math.PI * 2 * 3.0) * 0.25;
                const cy = tgt.y + 25 + drift + strain;
                // Roll: banks slightly during turn (after release)
                const roll = (t < 0.55) ? 0 : Math.sin((t - 0.55) * Math.PI * 2) * 0.2;
                // Round 209 — demon wobble. The 4 demons don't pull
                // evenly; alternating yaw + pitch micro-oscillations
                // sell it. Phases offset so yaw and pitch don't line up.
                const demonYaw   = Math.sin(t * Math.PI * 2 * 2.4) * 0.06;
                const demonPitch = Math.sin(t * Math.PI * 2 * 1.7 + 1.3) * 0.04;
                return {
                    x: cx,
                    y: cy,
                    z: tgt.z,
                    yaw: demonYaw,
                    tiltX: 0.05 + demonPitch,             // base nose-down + wobble
                    tiltZ: roll,
                    scale: 1,
                };
            },
        },
        trajectory(t, tgt) {
            // Phase 1 (0.00–0.55): attached underneath carrier, riding to drop point.
            // Round 209 — kaiju inherits the same X/Y wobble as the carrier
            // so it visibly hangs from the carrier rather than gliding
            // through the air on its own.
            if (t < 0.55) {
                const p = t / 0.55;
                const carrierX = tgt.x - 40 + 40 * easeOutCubic(p);
                const drift = Math.sin(t * Math.PI * 2 * 0.5) * 0.6;
                const strain = Math.sin(t * Math.PI * 2 * 3.0) * 0.25;
                return {
                    x: carrierX,
                    y: tgt.y + 24 + drift + strain,       // 1u below carrier body
                    z: tgt.z,
                    yaw: 0, tiltX: 0, tiltZ: 0,
                    scale: tgt.targetScale,
                };
            }
            // Phase 2 (0.55–1.00): released, falls to target with tumble
            const p = (t - 0.55) / 0.45;
            const e = easeInCubic(p);
            return {
                x: tgt.x,
                y: tgt.y + 24 - 24 * e,
                z: tgt.z,
                yaw: 0,
                tiltX: p * 0.6,                          // tumble during fall
                tiltZ: 0,
                scale: tgt.targetScale,
            };
        },
        effects: {
            onCarrierAppear: 0.0,
            onApproach:       0.30,
            onRelease:        0.55,
            onImpact:         0.97,
            onCarrierDepart:  0.75,
        },
    },
};

function pickModeForKind(kind, explicitMode) {
    if (explicitMode && REVEAL_MODES[explicitMode]) return explicitMode;
    if (!kind) return "scale";
    const k = String(kind).toLowerCase();
    // Round 205 / 208 — themed mode-by-kind table. Order matters: more
    // specific patterns first. Round 208 adds carrier-driven modes for
    // water/sea/sky kinds (sub_surface / boat_dropoff / air_carrier).
    if (/hell|infernal|demonic/.test(k))            return "hellhole";
    if (/cave|earth|primal|mountain|stone/.test(k)) return "cave";
    if (/space|tech|alien|meteor|comet/.test(k))    return "crater";
    if (/sub|underwater|abyss|deep|water|sea|aquatic|reef|tide/.test(k))  return "sub_surface";
    if (/boat|shore|coast|amphib|island/.test(k))   return "boat_dropoff";
    if (/sky|air|cloud|storm|wind/.test(k))         return "air_carrier";
    if (/cannon|launch|ejected/.test(k))            return "cannon";
    if (k.startsWith("kaiju"))                       return "skydrop";
    return "scale";
}

export class BirthSpawner {
    constructor({ ecs, router, assetLoader }) {
        this.ecs         = ecs;
        this.router      = router;
        this.assetLoader = assetLoader;

        this._pending = new Map();
        this._active  = [];

        this.stats = { requested: 0, born: 0, revealed: 0 };
        this.modeStats = {};
        this.onEffect = null;

        if (assetLoader?.onMeshSwap) {
            assetLoader.onMeshSwap((name, oldMesh, newMesh) => {
                if (newMesh) this._onArrival(name);
            });
        }
    }

    request(spec) {
        if (!spec?.assetId) {
            return Promise.reject(new Error("BirthSpawner.request: assetId required"));
        }
        this.stats.requested++;

        if (spec.description && this.assetLoader?.registerDescription) {
            this.assetLoader.registerDescription(spec.assetId, spec.description);
        }

        const cached = this.assetLoader?.cache?.get(spec.assetId);
        if (cached) {
            console.log(`[BirthSpawner] "${spec.assetId}" already cached — instant reveal`);
            return Promise.resolve(this._spawnAndReveal(spec));
        }

        if (this.assetLoader?.setPriority) {
            this.assetLoader.setPriority(spec.assetId, true);
        }
        console.log(`[BirthSpawner] holding birth for "${spec.assetId}" — pipeline running, entity hidden until ready`);
        return new Promise(resolve => {
            this._pending.set(spec.assetId, {
                spec,
                resolve,
                requestedAt: performance.now(),
            });
        });
    }

    _onArrival(assetId) {
        const entry = this._pending.get(assetId);
        if (!entry) return;
        this._pending.delete(assetId);
        const waitedMs = Math.round(performance.now() - entry.requestedAt);
        console.log(`[BirthSpawner] "${assetId}" arrived after ${(waitedMs/1000).toFixed(1)}s — beginning reveal`);
        const id = this._spawnAndReveal(entry.spec);
        entry.resolve(id);
    }

    _spawnAndReveal(spec) {
        const targetScale = spec.scale ?? 1;
        const modeKey  = pickModeForKind(spec.kind, spec.mode);
        const modeDef  = REVEAL_MODES[modeKey] || REVEAL_MODES.scale;
        const offset   = modeDef.spawnOffset(spec);

        const spawnX = spec.x + offset.dx;
        const spawnY = spec.y + offset.dy;
        const spawnZ = spec.z + offset.dz;
        const startScale = Math.max(0.01, targetScale * 0.05);

        const r = this.router.exec({
            type:    "entity:spawnMesh",
            assetId: spec.assetId,
            kind:    spec.kind || "kaiju",
            x: spawnX, y: spawnY, z: spawnZ,
            scale:   startScale,
            yaw:     spec.yaw ?? 0,
        });
        if (!r?.ok || r.id == null) {
            console.warn(`[BirthSpawner] router.exec rejected entity:spawnMesh for "${spec.assetId}"`);
            return null;
        }

        // Round 208 — if the mode defines a carrier, spawn the carrier
        // entity alongside the kaiju. Its trajectory runs in parallel and
        // it gets despawned at t=1 (or when the kaiju reveal completes).
        let carrierEntityId = null;
        if (modeDef.carrier) {
            const cOffset = modeDef.carrier.spawnOffset(spec);
            const cX = spec.x + cOffset.dx;
            const cY = spec.y + cOffset.dy;
            const cZ = spec.z + cOffset.dz;
            const cr = this.router.exec({
                type:    "entity:spawnMesh",
                assetId: modeDef.carrier.assetId,
                kind:    modeDef.carrier.kind,
                x: cX, y: cY, z: cZ,
                scale:   1,
                yaw:     spec.yaw ?? 0,
            });
            if (cr?.ok && cr.id != null) {
                carrierEntityId = cr.id;
                console.log(`[BirthSpawner] carrier "${modeDef.carrier.assetId}" spawned (entity=${carrierEntityId}) at (${cX.toFixed(1)},${cY.toFixed(1)},${cZ.toFixed(1)})`);
            } else {
                console.warn(`[BirthSpawner] carrier spawn rejected for "${modeDef.carrier.assetId}" — carrier asset likely not installed. Run installCarrierAssets() first.`);
            }
        }

        const target = {
            x: spec.x, y: spec.y, z: spec.z,
            targetScale,
        };
        const durMs = spec.revealDurMs ?? modeDef.durMs;
        this._active.push({
            entityId:        r.id,
            carrierEntityId,
            startMs:         performance.now(),
            durMs,
            mode:            modeKey,
            modeDef,
            target,
            assetId:         spec.assetId,
            firedEffects:    new Set(),
        });
        this.modeStats[modeKey] = (this.modeStats[modeKey] || 0) + 1;
        this.stats.born++;
        console.log(`[BirthSpawner] "${spec.assetId}" reveal=${modeKey} dur=${(durMs/1000).toFixed(1)}s offset=(${offset.dx},${offset.dy},${offset.dz})${carrierEntityId ? " +carrier" : ""}`);
        return r.id;
    }

    update(nowMs) {
        for (let i = this._active.length - 1; i >= 0; i--) {
            const a = this._active[i];
            const t = Math.min(1, (nowMs - a.startMs) / a.durMs);
            const frame = a.modeDef.trajectory(t, a.target);

            const pos = this.ecs?.getComponent?.(a.entityId, Position);
            if (pos) {
                pos.x = frame.x;
                pos.y = frame.y;
                pos.z = frame.z;
                if (frame.yaw   !== undefined) pos.yaw   = frame.yaw;
                if (frame.tiltX !== undefined) pos.tiltX = frame.tiltX;
                if (frame.tiltZ !== undefined) pos.tiltZ = frame.tiltZ;
            }
            const rc = this.ecs?.getComponent?.(a.entityId, Render);
            if (rc) {
                rc.scale = frame.scale;
            }

            // Round 208 — drive carrier trajectory if this mode has one
            if (a.carrierEntityId != null && a.modeDef.carrier) {
                const cFrame = a.modeDef.carrier.trajectory(t, a.target);
                const cpos = this.ecs?.getComponent?.(a.carrierEntityId, Position);
                if (cpos) {
                    cpos.x = cFrame.x;
                    cpos.y = cFrame.y;
                    cpos.z = cFrame.z;
                    if (cFrame.yaw   !== undefined) cpos.yaw   = cFrame.yaw;
                    if (cFrame.tiltX !== undefined) cpos.tiltX = cFrame.tiltX;
                    if (cFrame.tiltZ !== undefined) cpos.tiltZ = cFrame.tiltZ;
                }
                const crc = this.ecs?.getComponent?.(a.carrierEntityId, Render);
                if (crc) {
                    crc.scale = cFrame.scale ?? 1;
                }
            }

            const eff = a.modeDef.effects;
            if (eff) {
                for (const name in eff) {
                    const threshold = eff[name];
                    if (t >= threshold && !a.firedEffects.has(name)) {
                        a.firedEffects.add(name);
                        console.log(`[BirthSpawner] effect "${name}" fired for "${a.assetId}" (entity=${a.entityId}, t=${t.toFixed(2)})`);
                        if (typeof this.onEffect === "function") {
                            try { this.onEffect(name, a); } catch (e) {
                                console.warn("[BirthSpawner] onEffect threw:", e?.message || e);
                            }
                        }
                    }
                }
            }

            if (t >= 1) {
                // Round 208 — despawn the carrier entity on completion
                if (a.carrierEntityId != null) {
                    try {
                        this.router.exec({ type: "entity:despawn", id: a.carrierEntityId });
                        console.log(`[BirthSpawner] carrier entity=${a.carrierEntityId} despawned (reveal ${a.mode} complete)`);
                    } catch (e) {
                        console.warn("[BirthSpawner] carrier despawn threw:", e?.message || e);
                    }
                    a.carrierEntityId = null;
                }
                this._active.splice(i, 1);
                this.stats.revealed++;
                console.log(`[BirthSpawner] "${a.assetId}" entity=${a.entityId} reveal=${a.mode} complete`);
            }
        }
    }

    pendingCount()      { return this._pending.size; }
    activeRevealCount() { return this._active.length; }
    snapshot() {
        const now = performance.now();
        return {
            pending: Array.from(this._pending.entries()).map(([assetId, e]) => ({
                assetId,
                waitedMs: Math.round(now - e.requestedAt),
            })),
            active: this._active.map(a => ({
                entityId:    a.entityId,
                assetId:     a.assetId,
                mode:        a.mode,
                progress:    Math.min(1, (now - a.startMs) / a.durMs),
                targetScale: a.target.targetScale,
            })),
            stats: { ...this.stats },
            modeStats: { ...this.modeStats },
        };
    }
}
