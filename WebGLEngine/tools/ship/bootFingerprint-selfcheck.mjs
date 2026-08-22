// WebGLEngine/tools/ship/bootFingerprint-selfcheck.mjs -- v2838
//
// Run: node tools/ship/bootFingerprint-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/fingerprint/bootFingerprint.mjs and its wiring into main.js.
//
// THE POINT OF A BOOT FINGERPRINT IS NOT THE NUMBER. verify.html can already produce that on demand. The point
// is the COMPARISON ACROSS BOOTS -- and that only has value if the cache is incapable of going quiet when it
// should be shouting. So what is gated hardest here is the three-case behaviour:
//
//   a NEW BUILD records a baseline          (a new version is allowed a new fingerprint -- that is shipping)
//   the SAME BUILD unchanged stays quiet    (nothing happened, nothing said)
//   the SAME BUILD with a DIFFERENT master  ALARMS
//
// That third case is the entire reason the file exists. It means either the source was edited without bumping
// the version, or this machine no longer agrees with what it computed last time -- and neither of those shows
// up anywhere else in the engine.
//
// AND IT MUST NOT COST ANYTHING AT STARTUP. computeFingerprint is ~1.3 seconds cold. Running it in the boot path
// would trade a real second of every launch for a check nobody asked for at that moment, so it goes to idle.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STORE_KEY, readRecord, writeRecord, compareToRecord, runAtBoot, attestation, agreesWith } from "../fingerprint/bootFingerprint.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
const src = fs.readFileSync(path.join(ENG, "tools", "fingerprint", "bootFingerprint.mjs"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const mkStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const now = (fn) => fn();
const boot = (build, master, store, fp) => { let out = null; runAtBoot({ build, computeFingerprint: fp || (() => ({ master, subsystems: [1, 2, 3] })), store, schedule: now, onResult: (o) => { out = o; } }); return out; };

// 1. THE THREE CASES -- the whole design
{
    const s = mkStore();
    ok("a first-ever boot records a BASELINE, not a pass", boot("v1", "AAA", s).status === "baseline");
    ok("the same build with the same fingerprint is QUIET", boot("v1", "AAA", s).status === "match");
    const drift = boot("v1", "BBB", s);
    ok("!! the SAME BUILD with a DIFFERENT fingerprint ALARMS", drift.status === "DRIFT");
    ok("...and the alarm says what it actually means", /source changed without a version bump|no longer agrees with itself/.test(drift.message));
    ok("...and it carries BOTH fingerprints so the difference is inspectable", drift.master === "BBB" && drift.previousMaster === "AAA");
    ok("a NEW build records a new baseline rather than alarming", boot("v2", "CCC", s).status === "baseline");
    ok("...naming the build it replaced", compareToRecord("v2", "CCC", { build: "v1", master: "AAA" }).previousBuild === "v1");
}

// 2. THE ALARM FIRES ONCE, NOT FOREVER -- a warning that repeats every boot is a warning nobody reads
{
    const s = mkStore();
    boot("v1", "AAA", s);
    ok("after drift, the new value becomes the reference", boot("v1", "BBB", s).status === "DRIFT" && boot("v1", "BBB", s).status === "match");
    ok("...and the source says why that is deliberate", /fires once rather than on every boot|nobody reads/i.test(src));
}

// 3. IT MUST NOT COST ANYTHING AT STARTUP
{
    ok("the work is scheduled, never run synchronously", /requestIdleCallback/.test(src) && /scheduleIdle/.test(src));
    ok("runAtBoot returns immediately with 'scheduled'", (() => {
        const r = runAtBoot({ build: "v1", computeFingerprint: () => ({ master: "X" }), store: mkStore(), schedule: () => {} });
        return r.status === "scheduled";
    })());
    ok("main.js wires it at idle and does NOT await the fingerprint in the boot path",
        /runAtBoot\(\{/.test(main) && !/await computeFingerprint\(/.test(main));
    ok("...and the reason is recorded where the next person will read it", /never in the boot path|~1\.3s cold/.test(main));
}

// 4. NOTHING IT DOES MAY BREAK THE ENGINE STARTING
{
    const s = mkStore();
    const thrown = boot("v1", null, s, () => { throw new Error("wasm missing"); });
    ok("a throwing fingerprint is reported, not propagated", thrown.status === "error" && /wasm missing/.test(thrown.message));
    const corrupt = mkStore(); corrupt.setItem(STORE_KEY, "{not json");
    ok("a corrupt cache reads as no cache rather than throwing", readRecord(corrupt) === null);
    const partial = mkStore(); partial.setItem(STORE_KEY, JSON.stringify({ build: "v1" }));
    ok("a record missing its master is not a record", readRecord(partial) === null);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    ok("storage being blocked entirely does not throw", readRecord(blocked) === null && writeRecord({ build: "v", master: "m" }, blocked) === false);
    ok("a missing build or fingerprint function is refused clearly",
        runAtBoot({ store: mkStore(), schedule: now }).status === "skipped");
    ok("main.js guards the whole thing in a try/catch", /catch \(e\) \{ console\.warn\("\[RIG CHECK\] unavailable/.test(main));
}

// 5. PEERS: one string comparison, no recomputation
{
    const s = mkStore();
    boot("v9", "FEED", s);
    const att = attestation(s);
    ok("a peer can read the cached attestation without recomputing", att && att.build === "v9" && att.master === "FEED");
    ok("agreement requires the SAME BUILD and the same master", agreesWith({ build: "v9", master: "FEED" }, s).agree === true);
    const diff = agreesWith({ build: "v9", master: "BEEF" }, s);
    ok("!! same build + different master is a DISAGREEMENT with a plain reason", diff.agree === false && /do not compute the same physics/.test(diff.reason));
    const other = agreesWith({ build: "v8", master: "FEED" }, s);
    ok("...and matching across DIFFERENT builds is refused as not comparable", other.agree === false && /not comparable/.test(other.reason),
        other.reason);
    ok("a box with no fingerprint yet says so rather than returning zero", attestation(mkStore()) === null);
}

// 6. it is reachable from the page, and the rig run collects it
{
    ok("main.js exposes window.rigCheck for a peer to query", /window\.rigCheck = \{/.test(main));
    ok("...with attestation and agreesWith on it", /attestation: \(\) => attestation\(\)/.test(main) && /agreesWith: \(peer\)/.test(main));
    ok("a DRIFT is logged as an error, not buried at log level", /status === "DRIFT"\) console\.error/.test(main));
    const manifest = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));
    const probe = manifest.pages.find((p) => p.name === "wasm-gen-stats");
    ok("the render-QA probe collects the rig check too, so a rig run reports it", !!probe && /rigCheck/.test(String(probe.probe)));
}

// 7. and it really works against the REAL fingerprint, not just a stub
{
    const { computeFingerprint } = await import("../fingerprint/fingerprint.mjs");
    const s = mkStore();
    const first = boot("vREAL", null, s, computeFingerprint);
    ok("the real computeFingerprint drives it end to end", first.status === "baseline" && typeof first.master === "string" && first.master.length > 16,
        `${first.subsystems} subsystems in ${first.ms}ms`);
    const second = boot("vREAL", null, s, computeFingerprint);
    ok("...and the engine agrees with itself on a second run", second.status === "match", second.status);
}

console.log("bootFingerprint-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
