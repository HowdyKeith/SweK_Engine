// WebGLEngine/tools/ship/claimsGate-selfcheck.mjs — v2541
//
// Run: node tools/ship/claimsGate-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE CLAIMS GATE PASSED ON ITS FIRST RUN. That is the most suspicious possible outcome: a gate that has never
// been seen to fail is indistinguishable from a gate that CANNOT fail, which is the exact thing it exists to
// forbid. So these feed it claims that are broken by construction and check it says so.
//
// (It passing was also the honest answer: the claims in predictions.html really are all falsifiable, and every
// settled verdict really does carry a measurement. The gate did not find a bug. It LOCKS THE DOOR -- the next
// unfalsifiable claim does not get in.)
import { extractClaims, judge } from "./claimsGate.mjs";
import { prose } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const page = (claims) => "<script>\nconst CLAIMS = [\n" + claims.map((c) => "  {\n" +
    Object.entries(c).map(([k, v]) => "    " + k + ': "' + String(v).replace(/"/g, '\\"') + '",').join("\n") + "\n  },").join("\n") + "\n];\n</script>";

const GOOD = {
    name: "A well shaped claim",
    since: "v2541",
    state: "open",
    pred: "Something specific will happen.",
    why: "Because of a reason.",
    kill: "A single counterexample measured on the rig kills it outright.",
};

// ---- 1. the parser works on the real page shape ------------------------------------------------------------
{
    const c = extractClaims(page([GOOD]));
    ok("a claim round-trips out of the page", c.length === 1 && c[0].name === GOOD.name && c[0].kill === GOOD.kill);
    ok("...and a good claim has no problems", judge(c).length === 0);
}

// ---- 2. THE LAW: an OPEN claim with no kill is decoration ---------------------------------------------------
{
    const { kill, ...noKill } = GOOD;
    const p = judge(extractClaims(page([noKill])));
    ok("AN OPEN CLAIM WITH NO KILL IS CAUGHT", p.some(([, m]) => /unfalsifiable/.test(m)),
       p.length ? p[0][1].slice(0, 62) : "nothing reported");
}

// ---- 3. a verdict with no evidence is an assertion ----------------------------------------------------------
{
    const settled = { ...GOOD, state: "settled" };
    delete settled.kill;
    const p = judge(extractClaims(page([settled])));
    ok("SETTLED with nothing measured is caught", p.some(([, m]) => /assertion wearing a verdict/.test(m)));
    // ...and a settled claim WITH a measurement is fine, and does NOT need a kill: it already died or survived
    const done = { ...GOOD, state: "settled", measured: "Ran it, got 4.2ms, the prediction said under 5." };
    delete done.kill;
    ok("...but settled WITH a measurement passes", judge(extractClaims(page([done]))).length === 0);
}

// ---- 4. a kill condition that names no test ------------------------------------------------------------------
{
    const lazy = { ...GOOD, kill: "if it fails" };
    const p = judge(extractClaims(page([lazy])));
    ok("a kill too short to name a test is caught", p.some(([, m]) => /too short/.test(m)), '"if it fails"');
}

// ---- 5. the things that make a claim a claim ------------------------------------------------------------------
{
    for (const [drop, pat] of [["pred", /nothing is actually being claimed/], ["since", /cannot go stale/], ["state", /no `state`/]]) {
        const c = { ...GOOD }; delete c[drop];
        ok("a claim with no `" + drop + "` is caught", judge(extractClaims(page([c]))).some(([, m]) => pat.test(m)));
    }
    const weird = { ...GOOD, state: "probably" };
    ok("an invented state is caught", judge(extractClaims(page([weird]))).some(([, m]) => /unknown state/.test(m)));
}

// ---- 6. duplicate names ----------------------------------------------------------------------------------------
{
    const p = judge(extractClaims(page([GOOD, GOOD])));
    ok("two claims with one name is caught", p.some(([, m]) => /duplicate/.test(m)));
}

// ---- 7. THE PARSER MUST NOT SILENTLY FIND NOTHING --------------------------------------------------------------
// The worst outcome for this gate is not a false failure, it is a silent pass: a parser that finds zero claims
// reports "no problems" and the gate becomes theatre. A `pred` containing a ] would end a lazy regex early and
// drop every claim after it -- which is why extractClaims walks brackets instead.
{
    const tricky = { ...GOOD, pred: "An array like [1, 2] appears here, and a brace { too." };
    const c = extractClaims(page([tricky, GOOD]));
    ok("a claim containing ] and { does not eat the rest of the array", c.length === 2,
       "parsed " + c.length + " of 2");
    ok("empty input yields zero claims (the CLI treats that as a FAILURE)", extractClaims("<script>const X = 1;</script>").length === 0);
}

console.log(fails ? "\nclaimsGate-selfcheck: " + fails + " FAILED" : "\nclaimsGate-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
