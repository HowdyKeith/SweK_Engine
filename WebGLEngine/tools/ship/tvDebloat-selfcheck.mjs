// WebGLEngine/tools/ship/tvDebloat-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/tvDebloat-selfcheck.mjs
//
// GRADES tv/tvDebloat.mjs, the DRY-RUN planner for turning packages off on an Android TV. The planner executes nothing, so
// this gate can drive every rule on fixture TVs; what it cannot do is show that a plan is safe on a real one -- that is a TV.
//
// THE RULES UNDER TEST, each driven on a fixture AND (core, never) as a property over the whole baked record:
//   core and never are refused whoever asks and whatever `allow` says; contested/keep/mixed/unknown only when NAMED in allow;
//   a non-package name is refused before any command is built; a stock launcher goes only through the Home guard; setupwraith
//   goes only when the saved Wi-Fi networks were read and are not its own; already-disabled and not-installed are never planned,
//   so undo cannot turn on something the owner had off; the module has no I/O at all.
//
// SECTION 8 (the command, tools/ship/takeTvPlan.mjs) SABOTAGES, same rule -- a disable-user write added to the --adb reads: 2 red (exactly-four; no-writes) | a fifth read: 1 | the plan file always
// written: 1 | the --adb value not checked: 1 | the plan no longer saying it changed nothing: 1 | the undo script with an enable for every installed package: 1, AFTER IT WENT 0 RED THE FIRST TIME --
// the row only asked that every undo line be shaped like an enable, and the sabotaged ones were; it now compares the undo's packages to the plan's, reversed.
// SABOTAGES (each applied to the real tv/tvDebloat.mjs, run, restored md5-identical; every one red BY NAME; the number is rows red):
//   name validation off ........................... 1 (the eight injection shapes)        core refusal off ............................. 2 (core row + the whole-record property)
//   never refusal off ............................. 2 (never row + the property)          unnamed contested allowed .................... 1
//   impostor homes counted as homes (the setup wizard, settings, provision list emptied) ... 1     the FallbackHome/factory-test regexes emptied ... 1
//   claimant disabled in the same plan counted .... 1                                      unreadable Wi-Fi -> setupwraith planned ...... 2 (the stays-on row + the undo row)
//   already-disabled planned anyway ............... 3 (default plan, undo script, skip row)  an import of node:fs added ................. 1 (the no-I/O row)
//   launcher disabled blind (no Home claims read) . 1                                      Wi-Fi owned by setupwraith ignored ........... 1
//   TWO of the first eleven went 0 red and neither was a pass: the "impostor homes" sabotage was a syntax error that crashed the gate (a crash prints no FAIL line), and the
//   unreadable-Wi-Fi one threw a TypeError on null (same). Both redone as clean edits that load -- a sabotage that crashes the gate proves nothing about the row.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeKnowledge } from "../../tv/tvPackages.mjs";
import { planDebloat, parsePmList, parseHomeClaims, parseWifiOwners, SETUPWRAITH } from "../../tv/tvDebloat.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const rec = JSON.parse(fs.readFileSync(path.join(ENG, "tv", "tvPackages.json"), "utf8"));
const K = makeKnowledge(rec);
const LAUNCHERX = "com.google.android.apps.tv.launcherx";

console.log("tvDebloat-selfcheck -- the dry-run planner\n");

console.log("1. THE THREE PARSERS");
{
    const pm = "package:com.a.b\r\npackage:com.c.d  \r\nnot a line\r\npackage:bad name\r\npackage:com.a.b\r\npackage:x\r\n";
    ok("!! `pm list packages` is parsed: CRLF, the prefix, duplicates and junk (a name with a space, a single word) dropped", JSON.stringify(parsePmList(pm)) === JSON.stringify(["com.a.b", "com.c.d"]), JSON.stringify(parsePmList(pm)));
    ok("an empty or missing read parses to nothing, not a throw", parsePmList("").length === 0 && parsePmList(null).length === 0 && parsePmList(undefined).length === 0);
    const hc = parseHomeClaims("priority=0 preferredOrder=0\r\ncom.x.home/.HomeActivity\r\ncom.tcl.keycustomfunctionservice/.FallbackHome\r\n  junk\r\n");
    ok("home claims are the pkg/Activity lines only", JSON.stringify(hc) === JSON.stringify(["com.tcl.keycustomfunctionservice/.FallbackHome", "com.x.home/.HomeActivity"]), JSON.stringify(hc));
    ok("!! Wi-Fi owners are the cname= tokens, and a read that shows none is NULL (unknown), not an empty list (known to be none)",
        JSON.stringify(parseWifiOwners("netId=1 cname=com.google.android.tungsten.setupwraith/.X cname=android.uid.system")) === JSON.stringify(["android.uid.system", "com.google.android.tungsten.setupwraith/.X"]) && parseWifiOwners("dumpsys wifi blah") === null && parseWifiOwners("") === null);
}

const tv = (over = {}) => ({
    installed: ["com.google.android.feedback", "com.google.android.play.games", "com.google.android.gms", "com.android.systemui", "com.android.providers.media", "com.google.android.katniss", SETUPWRAITH, LAUNCHERX, "com.x.unknown", "com.google.android.videos"],
    disabled: [], homeClaims: [], wifiOwners: ["android.uid.system"], homePackage: null, ...over,
});
const pk = (plan) => plan.steps.map((s) => s.pkg);

console.log("\n2. THE DEFAULT PLAN");
{
    const t = tv({ disabled: ["com.google.android.videos"] });
    const before = JSON.stringify(t);
    const plan = planDebloat(K, t);
    ok("!! by default it plans only SAFE packages that are installed and not already off", JSON.stringify(pk(plan)) === JSON.stringify(["com.google.android.feedback", "com.google.android.play.games"]), pk(plan).join(", "));
    ok("it says it executes nothing, and every command is exactly `pm disable-user --user 0 <package>`",
        plan.executes === false && plan.steps.every((s) => s.command === "pm disable-user --user 0 " + s.pkg && s.ask === true));
    ok("!! the undo script re-enables EXACTLY the planned packages, in reverse, and not the one the owner already had off",
        plan.undoScript.split("\n").filter((l) => l.startsWith("adb ")).map((l) => l.split(" ").pop()).join(",") === "com.google.android.play.games,com.google.android.feedback" && !plan.undoScript.includes("com.google.android.videos"));
    ok("the backup holds the state before: what was installed, what was off, and who owned Home", plan.backup.installed.length === t.installed.length && plan.backup.disabled[0] === "com.google.android.videos");
    ok("the input is not mutated, and the same input gives the same plan", JSON.stringify(t) === before && JSON.stringify(planDebloat(K, t)) === JSON.stringify(plan));
    ok("the summary adds up", plan.summary.planned === plan.steps.length && plan.summary.requested === 3, JSON.stringify(plan.summary));
}

console.log("\n3. WHAT IS REFUSED, AND WHO CAN OVERRIDE");
{
    const everything = tv().installed;
    const plan = planDebloat(K, tv(), { request: everything, allow: everything });
    const refused = (p) => plan.refusals.some((r) => r.pkg === p);
    ok("!! core is refused even when it is requested AND named in allow", refused("com.android.systemui") && refused("com.android.providers.media") && !pk(plan).includes("com.android.systemui"));
    ok("!! never is refused even when requested AND named in allow", refused("com.google.android.gms") && !pk(plan).includes("com.google.android.gms"));
    const noAllow = planDebloat(K, tv(), { request: ["com.google.android.katniss", "com.x.unknown", SETUPWRAITH] });
    ok("!! contested (katniss, setupwraith) and unknown are refused unless named, and the refusal says why", ["com.google.android.katniss", "com.x.unknown", SETUPWRAITH].every((p) => noAllow.refusals.some((r) => r.pkg === p && /allow/.test(r.why))), noAllow.refusals.map((r) => r.pkg + ":" + r.class).join(" "));
    const named = planDebloat(K, tv(), { request: ["com.google.android.katniss", "com.x.unknown"], allow: ["com.google.android.katniss", "com.x.unknown"] });
    ok("named in allow, they ARE planned -- and the plan marks them ALLOWED BY NAME, so the owner's choice is on the record",
        pk(named).join() === "com.x.unknown,com.google.android.katniss" && named.steps.every((s) => s.allowedByName && /ALLOWED BY NAME/.test(s.why)), pk(named).join());
    const evil = ["com.x; reboot", "com.x && rm -rf /", "$(id)", "com.x com.y", "", "x", "com..x", "a.b\nc.d"];
    const ep = planDebloat(K, tv({ installed: ["com.x"] }), { request: evil, allow: evil });
    ok("!! a name that is not a package name is refused BEFORE a command is built: eight injection shapes, none reaches a step, no command carries a ;, &, $ or newline",
        ep.steps.length === 0 && ep.refusals.length === evil.length && !/[;&$\n]/.test(ep.steps.map((s) => s.command).join("")), ep.refusals.length + " refused");
    const nonString = planDebloat(K, tv(), { request: [null, 42, {}] });
    ok("a request that is not even a string is refused, not thrown on", nonString.steps.length === 0 && nonString.refusals.length === 3);
}

console.log("\n4. THE PROPERTY, OVER THE WHOLE BAKED RECORD");
{
    const all = [...new Set([...rec.detox.never, ...rec.detox.keep, ...rec.detox.safe, ...rec.detox.launchers, ...rec.freemytv.debloat, ...Object.keys(rec.vibehack.freq)])];
    const plan = planDebloat(K, { installed: all, disabled: [], homeClaims: [], wifiOwners: ["android.uid.system"], homePackage: null }, { request: all, allow: all });
    const hard = all.filter((p) => ["core", "never"].includes(K.verdict(p).class));
    ok("!! with EVERY package installed, requested and allowed, not one core or never package is planned", hard.length > 40 && hard.every((p) => !pk(plan).includes(p) && plan.refusals.some((r) => r.pkg === p)), hard.length + " core/never packages, " + pk(plan).length + " planned");
    ok("!! and no launcher is planned when nothing says another home screen would answer", rec.detox.launchers.every((p) => !pk(plan).includes(p)));
    say(pk(plan).length + " of " + all.length + " packages planned when everything is allowed; " + plan.refusals.length + " refused, " + plan.skipped.length + " skipped");
}

console.log("\n5. THE HOME GUARD");
{
    const req = { request: [LAUNCHERX] };
    const home = (claims, extra = {}) => planDebloat(K, tv({ homeClaims: claims, homePackage: claims[0] ? claims[0].split("/")[0] : null, ...extra }), req);
    ok("!! launcherx alone answers Home -> it STAYS ON", home([LAUNCHERX + "/.home.HomeActivity"]).steps.length === 0 && home([LAUNCHERX + "/.home.HomeActivity"]).skipped.some((s) => s.pkg === LAUNCHERX && /no other real home/.test(s.why)));
    ok("!! another real home screen answers too -> launcherx may go, and the plan names who answers", (() => { const p = home([LAUNCHERX + "/.H", "com.sweK.tv/.LauncherActivity"], { installed: [...tv().installed, "com.sweK.tv"] }); return pk(p).join() === LAUNCHERX && /com\.sweK\.tv will answer Home/.test(p.steps[0].why); })());
    const notHomes = [SETUPWRAITH + "/.RecoveryActivity", "com.android.tv.settings/.system.FallbackHome", "com.tcl.keycustomfunctionservice/.FallbackHome", "com.duokan.factorytest/.FactoryLauncher", "com.android.settings/.Home", "com.android.provision/.Home"];
    ok("!! the setup wizard, the settings apps, a vendor FallbackHome and a factory-test launcher do NOT count as a home screen", notHomes.every((c) => home([LAUNCHERX + "/.H", c]).steps.length === 0), notHomes.length + " impostors");
    ok("!! a claimant that would be disabled in the same plan does not count either", planDebloat(K, tv({ homeClaims: [LAUNCHERX + "/.H", "com.google.android.katniss/.Home"], installed: [...tv().installed] }), { request: [LAUNCHERX, "com.google.android.katniss"], allow: ["com.google.android.katniss"] }).steps.every((s) => s.pkg !== LAUNCHERX));
    ok("!! it cannot tell who owns Home (no claims read) -> a launcher is never disabled blind", planDebloat(K, tv({ homeClaims: [], homePackage: null }), req).skipped.some((s) => /blind/.test(s.why)));
    ok("a launcher that is not installed, or already off, is skipped with its reason", planDebloat(K, tv({ installed: ["com.x.a"] }), req).skipped.some((s) => /not installed/.test(s.why)) && planDebloat(K, tv({ disabled: [LAUNCHERX], homeClaims: ["com.q.r/.H"] }), req).skipped.some((s) => /already disabled/.test(s.why)));
}

console.log("\n6. SETUPWRAITH AND THE SAVED WI-FI");
{
    const ask = { request: [SETUPWRAITH], allow: [SETUPWRAITH] };
    ok("!! the saved networks could not be read -> setupwraith STAYS ON", planDebloat(K, tv({ wifiOwners: null }), ask).steps.length === 0 && planDebloat(K, tv({ wifiOwners: null }), ask).skipped.some((s) => /could not read/.test(s.why)));
    ok("!! a saved network belongs to setupwraith -> it stays on, and the skip says how to free it", (() => { const p = planDebloat(K, tv({ wifiOwners: [SETUPWRAITH + "/.W"] }), ask); return p.steps.length === 0 && p.skipped.some((s) => /belongs to it/.test(s.why)); })());
    ok("the networks were read and belong to the system -> it may go (it is contested, so only because it was named)", pk(planDebloat(K, tv({ wifiOwners: ["android.uid.system"] }), ask)).join() === SETUPWRAITH);
    ok("a skipped setupwraith is not in the undo script", !planDebloat(K, tv({ wifiOwners: null }), ask).undoScript.includes(SETUPWRAITH));
}

console.log("\n7. NOT INSTALLED, ALREADY OFF, AND NO I/O");
{
    const p = planDebloat(K, tv({ installed: ["com.google.android.feedback"], disabled: ["com.google.android.feedback"] }), { request: ["com.google.android.feedback", "com.google.android.play.games"] });
    ok("!! already off and not installed are skipped with a reason, neither is in the plan or the undo", p.steps.length === 0 && p.skipped.length === 2 && !/adb /.test(p.undoScript.replace(/^#.*$/gm, "")));
    const src = fs.readFileSync(path.join(ENG, "tv", "tvDebloat.mjs"), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    ok("!! the module has NO I/O: no import, no require, no process, no fetch, no child_process, no fs -- it cannot execute a plan, only describe one",
        !/\bimport\s|\brequire\s*\(|\bprocess\.|\bfetch\s*\(|child_process|\bfs\b|XMLHttpRequest|WebSocket/.test(src), "checked on the code with comments stripped");
}

console.log("\n8. THE COMMAND (tools/ship/takeTvPlan.mjs): FILES IN, A PLAN OUT, AND WITH --adb ONLY FOUR READS");
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-tvplan-"));
    const w = (n, t) => { const f = path.join(dir, n); fs.writeFileSync(f, t); return f; };
    const pm = w("pm.txt", "package:com.google.android.feedback\r\npackage:com.google.android.play.games\r\npackage:com.android.systemui\r\npackage:com.google.android.gms\r\npackage:com.google.android.apps.tv.launcherx\r\n");
    const pmd = w("pmd.txt", "package:com.google.android.play.games\n"), home = w("home.txt", "priority=0\ncom.google.android.apps.tv.launcherx/.home.HomeActivity\n"), wifi = w("wifi.txt", "netId=1 cname=android.uid.system\n");
    const cmd = path.join(ENG, "tools", "ship", "takeTvPlan.mjs");
    const run = (args, env = {}) => spawnSync(process.execPath, [cmd, ...args], { encoding: "utf8", cwd: dir, env: { ...process.env, ...env } });
    const before = fs.readdirSync(dir).sort().join();
    const r = run(["--installed", pm, "--disabled", pmd, "--home", home, "--wifi", wifi, "--request", "com.google.android.feedback,com.google.android.play.games,com.android.systemui,com.google.android.gms,com.google.android.apps.tv.launcherx"]);
    ok("!! files in, a plan out: it disables only the one safe, installed, not-already-off package; core and never are REFUSED; the launcher stays (nothing else answers Home); and it says it changed nothing", r.status === 0 &&
        /would disable 1, skipped 2, refused 2/.test(r.stdout) && /disable  com\.google\.android\.feedback/.test(r.stdout) && /REFUSED  com\.android\.systemui/.test(r.stdout) && /REFUSED  com\.google\.android\.gms/.test(r.stdout) && /NOTHING WAS CHANGED ON THE TV/.test(r.stdout), r.stdout.split("\n")[2]);
    ok("!! it writes NOTHING unless asked: no --out and no --undo leaves the directory as it was", fs.readdirSync(dir).sort().join() === before);
    const out = path.join(dir, "plan.json"), undo = path.join(dir, "undo.sh");
    run(["--installed", pm, "--disabled", pmd, "--home", home, "--wifi", wifi, "--out", out, "--undo", undo]);
    const plan = JSON.parse(fs.readFileSync(out, "utf8"));
    ok("--out holds the plan and the backup of the state before it, --undo re-enables exactly the planned packages", plan.executes === false && plan.backup.installed.length === 5 && plan.backup.disabled[0] === "com.google.android.play.games" &&
        JSON.stringify(fs.readFileSync(undo, "utf8").split("\n").filter((l) => l.startsWith("adb ")).map((l) => l.split(" ").pop())) === JSON.stringify(plan.steps.map((x) => x.pkg).reverse()) &&
        fs.readFileSync(undo, "utf8").split("\n").filter((l) => l.startsWith("adb ")).every((l) => /shell pm enable [\w.]+$/.test(l)));
    ok("no input is refused with a usage line and exit 2, and an unknown option is refused rather than ignored", run([]).status === 2 && run(["--installed", pm, "--disable-everything"]).status === 2);
    ok("!! --adb takes a host or host:port, and a shell-shaped value is refused before anything runs", run(["--adb", "tv; reboot"]).status === 2 && run(["--adb", "$(id)"]).status === 2);
    if (process.platform === "win32") say("the fake-adb check SKIPPED on win32 (its adb stand-in is a shell script). THAT IS A SKIP, NOT A PASS: the four-reads claim is graded on the Linux and macOS boxes.");
    else {
        // a fake adb that records every argument list and answers the four reads
        const bin = path.join(dir, "bin"); fs.mkdirSync(bin);
        const log = path.join(dir, "adb.log");
        fs.writeFileSync(path.join(bin, "adb"), `#!/bin/sh
echo "$@" >> "${log}"
case "$*" in
  *"shell pm list packages -d"*) printf 'package:com.google.android.play.games\n' ;;
  *"shell pm list packages"*) printf 'package:com.google.android.feedback\npackage:com.google.android.play.games\npackage:com.android.systemui\n' ;;
  *query-activities*) printf 'com.example.home/.Home\n' ;;
  *"shell dumpsys wifi"*) printf 'netId=1 cname=android.uid.system\n' ;;
esac
exit 0
`, { mode: 0o755 });
        const a = run(["--adb", "192.168.1.50:5555"], { PATH: bin + path.delimiter + process.env.PATH });
        const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
        const shellCalls = calls.filter((c) => / shell /.test(c));
        const FORBIDDEN = /\b(disable|disable-user|enable|install|uninstall|reboot|clear|settings|svc|setprop|am |monkey|rm |su )\b/;
        ok("!! with --adb it runs EXACTLY four reads on the TV -- the package list, the disabled list, who answers Home, the saved Wi-Fi owners -- and connects once", a.status === 0 && shellCalls.length === 4 && calls.filter((c) => c.startsWith("connect ")).length === 1 &&
            shellCalls.some((c) => /pm list packages$/.test(c)) && shellCalls.some((c) => /pm list packages -d$/.test(c)) && shellCalls.some((c) => /query-activities/.test(c)) && shellCalls.some((c) => /dumpsys wifi$/.test(c)), calls.length + " adb calls: " + calls.map((c) => c.replace("-s 192.168.1.50:5555 ", "")).join(" | ").slice(0, 200));
        ok("!! and not one of those calls is a write: no disable, enable, install, uninstall, reboot, clear, settings, svc or setprop", !calls.some((c) => FORBIDDEN.test(c.replace(/pm list packages -d/, "pm list packages"))), "checked " + calls.length + " calls");
        ok("the plan the fake TV's answers produce is the expected one by default: only feedback is disabled (play.games is SKIPPED: already off; the system UI is not even asked about), and Home is read from the query", /would disable 1, skipped 1, refused 0/.test(a.stdout) && /disable  com\.google\.android\.feedback/.test(a.stdout) && /Home answered by com\.example\.home/.test(a.stdout), a.stdout.split("\n")[2]);
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\ntvDebloat-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

