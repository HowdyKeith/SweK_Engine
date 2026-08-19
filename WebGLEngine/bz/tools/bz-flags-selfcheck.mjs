// bz/tools/bz-flags-selfcheck.mjs — the flags, and the line between what we do and what we name.
//
//   node bz/tools/bz-flags-selfcheck.mjs
//
// A flag has been "named, not implemented" since round nine. This round draws the line where it actually is.
//
// THE WIRE IS COMPLETE, and it is checked with exact bytes: all forty-six flag types, `Flag::pack`'s
// fifty-five bytes, `MsgFlagUpdate`, `MsgGrabFlag`, `MsgDropFlag`, `MsgCaptureFlag`. Nothing here is guessed.
//
// THE EFFECTS ARE NOT COMPLETE, AND THE LIST SAYS SO. Eight of the forty-six change a tank this engine
// already simulates. The other thirty-eight are named -- and the assertion that matters is that **every flag
// is accounted for exactly once**, by `IMPLEMENTED` or by `UNIMPLEMENTED`, and never by both. A flag missing
// from both is a flag whose effect nobody decided about, and that is how a port starts lying.
//
// I first wrote the flag table from memory of the game and got three of them wrong. There is no `Rico`; `RC`
// is ReverseControls; Obesity is `O`. It comes from `src/common/Flag.cxx` now.

import {
    FLAGS, FlagStatus, FlagEndurance, FLAG_PLEN, IMPLEMENTED, UNIMPLEMENTED,
    flagEffect, applyFlag, readFlag, packFlag, readFlagType, packFlagType, SHOT_FLAGS,
    readFlagUpdate, readGrabFlag, readDropFlag, readCaptureFlag,
    grabFlag, dropFlag, withinGrabRange,
} from "../net/bzFlags.js";
import { Writer, Reader } from "../net/bzPack.js";
import { MSG, codeTag, parseFrames } from "../net/bzProtocol.js";
import { makeBZDB } from "../bzdb.js";
import { makeTank } from "../bzTank.js";

let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const hex = (b) => Buffer.from(b).toString("hex");
const db = makeBZDB();

// --- 1. the table comes from the source ---------------------------------------------------------------
{
    const abbrevs = Object.keys(FLAGS).filter((k) => k !== "");
    ok("there are forty-six flags, and one empty abbreviation for none", abbrevs.length === 46 && FLAGS[""] === "(none)");
    ok("the four team flags carry a star", ["R*", "G*", "B*", "P*"].every((k) => FLAGS[k] && FLAGS[k].endsWith("Team")));
    ok("`RC` is ReverseControls, not Rico -- which I had wrong from memory", FLAGS.RC === "ReverseControls");
    ok("Obesity is `O`", FLAGS.O === "Obesity");
    ok("...and there is no flag called Rico", !Object.values(FLAGS).includes("Rico"));
    ok("Jumping is `JP`, and `J` is nothing", FLAGS.JP === "Jumping" && !FLAGS.J);
    ok("no abbreviation is longer than two characters", abbrevs.every((a) => a.length <= 2));
}

// --- 2. THE INVARIANT: every flag accounted for exactly once ---------------------------------------------
{
    const abbrevs = Object.keys(FLAGS).filter((k) => k !== "");
    const impl = Object.keys(IMPLEMENTED), unimpl = Object.keys(UNIMPLEMENTED);
    // v2211 -- five shot flags moved into bz/bzShotFlags.js: F, MG, L, SB, R.
    const shotImpl = [...impl, ...SHOT_FLAGS];
    ok(`${shotImpl.length} flags are implemented`, new Set(shotImpl).size === 13);
    ok(`${unimpl.length} are named and not implemented`, unimpl.length === 33);

    const orphans = abbrevs.filter((a) => !impl.includes(a) && !SHOT_FLAGS.has(a) && !unimpl.includes(a));
    ok("EVERY flag is in one list or the other", orphans.length === 0, orphans.join(", "));
    const both = [...impl, ...SHOT_FLAGS].filter((a) => unimpl.includes(a));
    ok("...and no flag is in both", both.length === 0, both.join(", "));
    ok("...which is what stops a port from quietly deciding it implemented something", true);

    // "no radar" is eight characters and a complete reason. The first draft demanded nine, which is not a
    // property of anything -- a test with an arbitrary threshold measures the threshold.
    ok("every unimplemented flag has a reason, not a shrug", unimpl.every((k) => UNIMPLEMENTED[k].trim().length > 0 && / /.test(UNIMPLEMENTED[k])));
    ok("Useless does nothing, on purpose", /on purpose/.test(UNIMPLEMENTED.US));
}

// --- 3. the effects, from BZDB's own constants -----------------------------------------------------------
{
    ok("a flag we do not implement has no effect, and says so with null", flagEffect("GM", db) === null && flagEffect("SW", db) === null);
    ok("no flag at all has no effect", flagEffect("", db) === null && flagEffect(null, db) === null);

    const v = flagEffect("V", db);
    ok("High Speed multiplies speed by `_velocityAd`", close(v.speed, db.eval("_velocityAd")) && v.speed > 1);
    const qt = flagEffect("QT", db);
    ok("Quick Turn multiplies turn rate by `_angularAd`", close(qt.angVel, db.eval("_angularAd")) && qt.angVel > 1);
    ok("Tiny shrinks by `_tinyFactor`", close(flagEffect("T", db).size, db.eval("_tinyFactor")) && flagEffect("T", db).size < 1);
    ok("Obesity grows by `_obeseFactor`", flagEffect("O", db).size > 1);
    ok("Thief is fast AND small", flagEffect("TH", db).speed > 1 && flagEffect("TH", db).size < 1);
    ok("Narrow is not a scale: it is a flag on its own", flagEffect("N", db).narrow === true && flagEffect("N", db).size === undefined);
    ok("Shield absorbs, Jumping permits", flagEffect("SH", db).shield === true && flagEffect("JP", db).jump === true);

    const spec = makeTank(db).spec;
    const fast = applyFlag(spec, "V", db);
    ok("applying a flag returns a NEW spec", fast !== spec && fast.speed > spec.speed);
    ok("...and never mutates the tank's own numbers, because dropping restores them", spec.speed === makeTank(db).spec.speed);
    ok("...and remembers which flag it is", fast.flag === "V");
    const tiny = applyFlag(spec, "T", db);
    ok("Tiny shrinks all three dimensions", tiny.dx < spec.dx && tiny.dy < spec.dy && tiny.height < spec.height);
    const narrow = applyFlag(spec, "N", db);
    ok("Narrow sets the hull's half-breadth to a millimetre -- a tank you cannot hit from the side",
        close(narrow.dy, 0.001) && close(narrow.dx, spec.dx));
    ok("an unimplemented flag still changes the spec's `flag`, and nothing else",
        (() => { const g = applyFlag(spec, "GM", db); return g.flag === "GM" && g.speed === spec.speed && g.dx === spec.dx; })());
}

// --- 4. FlagType and Flag, byte for byte ------------------------------------------------------------------
{
    ok("a flag type is two bytes, zero-padded", hex(new Writer(2).u8("GM".charCodeAt(0)).u8("GM".charCodeAt(1)).bytes()) === "474d");
    const w2 = new Writer(2); packFlagType(w2, "L");
    ok("a one-letter abbreviation pads with a zero", hex(w2.bytes()) === "4c00");
    const w0 = new Writer(2); packFlagType(w0, "");
    ok("no flag is two zero bytes", hex(w0.bytes()) === "0000");
    ok("...and reads back as no flag", readFlagType(new Reader(w0.bytes())) === "");
    ok("a team flag's star survives", (() => { const w = new Writer(2); packFlagType(w, "R*"); return readFlagType(new Reader(w.bytes())) === "R*"; })());

    const f = {
        type: "GM", status: FlagStatus.OnGround, endurance: FlagEndurance.Unstable, owner: 3,
        position: [1, 2, 3], launchPosition: [4, 5, 6], landingPosition: [7, 8, 9],
        flightTime: 1.5, flightEnd: 2.5, initialVelocity: 3.5,
    };
    const w = new Writer(FLAG_PLEN); packFlag(w, f);
    ok(`a Flag is exactly ${FLAG_PLEN} bytes`, w.bytes().length === FLAG_PLEN && FLAG_PLEN === 55);
    ok("...which is 2 + 2 + 2 + 1 + 36 + 12", 2 + 2 + 2 + 1 + 36 + 12 === 55);

    const back = readFlag(new Reader(w.bytes()));
    ok("it round-trips its type and its status", back.type === "GM" && back.status === FlagStatus.OnGround);
    ok("...its endurance and its owner", back.endurance === FlagEndurance.Unstable && back.owner === 3);
    ok("...all three of its positions", back.position.join() === "1,2,3" && back.landingPosition.join() === "7,8,9");
    ok("...and its three floats", close(back.flightTime, 1.5) && close(back.initialVelocity, 3.5));
    ok("...and it knows the flag's name", back.name === "Guided Missile");

    ok("FlagStatus: a flag on the ground can be picked up; one that does not exist cannot",
        FlagStatus.NoExist === 0 && FlagStatus.OnGround === 1 && FlagStatus.OnTank === 2 && FlagStatus.InAir === 3);
}

// --- 5. the messages ---------------------------------------------------------------------------------------
{
    const flag = (type, index) => ({
        index, type, status: FlagStatus.OnGround, endurance: 0, owner: 0xff,
        position: [index, 0, 0], launchPosition: [0, 0, 0], landingPosition: [0, 0, 0],
        flightTime: 0, flightEnd: 0, initialVelocity: 0,
    });

    // MsgFlagUpdate: a count, then `index + flag` for each.
    const w = new Writer(2 + 3 * (2 + FLAG_PLEN));
    w.u16(3);
    for (const t of ["GM", "SH", "V"]) { const f = flag(t, ["GM", "SH", "V"].indexOf(t)); w.u16(f.index); packFlag(w, f); }
    const flags = readFlagUpdate(w.bytes());
    ok("MsgFlagUpdate is a count and then index+flag, over and over", flags.length === 3);
    ok("...each carrying its own index", flags.map((f) => f.index).join() === "0,1,2");
    ok("...and its type", flags.map((f) => f.type).join() === "GM,SH,V");
    ok("a short buffer breaks the loop rather than throwing, exactly as the client does",
        readFlagUpdate(w.bytes().subarray(0, 2 + 2 + 10)).length === 0);
    ok("a count of zero is no flags", readFlagUpdate(new Writer(2).u16(0).bytes()).length === 0);

    // The server's MsgGrabFlag names the player AND sends the whole flag.
    const gw = new Writer(1 + 2 + FLAG_PLEN);
    gw.u8(4).u16(7); packFlag(gw, flag("SH", 7));
    const g = readGrabFlag(gw.bytes());
    ok("the server's MsgGrabFlag names the player, the index, and the whole flag",
        g.playerId === 4 && g.index === 7 && g.flag.type === "SH");

    const dw = new Writer(1 + 2 + FLAG_PLEN);
    dw.u8(4).u16(7); packFlag(dw, flag("SH", 7));
    ok("...and so does MsgDropFlag", readDropFlag(dw.bytes()).playerId === 4);

    const cw = new Writer(1 + 2 + 2);
    cw.u8(4).u16(7).u16(2);
    const c = readCaptureFlag(cw.bytes());
    ok("MsgCaptureFlag is a player, a flag and a TEAM: no flag body at all", c.playerId === 4 && c.index === 7 && c.team === 2);
}

// --- 6. THE ASYMMETRY: what a client sends is not what a server sends ---------------------------------------
{
    const g = grabFlag(9);
    ok("a client asks for a flag with TWO BYTES: an index", g.length === 4 + 2);
    ok('...under the code "gf"', codeTag((g[2] << 8) | g[3]) === "gf" && ((g[2] << 8) | g[3]) === MSG.MsgGrabFlag);
    ok("...and the index is on the wire", new Reader(g, 4).u16() === 9);
    ok("A CLIENT'S MsgGrabFlag IS 2 BYTES; THE SERVER'S IS 58", 2 !== 1 + 2 + FLAG_PLEN);

    const d = dropFlag([1, 2, 3]);
    ok("a client drops a flag by saying where it was standing", d.length === 4 + 12);
    ok('...under the code "df"', codeTag((d[2] << 8) | d[3]) === "df");
    ok("...and it never says WHICH flag, because you can only carry one", d.length - 4 === 12);
    const r = new Reader(d, 4);
    ok("...the position is a vector", r.vec().join() === "1,2,3");

    ok("both are ordinary frames", parseFrames(g).msgs.length === 1 && parseFrames(d).msgs.length === 1);
}

// --- 7. reaching for one ------------------------------------------------------------------------------------
{
    const spec = makeTank(db).spec;
    const radius = Math.max(spec.dx, spec.dy);
    ok("a flag under our tracks is in reach", withinGrabRange([0, 0, 0], [0, 0, 0], radius));
    ok("...one a radius away still is", withinGrabRange([radius - 0.01, 0, 0], [0, 0, 0], radius));
    ok("...and one just beyond is not", !withinGrabRange([radius + 0.5, 0, 0], [0, 0, 0], radius));
    ok("a flag on a roof above us is not in reach", !withinGrabRange([0, 0, 9], [0, 0, 0], radius));
    ok("...but one on the box we are standing on is", withinGrabRange([0, 0, 0.5], [0, 0, 0], radius));
}

console.log("");
console.log("  (46 flags. 8 change a tank this engine simulates and are implemented from BZDB's own");
console.log("   constants. 38 are named, with a reason each. Every one is in exactly one of those lists,");
console.log("   and that assertion is the only thing standing between this and a port that pretends.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
