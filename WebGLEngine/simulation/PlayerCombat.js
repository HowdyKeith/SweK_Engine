// FILE: simulation/PlayerCombat.js
// Round 39 — player allegiance + bounty system.
//
// Allegiance: player picks a civ to ally with by walking near it (within
// ALLY_RANGE) in FP mode and pressing E. Allied civ gets `playerAllied`
// flag; future visualizations or behavior changes can read it.
//
// Bounty: each kaiju kill credited to the player awards tokens by
// kind/lifetime-stage. Tokens accumulate in this.bounty. Spending is
// deferred to a later round.

const ALLY_RANGE = 8;             // FP-mode pick-up distance to civ center
const ALLY_RANGE_SQ = ALLY_RANGE * ALLY_RANGE;

const BOUNTY_BASE = {
    fresh:  1,
    queen:  5,
    king:   15,
};

export class PlayerCombat {

    constructor(opts = {}) {
        this.civManager = opts.civManager ?? null;
        this.audioManager = opts.audioManager ?? null;
        this.bounty = 0;
        this.allyCivId = null;          // null = unallied
        this.killHistory = [];          // recent kill notifications for HUD
    }

    // Walk-up-and-press-E in FP mode. Returns the civ id allied with,
    // or null if no civ in range.
    tryAllyFromPosition(pos) {
        if (!this.civManager?.getAll) return null;
        let best = null, bestSq = ALLY_RANGE_SQ;
        for (const c of this.civManager.getAll()) {
            if (!c.center) continue;
            const dx = c.center.x - pos.x;
            const dz = c.center.z - pos.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestSq) { bestSq = d2; best = c; }
        }
        if (!best) return null;

        // Toggle: ally-then-disall is fine. If already allied with this
        // civ, switching alliance is allowed (walk to another civ + E).
        if (this.allyCivId !== null && this.allyCivId !== best.id) {
            this._unflagPriorAlly();
        }

        this.allyCivId = best.id;
        best.playerAllied = true;
        return best;
    }

    breakAlliance() {
        this._unflagPriorAlly();
        this.allyCivId = null;
    }

    _unflagPriorAlly() {
        if (this.allyCivId === null || !this.civManager?.getAll) return;
        for (const c of this.civManager.getAll()) {
            if (c.id === this.allyCivId) c.playerAllied = false;
        }
    }

    // Called from main.js when a player bolt reduces a kaiju to 0 energy.
    // Awards bounty proportional to kaiju stage. Adds entry to killHistory
    // for HUD notification (auto-expires).
    creditKill(kaiju) {
        let stage = "fresh";
        if (kaiju.becameKing)  stage = "king";
        else if (kaiju.becameQueen) stage = "queen";
        const reward = BOUNTY_BASE[stage] ?? 1;
        this.bounty += reward;
        this.killHistory.push({
            t: performance.now(),
            text: `+${reward} bounty: ${kaiju.name} (${stage})`,
        });
        // Trim history older than 4s
        const cutoff = performance.now() - 4000;
        this.killHistory = this.killHistory.filter(e => e.t > cutoff);
        return reward;
    }

    // Latest kill banner string — empty if no recent kill.
    latestKillText() {
        // Trim aged entries
        const cutoff = performance.now() - 4000;
        this.killHistory = this.killHistory.filter(e => e.t > cutoff);
        return this.killHistory.length ? this.killHistory[this.killHistory.length - 1].text : "";
    }
}
