// civRetaliation.js -- minimal civ defense (GPU Brain phase 5).
//
// The "civ-defender policies" item needed an actual defense mechanism to
// make decisions about; none existed (it sat in the ideas backlog). This
// is that mechanism, kept deliberately small: a threatened civilization
// fires a retaliation bolt at the nearest kaiju in range, riding the
// EXISTING ProjectileManager end to end -- ballistic arc, smoke trail,
// impact splash damage. Its friendly-fire skip matches ownerKaijuId
// only, and civ bolts have no owner kaiju, so they damage kaiju exactly
// as intended.
//
// DECISION: window.getBrainCivDefense(civId) -> { shoot, score } when the
// GPU brain is running (scored from the threat field + civ health); the
// fallback heuristic is shoot-when-threatened-and-healthy. Either way
// the mechanism below enforces cooldown, range, and energy cost.
//
// Wire-up (one line in main.js after managers exist):
//   civRetaliation.init({ civManager, kaijuManager, projectileManager });
// and in the loop: civRetaliation.tick(dt);

const COOLDOWN_S = 6.0;       // per-civ
const RANGE = 45;
const ENERGY_COST = 0.02;
const MIN_ENERGY = 0.25;      // don't shoot yourself to death
const DAMAGE_MUL = 0.9;

export const civRetaliation = {
    _refs: null,
    _cd: new Map(),           // civId -> next-allowed time (s)
    _t: 0,
    stats: { shots: 0, held: 0 },

    init(refs) { this._refs = refs; },

    tick(dt) {
        if (!this._refs) return;
        this._t += dt;
        const { civManager, kaijuManager, projectileManager } = this._refs;
        if (!civManager?.getAll || !kaijuManager?.kaiju || !projectileManager?.launch) return;

        for (const civ of civManager.getAll()) {
            if (!civ?.center || civ.id == null) continue;
            if (civ.energy != null && civ.energy < MIN_ENERGY) continue;
            if ((this._cd.get(civ.id) ?? 0) > this._t) continue;

            // v7 -- target: the brain's per-civ pick when present and still
            // valid (alive + in range), else nearest. The impact event will
            // carry this kaiju's id (PATCH-B10b) so the target-selection
            // policy learns from its own aim.
            const dec = (typeof window !== "undefined" && window.getBrainCivDefense)
                ? window.getBrainCivDefense(civ.id) : null;
            let best = null, bestD = RANGE;
            if (dec?.target != null && kaijuManager.kaiju.has(dec.target)) {
                const k = kaijuManager.kaiju.get(dec.target);
                if (k?.position && k.state !== "dying" && k.state !== "spawning") {
                    const d = Math.hypot(k.position.x - civ.center.x, k.position.z - civ.center.z);
                    if (d < RANGE) { best = k; bestD = d; }
                }
            }
            if (!best) {
                for (const k of kaijuManager.kaiju.values()) {
                    if (!k?.position || k.state === "dying" || k.state === "spawning") continue;
                    const d = Math.hypot(k.position.x - civ.center.x, k.position.z - civ.center.z);
                    if (d < bestD) { bestD = d; best = k; }
                }
            }
            if (!best) continue;

            // policy gate: brain decision when present, heuristic otherwise
            let shoot = true;
            if (dec && dec.shoot === false) { shoot = false; this.stats.held++; }
            if (!shoot) { this._cd.set(civ.id, this._t + 1.5); continue; }   // re-ask soon

            this._cd.set(civ.id, this._t + COOLDOWN_S);
            if (civ.energy != null) civ.energy = Math.max(0, civ.energy - ENERGY_COST);
            try {
                projectileManager.launch({
                    from: { x: civ.center.x, y: (civ.center.y ?? 10) + 4, z: civ.center.z },
                    to:   { x: best.position.x, y: best.position.y, z: best.position.z },
                    kind: "civ_bolt",           // no mesh asset -> trail carries the visual
                    scale: 0.7,
                    damageMul: DAMAGE_MUL,
                    trail: "smoke",
                    trailColor: [1.0, 0.85, 0.4],
                    ownerCivId: civ.id,          // PATCH-B10: closes the learning loop
                    targetKaijuId: best.id,      // PATCH-B10b: labels the aim, not just the shot
                });
                this.stats.shots++;
            } catch {}
        }
    },
};
