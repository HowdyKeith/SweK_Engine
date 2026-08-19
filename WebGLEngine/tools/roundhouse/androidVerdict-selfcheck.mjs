// tools/roundhouse/androidVerdict-selfcheck.mjs
//
// Run: node tools/roundhouse/androidVerdict-selfcheck.mjs   (~30 s: synthetic grading + one real scoped run)
//
// v2920 -- THE GRADER IS GRADED BEFORE ANY PHONE MEETS IT. Every rule the verdict claims to enforce is driven
// here with synthetic transcripts where the right answer is known by construction:
//
//   - slow-is-not-wrong: a phone timeout on a graded check must NOT falsify
//   - the-reference-defines-the-set: a check failing on BOTH machines must not appear anywhere in the grading
//   - right-host-or-no-verdict: a glibc "phone" must be refused the bionic claim, however green its checks
//   - falsification-names-the-check: a real disagreement must come back FALSIFIED with the culprit named
//   - the symlink probe grades in BOTH directions, including the one where the prediction was wrong
//
// Then the runner runs FOR REAL on a scoped set, so the artifact format is proven by producing one, not by
// asserting its schema.

import { runSuite, hostFingerprint, detectLibc, discoverChecks } from "./androidRunner.mjs";
import { grade } from "./androidVerdict.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const mkT = (host, checks, probes = null) => ({
    kind: "swek-android-transcript", version: 2920, at: "synthetic", budgetMs: 1000,
    host, probes, checks, counts: {},
});
const glibcHost = { platform: "linux", arch: "x64", node: "v22", libc: "glibc 2.39" };
const bionicHost = { platform: "android", arch: "arm64", node: "v22", libc: "bionic (termux)" };
const C = (name, status) => ({ name, status, ms: 1, exitCode: status === "pass" ? 0 : 1, tail: "" });

// ---- 1. THE GRADING RULES, ON TRANSCRIPTS WHERE THE ANSWER IS KNOWN ------------------------------------------------
{
    const reference = mkT(glibcHost, [C("a", "pass"), C("b", "pass"), C("c", "timeout"), C("d", "fail")]);

    // all graded checks pass on bionic; c and d are outside the graded set entirely
    let v = grade(reference, mkT(bionicHost, [C("a", "pass"), C("b", "pass"), C("c", "fail"), C("d", "fail")]));
    ok("!! the reference defines the graded set", v.gradedSet.length === 2 && v.falsifying.length === 0,
        "c timed out and d failed ON THE REFERENCE, so the phone failing both counts for nothing -- graded set is {a,b}");
    ok("...and matching passes confirm", v.verdicts.roundhouseSelfchecksPassOnBionic.verdict === "CONFIRMED");

    // slow is not wrong
    v = grade(reference, mkT(bionicHost, [C("a", "pass"), C("b", "timeout")]));
    ok("!! a phone timeout on a graded check is EXCLUDED, not falsifying",
        v.verdicts.roundhouseSelfchecksPassOnBionic.verdict === "CONFIRMED" && v.slow.length === 1,
        "a phone is allowed to be slower than a desktop; only disagreement falsifies");

    // a real disagreement
    v = grade(reference, mkT(bionicHost, [C("a", "pass"), C("b", "fail")]));
    ok("!! pass-on-reference + fail-on-phone FALSIFIES, and names the check",
        v.verdicts.roundhouseSelfchecksPassOnBionic.verdict === "FALSIFIED" &&
        /\bb\b/.test(v.verdicts.roundhouseSelfchecksPassOnBionic.why),
        "that is the one shape the suite exists to detect: two machines disagreeing about a physics gate");

    // wrong host
    v = grade(reference, mkT(glibcHost, [C("a", "pass"), C("b", "pass")]));
    ok("!! a glibc transcript is REFUSED the bionic claim, however green",
        v.verdicts.roundhouseSelfchecksPassOnBionic.verdict === "EXCLUDED",
        "a second glibc run confirming glibc is corroboration theatre; the grader will not do it");
}

// ---- 2. THE PROBE CLAIMS, BOTH DIRECTIONS --------------------------------------------------------------------------
{
    const reference = mkT(glibcHost, [C("a", "pass")]);
    const base = [C("a", "pass")];

    let v = grade(reference, mkT(bionicHost, base, { downloadsPresent: true, downloadsIsSymlink: true, downloadsTarget: "/storage/emulated/0/Download", npmInstallOk: true }));
    ok("symlinked ~/Downloads + green install confirm their claims",
        v.verdicts.autoUpdateSymlinksRequired.verdict === "CONFIRMED" && v.verdicts.npmInstallOmitOptionalSucceeds.verdict === "CONFIRMED");

    v = grade(reference, mkT(bionicHost, base, { downloadsPresent: true, downloadsIsSymlink: false, downloadsTarget: null, npmInstallOk: false }));
    ok("!! the grader falsifies in BOTH directions -- including 'zero symlinks were needed'",
        v.verdicts.autoUpdateSymlinksRequired.verdict === "FALSIFIED" && v.verdicts.npmInstallOmitOptionalSucceeds.verdict === "FALSIFIED",
        "a real ~/Downloads directory would mean the registered count of 1 was wrong; a red install would mean the manifest read missed a native step. Both must be reportable or the registration is unfalsifiable");

    v = grade(reference, mkT(bionicHost, base, { downloadsPresent: false, downloadsIsSymlink: false, downloadsTarget: null, npmInstallOk: null }));
    ok("stock termux (no ~/Downloads, no install attempt) is AWAITING, with the next command stated",
        v.verdicts.autoUpdateSymlinksRequired.verdict === "AWAITING" && v.verdicts.npmInstallOmitOptionalSucceeds.verdict === "AWAITING");

    ok("the longitudinal claims are AWAITING every run -- they cannot be quietly forgotten",
        v.verdicts.survivesDozeWithBootWakeLock.verdict === "AWAITING" && v.verdicts.survivesMemoryPressure.verdict === "AWAITING");
}

// ---- 3. THE RUNNER, FOR REAL, SCOPED -------------------------------------------------------------------------------
{
    const t = await runSuite({ only: ["androidPeer", "corroborate"], budgetMs: 60000 });
    ok("!! the runner produces a real transcript from a real run",
        t.kind === "swek-android-transcript" && t.checks.length === 2 && t.checks.every((c) => c.ms > 0),
        t.checks.map((c) => c.name + ":" + c.status + " " + (c.ms / 1000).toFixed(1) + "s").join(", "));
    ok("this host is fingerprinted, libc included",
        !!t.host.libc && t.host.libc === detectLibc(),
        JSON.stringify(hostFingerprint().libc) + " -- the phone transcript will carry 'bionic (termux)' here, and that string is what unlocks grading");
    ok("discovery sees the whole suite", discoverChecks().length >= 30,
        discoverChecks().length + " selfchecks discovered for the full run");
}

console.log("");
console.log(fails === 0 ? "  ALL PASS -- the grader is graded; the phone can now vote" : "  " + fails + " FAILURE(S)");
process.exit(fails ? 1 : 0);
