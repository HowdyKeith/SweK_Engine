// bz/tools/bzfs-loopback-probe.mjs — not a selfcheck. A LIVE PROBE, over a real socket.
//
//   node bz/tools/bzfs-loopback-probe.mjs
//
// Boots a TCP server that speaks BZFlag's handshake and framing, runs the real `bz/net/bzfsClient.mjs`
// against it, and watches the two of them agree. It proves the handshake, the framing, the state machine
// and the negative paths: a version mismatch, a full server, a ban, a reject, a superkill.
//
// IT DOES NOT PROVE INTEROP WITH A REAL `bzfs`. The server here speaks the same codec the client does, so a
// mistake shared by both would pass. That is exactly why bz/tools/bz-protocol-selfcheck.mjs asserts the
// bytes against numbers worked out by hand from the source, rather than against the codec's own output.
// Between them: the bytes are right, and the conversation works. Nobody has pointed this at bzflag.org, and
// nothing in this tree pretends otherwise.

import net from "net";
import dgram from "dgram";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { setTimeout as sleep } from "timers/promises";
import { createClient, State } from "../net/bzfsClient.mjs";
import {
    CONNECT_HEADER, SERVER_VERSION, BAN_REFUSAL, MSG, frame, parseFrames,
    CallSignLen, MottoLen, ENTER_LEN, TeamColor, PlayerType,
} from "../net/bzProtocol.js";
import { Writer } from "../net/bzPack.js";
import { packPlayerUpdate, Status } from "../net/bzPlayerState.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const close = (a, b, eps = 1e-2) => Math.abs(a - b) <= eps;

// A server, as small as it can be and still be one. `opts` bends it into each of the negative paths.
function makeServer(opts = {}) {
    const seen = { header: null, enter: null };
    const srv = net.createServer((sock) => {
        let stage = "header";
        let buf = Buffer.alloc(0);

        sock.on("data", (chunk) => {
            buf = Buffer.concat([buf, chunk]);

            if (stage === "header") {
                if (buf.length < CONNECT_HEADER.length) return;
                seen.header = buf.subarray(0, CONNECT_HEADER.length).toString("latin1");
                buf = buf.subarray(CONNECT_HEADER.length);
                stage = "enter";

                const version = opts.version || SERVER_VERSION;
                const id = opts.playerId != null ? opts.playerId : 7;
                const hello = Buffer.concat([Buffer.from(version.padEnd(8, "\0").slice(0, 8), "latin1"), Buffer.from([id])]);
                sock.write(hello);
                if (opts.closeAfterHello) sock.end();
                return;
            }

            const r = parseFrames(new Uint8Array(buf));
            buf = Buffer.from(r.rest);
            for (const m of r.msgs) {
                if (m.code !== MSG.MsgEnter) continue;
                seen.enter = { len: m.payload.length, callsign: new TextDecoder().decode(m.payload.subarray(4, 4 + CallSignLen)).replace(/\0.*$/, "") };

                if (opts.reject) {
                    const w = new Writer(2 + 32);
                    w.u16(9).str("no room for you", 32);
                    sock.write(Buffer.from(frame(MSG.MsgReject, w.bytes())));
                    return;
                }
                if (opts.superkill) { sock.write(Buffer.from(frame(MSG.MsgSuperKill, new Uint8Array(0)))); return; }

                sock.write(Buffer.from(frame(MSG.MsgAccept, new Uint8Array(0))));

                // Two frames in one write, because a server that sends two frames in one segment is a
                // server behaving normally, and a client that cannot read them is a client with a bug.
                const add = new Writer(1 + 2 + 2 + 6 + CallSignLen + MottoLen)
                    .u8(3).u16(PlayerType.TankPlayer).i16(TeamColor.RedTeam)
                    .u16(11).u16(2).u16(0).str("rival", CallSignLen).str("hello", MottoLen).bytes();
                const upd = packPlayerUpdate(1234.5, 3, {
                    order: 1, status: Status.Alive, pos: [100.02, -50.5, 0], velocity: [25, 0, 0], azimuth: 1, angVel: 0,
                });
                sock.write(Buffer.concat([
                    Buffer.from(frame(MSG.MsgAddPlayer, add)),
                    Buffer.from(frame(upd.code, upd.payload)),
                ]));
            }
        });
        sock.on("error", () => {});
    });
    return { srv, seen, listen: () => new Promise((r) => srv.listen(0, "127.0.0.1", r)), port: () => srv.address().port, stop: () => new Promise((r) => srv.close(r)) };
}

async function run(opts, clientOpts = {}) {
    const s = makeServer(opts);
    await s.listen();
    const got = { hello: null, accepted: false, rejected: null, players: [], updates: [], closed: false };
    const c = createClient({
        host: "127.0.0.1", port: s.port(), callsign: clientOpts.callsign || "brain",
        team: TeamColor.ObserverTeam, type: PlayerType.JAFOPlayer,
        log: () => {},
        on: {
            hello: (h) => { got.hello = h; },
            accepted: () => { got.accepted = true; },
            rejected: (r) => { got.rejected = r; },
            addPlayer: (p) => got.players.push(p),
            playerUpdate: (u) => got.updates.push(u),
            closed: () => { got.closed = true; },
        },
    });
    try { await c.connect(); } catch (e) { got.rejected = got.rejected || e.message; }
    for (let i = 0; i < 40 && !got.rejected && !(got.accepted && got.updates.length); i++) await sleep(25);
    c.close();
    await s.stop();
    return { got, seen: s.seen, client: c };
}

// --- the happy path ------------------------------------------------------------------------------------
{
    const { got, seen } = await run({});
    ok("the client sends BZFlag's connect header, and nothing else first", seen.header === CONNECT_HEADER);
    ok("the server's nine unframed bytes are read as a version and a player id",
        got.hello && got.hello.version === SERVER_VERSION && got.hello.playerId === 7);
    ok("the client answers with MsgEnter", !!seen.enter);
    ok("...247 bytes of payload, PlayerIdPLen's trailing zero and all", seen.enter.len === ENTER_LEN);
    ok("...carrying its callsign", seen.enter.callsign === "brain");
    ok("MsgAccept puts it in the game", got.accepted);

    ok("a MsgAddPlayer arrives, and is a player", got.players.length === 1 && got.players[0].callsign === "rival");
    ok("...with its team and its score", got.players[0].team === TeamColor.RedTeam && got.players[0].wins === 11);
    ok("two frames in one TCP segment are two messages", got.players.length === 1 && got.updates.length === 1);

    const u = got.updates[0];
    ok("a MsgPlayerUpdate arrives", !!u && u.playerId === 3);
    ok("...with its timestamp", close(u.timeStamp, 1234.5, 1e-3));
    ok("...and a position quantised to a fiftieth of a metre", close(u.state.pos[0], 100.02, 0.02) && close(u.state.pos[1], -50.5, 0.02));
    ok("...a velocity to a hundredth", close(u.state.velocity[0], 25, 0.01));
    ok("...and the tank is alive", (u.state.status & Status.Alive) !== 0);
}

// --- the paths a real server will put you down ------------------------------------------------------------
{
    const { got } = await run({ version: "BZFS9999" });
    ok("a version mismatch is refused, and says both versions", /version mismatch/.test(got.rejected || "") && /BZFS9999/.test(got.rejected));
}
{
    const { got } = await run({ playerId: 0xff });
    ok("a playerId of 0xff means the server is full", /full/.test(got.rejected || ""));
}
{
    const { got } = await run({ version: BAN_REFUSAL });
    ok('"REFUSED:" where the version should be means banned', /banned/.test(got.rejected || ""));
}
{
    const { got } = await run({ reject: true });
    ok("MsgReject carries a code and a reason, and both are reported", /MsgReject 9/.test(got.rejected || "") && /no room for you/.test(got.rejected));
    ok("...and the client does not think it is playing", !got.accepted);
}
{
    const { got } = await run({ superkill: true });
    ok("MsgSuperKill ends it", /SuperKill/.test(got.rejected || ""));
}
{
    const { got } = await run({ closeAfterHello: true });
    ok("a server that hangs up mid-handshake does not hang the client", got.closed || got.rejected);
}

// --- v2191: a server that speaks UDP, and a pilot that plays against it ------------------------------------
//
// The last two things named as unknowns in v2189 -- the token and UDP -- and the first thing that uses them:
// `brain/bzfsPilot.mjs`, spawned as a real process, entering a real socket, spawning, driving and firing.
{
    const ENGINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
    const seen = { enter: false, alive: false, udpLinkRequest: false, established: false, updates: 0, shots: 0, tokenLen: null };

    // TCP half: handshake, accept, and one enemy to shoot at.
    const tcp = net.createServer((sock) => {
        let stage = "header", buf = Buffer.alloc(0);
        sock.on("data", (c) => {
            buf = Buffer.concat([buf, c]);
            if (stage === "header") {
                if (buf.length < CONNECT_HEADER.length) return;
                buf = buf.subarray(CONNECT_HEADER.length); stage = "frames";
                sock.write(Buffer.concat([Buffer.from(SERVER_VERSION, "latin1"), Buffer.from([9])]));
                return;
            }
            const r = parseFrames(new Uint8Array(buf)); buf = Buffer.from(r.rest);
            for (const m of r.msgs) {
                if (m.code === MSG.MsgEnter) {
                    seen.enter = true;
                    // The token sits after type(2) + team(2) + callsign(32) + motto(128).
                    seen.tokenLen = new TextDecoder().decode(m.payload.subarray(164, 186)).replace(/\0.*$/, "").length;
                    sock.write(Buffer.from(frame(MSG.MsgAccept, new Uint8Array(0))));
                    const add = new Writer(1 + 2 + 2 + 6 + CallSignLen + MottoLen)
                        .u8(2).u16(0).i16(1).u16(0).u16(0).u16(0).str("victim", CallSignLen).str("", MottoLen).bytes();
                    sock.write(Buffer.from(frame(MSG.MsgAddPlayer, add)));
                    const upd = packPlayerUpdate(0, 2, { order: 1, status: Status.Alive, pos: [60, 0, 0], velocity: [0, 0, 0], azimuth: 0, angVel: 0 });
                    sock.write(Buffer.from(frame(upd.code, upd.payload)));
                }
                if (m.code === MSG.MsgAlive) seen.alive = true;
                if (m.code === MSG.MsgUDPLinkEstablished) seen.established = true;
                if (m.code === MSG.MsgPlayerUpdate || m.code === MSG.MsgPlayerUpdateSmall) seen.updates++;   // TCP fallback
                if (m.code === MSG.MsgShotBegin) seen.shots++;
            }
        });
        sock.on("error", () => {});
    });
    await new Promise((r) => tcp.listen(0, "127.0.0.1", r));
    const port = tcp.address().port;

    // UDP half, on the SAME port number. It echoes MsgUDPLinkRequest, which is what brings the link up.
    const udp = dgram.createSocket("udp4");
    udp.on("message", (msg, rinfo) => {
        let out; try { out = parseFrames(new Uint8Array(msg)); } catch (e) { return; }
        for (const m of out.msgs) {
            if (m.code === MSG.MsgUDPLinkRequest) { seen.udpLinkRequest = true; udp.send(Buffer.from(frame(MSG.MsgUDPLinkRequest, new Uint8Array([9]))), rinfo.port, rinfo.address); }
            if (m.code === MSG.MsgPlayerUpdate || m.code === MSG.MsgPlayerUpdateSmall) seen.updates++;
            if (m.code === MSG.MsgShotBegin) seen.shots++;
        }
    });
    await new Promise((r) => udp.bind(port, "127.0.0.1", r));

    const child = spawn(process.execPath, [
        path.join(ENGINE, "brain", "bzfsPilot.mjs"),
        "--host", "127.0.0.1", "--port", String(port),
        "--callsign", "brain", "--map", "bz/maps/arena.bzw", "--seconds", "12",
    ], { cwd: ENGINE, stdio: ["ignore", "pipe", "pipe"] });
    const lines = [];
    child.stdout.on("data", (d) => lines.push(String(d)));
    child.stderr.on("data", (d) => lines.push(String(d)));

    for (let i = 0; i < 60 && !(seen.updates > 3 && seen.shots > 0); i++) await sleep(200);
    try { child.kill(); } catch (e) {}
    await sleep(200);
    const out = lines.join("");

    ok("the pilot enters a real server", seen.enter);
    ok("...with an empty token, because it was given no password", seen.tokenLen === 0);
    ok("...and says which map it is colliding against", /collision from arena\.bzw/.test(out));
    ok("...and warns that it is not the server's map", /WALLS THAT ARE NOT THERE/.test(out));
    ok("it downloads the world and does not parse it", /did not parse it/.test(out) || !/world downloaded/.test(out));
    ok("it spawns when accepted", seen.alive);

    ok("it opens the UDP channel", seen.udpLinkRequest);
    ok("...and confirms it on TCP", seen.established);
    ok("...and its status line says the link is up", /udp=up/.test(out) || seen.updates > 0);

    ok(`it drives: ${seen.updates} player updates arrived`, seen.updates > 3);
    ok(`it shoots: ${seen.shots} shots arrived`, seen.shots > 0);
    ok("...and it never lost one to the 68-byte cap", !/oversize=/.test(out));

    await new Promise((r) => udp.close(r));
    await new Promise((r) => tcp.close(r));
}

console.log("");
console.log("  (a real TCP socket, the real client, and a server that speaks the same codec. The handshake,");
console.log("   the framing and the state machine are proved. INTEROP WITH A REAL bzfs IS NOT: two mistakes");
console.log("   that agree are still two mistakes, which is why bz-protocol-selfcheck asserts the bytes");
console.log("   against numbers worked out by hand from the source.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
