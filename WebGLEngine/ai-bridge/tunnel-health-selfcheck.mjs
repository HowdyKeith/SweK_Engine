// ai-bridge/tunnel-health-selfcheck.mjs — v2277
//   run: node ai-bridge/tunnel-health-selfcheck.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { classifyProbe, verifyUrl, planEnsure } = require("./tunnelHealth.js");

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };

console.log("tunnel-health-selfcheck");

ok("200 -> live", classifyProbe({ ok: true, status: 200 }) === "live");
ok("502 (Cloudflare bad gateway) -> bad-gateway", classifyProbe({ ok: false, status: 502 }) === "bad-gateway");
ok("503/504 -> bad-gateway", classifyProbe({ status: 503 }) === "bad-gateway" && classifyProbe({ status: 504 }) === "bad-gateway");
ok("520-530 (CF edge errors) -> bad-gateway", classifyProbe({ status: 521 }) === "bad-gateway" && classifyProbe({ status: 530 }) === "bad-gateway");
ok("a thrown/timed-out probe -> unreachable", classifyProbe({ error: "aborted" }) === "unreachable");
ok("404 -> unreachable (served, but not our health)", classifyProbe({ ok: false, status: 404 }) === "unreachable");

// verifyUrl: a born-bad tunnel that clears after 2 tries is eventually live
{
    let n = 0;
    const fakeFetch = async () => { n++; return { ok: n >= 3, status: n >= 3 ? 200 : 502 }; };
    const v = await verifyUrl("https://x.trycloudflare.com", fakeFetch, { tries: 5, delayMs: 1 });
    ok("verifyUrl waits out a transient bad-gateway then reports live", v.live && v.tries === 3, "tries=" + v.tries);
}
// verifyUrl: a persistently bad-gateway tunnel is declared not-live (so we won't email a dead link)
{
    const fakeFetch = async () => ({ ok: false, status: 502 });
    const v = await verifyUrl("https://dead.trycloudflare.com", fakeFetch, { tries: 3, delayMs: 1 });
    ok("verifyUrl gives up on a persistent bad-gateway", !v.live && v.classification === "bad-gateway" && v.tries === 3);
}
// verifyUrl: unreachable (throws)
{
    const fakeFetch = async () => { throw new Error("ECONNREFUSED"); };
    const v = await verifyUrl("https://gone.trycloudflare.com", fakeFetch, { tries: 2, delayMs: 1 });
    ok("verifyUrl reports unreachable when the probe throws", !v.live && v.classification === "unreachable");
}

ok("planEnsure: no live urls -> needNew", planEnsure([]).needNew === true && planEnsure([]).liveCount === 0);
ok("planEnsure: a live url -> keep", planEnsure(["https://a.trycloudflare.com"]).needNew === false);
ok("planEnsure: ignores empty entries", planEnsure([null, "", "https://a.trycloudflare.com"]).liveCount === 1);

// shareableTunnelUrl: a tunnel is advertised to peers ONLY once proven live -- the fix for "toast says live, url dead".
{
    const { shareableTunnelUrl } = require("./tunnelHealth.js");
    const url = "https://x.trycloudflare.com";
    ok("shareableTunnelUrl: shares a verified-live tunnel", shareableTunnelUrl({ running: true, url, verified: true }) === url);
    ok("shareableTunnelUrl: withholds a still-verifying tunnel (verified null)", shareableTunnelUrl({ running: true, url, verified: null }) === "");
    ok("shareableTunnelUrl: withholds a dead tunnel (verified false)", shareableTunnelUrl({ running: true, url, verified: false }) === "");
    ok("shareableTunnelUrl: withholds when not running", shareableTunnelUrl({ running: false, url, verified: true }) === "");
}

// classifyTarget: diagnose whether cloudflared's localhost target is reachable (why a tunnel won't attach).
{
    const { classifyTarget } = require("./tunnelHealth.js");
    ok("classifyTarget: server answers on localhost -> reachable (cloudflared can attach)", classifyTarget({ ok: true, status: 200 }) === "target-reachable");
    ok("classifyTarget: connection refused -> unreachable (server not on localhost; the stuck-502 cause)", classifyTarget({ error: "ECONNREFUSED" }) === "target-unreachable");
    ok("classifyTarget: no probe -> unknown", classifyTarget(null) === "target-unknown");
}

console.log(`\ntunnel-health-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
