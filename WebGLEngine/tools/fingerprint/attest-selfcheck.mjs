// WebGLEngine/tools/fingerprint/attest-selfcheck.mjs
//
// Run: node tools/fingerprint/attest-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The peer-verification compare is the part that must be exactly right, because it is what will one day certify that
// Galaxina and an arm64 Mac agree to the bit. The gate proves it: two attestations of the same computation are called
// identical; when one subsystem's hash is changed, the compare catches it and names THAT subsystem and only that one --
// the localisation a master-versus-master glance cannot do; and a peer missing a subsystem is flagged as missing rather
// than silently passed. The sabotage makes the compare look only at the master and stop localising, and the divergence
// check fails, because "the masters differ" is not the same tool as "thermal-diffusion differs."
import { attestation, compareAttestations } from "./attest.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- 1. IDENTICAL: two attestations of the same computation agree ----------------------------------------
{
    const a = attestation({ arch: "x64", host: "peerA" }), b = attestation({ arch: "arm64", host: "peerB" });
    const r = compareAttestations(a, b);
    ok("!! two peers computing the same physics attest identical", r.identical && r.masterEqual && r.diverged.length === 0 && r.agreed === a.count,
       "all " + r.agreed + " subsystems and the master agree across two attestations -- a byte-for-byte proof the two machines computed the same thing, even labelled as different architectures.");
}

// ---- 2. LOCALISE: a single diverging subsystem is caught and named exactly --------------------------------
{
    const a = attestation({ host: "peerA" }), b = clone(a); b.host = "peerB";
    const target = b.subsystems[Math.floor(b.subsystems.length / 2)]; const nm = target.name;
    target.hash = "ffff" + target.hash.slice(4); b.master = "changed";
    const r = compareAttestations(a, b);
    ok("!! a single diverging subsystem is caught and named -- and only it", !r.identical && r.diverged.length === 1 && r.diverged[0] === nm && r.agreed === a.count - 1,
       "changing one hash makes the compare report exactly \"" + r.diverged.join(", ") + "\" as diverged and the other " + r.agreed + " as agreed -- it points at the culprit instead of just saying the masters differ.");
}

// ---- 3. MISSING: a peer lacking a subsystem is flagged, not silently passed -------------------------------
{
    const a = attestation({ host: "newer" }), b = clone(a); b.host = "older";
    const dropped = b.subsystems.pop().name; b.count = b.subsystems.length; b.master = "older-master";
    const r = compareAttestations(a, b);
    ok("!! a peer missing a subsystem is flagged as missing", !r.identical && r.onlyA.includes(dropped) && r.onlyB.length === 0,
       "an older peer without the \"" + dropped + "\" subsystem is reported as missing it, rather than the pair being called a match on a shorter list.");
}

// ---- 4. COVERS every subsystem the fingerprint computes --------------------------------------------------
{
    const a = attestation();
    ok("!! the attestation covers every fingerprint subsystem", a.count === a.subsystems.length && a.subsystems.every((s) => s.name && s.hash && s.hash.length >= 16),
       "the attestation carries all " + a.count + " subsystem hashes and the master -- the whole computation is offered for comparison, not a summary.");
}

// ---- 5. DETERMINISTIC -----------------------------------------------------------------------------------
{
    const a = attestation(), b = attestation();
    ok("!! attestation is deterministic", a.master === b.master && a.subsystems.every((s, i) => s.hash === b.subsystems[i].hash),
       "two attestations on this machine carry identical hashes -- the thing a peer compares against does not drift between runs.");
}

console.log(fails ? "\nattest-selfcheck: " + fails + " FAILED" : "\nattest-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
