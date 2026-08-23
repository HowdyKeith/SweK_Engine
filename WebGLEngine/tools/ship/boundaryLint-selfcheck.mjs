// tools/ship/boundaryLint-selfcheck.mjs
//
// Run: node tools/ship/boundaryLint-selfcheck.mjs   (~2.4s — MEASURED v3941, was ~9s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3103 -- A GREEN BUILD IS A SELF-REPORT.
//
// Borrowed from anthony-chaudhary/fak's boundarylint, web-verified this session: "boundary tells" are source
// patterns where the code CLAIMS something about the outside world -- the OS, the network, the clock, a peer
// process -- WITHOUT THE CHECK THAT WOULD MAKE THE CLAIM TRUE. Taken as an idea; fak is a Go binary and this is
// a few screens of JavaScript over a scanner the tree already had.
//
// THE TREE PAID FOR THIS FOUR TIMES IN TWENTY ROUNDS, always the same shape -- a local observation standing in
// for a fact about somewhere else. statSync said PRESENT of a 404 body on disk (v3054). A manifest carried a
// SHA-256 nothing compared the arriving bytes against (v3089). taskkill reported success while the socket was
// still held, and the launcher believed the report (v3096). A heartbeat file meant "listener alive" when the
// listener was gone (v3096).
//
// THE CENSUS IS THE ROUND, AND THE FIRST TWO NUMBERS WERE BOTH WRONG. A crude scan found 58 unchecked fetch
// bodies. Splitting them by HOW THEY FAIL cut it to 5: .json() on an unchecked response THROWS on an HTML error
// body, which is loud and a legitimate design, while .text()/.blob()/.arrayBuffer() RETURN THE ERROR PAGE AS
// DATA. Then two of those five turned out to be fetch() on a data: URL -- WHICH CANNOT 404, and is a local
// decode rather than a network boundary at all. THREE remained.
//
// AND ONE OF THE THREE WAS IN main.js. All three read `await (await fetch(meshUrl)).text()` where meshUrl came
// back from a server response, so a 404 arrived as an HTML document and went straight into the mesh parser --
// the fetch resolved, nothing threw, and the parser got markup. All three now consult .ok and refuse with the
// status, which is the fact the caller needs.
//
// ONE RULE FAILS, THE REST REPORT. A lint that fails on everything it can see gets switched off within a week,
// so only the SILENTLY WRONG tell is a hard failure. The loud one and the too-broad one are counted and printed
// with the reason they are not rules -- which is a claim this file has to keep making honestly, because
// "reported" is exactly where a real defect goes to be ignored.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanBoundaries, partition, BOUNDARY_RULES } from "./boundaryLint.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);

const walk = (d, acc = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, acc);
        // v3108 -- HTML JOINED THE WALK. The lint read only .mjs/.js, so the entire BROWSER boundary was
        // invisible to it: view.html hard-depended on three CDN <script> tags with no fallback and no rule could
        // ever have seen them. A boundary lint that does not read the pages is not reading half the boundaries.
        else if (/\.(mjs|js|html)$/.test(e.name) && !/selfcheck/.test(e.name)) acc.push(p);
    }
    return acc;
};

const files = walk(ENG);
const all = [];
for (const p of files) {
    let s; try { s = fs.readFileSync(p, "utf8"); } catch { continue; }
    for (const f of scanBoundaries(s)) all.push({ ...f, file: path.relative(ENG, p).replace(/\\/g, "/") });
}
const { fail, report } = partition(all);

// ---- 1. EVERY RULE STATES WHY ------------------------------------------------------------------------------------
{
    ok("every rule carries a stated reason and a severity",
        Object.values(BOUNDARY_RULES).every((r) => r.why.length > 60 && ["fail", "report"].includes(r.severity)),
        Object.keys(BOUNDARY_RULES).length + " rules. A tell with no stated reason is a grep somebody deletes " +
        "the first time it is inconvenient");
}

// ---- 2. THE HARD RULE ---------------------------------------------------------------------------------------------
{
    for (const f of fail) say("UNCHECKED_ERROR_BODY: " + f.file + " -> ." + f.kind + "() on " + f.arg);
    ok("!! no response body is read without consulting .ok",
        fail.length === 0,
        fail.length ? "see above" : "scanned " + files.length + " files. A .text()/.blob()/.arrayBuffer() on an " +
        "unchecked response RETURNS THE ERROR PAGE AS DATA -- three of these existed, one in main.js, all " +
        "reading a mesh URL that a 404 would have turned into an HTML document fed to the parser");
}

// ---- 3. WHAT IS COUNTED AND DELIBERATELY NOT RULED -----------------------------------------------------------------
{
    const byRule = {};
    for (const r of report) byRule[r.rule] = (byRule[r.rule] || 0) + 1;
    for (const [id, n] of Object.entries(byRule)) say(id + ": " + n + " -- " + BOUNDARY_RULES[id].why);

    // v3142 -- A REPORT WITH NO BASELINE IS NOT A CHECK. These two rules have printed a count every run since
    // v3103 and NOTHING HAS EVER COMPARED IT TO ANYTHING. I went looking for drift, found my own notes saying
    // UNCHECKED_JSON_BODY was 53, and had to walk four shipped zips to establish that it has actually been 96
    // at v3128, v3132, v3139 and today. THE NUMBERS WERE FINE; THE ABILITY TO KNOW THAT WAS MISSING, and 53
    // was a stale figure from an earlier rule generation that I would otherwise have reported as a doubling.
    //
    // *** THE BASELINE IS A LIST, NOT A COUNT, for v3139's reason: a count cannot name a newcomer, and an
    // arrival plus a departure cancel to a total that never moved. *** Entries are file+rule, sorted, so the
    // gate can say WHICH file grew a tell rather than only that one did.
    //
    // THIS IS THE PREREQUISITE FOR THE PROMOTION QUESTION, not an answer to it. v3107 established that
    // KILL_NOT_VERIFIED cannot become a hard fail from source alone -- it cannot tell a kill that needs
    // checking from one whose caller does not care. You cannot promote a rule you have never watched; now it
    // is watched.
    {
        const BL = path.join(HERE, "boundary-report-baseline.json");
        // v3142 -- COUNTED PER file+rule, NOT a set of keys. My first version stored the keys as a LIST and a
        // planted sabotage DID NOT FIRE: agenda.html has several UNCHECKED_JSON_BODY tells, they all collapse
        // to one key, and removing one baseline entry left the key still present. A FILE GOING FROM THREE
        // TELLS TO FIVE WOULD HAVE BEEN INVISIBLE. scanBoundaries reports no line number, so the count IS the
        // resolution -- and it still names the file, which is what v3139 required of a baseline.
        const tally = {};
        for (const f of all) {
            if (!BOUNDARY_RULES[f.rule] || BOUNDARY_RULES[f.rule].severity !== "report") continue;
            const k = f.file + " :: " + f.rule;
            tally[k] = (tally[k] || 0) + 1;
        }
        const current = Object.keys(tally).sort();
        if (process.env.SWEK_FREEZE_BOUNDARY_REPORT) {
            fs.writeFileSync(BL, JSON.stringify({ note: "v3142 -- reported boundary tells AS FOUND, COUNTED PER file+rule. A baseline, not an approval: counts may SHRINK and may never GROW. Freeze deliberately with SWEK_FREEZE_BOUNDARY_REPORT=1.", sites: current.length, total: Object.values(tally).reduce((a, b) => a + b, 0), tally }, null, 1));
            console.log("  ----  froze " + current.length + " sites (" + Object.values(tally).reduce((a, b) => a + b, 0) + " tells) to boundary-report-baseline.json");
        }
        const baseRep = JSON.parse(fs.readFileSync(BL, "utf8"));
        const base = baseRep.tally || {};
        // A VIOLATION IS A NEW SITE *OR* A SITE THAT GREW. Comparing only the set of keys would miss the second.
        const added = current.filter((k) => !(k in base) || tally[k] > base[k])
                             .map((k) => k + (k in base ? " (" + base[k] + " -> " + tally[k] + ")" : " (NEW)"));
        ok("!! no NEW reported boundary tell has appeared",
            added.length === 0,
            current.length + " sites against a baseline of " + Object.keys(base).length +
            (added.length ? "; NEW: " + added.slice(0, 4).join(", ") : "") +
            ". Counted every run since v3103 and never compared until now -- so a rule could have doubled " +
            "quietly, and establishing that it had NOT took walking four shipped zips");
        const goneNow = Object.keys(base).filter((k) => !(k in tally) || tally[k] < base[k]);
        if (goneNow.length) console.log("  ----  " + goneNow.length + " baseline tell(s) no longer present -- re-freeze to record the win");
    }

    ok("the reported tells are counted, not silently dropped",
        Object.keys(byRule).length >= 1 && report.length > 0,
        JSON.stringify(byRule) + ". 'Reported' is exactly where a real defect goes to be ignored, so the count " +
        "is printed every run rather than hidden behind a flag");
    ok("...and the LOUD failure mode is separated from the silent one",
        (byRule.UNCHECKED_JSON_BODY || 0) > 0 && BOUNDARY_RULES.UNCHECKED_JSON_BODY.severity === "report",
        "a crude scan counted 58 unchecked bodies; 53 of them are .json(), which THROWS on an HTML error page. " +
        "Failing those would be failing a legitimate design and would get this file switched off");
}

// ---- 3b. v3107: THE DECIDABLE SUB-RULE INSIDE THE BROAD ONE ---------------------------------------------------------
// KILL_NOT_VERIFIED stays a report because from source alone a kill needing verification looks exactly like one
// whose caller does not care. But a kill that DISCARDS THE HANDLE and returns ok is different IN KIND: it is not
// weakly verified, it is UNVERIFIABLE BY CONSTRUCTION, and that IS decidable by reading. 99 kill sites narrowed
// to THREE by asking that one structural question -- the third time this session a crude count near a hundred
// has come down to a handful once the right question was found.
{
    const discards = all.filter((f) => f.rule === "KILL_DISCARDS_HANDLE");
    for (const d of discards) say("KILL_DISCARDS_HANDLE: " + d.file + " -> handle '" + d.arg + "'");
    ok("!! no kill discards the handle it would need to verify",
        discards.length === 0,
        discards.length ? "see above" : "three existed -- agentCookieBridge.stop, bzBridge.stopRoom and " +
        "bzBridge.stopPlay all did kill(), nulled the reference, and returned stopped:true in three lines. " +
        "kill() SENDS A SIGNAL; the child may ignore it, take seconds, or become a zombie. Dropping the handle " +
        "destroyed the only way to find out, so the claim rested on nothing and could never be shown wrong");

    const hit = (s) => scanBoundaries(s).map((f) => f.rule);

    // ---- v3108: the two rules fak names, and the two this tree already kept everywhere except in code ----------
    const page = (body) => "<!doctype html><html><head>" + body + "</head></html>";
    ok("!! SABOTAGE: a bare remote <script src> with no local fallback IS detected",
        hit(page('<script src="https://cdn.example.com/lib.js"></script>')).includes("UNVERIFIED_EXTERNAL_URL"),
        "view.html carried three of these while the engine ships its own three.js, so the page was perfect on any " +
        "machine with internet and dead on the LAN-only box the engine is actually for -- the same failure " +
        "battleship3d.html hit at v1989 and fixed by importing /vendor first");

    ok("...and a page that falls back to the vendored copy is NOT",
        !hit(page('<script type="module">try{await import("/vendor/three/three.module.js")}catch{await import("https://cdn.example.com/three.js")}</script>')).includes("UNVERIFIED_EXTERNAL_URL"),
        "the fallback IS the check -- it is what lets the page survive being wrong about the CDN. battleship3d " +
        "and the repaired view.html are both correctly silent, which is the difference between a rule and a nuisance");

    ok("...and an integrity hash counts as the check too",
        !hit(page('<script src="https://cdn.example.com/lib.js" integrity="sha384-abc"></script>')).includes("UNVERIFIED_EXTERNAL_URL"),
        "SRI is a different check for a different claim -- it does not survive the CDN being down, but it does " +
        "verify the bytes, and a rule that ignored that would be asking for ceremony rather than safety");

    ok("!! SABOTAGE: a '~' path handed to fs IS detected",
        hit('fs.readFileSync("~/notes.json", "utf8")').includes("UNEXPANDED_USER_PATH") &&
        hit('path.join("~", ".swek")').includes("UNEXPANDED_USER_PATH"),
        "THE SHELL EXPANDS '~'; NODE DOES NOT. mkdir succeeds, the write succeeds, nothing throws, and the file " +
        "lands in a directory literally named '~' beside the cwd. The tree is clean of this today -- the rule is " +
        "here to keep it that way, since the shell scripts write $HOME out and the JS would not");

    ok("...and os.homedir(), or a tilde mid-path, is not flagged",
        !hit('path.join(os.homedir(), ".swek")').includes("UNEXPANDED_USER_PATH") &&
        !hit('fs.readFileSync("/tmp/backup~1.json")').includes("UNEXPANDED_USER_PATH"),
        "the correct idiom and an ordinary filename containing a tilde both stay silent -- only a LEADING ~ in a " +
        "path segment is the claim about the OS");

    ok("SABOTAGE: kill -> null the handle -> claim ok IS detected",
        hit('function stop(){ try { p.kill(); } catch {}\n p = null;\n return { ok: true, stopped: true }; }')
            .includes("KILL_DISCARDS_HANDLE"),
        "the exact three-line shape that was live in two bridges");
    ok("...and a handle with an exit listener is NOT",
        !hit('p.once("exit", () => { st = 1; });\n try { p.kill(); } catch {}\n p = null;\n return { ok: true };')
            .includes("KILL_DISCARDS_HANDLE"),
        "autoInstall does exactly this -- kills on a timeout but learns the truth from child.on('exit') -- and " +
        "is correctly not a finding. A rule that flagged it would be training people to ignore the rule");
    ok("...and a kill that KEEPS the handle is not flagged either",
        !hit('try { p.kill(); } catch {}\n return { ok: true };').includes("KILL_DISCARDS_HANDLE"),
        "keeping the reference leaves verification possible, which is all this rule asks for");
}

// ---- 4. POWER, IN BOTH DIRECTIONS ------------------------------------------------------------------------------------
{
    const hit = (s) => scanBoundaries(s).map((f) => f.rule);
    ok("SABOTAGE: an unchecked .text() IS detected",
        hit("const t = await (await fetch(u)).text();").includes("UNCHECKED_ERROR_BODY"),
        "the exact shape that was live in main.js");
    ok("...and a data: URL is NOT, because it cannot 404",
        hit("const b = await (await fetch(dataUrl)).blob();").length === 0,
        "fetch() on a data: URL is a LOCAL DECODE, not a network boundary. Two of the first five findings were " +
        "these, and counting them is the difference between a rule and a nuisance");
    ok("...and .json() is classified as the LOUD rule, not the failing one",
        hit("const j = await (await fetch(u)).json();").includes("UNCHECKED_JSON_BODY"),
        "same omission, different consequence, different verdict");
    ok("!! the lint does not match its own prose",
        (() => {
            const self = fs.readFileSync(path.join(HERE, "boundaryLint.mjs"), "utf8");
            return scanBoundaries(self).filter((f) => f.rule === "UNCHECKED_ERROR_BODY").length === 0;
        })(),
        "both files DISCUSS the idiom they forbid at length, so the scan runs through codeOnly() which blanks " +
        "comments AND strings. Thirteenth time this tree has had to think about that");
}

console.log();
if (fails) { console.log("boundaryLint-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("boundaryLint-selfcheck: all checks pass");
