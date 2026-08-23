// WebGLEngine/tools/ship/toolFrontDoor-selfcheck.mjs
//
// Run: node tools/ship/toolFrontDoor-selfcheck.mjs   (555s -- MEASURED at v3853 on an idle box, stopwatch)
// Gated by tools/ship/selfchecks.mjs (auto-discovered), with a MEASURED budget entry in gateBudget.mjs.
//
// *** v3853 -- THIS LINE SAID "~25s -- MEASURED" AND THE GATE TAKES NINE MINUTES. *** It spawns every
// reporting tool in the registry, and that registry has grown for six hundred versions while the number
// beside it did not. AT 555s AGAINST gateBudget's 143s DEFAULT IT WAS BEING KILLED IN THE FAST SUITE --
// and NEVER RUN IS DISTINCT FROM PASS (verify.mjs's own words), so nothing in the suite was reporting
// the two failures it was carrying. THE RED WAS INVISIBLE BECAUSE THE GATE THAT WOULD HAVE SHOWN IT
// COULD NOT FINISH. Measured, and recorded in gateBudget.MEASURED where a number can be contradicted by
// a re-measure instead of quietly outliving its subject -- which is exactly what this line did.
//
// v3853 also HALVED THE SPAWNS: every tool used to run twice, once per assertion in section 1, and the
// two runs were never compared. One run, two assertions -- cheaper, and a stricter claim.
//
// v3219 -- *** EIGHT ANALYSIS TOOLS PRINTED NOTHING AND EXITED 0. ***
//
// AN EMPTY REPORT AND A TOOL THAT NEVER RAN ARE INDISTINGUISHABLE FROM A SHELL. `node tools/ship/orphanScan.mjs`
// returning silently with status 0 reads as a clean bill -- no orphans, all well -- when what actually happened
// is that the file defined some functions and ended. The record named two of these (decisionIndex,
// gradedCoverage); running every candidate found EIGHT.
//
// *** AND IT IS THE SAME EIGHT graveyard-selfcheck REPORTS AS ORPHANED UTILITIES. *** Not a coincidence and not
// two problems: a tool whose only consumer is its own gate has no front door, and a tool with no front door
// never grows one, because nothing ever runs it and notices it says nothing. ONE MAIN BLOCK ANSWERS BOTH -- it
// becomes usable by a person, and it acquires a caller that is not a test.
//
// KEITH'S LAW, WHICH THIS IS: EVERY TOOL NEEDS A FRONT DOOR. A MODULE WITH NO CALLER IS UNFINISHED.
//
// WHAT THIS DOES NOT CLAIM. A main block is the CLI half of that law and not the whole of it -- the standing
// preference is a page, or a route with an HTML front end. These print to a terminal. That is a real
// improvement over silence and it is not the finished article, and saying so here is cheaper than somebody
// later discovering the gate was satisfied by less than the rule asks for.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
// v3546 -- a REPORT line, which is how a census is stated. A count that is reported cannot be mistaken for a
// count that is guarded, and this section exists because one was.
const report = (n, d) => console.log("  ----  " + n + (d ? "   " + d : ""));

// v3220 -- *** THE LIST MOVED OUT OF THIS GATE BEFORE THERE WERE TWO OF IT. *** A page now offers the same
// tools, and a second copy of the registry is the defect this session has found in nine files (MODES), three
// (the gate-file walk) and four (a mesher's liveness). THE SECOND COPY IS NEVER THE ONE THAT GETS UPDATED, so
// tools/ship/reportingTools.mjs is the one definition and both the gate and the bridge read it.
import { REPORTING, NO_MAIN, PAGE_DOOR, isReportingTool, ARTEFACT_TOOLS, artefactTool } from "./reportingTools.mjs";
import { scaled } from "./hostScale.mjs";
import { referenceGraph } from "./moduleRefs.mjs";   // v3546 -- ASK THE THING THAT WALKS, never a path prefix
const SHOULD_REPORT = REPORTING.map((t) => t.rel);

// ---- 1. EVERY TOOL THAT SHOULD REPORT, REPORTS -------------------------------------------------------------------
{
    // *** v3853 -- EVERY TOOL RAN TWICE, ONCE PER ASSERTION, AND THE TWO RUNS WERE NEVER COMPARED. ***
    // The two checks below ask different questions of THE SAME OUTPUT, and each used to spawn its own copy of
    // every tool: 62 tools became 124 processes, and orphanTriage alone walks the whole tree. That is half of
    // this gate's wall clock spent re-deriving output it already had.
    //
    // AND IT WAS NOT MERELY WASTEFUL, IT WAS WEAKER. Two runs are two samples: a tool could print on one and
    // not the other, and the gate would report "prints something: PASS" beside "names itself: FAIL" with no
    // way to tell a naming defect from a flake. ONE RUN, TWO ASSERTIONS, is both cheaper and a stricter claim
    // -- the second check now grades the exact bytes the first one graded.
    // *** v3941 -- TWO DEFECTS IN THREE LINES, AND KEITH'S BOX FOUND BOTH.
    //
    // (1) THE CAP WAS A BARE 120000 MEASURED ON ONE MACHINE. physics/thermal/stefan.mjs takes 59s here and
    // ~195s on a box a third the speed, so it was killed at the cap and REPORTED AS A BROKEN TOOL. It is not
    // broken; it is slow, and this gate had no idea the difference existed. The cap now goes through the same
    // hostScale the whole suite uses, so a slower box gets a longer cap instead of a false accusation.
    //
    // (2) *** "exit null" IS NOT AN EXIT CODE, AND THE GATE PRINTED IT AS ONE. *** A process killed by SIGTERM
    // has status null; the report read "NONZERO EXIT: physics/thermal/stefan.mjs (exit null)", which sends the
    // reader hunting a crash in a tool that ran perfectly and was simply cut off. A TIMEOUT AND A FAILURE ARE
    // DIFFERENT DIAGNOSES -- the same distinction selfchecks.mjs keeps between timedOut and a failure, and
    // rigRunner between KILLED and an exit code. Both still FAIL, because a tool that cannot finish inside the
    // cap has not shown that it prints; they just stop being the same finding.
    // scaled() hands back {ms, scale, why} -- the REASON travels with the number, because a cap that moved
    // and cannot say why is the unexplained budget this suite spent a round replacing.
    const CAP = scaled(120000), TOOL_CAP_MS = CAP.ms;
    const out = new Map(), silent = [], broken = [], slow = [];
    for (const rel of SHOULD_REPORT) {
        let text = "";
        try { text = execFileSync(process.execPath, [rel], { cwd: ROOT, encoding: "utf8", timeout: TOOL_CAP_MS }); }
        catch (e) {
            if (e && (e.code === "ETIMEDOUT" || e.signal)) slow.push(rel + " (killed at " + Math.round(TOOL_CAP_MS / 1000) + "s)");
            else broken.push(rel + " (exit " + (e && e.status) + ")");
            continue;
        }
        out.set(rel, String(text));
        if (!String(text).trim()) silent.push(rel);
    }
    ok("!! *** every analysis tool that should report, PRINTS SOMETHING when you run it ***",
        silent.length === 0 && broken.length === 0 && slow.length === 0,
        SHOULD_REPORT.length + " tools run directly, ONCE EACH, capped at " +
        Math.round(TOOL_CAP_MS / 1000) + "s (120s x host " + CAP.scale.toFixed(2) + " -- " + CAP.why + "). " +
        (silent.length ? "SILENT: " + silent.join(", ") + ". " : "") +
        (broken.length ? "NONZERO EXIT: " + broken.join(", ") + ". " : "") +
        (slow.length ? "KILLED AT THE CAP, WHICH IS NOT AN EXIT CODE: " + slow.join(", ") +
                       " -- these RAN, they did not finish, and a longer cap or a faster tool is the fix " +
                       "rather than a bug hunt. " : "") +
        "EXIT 0 WITH NO OUTPUT READS AS A CLEAN BILL -- `node tools/ship/orphanScan.mjs` saying nothing looks " +
        "exactly like a tree with no orphans, and it meant the file had defined some functions and ended");

    // OVER-ESCAPED ON THE FIRST WRITE: "\\[" is the three-character string \\[ , so the regex hunted a
    // literal BACKSLASH followed by a bracket and matched nothing. The check failed on five tools that were
    // all printing their name correctly. This project's own list of recurring first-measurement errors has
    // "over-escaping a regex" on it; here it is again, in the gate written to stop tools lying about what
    // they did.
    const unnamed = [...out.keys()].filter((rel) =>
        !new RegExp("\\[" + path.basename(rel, ".mjs") + "\\]").test(out.get(rel)));
    ok("...and each one names ITSELF in its output, so a piped log says which tool spoke",
        unnamed.length === 0 && broken.length === 0 && slow.length === 0,
        // *** v3853 -- THIS FAILED WITHOUT SAYING WHO, WHICH IS THE DEFECT THIS ROUND CAME HERE TO FIX. ***
        // The line printed only its rationale, so the red beside it was read off the check ABOVE and the
        // record recorded ONE name where there were nine. A failing check that will not name its offenders
        // makes the reader guess, and the reader guessed short for hundreds of versions.
        (unnamed.length ? "NOT NAMING THEMSELVES: " + unnamed.join(", ") + ". " : "") +
        "a report with no name on it is unattributable the moment two of them share a terminal");
}

// ---- 2. THE ABSENCES ARE DECISIONS, NOT GAPS ----------------------------------------------------------------------
{
    const wrong = [...NO_MAIN.keys()].filter((rel) => {
        let src; try { src = noComments(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { return true; }
        return /import\.meta\.url === pathToFileURL/.test(src);
    });
    ok("!! the tools deliberately WITHOUT a front door still have none, and each carries its reason",
        wrong.length === 0 && [...NO_MAIN.values()].every((v) => v.length > 40),
        NO_MAIN.size + " named absences, and as of v3853 they are TWO refusals rather than one. (1) INJECTION: " +
        "a tool that takes its corpus or its registry FROM THE CALLER cannot grow a main block without picking " +
        "one, and picking one is how a tool starts disagreeing with the gate that uses it. (2) THE PAGE IS THE " +
        "DOOR: " + PAGE_DOOR.size + " of them are imported by a browser page, so they may carry no node: " +
        "specifier -- and a main block needs node:url. THIS LINE SAID ONLY (1) WHILE NINE ENTRIES BELONGED TO " +
        "(2), which is a reason that had quietly stopped describing its own list" +
        (wrong.length ? ". UNEXPECTED MAIN BLOCK IN: " + wrong.join(", ") : ""));

    ok("...and this list is NAMED rather than discovered, on purpose",
        SHOULD_REPORT.length + NO_MAIN.size >= 8,
        "discovery answers 'does this file exist'; whether a file SHOULD be runnable is a judgement per tool, " +
        "and a discovered list would have demanded a main block from a per-file primitive and been wrong");
}

// ---- 3. WHO ACTUALLY CONSUMES A REPORTING TOOL -- ASKED OF THE RESOLVER, NOT OF A PATH ---------------------------
{
    // *** THIS SECTION ASSERTED AN EQUALITY THAT WAS A COINCIDENCE, AND TESTED IT WITH THE WRONG INSTRUMENT.
    // v3546 FOUND IT RED AND THE HANDOFF HAD RECORDED IT AS A TIMEOUT FOR SIX VERSIONS. *** Two defects, and
    // the second is the one worth keeping:
    //
    //   (1) THE DENOMINATOR WAS THE WHOLE REGISTRY, WHICH GROWS EVERY ROUND. The old line read
    //       `overlap.length === SHOULD_REPORT.length` with SHOULD_REPORT = every REPORTING entry. It was true
    //       of the batch the round that wrote it had just given front doors to, and A ROUND'S OUTCOME FROZEN
    //       AS AN EXPECTATION is this tree's most-committed defect. It went red the moment v3541 registered
    //       physics/sph/materialKnobs.mjs -- the first reporting tool that is not under tools/ -- and the
    //       fluid arc has added five more since. THE REGISTRY WAS RIGHT AND THE CHECK WAS STALE.
    //
    //   (2) *** AND IT NEVER ASKED graveyard ANYTHING. *** The claim is about which tools graveyard calls
    //       orphaned utilities; the test was `/^tools\//.test(rel)` -- A PATH PREFIX. A WIRING CLAIM IS A FACT
    //       ABOUT THE IMPORT GRAPH WRITTEN DOWN IN PROSE WHERE NOTHING RE-DERIVES IT (v3331-v3372, twelve
    //       instances), and ASK THE THING THAT WALKS. Asked properly, the prefix is not even a proxy: it
    //       counts 18 where the resolver splits the same 24 THREE ways.
    //
    // SO THE COUNTS ARE REPORTED AND NOT ASSERTED. A census is not debt, and freezing this split would pin
    // the very thing progress is supposed to move -- a tool gaining a real caller LEAVES the protected set,
    // which is good news that a frozen count would report as a failure.
    const isGate = (f) => /-selfcheck\.mjs$/.test(f);
    const all = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d)) {
            if (e === "node_modules" || e.startsWith(".")) continue;
            const q = path.join(d, e);
            let st; try { st = fs.statSync(q); } catch { continue; }
            if (st.isDirectory()) walk(q); else if (/\.(js|mjs|html)$/.test(e)) all.push(q);
        }
    })(ROOT);
    const text = new Map(all.map((f) => { try { return [f, fs.readFileSync(f, "utf8")]; } catch { return [f, ""]; } }));
    // THE SAME CALL graveyard-selfcheck MAKES, EXCLUSIONS INCLUDED -- one resolver, fixture-proven by
    // moduleRefs-selfcheck on a synthetic tree with a known answer, because the real tree has no answer key.
    // A SECOND COPY OF THIS DERIVATION WOULD BE THE TWO-DECLARATIONS DEFECT IN THE GATE THAT NAMES IT.
    const REFS = referenceGraph(all, (f) => text.get(f) || "", ROOT, {
        exclude: new Set([path.join(ROOT, "tools/ship/unwiredRegister.mjs"),
                          path.join(ROOT, "tools/ship/referenceKind-selfcheck.mjs")]),
    });
    const classify = (rel) => {
        const from = (REFS.refs.get(path.join(ROOT, rel)) || []).map((r) => r.from);
        if (from.length === 0) return "no-reference";
        return from.every(isGate) ? "gate-only" : "has-caller";
    };
    const split = { "no-reference": [], "gate-only": [], "has-caller": [] };
    for (const rel of SHOULD_REPORT) split[classify(rel)].push(rel);

    report("the reporting registry by WHO REFERENCES IT (resolver, not path)",
        Object.entries(split).map(([k, v]) => k + " " + v.length).join("   ") +
        "   of " + SHOULD_REPORT.length + "   -- the old path prefix counted " +
        SHOULD_REPORT.filter((rel) => /^tools\//.test(rel)).length + " and is not a proxy for any of them");

    // *** THE INSTRUMENT IS FIXTURE-PROVEN BEFORE ITS NUMBER IS BELIEVED. *** Three synthetic cases with a
    // known answer, driven through the SAME classify() the census uses -- so a census that silently stopped
    // discriminating could not read as a clean bill (v3177's shape, and the reason moduleRefs itself is
    // proven on a synthetic tree first).
    const gateOnlyCase = SHOULD_REPORT.find((r) => classify(r) === "gate-only");
    const hasCallerCase = SHOULD_REPORT.find((r) => classify(r) === "has-caller");
    const noRefCase = SHOULD_REPORT.find((r) => classify(r) === "no-reference");
    ok("!! the classifier discriminates -- all three outcomes are REACHED, not just declared",
        gateOnlyCase && hasCallerCase && noRefCase,
        "gate-only e.g. " + gateOnlyCase + ";  has-caller e.g. " + hasCallerCase +
        ";  no-reference e.g. " + noRefCase + ". A THREE-WAY SPLIT THAT ONLY EVER RETURNS ONE VALUE IS A DEAD " +
        "CHECK, and the old line could not have told the difference because it never called a resolver at all");
    ok("...and a has-caller case names a real non-gate importer, so the class is not an artefact",
        (REFS.refs.get(path.join(ROOT, hasCallerCase)) || []).some((r) => !isGate(r.from)),
        "driven: " + (REFS.refs.get(path.join(ROOT, hasCallerCase)) || []).filter((r) => !isGate(r.from))
            .map((r) => path.relative(ROOT, r.from).split(path.sep).join("/")).slice(0, 3).join(", "));

    // *** v3853 -- NINE ENTRIES IN NO_MAIN SAY "THE PAGE IS THE DOOR", AND UNTIL THIS CHECK THAT WAS PROSE. ***
    //
    // The reason those nine carry is a WIRING CLAIM -- statistical-mechanics.html imports eight of them, ct.html
    // the ninth -- and the comment twenty lines above this one is the tree's verdict on wiring claims written in
    // prose: nothing re-derives them, twelve instances, ASK THE THING THAT WALKS. So the page is a FIELD on the
    // row (reportingTools' PAGE_DOOR, derived from the same rows as the sentences so the two cannot drift), and
    // it is asked of THE SAME RESOLVER the census above uses -- not of a substring search over the page, which
    // is a mention test and would pass on a commented-out import.
    //
    // WHAT THIS PROTECTS: these nine were moved OUT of the "should print" list on the strength of having a
    // better door. IF THE PAGE EVER STOPS IMPORTING ONE, IT HAS NO DOOR AT ALL and the exemption becomes the
    // silence it was granted to avoid -- the exact failure this gate exists for, wearing the fix's clothes.
    const doorless = [], doorNodeImport = [];
    for (const [rel, page] of PAGE_DOOR) {
        const from = (REFS.refs.get(path.join(ROOT, rel)) || []).map((r) => r.from);
        if (!from.includes(path.join(ROOT, page))) doorless.push(rel + " -> " + page);
        // AND THE OTHER HALF OF THE REASON, which is what makes the CLI impossible rather than merely absent.
        let src = ""; try { src = noComments(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { /* handled */ }
        if (/from\s*["']node:/.test(src)) doorNodeImport.push(rel);
    }
    ok("!! *** every 'THE PAGE IS THE DOOR' reason is ASKED OF THE RESOLVER, never just asserted ***",
        doorless.length === 0,
        PAGE_DOOR.size + " page-door entries, each re-derived through the same referenceGraph the census above " +
        "uses" + (doorless.length ? ". PAGE DOES NOT IMPORT: " + doorless.join(", ") : "") +
        ". These nine left the 'should print' list because they have the door this rule PREFERS; a claim that " +
        "buys an exemption has to be re-derived, or the exemption outlives the fact that earned it");

    ok("...and each one really cannot have a main block -- NO `node:` specifier, checked through codeOnly",
        doorNodeImport.length === 0,
        (doorNodeImport.length ? "HAS A node: IMPORT: " + doorNodeImport.join(", ") + ". " : "") +
        "the reason is not 'nobody wrote one', it is that a main block needs node:url for the pathToFileURL " +
        "comparison the Windows path law (v2759) requires, and a browser cannot resolve node:url. A FILE THAT " +
        "COULD carry one is not exempt -- it is unfinished, and belongs back in REPORTING");

    // *** THE PROPERTY, AND IT IS THE ONE THE ROUND ACTUALLY ESTABLISHED. *** A tool nothing imports has no
    // caller to notice its silence, so it is exactly the population the front-door law exists for. Section 1
    // RUNS every registered tool and demands output; this asserts that the unprotected population is a SUBSET
    // of what section 1 covers, which is what makes the law reach the tools that need it rather than the ones
    // that happen to be easy. It fails the day somebody registers a tool section 1 does not run.
    const unprotected = [...split["no-reference"], ...split["gate-only"]];
    ok("!! *** every tool with no non-gate consumer is one section 1 RUNS AND DEMANDS OUTPUT FROM ***",
        unprotected.every((rel) => SHOULD_REPORT.includes(rel)),
        unprotected.length + " of " + SHOULD_REPORT.length + " have no importer outside a gate -- nothing " +
        "would ever notice them going quiet. THAT IS WHY THE LAW IS 'A MODULE WITH NO CALLER IS UNFINISHED' " +
        "AND NOT 'MOST MODULES SHOULD BE RUNNABLE'. *** WHEN ONE OF THESE GAINS A REAL CALLER IT LEAVES THIS " +
        "SET AND THE REPORTED COUNTS MOVE -- THAT IS PROGRESS. DO NOT RE-PIN THE COUNTS TO KEEP THEM STILL, " +
        "AND DO NOT RESTORE THE PATH-PREFIX EQUALITY THIS SECTION REPLACED. ***");

    // *** AT v3548 THE TWO COUNTS HAPPENED TO COINCIDE (18 AND 18) WHILE THE MEMBERSHIP DIFFERED -- AND v3549
    // IS THE PROOF THAT THE COINCIDENCE WAS NEVER THE PROPERTY. *** wideTilt.mjs (v3549) joined the resolver's
    // gate-only-outside-tools/ population the same way packingTransfer.mjs and stability.mjs did, so the two
    // counts now DIVERGE (18 against 21) as well as differing in membership. A CHECK THAT ASSERTED THE COUNTS
    // MATCH WOULD HAVE GONE RED THE MOMENT A LEGITIMATE MODULE WAS ADDED -- exactly the shape this tree names
    // as its most common defect (a gate pinned to an arrangement rather than the property). THE PROPERTY IS
    // AND ALWAYS WAS THAT THE PREFIX IS NOT A PROXY FOR THE RESOLVER'S SET: it can miss members (gate-only
    // physics modules it never looks at) or claim members that turn out to have a real caller, REGARDLESS OF
    // WHETHER THE SIZES HAPPEN TO MATCH. Rewritten to the property rather than re-pinned to a new pair of
    // numbers, which is the mistake this line existed to prevent from being made about ITSELF.
    const prefixSet = new Set(SHOULD_REPORT.filter((rel) => /^tools\//.test(rel)));
    const onlyPrefix = [...prefixSet].filter((r) => !unprotected.includes(r));
    const onlyReal = unprotected.filter((r) => !prefixSet.has(r));
    ok("!! *** THE PREFIX IS NOT A PROXY FOR THE RESOLVER'S SET, WHATEVER THE COUNTS DO ***",
        onlyPrefix.length > 0 && onlyReal.length > 0,
        onlyPrefix.length + " in the prefix that have a real caller (" + onlyPrefix.join(", ") + ") and " +
        onlyReal.length + " gate-only outside tools/ the prefix cannot see (" + onlyReal.join(", ") + "), " +
        "of prefix " + prefixSet.size + " against resolver " + unprotected.length + ". *** THE COUNTS AGREEING " +
        "AT v3548 WAS A COINCIDENCE OF THAT MOMENT, NOT THE PROPERTY -- DO NOT RE-PIN THIS TO WHATEVER PAIR OF " +
        "NUMBERS THE TREE SHOWS TODAY. If a future change ever makes onlyPrefix and onlyReal BOTH EMPTY (the " +
        "sets truly coincide, member for member), DELETE THIS LINE, because then the prefix really would be a " +
        "proxy and the point would have expired. ***");

    // *** AND graveyard'S COUNT IS CORRECT AND MUST NOT BE "FIXED" BY THIS ROUND. *** "Can be run" and "has a
    // caller" are different properties. A main block calls the function from inside its own file, which is not
    // an importer, and a tools-page SPAWN is not an import either -- so a front door never moves graveyard's
    // number. Changing a classifier to make a number you just moved look better is how a ratchet stops
    // meaning anything.
    const probe = path.join(ROOT, "tools", "ship", "decisionIndex.mjs");
    const src = fs.readFileSync(probe, "utf8");
    ok("...and the main block is what makes the difference, shown rather than asserted",
        /import\.meta\.url === pathToFileURL\(process\.argv\[1\] \|\| ""\)\.href/.test(src) &&
        classify("tools/ship/decisionIndex.mjs") === "no-reference",
        "decisionIndex HAS the exact ESM main-module guard AND STILL RESOLVES TO ZERO REFERENCES -- it is " +
        "reached only by being SPAWNED. The guard is what keeps importing it silent and running it loud; a " +
        "tool that printed on import would make every gate that uses it noisy, which is how a main block gets " +
        "deleted again");
}

// ---- 4. THE PAGE, WHICH IS THE HALF THE LAW ACTUALLY ASKS FOR -----------------------------------------------------
{
    const bridge = noComments(fs.readFileSync(path.join(ROOT, "ai-bridge", "toolsBridge.js"), "utf8"));
    const server = noComments(fs.readFileSync(path.join(ROOT, "ai-bridge", "server.js"), "utf8"));
    const page = fs.readFileSync(path.join(ROOT, "tools.html"), "utf8");
    const ui = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");

    ok("!! *** the tools have a PAGE, not just a terminal ***",
        /tools\.html/.test(ui) && /\/tools\/list/.test(page) && /\/tools\/run/.test(page) &&
        /toolsBridge\.owns/.test(server),
        "v3219 gave five silent tools a main block and said out loud that a main block is only the CLI half of " +
        "the law. tools.html is linked from server.html, the bridge is dispatched, and the reports arrive in a " +
        "browser. A MODULE WITH NO CALLER IS UNFINISHED, and so is one whose only caller is a person who " +
        "already knows the path");

    ok("!! *** it SPAWNS THROUGH gatesBridge rather than writing a second spawner ***",
        /require\("\.\/gatesBridge\.js"\)/.test(bridge) && /gates\.runGate\(/.test(bridge) &&
        !/execFile|spawn\(/.test(bridge),
        "runGate already carries the live-child counter the updater consults (v3075), the timedOut flag kept " +
        "APART from a failure (v3076), the budget travelling with the result (v3212) and a bounded stdout. A " +
        "SECOND IMPLEMENTATION WOULD DRIFT FROM ALL FOUR IN SILENCE -- this tree has paid for duplicate " +
        "implementations of one job repeatedly, and spawning is the last place to repeat it");

    ok("!! *** only a REGISTERED tool can be run, by exact name ***",
        /isReportingTool\(name\)/.test(bridge) && /not-a-tool/.test(bridge),
        "not a path, not a pattern, not anything the page composed -- the same refusal gatesBridge makes for " +
        "selfchecks, and the reason transfers without change: a route that executes a filename out of a query " +
        "string is an arbitrary script runner wearing a tool's name");

    ok("!! ...and the REFUSALS are on the page beside the offers",
        /noFrontDoor/.test(bridge) && /noFrontDoor/.test(page) && NO_MAIN.size >= 3,
        NO_MAIN.size + " tools deliberately have no main block. A PAGE THAT LISTED ONLY WHAT IT CAN RUN would " +
        "make three decisions look like three gaps, and the next person writes the code three earlier rounds " +
        "decided against");

    ok("...and the registry has ONE definition, read by both the gate and the bridge",
        /reportingTools\.mjs/.test(bridge) &&
        /reportingTools\.mjs/.test(noComments(fs.readFileSync(path.join(HERE, "toolFrontDoor-selfcheck.mjs"), "utf8"))),
        "the list lived in THIS GATE at v3219 and the page needed the same one. IT MOVED OUT BEFORE THERE WERE " +
        "TWO OF IT rather than after -- MODES was in nine files, the gate-file walk in three, a mesher's " +
        "liveness in four, and THE SECOND COPY IS NEVER THE ONE THAT GETS UPDATED");
}

// ---- 5. A MAIN BLOCK MUST SUPPLY EVERY ARGUMENT ITS FUNCTION DECLARES -----------------------------------------------
{
    // *** v3219 GAVE A TOOL A VOICE AND IT SAID SOMETHING FALSE, WHICH IS WORSE THAN SILENCE. ***
    // orphanBaselineHygiene(engRoot, liveCandidates) was called with engRoot alone. `new Set(undefined)` is an
    // EMPTY SET rather than an error, so the report came back "9 of 9 baseline entries STALE, 0 live" -- with
    // total confidence, and I published it twice. THE TRUTH WAS THE EXACT INVERSE: all nine suppressions are
    // still holding a live orphan.
    //
    // AND THE WRONG ANSWER POINTED AT DELETING THE RIGHT FILES: render/SSAOPass.js and simulation/SpatialHash.js
    // are in that baseline BECAUSE a sweep deleted them once and orphanScan caught it by hand. Clearing them as
    // stale debt would have un-protected both.
    //
    // A SILENT TOOL TELLS YOU NOTHING; A CONFIDENT WRONG ONE SENDS YOU TO DELETE SOMETHING. So the arity is now
    // MECHANICALLY CHECKED rather than left to whoever writes the next main block -- fn.length is the count of
    // declared parameters before the first default, which is exactly "what this function requires".
    const shortCalls = [];
    for (const t of REPORTING) {
        const mod = await import(pathToFileURL(path.join(ROOT, t.rel)).href);
        const fn = Object.values(mod).find((v) => typeof v === "function" && v.length > 0);
        if (!fn) continue;
        const src = noComments(fs.readFileSync(path.join(ROOT, t.rel), "utf8"));
        // the LAST call of that function in its own file is the main block's
        const calls = [...src.matchAll(new RegExp("\\b" + fn.name + "\\s*\\(([^)]*)\\)", "g"))];
        const last = calls[calls.length - 1];
        if (!last) continue;
        const supplied = last[1].trim() ? last[1].split(",").length : 0;
        if (supplied < fn.length) shortCalls.push(t.rel + ": " + fn.name + " declares " + fn.length + ", main block passes " + supplied);
    }
    ok("!! *** every main block passes every argument its function DECLARES ***",
        shortCalls.length === 0,
        shortCalls.length ? shortCalls.join("; ") + " -- A MISSING ARGUMENT IS NOT AN ERROR IN JAVASCRIPT, it is " +
                            "undefined, and a tool that treats undefined as a legitimate input answers a question " +
                            "nobody asked"
                          : REPORTING.length + " tools checked against their own fn.length. THE ONE THAT FAILED " +
                            "THIS REPORTED THE INVERSE OF THE TRUTH AND I PUBLISHED IT TWICE");

    // A CLAIM ABOUT ABSENCE MUST BE SHOWN FAILING, and the adversarial input is derived from the defect itself.
    const H = await import(pathToFileURL(path.join(ROOT, "tools/ship/baselineHygiene.mjs")).href);
    let refused = false;
    try { H.orphanBaselineHygiene(ROOT); } catch { refused = true; }
    ok("!! ...and the tool that was mis-called now REFUSES instead of inferring",
        refused,
        "\"I was not told\" and \"nothing is live\" are opposite claims and a Set constructor collapses them " +
        "silently. deviceModeTable refuses a zero-device table and recoverable() refuses a zero-archive index -- " +
        "both written after this same mistake in this same tree. THIS ONE HAD TO MAKE IT A THIRD TIME");
}

// ---- 6. TOOLS THAT PRODUCE A FILE ------------------------------------------------------------------------------------
{
    const bridge = noComments(fs.readFileSync(path.join(ROOT, "ai-bridge", "toolsBridge.js"), "utf8"));
    const page = fs.readFileSync(path.join(ROOT, "tools.html"), "utf8");

    ok("!! *** an artefact tool's FLAGS come from the registry, never from the query string ***",
        /artefactTool\(name\)/.test(bridge) && /art \? art\.args : undefined/.test(bridge) &&
        !/searchParams\.get\("args"\)/.test(bridge),
        "a route that accepted arguments from a caller would be an ARBITRARY COMMAND RUNNER WEARING A TOOL'S " +
        "NAME -- the refusal gatesBridge already makes about filenames, one argument further out. Driven " +
        "directly, ?args=--rm-rf is ignored because the parameter is never read");

    ok("!! ...and the download link is only offered after a run that SUCCEEDED",
        /exitCode === 0 && where/.test(noComments(page)),
        "a permanent link to /corpus.txt would happily serve LAST WEEK'S FILE after a failed build. THE " +
        "STALE-ARTEFACT TRAP: an artefact that exists and an artefact that is current are different claims");

    ok("!! ...and five megabytes is LINKED rather than rendered",
        /artefacts/.test(page) && !/pre\.textContent = String\(r\.output\).*artefact/.test(page),
        ARTEFACT_TOOLS.length + " artefact tool(s). Pasting a 5 MB corpus into the DOM would hang the tab, and a " +
        "TRUNCATED render would be worse -- a corpus you cannot tell is truncated is precisely the failure the " +
        "tool exists to prevent, since a short one and a complete one look identical from the consuming end");

    ok("...and corpus.mjs is a DRY RUN by default, which is why it never needed a main block from me",
        /--write/.test(noComments(fs.readFileSync(path.join(ROOT, "tools", "ship", "corpus.mjs"), "utf8"))),
        "I went to give this tool a front door and THE ASSERT STOPPED ME BECAUSE IT ALREADY HAD ONE, with a " +
        "dry-run default that is more careful than the main block I was about to write. THREE OF THE FOUR " +
        "unwiredRegister ENTRIES HAVE NOW BEEN WRONG ON INSPECTION, and all three were written from the import " +
        "graph and the file's name rather than from running the thing");
}

// ---- 7. THE BRIDGE OWNS ROUTES, NOT A NAMESPACE (v3244) ----------------------------------------------------------------
{
    const bridgeSrc = noComments(fs.readFileSync(path.join(ROOT, "ai-bridge", "toolsBridge.js"), "utf8"));
    const mod = await import(pathToFileURL(path.join(ROOT, "ai-bridge", "toolsBridge.js")).href).catch(() => null);
    const B = mod && (mod.default || mod);

    ok("!! *** a real file under /tools/ is NOT claimed by the bridge ***",
        !/startsWith\(PREFIX \+ "\/"\)/.test(bridgeSrc) && /ROUTES\.includes/.test(bridgeSrc),
        "this claimed the whole /tools namespace at v3220 and SWALLOWED server.html's import of " +
        "./tools/ship/pageSections.mjs at v3227 -- seven rounds during which a FAILED IMPORT KILLED THE WHOLE " +
        "MODULE SCRIPT and the page drawers, chip groups, profile filter and front-door menu were all inert. " +
        "tools/ IS THE TREE'S BIGGEST DIRECTORY and the static handler serves it perfectly well");

    ok("!! ...and the routes it DOES own still answer",
        !!B && ["/tools", "/tools/list", "/tools/run?name=x"].every((u) => B.owns(u)) &&
        !["/tools/ship/pageSections.mjs", "/tools/render-qa/manifest.json"].some((u) => B.owns(u)),
        "driven, not read: the four routes are listed rather than pattern-matched, so a new route is a " +
        "DELIBERATE LINE and everything else falls through to the static handler where it belongs");

    ok("!! ...and server.html's import target is a file that exists",
        fs.existsSync(path.join(ROOT, "tools", "ship", "pageSections.mjs")) &&
        /tools\/ship\/pageSections\.mjs/.test(fs.readFileSync(path.join(ROOT, "server.html"), "utf8")),
        "THE PAGE LOOKED FINE THE WHOLE TIME: Arriving still showed all 96 links, because the mover that " +
        "empties it lives in the script that never ran. 'The drawers do nothing' and 'the drawers were never " +
        "built' rendered identically, and ONE CONSOLE LINE WAS THE ONLY EVIDENCE");
}

console.log();
console.log("  ----  NOT DONE, AND IT IS THE HALF KEITH'S LAW ACTUALLY ASKS FOR: these print to a TERMINAL.");
console.log("  ----  The standing preference is a PAGE, or a route with an HTML front end. Five reports that");
console.log("  ----  nobody can press a button for are better than five silences and are not the finished");
console.log("  ----  article. The shape is known -- gatesBridge already spawns a named file and returns its");
console.log("  ----  output -- so a tools page is a small round rather than an open question.");
if (fails) { console.log("toolFrontDoor-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("toolFrontDoor-selfcheck: all checks pass");
