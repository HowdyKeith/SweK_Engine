// WebGLEngine/bz/net/bzfsClient.mjs — connect to a real BZFlag server.
//
//   node bz/net/bzfsClient.mjs --host 127.0.0.1 --port 5154 --callsign brain --observer
//
// The client half of round eleven. It speaks TCP to a `bzfs`, and its state machine is small because the
// handshake is:
//
//     ->  "BZFLAG\r\n\r\n"                                (10 bytes, unframed)
//     <-  "BZFS0221" + one byte playerId                  (9 bytes, unframed; 0xff = server full)
//     ->  MsgEnter                                        (framed, 247 bytes of payload)
//     <-  MsgAccept, or MsgReject, or MsgSuperKill
//     ...and then a stream of framed messages, forever.
//
// After MsgEnter the server may hold off the accept while it checks a global auth token, so the client waits
// rather than assuming. `MsgSuperKill` at any point means go away.
//
// WHAT THIS IS AND IS NOT. The frames, the byte order, the field widths and the fixed-point encoding are
// transcribed from the 2.4 source and asserted byte-for-byte in bz/tools/bz-protocol-selfcheck.mjs.
// bz/tools/bzfs-loopback-probe.mjs runs this client against a server that speaks the same codec, which
// proves the handshake, the framing and the state machine. NOBODY HAS POINTED IT AT A REAL bzfs. There is
// no bzfs in this tree to point it at, and a protocol client that claims interop it has not observed is
// worse than one that says it has not.
//
// v2191 -- THE TOKEN AND THE FAST LANE ARE HERE NOW. `bz/net/bzToken.mjs` fetches a token from the list
// server before `MsgEnter`, because a `bzfs` running `-requireidentify` will not take a registered callsign
// without one. `bz/net/bzUdp.mjs` opens the UDP channel and routes the six hot messages down it, enforcing
// the 68-byte cap that BZFlag itself does not check.
//
// THE WORLD, as of v2193: `MsgGetWorld` downloads it, `bz/net/bzWorldDb.js` verifies its MD5 and inflates it,
// and `bz/net/bzWorldSections.js` walks its ten sections until it reaches a record BZFlag's source has not
// been transcribed for -- and then stops, and names it. A database with no materials parses to its
// obstacles. Almost every real map has a material, so almost every real map stops at section three. Until
// that changes, a pilot that wants to drive on a real server must be handed the same `.bzw` the server is
// running. Guessing a world you cannot see is how you drive into a wall that is not there.

// `net` is imported lazily, only when a TCP transport is actually built, so this module loads in a browser
// where `net` does not exist. v2200 -- a WebSocket transport joins it, for exactly that browser.
let net = null;   // node:net, imported on demand for the TCP transport
import {
    CONNECT_HEADER, SERVER_VERSION, SERVER_PORT, BAN_REFUSAL, MSG, MSG_NAME,
    frame, parseFrames, enter, exit, alive, message, lagPing,
    wantWorldHash, getWorld, shotBegin, shotEnd, killed, readShotBegin, Reason, wantSettings, readGameSettings,
    readReject, readAddPlayer, readRemovePlayer, readKilled, readSuperKill,
    PlayerType, TeamColor,
} from "./bzProtocol.js";
import { unpackPlayerUpdate, packPlayerUpdate, Status } from "./bzPlayerState.js";
import { createUdpLink } from "./bzUdp.js";
// v2202 -- flags: read off the wire, tracked, carried and dropped. What they DO is bz/net/bzFlags.js's
// business, and most of them do nothing here, by name.
import { readFlagUpdate, readGrabFlag, readDropFlag, readCaptureFlag, grabFlag, dropFlag } from "./bzFlags.js";
import { readWorld } from "./bzWorldDb.js";
import { login, describe } from "./bzToken.mjs";

const State = { Connecting: "connecting", Hello: "hello", Entering: "entering", Playing: "playing", Rejected: "rejected", Closed: "closed" };

// A real bzfs answers `MsgReject 6: Callsigns must be at least 2 characters.` Knowing that costs a
// handshake; asserting it costs a line.
const MIN_CALLSIGN = 2;

function createClient(opts = {}) {
    const host = opts.host || "127.0.0.1";
    const port = opts.port || SERVER_PORT;
    const log = opts.log || (() => {});
    const on = opts.on || {};

    let sock = null;
    let state = State.Connecting;
    let buf = new Uint8Array(0);
    let helloBytes = new Uint8Array(0);
    let playerId = null;
    let order = 0;
    let udp = null;
    let token = opts.token || "";
    let tokenNote = token ? "supplied" : "none";
    // v2198 -- A SHOT'S ID IS NOT A COUNTER. `bzfs` reads it as `slot | (salt << 8)` and refuses any slot
    // past `maxShots - 1`, silently. Our first client numbered its shots 1, 2, 3... so every one of them
    // asked for a slot the server did not have, and every one was dropped without a word. Three GPU Brains
    // fired eighty rounds at each other on a real server and not one of them existed.
    //
    // `maxShots` comes from MsgGameSettings, which is the answer to MsgWantSettings. Until it arrives we
    // assume ONE, which is BZFlag's own default and the only safe guess.
    let shotSlot = 0, shotSalt = 0, maxShots = 1;
    const players = new Map();
    // Every flag in the world, by index, and the one we are carrying. You can only carry one, which is why
    // `MsgDropFlag` from a client does not say which.
    const worldFlags = new Map();
    let carried = null;
    // The world, as bytes. Downloaded, kept, and NOT parsed: see the header.
    const world = { bytes: null, chunks: [], want: false, hash: null, opened: null };

    const append = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
    // `sock` is a TRANSPORT, not a node socket: { write(bytes), close() }. Two exist -- a TCP one for node
    // and a WebSocket one for the browser -- and this state machine cannot tell which it holds. That is the
    // whole point: the code that speaks BZFlag was proved against a real bzfs over TCP, and the browser gets
    // the same code, one transport swap away.
    const send = (bytes) => { if (sock && sock.write) sock.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); };

    function fail(reason) {
        state = State.Rejected;
        log("rejected: " + reason);
        if (on.rejected) on.rejected(reason);
        close();
    }

    // The hello is NOT framed, and it is exactly nine bytes. Reading it with the frame parser would read a
    // length of 0x425a ("BZ") and wait forever for seventeen kilobytes that are not coming.
    function readHello() {
        if (helloBytes.length < 9) return false;
        const version = new TextDecoder().decode(helloBytes.subarray(0, 8));
        playerId = helloBytes[8];
        buf = append(buf, helloBytes.subarray(9));
        helloBytes = new Uint8Array(0);

        if (version === BAN_REFUSAL) { fail("banned from this server"); return true; }
        if (version !== SERVER_VERSION) { fail(`version mismatch: server speaks "${version}", we speak "${SERVER_VERSION}"`); return true; }
        if (playerId === 0xff) { fail("server is full"); return true; }

        log(`server ${version}, we are player ${playerId}`);
        state = State.Entering;
        log("token: " + tokenNote);
        send(enter({
            type: opts.type != null ? opts.type : PlayerType.TankPlayer,
            team: opts.team != null ? opts.team : TeamColor.ObserverTeam,
            callsign: opts.callsign || "brain",
            motto: opts.motto || "",
            token,
            version: opts.version || SERVER_VERSION,
        }));
        if (on.hello) on.hello({ version, playerId });
        return true;
    }

    function handle(m) {
        switch (m.code) {
            case MSG.MsgAccept:
                state = State.Playing;
                log("accepted");
                if (opts.udp !== false) openUdp();
                send(wantSettings());
                if (opts.wantWorld) { world.want = true; send(wantWorldHash()); send(getWorld(0)); }
                if (on.accepted) on.accepted({ playerId });
                return;
            case MSG.MsgUDPLinkEstablished:
                if (udp) udp.onEstablished();
                return;
            case MSG.MsgGameSettings: {
                const g = readGameSettings(m.payload);
                maxShots = Math.max(1, g.maxShots);
                log(`settings: world ${g.worldSize}, ${maxShots} shot${maxShots === 1 ? "" : "s"} in the air`);
                if (on.settings) on.settings(g);
                return;
            }
            case MSG.MsgWantWHash: {
                // One character -- 't' for a random map, 'p' for a map file -- then thirty-two of md5.
                world.hash = new TextDecoder().decode(m.payload).replace(/\0.*$/, "");
                log(`world hash: ${world.hash.slice(0, 1)} + ${world.hash.length - 1} hex`);
                return;
            }
            case MSG.MsgGetWorld: {
                // `MsgGetWorld` comes back as: uint32 bytes-remaining, then this chunk. Kept, not parsed.
                if (m.payload.length < 4) return;
                const view = new DataView(m.payload.buffer, m.payload.byteOffset, 4);
                const remaining = view.getUint32(0, false);
                world.chunks.push(m.payload.subarray(4));
                const have = world.chunks.reduce((n, c) => n + c.length, 0);
                if (remaining > 0) { send(getWorld(have)); return; }
                world.bytes = new Uint8Array(have);
                let at = 0;
                for (const c of world.chunks) { world.bytes.set(c, at); at += c.length; }
                world.chunks = [];

                // Verify before understanding. A bad parse of good bytes is a bug; a good parse of bad
                // bytes is a mystery. `MsgWantWHash` gave us the MD5 of every byte of this envelope.
                const r = readWorld(world.bytes, world.hash);
                world.opened = r;
                if (!r.ok) log(`world downloaded (${world.bytes.length} bytes) but NOT usable: ${r.reason}`);
                else log(`world downloaded: ${world.bytes.length} bytes -> ${r.uncompressedSize} inflated`
                    + (world.hash ? `, md5 verified (${r.hash.source})` : ", unverified: no hash")
                    + `; ${r.usable ? `${r.obstacles.length} obstacles read` : r.note}`);
                if (on.world) on.world(world.bytes, r);
                return;
            }
            case MSG.MsgReject: {
                const r = readReject(m.payload);
                fail(`MsgReject ${r.code}: ${r.reason}`);
                return;
            }
            case MSG.MsgSuperKill:
                fail("MsgSuperKill: the server forced a disconnection");
                return;
            case MSG.MsgAddPlayer: {
                const p = readAddPlayer(m.payload);
                players.set(p.id, p);
                log(`+ player ${p.id} "${p.callsign}" team ${p.team}`);
                if (on.addPlayer) on.addPlayer(p);
                return;
            }
            case MSG.MsgRemovePlayer: {
                const p = readRemovePlayer(m.payload);
                players.delete(p.id);
                if (on.removePlayer) on.removePlayer(p);
                return;
            }
            case MSG.MsgPlayerUpdate:
            case MSG.MsgPlayerUpdateSmall: {
                const u = unpackPlayerUpdate(m.code, m.payload);
                if (on.playerUpdate) on.playerUpdate(u);
                return;
            }
            case MSG.MsgFlagUpdate: {
                const flags = readFlagUpdate(m.payload);
                for (const f of flags) worldFlags.set(f.index, f);
                if (on.flagUpdate) on.flagUpdate(flags);
                return;
            }
            case MSG.MsgGrabFlag: {
                const g = readGrabFlag(m.payload);
                worldFlags.set(g.index, { index: g.index, ...g.flag });
                if (g.playerId === playerId) carried = { index: g.index, type: g.flag.type };
                if (on.grabFlag) on.grabFlag(g);
                return;
            }
            case MSG.MsgDropFlag: {
                const d = readDropFlag(m.payload);
                worldFlags.set(d.index, { index: d.index, ...d.flag });
                if (d.playerId === playerId) carried = null;
                if (on.dropFlag) on.dropFlag(d);
                return;
            }
            case MSG.MsgCaptureFlag: {
                const c = readCaptureFlag(m.payload);
                if (c.playerId === playerId) carried = null;
                if (on.captureFlag) on.captureFlag(c);
                return;
            }
            case MSG.MsgKilled: {
                const k = readKilled(m.payload);
                if (on.killed) on.killed(k);
                return;
            }
            case MSG.MsgShotBegin: {
                // Somebody else fired. `bzfs` will never tell us it hit: we have to work that out and say so.
                const sh = readShotBegin(m.payload);
                if (sh.player !== playerId && on.shotBegin) on.shotBegin(sh);
                return;
            }
            case MSG.MsgLagPing:
                send(m.payload.length ? lagPing(new DataView(m.payload.buffer, m.payload.byteOffset).getUint16(0, false)) : lagPing(0));
                return;
            default:
                if (on.message) on.message(m);
                return;
        }
    }

    function onData(bytes) {
        if (state === State.Hello) {
            helloBytes = append(helloBytes, bytes);
            if (!readHello()) return;
        } else {
            buf = append(buf, bytes);
        }
        if (state === State.Rejected || state === State.Closed) return;
        let out;
        try { out = parseFrames(buf); } catch (e) { fail("bad frame: " + e.message); return; }
        buf = out.rest;
        for (const m of out.msgs) {
            if (state === State.Rejected || state === State.Closed) return;
            handle(m);
        }
    }

    // A transport is opened here and hands three things back through callbacks: bytes in (`onBytes`), the
    // moment it is ready (`onOpen`), and the moment it is gone (`onClosed`). Everything above this line is
    // transport-agnostic.
    async function tcpTransport(onBytes, onOpen, onClosed, onErr) {
        // Lazy AND via dynamic import, so this ES module loads in a browser (where `net` does not exist)
        // without `require`, which would make Node ambiguous about the module's format.
        if (!net) net = await import("node:net");
        const sock2 = net.createConnection({ host, port }, onOpen);
        sock2.on("data", (chunk) => onBytes(new Uint8Array(chunk)));
        sock2.on("error", onErr);
        sock2.on("close", onClosed);
        return { write: (bytes) => { if (!sock2.destroyed) sock2.write(Buffer.from(bytes)); }, close: () => { try { sock2.destroy(); } catch (e) {} } };
    }

    // The browser's transport: a WebSocket to the proxy, which opens the TCP socket to bzfs on our behalf.
    // A binary WebSocket message IS the BZFlag stream; the proxy adds nothing, so this reads nothing extra.
    function wsTransport(onBytes, onOpen, onClosed, onErr) {
        const url = opts.proxyUrl.replace(/\/+$/, "") + "/bz/ws?host=" + encodeURIComponent(host) + "&port=" + port;
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        ws.onopen = onOpen;
        ws.onmessage = (ev) => onBytes(new Uint8Array(ev.data));
        ws.onerror = () => onErr(new Error("websocket error"));
        ws.onclose = onClosed;
        return { write: (bytes) => { if (ws.readyState === 1) ws.send(bytes); }, close: () => { try { ws.close(); } catch (e) {} } };
    }

    function connect() {
        const cs = String(opts.callsign || "brain");
        if (cs.length < MIN_CALLSIGN) return Promise.reject(new Error(`a callsign must be at least ${MIN_CALLSIGN} characters; a real bzfs refuses a shorter one`));
        const makeTransport = opts.proxyUrl ? wsTransport : tcpTransport;
        return new Promise((resolve, reject) => {
            Promise.resolve(makeTransport(
                (bytes) => onData(bytes),
                () => { state = State.Hello; send(new TextEncoder().encode(CONNECT_HEADER)); resolve(); },
                () => { if (state !== State.Rejected) state = State.Closed; if (on.closed) on.closed(); },
                (e) => { if (state !== State.Closed) { log("transport error: " + (e && e.message || e)); reject(e); } },
            )).then((t) => { sock = t; }).catch(reject);
        });
    }

    function close() {
        if (udp) { try { udp.close(); } catch (e) {} udp = null; }
        if (sock) { try { send(exit()); } catch (e) {} try { sock.close(); } catch (e) {} sock = null; }
        state = State.Closed;
    }

    // The fast lane. `MsgUDPLinkRequest` goes out at once; the link comes up when a datagram comes back, or
    // when the server says `MsgUDPLinkEstablished` -- whichever happens first.
    function openUdp() {
        if (udp) return;
        udp = createUdpLink({
            host, port, playerId, sendTcp: send, log,
            onMessage: (m) => handle(m),
        });
        udp.open().then((p) => log(`UDP downlink on local port ${p}`)).catch((e) => { log("no UDP: " + e.message); udp = null; });
    }

    // Everything that must arrive SOON goes through here, and everything else through `send`.
    function fast(code, payload) {
        if (udp) return udp.send(code, payload);
        send(frame(code, payload));
        return "tcp";
    }

    // Send where we are. `order` counts up forever: a server that sees it go backwards drops the packet.
    function sendState(s) {
        if (state !== State.Playing || playerId == null) return false;
        // `packPlayerUpdate` hands back the CODE as well as the bytes, because the values chose it: a
        // position of 700 metres travels as floats and everything smaller as int16s.
        const u = packPlayerUpdate(s.timeStamp != null ? s.timeStamp : Date.now() / 1000, playerId, { ...s, order: ++order });
        return fast(u.code, u.payload);
    }

    // A shot. `shotId` is the client's own counter; the server pairs it with the player id.
    function fire({ pos, vel, timeSent = Date.now() / 1000, team = 0, lifetime = 3.5, dt = 0 }) {
        if (state !== State.Playing || playerId == null) return false;
        // The low byte is the slot, the high byte a salt. Cycle the slots the server admits to having, and
        // bump the salt each time round, exactly as a BZFlag client does.
        const slot = shotSlot;
        shotSlot = (shotSlot + 1) % maxShots;
        if (shotSlot === 0) shotSalt = (shotSalt + 1) & 0xff;
        const id = (slot & 0xff) | ((shotSalt & 0xff) << 8);
        const f = shotBegin({ timeSent, player: playerId, shotId: id, pos, vel, dt, team, lifetime });
        // `shotBegin` already framed it, so hand the fast lane the pieces it wants.
        if (udp) udp.send(MSG.MsgShotBegin, f.subarray(4));
        else send(f);
        return id;
    }

    // Fetch a token, if a password was given. An unregistered callsign needs none, and an empty one is
    // correct rather than lazy: a server that requires identification will refuse, and say so.
    async function authenticate() {
        if (!opts.password) return { ok: false, token: "", reason: "no password: entering unregistered" };
        const r = await login({ callsign: opts.callsign, password: opts.password, listServer: opts.listServer });
        if (r.ok) { token = r.token; tokenNote = `${r.token.length} chars from the list server`; }
        else tokenNote = r.reason;
        log(describe(r, opts.callsign));
        return r;
    }

    // Tell the server we died. THE VICTIM REPORTS ITS OWN DEATH; bzfs does no hit detection. This is the
    // half of the protocol a client that only shoots never discovers.
    function die({ killer, shotId = -1, reason = Reason.GotShot, flag = "" }) {
        if (state !== State.Playing) return false;
        send(killed({ killer, shotId, reason, flag }));
        return true;
    }

    return {
        connect, close, sendState, fire, die, authenticate,
        say: (text, to = 0xff) => send(message(to, text)),
        // You ASK for a flag by index. The server answers everybody with the whole flag, and only then are
        // you carrying it -- so nothing here sets `carried`.
        grab: (index) => { if (state === State.Playing) send(grabFlag(index)); },
        // And you drop it by saying where you were standing. Not which flag: you can only have one.
        drop: (pos) => { if (state === State.Playing) send(dropFlag(pos)); },
        get flags() { return new Map(worldFlags); },
        get carried() { return carried; },
        spawn: () => send(alive()),
        get state() { return state; },
        get playerId() { return playerId; },
        get players() { return new Map(players); },
        get udp() { return udp ? { up: udp.up, localPort: udp.localPort, stats: udp.stats() } : null; },
        get world() { return world.bytes; },
        get worldInfo() { return world.opened; },
        get worldHash() { return world.hash; },
        get token() { return tokenNote; },
        get maxShots() { return maxShots; },
        Status, MSG_NAME,
    };
}

// --- run it -------------------------------------------------------------------------------------------
// SAME BUG AS bandit.mjs:208, FOUND BY THE AUDIT RATHER THAN BY A CRASH -- because nobody has opened the
// page that imports this yet. IT WAS WAITING.
if (typeof process !== "undefined" && process.versions != null && process.versions.node != null) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
    const c = createClient({
        host: arg("host", "127.0.0.1"),
        port: parseInt(arg("port", String(SERVER_PORT)), 10),
        callsign: arg("callsign", "brain"),
        team: process.argv.includes("--observer") ? TeamColor.ObserverTeam : TeamColor.AutomaticTeam,
        // v2195 -- AN OBSERVER IS A TANK PLAYER ON THE OBSERVER TEAM. `JAFOPlayer` is bzadmin's type, and a
        // real bzfs answers `MsgReject 5: This game is full` to it, whatever the slots. Found by pointing
        // this client at a bzfs built from BZFlag's own source; no amount of reading would have shown it.
        type: PlayerType.TankPlayer,
        log: (...a) => console.log("[bzfs]", ...a),
        on: {
            accepted: () => console.log("[bzfs] in. listening."),
            addPlayer: (p) => {},
            playerUpdate: () => {},
            rejected: (r) => process.exitCode = 1,
        },
    });
    process.on("SIGINT", () => { c.close(); process.exit(0); });
    c.connect().catch((e) => { console.error("[bzfs] could not connect:", e.message); process.exit(1); });
} }

export { createClient, State, MIN_CALLSIGN };
