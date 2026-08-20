// WebGLEngine/ai-bridge/engineUpdateSource-selfcheck.mjs -- v3907
// ---------------------------------------------------------------------------------------------------------------
// THE GITHUB UPDATE SOURCE WAS FULLY BUILT, WIRED INTO THE POLLER, AND HAD NEVER BEEN ABLE TO RUN.
//
// Keith asked whether the engine's version check could read the GitHub repo too and feed auto-update. I went to
// build it and THE ASSERT STOPPED ME BECAUSE IT ALREADY EXISTED -- githubBridge.fetchEngineBuild() pulls the
// newest release asset into Downloads, sysadminBridge.githubPull() calls it, and startUpdatePoller() invokes that
// every interval when cfg.update.autoFetch is on. Nothing needed writing. What needed FINDING is why it had
// never done anything, and there were two reasons, neither of which anything checked.
//
// *** REASON ONE: engineRepo DEFAULTED TO "" WHILE owner DEFAULTED TO "HowdyKeith". *** Half the address was
// filled in. versionCheck() answered "no repo to check (set engineRepo)" and fetchEngineBuild() answered "no
// engineRepo set", both as ok:false -- so autoFetch could be ON, the poller could call githubPull() every ten
// minutes for months, and the result was an error object nobody surfaced. A FEATURE THAT FAILS CLOSED AND SILENT
// IS INDISTINGUISHABLE FROM A FEATURE NOBODY TURNED ON. Fixed at v3907; section 1 is what keeps it fixed.
//
// *** REASON TWO: THE REPO HAS NO RELEASES, AND THAT IS NOT A BUG IN THIS CODE. *** fetchEngineBuild returns
// { none: true } for a repo with no published releases, which is correct and honest. It means the remaining work
// is on the PUBLISHING side -- a release per version, tagged, with the properly-rooted zip as its asset -- and
// section 5 states that as a fact about the world rather than letting it look like a code failure.
//
// THE SECTION WORTH READING IS 3. githubBridge downloads to `dest + ".part"` and renames on completion.
// sysadminBridge's scanDownloadsPartial() recognises in-flight files by a list of suffixes that includes
// "\\.part". THOSE TWO FACTS LIVE IN DIFFERENT FILES, NEITHER IMPORTS THE OTHER, AND NOTHING RELATED THEM UNTIL
// NOW. They agree today by coincidence. If githubBridge ever wrote ".tmp" instead, an in-flight GitHub pull would
// become invisible to the scanner and the panel would say "up to date" while the new version was mid-download --
// WHICH IS EXACTLY THE v3054 BUG KEITH ALREADY HIT ONCE with Chrome's .crdownload, in this same scanner, for this
// same reason. This gate is the only thing that would notice the second time.
//
// NO NETWORK. Every check here reads code and config. A gate that needed GitHub to be reachable would be a gate
// that goes red when the wifi does, and this tree has enough real reds.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const gh = require_("./githubBridge.js");
const ghSrc  = fs.readFileSync(path.join(HERE, "githubBridge.js"), "utf8");
const sysSrc = fs.readFileSync(path.join(HERE, "sysadminBridge.js"), "utf8");

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("engineUpdateSource-selfcheck -- the GitHub update source, which was built and could never run\n");

console.log("1. THE ADDRESS IS COMPLETE: a half-filled address fails closed and says nothing");
{
    const st = gh.status();
    ok("*** engineRepo has a default, so the chain has somewhere to look ***", !!(st.engineRepo || "").trim(),
       "engineRepo = " + JSON.stringify(st.engineRepo || ""));
    ok("...and it is owner/repo shaped, not a bare name", /^[\w.-]+\/[\w.-]+$/.test(st.engineRepo || ""), st.engineRepo);
    ok("...and the owner half agrees with it, which is the asymmetry that hid this",
       (st.engineRepo || "").split("/")[0] === st.owner,
       `owner "${st.owner}" and engineRepo "${st.engineRepo}" name the same account`);
    report("WHY THIS IS A CHECK AND NOT A COMMENT", "both callers return ok:false when engineRepo is empty, and " +
           "the poller swallows the result in a try/catch. THE ERROR PATH IS UNOBSERVABLE FROM OUTSIDE, so the " +
           "only place the emptiness could ever be caught is here, before it ships");
}

console.log("\n2. THE VERSION COMES FROM main.js AND NOWHERE ELSE");
{
    const v = gh.engineVersion();
    const m = fs.readFileSync(path.join(HERE, "..", "main.js"), "utf8").match(/ENGINE_VERSION\s*=\s*"(v\d+)"/);
    ok("*** engineVersion() reads the shipped ENGINE_VERSION, not a copy of it ***", !!m && v === m[1],
       `engineVersion() -> ${v}, main.js -> ${m && m[1]}`);
    report("THE SECOND COPY IS NEVER THE ONE THAT GETS UPDATED", "a version.json or a package.json version beside " +
           "this would be a second place to forget. The whole update comparison hangs off this one read, so it is " +
           "worth one check that it is still that read");
}

console.log("\n3. *** THE CROSS-FILE CONTRACT NOTHING RELATED UNTIL NOW: THE IN-FLIGHT SUFFIX ***");
{
    const wrote = (ghSrc.match(/const tmp = dest \+ "(\.[A-Za-z]+)"/) || [])[1];
    const listed = (sysSrc.match(/const PARTIAL_SUFFIXES = \[([^\]]*)\]/) || [])[1] || "";
    ok("githubBridge downloads to a temporary suffix rather than straight to the final name", !!wrote,
       "writes to dest + " + JSON.stringify(wrote || "(none found)"));
    ok("*** and sysadminBridge's PARTIAL_SUFFIXES CONTAINS THAT EXACT SUFFIX ***",
       !!wrote && listed.includes("\\\\" + wrote.replace(".", "") ) === false && listed.includes(wrote.slice(1)),
       `githubBridge writes "${wrote}"; PARTIAL_SUFFIXES = ${listed.trim()}`);
    report("THESE TWO FILES DO NOT IMPORT EACH OTHER AND AGREE BY COINCIDENCE", "change githubBridge to \".tmp\" " +
           "and an in-flight GitHub pull stops being visible to scanDownloadsPartial. The panel then reports " +
           "\"up to date\" WHILE THE NEW VERSION IS DOWNLOADING -- true, and the answer to a question nobody " +
           "asked. *** THAT IS THE v3054 BUG, VERBATIM: *** Keith hit it with Chrome's .crdownload in this same " +
           "scanner, concluded the Mac was reading the wrong folder, and it was reading the right one.");
    ok("...and the rename to the final name happens only after the download resolves",
       /renameSync\(tmp, dest\)/.test(ghSrc),
       "so scanDownloads() -- which feeds the INSTALLER -- can never see a partial file under a real name");
}

console.log("\n4. THE ASSET PICKER MATCHES THE NAME THE SHIP RITUAL ACTUALLY PRODUCES");
{
    const reSrc = (ghSrc.match(/find\(a => (\/\^[^/]+\/i)\.test\(a\.name\)\)/) || [])[1];
    const re = reSrc ? new RegExp(reSrc.slice(1, -2), "i") : null;
    const cur = gh.engineVersion();
    ok("the picker's pattern is readable from source, so this check grades the real one", !!re, String(reSrc));
    ok(`*** it matches the archive this tree ships: SweK_Engine_${cur}.zip ***`, !!re && re.test(`SweK_Engine_${cur}.zip`),
       "the same name the zip is rooted and delivered under");
    ok("...and the legacy EngineProject name too, which is why the rename did not orphan old releases",
       !!re && re.test(`EngineProject_${cur}.zip`));
    ok("...and it REFUSES a codeload branch archive", !!re && !re.test("SweK_Engine-main.zip"),
       "a branch zip's root folder is SweK_Engine-<branch>, which the installer's rename step cannot place");
    report("A KNOWN ASYMMETRY, RECORDED RATHER THAN FIXED", "sysadminBridge's _versionRe accepts \"SweK Engine_vN\" " +
           "WITH A SPACE and this picker does not. Harmless while the ritual emits underscores, and naming it here " +
           "is cheaper than a fix that would let a space-named release asset through a rename that expects one");
}

console.log("\n5. WHAT IS TRUE ABOUT THE WORLD, NOT ABOUT THIS CODE");
{
    ok("fetchEngineBuild has an explicit 'no releases published' answer, distinct from a failure",
       /none: true[\s\S]{0,80}no releases published/.test(ghSrc),
       "returns { ok: true, none: true } -- NEVER RUN IS DISTINCT FROM FAILED, and a repo with no releases is neither broken nor updatable");
    ok("...and it refuses to install when the latest is not newer, rather than re-landing the same zip",
       /if \(!force && !newer\) return \{ ok: true, upToDate: true/.test(ghSrc));
    ok("...and it skips a re-download when the file is already there at the right size",
       /!force && fs\.existsSync\(dest\) && fs\.statSync\(dest\)\.size === asset\.size/.test(ghSrc),
       "size-matched, so a truncated earlier attempt is re-fetched rather than trusted");
    report("*** THE REMAINING WORK IS PUBLISHING, NOT CODE ***", "as of v3907 the repo has NO RELEASES, so this " +
           "chain correctly returns none:true and installs nothing. What it needs is a release per version, " +
           "tagged vNNNN, carrying the properly-rooted SweK_Engine_vNNNN.zip as its asset. THE TAG IS THEN THE " +
           "VERSION -- one API call, and no second copy of the number anywhere in the tree.");
}

console.log("\n6. THE POLLER REACHES IT, AND ONLY WHEN ASKED");
{
    ok("startUpdatePoller calls githubPull when autoFetch is set", /if \(cfg\.update\.autoFetch\) \{ try \{ await githubPull\(false\)/.test(sysSrc));
    ok("*** and autoFetch defaults to FALSE, so setting engineRepo turns on no traffic by itself ***",
       /autoFetch: false/.test(sysSrc), "cfg.update.autoFetch defaults false; cfg.update.enabled defaults false");
    ok("...and githubPull deposits into the SAME Downloads folder the scanner reads",
       /gh\.fetchEngineBuild\(\{ toDir: downloadsDir\(\)/.test(sysSrc),
       "ONE INSTALLER: the GitHub source is a new way for a zip to ARRIVE, never a second way for it to be applied");
    report("WHY THAT MATTERS MORE THAN IT LOOKS", "the Downloads path already carries the partial-file guard, the " +
           "launch cooldown, the prefix-agnostic rename, the tar-then-Expand-Archive fallback and the disk-space " +
           "margin. A GitHub installer that extracted for itself would re-earn every one of those bugs alone");
}

console.log("\n7. *** THE ARTIFACT THE PUBLISHER BUILDS MUST BE THE ONE THE INSTALLER CAN SEE AND RUN ***");
{
    const pkgSrc = fs.readFileSync(path.join(HERE, "packagerBridge.js"), "utf8");
    ok("publishEngineBuild builds the INSTALLABLE zip, not the Gmail-safe one",
       /packager\.makeInstallable\(/.test(ghSrc) && !/packager\.makeGmailSafe\(/.test(ghSrc),
       "the release asset comes from makeInstallable()");
    // The distinction has to be REAL, not a rename of the same function. Gmail-safe renames blocked extensions;
    // the installable build must not, and BLOCKED is why.
    const blocked = (pkgSrc.match(/const BLOCKED = \[([^\]]*)\]/) || [])[1] || "";
    ok("*** and the reason is that BLOCKED contains js AND mjs -- the Gmail build renames THE WHOLE ENGINE ***",
       /"js"/.test(blocked) && /"mjs"/.test(blocked),
       "BLOCKED = " + blocked.replace(/\s+/g, " ").trim().slice(0, 110) + " ... -- main.js would arrive as main.js.txt");
    const inst = (pkgSrc.match(/async function makeInstallable[\s\S]*?\n\}/) || [""])[0];
    const gmail = (pkgSrc.match(/async function makeGmailSafe\(opts[\s\S]*?\n\}/) || [""])[0];
    ok("...so makeInstallable does NOT call _renameBlocked, and makeGmailSafe still does",
       !!inst && !/_renameBlocked/.test(inst) && !!gmail && /_renameBlocked/.test(gmail),
       "the two builds differ in the one way that matters, and the email build keeps its own behaviour");
    ok("...and it keeps the secret skips, which matter MORE for a public release than for an email",
       /SKIP_FILES/.test(pkgSrc) && /github\.json/.test(pkgSrc) && /_copyTree\(PROJECT_ROOT, dest\)/.test(inst),
       "same _copyTree, so github.json / gmail.json / the token files stay out of the published asset");
    // THE CROSS-FILE CLAIM: the name it emits must satisfy BOTH readers, in two other files.
    const prefix = (inst.match(/opts\.prefix \|\| "([^"]+)"/) || [])[1];
    const name = prefix ? `${prefix}_${gh.engineVersion()}.zip` : "";
    const picker = /^(?:SweK_Engine|EngineProject)_v\d+\.zip$/i;
    const scanner = /(?:EngineProject|SweK[ _]Engine)[ _]v(\d+)\.zip$/i;
    ok("*** the filename it emits satisfies the ASSET PICKER and the DOWNLOADS SCANNER, in two other files ***",
       !!name && picker.test(name) && scanner.test(name), `emits ${name || "(prefix unreadable)"}`);
    const bad = "EngineProject_GmailSafe_" + gh.engineVersion() + ".zip";
    ok("...and the Gmail-safe name would satisfy NEITHER, which is the bug this section exists for",
       !picker.test(bad) && !scanner.test(bad), `${bad} -> picker ${picker.test(bad)}, scanner ${scanner.test(bad)}`);
    report("*** THIS BUG WAS REACHABLE ONLY BY DOING THE THING FOR THE FIRST TIME ***", "publishEngineBuild has " +
           "existed since v1129 and the repo has zero releases, so the one-click 'cut a version' flow had never " +
           "once been run. It would have published an asset in which EVERY JavaScript file was renamed, under a " +
           "filename the installer's scanner cannot match -- two independent failures, either one fatal, neither " +
           "visible from reading the panel. A CAPABILITY NOBODY HAS EXERCISED IS NOT A FEATURE, IT IS AN UNTESTED " +
           "CLAIM, and this whole gate exists because that was true of the entire update source.");
}

console.log("\n8. THE RELEASE BUTTON IS REACHABLE FROM THE OPS PAGE, AND IT IS THE SAME PANEL");
{
    const ENGROOT = path.join(HERE, "..");
    const server = fs.readFileSync(path.join(ENGROOT, "server.html"), "utf8");
    const panel = fs.readFileSync(path.join(ENGROOT, "ui", "githubPanel.js"), "utf8");
    ok("server.html imports the SAME module main.js does, rather than carrying its own copy",
       /import \{ mountGithubPanel \} from "\.\/ui\/githubPanel\.js"/.test(server) &&
       /import \{ mountGithubPanel \}/.test(fs.readFileSync(path.join(ENGROOT, "main.js"), "utf8")),
       "one panel, two hosts -- all six tabs travel and cannot drift apart");
    ok("...and there is a control to open it", /id="ghManagerBtn"/.test(server));
    ok("*** and swekOverlay is EXPOSED, which is the whole reason the button was dead on the first try ***",
       /window\.swekOverlay = swekOverlay/.test(server),
       "it is defined inside an IIFE; a MODULE cannot see a function-scoped name, so the host got a warning and opened nothing");
    ok("...and the panel still declares itself host-agnostic, which is what lets it travel",
       /the Dock provides the minitab/.test(panel) && !/^import /m.test(panel),
       "ui/githubPanel.js has NO imports and no globals -- only its drawer comes from the host");
    report("*** DRIVEN IN A REAL BROWSER, NOT INFERRED FROM THE SOURCE ***", "server.html was served and loaded in " +
           "Chromium, the GitHub tab clicked, the button clicked: the overlay opened, #ghPanelRoot was inside it, " +
           "all six tabs rendered and the release button read back verbatim. THE FIRST RUN FAILED -- typeof " +
           "swekOverlay was FALSE and the button did nothing -- which no amount of reading the diff would have " +
           "shown. THAT IS THE v3227 FAILURE AGAIN: a page that looks perfectly wired while one module is inert, " +
           "and the only evidence is one console line nobody is looking at.");
}

console.log(fails ? `\nengineUpdateSource-selfcheck: ${fails} FAILED` : "\nengineUpdateSource-selfcheck: all checks pass");
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fails ? 1 : 0);
