// WebGLEngine/tools/ship/appInstall-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/appInstall-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/appInstallBridge.js, ui/appInstallPanel.js, the two pages and the three /apps routes: the install buttons for Nectarlink and DuoDesk (unsigned binary installers, never vendored). What this holds is that the bridge
// lives up to its header: only the pinned assets can be named, only GitHub over https can be fetched, a file is staged ONLY if its size and SHA-256 match the pin, a launch needs a confirm and re-hashes first, a .deb is never run,
// an asset for another OS is refused, nothing runs through a shell, and the two routes that write or run are the host's alone (not a tunnel session, which arrives from loopback).
//
// SABOTAGE LOG (26 mutants of ai-bridge/appInstallBridge.js and the /apps routes in server.js, each run against this gate with the original saved beside it and restored; every one red BY NAME):
//   the download: digest check, size check and overflow check each dropped; any host followed, plain http allowed, a lookalike host passing a suffix test, the redirect cap off; a second job allowed; the .part left behind on a refusal.
//   the table: an unknown asset name used as given, prototype keys (__proto__, constructor) reaching the table, the nectarlink repo changed, a real pin changed in the bridge alone.
//   the launch: confirm dropped, a truthy confirm accepted, the re-hash skipped, the OS check and the architecture check dropped, a .deb run, a shell used, the exe spawned bare instead of through explorer.exe, not detached, adb accepting an unauthorized device, an adb failure swallowed.
//   the routes: the local-only guard dropped, the tunnel (cf-ray) request not refused, confirm forced true.
//   Three went 0 red or crashed unnamed on the first pass and each led to a change in the GATE: the swapped pin (the digests are now also written by hand on the pages, so a pin changed in the bridge alone goes red), the prototype keys (the row now catches a throw and names it), and a .deb mutant that was a syntax error. Two real defects in the BRIDGE were found by running the gate repeatedly: a flake where a destroyed write stream recreated the .part file after it was unlinked (the file is now removed after the stream closes), and a rename while the handle was still open, which fails on Windows (the stage now waits for close, not finish).
// NOT CHECKED, said plainly: a real download from github.com, a real installer starting, a real adb install (none was run on this build box); and that the pinned binaries are SAFE (they were hashed, not audited).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("appInstall-selfcheck -- pinned installers for Nectarlink and DuoDesk\n");

const B = require_(path.join(ENG, "ai-bridge", "appInstallBridge.js"));
const src = fs.readFileSync(path.join(ENG, "ai-bridge", "appInstallBridge.js"), "utf8"), code = src.replace(/^\s*\/\/.*$/gm, "");
const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-apps-"));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f) => { for (let i = 0; i < 200; i++) { if (f()) return true; await sleep(10); } return false; };
const settle = () => sleep(60);   // a failed download removes its .part when the write stream CLOSES, a moment after the job reports done

// a fake https.get: `plan` maps a URL to { status, headers, body } and records what was asked
function fakeGet(plan, asked) {
    return (u, _opts, cb) => {
        const url = String(u); asked.push(url);
        const p = plan[url] || { status: 404, body: Buffer.alloc(0) };
        const res = Readable.from([p.body || Buffer.alloc(0)]); res.statusCode = p.status || 200; res.headers = p.headers || {};
        const req = new EventEmitter(); setImmediate(() => cb(res)); return req;
    };
}
const body = Buffer.from("pretend installer bytes ".repeat(40));
// the real table is frozen; the gate runs the real code path against a COPY whose pins are its own bytes
const copyTable = () => JSON.parse(JSON.stringify(B.APPS));
const TBL = copyTable(); B.configure({ apps: TBL });
const A = TBL.nectarlink.assets[0];
const pinAs = (b) => { A.bytes = b.length; A.sha256 = sha(b); };
const restore = () => {};

// ---- 1. THE TABLE ---------------------------------------------------------------------------------------------------
{
    console.log("1. THE PINS");
    const all = Object.values(B.APPS).flatMap((a) => a.assets.map((x) => ({ app: a, x })));
    ok("nine pinned assets (2 Nectarlink, 7 DuoDesk), each with a 64-hex SHA-256, a size and an https github.com release URL", all.length === 9 && all.every(({ x }) => /^[0-9a-f]{64}$/.test(x.sha256) && x.bytes > 1e6 && new RegExp("^https://github\\.com/[^/]+/[^/]+/releases/download/v[0-9.]+/" + x.name.replace(/[.+]/g, "\\$&") + "$").test(x.url)));
    ok("no two assets share a digest (a copy-paste pin would)", new Set(all.map(({ x }) => x.sha256)).size === 9);
    ok("the repos are the ones Keith named: thtbee/nectarlink and 0xCodez/DuoDesk", B.APPS.nectarlink.repo === "thtbee/nectarlink" && B.APPS.duodesk.repo === "0xCodez/DuoDesk" && all.every(({ app, x }) => x.url.includes("/" + app.repo + "/")));
    const pages = { nectarlink: fs.readFileSync(path.join(ENG, "nectarlink.html"), "utf8"), duodesk: fs.readFileSync(path.join(ENG, "duodesk.html"), "utf8") };
    ok("!! every pinned asset's URL is also the link on its page (the page and the pin cannot name different files)", all.every(({ app, x }) => pages[app.id].includes(x.url) || (x.kind === "deb" && pages[app.id].includes(x.url))), all.filter(({ app, x }) => !pages[app.id].includes(x.url)).map(({ x }) => x.name).join(", ") || "all present");
    ok("!! every pinned SHA-256 and size is ALSO written, by hand, on its page (a second copy, so a pin changed in the bridge alone goes red here)", all.every(({ app, x }) => pages[app.id].includes(x.sha256) && pages[app.id].includes(String(x.bytes))), all.filter(({ app, x }) => !pages[app.id].includes(x.sha256)).map(({ x }) => x.name).join(", ") || "all present");
    ok("host choice: Windows x64 gets the x64 exe, Windows arm64 the arm64 exe, a Mac the dmg, Linux the AppImage over the deb, and an Intel Mac nothing", B.recommended(B.APPS.duodesk, "win32", "x64").kind === "exe" && B.recommended(B.APPS.duodesk, "win32", "arm64").name.includes("arm64") && B.recommended(B.APPS.duodesk, "darwin", "arm64").kind === "dmg" && B.recommended(B.APPS.duodesk, "linux", "x64").kind === "appimage" && B.recommended(B.APPS.duodesk, "darwin", "x64") === null && B.recommended(B.APPS.nectarlink, "linux", "x64") === null);
}

// ---- 2. DOWNLOAD: only the pinned bytes are kept --------------------------------------------------------------------
{
    console.log("\n2. DOWNLOAD");
    const stage = path.join(tmp, "stage"); const asked = [];
    pinAs(body); B.configure({ stageDir: stage, platform: "win32", arch: "x64" });
    B.configure({ get: fakeGet({ [A.url]: { status: 200, body } }, asked) });
    let r = B.download("nectarlink", A.name); await until(() => B.status().job.done);
    ok("!! the exact pinned bytes are staged, the job says ok, and the .part file is gone", r.started && B.status().job.ok && fs.existsSync(path.join(stage, "nectarlink", A.name)) && !fs.existsSync(path.join(stage, "nectarlink", A.name + ".part")));
    ok("...and verify() re-hashes it and agrees; status() marks it staged", B.verify("nectarlink", A.name).verified === true && B.status().apps.find((a) => a.id === "nectarlink").assets[0].staged === true);

    fs.rmSync(stage, { recursive: true, force: true }); asked.length = 0;
    const evil = Buffer.from(body); evil[3] ^= 1;
    B.configure({ get: fakeGet({ [A.url]: { status: 200, body: evil } }, asked) });
    B.download("nectarlink", A.name); await until(() => B.status().job.done); await settle();
    ok("!! a download of the right SIZE and the wrong bytes is REFUSED and nothing is left on disk", !B.status().job.ok && /does not match the pin/.test(B.status().job.error) && !fs.existsSync(path.join(stage, "nectarlink", A.name)) && !fs.existsSync(path.join(stage, "nectarlink", A.name + ".part")), B.status().job.error);

    B.configure({ get: fakeGet({ [A.url]: { status: 200, body: Buffer.concat([body, Buffer.from("extra")]) } }, asked) });
    B.download("nectarlink", A.name); await until(() => B.status().job.done); await settle();
    ok("!! more bytes than the pin is refused (a stream cannot fill the disk)", !B.status().job.ok && /more bytes than the pin/.test(B.status().job.error) && !fs.existsSync(path.join(stage, "nectarlink", A.name + ".part")), B.status().job.error);

    B.configure({ get: fakeGet({ [A.url]: { status: 200, body: body.subarray(0, 100) } }, asked) });
    B.download("nectarlink", A.name); await until(() => B.status().job.done);
    ok("a short download is refused", !B.status().job.ok && /bytes arrived/.test(B.status().job.error));

    // redirects: github -> objects.githubusercontent.com is followed; off GitHub and plain http are not
    const CDN = "https://objects.githubusercontent.com/x/abc";
    B.configure({ get: fakeGet({ [A.url]: { status: 302, headers: { location: CDN } }, [CDN]: { status: 200, body } }, asked) });
    asked.length = 0; B.download("nectarlink", A.name); await until(() => B.status().job.done);
    ok("a redirect to GitHub's own release host is followed and the file staged", B.status().job.ok && asked.includes(CDN));
    fs.rmSync(stage, { recursive: true, force: true });
    for (const [why, loc] of [["another host", "https://evil.example/x"], ["plain http", "http://objects.githubusercontent.com/x"], ["a lookalike host", "https://github.com.evil.example/x"]]) {
        asked.length = 0; B.configure({ get: fakeGet({ [A.url]: { status: 302, headers: { location: loc } }, [loc]: { status: 200, body } }, asked) });
        B.download("nectarlink", A.name); await until(() => B.status().job.done);
        ok("!! a redirect to " + why + " is REFUSED and never requested", !B.status().job.ok && /refused/.test(B.status().job.error) && !asked.includes(loc), B.status().job.error);
    }
    const loop = { [A.url]: { status: 302, headers: { location: A.url } } };
    B.configure({ get: fakeGet(loop, asked) }); B.download("nectarlink", A.name); await until(() => B.status().job.done);
    ok("a redirect loop stops (at most 5 hops)", !B.status().job.ok && /redirects/.test(B.status().job.error));
    B.configure({ get: fakeGet({}, asked) }); B.download("nectarlink", A.name); await until(() => B.status().job.done);
    ok("an HTTP error is an error, not an empty file", !B.status().job.ok && /HTTP 404/.test(B.status().job.error));

    // names come from the table, never from the request
    asked.length = 0; B.configure({ get: fakeGet({}, asked) });
    const bad = ["../../etc/passwd", A.name + "/..", "", "DuoDesk-2.5.0.apk", A.name.toUpperCase()].map((n) => B.download("nectarlink", n));
    ok("!! a name the table does not hold (a path walk, a case change, another app's file) starts nothing and requests nothing", bad.every((x) => x.ok === false) && asked.length === 0);
    const safe = (f) => { try { return f(); } catch (e) { return { ok: "THREW " + e.message }; } };
    ok("!! an unknown app, and prototype keys (__proto__, constructor, toString), are REFUSED and never throw", safe(() => B.download("nope", A.name)).ok === false && safe(() => B.download("__proto__", A.name)).ok === false && safe(() => B.download("constructor", "x")).ok === false && safe(() => B.verify("toString", "x")).ok === false && safe(() => B.launch("__proto__", "x", { confirm: true })) instanceof Promise);
    // one job at a time
    B.configure({ get: (u, o, cb) => new EventEmitter() });   // never answers
    B.download("nectarlink", A.name); const second = B.download("nectarlink", A.name);
    ok("a second download while one runs is refused", second.ok === false && /already running/.test(second.error));
    B.configure({ get: fakeGet({ [A.url]: { status: 200, body } }, asked) });
    // (the hung job is abandoned by replacing the module state through a fresh require below)
}

// ---- 3. LAUNCH -----------------------------------------------------------------------------------------------------------
{
    console.log("\n3. LAUNCH");
    delete require_.cache[require_.resolve(path.join(ENG, "ai-bridge", "appInstallBridge.js"))];
    const L = require_(path.join(ENG, "ai-bridge", "appInstallBridge.js")); L.configure({ apps: JSON.parse(JSON.stringify(L.APPS)) });
    const stage = path.join(tmp, "launch"), calls = [];
    const LT = JSON.parse(JSON.stringify(L.APPS)); L.configure({ apps: LT }); const LaT = LT.duodesk.assets;
    const mk = (kind) => LaT.find((x) => x.kind === kind);
    const stageFake = (a, bytes) => { const dir = path.join(stage, "duodesk"); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, a.name), bytes); };
    const pin = (a, b) => { a.bytes = b.length; a.sha256 = sha(b); };
    const spawn = (cmd, args, o) => { calls.push({ cmd, args, o }); const e = new EventEmitter(); e.unref = () => {}; return e; };
    const adb = { devices: "List of devices attached\nR58M123\tdevice\n", install: null };
    const execFile = (cmd, args, o, cb) => { calls.push({ cmd, args }); if (args[0] === "devices") return cb(null, adb.devices, ""); return cb(adb.install, "Success", adb.install ? "failure" : ""); };
    L.configure({ stageDir: stage, spawn, execFile, platform: "win32", arch: "x64" });
    const exe = mk("exe"), good = Buffer.from("exe-bytes".repeat(500)); pin(exe, good); stageFake(exe, good);
    let r = await L.launch("duodesk", exe.name);
    ok("!! a launch without confirm:true runs nothing", r.ok === false && /confirm/.test(r.error) && calls.length === 0);
    r = await L.launch("duodesk", exe.name, { confirm: "yes" });
    ok("...and a truthy-but-not-true confirm is not a confirm", r.ok === false && calls.length === 0);
    r = await L.launch("duodesk", exe.name, { confirm: true });
    ok("!! with confirm, the staged exe is handed to explorer.exe as ONE argument, detached, with no shell", r.ok && r.launched && calls.length === 1 && calls[0].cmd === "explorer.exe" && calls[0].args.length === 1 && calls[0].args[0].endsWith(exe.name) && calls[0].o.detached === true && calls[0].o.shell !== true);
    calls.length = 0; fs.writeFileSync(path.join(stage, "duodesk", exe.name), Buffer.concat([good, Buffer.from("x")]));
    r = await L.launch("duodesk", exe.name, { confirm: true });
    ok("!! a staged file changed after the download is REFUSED at launch (it is re-hashed every time)", r.ok === false && /does not match the pin/.test(r.error) && calls.length === 0, r.error);
    r = await L.launch("duodesk", mk("dmg").name, { confirm: true });
    ok("a pinned asset that was never downloaded is refused", r.ok === false && /not downloaded/.test(r.error) && calls.length === 0);

    const dmg = mk("dmg"), dmgB = Buffer.from("dmg".repeat(900)); pin(dmg, dmgB); stageFake(dmg, dmgB);
    r = await L.launch("duodesk", dmg.name, { confirm: true });
    ok("!! an asset built for another OS (a dmg on Windows) is refused even when it is staged and verified", r.ok === false && /darwin/.test(r.error) && calls.length === 0, r.error);
    L.configure({ platform: "darwin", arch: "arm64" }); r = await L.launch("duodesk", dmg.name, { confirm: true });
    ok("on a Mac, the dmg is opened with `open`", r.ok && calls.at(-1).cmd === "open" && calls.at(-1).args[0].endsWith(dmg.name));
    L.configure({ platform: "darwin", arch: "x64" }); calls.length = 0; r = await L.launch("duodesk", dmg.name, { confirm: true });
    ok("...but the arm64 dmg is refused on an Intel Mac", r.ok === false && /arm64/.test(r.error) && calls.length === 0);

    const deb = mk("deb"), debB = Buffer.from("deb".repeat(700)); pin(deb, debB); stageFake(deb, debB);
    L.configure({ platform: "linux", arch: "x64" }); calls.length = 0; r = await L.launch("duodesk", deb.name, { confirm: true });
    ok("!! a .deb is NEVER executed: the sudo command is returned for the user to run", r.ok && r.launched === false && /sudo apt install/.test(r.note) && calls.length === 0);
    const ai = mk("appimage"), aiB = Buffer.from("ai".repeat(800)); pin(ai, aiB); stageFake(ai, aiB);
    r = await L.launch("duodesk", ai.name, { confirm: true });
    ok("an AppImage is marked executable and run directly", r.ok && (fs.statSync(path.join(stage, "duodesk", ai.name)).mode & 0o111) !== 0 && calls.at(-1).cmd.endsWith(ai.name));

    const apk = mk("apk"), apkB = Buffer.from("apk".repeat(600)); pin(apk, apkB); stageFake(apk, apkB);
    calls.length = 0; r = await L.launch("duodesk", apk.name, { confirm: true });
    ok("an apk is installed with `adb -s <device> install -r` when a device is attached", r.ok && r.launched && calls.at(-1).cmd === "adb" && calls.at(-1).args.join(" ").startsWith("-s R58M123 install -r "), calls.at(-1).args.join(" ").slice(0, 60));
    adb.devices = "List of devices attached\nR58M123\tunauthorized\n"; calls.length = 0; r = await L.launch("duodesk", apk.name, { confirm: true });
    ok("...an unauthorized device is not a device: the path and the sideload steps are returned instead", r.ok && r.launched === false && /Play Protect/.test(r.note) && !calls.some((c) => c.args[0] === "-s"));
    adb.devices = "List of devices attached\nR58M123\tdevice\n"; adb.install = new Error("INSTALL_FAILED"); r = await L.launch("duodesk", apk.name, { confirm: true });
    ok("an adb failure is reported, not swallowed", r.ok === false && /adb install failed/.test(r.error));
    L.configure({ platform: "darwin" }); adb.install = null; r = await L.launch("duodesk", apk.name, { confirm: true });
    ok("an apk does not care what the host OS is (it goes to the phone)", r.ok && r.launched);
}

// ---- 4. THE SOURCE, THE ROUTES AND THE PAGES ------------------------------------------------------------------------------
{
    console.log("\n4. THE SOURCE, THE ROUTES, THE PAGES");
    ok("!! nothing in the bridge goes through a shell: no `shell: true`, no exec(, no execSync, no template-built command", !/shell\s*:\s*true/.test(code) && !/\b(exec|execSync|spawnSync)\s*\(/.test(code.replace(/execFile/g, "")) && !/child_process["']\)\.exec\b/.test(code));
    ok("the bridge writes only under its stage directory (the sole path join takes the app id and an asset name FROM THE TABLE)", (code.match(/path\.join\(/g) || []).length <= 4 && /findAsset\(id, name\)/.test(code));
    ok("only GitHub's three release hosts are fetchable, https only", /GH_HOSTS/.test(code) && B.GH_HOSTS.every((h) => /(^|\.)github(usercontent)?\.com$/.test(h)) && /https only/.test(code));
    const routeBlock = server.slice(server.indexOf('"/apps/status"') - 200, server.indexOf("// --- grdpwasm"));
    ok("!! /apps/download and /apps/launch refuse a non-local request AND a tunnel request (cloudflared connects from loopback, so _isLocalReq alone would let a Public-tunnel viewer run a file on the host)", /\/apps\/download[\s\S]*\/apps\/launch/.test(routeBlock) && /!_isLocalReq\(req\) \|\| _isRemoteReq\(req\)/.test(routeBlock) && routeBlock.indexOf("_isRemoteReq(req)") < routeBlock.indexOf("readJson"));
    ok("...launch is passed `confirm` only as the literal true from the body, nothing else from the request reaches a command", /confirm: d\.confirm === true/.test(routeBlock));
    const panel = fs.readFileSync(path.join(ENG, "ui", "appInstallPanel.js"), "utf8");
    for (const f of ["nectarlink.html", "duodesk.html"]) { const h = fs.readFileSync(path.join(ENG, f), "utf8"); ok(f + " mounts the panel for its own app id and keeps the plain download links", new RegExp('mountAppInstall\\(.*"' + f.replace(".html", "") + '"\\)').test(h) && /releases\/download/.test(h) && /not code-signed|unsigned/i.test(h)); }
    const { describePanel } = await import(path.join(ENG, "ui", "appInstallPanel.js"));
    const st = (o) => ({ ok: true, local: true, host: { platform: "linux", arch: "x64" }, job: null, apps: [{ id: "duodesk", name: "DuoDesk", version: "2.5.0", recommended: "a.AppImage", assets: [{ name: "a.AppImage", kind: "appimage", platform: "linux", arch: "x64", bytes: 5e6, sha256: "0".repeat(64), staged: false }, { name: "b.deb", kind: "deb", platform: "linux", arch: "x64", bytes: 5e6, sha256: "1".repeat(64), staged: false }] }], ...o });
    ok("panel: local host, nothing staged -> can download, cannot run", (() => { const p = describePanel(st(), "duodesk"); return p.canDownload && !p.canRun; })());
    ok("!! panel: a REMOTE session gets neither button", (() => { const p = describePanel(st({ local: false }), "duodesk"); return !p.canDownload && !p.canRun && p.local === false; })());
    ok("panel: staged -> run, no re-download; running job -> no second download; a failed job shows its error", (() => { const s = st(); s.apps[0].assets[0].staged = true; const a = describePanel(s, "duodesk"); const j = describePanel(st({ job: { id: "duodesk", name: "a", received: 1, total: 4, done: false } }), "duodesk"); const e = describePanel(st({ job: { id: "duodesk", done: true, ok: false, error: "digest" } }), "duodesk"); return a.canRun && !a.canDownload && j.busy && !j.canDownload && j.progress === 0.25 && e.error === "digest"; })());
    ok("panel: no bridge, an unknown app, and a machine with no pinned build all say so instead of throwing", !describePanel({ ok: false, error: "down" }, "duodesk").available && !describePanel(st(), "x").available && /no pinned installer/.test(describePanel(st({ apps: [{ ...st().apps[0], recommended: null }] }), "duodesk").noneForHost));
}

restore(); fs.rmSync(tmp, { recursive: true, force: true });
console.log("\nappInstall-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
