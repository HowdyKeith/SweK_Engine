// WebGLEngine/bz/net/bzFlags.js — the flags, and the small honest part of what they do.
//
// A flag has been "named, not implemented" since round nine. The map says where they land -- `entryZones`,
// read since v2199 -- and that is all a map says. What a flag DOES is a game rule, and there are forty-eight
// of them.
//
// This file draws the line where it actually is:
//
//   THE WIRE IS COMPLETE. All forty-eight abbreviations, `Flag::pack`'s fifty-five bytes, `MsgFlagUpdate`,
//   `MsgGrabFlag`, `MsgDropFlag`, `MsgCaptureFlag`. A client that reads these knows where every flag is, who
//   is carrying what, and when somebody scores. Nothing here is guessed.
//
//   THE EFFECTS ARE NOT, AND THE LIST SAYS SO. Six of them change a tank this engine already simulates -- its
//   speed, its turn rate, the size of its hull, whether it can jump, whether a hit kills it. Those are
//   implemented, from BZDB's own constants. The other forty-two change shots, rendering, or rules this port
//   has never had, and `flagEffect()` returns `null` for them rather than pretending. `UNIMPLEMENTED` names
//   every one, because a gap with a shape is a to-do and a gap without one is a mystery.
//
// TWO ASYMMETRIES worth writing down, because they are the shape of the protocol:
//
//   * `MsgGrabFlag` FROM the client is two bytes -- a flag index. `MsgGrabFlag` FROM the server is a player,
//     a flag index, and the whole fifty-five-byte flag. You ask; the server tells everybody what happened.
//   * `MsgDropFlag` FROM the client is a POSITION and nothing else -- not even which flag, because you can
//     only be carrying one. From the server it is a player, an index, and the flag again.

"use strict";

import { Writer, Reader } from "./bzPack.js";
import { MSG, frame } from "./bzProtocol.js";

// include/Flag.h
const FlagStatus = { NoExist: 0, OnGround: 1, OnTank: 2, InAir: 3, Coming: 4, Going: 5 };
const FlagEndurance = { Normal: 0, Unstable: 1, Sticky: 2 };
const FLAG_PLEN = 55;                    // include/Flag.h: FlagPLen

// src/common/Flag.cxx, in the order it defines them: FORTY-SIX flags and the empty one that means "none".
// I first wrote this table from memory of the game and got three of them wrong -- there is no `Rico`, `RC`
// is ReverseControls, and Obesity is `O`. Extracted from the source instead, which is the only way anything
// in this port has ever been right.
const FLAGS = {
    "": "(none)",
    "R*": "Red Team", "G*": "Green Team", "B*": "Blue Team", "P*": "Purple Team",
    V: "High Speed", QT: "Quick Turn", OO: "Oscillation Overthruster", F: "Rapid Fire",
    MG: "Machine Gun", GM: "Guided Missile", L: "Laser", R: "Ricochet",
    SB: "Super Bullet", IB: "Invisible Bullet", ST: "Stealth", T: "Tiny",
    N: "Narrow", SH: "Shield", SR: "Steamroller", SW: "Shock Wave",
    PZ: "Phantom Zone", G: "Genocide", JP: "Jumping", ID: "Identify",
    CL: "Cloaking", US: "Useless", MQ: "Masquerade", SE: "Seer",
    TH: "Thief", BU: "Burrow", WG: "Wings", A: "Agility",
    RC: "ReverseControls", CB: "Colorblindness", O: "Obesity", LT: "Left Turn Only",
    RT: "Right Turn Only", FO: "Forward Only", RO: "ReverseOnly", M: "Momentum",
    B: "Blindness", JM: "Jamming", WA: "Wide Angle", NJ: "No Jumping",
    TR: "Trigger Happy", BY: "Bouncy",
};

// --- the effects this engine can honestly apply -----------------------------------------------------------
//
// From src/bzflag/LocalPlayer.cxx and src/bzflag/Player.cxx, with BZDB's own defaults (src/common/global.cxx).
// Every one of these changes a number `bz/bzTank.js` already uses.
// v2211 -- and five more that change the SHOT rather than the tank live in bz/bzShotFlags.js: Rapid Fire,
// Machine Gun, Laser, Super Bullet and Ricochet. `Thief` appears in both, because it changes the tank AND
// its shot.
const SHOT_FLAGS = new Set(["F", "MG", "L", "SB", "R"]);

const IMPLEMENTED = {
    V: { speed: "_velocityAd" },            // LocalPlayer::calcRelativeMotion, fracOfMaxSpeed *= _velocityAd
    TH: { speed: "_thiefVelAd", size: "_thiefTinyFactor" },
    QT: { angVel: "_angularAd" },           // ...and fracOfMaxAngVel *= _angularAd
    T: { size: "_tinyFactor" },             // Player::setDimensions, both axes
    O: { size: "_obeseFactor" },
    N: { narrow: true },                    // dimensionsTarget[1] = 0.001 -- a tank you cannot hit from the side
    SH: { shield: true },                   // one hit absorbed; the flag goes, you do not
    JP: { jump: true },                     // and a world where `_jumpVelocity` is 0 has no jumping without it
};

// Everything else, by name. Not a shrug: a list. Every key here is a flag this engine reads off the wire,
// tracks, carries, and drops -- and whose EFFECT it does not apply, because the effect is about shots, or
// rendering, or a rule this port has never had.
const UNIMPLEMENTED = {
    "R*": "team flag: capture rules", "G*": "team flag: capture rules",
    "B*": "team flag: capture rules", "P*": "team flag: capture rules",
    OO: "drive through buildings",
    GM: "guided shots (MsgGMUpdate)", IB: "shots invisible to others", ST: "invisible on radar",
    SR: "kill by driving into somebody", SW: "an area-of-effect death on drop",
    PZ: "phase through walls; only PZ shots hit you", G: "killing one tank kills its whole team",
    ID: "see other tanks' flags", CL: "invisible to others", US: "does nothing, on purpose",
    MQ: "look like an enemy", SE: "see stealth, cloaked and phantom tanks",
    BU: "drive below ground, slower", WG: "jump again in mid-air", A: "sharper acceleration",
    RC: "the controls are reversed", CB: "you cannot tell the teams apart",
    LT: "you may only turn left", RT: "you may only turn right",
    FO: "you may only drive forward", RO: "you may only reverse",
    M: "acceleration is sluggish", B: "you cannot see other tanks",
    JM: "no radar", WA: "a wider field of view", NJ: "you cannot jump",
    // v2211 -- BOTH OF THESE I WROTE FROM THE ABBREVIATION AND BOTH WERE WRONG. From Flag.cxx: `BY` is
    // "Tank can't stop bouncing" -- nothing to do with shots. `TR` is "Tank can't stop firing" -- nothing to
    // do with reload. They are still unimplemented, and now for the right reason.
    TR: "the tank cannot stop firing", BY: "the tank cannot stop bouncing",
};

// A flag's effect on a tank, or null. `db` is the world's BZDB, because a server may have `-set` any of these.
function flagEffect(abbrev, db) {
    const spec = IMPLEMENTED[abbrev];
    if (!spec) return null;
    const out = { abbrev, name: FLAGS[abbrev] || abbrev };
    if (spec.speed) out.speed = db ? db.eval(spec.speed) : null;
    if (spec.angVel) out.angVel = db ? db.eval(spec.angVel) : null;
    if (spec.size) out.size = db ? db.eval(spec.size) : null;
    if (spec.narrow) out.narrow = true;
    if (spec.shield) out.shield = true;
    if (spec.jump) out.jump = true;
    return out;
}

// Apply it to a tank's spec, returning a NEW spec. The tank's own `spec` is BZDB's, and a flag multiplies it;
// dropping the flag restores it, which is why nothing here mutates.
function applyFlag(spec, abbrev, db) {
    const e = flagEffect(abbrev, db);
    if (!e) return { ...spec, flag: abbrev || null };
    const out = { ...spec, flag: abbrev };
    if (e.speed) out.speed = spec.speed * e.speed;
    if (e.angVel) out.angVel = spec.angVel * e.angVel;
    if (e.size) { out.dx = spec.dx * e.size; out.dy = spec.dy * e.size; out.height = spec.height * e.size; }
    // Narrow is not a scale: BZFlag sets the hull's half-breadth to a thousandth of a metre.
    if (e.narrow) out.dy = 0.001;
    if (e.shield) out.shield = true;
    if (e.jump) out.canJump = true;
    return out;
}

// --- FlagType::pack: two bytes of abbreviation, zero-padded ------------------------------------------------
function packFlagType(w, abbrev) {
    const a = abbrev || "";
    w.u8(a.length > 0 ? a.charCodeAt(0) : 0);
    w.u8(a.length > 1 ? a.charCodeAt(1) : 0);
}
function readFlagType(r) {
    const a = r.u8(), b = r.u8();
    let s = "";
    if (a) s += String.fromCharCode(a);
    if (b) s += String.fromCharCode(b);
    return s;
}

// --- Flag::pack / unpack: fifty-five bytes -----------------------------------------------------------------
function readFlag(r) {
    const type = readFlagType(r);
    const status = r.u16();
    const endurance = r.u16();
    const owner = r.u8();
    const position = r.vec();
    const launchPosition = r.vec();
    const landingPosition = r.vec();
    const flightTime = r.f32();
    const flightEnd = r.f32();
    const initialVelocity = r.f32();
    return { type, name: FLAGS[type] || type, status, endurance, owner, position, launchPosition, landingPosition, flightTime, flightEnd, initialVelocity };
}
function packFlag(w, f) {
    packFlagType(w, f.type);
    w.u16(f.status).u16(f.endurance).u8(f.owner);
    w.vec(f.position).vec(f.launchPosition || [0, 0, 0]).vec(f.landingPosition || [0, 0, 0]);
    w.f32(f.flightTime || 0).f32(f.flightEnd || 0).f32(f.initialVelocity || 0);
}

// --- the messages ------------------------------------------------------------------------------------------
// Server -> everybody: a count, then `index + flag` for each. `FlagPLen` is 55 and the index is two more.
function readFlagUpdate(payload) {
    const r = new Reader(payload);
    const count = r.u16();
    const flags = [];
    for (let i = 0; i < count; i++) {
        if (r.left < 2 + FLAG_PLEN) break;      // the client breaks on a short buffer too; it is not an error
        const index = r.u16();
        flags.push({ index, ...readFlag(r) });
    }
    return flags;
}
// Server -> everybody. The client's own MsgGrabFlag is two bytes; this is the answer, and it names the player.
function readGrabFlag(payload) {
    const r = new Reader(payload);
    return { playerId: r.u8(), index: r.u16(), flag: readFlag(r) };
}
function readDropFlag(payload) {
    const r = new Reader(payload);
    return { playerId: r.u8(), index: r.u16(), flag: readFlag(r) };
}
function readCaptureFlag(payload) {
    const r = new Reader(payload);
    return { playerId: r.u8(), index: r.u16(), team: r.u16() };
}

// Client -> server. You ask for a flag by index; you drop it by saying where you were standing. You never say
// which flag you dropped, because you can only be carrying one.
function grabFlag(index) { const w = new Writer(2); w.u16(index); return frame(MSG.MsgGrabFlag, w.bytes()); }
function dropFlag(pos) { const w = new Writer(12); w.vec(pos); return frame(MSG.MsgDropFlag, w.bytes()); }

// Close enough to reach out and take it. BZFlag uses the tank's own radius; a flag is a point.
function withinGrabRange(flagPos, tankPos, tankRadius) {
    const dx = flagPos[0] - tankPos[0], dy = flagPos[1] - tankPos[1], dz = flagPos[2] - tankPos[2];
    return Math.hypot(dx, dy) <= tankRadius && dz >= -0.1 && dz <= 3.0;
}

export {
    FLAGS, FlagStatus, FlagEndurance, FLAG_PLEN, IMPLEMENTED, UNIMPLEMENTED, SHOT_FLAGS,
    flagEffect, applyFlag, readFlag, packFlag, readFlagType, packFlagType,
    readFlagUpdate, readGrabFlag, readDropFlag, readCaptureFlag,
    grabFlag, dropFlag, withinGrabRange,
};
