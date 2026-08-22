// Self-check for ev/esTactics.js — the ES combat decision layer.
//
// Every test here distinguishes the tactics from the behaviour they REPLACE (nearest target, always
// engage, never flee). A test that a nearest-target magnet would also pass proves nothing, so each
// case is built so the naive answer is the WRONG answer.
//
//   node ev/tools/es-tactics-selfcheck.mjs

import { DEFAULT_W, decide, chooseTarget, shouldFlee, fleePoint, applyBrainWeights, healthFrac, strength } from "../esTactics.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

// ship(x, y, shield, armor, dps) with maxima equal to full values unless stated
const ship = (id, x, y, shield, armor, dps = 10, opts = {}) => ({
    id, x, y, shield, armor, dps,
    maxShield: opts.maxShield ?? shield, maxArmor: opts.maxArmor ?? armor,
    team: opts.team || "enemy", dead: !!opts.dead,
});

// ---- health / strength primitives -------------------------------------------------
{
    ok("healthFrac: full ship = 1", healthFrac(ship(1, 0, 0, 100, 100)) === 1);
    const hurt = ship(2, 0, 0, 0, 50, 10, { maxShield: 100, maxArmor: 100 });
    ok("healthFrac: half-dead = 0.25", Math.abs(healthFrac(hurt) - 0.25) < 1e-9);
    ok("healthFrac: no maxima -> 1 (never divide by zero)", healthFrac({ shield: 0, armor: 0 }) === 1);
    ok("strength scales with dps", strength(ship(3, 0, 0, 100, 0, 20)) > strength(ship(4, 0, 0, 100, 0, 5)));
    ok("crippled battleship < healthy frigate",
        strength(ship(5, 0, 0, 0, 5, 50)) < strength(ship(6, 0, 0, 80, 80, 8)));
}

// ---- target selection: the naive answer must LOSE ---------------------------------
{
    const self = ship(0, 0, 0, 100, 100, 10);
    // A: closest, but pristine.  B: slightly farther, nearly dead.
    const A = ship(1, 100, 0, 100, 100, 10);
    const B = ship(2, 160, 0, 2, 3, 10, { maxShield: 100, maxArmor: 100 });
    const pick = chooseTarget(self, [A, B], DEFAULT_W);
    ok("prefers the nearly-dead target over the closer pristine one (nearest would pick A)",
        pick.target.id === 2);

    // The naive "nearest wins" rule must lose here, but proximity must still matter: with two
    // IDENTICAL targets the closer one is strictly better. (An earlier test asserted that a pristine
    // ship at 5 units should beat a nearly-dead one at 160. On reflection that premise is wrong --
    // finishing a one-shot kill is correct tactics -- so the test was replaced rather than the
    // weights bent to satisfy it.)
    const T1 = ship(3, 100, 0, 60, 60, 10);
    const T2 = ship(4, 400, 0, 60, 60, 10);
    ok("between identical targets, the closer one wins",
        chooseTarget(self, [T2, T1], DEFAULT_W).target.id === 3);
}
{
    const self = ship(0, 0, 0, 100, 100, 10);
    const grunt = ship(1, 100, 0, 50, 50, 2);
    const gunship = ship(2, 130, 0, 50, 50, 90);   // farther, but by far the bigger threat
    const pick = chooseTarget(self, [grunt, gunship], DEFAULT_W);
    ok("prefers the dangerous ship over the closer harmless one", pick.target.id === 2);
}
{
    const self = ship(0, 0, 0, 100, 100, 10);
    const npc = ship(1, 100, 0, 50, 50, 10);
    const player = ship(2, 130, 0, 50, 50, 10, { team: "player" });
    ok("biases toward the player at similar range", chooseTarget(self, [npc, player], DEFAULT_W).target.id === 2);
}
{
    const self = ship(0, 0, 0, 100, 100, 10);
    const a = ship(1, 100, 0, 50, 50, 10);
    const b = ship(2, 101, 0, 50, 50, 10);   // a hair farther; without focus this flickers
    const withFocus = chooseTarget(self, [a, b], DEFAULT_W, { lastTargetId: 2 });
    ok("focus keeps last tick's target when the choice is near-tied (no dithering)",
        withFocus.target.id === 2);
}
{
    const self = ship(0, 0, 0, 100, 100, 10);
    const dead = ship(1, 10, 0, 0, 0, 10, { dead: true });
    const live = ship(2, 900, 0, 50, 50, 10);
    ok("never targets a dead ship, however close", chooseTarget(self, [dead, live], DEFAULT_W).target.id === 2);
    ok("no candidates -> null, not a bogus target", chooseTarget(self, [dead], DEFAULT_W) === null);
    ok("never targets itself", chooseTarget(self, [self], DEFAULT_W) === null);
}

// ---- flee: two conditions, both required -----------------------------------------
{
    const strong = ship(0, 0, 0, 100, 100, 10);
    const weakSelf = ship(0, 0, 0, 5, 5, 10, { maxShield: 100, maxArmor: 100 });   // hp = 0.05
    const bigEnemy = ship(1, 100, 0, 200, 200, 40);
    const tinyEnemy = ship(2, 100, 0, 1, 1, 1, { maxShield: 100, maxArmor: 100 });

    ok("healthy ship never flees, however outmatched", shouldFlee(strong, [bigEnemy], DEFAULT_W) === false);
    ok("hurt ship flees when outmatched", shouldFlee(weakSelf, [bigEnemy], DEFAULT_W) === true);
    ok("hurt ship does NOT flee when it is still winning", shouldFlee(weakSelf, [tinyEnemy], DEFAULT_W) === false);
    ok("nothing to flee from -> no flee", shouldFlee(weakSelf, [], DEFAULT_W) === false);

    // hysteresis: recovering just past the bar must not instantly re-engage
    const recovering = ship(0, 0, 0, 32, 0, 10, { maxShield: 100, maxArmor: 0 });   // hp = 0.32
    ok("above the plain bar -> would engage if fresh",
        shouldFlee(recovering, [bigEnemy], DEFAULT_W, { wasFleeing: false }) === false);
    ok("...but keeps fleeing until it clears the hysteresis band",
        shouldFlee(recovering, [bigEnemy], DEFAULT_W, { wasFleeing: true }) === true);
}

// ---- flee point: away from the threat, not toward it ------------------------------
{
    const self = ship(0, 0, 0, 10, 10);
    const threat = ship(1, 100, 0, 100, 100);
    const p = fleePoint(self, threat);
    ok("flee point is on the far side of self from the threat", p.x < self.x);
    ok("flee point is far enough to keep running", Math.hypot(p.x - self.x, p.y - self.y) > 1000);
}

// ---- decide(): the whole call ----------------------------------------------------
{
    const self = ship(0, 0, 0, 100, 100, 10);
    const foe = ship(1, 200, 0, 50, 50, 10);
    const d = decide(self, [foe], DEFAULT_W);
    ok("decide: healthy -> engages a real target", d.engaging === true && d.fleeing === false && d.target.id === 1);

    const hurt = ship(0, 0, 0, 3, 3, 5, { maxShield: 100, maxArmor: 100 });
    const big = ship(1, 200, 0, 300, 300, 50);
    const d2 = decide(hurt, [big], DEFAULT_W);
    ok("decide: outmatched + hurt -> flees", d2.fleeing === true && d2.engaging === false);
    ok("decide: flee target is a point, not the enemy", d2.target._flee === true && d2.from.id === 1);

    ok("decide: nothing alive -> no target, no engage", decide(self, [], DEFAULT_W).target === null);

    // runs from the BIGGEST threat, not the nearest one
    const near = ship(1, 50, 0, 10, 10, 1);
    const huge = ship(2, 900, 0, 500, 500, 90);
    const d3 = decide(hurt, [near, huge], DEFAULT_W);
    ok("decide: flees the biggest threat, not the nearest", d3.fleeing && d3.from.id === 2);
}

// ---- brain-served weights --------------------------------------------------------
{
    const w = applyBrainWeights({ wWeak: 5.0, wClose: 0.0 });
    ok("brain weights applied", w.wWeak === 5.0 && w.wClose === 0.0);
    ok("unspecified keys keep the hand policy", w.wPlayer === DEFAULT_W.wPlayer);
    ok("reports how many weights the brain actually supplied", w._brainWeights === 2);

    const bad = applyBrainWeights({ wWeak: "lots", wClose: NaN, nonsense: 1 });
    ok("garbage weights are ignored, not adopted", bad.wWeak === DEFAULT_W.wWeak && bad.wClose === DEFAULT_W.wClose);
    ok("unknown keys are dropped", bad.nonsense === undefined);
    ok("no usable weights -> _brainWeights 0 (the UI can say 'hand policy')", bad._brainWeights === 0);
    ok("null payload degrades to the hand policy", applyBrainWeights(null).wClose === DEFAULT_W.wClose);

    // a brain that has learned "always finish the wounded" must actually change the pick
    const self = ship(0, 0, 0, 100, 100, 10);
    const close = ship(1, 10, 0, 100, 100, 10);
    const wounded = ship(2, 1200, 0, 1, 1, 10, { maxShield: 100, maxArmor: 100 });
    ok("hand policy picks the very close one", chooseTarget(self, [close, wounded], DEFAULT_W).target.id === 1);
    ok("brain weights flip the decision", chooseTarget(self, [close, wounded], applyBrainWeights({ wWeak: 9, wClose: 0.1 })).target.id === 2);
}

// ---- purity ----------------------------------------------------------------------
{
    const self = ship(0, 0, 0, 60, 60, 10);
    const foes = [ship(1, 100, 0, 50, 50, 10), ship(2, 300, 0, 5, 5, 40, { maxShield: 100, maxArmor: 100 })];
    const a = decide(self, foes, DEFAULT_W), b = decide(self, foes, DEFAULT_W);
    ok("decide is deterministic (same inputs, same target)", a.target.id === b.target.id && a.fleeing === b.fleeing);
    const snapshot = JSON.stringify(foes);
    decide(self, foes, DEFAULT_W);
    ok("decide does not mutate its inputs", JSON.stringify(foes) === snapshot);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
