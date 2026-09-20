// WebGLEngine/tools/ship/controllerAgreement-selfcheck.mjs -- v4547
//
// Run: node tools/ship/controllerAgreement-selfcheck.mjs
//
// GATES tools/ship/controllerAgreement.mjs -- the census of every character-physics number in this tree and
// which of them disagree.
//
// *** THE POINT IS NOT THAT THEY DISAGREE. IT IS THAT MOST OF THE DISAGREEMENTS DO NOTHING, AND NOBODY
// COULD HAVE TOLD YOU WHICH. *** Section 3 drives the bot's numbers and the player's numbers over every
// slope a voxel lattice can express and gets byte-identical walks; section 2 drives the two falls and gets
// a body that lands 1,368 frames apart from 2,000 units. A census that reported six disagreements and
// stopped would have been six times less useful than one that says which two are live.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  the player's gravity quietly moved to 20, closing a recorded disagreement    3 RED
//   B  fallBody's TERMINAL removed, so the bot stops clamping                        5 RED
//   C  the player GIVEN a terminal clamp, so the absence anchor stops matching       5 RED
//   D  BOT_STEP moved to 0.9, breaking the one agreement the record names            3 RED
//   E  the bots' maxSlope literal changed to 45, closing section 4's subject         3 RED
//   F  a site's `ships` flag flipped, so a module default reads as behaviour         2 RED
//   G  a site's anchor broken, so the census silently loses a number                 1 RED
//   H  terrainWalk's NON-shipping snapDown default moved from 0.5                    1 RED
//
// Counted across this gate, tools/ship/playerSlope-selfcheck.mjs and playerGround-selfcheck.mjs.
// *** H WENT ZERO RED ON THE FIRST BATTERY AND THAT IS WHY SECTION 1 COMPARES VALUES AND NOT COUNTS. ***
// Every verdict in this census is about SHIPPING values, so a default that ships to nobody could move and
// leave the whole file green -- a number this census publishes that nothing compares, which is the exact
// defect the last four rounds have been about, arriving inside the census built to find it.
//
// *** THE FIRST DRAFT OF THE CENSUS REPORTED `terminal` AS AGREED, *** because the player's absence of a
// terminal clamp is not a site and one value has nothing to disagree with -- a check that cannot fail, on
// the quantity with the largest gap in the file. The absence is anchored on the SHAPE of the player's
// integration now. Section 5 is that row.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { census, characterModules, SITES, MODULES, ENG, GROUND_LIMIT_AT_V4647 as G,
         AGREEMENT_AT_V4547 as R } from "./controllerAgreement.mjs";
import { Camera } from "../../camera/camera.js";
import { noComments } from "./sourceScan.mjs";
import { fallStep } from "../../physics/character/fallBody.mjs";
import { stepTerrain, SURFACE } from "../../physics/character/terrainWalk.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const C = census();
const qOf = (q) => C.quantities.find((x) => x.q === q);
const flat = { voxelAt: (x, y) => (y <= 1 ? 1 : 0) };
const playerFall = (h) => {
    const c = Object.create(Camera.prototype);
    Object.assign(c, { world: flat, keys: new Set(), position: { x: 5.5, y: h + 1.7, z: 5.5 },
        velocity: { x: 0, y: 0, z: 0 }, yaw: 0, _extMove: null, _eyeHeight: 1.7, _gravity: 18,
        _fpWalkSpeed: 5, _fpSprintSpeed: 8, _fpJumpVel: 8, _fpVelY: 0, _fpOnGround: false, playerEnergy: null });
    let f = 0, peak = 0;
    while (!c._fpOnGround && f < 50000) { peak = Math.min(peak, c._fpVelY); c._moveFP(1 / 60); f++; }
    return { frames: f, impact: +Math.abs(peak).toFixed(1) };
};
const botFall = (h) => {
    let y = h, vy = 0, f = 0, peak = 0;
    for (let i = 0; i < 50000; i++) {
        peak = Math.min(peak, vy);
        const r = fallStep({ pos: [5.5, y, 5.5], vy, surfaceUnder: () => 2, dt: 1 / 60 });
        y = r.pos[1]; vy = r.vy; f++; if (r.landed) break;
    }
    return { frames: f, impact: +Math.abs(peak).toFixed(2) };
};

// =============================================================================================================
console.log("\n1. *** SIX QUANTITIES, EIGHTEEN SITES, AND NOT ONE LINE COMPARED ANY TWO OF THEM ***");
{
    const drifted = C.rows.filter((r) => R.siteValues[r.q + ":" + r.who] !== r.value)
        .map((r) => r.q + ":" + r.who + " " + R.siteValues[r.q + ":" + r.who] + " -> " + r.value);
    ok("!! every declared site still resolves, and EVERY VALUE re-derives -- not just the counts",
        drifted.length === 0 && Object.keys(R.siteValues).length === SITES.length &&
        C.unresolved.length === 0 && SITES.length === R.sites &&
        C.rows.filter((r) => r.ships).length === R.shippingSites &&
        C.quantities.length === R.quantities &&
        C.quantities.filter((q) => !q.shippedAgree).length === R.disagreements.length,
        (drifted.length ? "DRIFTED: " + drifted.join(", ") + ". " : "") +
        SITES.length + " sites across " + new Set(SITES.map((s) => s.file)).size + " files, " +
        R.shippingSites + " of them read by a RUNNING body, " + C.quantities.length + " quantities, " +
        C.quantities.filter((q) => !q.shippedAgree).length + " disagreeing. *** THE VALUES ARE READ OUT OF " +
        "THE FILES ON EVERY RUN AND NOT TYPED HERE, *** so a site that moves or changes reddens this. What " +
        "is DECLARED is which literal is a gravity, because no regex answers that -- which is the half of " +
        "this census that is a list, said plainly, with section 6 guarding the part a list cannot see. " +
        "*** THE PER-SITE COMPARISON IS HERE BECAUSE THE SABOTAGE BATTERY FOUND ITS ABSENCE: *** moving a " +
        "NON-shipping default left every row of the first draft green, since the verdicts are all about " +
        "shipping values. A number this file publishes and nothing compares is the defect these rounds " +
        "are about, arriving inside the census built to find it.");

    const shipped = (q, who) => (qOf(q).rows.find((r) => r.who === who) || {}).value;
    ok("!! *** THE PLAYER FALLS AT 18 AND EVERY BOT AT 20, AND THE SIGN CONVENTIONS DIFFER TOO ***",
        Math.abs(shipped("gravity", "player")) === 18 && Math.abs(shipped("gravity", "fallBody")) === 20 &&
        shipped("gravity", "player") > 0 && shipped("gravity", "fallBody") < 0 && !qOf("gravity").shippedAgree,
        "camera stores " + shipped("gravity", "player") + " as a MAGNITUDE and subtracts it; fallBody and " +
        "kinematic store " + shipped("gravity", "fallBody") + " SIGNED and add it. Two numbers and two " +
        "conventions for one quantity, in three files.");
}

// =============================================================================================================
console.log("\n2. *** THE TWO LIVE ONES, DRIVEN: A BODY THAT LANDS 1,368 FRAMES APART ***");
{
    const rows = R.fall.map((f) => ({ rec: f, p: playerFall(f.from), b: botFall(f.from) }));
    ok("!! the fall table re-derives, frame for frame and metre per second",
        rows.every((r) => r.p.frames === r.rec.pf && r.b.frames === r.rec.bf &&
                          Math.abs(r.p.impact - r.rec.pImpact) < 0.05 &&
                          Math.abs(r.b.impact - r.rec.bImpact) < 0.05),
        rows.map((r) => r.rec.from + "u: player " + r.p.frames + "f @" + r.p.impact + " vs bot " +
            r.b.frames + "f @" + r.b.impact).join("; ") + ".");

    const low = playerFall(100), lowB = botFall(100), high = playerFall(2000), highB = botFall(2000);
    const ratio = high.impact / highB.impact;
    ok("!! *** THE TWO DISAGREEMENTS POINT OPPOSITE WAYS AND CROSS OVER AT ABOUT 150 UNITS ***",
        low.frames > lowB.frames && high.frames < highB.frames &&
        ratio > 4.8 && ratio < 4.9 && Math.abs(highB.impact - 55) < 0.01,
        "from 100 units the BOT lands first, " + lowB.frames + " frames against " + low.frames +
        ", because 20 beats 18. From 2,000 the PLAYER lands first, " + high.frames + " against " +
        highB.frames + " -- " + (highB.frames - high.frames) + " frames -- because the bot is pinned at " +
        highB.impact + " m/s and the player is not pinned at all and arrives at " + high.impact + ", " +
        ratio.toFixed(2) + " times as fast. Recorded crossover " + R.crossoverUnits + " units. *** ONE " +
        "DISAGREEMENT MAKES THE PLAYER SLOWER AND THE OTHER MAKES IT NEARLY FIVE TIMES FASTER, AND WHICH " +
        "ONE YOU MEET DEPENDS ON THE DROP. *** The first draft of this row asserted `> 5x` and went red at " +
        "4.87, which is the row refusing a number I rounded in my own favour.");

    report("the hypothesis this round started with was that an unbounded fall TUNNELS, and it does not: " +
           "the ground clamp is re-asked at the body's current height every frame, so a drop onto a thin " +
           "ledge lands on it from 45, 50, 60, 70, 75 and 78 units. That is the same structural argument " +
           "fallBody's own header makes for itself. So no terminal clamp is added here -- the difference " +
           "is feel and impact speed, and changing either is a gameplay decision this round does not make.");
}

// =============================================================================================================
console.log("\n3. *** AND THE OTHER TWO DO NOTHING AT ALL ON THIS WORLD, WHICH IS THE RESULT ***");
{
    // Every slope a voxel lattice can express is n voxels per column. There is nothing between them.
    const H = {
        "up 45.0":   (x) => (x < 10 ? 0 : Math.floor(x - 10) + 1),
        "up 63.4":   (x) => (x < 10 ? 0 : 2 * (Math.floor(x - 10) + 1)),
        "down 45.0": (x) => (x < 10 ? 20 : Math.max(0, 20 - (Math.floor(x - 10) + 1))),
        "down 63.4": (x) => (x < 10 ? 40 : Math.max(0, 40 - 2 * (Math.floor(x - 10) + 1))),
    };
    const walk = (h, opts) => {
        let pos = [5, h(5), 5], blocked = 0, airborne = 0;
        for (let i = 0; i < 240; i++) {
            const r = stepTerrain({ pos, ground: (x) => ({ y: h(x), n: [0, 1, 0] }), wish: [1, 0],
                                    dt: 1 / 60, speed: 5, convention: SURFACE, ...opts });
            pos = r.pos; if (r.blocked) blocked++; if (r.airborne) airborne++;
        }
        return [+pos[0].toFixed(4), +pos[1].toFixed(4), blocked, airborne].join("/");
    };
    const botNums = { stepHeight: 1.2, snapDown: 1.2, maxSlopeDeg: 55 };
    const plNums = { stepHeight: 1.2, snapDown: 1.5, maxSlopeDeg: 45 };
    const pairs = Object.entries(H).map(([n, h]) => [n, walk(h, botNums), walk(h, plNums)]);
    ok("!! *** 1.2/1.2/55 AGAINST 1.2/1.5/45: BYTE-IDENTICAL ON ALL FOUR, x, y, BLOCKED AND AIRBORNE ***",
        pairs.every(([, b, p]) => b === p) && pairs.length === 4 &&
        pairs.some(([, b]) => b.split("/")[2] !== "0") && pairs.some(([, b]) => b.split("/")[3] !== "0"),
        pairs.map(([n, b]) => n + " -> " + b).join("; ") + ". The two number-sets differ in snapDown and " +
        "maxSlope and the walks do not differ at all, because a lattice expresses 45.0, 63.4, 71.6 and " +
        "nothing between: both admit the first and both refuse the second. *** THAT IS WHY THE RECORD " +
        "CARRIES A VERDICT PER DISAGREEMENT AND NOT A COUNT. *** The fixtures are not all flat -- one is " +
        "blocked and one is airborne throughout -- so the identity is two rules agreeing rather than two " +
        "rules never being asked.");

    const latent = R.disagreements.filter((d) => d.verdict === "LATENT").map((d) => d.q).sort();
    ok("   ...and LATENT is not NONE: it becomes live the moment a body meets a mesh",
        latent.join(",") === "maxSlope,snapDown" &&
        qOf("maxSlope").rows.some((r) => r.who === "capsuleGround" && r.value === 45),
        "the latent pair is " + latent.join(" and ") + ". physics/character/capsuleGround.mjs -- the MESH " +
        "authority -- uses " + qOf("maxSlope").rows.find((r) => r.who === "capsuleGround").value + ", and a " +
        "mesh has every angle. On a triangle ramp at 50 degrees the player would walk and the bots would " +
        "not, and nothing in this tree walks a player on a mesh yet, which is the only reason it is latent.");
}

// =============================================================================================================
console.log("\n4. *** A CORRECTION TO v4546, WHICH IS THE ROUND BEFORE THIS ONE AND ALSO MINE ***");
{
    const bots = qOf("maxSlope").rows.find((r) => r.who === "bots");
    const dflt = qOf("maxSlope").rows.find((r) => r.who === "terrainWalk");
    ok("!! *** v4546 SAID 45 WAS 'CHOSEN TO MATCH THE BOTS'. THE BOTS SHIP 55. ***",
        Camera.MAX_SLOPE_DEG === 45 && bots.value === 55 && dflt.value === 45 &&
        bots.ships === true && dflt.ships === false &&
        /45 matches the bots/.test(R.v4546Claim) && /55/.test(R.v4546Truth),
        "Camera.MAX_SLOPE_DEG is " + Camera.MAX_SLOPE_DEG + ", BotManager passes " + bots.value + ", and " +
        "terrainWalk's module DEFAULT is " + dflt.value + " and is read by no shipping caller -- " +
        "BotManager has always passed maxSlopeDeg explicitly. The 45 came from the default, the note " +
        "credited it to the bots, and nothing checked. *** THE NUMBER IS STILL DEFENSIBLE AND THE REASON " +
        "WAS NOT, *** which is why `ships` is a field on every site in this census: a module default that " +
        "every caller overrides is documentation, and reading it as behaviour is how this happened.");
    report("this is also why section 3 matters rather than being a curiosity. Had 45 and 55 differed on a " +
           "lattice, a false justification would have shipped an actual behavioural split between the " +
           "player and the bots. It did not, and that is luck rather than care.");
}

// =============================================================================================================
console.log("\n5. AN ABSENCE IS NOT A SITE, AND THE FIRST DRAFT OF THIS CENSUS COULD NOT SEE ONE");
{
    const t = qOf("terminal");
    const pl = t.rows.find((r) => r.who === "player");
    const fb = t.rows.find((r) => r.who === "fallBody");
    const kd = t.rows.find((r) => r.who === "kaijuDrive");
    ok("!! the player's MISSING terminal clamp is a census row, so the quantity can disagree with itself",
        pl && pl.value === -Infinity && kd && kd.value === -Infinity && fb.value === -55 && !t.shippedAgree,
        "player " + pl.value + ", kaiju drive " + kd.value + ", fallBody " + fb.value + ". *** THE FIRST " +
        "DRAFT OF THIS CENSUS READ THIS AS AGREED *** -- one site, one value, nothing to differ from -- on " +
        "the quantity section 2 measures the largest gap in, because AN ABSENCE IS NOT A SITE. v4547 " +
        "anchored it on the SHAPE of the player's integration and wrote that the day the shape changed the " +
        "site would read null and the census would say STALE. *** IT DID, ONE ROUND LATER, AND THE NEW " +
        "SHAPE IS BETTER: *** v4548 routed both camera falls through fallBody.fallStep, which made them " +
        "NAME a terminal, so 'no terminal velocity' stopped being a thing a regex had to infer and became " +
        "a literal the call site states. Two sites now, and both say it out loud.");

    const camSrc = fs.readFileSync(path.join(ENG, "camera", "camera.js"), "utf8");
    const fbSrc = fs.readFileSync(path.join(ENG, "physics", "character", "fallBody.mjs"), "utf8");
    // *** THE ROUND'S OWN SUBJECT, CHECKED AGAINST THE BYTES: THE COPIES ARE GONE. *** A "fall until you
    // land" is an integration of a vertical velocity followed by a clamp to a probed surface, and camera.js
    // had TWO of them -- _moveFP's airborne branch and _moveKaijuDrive's six lines -- beside fallBody's and
    // kinematic's. It now has NONE: both call fallStep. The shape is searched for rather than described.
    const integrations = (camSrc.match(/^\s*this\._(?:fpVelY|kaijuDriveVelY)\s*[-+]=\s*this\._gravity/gm) || []);
    const fallStepCalls = (camSrc.match(/fallStep\(\{/g) || []);
    ok("!! *** camera.js INTEGRATES NO GRAVITY OF ITS OWN ANY MORE: TWO COPIES OUT, TWO CALLS IN ***",
        integrations.length === 0 && fallStepCalls.length === 2 &&
        /Math\.max\(terminal,/.test(fbSrc) && /import \{ fallStep \}/.test(camSrc),
        integrations.length + " gravity integrations left in camera.js and " + fallStepCalls.length +
        " calls to fallStep. Before v4548 it was 2 and 0. fallBody is the one that clamps with " +
        "Math.max(terminal, ...) and the one that probes at the CURRENT height and compares the WANTED " +
        "one -- which is the whole of its 'cannot tunnel, structurally rather than by substepping' claim, " +
        "and the thing neither copy did.");

    // *** v4550 -- THE SEVENTH QUANTITY, AND IT IS NOT A NUMBER: WHAT COUNTS AS SOLID. *** The census in
    // SITES compares gravity, step-up, terminal and the rest, all of which are numbers a regex can lift.
    // "Is this voxel solid to a body" is a PREDICATE, and camera.js held three copies of it with one of
    // them excluding the water ids -- so the file's collision test walked into water its own ground test
    // stood the body on. One predicate now, and it is world.isAir's rule, which is what BotManager's bots
    // already got through surfaceProbe. tools/ship/playerWater-selfcheck.mjs owns the driving; this row is
    // the SECOND KEEPER, and it exists because that gate's sabotage battery found it was the only one --
    // all six other camera gates stayed green through every sabotage, none of their fixtures having a
    // water voxel in it.
    ok("!! *** the player and the bots share ONE rule for what a voxel is, and it is a predicate ***",
        Camera.isSolidToBody(10) && Camera.isSolidToBody(11) && !Camera.isSolidToBody(0)
        && !Camera.isSolidToBody(undefined)
        && (camSrc.match(/Camera\.isSolidToBody\(/g) || []).length >= 3
        && !/!==\s*1[01]\b/.test(noComments(camSrc)),
        "water and flowing water are SOLID to the player's body, as they are to every bot; the three " +
        "sites in camera.js route through Camera.isSolidToBody and no `!== 10`/`!== 11` survives in code.");
}

// =============================================================================================================
console.log("\n6. WHAT A DECLARED LIST CANNOT SEE, AND THE GUARD FOR IT");
{
    const live = characterModules();
    ok("!! a seventh character controller cannot arrive in silence",
        live.join(",") === MODULES.join(",") && live.length === R.modules,
        "physics/character/ holds " + live.length + ": " + live.join(", ") + ". *** THE SITE LIST IS A " +
        "LIST AND THIS ROW IS THE DISCOVERY BESIDE IT. *** It cannot tell you that a listed module grew a " +
        "SEVENTH quantity, which is the gap that remains and is stated rather than papered over; it does " +
        "catch the commoner thing, a new controller landing with its own gravity and nobody re-taking " +
        "this census. camera/camera.js and simulation/BotManager.js are controllers outside that " +
        "directory and are covered by their sites rather than by this count.");

    // *** THE SEVENTH QUANTITY THE ARRIVAL BROUGHT, WHICH THE COUNT ABOVE CANNOT SEE. *** The row above
    // catches a module landing; this one catches what it landed WITH. Both numbers are read from the
    // shipping source, so the row goes red the day either moves -- which is the only way a disagreement
    // recorded as deliberate stays honest.
    const gSrc = fs.readFileSync(path.join(ENG, "physics", "character", "capsuleGround.mjs"), "utf8");
    const sSrc = fs.readFileSync(path.join(ENG, "physics", "character", "capsuleSettle.mjs"), "utf8");
    const standDeg = Number((gSrc.match(/maxSlopeDeg\s*=\s*([\d.]+)/) || [])[1]);
    const settleY = Number((sSrc.match(/export const GROUND_SUPPORT_NORMAL_Y\s*=\s*([\d.]+)/) || [])[1]);
    ok("!! *** physics/character/ spells 'how steep may ground be' TWICE, in two units, and they DISAGREE ***",
        standDeg === G.standDeg && settleY === G.settleNormalY &&
        Math.abs((Math.acos(settleY) * 180 / Math.PI) - standDeg - G.apartDeg) < 1e-9 && G.agree === false,
        `capsuleGround maxSlopeDeg ${standDeg} (normal.y >= ${Math.cos(standDeg * Math.PI / 180).toFixed(4)}) ` +
        `against capsuleSettle GROUND_SUPPORT_NORMAL_Y ${settleY} (up to ${(Math.acos(settleY) * 180 / Math.PI).toFixed(1)} deg) ` +
        `-- ${G.apartDeg.toFixed(1)} degrees apart. NOT reconciled: they are different contracts (stand vs ` +
        `depenetrate) and nobody has established whether 0.5 was chosen for that or inherited from the ported ` +
        `kernel. Recorded so it cannot drift further in silence`);

    ok("   the one quantity the shipping controllers already agree on is named, and it agrees",
        qOf("stepUp").shippedAgree && qOf("stepUp").shippedValues.length === 1 &&
        qOf("stepUp").shippedValues[0] === R.stepUpBoth && R.agreed.join(",") === "stepUp",
        "stepUp is " + R.stepUpBoth + " for the player and " + R.stepUpBoth + " for the bots -- " +
        "Camera.STEP_UP_MAX and BotManager's BOT_STEP, two symbols that happen to hold one number. It is " +
        "recorded as AGREED rather than passed over, because the row that says they agree is what goes " +
        "red the day one of them moves.");
}

// =============================================================================================================
console.log("\n7. the record is what the code reports now");
{
    ok("!! every field re-derived above rather than typed here",
        C.quantities.filter((q) => !q.shippedAgree).map((q) => q.q).sort().join(",") ===
            R.disagreements.map((d) => d.q).sort().join(",") &&
        R.disagreements.every((d) => d.verdict && d.what && d.what.length > 60) &&
        R.disagreements.filter((d) => d.verdict === "LIVE").length === 2 &&
        Object.isFrozen(R) && Object.isFrozen(R.disagreements),
        "disagreeing: " + C.quantities.filter((q) => !q.shippedAgree).map((q) => q.q).join(", ") +
        "; verdicts " + R.disagreements.map((d) => d.q + "=" + d.verdict).join(", ") + ".");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nnot done here: nothing is UNIFIED. Gravity stays 18 against 20 and the player stays without a " +
    "terminal velocity, because section 2 looked for a correctness argument -- tunnelling -- and did not " +
    "find one, and changing either number changes how the game feels, which is not a call a census makes. " +
    "The speed convention is HORIZONTAL against SURFACE and is a word rather than a number, so it is " +
    "recorded and not in SITES. And a seventh quantity inside a listed module is the gap section 6 names " +
    "and does not close.");
process.exit(fails ? 1 : 0);
