// FILE: /simulation/SandboxGameplay.js
// VERSION: v1 — round 285
//
// Gameplay loop for the kaiju city sandbox. Three layered systems
// that turn the sandbox from "smash buildings forever" into something
// with WIN/LOSE state and tactical choice:
//
//   1) CIVILIAN VARIETY — pedestrians have one of four behaviors:
//        flee     — current default, runs away (still ~70% of spawns)
//        cower    — paralyzed in fear, stops moving (small, slow target)
//        hero     — turns toward the kaiju and fires a peashooter pistol
//                   shot every ~1.2s; bullet does light damage on body hit
//        leader   — runs TOWARD other civilians and herds them to a
//                   designated "evac point", boosting their flee speed
//
//   2) SCORE PICKUPS — when a building topples, with some probability
//      it drops a pickup at the rubble center. Three kinds:
//        coin   — +10 score
//        gem    — +50 score and spawns a small visual sparkle particle
//        relic  — +200 score; rare drop from large buildings only
//      Pickups are auto-collected when the kaiju walks within 3 voxels.
//
//   3) MISSIONS — three predefined scenarios with WIN/LOSE conditions:
//        smash_all   — destroy 80% of city buildings within 5 min
//        slaughter   — eat 30 civilians within 3 min
//        spare_icon  — destroy 50% of city WITHOUT destroying the
//                      tallest building (a "national monument")
//      Active mission shown as a HUD strip top-center; score panel
//      bottom-left. Win/lose triggers a KPop toast + scenario ends.
//
// All three systems are independent and gated by enable flags:
//   gameplay.setEnabled(true)            // master switch
//   gameplay.startMission("smash_all")
//   gameplay.cancelMission()
//
// The router.exec entity:spawnMesh + entity:despawn + entity:move
// calls are reused from KaijuSandbox._spawnCivilian for visuals.
//
// Wiring (in main.js after KaijuSandbox is constructed):
//   const gameplay = new SandboxGameplay({
//       sandbox, cityGen, router, world, kpop, kaiju, camera,
//   });
//   window.sandboxGameplay = gameplay;
//   // sandbox tick calls gameplay.tick(dt) — patched once.

const CIVILIAN_BEHAVIORS = ["flee", "cower", "hero", "leader"];

// Distribution of behaviors when spawning. flee dominates so the
// existing "godzilla parts the crowd" vibe still reads.
const BEHAVIOR_WEIGHTS = {
    flee:    0.70,
    cower:   0.15,
    hero:    0.10,
    leader:  0.05,
};

// Score values per pickup kind
const PICKUP_VALUES = {
    coin:  10,
    gem:   50,
    relic: 200,
};

// Drop probabilities per building height tier
//   small (h<=5) — coin 30%, gem 5%, relic 0%
//   mid   (h<=10)— coin 50%, gem 15%, relic 2%
//   tall  (h>10) — coin 70%, gem 30%, relic 10%
function _pickupRoll(buildingHeight) {
    const r = Math.random();
    if (buildingHeight > 10) {
        if (r < 0.10) return "relic";
        if (r < 0.40) return "gem";
        if (r < 1.10) return "coin";   // always at least a coin from tall
        return null;
    }
    if (buildingHeight > 5) {
        if (r < 0.02) return "relic";
        if (r < 0.17) return "gem";
        if (r < 0.67) return "coin";
        return null;
    }
    if (r < 0.05) return "gem";
    if (r < 0.35) return "coin";
    return null;
}

const HERO_FIRE_INTERVAL_MS = 1200;
const HERO_BULLET_SPEED     = 22;      // voxel-units per second
const HERO_BULLET_RANGE     = 35;
const HERO_BULLET_DAMAGE    = 2.5;     // tiny — heroes are pesky, not lethal
const PICKUP_COLLECT_R      = 3;
const PICKUP_TTL_MS         = 45_000;  // pickups vanish after 45s
const LEADER_HERD_RADIUS    = 8;
const LEADER_SPEED_BOOST    = 1.5;     // herded civilians flee faster

const MISSIONS = {
    smash_all: {
        title: "🏙 SMASH THE CITY",
        description: "Destroy 80% of city buildings in 5 minutes",
        timeLimitMs:     5 * 60 * 1000,
        winCondition:    (s) => s.destroyedPct >= 0.80,
        loseCondition:   (s) => s.timeRemaining <= 0,
        progressLabel:   (s) => `${Math.round(s.destroyedPct * 100)}% destroyed · ${Math.ceil(s.timeRemaining / 1000)}s`,
    },
    slaughter: {
        title: "🦖 SLAUGHTER",
        description: "Eat 30 civilians in 3 minutes",
        timeLimitMs:     3 * 60 * 1000,
        winCondition:    (s) => s.civiliansEaten >= 30,
        loseCondition:   (s) => s.timeRemaining <= 0,
        progressLabel:   (s) => `${s.civiliansEaten}/30 eaten · ${Math.ceil(s.timeRemaining / 1000)}s`,
    },
    spare_icon: {
        title: "🗿 SPARE THE ICON",
        description: "Destroy 50% of the city WITHOUT toppling the tallest building",
        timeLimitMs:     6 * 60 * 1000,
        winCondition:    (s) => s.destroyedPct >= 0.50 && !s.iconDestroyed,
        loseCondition:   (s) => s.iconDestroyed || s.timeRemaining <= 0,
        progressLabel:   (s) => s.iconDestroyed
            ? `❌ ICON DESTROYED`
            : `${Math.round(s.destroyedPct * 100)}% · icon standing · ${Math.ceil(s.timeRemaining / 1000)}s`,
    },
};

export class SandboxGameplay {
    constructor({ sandbox, cityGen, router, world, kpop = null, kaiju = null, camera = null }) {
        this.sandbox = sandbox;
        this.cityGen = cityGen;
        this.router  = router;
        this.world   = world;
        this.kpop    = kpop;
        this.kaiju   = kaiju;
        this.camera  = camera;
        this.enabled = false;
        this._pickups = [];                    // {kind, x, y, z, entityId, expiresMs}
        this._iconBuilding = null;             // tallest building captured at mission start
        this._mission = null;                  // { key, def, startMs, ... }
        this._missionState = {
            destroyedPct: 0, civiliansEaten: 0,
            iconDestroyed: false,
            timeRemaining: 0,
        };
        this._score = 0;
        this._hudEl = null;
        this._hudTimerEl = null;
        this._hudScoreEl = null;
        this._unsubBuildingDestroyed = null;
        // Subscribe to city destruction events
        if (this.cityGen?.onBuildingDestroyed) {
            this._unsubBuildingDestroyed = this.cityGen.onBuildingDestroyed(
                ({ building }) => this._onBuildingToppled(building)
            );
        }
    }

    setEnabled(on) {
        this.enabled = !!on;
        if (this.enabled) {
            this._ensureHud();
            // Tag existing civilians with random behaviors
            this._upgradeCivilians();
        } else {
            this._teardownHud();
            this._clearPickups();
        }
    }

    isEnabled() { return this.enabled; }

    // Snapshot for HUD/console
    status() {
        return {
            enabled: this.enabled,
            score: this._score,
            pickups: this._pickups.length,
            mission: this._mission ? { key: this._mission.key, ...this._missionState } : null,
        };
    }

    startMission(key) {
        const def = MISSIONS[key];
        if (!def) {
            console.warn(`[SandboxGameplay] unknown mission "${key}" — try: ${Object.keys(MISSIONS).join(", ")}`);
            return false;
        }
        if (!this.enabled) this.setEnabled(true);
        // Snapshot icon building (tallest at start) for spare_icon
        if (this.cityGen?.buildings?.length) {
            this._iconBuilding = this.cityGen.buildings.reduce(
                (best, b) => (!best || b.h > best.h) ? b : best, null);
        } else {
            this._iconBuilding = null;
        }
        this._mission = { key, def, startMs: performance.now() };
        this._missionState = {
            destroyedPct:    this._computeDestroyedPct(),
            civiliansEaten:  this.sandbox?._eaten?.civilians ?? 0,
            iconDestroyed:   false,
            timeRemaining:   def.timeLimitMs,
        };
        this._refreshHud();
        try {
            this.kpop?.info?.(def.title, def.description);
        } catch {}
        console.log(`[SandboxGameplay] mission started: ${key} — ${def.description}`);
        return true;
    }

    cancelMission() {
        if (!this._mission) return;
        console.log(`[SandboxGameplay] mission "${this._mission.key}" cancelled`);
        this._mission = null;
        this._refreshHud();
    }

    listMissions() {
        return Object.entries(MISSIONS).map(([key, def]) => ({
            key, title: def.title, description: def.description, timeLimitMs: def.timeLimitMs,
        }));
    }

    // -----------------------------------------------------------------
    // Tick — called once per frame from sandbox tick
    // -----------------------------------------------------------------
    tick(dt) {
        if (!this.enabled) return;
        this._tickHeroes(dt);
        this._tickLeaders(dt);
        this._tickPickups(dt);
        this._tickMission(dt);
    }

    // -----------------------------------------------------------------
    // CIVILIAN VARIETY
    // -----------------------------------------------------------------
    _assignBehavior(civilian) {
        if (civilian.behavior) return;
        const r = Math.random();
        let acc = 0;
        for (const [b, w] of Object.entries(BEHAVIOR_WEIGHTS)) {
            acc += w;
            if (r < acc) { civilian.behavior = b; break; }
        }
        if (!civilian.behavior) civilian.behavior = "flee";
        if (civilian.behavior === "hero") {
            civilian._heroLastFireMs = 0;
        }
    }

    // Apply behaviors to all existing civilians in the sandbox.
    // Called when gameplay is first enabled — gives instant variety
    // to anyone already on the street.
    _upgradeCivilians() {
        const civilians = this.sandbox?._civilians;
        if (!Array.isArray(civilians)) return;
        for (const c of civilians) this._assignBehavior(c);
    }

    // Override the per-tick civilian movement so flee/cower/hero/leader
    // each move differently. Called from sandbox _tickCivilians via a
    // patch (see _patchSandboxCivilianTick).
    _modulateCivilianStep(c, baseSpeed, dt, kaijuX, kaijuZ) {
        // Ensure behavior assigned (lazy)
        this._assignBehavior(c);
        switch (c.behavior) {
            case "cower":
                // Don't move. Maybe an occasional shiver via tiny jitter.
                return 0;
            case "hero": {
                // Hero stops, turns toward the kaiju. Movement = 0.
                // Firing handled in _tickHeroes.
                return 0;
            }
            case "leader":
                // Leader moves the same speed as flee, but slightly slower
                // to "lead" the herd. Speed-boost effect is applied to
                // nearby flee civilians in _tickLeaders.
                return baseSpeed * 0.85;
            case "flee":
            default:
                // Flee with optional herding boost
                return c._herded ? baseSpeed * LEADER_SPEED_BOOST : baseSpeed;
        }
    }

    _tickHeroes(dt) {
        const civilians = this.sandbox?._civilians;
        if (!Array.isArray(civilians) || civilians.length === 0) return;
        const kx = this.camera?.position?.x ?? 0;
        const kz = this.camera?.position?.z ?? 0;
        const now = performance.now();
        for (const c of civilians) {
            if (c.behavior !== "hero") continue;
            if (!c._heroLastFireMs) c._heroLastFireMs = now;
            if (now - c._heroLastFireMs < HERO_FIRE_INTERVAL_MS) continue;
            c._heroLastFireMs = now;
            // Compute direction to kaiju
            const dx = kx - c.x, dz = kz - c.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.001 || dist > HERO_BULLET_RANGE) continue;
            // Apply tiny damage if in close range — symbolic but visible
            if (this.kaiju?.takeDamage && dist < HERO_BULLET_RANGE) {
                try { this.kaiju.takeDamage(HERO_BULLET_DAMAGE); }
                catch {
                    // Some kaiju controllers don't expose takeDamage; fall back to growth penalty
                    if (this.sandbox && typeof this.sandbox._size === "number") {
                        // 0.05 voxels worth of shrinking per hit
                        this.sandbox._size = Math.max(0.5, this.sandbox._size - 0.005);
                    }
                }
            }
            // Visual: tiny tracer via router (best-effort)
            try {
                this.router?.exec?.({
                    type:  "particle:spawn",
                    kind:  "tracer",
                    x: c.x, y: c.y + 0.5, z: c.z,
                    vx: (dx / dist) * HERO_BULLET_SPEED,
                    vy: 0,
                    vz: (dz / dist) * HERO_BULLET_SPEED,
                    life: 0.4,
                });
            } catch {}
        }
    }

    _tickLeaders(dt) {
        const civilians = this.sandbox?._civilians;
        if (!Array.isArray(civilians) || civilians.length === 0) return;
        // Reset herded flag
        for (const c of civilians) c._herded = false;
        // For each leader, mark nearby fleers as herded for this tick
        for (const leader of civilians) {
            if (leader.behavior !== "leader") continue;
            for (const other of civilians) {
                if (other === leader || other.behavior !== "flee") continue;
                const dx = other.x - leader.x, dz = other.z - leader.z;
                if (dx*dx + dz*dz < LEADER_HERD_RADIUS * LEADER_HERD_RADIUS) {
                    other._herded = true;
                }
            }
        }
    }

    // -----------------------------------------------------------------
    // PICKUPS
    // -----------------------------------------------------------------
    _onBuildingToppled(b) {
        if (!this.enabled) return;
        // Mission: icon-destroy check
        if (this._iconBuilding && b === this._iconBuilding) {
            this._missionState.iconDestroyed = true;
        }
        // Score for the kaiju directly
        this._addScore(Math.round(b.h * 5));
        // Drop pickup with probability based on height
        const kind = _pickupRoll(b.h);
        if (!kind) return;
        const cx = b.x + b.w / 2;
        const cz = b.z + b.d / 2;
        const cy = (this.cityGen?._lastStamp?.groundY ?? 0) + 2;
        let entityId = null;
        try {
            const r = this.router?.exec?.({
                type: "entity:spawnMesh",
                assetId: kind === "relic" ? "wad_pickup_kaiju" : "wad_pickup_health",
                kind: `pickup_${kind}`,
                x: cx, y: cy, z: cz,
                scale: kind === "relic" ? 0.9 : 0.6,
            });
            entityId = r?.id ?? null;
        } catch {}
        this._pickups.push({
            kind, x: cx, y: cy, z: cz, entityId,
            expiresMs: performance.now() + PICKUP_TTL_MS,
        });
    }

    _tickPickups(dt) {
        if (this._pickups.length === 0) return;
        const kx = this.camera?.position?.x ?? 0;
        const kz = this.camera?.position?.z ?? 0;
        const r2 = PICKUP_COLLECT_R * PICKUP_COLLECT_R;
        const now = performance.now();
        for (let i = this._pickups.length - 1; i >= 0; i--) {
            const p = this._pickups[i];
            const dx = p.x - kx, dz = p.z - kz;
            // Collect
            if (dx*dx + dz*dz < r2) {
                this._collectPickup(p, i);
                continue;
            }
            // Expire
            if (now > p.expiresMs) {
                this._despawnPickup(p, i);
            }
        }
    }

    _collectPickup(p, idx) {
        const value = PICKUP_VALUES[p.kind] ?? 0;
        this._addScore(value);
        // Sparkle on gem/relic
        if ((p.kind === "gem" || p.kind === "relic") && this.router?.exec) {
            for (let n = 0; n < (p.kind === "relic" ? 12 : 5); n++) {
                try {
                    this.router.exec({
                        type: "particle:spawn", kind: "spark",
                        x: p.x, y: p.y, z: p.z,
                        vx: (Math.random() - 0.5) * 6,
                        vy: 3 + Math.random() * 4,
                        vz: (Math.random() - 0.5) * 6,
                        life: 1.2,
                    });
                } catch {}
            }
        }
        // KPop toast on relic — they're special
        if (p.kind === "relic" && this.kpop?.info) {
            try { this.kpop.info("🏆 RELIC", `+${value} score`); } catch {}
        }
        this._despawnPickup(p, idx);
    }

    _despawnPickup(p, idx) {
        try {
            if (p.entityId != null) this.router?.exec?.({ type: "entity:despawn", id: p.entityId });
        } catch {}
        this._pickups.splice(idx, 1);
    }

    _clearPickups() {
        for (let i = this._pickups.length - 1; i >= 0; i--) {
            this._despawnPickup(this._pickups[i], i);
        }
    }

    _addScore(n) {
        this._score += n;
        this._refreshScoreHud();
    }

    // -----------------------------------------------------------------
    // MISSION TRACKING
    // -----------------------------------------------------------------
    _computeDestroyedPct() {
        const buildings = this.cityGen?.buildings ?? [];
        if (buildings.length === 0) return 0;
        const destroyed = buildings.filter(b => b.state === "toppled").length;
        return destroyed / buildings.length;
    }

    _tickMission(dt) {
        if (!this._mission) { this._refreshHud(); return; }
        const elapsed = performance.now() - this._mission.startMs;
        this._missionState.destroyedPct   = this._computeDestroyedPct();
        this._missionState.civiliansEaten = this.sandbox?._eaten?.civilians ?? 0;
        this._missionState.timeRemaining  = Math.max(0, this._mission.def.timeLimitMs - elapsed);
        this._refreshHud();
        // Win/lose
        if (this._mission.def.winCondition(this._missionState)) {
            this._endMission(true);
        } else if (this._mission.def.loseCondition(this._missionState)) {
            this._endMission(false);
        }
    }

    _endMission(won) {
        const title = won ? "🏆 MISSION COMPLETE" : "💥 MISSION FAILED";
        const msg = won
            ? `${this._mission.def.title} — final score: ${this._score}`
            : `${this._mission.def.title} — score: ${this._score}`;
        try {
            if (won) this.kpop?.info?.(title, msg);
            else     this.kpop?.warn?.(title, msg);
        } catch {}
        console.log(`[SandboxGameplay] ${won ? "WON" : "LOST"}: ${this._mission.key}`);
        this._mission = null;
        this._refreshHud();
    }

    // -----------------------------------------------------------------
    // HUD
    // -----------------------------------------------------------------
    _ensureHud() {
        if (this._hudEl) return;
        const hud = document.createElement("div");
        hud.className = "sandbox-gameplay-hud";
        hud.style.cssText = [
            "position:fixed",
            "top:54px",
            "left:50%",
            "transform:translateX(-50%)",
            "z-index:7500",
            "background:rgba(8, 12, 20, 0.88)",
            "border:1px solid #345",
            "border-radius:6px",
            "padding:6px 14px",
            "font:11px monospace",
            "color:#9ef",
            "display:none",
            "min-width:260px",
            "text-align:center",
            "box-shadow:0 2px 10px rgba(0,0,0,0.5)",
        ].join(";");
        hud.innerHTML = `
            <div class="sg-title"   style="color:#fc8; font-size:12px; font-weight:bold;"></div>
            <div class="sg-progress" style="color:#9ef; font-size:10px; margin-top:2px;"></div>
        `;
        document.body.appendChild(hud);
        this._hudEl = hud;
        // Score panel — bottom-left
        const score = document.createElement("div");
        score.className = "sandbox-gameplay-score";
        score.style.cssText = [
            "position:fixed",
            "bottom:50px",
            "left:16px",
            "z-index:7500",
            "background:rgba(8, 12, 20, 0.88)",
            "border:1px solid #345",
            "border-radius:6px",
            "padding:5px 10px",
            "font:11px monospace",
            "color:#fc8",
        ].join(";");
        score.innerHTML = `<span style="color:#789">score</span> <span class="sg-score-val" style="font-weight:bold;">0</span>`;
        document.body.appendChild(score);
        this._hudScoreEl = score.querySelector(".sg-score-val");
        this._scoreContainer = score;
        this._refreshScoreHud();
    }

    _teardownHud() {
        if (this._hudEl) { this._hudEl.remove(); this._hudEl = null; }
        if (this._scoreContainer) { this._scoreContainer.remove(); this._scoreContainer = null; this._hudScoreEl = null; }
    }

    _refreshHud() {
        if (!this._hudEl) return;
        if (!this._mission) {
            this._hudEl.style.display = "none";
            return;
        }
        this._hudEl.style.display = "block";
        const t  = this._hudEl.querySelector(".sg-title");
        const pr = this._hudEl.querySelector(".sg-progress");
        if (t) t.textContent = this._mission.def.title;
        if (pr) pr.textContent = this._mission.def.progressLabel(this._missionState);
    }

    _refreshScoreHud() {
        if (this._hudScoreEl) this._hudScoreEl.textContent = String(this._score);
    }

    dispose() {
        if (this._unsubBuildingDestroyed) this._unsubBuildingDestroyed();
        this._teardownHud();
        this._clearPickups();
    }
}
