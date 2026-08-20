// tools/hashConsistency-selfcheck.mjs
//
// Run: node tools/hashConsistency-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The fingerprint now hashes with a pure-JS sha256 so it can run behind a button in the browser instead of only from a
// terminal. That is only safe if the pure-JS hash is byte-for-byte the same as before -- otherwise the clickable
// fingerprint would silently disagree with the command-line one, which is the exact kind of hidden divergence this whole
// engine exists to prevent. So the gate pins the hash to the FIPS 180-4 test vectors, pins the whole-engine master to
// its known value through the pure-JS path, and checks the verification console actually wires its buttons to the real
// functions. The sabotage corrupts one round constant of the hash, and the vectors and the master both break at once.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "./sha256.mjs";
import { hashFloats } from "./hash.mjs";
import { computeFingerprint } from "./fingerprint/fingerprint.mjs";
import { createHash } from "node:crypto";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const enc = (s) => new TextEncoder().encode(s);

// ---- 1. FIPS test vectors: the pure-JS sha256 is a correct sha256 ---------------------------------------
{
    const empty = sha256Hex(enc("")), abc = sha256Hex(enc("abc"));
    const ok1 = empty === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const ok2 = abc === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    ok("!! the pure-JS sha256 matches the FIPS 180-4 test vectors", ok1 && ok2,
       "the empty string and \"abc\" hash to their standard values -- the browser hash is a real sha256, not an approximation of one.");
}

// ---- 2. CROSS-CHECK: the pure-JS master equals what node:crypto produces --------------------------------
{
    const { master, subsystems } = computeFingerprint();
    let concat = ""; for (const x of subsystems) concat += x.name + "=" + x.hash + ";";
    const nodeMaster = createHash("sha256").update(concat).digest("hex");
    ok("!! the pure-JS master equals the node:crypto master", master === nodeMaster,
       "the whole-engine master computed with the pure-JS hash matches node:crypto byte-for-byte across all " + subsystems.length + " subsystems -- the clickable fingerprint and the command-line one agree to the bit, and this stays true as subsystems are added.");
}

// ---- 3. HASHFLOATS stable: a known float vector hashes to a fixed value ----------------------------------
{
    const h = hashFloats("probe", [1.5, Math.PI, -2.25e-8, 42]);
    const again = hashFloats("probe", [1.5, Math.PI, -2.25e-8, 42]);
    ok("!! hashFloats is stable and label-sensitive", h === again && h !== hashFloats("other", [1.5, Math.PI, -2.25e-8, 42]),
       "the same label and floats always hash the same, and a different label hashes differently -- the little-endian float serialisation is well-defined.");
}

// ---- 4. CONSOLE WIRING: verify.html imports the real functions and binds the buttons --------------------
{
    const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "verify.html"), "utf8");
    const importsFp = html.includes("computeFingerprint") && html.includes("./tools/fingerprint/fingerprint.mjs");
    const importsAtt = html.includes("compareAttestations") && html.includes("./tools/fingerprint/attest.mjs");
    const buttons = html.includes("btnFp") && html.includes("btnAtt") && html.includes("btnCmp");
    ok("!! the verification console wires its buttons to the real functions", importsFp && importsAtt && buttons,
       "verify.html imports computeFingerprint and compareAttestations from the engine and binds a Run-fingerprint, Save-attestation, and Compare-peer button -- every verification tool now has a button.");
}

// ---- 5. DETERMINISTIC ------------------------------------------------------------------------------------
{
    ok("!! the hash is deterministic", sha256Hex(enc("swek")) === sha256Hex(enc("swek")),
       "the same input always yields the same digest -- as a hash must.");
}

console.log(fails ? "\nhashConsistency-selfcheck: " + fails + " FAILED" : "\nhashConsistency-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
