// tools/roundhouse/rotationTimer-selfcheck.mjs
//
// v2967 -- THE TIMER THAT FIRES, AND THE ACCOUNTING QUESTION AT ITS CENTRE.
//
// The schedule and the additive policy were settled. What was missing is the thing that acts, and its one real
// design question is WHEN A ROTATION COUNTS AS HAVING HAPPENED. Both obvious answers fail, in opposite ways:
//
//   record before the spawn succeeds -> a broken cloudflared means the hub waits the FULL interval before trying
//   again: four hours of no tunnel over a fixable PATH error;
//
//   record only on success -> a permanently broken cloudflared retries every single poll, spawning failing
//   processes forever. Worse than the first, because it looks like activity.
//
// So attempts and successes are tracked separately and failures back off, doubling to a ceiling. And "success"
// means the URL actually APPEARED -- cloudflared exiting zero is not a tunnel.

import { tick, recordAttemptResult, DEFAULT_BACKOFF_MIN, MAX_BACKOFF_MIN } from "./tunnelRotator.mjs";
import { prose } from "../ship/sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const bridge = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "ai-bridge", "fingerprintBridge.js"), "utf8");

// ---- 1. A FAILED ROTATION NEVER LOOKS LIKE A FRESH TUNNEL -------------------------------------------------------------
{
    const base = { enabled: true, everyHours: 4, lastRotatedAt: "2026-07-25T00:00:00Z" };
    const afterFail = recordAttemptResult(base, false, { now: "2026-07-25T05:00:00Z", error: "cloudflared not found" });
    ok("!! a failure leaves lastRotatedAt untouched",
        afterFail.lastRotatedAt === "2026-07-25T00:00:00Z" && afterFail.consecutiveFailures === 1,
        "the attempt is recorded, the rotation is not. Otherwise the hub would believe it has a four-hour-old " +
        "tunnel when it actually has none, and would not try again until the next interval");

    const afterOk = recordAttemptResult(afterFail, true, { now: "2026-07-25T06:00:00Z", url: "https://new.trycloudflare.com" });
    ok("a success sets the rotation time and clears the failure count",
        afterOk.lastRotatedAt === "2026-07-25T06:00:00.000Z" && afterOk.consecutiveFailures === 0,
        "one good rotation wipes the backoff, so a transient outage does not leave the hub crawling afterwards");
}

// ---- 2. FAILURE BACKS OFF INSTEAD OF SPINNING OR STALLING ----------------------------------------------------------------
{
    let s = recordAttemptResult({ enabled: true, everyHours: 4, lastRotatedAt: "2026-07-25T00:00:00Z" }, false, { now: "2026-07-25T05:00:00Z" });
    ok("!! one minute after a failure it does NOT retry",
        tick(s, { now: "2026-07-25T05:01:00Z" }).act === "backoff",
        "a broken binary would otherwise spawn a failing process every poll forever -- thrashing that looks like " +
        "activity and produces nothing");

    ok("...and after the backoff window it DOES retry",
        tick(s, { now: "2026-07-25T05:06:00Z" }).act === "rotate",
        DEFAULT_BACKOFF_MIN + " minutes, so a transient failure costs minutes rather than the whole interval");

    s = recordAttemptResult(s, false, { now: "2026-07-25T05:06:00Z" });
    s = recordAttemptResult(s, false, { now: "2026-07-25T05:16:00Z" });
    const d = tick(s, { now: "2026-07-25T05:17:00Z" });
    ok("!! repeated failures double the wait, up to a ceiling",
        d.act === "backoff" && d.waitMin === 20 && MAX_BACKOFF_MIN === 120,
        "5, 10, 20 minutes... capped at " + MAX_BACKOFF_MIN + ". A permanently broken cloudflared settles into a " +
        "slow retry that leaves a readable trail, instead of either spinning or giving up silently");
}

// ---- 3. OFF MEANS OFF ------------------------------------------------------------------------------------------------------
{
    ok("disabled never rotates, however overdue",
        tick({ enabled: false, everyHours: 1, lastRotatedAt: "2020-01-01T00:00:00Z" }).act === "idle",
        "five years overdue and still idle -- the switch is not advisory");
}

// ---- 4. THE URL MUST ACTUALLY APPEAR -------------------------------------------------------------------------------------
{
    ok("!! the timer treats 'no URL appeared' as a FAILURE, not a rotation",
        /no URL appeared within the grace window/.test(bridge) && /if \(url\) \{/.test(bridge),
        "cloudflared exiting zero is not a tunnel. hostingBridge already knows a quick tunnel comes up " +
        "bad-gateway about a third of the time, so a spawn that yields no URL backs off rather than resetting " +
        "the clock on something that never existed");

    ok("a new URL is registered ADDITIVELY, and the registry is folded in at the same time",
        /onTunnelStarted\(reg, url/.test(bridge) && /ingestRegistry/.test(bridge),
        "rotation adds a candidate and retires nothing (v2957), and the ingest keeps the peer-facing list a " +
        "superset of the hub's own (v2966)");
}

// ---- 5. THE TIMER CANNOT DAMAGE THE PROCESS -------------------------------------------------------------------------------
{
    ok("!! it never throws into the event loop and never holds the process open",
        /a timer must never throw into the event loop/.test(prose(bridge)) && /_rotTimer\.unref\(\)/.test(bridge),
        "the whole body is wrapped, and unref() means a hub that is otherwise finished exits instead of lingering " +
        "just to rotate a tunnel nobody is using");

    ok("it will not start twice",
        /if \(_rotTimer\) return;/.test(bridge),
        "two timers would halve the effective interval and double the spawns -- and the second would be invisible");
}

console.log();
if (fails) { console.log("rotationTimer-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("rotationTimer-selfcheck: all checks pass");
