// FILE: scripting/EventScriptBinder.js
// VERSION: v1
//
// Maps civilization lifecycle events to demo specs and plays them via
// applyDemo. Each event type gets a distinct cinematic personality so
// the auto-camera reads as intentional storytelling rather than a
// random teleporter:
//
//   birth    → approach-and-reveal (high overhead → settled 3/4 view)
//   expand   → celebratory orbit (sweep across the civ)
//   collapse → slow worried zoom (lingering on the troubled civ)
//   death    → lingering ruin shot (long single-frame hold on remains)
//
// Three guards keep the binder from being annoying:
//
//   1. User-activity timer — keyboard / mouse / wheel events bump a
//      _userActiveUntil timestamp. Cinematics suppress while the user
//      has touched controls in the last USER_QUIET_MS.
//   2. Per-binder cooldown so multiple events in close succession
//      don't all play; only the first within the cooldown window.
//   3. Global enabled toggle for an off switch (wired to the
//      Settings panel).

const USER_QUIET_MS  = 4000;        // ignore events while user is active
const COOLDOWN_MS    = 8000;        // min ms between scripted plays

export class EventScriptBinder {
    constructor({ events, civManager, applyDemo, options = {} }) {
        this.events       = events;
        this.civManager   = civManager;
        this.applyDemo    = applyDemo;
        this.enabled      = options.enabled ?? true;
        this.cooldownMs   = options.cooldownMs ?? COOLDOWN_MS;
        this.userQuietMs  = options.userQuietMs ?? USER_QUIET_MS;
        this._lastPlayMs  = -Infinity;
        this._userActiveUntil = 0;

        events.subscribe((evt) => this._onEvent(evt));

        // User-activity detection — bump the suppress window on any
        // user input. Pointer-locked WASD flies repeatedly fire
        // keydown so the timer stays fresh; pointer-unlocked mouse
        // move alone does NOT count as "active control" since the
        // camera is unaffected without lock.
        const bump = () => this.noteUserActivity();
        window.addEventListener("keydown",   bump);
        window.addEventListener("mousedown", bump);
        window.addEventListener("wheel",     bump, { passive: true });

        console.log("[EventScriptBinder] v1 ready (cooldown=" + this.cooldownMs + "ms, quiet=" + this.userQuietMs + "ms)");
    }

    setEnabled(v) { this.enabled = !!v; }
    isEnabled()   { return this.enabled; }

    noteUserActivity() {
        this._userActiveUntil = performance.now() + this.userQuietMs;
    }

    // ---- internals ---------------------------------------------------

    _onEvent(evt) {
        if (!this.enabled) return;
        const now = performance.now();
        if (now < this._userActiveUntil) return;
        if (now - this._lastPlayMs < this.cooldownMs) return;

        // Events that read entirely from the evt payload (no civ
        // lookup needed): all kaiju_*, model_placed, plus civ_conflict
        // and civ_victory which read both sides' positions from extras.
        const isKaijuEvent = evt.type && evt.type.startsWith("kaiju_");
        const isWorldEvent = evt.type === "model_placed" ||
                             evt.type === "civ_conflict" ||
                             evt.type === "civ_victory";

        // Civ lookup only needed for civ-typed events
        let civ = null;
        if (!isKaijuEvent && !isWorldEvent) {
            civ = this._lookupCiv(evt.civId);
            if (!civ && evt.type !== "death") return;

            // For death we synthesize a minimal stand-in from the event
            // payload so the cinematic can still play. v2.24x added
            // civName/civStyle to the event, so even post-mortem shots
            // get the real name.
            if (!civ) {
                civ = {
                    id: evt.civId,
                    name: evt.civName ?? `Civ ${evt.civId}`,
                    center: { x: evt.x, y: evt.y, z: evt.z },
                    style: evt.civStyle ?? "unknown",
                };
            }
        }

        const spec = this._specForEvent(evt, civ);
        if (!spec) return;

        this.applyDemo(spec);
        this._lastPlayMs = now;
        console.log(`[EventScriptBinder] ${evt.type} → "${spec.name}"`);
    }

    _lookupCiv(id) {
        for (const c of this.civManager.getAll()) {
            if (c.id === id) return c;
        }
        return null;
    }

    _specForEvent(evt, civ) {
        switch (evt.type) {
            case "birth":    return this._birthSpec(civ);
            case "expand":   return this._expandSpec(civ);
            case "collapse": return this._collapseSpec(civ);
            case "death":    return this._deathSpec(civ);
            // Round 10 — civ desperation summon
            case "summon_kaiju": return this._summonSpec(civ);
            // Kaiju events — civ may be null since kaiju target lookup
            // works through the event payload directly
            case "kaiju_spawn":   return this._kaijuSpawnSpec(evt);
            case "kaiju_engage":  return this._kaijuEngageSpec(evt);
            case "kaiju_clash":   return this._kaijuClashSpec(evt);
            case "kaiju_victory": return this._kaijuVictorySpec(evt);
            case "kaiju_death":   return this._kaijuDeathSpec(evt);
            case "kaiju_queen_rises": return this._kaijuQueenRisesSpec(evt);
            case "kaiju_king_rises":  return this._kaijuKingRisesSpec(evt);
            case "kaiju_throws":      return this._kaijuThrowsSpec(evt);
            case "kaiju_duel":        return this._kaijuDuelSpec(evt);
            case "mech_detonate":     return this._mechDetonateSpec(evt);
            // Round 12 — first-run procedural creature placement
            case "model_placed":  return this._modelPlacedSpec(evt);
            // Round 13 — civ vs civ war
            case "civ_conflict":  return this._civConflictSpec(evt);
            case "civ_victory":   return this._civVictorySpec(evt);
            case "megaproject_complete": return this._megaprojectCompleteSpec(evt);
        }
        return null;
    }

    // ---- per-event demo specs ---------------------------------------
    // Camera math reuses the formula from CivilizationPanel._snapTo:
    // for offset (offX, offY, offZ) from the civ, looking back at
    // civ:
    //   yaw   = atan2(-offX, offZ)
    //   pitch = atan2(-offY, sqrt(offX^2 + offZ^2))

    // Birth: high overhead (60 above) → settle to 3/4 isometric. Two
    // steps, total ~5s. Reads as "we discovered something new, here it
    // is."
    _birthSpec(civ) {
        const cx = civ.center.x, cy = civ.center.y, cz = civ.center.z;
        return {
            name: `Birth: ${civ.name}`,
            description: `New civilization "${civ.name}" appeared`,
            sequence: [
                {   // High approach
                    camera: makeLookAt(cx, cy, cz, 30, 60, 30),
                    duration: 2.5,
                },
                {   // Settle to 3/4 view
                    camera: makeLookAt(cx, cy, cz, 14, 20, 14),
                    duration: 2.5,
                },
            ],
        };
    }

    // Expand: celebratory orbit. Camera sweeps from one side to the
    // other at constant elevation. ~5s.
    _expandSpec(civ) {
        const cx = civ.center.x, cy = civ.center.y, cz = civ.center.z;
        const r = 18, h = 18;
        return {
            name: `Expand: ${civ.name}`,
            description: `${civ.name} (${civ.style}) expands its influence`,
            sequence: [
                {
                    camera: makeLookAt(cx, cy, cz, +r, h, 0),
                    duration: 2.0,
                },
                {
                    camera: makeLookAt(cx, cy, cz, 0, h, +r),
                    duration: 3.0,
                },
            ],
        };
    }

    // Collapse: slow worried approach. Single-step zoom in from
    // medium distance. ~4s of held pressure.
    _collapseSpec(civ) {
        const cx = civ.center.x, cy = civ.center.y, cz = civ.center.z;
        return {
            name: `Collapse: ${civ.name}`,
            description: `${civ.name} (${civ.style}) is in decline`,
            sequence: [
                {
                    camera: makeLookAt(cx, cy, cz, 24, 28, 24),
                    duration: 1.0,
                },
                {
                    camera: makeLookAt(cx, cy, cz, 10, 14, 10),
                    duration: 4.0,
                },
            ],
        };
    }

    // Death: long final shot. Single linger frame held at moderate
    // distance — gives the user time to see the abandoned structure.
    _deathSpec(civ) {
        const cx = civ.center.x, cy = civ.center.y, cz = civ.center.z;
        return {
            name: `End: ${civ.name}`,
            description: `${civ.name} (${civ.style}) has fallen`,
            sequence: [
                {
                    camera: makeLookAt(cx, cy, cz, 16, 12, 16),
                    duration: 5.0,
                },
            ],
        };
    }

    // Round 10 — civ desperation summon. Frames the dying civ at the
    // moment they call for help. Two-step: wide establishing showing
    // the civ in its territory, then closer view as the summon happens.
    _summonSpec(civ) {
        const cx = civ.center.x, cy = civ.center.y, cz = civ.center.z;
        return {
            name: `Summons: ${civ.name}`,
            description: `${civ.name} desperately calls for aid`,
            sequence: [
                {   // Wide establishing — civ in distress
                    camera: makeLookAt(cx, cy + 4, cz, 28, 26, 28),
                    duration: 2.0,
                },
                {   // Closer — the moment of summon
                    camera: makeLookAt(cx, cy + 4, cz, 14, 14, 14),
                    duration: 3.0,
                },
            ],
        };
    }

    // ---- kaiju event specs --------------------------------------------

    // Kaiju spawn: dramatic pull-back showing the entrance. Focal Y
    // is origin-aware — sky/space frame the descent path, the others
    // frame the surface where the creature emerges from below.
    _kaijuSpawnSpec(evt) {
        const kx = evt.x, kz = evt.z;
        const name = evt.kaijuName ?? `Kaiju ${evt.kaijuId}`;
        const origin = evt.kaijuOrigin ?? "sky";

        // Per-origin focal height — where the action is happening
        const focalY =
            origin === "space"       ? 60 :
            origin === "sky"         ? 45 :
            origin === "underground" ? 18 :
            origin === "cave"        ? 16 :
            origin === "water"       ? 12 :
            origin === "hell"        ? 14 :
                                       30;

        return {
            name: `Kaiju arrives: ${name}`,
            description: `${name} emerges from the ${origin}`,
            sequence: [
                {   // Wide pull-back catching the entrance
                    camera: makeLookAt(kx, focalY, kz, 45, 30, 45),
                    duration: 2.0,
                },
                {   // Close in as the kaiju approaches/lands
                    camera: makeLookAt(kx, focalY, kz, 25, 22, 25),
                    duration: 3.5,
                },
            ],
        };
    }

    // Kaiju engagement: combat side-view framing both the kaiju and
    // its target civ. Two-step approach into the fight.
    _kaijuEngageSpec(evt) {
        const kx = evt.x, ky = evt.y, kz = evt.z;
        const name = evt.kaijuName ?? `Kaiju ${evt.kaijuId}`;
        return {
            name: `Combat: ${name}`,
            description: `${name} engages a civilization`,
            sequence: [
                {   // Drop in from above
                    camera: makeLookAt(kx, ky, kz, 20, 30, 20),
                    duration: 1.5,
                },
                {   // Settle to side-view
                    camera: makeLookAt(kx, ky, kz, 14, 12, 14),
                    duration: 4.0,
                },
            ],
        };
    }

    // Kaiju death: slow somber pull-back over the fallen creature.
    _kaijuDeathSpec(evt) {
        const kx = evt.x, ky = evt.y, kz = evt.z;
        const name = evt.kaijuName ?? `Kaiju ${evt.kaijuId}`;
        return {
            name: `Fallen: ${name}`,
            description: `${name} has been slain`,
            sequence: [
                {
                    camera: makeLookAt(kx, ky, kz, 18, 16, 18),
                    duration: 5.5,
                },
            ],
        };
    }

    // Kaiju clash: two kaiju enter combat. Camera frames the midpoint
    // between them so both fit on screen. Two-step approach: wide
    // establishing shot, then closer side-view of the fight.
    _kaijuClashSpec(evt) {
        const ax = evt.x, az = evt.z;
        const bx = evt.otherX ?? evt.x, bz = evt.otherZ ?? evt.z;
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const my = 22;
        const aName = evt.kaijuName ?? `Kaiju ${evt.kaijuId}`;
        const bName = evt.otherKaijuName ?? `Kaiju ${evt.otherKaijuId}`;
        // Compute perpendicular axis between the duelists for side-view
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz) || 1;
        const perpX = -dz / len * 22;
        const perpZ =  dx / len * 22;
        return {
            name: `Duel: ${aName} vs ${bName}`,
            description: `${aName} and ${bName} enter combat`,
            sequence: [
                {   // Wide establishing — both visible from elevation
                    camera: makeLookAt(mx, my, mz, 30, 24, 30),
                    duration: 2.0,
                },
                {   // Side-view between the duelists — perpendicular to their axis
                    camera: makeLookAt(mx, my, mz, perpX, 6, perpZ),
                    duration: 3.0,
                },
                {   // Close orbital view from opposite side
                    camera: makeLookAt(mx, my - 4, mz, -perpX * 0.6, 4, -perpZ * 0.6),
                    duration: 3.0,
                },
            ],
        };
    }

    // Kaiju victory: slow zoom holding on the survivor. Long duration
    // so the moment lands.
    _kaijuVictorySpec(evt) {
        const kx = evt.x, ky = evt.y, kz = evt.z;
        const name = evt.kaijuName ?? `Kaiju ${evt.kaijuId}`;
        const victim = evt.victimKaijuName ?? "another kaiju";
        return {
            name: `Victory: ${name}`,
            description: `${name} has slain ${victim}`,
            sequence: [
                {   // Establishing
                    camera: makeLookAt(kx, ky, kz, 22, 20, 22),
                    duration: 1.5,
                },
                {   // Slow zoom in on the victor
                    camera: makeLookAt(kx, ky, kz, 11, 12, 11),
                    duration: 4.5,
                },
            ],
        };
    }

    // Round 20 — kaiju queen ascension. Reverent reveal: high-angle
    // approach, hold close. Captures the new monarch's larger form.
    _kaijuQueenRisesSpec(evt) {
        const kx = evt.x, ky = evt.y, kz = evt.z;
        const name = evt.kaijuName ?? `Kaiju ${evt.kaijuId}`;
        const kind = evt.kaijuKind ?? "kaiju";
        return {
            name: `Ascension: ${name}`,
            description: `${name} ascends as queen of the ${kind}`,
            sequence: [
                {   // High approach — descending camera over the queen
                    camera: makeLookAt(kx, ky + 4, kz, 22, 28, 22),
                    duration: 2.0,
                },
                {   // Slow close hold — the new sovereign
                    camera: makeLookAt(kx, ky + 4, kz, 10, 16, 10),
                    duration: 4.0,
                },
            ],
        };
    }

    // Round 36 — KING ascension. More dramatic than queen rise:
    // longer hold, multi-stage rotation around the king. Triple shot.
    _kaijuKingRisesSpec(evt) {
        const kx = evt.x, ky = evt.y, kz = evt.z;
        const name = evt.kaijuName ?? `Kaiju ${evt.kaijuId}`;
        const kind = evt.kaijuKind ?? "kaiju";
        return {
            name: `Coronation: ${name}`,
            description: `${name} ascends as KING across the ${kind}`,
            sequence: [
                {   // Wide establishing — sky view dropping in
                    camera: makeLookAt(kx, ky + 4, kz, 30, 38, 30),
                    duration: 2.0,
                },
                {   // Mid-shot orbital around the king
                    camera: makeLookAt(kx, ky + 4, kz, -16, 14, 24),
                    duration: 3.0,
                },
                {   // Close hold — the new ruler
                    camera: makeLookAt(kx, ky + 4, kz, 8, 12, 8),
                    duration: 3.5,
                },
            ],
        };
    }

    // Round 36 — throw cinematic. When a kaiju hurls a tree, snap to
    // a side-view that follows the arc kaiju → target. Short shot
    // (~3s) so the next event can take the camera quickly.
    _kaijuThrowsSpec(evt) {
        const fx = evt.fromX ?? evt.x;
        const fy = evt.fromY ?? evt.y;
        const fz = evt.fromZ ?? evt.z;
        const tx = evt.toX ?? evt.otherX ?? fx;
        const ty = evt.toY ?? evt.otherY ?? fy;
        const tz = evt.toZ ?? evt.otherZ ?? fz;
        const mx = (fx + tx) / 2;
        const my = Math.max(fy, ty) + 6;       // above the arc apex
        const mz = (fz + tz) / 2;
        const name = evt.kaijuName ?? `Kaiju ${evt.kaijuId}`;
        // Side-view perpendicular to the throw line
        const dx = tx - fx, dz = tz - fz;
        const len = Math.hypot(dx, dz) || 1;
        const perpX = -dz / len * 18;          // 18 units to the side
        const perpZ =  dx / len * 18;
        return {
            name: `Throw: ${name}`,
            description: `${name} hurls a tree`,
            sequence: [
                {   // Side-view of the arc, level with apex
                    camera: makeLookAt(mx, my, mz, perpX, 4, perpZ),
                    duration: 2.8,
                },
            ],
        };
    }

    // Round 36 — duel cinematic. Two kaiju mutually targeting each
    // other → 3-stage reveal: wide establishing of the duel arena,
    // side-view perpendicular to the kaiju-A↔kaiju-B line, then
    // pull-around for orbital sweep across both fighters.
    _kaijuDuelSpec(evt) {
        const ax = evt.aX ?? evt.x, ay = evt.aY ?? evt.y, az = evt.aZ ?? evt.z;
        const bx = evt.bX ?? evt.x, by = evt.bY ?? evt.y, bz = evt.bZ ?? evt.z;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const mz = (az + bz) / 2;
        const aName = evt.kaijuAName ?? "kaiju";
        const bName = evt.kaijuBName ?? "kaiju";
        // Perpendicular to A→B for the side view
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz) || 1;
        const perpX = -dz / len * 24;
        const perpZ =  dx / len * 24;
        return {
            name: `Duel: ${aName} vs ${bName}`,
            description: `${aName} clashes with ${bName}`,
            sequence: [
                {   // Wide establishing from above
                    camera: makeLookAt(mx, my + 4, mz, 22, 28, 22),
                    duration: 2.0,
                },
                {   // Side view perpendicular to the duel axis
                    camera: makeLookAt(mx, my + 6, mz, perpX, 8, perpZ),
                    duration: 2.5,
                },
                {   // Reverse side for orbital pull-around
                    camera: makeLookAt(mx, my + 6, mz, -perpX * 0.9, 6, -perpZ * 0.9),
                    duration: 3.0,
                },
            ],
        };
    }

    // Round 40 — mech detonation cinematic. Wide pull-back from blast
    // site, then high orbital sweep to show the mushroom column +
    // surviving kings. Total ~6.5s — overlaps with the 4s eject flight
    // so player sees the cinematic on TV-wall while their own camera
    // is launching skyward.
    _mechDetonateSpec(evt) {
        const ox = evt.x, oy = evt.y, oz = evt.z;
        return {
            name: `Mech Self-Destruct`,
            description: `${evt.killed ?? 0} kaiju vaporized, ${evt.survived ?? 0} kings survived`,
            sequence: [
                {   // Wide overhead — frame the blast
                    camera: makeLookAt(ox, oy + 6, oz, 28, 38, 28),
                    duration: 2.5,
                },
                {   // Orbit pull around mushroom column
                    camera: makeLookAt(ox, oy + 12, oz, -32, 22, 18),
                    duration: 2.0,
                },
                {   // Aftermath — low-angle long pan over scorched ground
                    camera: makeLookAt(ox, oy + 4, oz, 12, 6, -28),
                    duration: 2.0,
                },
            ],
        };
    }

    // Round 12 — model_placed cinematic. Each Ollama-generated
    // creature triggers one of these as it materializes during
    // first-run population. Wide entry then closer hold so the
    // user can see the creature emerge from the void.
    _modelPlacedSpec(evt) {
        const mx = evt.x, my = evt.y, mz = evt.z;
        const name = evt.modelName ?? "creature";
        return {
            name: `Behold: ${name}`,
            description: `${name} materializes into being`,
            sequence: [
                {   // Wide entry — descending angle
                    camera: makeLookAt(mx, my, mz, 14, 18, 14),
                    duration: 2.0,
                },
                {   // Close hold
                    camera: makeLookAt(mx, my, mz, 6, 6, 6),
                    duration: 3.0,
                },
            ],
        };
    }

    // Round 13 — civ_conflict cinematic. Two civs enter mutual
    // hostility. Frames the midpoint between their territories so
    // both centers are in shot. Wide establishing then closer
    // side-view of the boundary between them.
    _civConflictSpec(evt) {
        const ax = evt.x, ay = evt.y, az = evt.z;
        const bx = evt.otherX ?? evt.x;
        const by = evt.otherY ?? evt.y;
        const bz = evt.otherZ ?? evt.z;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2 + 4;
        const mz = (az + bz) / 2;
        const aName = evt.civName       ?? "Unknown";
        const bName = evt.otherCivName  ?? "Unknown";
        return {
            name: `War: ${aName} vs ${bName}`,
            description: `${aName} and ${bName} enter open conflict`,
            sequence: [
                {   // Wide establishing — both civs visible
                    camera: makeLookAt(mx, my, mz, 32, 28, 32),
                    duration: 2.0,
                },
                {   // Closer — boundary between them
                    camera: makeLookAt(mx, my, mz, 18, 16, 18),
                    duration: 4.0,
                },
            ],
        };
    }

    // Round 13 — civ_victory cinematic. Civ defeats another in war.
    // Slow pull-back from the survivor's territory, suggesting
    // dominion over a wider region.
    _civVictorySpec(evt) {
        const cx = evt.x, cy = evt.y, cz = evt.z;
        const aName = evt.civName       ?? "Unknown";
        const dName = evt.defeatedCivName ?? "their rival";
        return {
            name: `Conquest: ${aName}`,
            description: `${aName} has triumphed over ${dName}`,
            sequence: [
                {   // Close on the victor
                    camera: makeLookAt(cx, cy + 4, cz, 12, 12, 12),
                    duration: 2.0,
                },
                {   // Pull back showing the territory now claimed
                    camera: makeLookAt(cx, cy + 4, cz, 28, 24, 28),
                    duration: 4.0,
                },
            ],
        };
    }

    // Round 25 — megastructure completion. Three-stage reveal:
    // close low approach to the keystone glow, rise to mid-shot
    // showing whole structure, pull back to landscape context.
    _megaprojectCompleteSpec(evt) {
        const mx = evt.megaX ?? evt.x, my = evt.megaY ?? evt.y, mz = evt.megaZ ?? evt.z;
        const cName = evt.civName ?? "A civilization";
        const mName = evt.megaName ?? "their monument";
        return {
            name: `Completion: ${mName}`,
            description: `${cName} completes ${mName}`,
            sequence: [
                {   // Close on the apex/keystone — bloom catches MEMORY block
                    camera: makeLookAt(mx, my + 8, mz, 6, 4, 6),
                    duration: 2.5,
                },
                {   // Rise to mid-shot showing the whole structure
                    camera: makeLookAt(mx, my + 6, mz, 18, 14, 18),
                    duration: 3.0,
                },
                {   // Pull back to landscape, structure in foreground
                    camera: makeLookAt(mx, my + 6, mz, 35, 25, 35),
                    duration: 3.5,
                },
            ],
        };
    }
}

// Helper — given a target (cx,cy,cz) and an offset (offX,offY,offZ)
// from the target to the camera, return a {x,y,z,yaw,pitch} that
// places the camera at target+offset and looks back at the target.
function makeLookAt(cx, cy, cz, offX, offY, offZ) {
    const horiz = Math.sqrt(offX * offX + offZ * offZ);
    return {
        x: cx + offX,
        y: cy + offY,
        z: cz + offZ,
        yaw:   Math.atan2(-offX, offZ),
        pitch: horiz > 0 ? Math.atan2(-offY, horiz) : (offY > 0 ? -Math.PI / 2 : Math.PI / 2),
    };
}
