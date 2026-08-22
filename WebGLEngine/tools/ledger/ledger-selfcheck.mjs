// tools/ledger/ledger-selfcheck.mjs
//
// Run: node tools/ledger/ledger-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The ledger's whole value is telling apart an INTENDED change from a REGRESSION, and never letting a green come
// from a result nobody computed. So the spine is: same content-key + different result hash => REGRESSION (a bug or a
// cross-arch divergence), while a different key (source changed) => NEW (expected). The sabotage strips the source
// out of the key -- keying by name alone -- and shows an intended change is then misread as a regression, which is
// exactly why the key is content-addressed. Plus: the ledger never fabricates a verdict for a result you did not
// hand it (compare, never skip), and merging two machines' ledgers surfaces disagreement with provenance intact.
import { keyFromContent, emptyLedger, record, compareToLedger, mergeLedgers } from "./ledger.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. CONTENT-ADDRESSED KEY: unchanged source -> same key; changed source -> different key ------------------
{
    const k1 = keyFromContent("md-forcefield", "SOURCE_A", "SCENARIO");
    const k1again = keyFromContent("md-forcefield", "SOURCE_A", "SCENARIO");
    const kSrcChanged = keyFromContent("md-forcefield", "SOURCE_B", "SCENARIO");   // code edited
    const kScenChanged = keyFromContent("md-forcefield", "SOURCE_A", "SCENARIO2"); // inputs edited
    ok("!! the key is content-addressed (source and scenario both fold in)", k1 === k1again && k1 !== kSrcChanged && k1 !== kScenChanged,
       "identical source+scenario gives the identical key; changing either the subsystem source or the input scenario changes it -- so a code edit re-keys, and cache-invalidation is automatic.");
}

// build a ledger holding one known result for one subsystem
const KEY = keyFromContent("md-forcefield", "SOURCE_A", "SCENARIO");
const seeded = () => { const L = emptyLedger(); record(L, { key: KEY, name: "md-forcefield", resultHash: "HASH_GOOD", machine: "galaxina", arch: "x64", version: "v2657" }); return L; };

// ---- 2. MATCH: same key, same result -> MATCH -----------------------------------------------------------------
{
    const r = compareToLedger(seeded(), [{ key: KEY, name: "md-forcefield", resultHash: "HASH_GOOD" }]);
    ok("!! a fresh result matching the recorded one classifies as MATCH", r.match === 1 && r.regression === 0 && r.neu === 0,
       "same source-key and same result hash -> MATCH: this machine agrees with the recorded baseline.");
}

// ---- 3. THE SPINE -- REGRESSION: same key, DIFFERENT result -> REGRESSION -------------------------------------
{
    const r = compareToLedger(seeded(), [{ key: KEY, name: "md-forcefield", resultHash: "HASH_DIFFERENT" }]);
    const v = r.verdicts[0];
    ok("!! same source-key but a different result is flagged REGRESSION", r.regression === 1 && v.status === "REGRESSION" && v.knownResults.includes("HASH_GOOD"),
       "the source did not change but the result did -- a bug, or a cross-architecture divergence. The ledger names it and lists the known-good hash to diff against.");
}

// ---- 4. NEW (not regression): changed source -> new key -> NEW ------------------------------------------------
{
    const newKey = keyFromContent("md-forcefield", "SOURCE_B", "SCENARIO");   // the code was intentionally edited
    const r = compareToLedger(seeded(), [{ key: newKey, name: "md-forcefield", resultHash: "HASH_NEW" }]);
    ok("!! an intended code change (new key) is NEW, not a regression", r.neu === 1 && r.regression === 0,
       "editing the source changed the key, so the new result is recorded as NEW rather than screamed at as a regression -- the ledger does not punish you for changing code on purpose.");
}

// ---- 5. COMPARE, NEVER SKIP: the ledger never fabricates a verdict for a result you did not compute ----------
{
    const emptyVerdicts = compareToLedger(seeded(), []);                     // handed nothing -> classifies nothing
    const oneToOne = compareToLedger(seeded(), [{ key: KEY, name: "md-forcefield", resultHash: "HASH_GOOD" }, { key: "other", name: "x", resultHash: "h" }]);
    ok("!! every verdict corresponds to a result the caller actually computed", emptyVerdicts.verdicts.length === 0 && oneToOne.verdicts.length === 2,
       "no fresh results in means no verdicts out -- a green can never come from the ledger alone, only from locally-computed results it is asked to classify. Compare, never skip.");
}

// ---- 6. MERGE + PROVENANCE: two machines disagreeing on the same key surfaces a divergence --------------------
{
    const A = emptyLedger(); record(A, { key: KEY, name: "md-forcefield", resultHash: "HASH_X86", machine: "galaxina", arch: "x64", version: "v2657" });
    const B = emptyLedger(); record(B, { key: KEY, name: "md-forcefield", resultHash: "HASH_ARM", machine: "moms-mac", arch: "arm64", version: "v2657" });
    const { merged, divergences } = mergeLedgers(A, B);
    const provCount = Object.values(merged.entries[KEY].results).reduce((n, ps) => n + ps.length, 0);
    ok("!! merging two machines' ledgers keeps provenance and flags cross-machine divergence", divergences.length === 1 && divergences[0].name === "md-forcefield" && provCount === 2,
       "x86_64 and arm64 recorded different hashes under the same source-key: the merge reports one divergence and preserves both machines' provenance -- the persisted, fleet-wide version of the fingerprint comparison.");
}

console.log(fails ? "\nledger-selfcheck: " + fails + " FAILED" : "\nledger-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
