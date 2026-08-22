// WebGLEngine/bz/net/bzPlayerState.js — where a tank is, in as few bytes as will do.
//
// From src/common/PlayerState.cxx (2.4 branch). A `MsgPlayerUpdate` is a float timestamp, a player id, and
// then the state -- and the state is packed one of two ways, decided by the numbers themselves:
//
//     const float smallScale     = 32766.0f;
//     const float smallMaxDist   = 0.02f * smallScale;      // 655.32
//     const float smallMaxVel    = 0.01f * smallScale;      // 327.66
//     const float smallMaxAngVel = 0.001f * smallScale;     // 32.766
//
// If every component fits, the state goes as eight int16s -- `MsgPlayerUpdateSmall` -- and if any does not,
// as floats, under `MsgPlayerUpdate`. So the CODE ITSELF depends on the values, which is why `pack` takes
// `uint16_t& code` by reference and hands it back.
//
// AND THE SCALE CANCELS -- almost. `posShort = pos * smallScale / smallMaxDist` is `pos / 0.02`, which is
// `pos * 50`. Velocities are `* 100`, angular velocity `* 1000`, and only the azimuth keeps the 32766,
// because it is scaled by pi rather than by a round number. The constant that looks like the point of the
// encoding is arithmetically absent from three of its four fields.
//
// EXCEPT THAT C DOES THIS IN `float`, NOT `double`, AND THE ANSWER CHANGES.
//
// `0.02f * 32766.0f` is not 655.32. It is 655.3200073242188, because 0.02 has no exact float. Divide 32766
// by it and you get 49.99999... in double and 50.00000... in float, and `(int16_t)` truncates toward zero.
// One metre packs to 49 if you compute in double and 50 if you compute in float, and BZFlag computes in
// float. Meanwhile one radian per second, whose scale "cancels to 1000", lands at 999.99997 in float and
// packs to 999. So this file does its arithmetic in `Math.fround`, and bz-protocol-selfcheck asserts the
// bytes: 0x0032, 0x0064, and 0x03e7.
//
// Nothing about that is visible from a round trip. A codec that agrees with itself agrees with itself.
//
// A world 800 units across cannot produce a position of 655, so a BZFlag tank in a normal map ALWAYS sends
// the small packet. The large one exists for maps that are bigger than a mile.

"use strict";

import { Writer, Reader } from "./bzPack.js";
import { MSG } from "./bzProtocol.js";

// `f` is a single-precision round. Every constant and every intermediate below passes through it, because
// every one of them is a `float` in the source.
const f = Math.fround;
const smallScale = f(32766.0);
const smallMaxDist = f(f(0.02) * smallScale);
const smallMaxVel = f(f(0.01) * smallScale);
const smallMaxAngVel = f(f(0.001) * smallScale);

// include/PlayerState.h, PStatus. Bit masks, and three of them add fields to the packet.
const Status = {
    DeadStatus: 0,
    Alive: 1 << 0,
    Paused: 1 << 1,
    Exploding: 1 << 2,
    Teleporting: 1 << 3,
    FlagActive: 1 << 4,
    CrossingWall: 1 << 5,
    Falling: 1 << 6,
    OnDriver: 1 << 7,
    UserInputs: 1 << 8,
    JumpJets: 1 << 9,
    PlaySound: 1 << 10,
};

// A C cast to int16 truncates toward zero. `Math.round` would be a nicer number and the wrong one.
const trunc16 = (v) => Math.max(-32768, Math.min(32767, Math.trunc(v)));
const clamped = (v, lim) => (v > lim ? lim : (v < -lim ? -lim : v));

// Which of the two codes this state will travel under. Not a preference: a rule.
function isSmall(s) {
    return Math.abs(s.pos[0]) < smallMaxDist && Math.abs(s.pos[1]) < smallMaxDist && Math.abs(s.pos[2]) < smallMaxDist
        && Math.abs(s.velocity[0]) < smallMaxVel && Math.abs(s.velocity[1]) < smallMaxVel && Math.abs(s.velocity[2]) < smallMaxVel
        && Math.abs(s.angVel) < smallMaxAngVel;
}

// Returns { code, bytes } -- the code, because the values chose it.
function packState(s) {
    const small = !s.forceLarge && isSmall(s);
    const w = new Writer(64);
    w.i32(s.order | 0);
    w.i16(s.status & 0xffff);

    if (!small) {
        w.vec(s.pos).vec(s.velocity).f32(s.azimuth).f32(s.angVel);
    } else {
        for (let i = 0; i < 3; i++) w.i16(trunc16(f(f(f(s.pos[i]) * smallScale) / smallMaxDist)));
        for (let i = 0; i < 3; i++) w.i16(trunc16(f(f(f(s.velocity[i]) * smallScale) / smallMaxVel)));
        // The azimuth is wrapped into -pi..+pi FIRST. `fmodf` keeps the sign of its argument, so an angle
        // of 7 radians becomes 0.717 and an angle of -7 becomes -0.717, and the wrap only fires once.
        let a = f(s.azimuth % f(Math.PI * 2));
        if (a > Math.PI) a = f(a - f(Math.PI * 2));
        else if (a < -Math.PI) a = f(a + f(Math.PI * 2));
        w.i16(trunc16(f(f(a * smallScale) / f(Math.PI))));
        w.i16(trunc16(f(f(f(s.angVel) * smallScale) / smallMaxAngVel)));
    }

    // Three status bits each add a field, in this order, to both encodings.
    if (s.status & Status.JumpJets) w.i16(trunc16(f(clamped(s.jumpJetsScale || 0, 1.0) * smallScale)));
    if (s.status & Status.OnDriver) w.i32(s.phydrv | 0);
    if (s.status & Status.UserInputs) {
        w.i16(trunc16(f(f(clamped(s.userSpeed || 0, smallMaxVel) * smallScale) / smallMaxVel)));
        w.i16(trunc16(f(f(clamped(s.userAngVel || 0, smallMaxAngVel) * smallScale) / smallMaxAngVel)));
    }
    if (s.status & Status.PlaySound) w.u8(s.sounds || 0);

    return { code: small ? MSG.MsgPlayerUpdateSmall : MSG.MsgPlayerUpdate, bytes: w.bytes() };
}

function unpackState(code, bytes, at) {
    const r = new Reader(bytes, at || 0);
    const s = { order: r.i32(), status: r.i16() & 0xffff };

    if (code === MSG.MsgPlayerUpdate) {
        s.pos = r.vec(); s.velocity = r.vec(); s.azimuth = r.f32(); s.angVel = r.f32();
    } else {
        const p = [r.i16(), r.i16(), r.i16()], v = [r.i16(), r.i16(), r.i16()];
        const azi = r.i16(), av = r.i16();
        s.pos = p.map((x) => f(f(x * smallMaxDist) / smallScale));
        s.velocity = v.map((x) => f(f(x * smallMaxVel) / smallScale));
        s.azimuth = f(f(azi * f(Math.PI)) / smallScale);
        s.angVel = f(f(av * smallMaxAngVel) / smallScale);
    }

    if (s.status & Status.JumpJets) s.jumpJetsScale = f(r.i16() / smallScale);
    if (s.status & Status.OnDriver) s.phydrv = r.i32();
    if (s.status & Status.UserInputs) {
        s.userSpeed = f(f(r.i16() * smallMaxVel) / smallScale);
        s.userAngVel = f(f(r.i16() * smallMaxAngVel) / smallScale);
    }
    if (s.status & Status.PlaySound) s.sounds = r.u8();
    return s;
}

// A whole MsgPlayerUpdate: `float timeStamp`, `uint8 playerId`, then the state. ServerLink::sendPlayerUpdate.
function packPlayerUpdate(timeStamp, playerId, state) {
    const st = packState(state);
    const w = new Writer(5 + st.bytes.length);
    w.f32(timeStamp).u8(playerId).raw(st.bytes);
    return { code: st.code, payload: w.bytes() };
}
function unpackPlayerUpdate(code, payload) {
    const r = new Reader(payload);
    const timeStamp = r.f32();
    const playerId = r.u8();
    return { timeStamp, playerId, state: unpackState(code, payload, r.at) };
}

export { Status, smallScale, smallMaxDist, smallMaxVel, smallMaxAngVel, isSmall, packState, unpackState, packPlayerUpdate, unpackPlayerUpdate, trunc16, f as float32 };
if (typeof module !== "undefined" && module.exports)
    module.exports = { Status, smallScale, smallMaxDist, smallMaxVel, smallMaxAngVel, isSmall, packState, unpackState, packPlayerUpdate, unpackPlayerUpdate, trunc16 };
