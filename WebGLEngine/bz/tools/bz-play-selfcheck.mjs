// bz/tools/bz-play-selfcheck.mjs — the token, the fast lane, and the shot.
//
//   node bz/tools/bz-play-selfcheck.mjs
//
// The two things named in v2189 as the likeliest reasons a real server would refuse us: the auth token, and
// UDP. Both are here now, and both are tested against something real -- a local HTTP server standing in for
// the list server, and a real UDP socket standing in for `bzfs`.
//
// Neither has spoken to my.bzflag.org, and neither has spoken to a public game. Saying so remains the point.

import { createServer } from "http";
import dgram from "dgram";
import { setTimeout as sleep } from "timers/promises";

import { login, parseListServerReply, describe } from "../net/bzToken.mjs";
import { createUdpLink, isFastCode, fitsInDatagram, FAST_CODES, MAX_UDP_PACKET_LEN } from "../net/bzUdp.js";
import { MSG, frame, parseFrames, shotBegin, shotEnd, FIRING_INFO_LEN, codeTag } from "../net/bzProtocol.js";
import { packPlayerUpdate, Status } from "../net/bzPlayerState.js";
import { Reader } from "../net/bzPack.js";

let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));
const close = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;

// --- 1. the list server's reply ------------------------------------------------------------------
{
    const p = parseListServerReply("MSG: hello\r\nTOKEN: 0123456789abcdef\r\n\r\n# a comment\n");
    ok("a TOKEN line yields a token", p.token === "0123456789abcdef");
    ok("...and the other lines are kept but not confused for one", p.msg === "hello" && p.lines.length === 3);
    ok("a NOTOK line yields a refusal", parseListServerReply("NOTOK: bad password").notok === "bad password");
    ok("an ERROR line yields an error", parseListServerReply("ERROR: down for maintenance").error === "down for maintenance");
    ok("keys are case-insensitive", parseListServerReply("token: abc").token === "abc");
    ok("a line with no colon is neither", parseListServerReply("just some words").token === null);
    ok("blank input says nothing", parseListServerReply("").lines.length === 0);
    ok("the first TOKEN wins", parseListServerReply("TOKEN: a\nTOKEN: b").token === "a");
}

// --- 2. login, against a list server that is not the real one ---------------------------------------
{
    let lastQuery = null;
    const srv = createServer((req, res) => {
        lastQuery = new URL(req.url, "http://x").searchParams;
        const cs = lastQuery.get("callsign"), pw = lastQuery.get("password");
        res.writeHead(200, { "Content-Type": "text/plain" });
        if (cs === "brain" && pw === "hunter2") res.end("MSG: welcome\nTOKEN: deadbeefcafe\n");
        else if (cs === "brain") res.end("NOTOK: bad password\n");
        else res.end("ERROR: no such callsign\n");
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const listServer = `http://127.0.0.1:${srv.address().port}/db/`;

    const good = await login({ callsign: "brain", password: "hunter2", listServer });
    ok("a good password yields a token", good.ok && good.token === "deadbeefcafe");
    ok("...and the request asked for a LOGIN", lastQuery.get("action") === "LOGIN");
    ok("...with the callsign", lastQuery.get("callsign") === "brain");

    const bad = await login({ callsign: "brain", password: "wrong", listServer });
    ok("a bad password is a refusal, not a throw", !bad.ok && /NOTOK: bad password/.test(bad.reason));
    const nobody = await login({ callsign: "nobody", password: "x", listServer });
    ok("an unknown callsign is an error, reported", !nobody.ok && /no such callsign/.test(nobody.reason));

    ok("no password, no token, and it says why", (await login({ callsign: "brain" })).reason === "no password: an unregistered callsign enters with an empty token");
    ok("no callsign either", (await login({})).reason === "no callsign: an unregistered player needs no token");
    ok("an unreachable list server is a reason, not a crash",
        (await login({ callsign: "a", password: "b", listServer: "http://127.0.0.1:1/db/" })).reason.startsWith("list server unreachable"));
    ok("a list server that answers 500 is a reason too", await (async () => {
        const s2 = createServer((q, r) => { r.writeHead(500); r.end(); });
        await new Promise((r) => s2.listen(0, "127.0.0.1", r));
        const res = await login({ callsign: "a", password: "b", listServer: `http://127.0.0.1:${s2.address().port}/` });
        await new Promise((r) => s2.close(r));
        return /HTTP 500/.test(res.reason);
    })());

    // A password must not reach a log by accident, and the only printable summary never sees one.
    ok("describe() prints the token's LENGTH and not the token", /12 chars, not shown/.test(describe(good, "brain")));
    ok("...and never the password", !/hunter2/.test(describe(good, "brain")) && !/hunter2/.test(describe(bad, "brain")));
    ok("...and says why there is none", /NOTOK/.test(describe(bad, "brain")));

    await new Promise((r) => srv.close(r));
}

// --- 3. which messages take the fast lane ------------------------------------------------------------
{
    ok("the fast lane carries exactly the seven codes ServerLink lists", FAST_CODES.size === 7);
    for (const n of ["MsgShotBegin", "MsgShotEnd", "MsgPlayerUpdate", "MsgPlayerUpdateSmall", "MsgGMUpdate", "MsgUDPLinkRequest", "MsgUDPLinkEstablished"])
        ok(`  ${n} ("${codeTag(MSG[n])}") is fast`, isFastCode(MSG[n]));
    for (const n of ["MsgEnter", "MsgAlive", "MsgExit", "MsgMessage", "MsgKilled", "MsgAccept"])
        ok(`  ${n} is not`, !isFastCode(MSG[n]));

    // MaxUDPPacketLen is 68 bytes, header and all, and it is not advisory.
    ok("MaxUDPPacketLen is 68", MAX_UDP_PACKET_LEN === 68);
    const small = packPlayerUpdate(0, 1, { order: 1, status: Status.Alive, pos: [1, 2, 3], velocity: [0, 0, 0], azimuth: 0, angVel: 0 });
    ok("a small player update is 31 bytes framed, and fits", fitsInDatagram(frame(small.code, small.payload)) && frame(small.code, small.payload).length === 31);
    const big = packPlayerUpdate(0, 1, { order: 1, status: Status.Alive, pos: [700, 0, 0], velocity: [0, 0, 0], azimuth: 0, angVel: 0 });
    ok("...and a large one is 47, and still fits", frame(big.code, big.payload).length === 47 && fitsInDatagram(frame(big.code, big.payload)));
    ok("a shot is 47 bytes framed, and fits", frame(MSG.MsgShotBegin, shotBegin({ player: 1, shotId: 1, pos: [0, 0, 0], vel: [0, 0, 0] }).subarray(4)).length === 47);
    ok("MsgEnter is 251 and does not", !fitsInDatagram(new Uint8Array(251)));
}

// --- 4. the shot, byte for byte -------------------------------------------------------------------------
{
    const f = shotBegin({ timeSent: 1.0, player: 3, shotId: 7, pos: [1, 2, 3], vel: [10, 0, 0], dt: 0, team: 1, flag: "GM", lifetime: 3.5 });
    ok("MsgShotBegin frames a FiringInfo of 43 bytes", f.length === 4 + FIRING_INFO_LEN && FIRING_INFO_LEN === 43);
    ok('...under the code "sb"', codeTag((f[2] << 8) | f[3]) === "sb");

    const r = new Reader(f, 4);
    ok("timeSent first", close(r.f32(), 1.0));
    ok("then the player and the shot id", r.u8() === 3 && r.u16() === 7);
    ok("then the position and the velocity", r.vec().join() === "1,2,3" && r.vec().join() === "10,0,0");
    ok("then dt and the team", close(r.f32(), 0) && r.i16() === 1);
    ok("then two bytes of the flag's abbreviation", r.u8() === 71 && r.u8() === 77);   // "GM"
    ok("and the lifetime", close(r.f32(), 3.5));
    ok("no flag is two zero bytes, not two spaces", (() => {
        const g = shotBegin({ player: 0, shotId: 0, pos: [0, 0, 0], vel: [0, 0, 0] });
        return g[4 + 37] === 0 && g[4 + 38] === 0;
    })());
    ok("MsgShotEnd is a player, a shot and a reason", shotEnd({ player: 1, shotId: 2, reason: 0 }).length === 4 + 5);
}

// --- 5. the dance, over a real UDP socket -----------------------------------------------------------------
{
    // A server that echoes MsgUDPLinkRequest back, which is what bzfs does.
    const srv = dgram.createSocket("udp4");
    const seen = [];
    srv.on("message", (msg, rinfo) => {
        const { msgs } = parseFrames(new Uint8Array(msg));
        for (const m of msgs) seen.push(m.code);
        if (msgs.some((m) => m.code === MSG.MsgUDPLinkRequest)) srv.send(Buffer.from(frame(MSG.MsgUDPLinkRequest, new Uint8Array([1]))), rinfo.port, rinfo.address);
    });
    await new Promise((r) => srv.bind(0, "127.0.0.1", r));
    const port = srv.address().port;

    const tcp = [];
    const link = createUdpLink({ host: "127.0.0.1", port, playerId: 5, sendTcp: (b) => tcp.push(b), log: () => {} });
    const localPort = await link.open();
    ok("the client binds a local UDP port", localPort > 0 && link.localPort === localPort);
    ok("...and the link is not up until a datagram comes back", link.up === false);

    for (let i = 0; i < 40 && !link.up; i++) await sleep(25);
    ok("a datagram from the server brings the link up -- `confirmIncomingUDP`, which the source calls a hack", link.up);
    ok("...and the client replies MsgUDPLinkEstablished, on TCP", tcp.length === 1 && parseFrames(tcp[0]).msgs[0].code === MSG.MsgUDPLinkEstablished);
    ok("the first thing the server saw was MsgUDPLinkRequest", seen[0] === MSG.MsgUDPLinkRequest);

    // Routing.
    const before = seen.length;
    ok("a player update now goes by UDP", link.send(MSG.MsgPlayerUpdateSmall, new Uint8Array(22)) === "udp");
    ok("a shot too", link.send(MSG.MsgShotBegin, new Uint8Array(43)) === "udp");
    ok("MsgAlive does not: it must arrive, not arrive soon", link.send(MSG.MsgAlive, new Uint8Array(0)) === "tcp");
    ok("MsgEnter does not", link.send(MSG.MsgEnter, new Uint8Array(247)) === "tcp");

    // THE CAP. BZFlag does not check. A 69-byte datagram is a message the server never sees.
    ok("a fast message that does not fit a datagram goes down the TCP stream instead",
        link.send(MSG.MsgPlayerUpdate, new Uint8Array(70)) === "tcp-oversize");
    ok("...and it is counted, so nobody wonders where the shot went", link.stats().tooBig === 1);
    ok("...which is not what BZFlag does, and is why it is written down", true);

    await sleep(200);
    ok("the server received both fast messages", seen.length >= before + 2);
    ok("the stats add up", link.stats().sentOverUdp === 2 && link.stats().sentOverTcp >= 3);

    // `enableOutboundUDP`: the server tells us instead. Whichever happens first wins.
    const link2 = createUdpLink({ host: "127.0.0.1", port: 1, playerId: 6, sendTcp: () => {}, log: () => {} });
    ok("a link that has heard nothing is down", link2.up === false);
    link2.onEstablished();
    ok("...and MsgUDPLinkEstablished from the server brings it up too", link2.up === true);
    link2.close();

    link.close();
    ok("closing takes the link down", link.up === false);
    await new Promise((r) => srv.close(r));
}

console.log("");
console.log("  (a local HTTP server stood in for my.bzflag.org and a local UDP socket stood in for bzfs.");
console.log("   NEITHER HAS SPOKEN TO A PUBLIC SERVER. The token flow and the UDP dance are right; whether");
console.log("   a real bzfs agrees is a question only a real bzfs can answer.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
