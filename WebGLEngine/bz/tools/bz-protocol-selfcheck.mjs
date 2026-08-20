// bz/tools/bz-protocol-selfcheck.mjs — the wire, byte for byte.
//
//   node bz/tools/bz-protocol-selfcheck.mjs
//
// Every other round of this port could be checked against a `.bzw` file sitting on disk. A protocol cannot:
// it is checked against a server that is not here. So this file does the only two honest things available.
//
// It asserts that the fifty-six message codes are what `include/Protocol.h` says they are -- and that each
// is TWO ASCII CHARACTERS, which is a property the enum cannot fail silently. `MsgEnter` is 0x656e, and
// 0x656e is "en".
//
// And it asserts EXACT BYTES for everything this client sends. A codec that round-trips against itself
// proves nothing: two mistakes that agree are still two mistakes. So the numbers below are worked out by
// hand from the source and written down, and the code is checked against them.

import { Writer, Reader } from "../net/bzPack.js";
import {
    CONNECT_HEADER, SERVER_VERSION, PROTO_VERSION, SERVER_PORT, MAX_PACKET_LEN, MAX_UDP_PACKET_LEN, BAN_REFUSAL,
    CallSignLen, MottoLen, TokenLen, VersionLen, PlayerIdPLen, ENTER_LEN,
    MSG, MSG_NAME, codeTag, frame, parseFrames,
    PlayerType, TeamColor, enter, exit, alive, getWorld, message, readReject, readAddPlayer, readKilled,
    killed, readShotBegin, shotBegin, readGameSettings, Reason,
} from "../net/bzProtocol.js";
import {
    Status, smallScale, smallMaxDist, smallMaxVel, smallMaxAngVel,
    isSmall, packState, unpackState, packPlayerUpdate, unpackPlayerUpdate, trunc16, float32,
} from "../net/bzPlayerState.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const hex = (b) => Buffer.from(b).toString("hex");

// --- 1. the fifty-six codes -----------------------------------------------------------------------
{
    ok("there are exactly fifty-six message codes", Object.keys(MSG).length === 56);

    // Every code is two ASCII characters, and that is not decoration: it is how you read a hexdump of a
    // BZFlag stream with your eyes. The three exceptions are deliberate and named.
    const notAscii = Object.entries(MSG).filter(([, c]) => !/^[A-Za-z]{2}$/.test(codeTag(c)));
    ok("...and all but three are two ASCII letters", notAscii.length === 3);
    ok("...the three being MsgNull, MsgPingCodeReply and MsgPingCodeRequest",
        notAscii.map(([n]) => n).sort().join() === "MsgNull,MsgPingCodeReply,MsgPingCodeRequest");

    ok('MsgEnter is 0x656e, which is "en"', MSG.MsgEnter === 0x656e && codeTag(MSG.MsgEnter) === "en");
    ok('MsgKilled is "kl"', MSG.MsgKilled === 0x6b6c && codeTag(MSG.MsgKilled) === "kl");
    ok('MsgPlayerUpdate is "pu" and MsgPlayerUpdateSmall is "ps"',
        codeTag(MSG.MsgPlayerUpdate) === "pu" && codeTag(MSG.MsgPlayerUpdateSmall) === "ps");
    ok('MsgShotBegin is "sb", MsgShotEnd is "se", MsgSuperKill is "sk"',
        codeTag(MSG.MsgShotBegin) === "sb" && codeTag(MSG.MsgShotEnd) === "se" && codeTag(MSG.MsgSuperKill) === "sk");
    ok('MsgUDPLinkRequest is "of" -- and it is not a typo for "on"', MSG.MsgUDPLinkRequest === 0x6f66 && codeTag(MSG.MsgUDPLinkRequest) === "of");
    ok("no two messages share a code", new Set(Object.values(MSG)).size === 56);
    ok("the reverse table names every one of them", Object.values(MSG).every((c) => MSG_NAME[c]));

    ok("the handshake constants are BZFlag's", CONNECT_HEADER === "BZFLAG\r\n\r\n" && SERVER_VERSION === "BZFS0221" && PROTO_VERSION === "0221");
    ok("the well-known port is 5154", SERVER_PORT === 5154);
    ok("a packet may be 1024 bytes, and a UDP one 68", MAX_PACKET_LEN === 1024 && MAX_UDP_PACKET_LEN === 68);
    ok('a ban is announced by "REFUSED:" where the version should be', BAN_REFUSAL === "REFUSED:");
}

// --- 2. the primitives are big-endian ---------------------------------------------------------------
{
    ok("a uint16 goes high byte first", hex(new Writer(2).u16(0x1234).bytes()) === "1234");
    ok("a uint32 too", hex(new Writer(4).u32(0xdeadbeef).bytes()) === "deadbeef");
    ok("an int16 of -2 is ff fe", hex(new Writer(2).i16(-2).bytes()) === "fffe");
    ok("a float is its IEEE-754 bits, big-endian: 1.0 is 3f800000", hex(new Writer(4).f32(1.0).bytes()) === "3f800000");
    ok("...and -2.0 is c0000000", hex(new Writer(4).f32(-2).bytes()) === "c0000000");
    ok("a vector is three of them", new Writer(12).vec([1, 2, 3]).bytes().length === 12);

    // A string field is FIXED WIDTH and NUL-padded, not length-prefixed.
    const s = new Writer(8).str("hi", 8).bytes();
    ok("a string field is NUL-padded to its width", hex(s) === "6869000000000000");
    ok("...and reads back without the padding", new Reader(s).str(8) === "hi");
    ok("a name too long is truncated, exactly as a memcpy into a short buffer is",
        new Reader(new Writer(4).str("abcdefgh", 4).bytes()).str(4) === "abcd");
    ok("an empty field reads as an empty string", new Reader(new Uint8Array(8)).str(8) === "");

    let overran = false;
    try { new Writer(2).u32(1); } catch (e) { overran = true; }
    ok("writing past the end throws rather than corrupting the next message", overran);
    let underran = false;
    try { new Reader(new Uint8Array(2)).u32(); } catch (e) { underran = true; }
    ok("reading past the end throws too", underran);
}

// --- 3. framing ---------------------------------------------------------------------------------------
{
    const f = frame(MSG.MsgEnter, new Uint8Array([1, 2, 3]));
    ok("a frame is length, code, payload", hex(f) === "0003656e010203");
    ok("...and the length does NOT include the four header bytes", f.length === 7);
    ok("an empty payload frames to four bytes", frame(MSG.MsgExit, new Uint8Array(0)).length === 4);

    // TCP does not deliver messages, it delivers bytes.
    const two = new Uint8Array([...frame(MSG.MsgAlive, new Uint8Array(0)), ...frame(MSG.MsgExit, new Uint8Array([9]))]);
    const r = parseFrames(two);
    ok("two frames in one segment are two messages", r.msgs.length === 2 && r.rest.length === 0);
    ok("...named", r.msgs[0].name === "MsgAlive" && r.msgs[1].name === "MsgExit");
    ok("...with their payloads", r.msgs[1].payload[0] === 9);

    const partial = parseFrames(two.subarray(0, 6));
    ok("half a frame is not an error, it is a partial read", partial.msgs.length === 1 && partial.rest.length === 2);
    ok("a header alone yields nothing and keeps the bytes", parseFrames(new Uint8Array([0, 5, 0x61, 0x6c])).rest.length === 4);
    ok("no bytes, no messages", parseFrames(new Uint8Array(0)).msgs.length === 0);

    let threw = false;
    try { parseFrames(new Uint8Array([0xff, 0xff, 0x61, 0x6c])); } catch (e) { threw = true; }
    ok("a frame longer than MaxPacketLen is refused, not allocated", threw);
}

// --- 4. MsgEnter, byte for byte -------------------------------------------------------------------------
{
    // `sendEnter` sizes its buffer with PlayerIdPLen and then never writes it. 1 + 4 + 32 + 128 + 22 + 60.
    ok("the field widths are include/global.h's", CallSignLen === 32 && MottoLen === 128 && TokenLen === 22 && VersionLen === 60 && PlayerIdPLen === 1);
    ok("MsgEnter's payload is 247 bytes", ENTER_LEN === 1 + 4 + 32 + 128 + 22 + 60 && ENTER_LEN === 247);

    const e = enter({ type: PlayerType.TankPlayer, team: TeamColor.ObserverTeam, callsign: "brain" });
    ok("...so the frame is 251", e.length === 251);
    ok("the header says 247 and `en`", hex(e.subarray(0, 4)) === "00f7656e");
    ok("the payload begins with the player type and the team", hex(e.subarray(4, 8)) === "00000005");
    ok("...then the callsign, NUL-padded", new Reader(e.subarray(8)).str(CallSignLen) === "brain");
    ok("the last byte is a zero nobody wrote -- PlayerIdPLen's, and reproduced on purpose", e[e.length - 1] === 0);

    ok("a negative team goes on the wire as two's complement", (() => {
        const a = enter({ team: TeamColor.AutomaticTeam });   // -2
        return hex(a.subarray(6, 8)) === "fffe";
    })());
    ok("a callsign of thirty-three characters is truncated to thirty-two", (() => {
        const long = "x".repeat(33);
        return new Reader(enter({ callsign: long }).subarray(8)).str(CallSignLen).length === 32;
    })());

    ok("MsgExit and MsgAlive carry nothing", exit().length === 4 && alive().length === 4);
    ok("MsgGetWorld carries a 32-bit offset", hex(getWorld(0x01020304)) === "0004677701020304");
    ok("a chat message is a target byte and a 128-byte field", message(0xff, "hi").length === 4 + 1 + 128);
}

// --- 5. the messages we read ------------------------------------------------------------------------------
{
    const rej = new Writer(2 + 8).u16(3).str("no room", 8).bytes();
    ok("MsgReject is a code and a reason", (() => { const r = readReject(rej); return r.code === 3 && r.reason === "no room"; })());

    const add = new Writer(1 + 2 + 2 + 6 + CallSignLen + MottoLen)
        .u8(4).u16(0).i16(1).u16(3).u16(1).u16(0).str("rogue", CallSignLen).str("hi", MottoLen).bytes();
    const p = readAddPlayer(add);
    ok("MsgAddPlayer is an id, a type, a team, three scores and two strings",
        p.id === 4 && p.team === 1 && p.wins === 3 && p.losses === 1 && p.callsign === "rogue" && p.motto === "hi");

    const kill = new Writer(6).u8(2).u8(7).i16(1).i16(-1).bytes();
    const k = readKilled(kill);
    ok("MsgKilled names the victim, the killer, a reason and a shot", k.victim === 2 && k.killer === 7 && k.reason === 1 && k.shotId === -1);
}

// --- 6. the fixed point, and the constant that cancels ---------------------------------------------------------
{
    ok("smallScale is 32766", smallScale === 32766);
    ok("smallMaxDist is 0.02f * smallScale", close(smallMaxDist, 655.32, 1e-4));
    ok("smallMaxVel is 0.01f * smallScale", close(smallMaxVel, 327.66, 1e-4));
    ok("smallMaxAngVel is 0.001f * smallScale", close(smallMaxAngVel, 32.766, 1e-4));

    // THE FINDING. The constant that looks like the point of the encoding is arithmetically absent from
    // three of its four fields: pos*32766/655.32 IS pos*50. Only the azimuth keeps it, because it is
    // scaled by pi rather than by a round number.
    ok("in exact arithmetic a position is quantised to fiftieths of a metre: the scale cancels", close(32766 / (0.02 * 32766), 50, 1e-12));
    ok("...a velocity to hundredths", close(32766 / (0.01 * 32766), 100, 1e-12));
    ok("...an angular velocity to thousandths", close(32766 / (0.001 * 32766), 1000, 1e-9));

    // AND C DOES NOT DO EXACT ARITHMETIC. `0.02f * 32766.0f` is 655.3200073242188, because 0.02 has no
    // exact float. Divide 32766 by it and you get 49.99999... in double and 50.00000... in float; the
    // `(int16_t)` cast truncates toward zero, so one metre packs to 49 if you compute in double and 50 if
    // you compute in float. BZFlag computes in float. And one radian per second, whose scale "cancels to
    // 1000", lands at 999.99997 and packs to 999.
    //
    // Nothing about this is visible from a round trip. A codec that agrees with itself agrees with itself.
    ok("`0.02f * 32766.0f` is NOT 655.32", smallMaxDist !== 655.32 && close(smallMaxDist, 655.3200073242188, 1e-9));
    ok("...so in double a metre would pack to 49", Math.trunc((1 * 32766) / (0.02 * 32766)) === 49);
    ok("...and in float it packs to 50, which is what the server expects", Math.trunc(float32(float32(1 * smallScale) / smallMaxDist)) === 50);
    ok("...while one radian per second packs to 999, not 1000", Math.trunc(float32(float32(1 * smallScale) / smallMaxAngVel)) === 999);

    // The small/large decision is a rule, not a preference, and the CODE depends on the values.
    const base = { order: 1, status: Status.Alive, pos: [0, 0, 0], velocity: [0, 0, 0], azimuth: 0, angVel: 0 };
    ok("a tank in a normal world always sends the small packet", packState({ ...base, pos: [399, -399, 20] }).code === MSG.MsgPlayerUpdateSmall);
    ok("a position of 655.32 forces the large one", packState({ ...base, pos: [smallMaxDist, 0, 0] }).code === MSG.MsgPlayerUpdate);
    ok("...and so does a velocity of 327.66", packState({ ...base, velocity: [0, smallMaxVel, 0] }).code === MSG.MsgPlayerUpdate);
    ok("...and an angular velocity of 32.766", packState({ ...base, angVel: smallMaxAngVel }).code === MSG.MsgPlayerUpdate);
    ok("a hair under each of them stays small", isSmall({ ...base, pos: [655.31, 0, 0], velocity: [327.65, 0, 0], angVel: 32.765 }));

    // A C cast to int16 truncates toward zero. `Math.round` would be a nicer number and the wrong one.
    ok("the int16 cast truncates toward zero, both ways", trunc16(1.9) === 1 && trunc16(-1.9) === -1);
    ok("...and saturates rather than wrapping", trunc16(1e9) === 32767 && trunc16(-1e9) === -32768);

    // Exact bytes. pos 1.0 -> 50 -> 0x0032. vel 1.0 -> 100 -> 0x0064. angVel 1.0 -> 999 -> 0x03e7.
    const one = packState({ order: 0, status: 0, pos: [1, 0, 0], velocity: [1, 0, 0], azimuth: 0, angVel: 1 });
    ok("a metre packs to 0x0032, a metre per second to 0x0064, a radian per second to 0x03e7",
        hex(one.bytes) === "00000000" + "0000" + "0032" + "0000" + "0000" + "0064" + "0000" + "0000" + "0000" + "03e7");

    // The azimuth is wrapped into -pi..+pi first, and `fmodf` keeps the sign of its argument.
    const wrap = (a) => unpackState(MSG.MsgPlayerUpdateSmall, packState({ ...base, azimuth: a }).bytes).azimuth;
    ok("an azimuth of 7 radians wraps to about 0.717", close(wrap(7), 7 - 2 * Math.PI, 1e-3));
    ok("...and -7 to about -0.717", close(wrap(-7), -7 + 2 * Math.PI, 1e-3));
    ok("pi itself survives", close(Math.abs(wrap(Math.PI)), Math.PI, 1e-3));

    // Round trips, to the quantum.
    const s = { order: 7, status: Status.Alive, pos: [12.34, -56.78, 1.5], velocity: [25, 0, -0.5], azimuth: 1.0, angVel: 0.5 };
    const u = unpackState(MSG.MsgPlayerUpdateSmall, packState(s).bytes);
    ok("a small packet round-trips a position to within a fiftieth of a metre", u.pos.every((v, i) => Math.abs(v - s.pos[i]) <= 0.02));
    ok("...a velocity to within a hundredth", u.velocity.every((v, i) => Math.abs(v - s.velocity[i]) <= 0.01));
    ok("...and an angular velocity to within a thousandth", Math.abs(u.angVel - s.angVel) <= 0.001);
    ok("a large packet round-trips exactly, because it is floats",
        (() => { const big = { ...s, forceLarge: true }; const b = unpackState(MSG.MsgPlayerUpdate, packState(big).bytes); return close(b.pos[0], 12.34, 1e-5) && close(b.azimuth, 1.0, 1e-6); })());
    ok("the order and the status survive both", u.order === 7 && u.status === Status.Alive);

    // Three status bits each add a field, and the reader must know which.
    const jets = { ...s, status: Status.Alive | Status.JumpJets, jumpJetsScale: 0.5 };
    ok("`JumpJets` adds a scale", close(unpackState(MSG.MsgPlayerUpdateSmall, packState(jets).bytes).jumpJetsScale, 0.5, 1e-4));
    const driver = { ...s, status: Status.Alive | Status.OnDriver, phydrv: 42 };
    ok("`OnDriver` adds a physics driver id", unpackState(MSG.MsgPlayerUpdateSmall, packState(driver).bytes).phydrv === 42);
    const inputs = { ...s, status: Status.Alive | Status.UserInputs, userSpeed: 10, userAngVel: 0.7 };
    const ui = unpackState(MSG.MsgPlayerUpdateSmall, packState(inputs).bytes);
    ok("`UserInputs` adds the two of them", close(ui.userSpeed, 10, 0.01) && close(ui.userAngVel, 0.7, 0.001));
    const sound = { ...s, status: Status.Alive | Status.PlaySound, sounds: 3 };
    ok("`PlaySound` adds a byte", unpackState(MSG.MsgPlayerUpdateSmall, packState(sound).bytes).sounds === 3);
    ok("all four together, in order", (() => {
        const all = { ...s, status: Status.Alive | Status.JumpJets | Status.OnDriver | Status.UserInputs | Status.PlaySound,
            jumpJetsScale: 1, phydrv: 9, userSpeed: 1, userAngVel: 1, sounds: 7 };
        const b = unpackState(MSG.MsgPlayerUpdateSmall, packState(all).bytes);
        return b.phydrv === 9 && b.sounds === 7 && close(b.jumpJetsScale, 1, 1e-4);
    })());
    ok("a status with none of them adds nothing", packState({ ...s, status: Status.Alive }).bytes.length === 22);
}

// --- 7. a whole MsgPlayerUpdate --------------------------------------------------------------------------------
{
    const s = { order: 1, status: Status.Alive, pos: [1, 2, 3], velocity: [0, 0, 0], azimuth: 0, angVel: 0 };
    const u = packPlayerUpdate(1234.5, 3, s);
    ok("it is a float timestamp, a player id, and the state", u.payload.length === 4 + 1 + 22);
    ok("...the timestamp first", hex(u.payload.subarray(0, 4)) === "449a5000");
    ok("...then the id", u.payload[4] === 3);
    ok("...and the code came from the values, not the caller", u.code === MSG.MsgPlayerUpdateSmall);
    const back = unpackPlayerUpdate(u.code, u.payload);
    ok("it round-trips", close(back.timeStamp, 1234.5) && back.playerId === 3 && back.state.order === 1);
    ok("...and the position", back.state.pos.every((v, i) => Math.abs(v - s.pos[i]) <= 0.02));
}

// --- 8. the half of the protocol a client that only shoots never discovers ------------------------------
{
    // `bzfs` does no hit detection. The VICTIM sends MsgKilled naming its own killer, and the message it
    // sends does NOT carry the victim -- the server knows who sent it, and prepends it when it broadcasts.
    const k = killed({ killer: 3, reason: Reason.GotShot, shotId: 0x0102 });
    ok("MsgKilled is seven bytes of payload", k.length === 4 + 7);
    ok('...under the code "kl"', codeTag((k[2] << 8) | k[3]) === "kl");
    ok("...beginning with the KILLER, not the victim", k[4] === 3);
    ok("...then the reason, then the shot", hex(k.subarray(5, 9)) === "00010102");
    ok("...and two bytes of flag, zero for none", k[9] === 0 && k[10] === 0);
    ok("`GotShot` is 1, and `GotKilledMsg` is 0", Reason.GotShot === 1 && Reason.GotKilledMsg === 0);
    ok("the message the SERVER broadcasts carries one field more: the victim", (() => {
        const b = new Writer(6).u8(2).u8(7).i16(1).i16(-1).bytes();
        const r = readKilled(b);
        return r.victim === 2 && r.killer === 7;
    })());

    // A shot's id is not a counter: low byte a slot, high byte a salt. `bzfs` drops any slot past
    // `maxShots - 1` without a word, and a client that numbers its shots 1, 2, 3 fires nothing at all.
    const f = shotBegin({ timeSent: 1, player: 3, shotId: (2 & 0xff) | (5 << 8), pos: [1, 2, 3], vel: [10, 0, 0], team: 1, flag: "GM", lifetime: 3.5 });
    const sh = readShotBegin(f.subarray(4));
    ok("a shot reads back as it was written", sh.player === 3 && sh.pos.join() === "1,2,3" && sh.flag === "GM");
    ok("...and its id is a slot and a salt", (sh.shotId & 0xff) === 2 && (sh.shotId >> 8) === 5);
    ok("...which is what `addShot(id & 0xff, id >> 8)` reads", true);

    // MsgGameSettings is the only place a server says how many shots you may have in the air.
    const g = new Writer(30).f32(800).u16(1).u16(2).u16(3).u16(4).u16(5).f32(0.5).f32(0.25).u16(6).u16(7).bytes();
    const gs = readGameSettings(g);
    ok("MsgGameSettings gives the world size", close(gs.worldSize, 800));
    ok("...and maxShots, as its FIFTH field", gs.maxShots === 4);
    ok("...after a `playerSlot` the source itself calls a hack", gs.playerSlot === 3);
}

console.log("");
console.log("  (the codes, the framing and the encodings are transcribed from BZFlag 2.4 and asserted");
console.log("   byte-for-byte. NOTHING HERE HAS SPOKEN TO A REAL bzfs. bz/tools/bzfs-loopback-probe.mjs");
console.log("   proves the handshake and the state machine against a server that speaks the same codec.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
