// WebGLEngine/tools/ship/controllerAgreement.mjs -- v4547
//
// *** THIS TREE HAS SIX CHARACTER CONTROLLERS AND THEY DISAGREE ABOUT GRAVITY, AND NOTHING SAID SO. ***
//
// The player falls at 18, every bot at 20, the kinematic path at 20. The player has NO terminal velocity
// and a falling bot clamps at 55. The player refuses ground at 45 degrees and the shipping bots at 55. Six
// quantities, seventeen sites, and not one line anywhere in the tree compared any two of them.
//
// ---- WHAT A CENSUS OF NUMBERS MUST NOT DO ---------------------------------------------------------------
//
// *** A DISAGREEMENT IS NOT A DEFECT, AND THIS ROUND'S CENTRAL RESULT IS THAT MOST OF THEM ARE NOT. ***
// Driven on every slope a voxel lattice can express -- which is n voxels per column and nothing between --
// the bot's numbers (1.2 / 1.2 / 55) and the player's (1.2 / 1.5 / 45) produce BYTE-IDENTICAL walks: same
// ending x, same ending y, same blocked count, same airborne count, on 45.0 up, 63.4 up, 45.0 down and 63.4
// down. Four of the six disagreements are numerically real and behaviourally absent ON THIS WORLD, and they
// stop being absent the moment a body meets a mesh, where physics/character/capsuleGround.mjs uses 45.
// So each row carries a VERDICT -- live, latent, or cosmetic -- and the verdict is measured, not argued.
//
// *** AND THE VALUES ARE DERIVED FROM THE SOURCE RATHER THAN TYPED HERE. *** tools/ship/frozenRecords.mjs
// was built on the lesson that "`known` is a LIST rather than a DISCOVERY", and this file is half a list:
// the SITES are declared, because "which literal in this file is a gravity" is not a question a regex can
// answer, but every VALUE is read out of the file it lives in on every run. A site that moves, vanishes or
// changes value reddens the gate. What the declared list cannot catch is a SEVENTH quantity nobody wrote
// down, so there is a separate guard on the module population of physics/character/ -- see MODULES.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");

/** The modules that own a character-physics rule. A new one arriving unlisted is the gap this cannot see. */
// v4647 -- capsuleSettle.mjs arrived at v4646 (the Murmur Orb physics port) and SIX ROUNDS PASSED before
// anything re-took this census. The row that catches it is section 6's, and it is the reason that row exists:
// "a new controller landing with its own gravity and nobody re-taking this census". It went red on both boxes
// the first time a full verify was run.
export const MODULES = Object.freeze(["capsuleGround.mjs", "capsuleMove.mjs", "capsuleSettle.mjs",
                                      "fallBody.mjs", "groundProbe.mjs", "kinematic.js", "terrainWalk.mjs"]);

// *** AND THE ARRIVAL BROUGHT A SEVENTH QUANTITY WITH IT, WHICH IS THE THING THE COUNT CANNOT SEE. ***
// section 6's own prose says so: "It cannot tell you that a listed module grew a SEVENTH quantity, which is
// the gap that remains". It did. physics/character/ now spells HOW STEEP GROUND MAY BE AND STILL SUPPORT A
// BODY in two places, in two units, and they do not agree:
//
//     capsuleGround.mjs   maxSlopeDeg = 45              -> a contact normal of y >= 0.7071
//     capsuleSettle.mjs   GROUND_SUPPORT_NORMAL_Y = 0.5 -> a slope of up to 60.0 degrees
//
// FIFTEEN DEGREES APART, and capsuleSettle's own header warns against exactly this ("a constant restated for
// convenience is exactly how this tree ended up with two skip rules that agreed only by coincidence") while
// introducing it.
//
// *** WHAT IS NOT CLAIMED: THAT EITHER NUMBER IS WRONG. *** They are different CONTRACTS -- capsuleGround
// asks "can the body STAND here", capsuleSettle asks "does this contact SUPPORT the body while it is being
// pushed out of geometry" -- and a body can legitimately be depenetrated along a face it could not stand on.
// What has never been established is whether 0.5 was CHOSEN for that difference or inherited from the ported
// kernel and never compared. Recorded as a DISAGREEMENT rather than reconciled, because reconciling two
// numbers whose relationship nobody has measured is how a real distinction gets deleted.
export const GROUND_LIMIT_AT_V4647 = Object.freeze({
    standDeg: 45, standNormalY: Math.cos(45 * Math.PI / 180),
    settleNormalY: 0.5, settleDeg: Math.acos(0.5) * 180 / Math.PI,
    agree: false, apartDeg: Math.acos(0.5) * 180 / Math.PI - 45,
    why: "two contracts, two units, never compared until the census caught the module's arrival",
});

/**
 * Every site the tree spells a character-physics number at. `ships` is true when a RUNNING body reads it:
 * a module default that every caller overrides is documented, not obeyed, and the two must not be confused
 * -- which is the trap this file walked into first (see MAX_SLOPE's note in AGREEMENT_AT_V4547).
 */
export const SITES = Object.freeze([
    { q: "gravity", who: "player", ships: true, file: "camera/camera.js", sym: "this._gravity",
      re: /this\._gravity\s*=\s*(-?[\d.]+)\s*;/, sign: "magnitude, subtracted" },
    { q: "gravity", who: "fallBody", ships: true, file: "physics/character/fallBody.mjs", sym: "GRAVITY",
      re: /export const GRAVITY\s*=\s*(-?[\d.]+)\s*;/, sign: "signed, added" },
    { q: "gravity", who: "kinematic", ships: false, file: "physics/character/kinematic.js", sym: "stepCharacter default",
      re: /stepCharacter\(\{[^}]*?gravity\s*=\s*(-?[\d.]+)/s, sign: "signed, added" },
    { q: "terminal", who: "fallBody", ships: true, file: "physics/character/fallBody.mjs", sym: "TERMINAL",
      re: /export const TERMINAL\s*=\s*(-?[\d.]+)\s*;/, sign: "signed floor on vy" },
    // *** AN ABSENCE IS NOT A SITE, AND THE FIRST DRAFT OF THIS CENSUS THEREFORE REPORTED `terminal` AS
    // AGREED -- ONE VALUE, NOTHING TO DISAGREE WITH. *** That is a check that cannot fail, on the quantity
    // with the largest measured gap in the file. At v4547 the player's absence of a clamp was only visible
    // as the SHAPE of its integration -- a bare `-=` where fallBody wraps the same arithmetic in Math.max --
    // so the anchor matched that shape and yielded 0, and that row said in so many words that the day
    // somebody changed the shape the site would read null and the census would report STALE.
    //
    // *** IT DID, ONE ROUND LATER, AND THE NEW SHAPE IS BETTER THAN THE OLD ONE. *** v4548 routed both
    // camera falls through fallBody.fallStep and had to say what terminal to use; it passes -Infinity, so
    // the player's "no terminal velocity" stopped being an absence a regex had to infer and became a
    // LITERAL THE CALL SITE STATES. The site is a plain number now, and the quantity still disagrees --
    // -Infinity against -55 -- for the same measured reason v4547 recorded.
    { q: "terminal", who: "player", ships: true, file: "camera/camera.js", sym: "fallStep terminal argument",
      re: /terminal:\s*(-Infinity)\s*\}\);\n\s*this\.position\.y = r\.pos\[1\]/,
      sign: "explicitly none" },
    { q: "terminal", who: "kaijuDrive", ships: true, file: "camera/camera.js", sym: "fallStep terminal argument",
      re: /terminal:\s*(-Infinity)\s*\}\);\n\s*k\.position\.y = kr\.pos\[1\]/,
      sign: "explicitly none" },
    { q: "stepUp", who: "player", ships: true, file: "camera/camera.js", sym: "Camera.STEP_UP_MAX",
      re: /static STEP_UP_MAX\s*=\s*(-?[\d.]+)\s*;/ },
    { q: "stepUp", who: "bots", ships: true, file: "simulation/BotManager.js", sym: "BOT_STEP",
      re: /const BOT_STEP\s*=\s*(-?[\d.]+)\s*;/ },
    { q: "stepUp", who: "terrainWalk", ships: false, file: "physics/character/terrainWalk.mjs", sym: "stepHeight default",
      re: /stepHeight\s*=\s*(-?[\d.]+)\s*,\s*snapDown/ },
    { q: "stepUp", who: "capsuleGround", ships: false, file: "physics/character/capsuleGround.mjs", sym: "stepUp default",
      re: /height = 1\.8, stepUp = (-?[\d.]+),/ },
    { q: "snapDown", who: "player", ships: true, file: "camera/camera.js", sym: "CLIFF_DROP",
      re: /const CLIFF_DROP\s*=\s*(-?[\d.]+)\s*;/ },
    { q: "snapDown", who: "bots", ships: true, file: "simulation/BotManager.js", sym: "BOT_STEP (passed as snapDown)",
      re: /const BOT_STEP\s*=\s*(-?[\d.]+)\s*;/ },
    { q: "snapDown", who: "terrainWalk", ships: false, file: "physics/character/terrainWalk.mjs", sym: "snapDown default",
      re: /snapDown\s*=\s*(-?[\d.]+)\s*,/ },
    { q: "maxSlope", who: "player", ships: true, file: "camera/camera.js", sym: "Camera.MAX_SLOPE_DEG",
      re: /static MAX_SLOPE_DEG\s*=\s*(-?[\d.]+)\s*;/ },
    { q: "maxSlope", who: "bots", ships: true, file: "simulation/BotManager.js", sym: "botMaxSlopeDeg ?? literal",
      re: /maxSlopeDeg:\s*this\.botMaxSlopeDeg\s*\?\?\s*(-?[\d.]+)/ },
    { q: "maxSlope", who: "terrainWalk", ships: false, file: "physics/character/terrainWalk.mjs", sym: "maxSlopeDeg default",
      re: /maxSlopeDeg\s*=\s*(-?[\d.]+)\s*,\s*stepHeight/ },
    { q: "maxSlope", who: "capsuleGround", ships: false, file: "physics/character/capsuleGround.mjs", sym: "maxSlopeDeg default",
      re: /height = 1\.8, maxSlopeDeg = (-?[\d.]+) \}/ },
    { q: "bodyHeight", who: "player", ships: true, file: "world/surfaceProbe.mjs", sym: "DEFAULT_BODY (cells)",
      re: /export const DEFAULT_BODY\s*=\s*(-?[\d.]+)\s*;/ },
    { q: "bodyHeight", who: "capsuleGround", ships: false, file: "physics/character/capsuleGround.mjs", sym: "height default",
      re: /radius = 0\.4, height = (-?[\d.]+), stepUp/ },
]);

/** Read every site's value out of the file it lives in. `null` means the anchor no longer matches. */
export function census() {
    const src = new Map();
    const rows = SITES.map((s) => {
        if (!src.has(s.file)) src.set(s.file, read(s.file));
        const m = src.get(s.file).match(s.re);
        return { ...s, value: m ? Number(m[1]) : null };
    });
    const byQ = new Map();
    for (const r of rows) { if (!byQ.has(r.q)) byQ.set(r.q, []); byQ.get(r.q).push(r); }
    const quantities = [...byQ.entries()].map(([q, list]) => {
        // An absence site yields "" from its empty capture group; Number("") is 0, which is the honest
        // reading -- no clamp is a terminal speed of zero magnitude, i.e. none.
        const shipped = list.filter((r) => r.ships).map((r) => Math.abs(r.value));
        return { q, rows: list, shippedValues: [...new Set(shipped)].sort((a, b) => a - b),
                 shippedAgree: new Set(shipped).size <= 1 };
    });
    return { rows, quantities, unresolved: rows.filter((r) => r.value === null).map((r) => r.file + " " + r.sym) };
}

/** The modules present in physics/character/, so a seventh controller cannot arrive in silence. */
export function characterModules() {
    return fs.readdirSync(path.join(ENG, "physics", "character"))
        .filter((f) => /\.(mjs|js)$/.test(f) && !/-selfcheck\./.test(f)).sort();
}

/**
 * *** RE-DERIVED BY tools/ship/controllerAgreement-selfcheck.mjs ON EVERY RUN. *** Readings at v4547.
 */
export const AGREEMENT_AT_V4547 = Object.freeze({
    at: "v4547",
    sites: 19,
    quantities: 6,
    shippingSites: 12,
    modules: 7,   // v4647 -- capsuleSettle.mjs; see MODULES above and the seventh quantity it brought
    // *** THE COUNTS ABOVE CANNOT CATCH A NUMBER MOVING, AND THE SABOTAGE BATTERY IS WHAT SAID SO. ***
    // Moving terrainWalk's NON-shipping snapDown default from 0.5 left the whole census green, because
    // every verdict here is about SHIPPING values and that default ships to nobody. It is still a number
    // this file publishes, and a published number nothing compares is the exact defect the last four
    // rounds have been about. Every site's value is pinned here and compared per site in section 1.
    siteValues: Object.freeze({
        "gravity:player": 18,
        "gravity:fallBody": -20,
        "gravity:kinematic": -20,
        "terminal:fallBody": -55,
        "terminal:player": -Infinity,
        "terminal:kaijuDrive": -Infinity,
        "stepUp:player": 1.2,
        "stepUp:bots": 1.2,
        "stepUp:terrainWalk": 0.5,
        "stepUp:capsuleGround": 0.5,
        "snapDown:player": 1.5,
        "snapDown:bots": 1.2,
        "snapDown:terrainWalk": 0.5,
        "maxSlope:player": 45,
        "maxSlope:bots": 55,
        "maxSlope:terrainWalk": 45,
        "maxSlope:capsuleGround": 45,
        "bodyHeight:player": 2,
        "bodyHeight:capsuleGround": 1.8,
    }),
    // the quantities whose SHIPPING values differ, and what each difference actually does
    disagreements: Object.freeze([
        Object.freeze({ q: "gravity", values: Object.freeze([18, 20]), verdict: "LIVE",
            what: "the player accelerates at 18 and every bot at 20, so a bot lands FIRST from any height " +
                  "under about 150 units -- 2 frames sooner from 5, 9 sooner from 100 -- and the player " +
                  "lands first above it. The sign convention differs too: the camera stores a magnitude " +
                  "and subtracts, fallBody and kinematic store a signed value and add" }),
        Object.freeze({ q: "terminal", values: Object.freeze([0, 55]), verdict: "LIVE",
            what: "the player has NO terminal velocity at all, so the crossover above exists: a bot is " +
                  "pinned at 55 m/s from 100 units up and the player keeps accelerating -- 119.4 m/s from " +
                  "400, 267.9 from 2,000 -- 4.87 times the bot's clamp -- and unbounded above that. *** IT DOES NOT TUNNEL, WHICH WAS THE HYPOTHESIS AND " +
                  "IS NOT THE ANSWER: *** the ground clamp is re-asked at the body's current height every " +
                  "frame, so a drop onto a thin ledge lands on it from 45, 50, 60, 70, 75 and 78 units. " +
                  "So this is a difference in feel and impact speed, not a correctness bug, and no " +
                  "terminal clamp is added here on a correctness argument that does not exist" }),
        Object.freeze({ q: "maxSlope", values: Object.freeze([45, 55]), verdict: "LATENT",
            what: "the player refuses at 45 and the shipping bots at 55 -- and on a lattice both admit " +
                  "45.0 and refuse 63.4, because n voxels per column is the only slope there is. Driven: " +
                  "identical walks on all four. It becomes live on a MESH, where capsuleGround uses 45" }),
        Object.freeze({ q: "snapDown", values: Object.freeze([1.2, 1.5]), verdict: "LATENT",
            what: "CLIFF_DROP 1.5 against BOT_STEP 1.2, and on a lattice every drop is 1 or 2 voxels, " +
                  "which both admit and both refuse respectively. Driven: identical walks" }),
    ]),
    // NOT a disagreement, and recorded so nobody later reads it as one: the voxel body is 2 CELLS and the
    // mesh capsule is 1.8 UNITS. Different worlds measured in different things, and no body is ever both.
    // capsuleGround's 1.8 is also a module default no shipping caller reads, which is the other half.
    unitsNote: "bodyHeight: 2 cells (voxel) against 1.8 units (mesh capsule) -- different units, one body never both",
    // the one quantity the shipping controllers already agree on
    agreed: Object.freeze(["stepUp"]),
    stepUpBoth: 1.2,
    // the fall, measured: frames to land and impact speed, player against a fallBody bot
    crossoverUnits: 150.5,
    fall: Object.freeze([
        Object.freeze({ from: 5, pf: 35, pImpact: 10.2, bf: 33, bImpact: 10.67 }),
        Object.freeze({ from: 100, pf: 198, pImpact: 59.1, bf: 189, bImpact: 55 }),
        Object.freeze({ from: 400, pf: 399, pImpact: 119.4, bf: 517, bImpact: 55 }),
        Object.freeze({ from: 2000, pf: 894, pImpact: 267.9, bf: 2262, bImpact: 55 }),
    ]),
    // *** A CORRECTION TO v4546, WHICH IS THIS ROUND'S OWN PREVIOUS ONE. *** That round set
    // Camera.MAX_SLOPE_DEG to 45 and its note said the number was "chosen to MATCH THE BOTS". It does not:
    // the bots ship 55. The 45 came from terrainWalk's module DEFAULT, which no shipping caller uses --
    // BotManager passes maxSlopeDeg explicitly and always has. The choice is still harmless on a lattice,
    // for the reason the LATENT verdict above gives, but the justification was false and is withdrawn.
    // It is the reason `ships` exists on every site in this file.
    v4546Claim: "45 matches the bots",
    v4546Truth: "the shipping bots use 55; 45 is terrainWalk's module default and no shipping caller reads it",
    // the speed convention, which is a word rather than a number and is not in SITES
    conventionPlayer: "HORIZONTAL",
    conventionBots: "SURFACE",
    conventionSpreadPctAt45: 41,
});
