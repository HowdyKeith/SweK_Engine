// WebGLEngine/bz/net/bzUdp.mjs — the fast lane.
//
// BZFlag runs two channels to the same host and the same port number: a TCP stream for everything that must
// arrive, and a UDP datagram channel for the six messages that must arrive SOON. Positions, shots and
// gun-guided updates go down the fast lane; everything else, including the fact that you exist, goes down
// the slow one.
//
// The dance, from src/bzflag/ServerLink.cxx and src/bzfs/bzfs.cxx:
//
//   1. the client opens a UDP socket, binds a local port, and sends `MsgUDPLinkRequest` -- payload: its own
//      one-byte player id -- to the server's address. That message ALWAYS goes by UDP, even before the link
//      is up, because it IS the link coming up.
//   2. the server echoes `MsgUDPLinkRequest` back over UDP.
//   3. the client, on receiving ANY datagram from the server, calls `confirmIncomingUDP()`: it sets
//      `ulinkup` and replies `MsgUDPLinkEstablished`. The comment in the source calls this "really a hack",
//      and it is: it does not wait to be told the link is up, it infers it from a packet arriving.
//   4. `enableOutboundUDP()` fires when `MsgUDPLinkEstablished` arrives from the server. Either path sets
//      `ulinkup`, and whichever happens first wins.
//
// THE CAP. `MaxUDPPacketLen` is 68 bytes -- header and all -- and it is not advisory. A `MsgPlayerUpdate`
// with floats is 4+4+1+38 = 47 bytes and fits; the small one is 31. A `MsgShotBegin` is 4+43 = 47. But
// nothing in the client checks, so a message that grew past 68 would be sent as an oversized datagram and
// silently dropped by a server that reads 68 bytes. This module CHECKS, and sends anything too large down
// the TCP stream instead. That is not what BZFlag does. It is what BZFlag would do if it had ever been
// bitten, and a client that quietly loses its own shots is worse than a laggier one.
//
// The six hot codes are exactly the six in `ServerLink::send`. Anything else on the fast lane is a bug in
// this file, and `bz-udp-selfcheck.mjs` says so.

"use strict";

// dgram is node-only (a browser never opens a raw UDP socket). Imported lazily behind a process guard so this
// module -- reached from bzflag.html via bzfsClient -- LOADS in a browser instead of dying on a bare "dgram"
// specifier. v2766: the render QA caught this; browserNodeGuard now catches bare builtins too, not just node:.
let dgram = null;
if (typeof process !== "undefined" && process.versions != null && process.versions.node != null) {
    dgram = (await import("dgram")).default;
}
import { MSG, MAX_UDP_PACKET_LEN, frame, parseFrames } from "./bzProtocol.js";
import { Writer } from "./bzPack.js";

// ServerLink::send. Note MsgUDPLinkRequest is here AND is special-cased to always go by UDP.
const FAST_CODES = new Set([
    MSG.MsgShotBegin,
    MSG.MsgShotEnd,
    MSG.MsgPlayerUpdate,
    MSG.MsgPlayerUpdateSmall,
    MSG.MsgGMUpdate,
    MSG.MsgUDPLinkRequest,
    MSG.MsgUDPLinkEstablished,
]);

function isFastCode(code) { return FAST_CODES.has(code); }
function fitsInDatagram(bytes) { return bytes.length <= MAX_UDP_PACKET_LEN; }

// `sendTcp` is injected: this module opens the fast lane and does not own the slow one.
function createUdpLink({ host, port, playerId, sendTcp, onMessage, log = () => {} }) {
    let sock = null;
    let up = false;                 // `ulinkup`
    let confirmed = false;          // we have replied MsgUDPLinkEstablished
    let sentOverUdp = 0, sentOverTcp = 0, tooBig = 0, received = 0;

    function open() {
        return new Promise((resolve, reject) => {
            sock = dgram.createSocket("udp4");
            sock.on("error", (e) => { log("udp error: " + e.message); try { sock.close(); } catch (_) {} sock = null; up = false; });
            sock.on("message", (msg, rinfo) => {
                received++;
                // "This is really a hack" -- ServerLink::confirmIncomingUDP. A datagram arriving from the
                // server IS the confirmation, whatever it says. We do not wait to be told.
                if (!confirmed) {
                    confirmed = true;
                    up = true;
                    log("server's UDP came back; using UDP to server");
                    sendTcp(frame(MSG.MsgUDPLinkEstablished, new Uint8Array(0)));
                }
                if (!onMessage) return;
                let out;
                try { out = parseFrames(new Uint8Array(msg)); } catch (e) { log("bad datagram: " + e.message); return; }
                for (const m of out.msgs) onMessage(m, rinfo);
            });
            sock.bind(0, () => {
                const w = new Writer(1); w.u8(playerId & 0xff);
                const req = frame(MSG.MsgUDPLinkRequest, w.bytes());
                // MsgUDPLinkRequest ALWAYS goes by UDP, even before the link is up, because it is the link
                // coming up. Sending it on TCP would be asking the server to reply to a channel we have not
                // opened.
                sock.send(Buffer.from(req), port, host, (e) => (e ? reject(e) : resolve(sock.address().port)));
            });
        });
    }

    // `enableOutboundUDP` -- the server told us, rather than us inferring it. Whichever arrives first wins.
    function onEstablished() { if (!up) log("server got our UDP; using UDP to server"); up = true; }

    // The routing decision, and the cap.
    function send(code, payload) {
        const bytes = frame(code, payload);
        const fast = (code === MSG.MsgUDPLinkRequest) || (up && sock && isFastCode(code));
        if (!fast) { sendTcp(bytes); sentOverTcp++; return "tcp"; }
        if (!fitsInDatagram(bytes)) {
            // BZFlag does not check. A datagram of 69 bytes is a message the server never sees, and a
            // client that quietly loses its own shots is worse than a laggier one.
            tooBig++;
            sendTcp(bytes);
            sentOverTcp++;
            return "tcp-oversize";
        }
        sock.send(Buffer.from(bytes), port, host);
        sentOverUdp++;
        return "udp";
    }

    function close() { if (sock) { try { sock.close(); } catch (e) {} sock = null; } up = false; confirmed = false; }

    return {
        open, close, send, onEstablished,
        get up() { return up; },
        get localPort() { return sock ? sock.address().port : null; },
        stats: () => ({ sentOverUdp, sentOverTcp, tooBig, received }),
    };
}

export { createUdpLink, isFastCode, fitsInDatagram, FAST_CODES, MAX_UDP_PACKET_LEN };
