// WebGLEngine/bz/net/bzToken.mjs — the thing a public server wants before it lets you in.
//
// A `bzfs` running `-requireidentify` (which most public ones do) will not accept a `MsgEnter` from a
// registered callsign without a TOKEN. The token does not come from the game server: it comes from the LIST
// SERVER, over HTTPS, and the game server then asks the list server whether the token is real.
//
// From src/game/ServerList.cxx and src/bzflag/playing.cxx, and from the list server's own protocol:
//
//     GET https://my.bzflag.org/db/?action=LOGIN&callsign=<c>&password=<p>
//
// and the body is a handful of `KEY: value` lines, one per line, of which the two that matter are:
//
//     TOKEN: 0123456789abcdef        -- you are who you say you are, for a few minutes
//     NOTOK: <reason>                -- you are not, and here is why
//
// A server can also answer `ERROR:` or `MSG:`. Anything else is not an answer and is treated as one.
//
// THREE THINGS THIS FILE IS CAREFUL ABOUT.
//
//   * A password is never logged, never stored, and never put in a URL this module keeps. It is
//     percent-encoded into one request and then it is gone. `describe()` exists so a caller can print what
//     happened without printing what was sent.
//   * An UNREGISTERED callsign needs no token, and passing an empty one is correct rather than lazy. A
//     server that requires identification will refuse; a server that does not will let you in. Both are
//     answers, and `MsgReject` carries the reason.
//   * The token is short-lived and single-use-ish. It is fetched immediately before `MsgEnter` and not
//     cached to disk, because a token in a file is a credential in a file.

"use strict";

const DEFAULT_LIST_SERVER = "https://my.bzflag.org/db/";
const TIMEOUT_MS = 8000;

// `KEY: value` lines, in order. The list server has been known to send blank lines and comments; neither is
// an error, and neither is a token.
function parseListServerReply(body) {
    const out = { token: null, notok: null, error: null, msg: null, lines: [] };
    for (const raw of String(body || "").split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        out.lines.push(line);
        const at = line.indexOf(":");
        if (at < 0) continue;
        const key = line.slice(0, at).trim().toUpperCase();
        const value = line.slice(at + 1).trim();
        if (key === "TOKEN" && !out.token) out.token = value;
        else if (key === "NOTOK" && !out.notok) out.notok = value;
        else if (key === "ERROR" && !out.error) out.error = value;
        else if (key === "MSG" && !out.msg) out.msg = value;
    }
    return out;
}

// A token, or a reason there is none. Never throws for a refusal: being told "no" is a result.
async function login({ callsign, password, listServer = DEFAULT_LIST_SERVER, fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
    if (!callsign) return { ok: false, token: "", reason: "no callsign: an unregistered player needs no token" };
    if (!password) return { ok: false, token: "", reason: "no password: an unregistered callsign enters with an empty token" };

    const url = new URL(listServer);
    url.searchParams.set("action", "LOGIN");
    url.searchParams.set("callsign", callsign);
    url.searchParams.set("password", password);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let body;
    try {
        const r = await fetchImpl(url.toString(), { signal: ac.signal, headers: { "User-Agent": "SweK-BZFlag/1.0" } });
        if (!r.ok) return { ok: false, token: "", reason: `list server answered HTTP ${r.status}` };
        body = await r.text();
    } catch (e) {
        return { ok: false, token: "", reason: "list server unreachable: " + (e && e.name === "AbortError" ? "timed out" : String(e && e.message || e)) };
    } finally { clearTimeout(timer); }

    const p = parseListServerReply(body);
    if (p.token) return { ok: true, token: p.token, reason: null };
    if (p.notok) return { ok: false, token: "", reason: "NOTOK: " + p.notok };
    if (p.error) return { ok: false, token: "", reason: "ERROR: " + p.error };
    return { ok: false, token: "", reason: "the list server said nothing this module understands" };
}

// What happened, without what was sent. A password must not reach a log by accident, and the easiest way to
// guarantee that is for the only printable summary to be built by a function that never sees one.
function describe(result, callsign) {
    if (!result) return "no attempt";
    if (result.ok) return `token for "${callsign}" (${result.token.length} chars, not shown)`;
    return `no token for "${callsign}": ${result.reason}`;
}

export { login, parseListServerReply, describe, DEFAULT_LIST_SERVER };
