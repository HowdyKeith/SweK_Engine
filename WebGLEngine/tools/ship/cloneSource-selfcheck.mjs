// WebGLEngine/tools/ship/cloneSource-selfcheck.mjs -- v3941
//
// Run: node tools/ship/cloneSource-selfcheck.mjs   (~0.06s — MEASURED v3941, median of 60/58/60)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES githubBridge.cloneEngineSource -- the route from "pushed to GitHub" to "running on this box".
//
// *** THE LOOP HAD NO CLOSING SIDE, AND THE ERROR THAT REVEALED IT SAID NOTHING. *** Keith pressed "Release
// current engine" on a v3940 tree and got "Validation Failed" -- v3940 was already released. The fix was to
// run the newer code, and there was no route to it: fetchEngineBuild carries a release ASSET, and
// publishEngineBuild builds that asset FROM THE LOCAL TREE, so a version can only be released from a box that
// already has it. Eleven buttons on the panel and the answer was three commands in a terminal.
//
// WHAT THIS FILE ACTUALLY REFUSES TO LET REGRESS is the safety, not the happy path. A clone button is one
// mistake away from being a "delete my work" button, and the running folder is exactly where a tree that has
// been edited in place keeps changes that exist nowhere else -- this session found several such differences on
// Keith's box. So the checks below are about what it must NEVER do.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const require_ = createRequire(import.meta.url);
const gh = require_(path.join(ENG, "ai-bridge", "githubBridge.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

console.log("cloneSource-selfcheck -- the way IN, and what it must never overwrite\n");

// ---- 1. THE VERSION MARKER HAS ONE SPELLING ---------------------------------------------------------------
{
    console.log("1. THE MARKER IS PARSED IN ONE PLACE");
    ok("!! the parse is a pure function, so both readers share it",
        typeof gh._parseEngineVersion === "function" && typeof gh._versionInTree === "function",
        "engineVersion() reads THIS tree's main.js and _versionInTree reads a CLONED one. Two copies of the " +
        "regex is how a marker quietly stops being found in one of the two places.");
    ok("it reads a normal declaration", gh._parseEngineVersion('const ENGINE_VERSION = "v3941";') === "v3941");
    ok("...and tolerates spacing", gh._parseEngineVersion('ENGINE_VERSION   =   "v42"') === "v42");
    ok("!! a tree with no marker yields EMPTY rather than a guess",
        gh._parseEngineVersion("no marker here") === "" && gh._parseEngineVersion(null) === "",
        "*** THE FOLDER IS NAMED FROM THIS VALUE. *** A guess here would name a clone after a version it is not, " +
        "and the installer picks builds by that name -- the mislabeled-build failure the ship ritual exists to stop.");
    ok("...and a tree with no main.js at all yields empty",
        gh._versionInTree(os.tmpdir()) === "");
}

// ---- 2. IT REFUSES BEFORE IT TOUCHES ANYTHING -------------------------------------------------------------
{
    console.log("\n2. *** THE REFUSALS COME BEFORE THE NETWORK AND BEFORE THE DISK ***");
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "clonegate-"));
    const bad = await gh.cloneEngineSource({ repo: "not-a-repo", targetDir: scratch });
    ok("!! a repo that is not owner/name is refused",
        bad.ok === false && /owner\/name/.test(bad.error || ""),
        "the value reaches a shell argument list, so the shape is checked rather than trusted");
    const badref = await gh.cloneEngineSource({ repo: "a/b", ref: "x;rm -rf /", targetDir: scratch });
    ok("!! ...and so is a ref carrying shell punctuation",
        badref.ok === false && /bad ref/.test(badref.error || ""),
        "*** execFile DOES NOT USE A SHELL, so this is not the only thing standing between a ref and disaster " +
        "-- but a value that reaches an argument list is checked anyway, because the day somebody swaps " +
        "execFile for exec the argument shape is all that is left. ***");
    ok("...and neither refusal created anything on disk",
        fs.readdirSync(scratch).length === 0,
        "a refusal that leaves a half-made folder is how a later run finds a destination that 'already exists'");
    fs.rmSync(scratch, { recursive: true, force: true });
}

// ---- 3. IT NEVER WRITES OVER AN EXISTING BUILD ------------------------------------------------------------
{
    console.log("\n3. *** SIDE BY SIDE, NEVER OVER THE TOP ***");
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "githubBridge.js"), "utf8");
    const fn = (src.match(/async function cloneEngineSource[\s\S]*?\n\}/) || [""])[0];
    ok("!! the destination is checked for existence and the run ABORTS",
        /fs\.existsSync\(dest\)/.test(fn) && /exists: true/.test(fn),
        "*** THE RUNNING FOLDER IS WHERE A TREE EDITED IN PLACE KEEPS WORK THAT IS NOWHERE ELSE. *** Driven " +
        "rather than read at v3941: a canary file written into an existing destination survived the refusal.");
    ok("!! ...and nothing in it removes the destination",
        !/rmSync\(dest/.test(fn) && !/rm\(dest/.test(fn),
        "a clone button is one mistake away from a delete button. The only rmSync in here targets the TEMP path.");
    // *** THE FIRST VERSION OF THIS CHECK HAD A HOLE, AND PLANTING FOUND IT. *** It asserted only that the
    // FINAL renameSync(tmp, dest) came after the version read -- so a SECOND, earlier rename of tmp sailed
    // straight through, which is precisely the defect (a tree named before its version is known). Counting the
    // renames is what closes it: there must be exactly one, it must target dest, and it must come last.
    const renames = (fn.match(/renameSync\s*\(\s*tmp\s*,/g) || []).length;
    ok("!! the clone lands on a TEMP name and is renamed ONCE, only after the version is known",
        /_clone\.tmp/.test(fn) && renames === 1 && /renameSync\(tmp, dest\)/.test(fn) &&
        fn.indexOf("_versionInTree") < fn.indexOf("renameSync(tmp, dest)"),
        renames + " rename(s) of the temp path. A clone that dies half-way must not leave something that LOOKS " +
        "like a finished build -- scanDownloads and the installer both pick by FOLDER NAME, so a partial tree " +
        "wearing a real name is worse than no tree at all.");
}

// ---- 4. THE TOKEN DOES NOT END UP SOMEWHERE IT SURVIVES ---------------------------------------------------
{
    console.log("\n4. *** THE TOKEN RIDES IN THE ENVIRONMENT, NOT IN THE URL AND NOT IN argv ***");
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "githubBridge.js"), "utf8");
    const fn = (src.match(/async function cloneEngineSource[\s\S]*?\n\}/) || [""])[0];
    ok("!! no token is interpolated into the clone URL",
        !/https:\/\/\$\{[^}]*t[ok]/i.test(fn) && !/@github\.com/.test(fn),
        "*** A TOKEN IN THE REMOTE URL IS WRITTEN INTO .git/config AND SURVIVES ON DISK *** long after the " +
        "clone, in a folder the user may well zip up and send somebody");
    ok("!! ...and none is passed as a command-line argument",
        !/args\.push\([^)]*extraHeader/i.test(fn) && !/"-c"/.test(fn),
        "anything that can list processes can read argv. GIT_CONFIG_KEY_0/VALUE_0 keeps it in the environment.");
    // v3958 -- ASSERTED AS THE PROPERTY, NOT THE INDEX. This check used to read GIT_CONFIG_VALUE_0 literally and
    // broke the moment the two entries swapped places -- the pinned-to-a-literal defect this tree fixes on a
    // loop. What matters is that the Authorization header lives ONLY on the authenticated path.
    // baseEnv's OWN BODY is sliced out rather than matched loosely: authedEnv legitimately calls baseEnv() and
    // then adds the header, so the two words sit next to each other in the text and a proximity test reports a
    // bug that is not there. (It did, on the first run of this very check.)
    const baseBody = (fn.match(/const baseEnv = \(\) => \{[\s\S]*?\n    \};/) || [""])[0];
    ok("!! the Authorization header exists only on the authenticated path",
        /authedEnv/.test(fn) && /extraHeader/.test(fn) &&
        !!baseBody && !/extraHeader/.test(baseBody) &&
        // COUNTED ON CODE ONLY. The function's own comment explains the header, so a raw count reads 2 and the
        // check fails on correct code -- the prose-as-code trap, caught here for the sixth time in this stretch.
        ((fn.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n").match(/extraHeader/g) || []).length === 1),
        "a public repo clone must not carry a header it does not need -- and the anonymous RETRY must not carry " +
        "the header that just got rejected, or the retry is the same request twice");
    ok("!! it can never sit waiting for credentials nobody is there to type",
        /GIT_TERMINAL_PROMPT/.test(fn),
        "*** DRIVEN AT v3941: a repo the token cannot read returned 'could not read Username' and EXITED, " +
        "instead of blocking the bridge forever on a prompt in a process with no terminal attached. ***");
    // *** GIT_TERMINAL_PROMPT ONLY SUPPRESSES GIT'S OWN IN-TERMINAL PROMPTS. *** Windows Git ships Git
    // Credential Manager as the default credential.helper, and GCM has its own GUI/browser/device-code sign-in
    // flow that fires independently of http.extraHeader already carrying a valid Authorization header -- Keith
    // saw GCM's "Connect to GitHub" popup mid-clone despite having a working token configured. Clearing
    // credential.helper for this one invocation (an empty value is git's documented "forget every configured
    // helper" signal) is what stops GCM from ever getting a turn.
    // v3958 -- AND IT IS CLEARED WHETHER OR NOT THERE IS A TOKEN. It used to sit inside `if (tk)`, so a box with
    // no token configured got Git Credential Manager back -- the popup returning on exactly the machines least
    // able to explain it. baseEnv() is the floor both paths are built on, so there is no path without it.
    ok("!! ...and the credential helper is disabled on EVERY path, token or not",
        /baseEnv[\s\S]{0,300}credential\.helper/.test(fn) && /GIT_CONFIG_VALUE_0\s*=\s*""/.test(fn) &&
        !/if \(tk\) \{[\s\S]{0,200}credential\.helper/.test(fn),
        "*** DRIVEN BY KEITH AT v3942: the clone-source button popped Git Credential Manager's own sign-in " +
        "dialog mid-clone -- a token in http.extraHeader does not stop git from ALSO consulting a configured " +
        "credential.helper, so the helper has to be cleared, not just outrun.");
}

// ---- 4b. A REPO NAME NOBODY COULD HAVE IS REFUSED AT THE WRITE ---------------------------------------------
//
// *** KEITH'S CONFIG HELD engineRepo = "Swek Engine" AND EVERY UPDATE HAD SILENTLY STOPPED. *** No GitHub repo
// can contain a space, so versionCheck and fetchEngineBuild both 404'd and returned ok:false -- and the poller
// swallows that in a try/catch, so nothing ever said so. engineUpdateSource-selfcheck was the only thing in the
// tree that could see it. The Account field asked for "engine repo (for version alert)", which is a request for
// a NAME, and "Swek Engine" is a good answer to that question; the repo is SweK_Engine.
{
    console.log("\n4b. A VALUE THAT CANNOT NAME A REPOSITORY IS REFUSED BEFORE IT IS SAVED");
    ok("!! a display name with a space is refused",
        !!gh.repoShapeError("Swek Engine") && !!gh.repoShapeError("My Repo/Thing"),
        "*** THE FAILURE IT PREVENTS IS SILENT AND THREE LAYERS DOWN. *** Saved, it makes every update call " +
        "404 inside a try/catch nobody reads -- v3940's own words: a feature that fails closed and silent is " +
        "indistinguishable from a feature nobody turned on.");
    ok("!! ...and a BARE NAME is still accepted, because _split deliberately prepends the owner",
        !gh.repoShapeError("SweK_Engine") && !gh.repoShapeError("swek-blobulator"),
        "rejecting the bare form would break a spelling that works today -- the rule is 'cannot name a repo', " +
        "not 'is not owner/repo'");
    ok("...and owner/repo and a pasted github.com URL both pass",
        !gh.repoShapeError("HowdyKeith/SweK_Engine") &&
        !gh.repoShapeError("https://github.com/HowdyKeith/SweK_Engine.git"),
        "the check mirrors _split's own normalisation, so every form the resolver accepts is still saveable");
    ok("...and empty stays legal, because NOT SET is a real state",
        !gh.repoShapeError("") && !gh.repoShapeError(null));
    ok("!! ...and the panel SHOWS the reason instead of a bare 'save failed'",
        /j\.error \|\| "save failed"/.test(fs.readFileSync(path.join(ENG, "ui", "githubPanel.js"), "utf8")),
        "a refusal whose reason is thrown away teaches the user to retype the same value");
}

// ---- 5. IT IS REACHABLE ------------------------------------------------------------------------------------
{
    console.log("\n5. THERE IS A DOOR, WHICH IS THE WHOLE POINT");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const panel = fs.readFileSync(path.join(ENG, "ui", "githubPanel.js"), "utf8");
    ok("!! the route is dispatched",
        /"\/github\/clone-source"/.test(server) && /cloneEngineSource/.test(server),
        "a bridge function with no route is the module-with-no-caller shape this tree names everywhere");
    ok("!! ...and a button calls it",
        /clone-source/.test(panel),
        "THE FEATURE EXISTS BECAUSE THE ANSWER WAS THREE COMMANDS IN A TERMINAL. A route with no button would " +
        "leave it exactly as unreachable as before, one layer further in.");
    ok("...and it says the new copy is separate and this one is unchanged",
        /SEPARATE folder/.test(panel) && /still /.test(panel),
        "the running engine does not change under you, so the panel must not imply that it did");
}

// ---- 6. WHICH BRANCH (v4133) --------------------------------------------------------------------------------
//
// THE BUG THIS SECTION EXISTS FOR COST DAYS AND BROKE NOTHING. cloneEngineSource always honoured a `ref` and
// always read the version out of the CLONED TREE rather than guessing, so it behaved perfectly: it cloned the
// default branch, found v4116 in it, and named the folder v4116. Meanwhile sixteen versions of work sat on a
// feature branch, the rig ran gate after gate against the stale tree, and the failures it reported could not
// be reproduced. NOTHING IN THE SYSTEM WAS WRONG EXCEPT THAT NOBODY WAS ASKED WHICH BRANCH, and the result
// never mentioned that the copy it handed back was older than the engine asking for it -- with BOTH numbers
// sitting in its own return value, and _verLt defined forty lines below doing that comparison for three other
// callers. A correct function, a correct namer, and a silent default: the defect was the missing question.
{
    console.log("\n6. WHICH BRANCH -- THE QUESTION THAT WAS NEVER ASKED");
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "githubBridge.js"), "utf8");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const panel = fs.readFileSync(path.join(ENG, "ui", "githubPanel.js"), "utf8");

    // *** THIS LINE WAS PINNED TO A LOCAL VARIABLE'S NAME AND WENT RED WHEN THAT NAME CHANGED. *** v4148 renamed
    // the local from `_run` to `_running` -- because `_run` is ALSO the module-level function that runs git, and
    // the collision put that function in a temporal dead zone and broke the clone button for fifteen versions.
    // The rename was the fix. This check asserted the old spelling, so a CORRECT tree failed a check about a
    // defect that no longer exists: the gate was measuring a name, not the comparison it is named after.
    // Now it captures whatever the local is called and requires the REVERSE comparison to use the SAME
    // identifier -- which is the actual claim (both directions, one pair of numbers) and survives the next rename.
    const cmp = /_verLt\(\s*ver\s*,\s*([A-Za-z_$][\w$]*)\s*\)/.exec(src);
    const bothWays = !!cmp && new RegExp("_verLt\\(\\s*" + cmp[1].replace(/\$/g, "\\$") + "\\s*,\\s*ver\\s*\\)").test(src);
    ok("!! the clone COMPARES what it fetched against what is running, in BOTH directions",
        bothWays,
        cmp ? "compared against `" + cmp[1] + "` both ways" :
              "both numbers were already in the return and nothing compared them");
    ok("!! ...and SAYS SO when the copy is older",
        /staleWarning/.test(src) && /older/.test(src),
        "a success tick over a stale tree is how sixteen versions went unnoticed");
    ok("...and the warning names the branch it actually used",
        /staleWarning[\s\S]{0,400}?DEFAULT branch/.test(src),
        "'older' without 'you asked for the default branch' does not tell anybody what to do next");

    ok("!! the branch lister exists and is exported",
        /async function listSourceBranches/.test(src) && /listSourceBranches, getFile/.test(src));
    ok("!! it calls the version a GUESS, in the field name itself",
        /versionGuess/.test(src) && /versionSource/.test(src) && !/\bversion:\s*m \?/.test(src),
        "reading a real ENGINE_VERSION means fetching 2.5 MB per branch; this parses the commit subject, and a " +
        "field called `version` would get BELIEVED -- which is the same over-trust that hid the default branch");
    ok("...and the picker's label marks it as inferred too",
        /"  ~" \+ b\.versionGuess/.test(panel),
        "the tilde is the UI half of the same honesty; a bare vNNNN in a dropdown reads as fact");
    ok("!! the per-branch commit fan-out is CAPPED",
        /slice\(0, 25\)/.test(src) && /truncated/.test(src),
        "N+1 calls against a rate limit a dropdown has no business exhausting -- and it says when it truncated");

    ok("!! a PUBLIC read survives a rotten token",
        /async function _apiReadPublic/.test(src) && /401 \|\| r\.status === 403/.test(src),
        "cloneEngineSource makes exactly this argument for git ('refusing to do something that needs no " +
        "permission at all') and nobody carried it to the REST side; an expired PAT turned a public branch " +
        "list into 'Bad credentials' on the very box this was written on");
    ok("!! ...and the fallback is SCOPED TO READS, never to writes",
        !/_apiReadPublic\("(POST|PUT|PATCH|DELETE)/.test(src) && /_apiReadPublic\(p\)/.test(src)
          && /const r = await _api\("GET", p\)/.test(src),
        "_api is shared by createRepo/putFile/createRelease/deleteRepo -- a WRITE retried anonymously turns " +
        "'your token expired' into a 404 nobody can read");

    ok("!! there is a route",
        /"\/github\/source-branches"/.test(server) && /listSourceBranches/.test(server));
    ok("!! ...and the button actually PASSES the chosen ref",
        /api\("clone-source", ref \? \{ repo: er, ref \}/.test(panel),
        "the backend honoured `ref` all along; the UI never sent one, which is the entire bug");
    ok("...and the stale warning is printed BEFORE the success tick",
        /j\.staleWarning \? "\\u26A0 " \+ j\.staleWarning/.test(panel),
        "burying it under a tick is how the last one was missed");
    ok("...and the query goes in the op string, since api() is (op, body, method)",
        /api\("source-branches\?repo="/.test(panel),
        "a 4th 'query' argument would be silently dropped and the repo would never arrive -- caught by reading " +
        "api()'s signature rather than by assuming it took one");

    // The DEFAULT branch is flagged, not floated to the top: on this repo it is the stale one, and a list that
    // always shows `main` first is the same wrong default wearing a dropdown.
    ok("!! the list sorts by COMMIT DATE, not by default-branch-first",
        /heads\.sort\(\(a, b\) => String\(b\.committedAt\)/.test(src) && /isDefault/.test(src),
        "flagged rather than forced to the top");

    // HONEST LIMIT, PRINTED: the live call is not exercised here.
    console.log("  ----  NOT RUN HERE: the live GitHub listing. This sandbox's shared IP is rate-limited and its " +
                "saved token is rejected, so listSourceBranches was confirmed to REACH GitHub anonymously " +
                "(the reply changed from 'Bad credentials' to a rate-limit notice, which only an " +
                "unauthenticated request receives) but never returned a branch list here. The shape above is " +
                "checked from source; the listing itself wants a run on the rig.");
}

// ---- 7. AND THE LISTER IS ACTUALLY RUN (v4133) --------------------------------------------------------------
//
// Section 6 reads the source. Source cannot tell "sorts by date" from "sorts by date and throws on the way".
// GitHub itself is not usable as a fixture -- this box's token is rejected and its shared IP is rate-limited,
// and a permanent gate that needs a third party to be up is a worse gate anyway -- so fetch is stubbed and the
// REAL listSourceBranches runs against it. The fixture is Keith's own situation: a stale default branch at
// v4116 and a feature branch at v4132, which is the arrangement that cost the days this feature exists for.
{
    console.log("\n7. THE LISTER, RUN RATHER THAN READ");
    const realFetch = globalThis.fetch;
    let sawAuthed = false, sawAnon = false;
    globalThis.fetch = async (url, opts) => {
        const u = String(url);
        const J = (o, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(o) });
        if (opts && opts.headers && opts.headers.Authorization) { sawAuthed = true; return J({ message: "Bad credentials" }, 401); }
        sawAnon = true;
        if (/\/repos\/[^/]+\/[^/]+$/.test(u)) return J({ default_branch: "main" });
        if (/\/branches\?/.test(u)) return J([{ name: "main" }, { name: "feature/x" }, { name: "old" }]);
        if (/\/commits\?/.test(u)) {
            const b = decodeURIComponent((u.match(/sha=([^&]+)/) || [])[1] || "");
            const rows = {
                "main":      [{ commit: { message: "v4116 -- an install button\nbody", committer: { date: "2026-08-01T00:00:00Z" } } }],
                "feature/x": [{ commit: { message: "v4132: eighteen rounds of changelog", committer: { date: "2026-08-29T00:00:00Z" } } }],
                "old":       [{ commit: { message: "no version in this subject", committer: { date: "2025-01-01T00:00:00Z" } } }],
            };
            return J(rows[b] || []);
        }
        return J({}, 404);
    };
    try {
        const r = await gh.listSourceBranches({ repo: "owner/repo" });
        ok("!! it returns a list at all", !!(r && r.ok), r && r.error ? r.error : "");
        const names = (r.branches || []).map((b) => b.name);
        ok("!! the NEWER feature branch sorts ABOVE the stale default",
            names[0] === "feature/x" && names.indexOf("main") > 0,
            "got: " + names.join(" > ") + " -- this is the exact arrangement that hid v4117..v4132 for days");
        const feat = (r.branches || []).find((b) => b.name === "feature/x") || {};
        const main = (r.branches || []).find((b) => b.name === "main") || {};
        const old = (r.branches || []).find((b) => b.name === "old") || {};
        ok("the versions are parsed off both commit-subject spellings (`vNNNN --` and `vNNNN:`)",
            feat.versionGuess === "v4132" && main.versionGuess === "v4116");
        ok("!! a subject with NO version yields EMPTY rather than a guess",
            old.versionGuess === "" && old.versionSource === "",
            "inventing a version for an unlabelled branch is precisely the over-trust this field name avoids");
        ok("the default branch is FLAGGED and not floated to the top",
            main.isDefault === true && feat.isDefault === false && names[0] !== "main");
        ok("!! the rotten token was retried anonymously, and the result says which path answered",
            sawAuthed && sawAnon && r.auth === "anonymous",
            "authed attempt -> 401 -> anonymous retry -> list; reported as auth:" + r.auth);
    } finally {
        globalThis.fetch = realFetch;
    }
}

console.log(fails ? `\ncloneSource-selfcheck: ${fails} FAILED` : "\ncloneSource-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
