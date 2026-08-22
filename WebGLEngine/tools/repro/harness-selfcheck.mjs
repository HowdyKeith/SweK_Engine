// tools/repro/harness-selfcheck.mjs
//
// Run: node tools/repro/harness-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The harness is the verification spine pointed at foreign code, so the gate proves it works on code that is not the
// engine's. It fingerprints arbitrary probes into per-probe hashes and a master; it catches hidden non-determinism --
// flagging a probe that reaches for Math.random or the clock while passing an honest one, which is the whole reason the
// tool exists; it compares two machines' attestations and names the exact probe that diverged; and it depends only on
// the portable hash, so it is genuinely standalone. The sabotage makes the determinism check run a probe only once, so
// it can never see variation and calls everything deterministic -- and the detection test fails, because a
// reproducibility checker that cannot catch Math.random is no checker at all.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprintProbes, checkDeterminism, attestProbes, compareAttestations, EXAMPLE_PROBES } from "./harness.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. GENERIC FINGERPRINT: it hashes arbitrary probes into a master -----------------------------------
{
    const probes = [{ name: "a", run: () => [1, 2, 3] }, { name: "b", run: () => [Math.sqrt(2), 4] }];
    const fp = fingerprintProbes(probes);
    ok("!! the harness fingerprints any set of probes into a master", fp.subsystems.length === 2 && fp.subsystems[0].hash.length === 64 && fp.master.length === 64,
       "two arbitrary functions become two named hashes and one master -- the same structure the engine uses for its own physics, now for anyone's computation.");
}

// ---- 2. NON-DETERMINISM DETECTED: it flags the random and clock probes, passes the honest one ------------
{
    const res = checkDeterminism(EXAMPLE_PROBES);
    const honest = res.find((r) => r.name === "sum-of-reciprocal-squares");
    const rnd = res.find((r) => r.name === "uses-random");
    const clk = res.find((r) => r.name === "uses-clock");
    ok("!! it catches hidden non-determinism -- flags Math.random and the clock, passes honest code", honest.deterministic && !rnd.deterministic && !clk.deterministic,
       "the reciprocal-squares sum reproduces every run and passes; the probes reaching for Math.random and Date.now do not reproduce and are flagged -- the bug the author usually cannot see, named.");
}

// ---- 3. COMPARE LOCALISES: two machines agree, or the diverging probe is named --------------------------
{
    const same = compareAttestations(attestProbes([{ name: "x", run: () => [1, 2, 3] }]), attestProbes([{ name: "x", run: () => [1, 2, 3] }]));
    const diff = compareAttestations(attestProbes([{ name: "x", run: () => [1, 2, 3] }]), attestProbes([{ name: "x", run: () => [1, 2, 9] }]));
    ok("!! comparing two machines is identical-or-names-the-diverging-probe", same.identical && !diff.identical && diff.diverged.length === 1 && diff.diverged[0] === "x",
       "the same probe on two machines attests identical; a differing result names exactly the probe \"" + diff.diverged[0] + "\" -- the cross-machine proof, for the user's own code.");
}

// ---- 4. STANDALONE: the harness depends only on the portable hash ---------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "harness.js"), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const onlyHash = imports.every((i) => i.includes("hash.mjs") || i.includes("sha256.mjs"));
    ok("!! the harness is standalone -- it imports only the portable hash", onlyHash && imports.length > 0,
       "its only imports are hash.mjs and sha256.mjs (" + imports.join(", ") + ") -- no engine, no physics; three files drop into any project.");
}

// ---- 5. DETERMINISTIC: the harness itself reproduces ----------------------------------------------------
{
    const p = [{ name: "fixed", run: () => { const a = []; for (let n = 1; n <= 20; n++) a.push(1 / n); return a; } }];
    ok("!! the harness is itself deterministic", fingerprintProbes(p).master === fingerprintProbes(p).master,
       "fingerprinting a fixed deterministic probe twice gives the same master -- the tool that judges reproducibility is itself reproducible.");
}

console.log(fails ? "\nharness-selfcheck: " + fails + " FAILED" : "\nharness-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
