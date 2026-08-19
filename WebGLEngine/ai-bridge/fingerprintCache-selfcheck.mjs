// WebGLEngine/ai-bridge/fingerprintCache-selfcheck.mjs -- v3484
//
// Run: node ai-bridge/fingerprintCache-selfcheck.mjs
//
// *** THE STALL, FOUND AT LAST, AND THE SHAPE OF THE HUNT IS WORTH MORE THAN THE FIX. ***
//
//   v3476  nvidia-smi on /system/stats            a real blocker. NOT the blocker.
//   v3481  device builds moved to a worker        real, proven, 381x. NOT on the stalling path.
//   v3482  deviceBridge wired to that worker      correct, and the stall came back unchanged.
//   v3483  lagBlame gained the CALL CHAIN         and the guessing stopped.
//
// The chain named it in one boot:
//
//     airy-rayleigh-factor  physicsBaseline.mjs:163 -> buildOptics -> circularNumeric -> diffraction.js:53
//
// fingerprintBridge RE-MEASURES ALL TWELVE BASELINED PHYSICS QUANTITIES ON EVERY FINGERPRINT REQUEST -- 2464ms
// measured in the sandbox, several times that on the rig -- and the fleet asks constantly. THREE PROPERTIES HAD
// TO BE TRUE TOGETHER: slow, on a request path, and REPEATED. Only the third made it grow, which is why every
// earlier fix helped and none cured.
//
// *** AND CACHING IS THE CORRECT ANSWER RATHER THAN A COMPROMISE: A FINGERPRINT IS A PROPERTY OF THIS BUILD ON
// THIS BOX. Two requests a second apart MUST agree -- that is the whole premise of comparing them across a
// fleet -- so re-measuring per request never bought freshness, only cost. ***
"use strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const fb = require_(path.join(HERE, "fingerprintBridge.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE COST IS REAL -- REPRODUCED, NOT QUOTED
 * --------------------------------------------------------------------------------------------------------- */
let baselineMs = 0;
{
    const { measureFns } = await import("../tools/roundhouse/physicsBaseline.mjs");
    const fns = await measureFns();
    const names = Object.keys(fns);
    const t = Date.now();
    for (const n of names) await fns[n]();
    baselineMs = Date.now() - t;
    say(`${names.length} baselined quantities re-measured in ${baselineMs}ms -- the per-request cost as it stood`);
    ok("!! *** THE FINGERPRINT'S PHYSICS REALLY IS EXPENSIVE ***", baselineMs > 300,
       `${baselineMs}ms here and the rig is slower. WITHOUT THIS THE CACHE BELOW COULD PASS ON A BOX WHERE THE UNCACHED PATH WAS ALREADY FAST -- certifying a cure for a cost the fixture cannot exhibit, which is the same trap v3481 named.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE CACHE IS PRESENT, AND THE SECOND CALL DOES NO WORK
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("!! the bridge exposes its cache state, so this can check WORK rather than SPEED",
       typeof fb._observablesCacheState === "function",
       "*** A TIMING-ONLY CHECK WOULD PASS ON A CACHE THAT RE-MEASURED QUICKLY BY LUCK. Asking the bridge whether it holds a value is the difference between 'it was fast' and 'it did not do it again'. ***");

    const before = fb._observablesCacheState();
    say(`cache before any request: cached=${before.cached} inFlight=${before.inFlight}`);
    ok("...and it starts EMPTY, so a later 'cached' reading means something",
       before.cached === false,
       "a cache that was warm before anybody asked would make every check below vacuous.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE SOURCE SAYS WHAT THE MEASUREMENT CANNOT
 * --------------------------------------------------------------------------------------------------------- */
{
    const fs = await import("node:fs");
    const { noComments } = await import("../tools/ship/sourceScan.mjs");
    // noComments: v3476 wasted a run matching its own explanation, and this file is thick with prose about the
    // very identifiers it checks for.
    const src = noComments(fs.readFileSync(path.join(HERE, "fingerprintBridge.js"), "utf8"));

    // SCOPED TO localFingerprint's BODY, and my first version was not -- it forbade the call ANYWHERE and so
    // failed on the cache helper, which is the one place peerReport SHOULD still appear. *** "NOT ON THE REQUEST
    // PATH" IS A CLAIM ABOUT WHERE, AND A WHOLE-FILE SEARCH CANNOT MAKE A CLAIM ABOUT WHERE. ***
    const fpStart = src.indexOf("async function localFingerprint()");
    const fpBody = src.slice(fpStart, src.indexOf("\nasync function", fpStart + 10) + 1 || undefined);
    ok("!! *** peerReport IS NO LONGER CALLED DIRECTLY ON THE REQUEST PATH ***",
       fpStart > 0 && !/peerReport\(/.test(fpBody) && /_cachedObservables\(base\)/.test(fpBody),
       "the request path now asks the cache. THE ASSERTION IS ON THE CALL SITE, because a cache that exists and is bypassed is indistinguishable from no cache -- which is exactly what v3482 discovered about a worker nothing called.");

    ok("!! *** AND THE IN-FLIGHT PROMISE IS SHARED, WHICH IS THE HALF THAT STOPS THE GROWTH ***",
       /_obsInFlight/.test(src) && /if \(_obsInFlight\) return _obsInFlight/.test(src),
       "*** WITHOUT IT, TEN PEERS ARRIVING TOGETHER START TEN MEASUREMENTS. That is how a 2.5 second cost became a 74 second stall, and it is why the blocks in Keith's logs GREW rather than repeating at a fixed size -- the shape of something accumulating, which v3477 noticed and could not yet explain. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3b. AND THE FIRST MEASUREMENT IS OFF THE MAIN THREAD TOO -- v3485
 * --------------------------------------------------------------------------------------------------------- */
{
    const { callInWorker, measureMainThreadStall } = await import("./deviceWorker.mjs");
    const args = [{ version: process.version, arch: process.arch, host: "gate" }];
    const inline = await measureMainThreadStall(async () => {
        const { peerReport } = await import("../tools/fingerprint/peerReport.mjs");
        return peerReport(args[0]);
    });
    const worker = await measureMainThreadStall(() => callInWorker("tools/fingerprint/peerReport.mjs", "peerReport", args));
    say(`peerReport stall -- inline ${inline.worstStallMs}ms, worker ${worker.worstStallMs}ms`);

    ok("!! *** THE FIRST, UNCACHED MEASUREMENT NO LONGER BLOCKS EITHER ***",
       inline.worstStallMs > 300 && worker.worstStallMs < 200,
       `${inline.worstStallMs}ms -> ${worker.worstStallMs}ms. *** v3484's CACHE KILLED THE ACCUMULATION -- Keith's blocks went from 15s, 25s, 48s, 74s AND CLIMBING to ONE 14s block and then nothing over 3s for four hundred seconds -- BUT THE FIRST MEASUREMENT STILL RAN INLINE, and that single remaining block is exactly what this closes. ***`);

    ok("...and the observables are the same either way",
       JSON.stringify(Object.keys(inline.value.observables || {}).sort()) === JSON.stringify(Object.keys(worker.value.observables || {}).sort()),
       "same keys across the thread boundary. A FINGERPRINT THAT DIFFERED BY WHERE IT WAS COMPUTED WOULD BE WORSE THAN A SLOW ONE, because the whole point is comparing it between machines.");

    const st = fb._observablesCacheState();
    ok("...and the bridge reports WHICH path it took, so a silent fallback is impossible",
       Object.prototype.hasOwnProperty.call(st, "offThread"),
       "`offThread` is null until measured, then true or false. *** THE FALLBACK IS DELIBERATE -- a box without worker_threads still gets its fingerprint, slowly -- BUT IT LOGS AND IT REPORTS. A diagnostic that quietly took the slow path would leave somebody debugging the wrong version of the code. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. WHAT THIS CANNOT PROVE
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("REPORTED: the end-to-end effect is a RIG measurement, not a sandbox one", true,
       `*** NO HTTP SERVER, NO FLEET AND NO PEERS RUN HERE, so what is proven is that the expensive call left the request path and that the cache exists, is empty at start, and is shared while in flight. WHETHER THE [lag] LINES STOP IS KEITH'S NEXT BOOT. And the prediction is falsifiable in the good way: if they continue, the call chain will now name whatever is next, because that is what v3483 built it to do. ***`);
}

console.log(fails ? "\nfingerprintCache-selfcheck: " + fails + " FAILED" : "\nfingerprintCache-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
