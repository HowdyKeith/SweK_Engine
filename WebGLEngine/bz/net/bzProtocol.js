// WebGLEngine/bz/net/bzProtocol.js — the fifty-six things a BZFlag server will say to you.
//
// Round eleven, and the only round in this port where nothing we already had helped. Every previous round
// could be checked against a `.bzw` file sitting on disk. A protocol cannot: it is checked against a server
// that is not here.
//
// So the discipline is different, and it is stated up front:
//
//   * the fifty-six message codes are TRANSCRIBED from include/Protocol.h, and they are not arbitrary --
//     each is two ASCII characters, so `MsgEnter` is 0x656e, which is "en". The selfcheck asserts that for
//     every one of them, which is a check the enum cannot fail silently.
//   * the framing, the byte order and the field widths are transcribed from src/net/Pack.cxx,
//     src/bzflag/ServerLink.cxx and src/common/PlayerState.cxx, and the selfcheck asserts EXACT BYTES for
//     the messages we send.
//   * bz/tools/bzfs-loopback-probe.mjs runs a real TCP server that speaks these frames and a real client
//     that connects to it. That proves the handshake, the framing, the state machine and the symmetry of
//     the codec. IT DOES NOT PROVE INTEROP WITH A REAL `bzfs`, and nothing in this tree does. Saying so is
//     the whole point of having said everything else.
//
// The handshake, from ServerLink::ServerLink and bzfs::MakePlayer:
//
//     client -> "BZFLAG\r\n\r\n"                      (10 bytes, no frame)
//     server -> "BZFS0221" + one byte playerId          (9 bytes, no frame; 0xff means the server is full)
//     ...and from here on, every message is framed.
//
// A frame is: uint16 payload length, uint16 message code, payload. Big-endian, both. The length does NOT
// include the four header bytes -- `ServerLink::send` packs `len` and then `code` and then `len` bytes.

"use strict";

import { Writer, Reader } from "./bzPack.js";

// include/version.h + src/date/buildDate.cxx: getServerVersion() is "BZFS" + BZ_PROTO_VERSION.
const CONNECT_HEADER = "BZFLAG\r\n\r\n";
const PROTO_VERSION = "0221";
const SERVER_VERSION = "BZFS" + PROTO_VERSION;
const SERVER_PORT = 5154;
const MAX_PACKET_LEN = 1024;
const MAX_UDP_PACKET_LEN = 68;
const BAN_REFUSAL = "REFUSED:";

// include/global.h. Every one of these is a fixed-width, NUL-padded hole in the packet.
const CallSignLen = 32;
const MottoLen = 128;
const TokenLen = 22;
const VersionLen = 60;
const PlayerIdPLen = 1;      // sizeof(PlayerId), and it matters: see enter() below.
const MessageLen = 128;

// include/Protocol.h, verbatim. Every code is two ASCII bytes, and bz-protocol-selfcheck asserts it.
const MSG = {
    MsgNull:                 0x0000,   // ".."
    MsgPingCodeReply:        0x0303,   // ".."
    MsgPingCodeRequest:      0x0404,   // ".."
    MsgNearFlag:             0x4e66,   // "Nf"
    MsgPortalAdd:            0x5061,   // "Pa"
    MsgPortalRemove:         0x5072,   // "Pr"
    MsgPortalUpdate:         0x5075,   // "Pu"
    MsgAccept:               0x6163,   // "ac"
    MsgAdminInfo:            0x6169,   // "ai"
    MsgAlive:                0x616c,   // "al"
    MsgAddPlayer:            0x6170,   // "ap"
    MsgAutoPilot:            0x6175,   // "au"
    MsgCaptureFlag:          0x6366,   // "cf"
    MsgCustomSound:          0x6373,   // "cs"
    MsgCacheURL:             0x6375,   // "cu"
    MsgDropFlag:             0x6466,   // "df"
    MsgEnter:                0x656e,   // "en"
    MsgExit:                 0x6578,   // "ex"
    MsgFetchResources:       0x6672,   // "fr"
    MsgFlagType:             0x6674,   // "ft"
    MsgFlagUpdate:           0x6675,   // "fu"
    MsgGrabFlag:             0x6766,   // "gf"
    MsgGMUpdate:             0x676d,   // "gm"
    MsgGameSettings:         0x6773,   // "gs"
    MsgGameTime:             0x6774,   // "gt"
    MsgGetWorld:             0x6777,   // "gw"
    MsgHandicap:             0x6863,   // "hc"
    MsgKilled:               0x6b6c,   // "kl"
    MsgLagState:             0x6c73,   // "ls"
    MsgMessage:              0x6d67,   // "mg"
    MsgNewRabbit:            0x6e52,   // "nR"
    MsgNegotiateFlags:       0x6e66,   // "nf"
    MsgUDPLinkRequest:       0x6f66,   // "of"
    MsgUDPLinkEstablished:   0x6f67,   // "og"
    MsgPause:                0x7061,   // "pa"
    MsgPlayerInfo:           0x7062,   // "pb"
    MsgLagPing:              0x7069,   // "pi"
    MsgPlayerUpdateSmall:    0x7073,   // "ps"
    MsgPlayerUpdate:         0x7075,   // "pu"
    MsgQueryGame:            0x7167,   // "qg"
    MsgQueryPlayers:         0x7170,   // "qp"
    MsgReject:               0x726a,   // "rj"
    MsgRemovePlayer:         0x7270,   // "rp"
    MsgReplayReset:          0x7272,   // "rr"
    MsgShotBegin:            0x7362,   // "sb"
    MsgScore:                0x7363,   // "sc"
    MsgShotEnd:              0x7365,   // "se"
    MsgSuperKill:            0x736b,   // "sk"
    MsgScoreOver:            0x736f,   // "so"
    MsgSetVar:               0x7376,   // "sv"
    MsgTransferFlag:         0x7466,   // "tf"
    MsgTimeUpdate:           0x746f,   // "to"
    MsgTeleport:             0x7470,   // "tp"
    MsgTeamUpdate:           0x7475,   // "tu"
    MsgWantWHash:            0x7768,   // "wh"
    MsgWantSettings:         0x7773,   // "ws"
};

const MSG_NAME = {};
for (const k in MSG) if (!(MSG[k] in MSG_NAME)) MSG_NAME[MSG[k]] = k;

// The two ASCII characters a code is made of. `MsgEnter` is "en". `MsgNull`, `MsgPingCodeReply` and
// `MsgPingCodeRequest` are the three that are not, and they are not meant to be.
function codeTag(code) {
    const a = (code >> 8) & 0xff, b = code & 0xff;
    const p = (x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : ".");
    return p(a) + p(b);
}

// --- framing --------------------------------------------------------------------------------------------
function frame(code, payload) {
    const body = payload || new Uint8Array(0);
    const w = new Writer(4 + body.length);
    w.u16(body.length).u16(code).raw(body);
    return w.bytes();
}

// Pull whole frames out of a stream. Returns the messages and whatever bytes are left over, because TCP
// does not deliver messages, it delivers bytes, and a server that sends two frames in one segment is a
// server behaving normally.
function parseFrames(bytes) {
    const msgs = [];
    let at = 0;
    while (bytes.length - at >= 4) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + at, 4);
        const len = view.getUint16(0, false);
        const code = view.getUint16(2, false);
        if (len > MAX_PACKET_LEN) throw new RangeError(`bz frame of ${len} bytes exceeds MaxPacketLen`);
        if (bytes.length - at - 4 < len) break;   // an incomplete frame is not an error, it is a partial read
        msgs.push({ code, name: MSG_NAME[code] || null, payload: bytes.subarray(at + 4, at + 4 + len) });
        at += 4 + len;
    }
    return { msgs, rest: bytes.subarray(at) };
}

// --- the messages we send ----------------------------------------------------------------------------------
//
// `sendEnter` sizes its buffer with PlayerIdPLen and then never writes it: the payload is 247 bytes, of
// which the last one is a zero nobody put there. Reproduced, because a server that checks the length would
// reject 246 and there is no way to know which without asking one.
const ENTER_LEN = PlayerIdPLen + 4 + CallSignLen + MottoLen + TokenLen + VersionLen;   // 247

const PlayerType = { TankPlayer: 0, JAFOPlayer: 1, ComputerPlayer: 2, ChatPlayer: 3 };
const TeamColor = { AutomaticTeam: -2, NoTeam: -1, RogueTeam: 0, RedTeam: 1, GreenTeam: 2, BlueTeam: 3, PurpleTeam: 4, ObserverTeam: 5, RabbitTeam: 6, HunterTeam: 7 };

function enter({ type = PlayerType.TankPlayer, team = TeamColor.ObserverTeam, callsign = "brain", motto = "", token = "", version = "BZFS0221" }) {
    const w = new Writer(ENTER_LEN);
    w.u16(type).u16(team & 0xffff);
    w.str(callsign, CallSignLen);
    w.str(motto, MottoLen);
    w.str(token, TokenLen);
    w.str(version, VersionLen);
    while (w.at < ENTER_LEN) w.u8(0);       // the byte `sendEnter` sizes for and never writes
    return frame(MSG.MsgEnter, w.bytes());
}

function exit() { return frame(MSG.MsgExit, new Uint8Array(0)); }
function alive() { return frame(MSG.MsgAlive, new Uint8Array(0)); }
function udpLinkRequest(playerId) { const w = new Writer(1); w.u8(playerId); return frame(MSG.MsgUDPLinkRequest, w.bytes()); }
function lagPing(seq) { const w = new Writer(2); w.u16(seq); return frame(MSG.MsgLagPing, w.bytes()); }
function wantWorldHash() { return frame(MSG.MsgWantWHash, new Uint8Array(0)); }
function getWorld(offset) { const w = new Writer(4); w.u32(offset >>> 0); return frame(MSG.MsgGetWorld, w.bytes()); }
// FiringInfo::pack -- ShotUpdate.h says FiringInfoPLen = ShotUpdatePLen + 10 = (1 + 32) + 10 = 43, and the
// fields below add up to exactly that: 4 + 33 + 2 + 4.
//
//   float timeSent
//   ShotUpdate:  uint8 player, uint16 id, vec pos, vec vel, float dt, int16 team      (33 bytes)
//   FlagType:    two bytes of the flag's abbreviation, zero-padded -- "" for no flag  (2 bytes)
//   float lifetime
const FIRING_INFO_LEN = 43;
function shotBegin({ timeSent = 0, player, shotId, pos, vel, dt = 0, team = 0, flag = "", lifetime = 3.5 }) {
    const w = new Writer(FIRING_INFO_LEN);
    w.f32(timeSent);
    w.u8(player & 0xff).u16(shotId & 0xffff).vec(pos).vec(vel).f32(dt).i16(team);
    w.u8(flag.length > 0 ? flag.charCodeAt(0) : 0).u8(flag.length > 1 ? flag.charCodeAt(1) : 0);
    w.f32(lifetime);
    return frame(MSG.MsgShotBegin, w.bytes());
}
function shotEnd({ player, shotId, reason = 0 }) {
    const w = new Writer(1 + 2 + 2);
    w.u8(player & 0xff).i16(shotId).u16(reason);
    return frame(MSG.MsgShotEnd, w.bytes());
}
// v2198 -- reading somebody ELSE's shot. The same FiringInfo, unpacked.
function readShotBegin(payload) {
    const r = new Reader(payload);
    const timeSent = r.f32();
    const player = r.u8(), shotId = r.u16();
    const pos = r.vec(), vel = r.vec();
    const dt = r.f32(), team = r.i16();
    const f0 = r.u8(), f1 = r.u8();
    const flag = String.fromCharCode(...[f0, f1].filter(Boolean));
    const lifetime = r.f32();
    return { timeSent, player, shotId, pos, vel, dt, team, flag, lifetime };
}

// v2198 -- AND THE MESSAGE THAT SAYS YOU DIED.
//
// `bzfs` does no hit detection. BZFlag is client-authoritative for death: the VICTIM decides it was hit and
// tells the server who killed it. `ServerLink::sendKilled` packs `killer, reason, shotId, flag` -- and NOT
// the victim, because the server knows who sent it. The server then broadcasts a MsgKilled that DOES begin
// with the victim, which is why `readKilled` reads one field more than `killed()` writes.
//
// Nothing in the source says this out loud, and a pilot that shoots and is never shot looks exactly like a
// pilot whose aim is off. Three GPU Brains fired eighty rounds at each other on a real server and nobody
// died, because nobody had ever told anybody they had.
const Reason = { GotKilledMsg: 0, GotShot: 1, GotRunOver: 2, GotCaptured: 3, GenocideEffect: 4, SelfDestruct: 5, WaterDeath: 6 };

function killed({ killer, reason = Reason.GotShot, shotId = -1, flag = "" }) {
    const w = new Writer(1 + 2 + 2 + 2);
    w.u8(killer & 0xff).i16(reason).i16(shotId);
    w.u8(flag.length > 0 ? flag.charCodeAt(0) : 0).u8(flag.length > 1 ? flag.charCodeAt(1) : 0);
    return frame(MSG.MsgKilled, w.bytes());
}

function wantSettings() { return frame(MSG.MsgWantSettings, new Uint8Array(0)); }

// v2198 -- MsgGameSettings. The reply to MsgWantSettings, and the only place a server tells you HOW MANY
// SHOTS you may have in the air. It matters more than it sounds: a shot's id is not a counter.
function readGameSettings(payload) {
    const r = new Reader(payload);
    return {
        worldSize: r.f32(), gameType: r.u16(), gameOptions: r.u16(),
        playerSlot: r.u16(),           // "An hack to fix a bug on the client", says the source
        maxShots: r.u16(), numFlags: r.u16(),
        linearAcceleration: r.f32(), angularAcceleration: r.f32(),
        shakeTimeout: r.u16(), shakeWins: r.u16(),
    };
}
function negotiateFlags() { return frame(MSG.MsgNegotiateFlags, new Uint8Array(0)); }

function message(to, text) {
    const w = new Writer(1 + MessageLen);
    w.u8(to & 0xff);
    w.str(text, MessageLen);
    return frame(MSG.MsgMessage, w.bytes());
}

// --- the messages we read ------------------------------------------------------------------------------------
function readReject(payload) {
    const r = new Reader(payload);
    const code = r.u16();
    return { code, reason: r.left ? r.str(Math.min(r.left, MessageLen)) : "" };
}
function readAddPlayer(payload) {
    const r = new Reader(payload);
    return {
        id: r.u8(), type: r.u16(), team: r.i16(),
        wins: r.u16(), losses: r.u16(), tks: r.u16(),
        callsign: r.str(CallSignLen), motto: r.str(MottoLen),
    };
}
function readRemovePlayer(payload) { return { id: new Reader(payload).u8() }; }
function readKilled(payload) {
    const r = new Reader(payload);
    return { victim: r.u8(), killer: r.u8(), reason: r.i16(), shotId: r.i16() };
}
function readSuperKill(payload) { return { id: payload.length ? new Reader(payload).u8() : null }; }

export {
    CONNECT_HEADER, PROTO_VERSION, SERVER_VERSION, SERVER_PORT, MAX_PACKET_LEN, MAX_UDP_PACKET_LEN, BAN_REFUSAL,
    CallSignLen, MottoLen, TokenLen, VersionLen, PlayerIdPLen, MessageLen, ENTER_LEN,
    MSG, MSG_NAME, codeTag, frame, parseFrames,
    PlayerType, TeamColor,
    enter, exit, alive, udpLinkRequest, lagPing, wantWorldHash, getWorld, message,
    shotBegin, shotEnd, wantSettings, negotiateFlags, FIRING_INFO_LEN,
    readShotBegin, killed, Reason, readGameSettings,
    readReject, readAddPlayer, readRemovePlayer, readKilled, readSuperKill,
};
