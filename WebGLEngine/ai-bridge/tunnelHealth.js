// ai-bridge/tunnelHealth.js — v2277
//
// Pure health logic for Cloudflare quick tunnels, so the flaky bits are testable. Two problems this addresses:
//   1. A fresh quick tunnel is BAD-GATEWAY at birth roughly a third of the time (Cloudflare's edge answers 502
//      before the tunnel is wired through). We must VERIFY a URL answers before trusting/emailing it, and we
//      must recognize 502/5xx-edge as "bad-gateway" (dead) rather than a normal reachable page.
//   2. When no tunnel is live, something should make a new one.
//
// classifyProbe: a probe result -> "live" | "bad-gateway" | "unreachable".
// verifyUrl:     poll /health a few times (a born-bad tunnel sometimes clears within seconds) -> {live,...}.
// planEnsure:    given the currently-live URLs, decide whether a new tunnel is needed.

function classifyProbe(r) {
    if (!r || r.error) return "unreachable";
    const s = r.status || 0;
    if (r.ok || (s >= 200 && s < 300)) return "live";
    if (s === 502 || s === 503 || s === 504 || (s >= 520 && s <= 530)) return "bad-gateway";  // cloudflared / CF edge
    return "unreachable";
}

// probe url + "/health" up to `tries` times with `delayMs` between; returns as soon as it's live.
async function verifyUrl(url, fetchImpl, opts) {
    opts = opts || {};
    const tries = opts.tries || 5, delayMs = opts.delayMs != null ? opts.delayMs : 3000;
    const base = String(url || "").replace(/\/+$/, "");
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    let last = "unreachable";
    for (let i = 0; i < tries; i++) {
        let r;
        try { const resp = await fetchImpl(base + "/health"); r = { ok: resp.ok, status: resp.status }; }
        catch (e) { r = { error: String((e && e.message) || e) }; }
        last = classifyProbe(r);
        if (last === "live") return { live: true, classification: "live", tries: i + 1 };
        if (i < tries - 1) await sleep(delayMs);
    }
    return { live: false, classification: last, tries };
}

function planEnsure(aliveUrls) {
    const liveCount = (Array.isArray(aliveUrls) ? aliveUrls : []).filter(Boolean).length;
    return { needNew: liveCount === 0, liveCount };
}

// A tunnel URL may only be ADVERTISED to peers once it is PROVEN live (verifyUrl passed -> ts.verified === true).
// running + url alone is not enough: a fresh Cloudflare quick tunnel is bad-gateway roughly a third of the time at
// birth, and sharing that hands every peer a dead link that the receiving toast then announces as "live". The email
// already waits for proof (hostingBridge); the peer-share must hold to the same bar. Returns "" until proven live.
function shareableTunnelUrl(ts) {
    return (ts && ts.running && ts.url && ts.verified === true) ? ts.url : "";
}

// Diagnose WHY a tunnel won't attach. cloudflared tunnels to http://localhost:PORT, so if the SweK server is bound only
// to the LAN IP (e.g. 192.168.50.56) and not to 127.0.0.1, cloudflared gets connection-refused and the public URL
// answers 502 forever -- which looks exactly like the born-bad-gateway flakiness but never clears. Given a probe of the
// LOCAL target (fetch http://127.0.0.1:PORT/health), say what it means:
//   "target-reachable"   -> the server answers on localhost; cloudflared can attach. A 502 is transient / CF-edge.
//   "target-unreachable" -> nothing answers on localhost; cloudflared CANNOT attach. THIS is the stuck-502 cause:
//                           the server is likely bound to the LAN IP only. Bind it to 0.0.0.0 (or 127.0.0.1 too).
function classifyTarget(localProbe) {
    if (localProbe && (localProbe.ok || (localProbe.status >= 200 && localProbe.status < 500))) return "target-reachable";
    if (localProbe && localProbe.error) return "target-unreachable";
    return "target-unknown";
}

module.exports = { classifyProbe, verifyUrl, planEnsure, shareableTunnelUrl, classifyTarget };
