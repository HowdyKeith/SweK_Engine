// WebGLEngine/tools/ship/ensureBrowserGates-selfcheck.mjs -- UNNUMBERED. Gate for tools/ship/ensureBrowserGates.mjs (auto-install of the browser gates' dependencies under the auto-install cap).
// Run: node tools/ship/ensureBrowserGates-selfcheck.mjs     (installs nothing, reads no network: npm, the prefs file, the disk and the probes are all seams)
// SABOTAGED -- 54 mutants of tools/ship/ensureBrowserGates.mjs, each run against a copy of this gate, 4 at a time, a mutant past 60 s counted red, every one red BY NAME; plus an IDENTITY mutant that reads 0 red (it does).
// FIRST PASS: 6 read 0 red. CUT AS DEAD: the 'only when installs' wrapper around the cap and space checks (the DXC copy has an estimate of 0, so neither limit could fire). ROWS ADDED: the 'free some space' wording; Playwright present with no browser on disk; the folder free space is measured on; both steps in order (install, then the DXC copy). The harness's own first run read the identity mutant red because it still named the other library's file -- found by the identity control.
// Gate time here: under 0.1 s.
"use strict";
import fs from "node:fs";
import * as E from "./ensureBrowserGates.mjs";
import * as SV from "./shipVerdict.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const fwd = (x) => String(x).replace(/\\/g, "/");   // v4906: the rig is Windows, where path.join gives backslashes
const J = JSON.stringify, throws = (f) => { try { f(); return false; } catch { return true; } };

sec("1. THE SETTING (the same numbers as ai-bridge/autoInstall.js)");
ok("!! the default cap is 100 MB and the headroom 3x, as the engine's own auto-install", E.DEFAULT_CAP_MB === 100 && E.HEADROOM === 3);
ok("!! the cap comes from autoCapMB; absent, damaged or non-numeric reads the default; a negative number reads 0 (unlimited); 0 stays 0", E.capFromPrefs('{"autoCapMB":400}') === 400 && E.capFromPrefs("") === 100 && E.capFromPrefs("{not json") === 100 && E.capFromPrefs('{"enabled":true}') === 100 && E.capFromPrefs('{"autoCapMB":"400"}') === 100 && E.capFromPrefs('{"autoCapMB":-5}') === 0 && E.capFromPrefs('{"autoCapMB":0}') === 0);
ok("!! the estimates are 280 MB for the browser and 15 MB for Playwright alone, and say they are guesses in the header", E.EST_MB.browser === 280 && E.EST_MB.playwrightOnly === 15 && /BROAD GUESSES, NOT MEASUREMENTS/.test(fs.readFileSync(new URL("./ensureBrowserGates.mjs", import.meta.url), "utf8")));

sec("2. FREE SPACE");
{
    const st = (bs, av) => () => ({ bsize: bs, bavail: av });
    ok("!! free MB is block size x available blocks, in MB, rounded; an unreadable volume is null (not a refusal)", E.freeMB("/x", { statfs: st(4096, 262144), exists: () => true }) === 1024 && E.freeMB("/x", { statfs: () => { throw new Error("no"); }, exists: () => true }) === null);
    let asked = null; E.freeMB("/a/b/c", { statfs: (d) => { asked = d; return { bsize: 1, bavail: 0 }; }, exists: (d) => d === "/a" });
    ok("!! a folder that does not exist yet is measured on its nearest existing parent", asked === "/a");
}

sec("3. WHAT THE BOX LACKS");
{
    const a = E.needOf({ playwright: false, shellThere: false, dxcNeeded: false }), b = E.needOf({ playwright: false, shellThere: true, dxcNeeded: false }), c = E.needOf({ playwright: true, shellThere: false, dxcNeeded: false }), d = E.needOf({ playwright: true, shellThere: true, dxcNeeded: true });
    ok("!! nothing there: install, 280 MB; Playwright missing with the shell on disk: install, 15 MB; Playwright there with no browser: install, 280 MB; all there with DXC missing: no install, 0 MB, DXC wanted", a.installs && a.estMB === 280 && b.installs && b.estMB === 15 && c.installs && c.estMB === 280 && !d.installs && d.estMB === 0 && d.dxc);
    const pr = (o) => E.probe({ resolve: () => ({ chromium: o.chromium, from: "/x" }), shell: o.shell, exists: () => !!o.shellThere, dxc: () => o.dxc || { needed: false } });
    const none = pr({ chromium: null, shell: "/s/shell", shellThere: false });
    ok("!! the probe reads the tree's own resolvers: neither Playwright nor a shell -> both lacking", none.playwright === false && none.shellThere === false && none.installs);
    const noShell = pr({ chromium: { launch() {} }, shell: "/s/shell", shellThere: false });
    ok("!! Playwright there with NO browser on disk -> the browser download (280 MB), and DXC is not asked about", noShell.playwright === true && noShell.shellThere === false && noShell.installs && noShell.estMB === 280 && !noShell.dxc);
    const onlyShell = pr({ chromium: null, shell: "/s/shell", shellThere: true });
    ok("!! a shell on disk and no Playwright -> only Playwright (15 MB)", onlyShell.playwright === false && onlyShell.shellThere === true && onlyShell.estMB === 15);
    const dx = pr({ chromium: { launch() {} }, shell: "/s/shell", shellThere: true, dxc: { needed: true, ok: true } }), dxNo = pr({ chromium: { launch() {} }, shell: "/s/shell", shellThere: true, dxc: { needed: true, ok: false, why: "no bundle" } });
    ok("!! everything there but DXC missing and copyable -> the DXC step; DXC missing and NOT copyable is reported as a note, never attempted", dx.dxc === true && !dx.installs && dxNo.dxc === false && dxNo.dxcNote === "no bundle");
}

sec("4. THE DECISION");
{
    const n280 = E.needOf({ playwright: false, shellThere: false, dxcNeeded: false }), n15 = E.needOf({ playwright: false, shellThere: true, dxcNeeded: false }), nD = E.needOf({ playwright: true, shellThere: true, dxcNeeded: true });
    ok("!! at the DEFAULT cap the 280 MB browser download is refused, and the refusal names the cap, the estimate and both ways out (the slider, --cap-mb 280)", (() => { const r = E.decide({ need: n280, capMB: 100, free: 50000 }); return r.action === "refuse" && r.reasons.length === 1 && /280 MB/.test(r.reasons[0]) && /cap is 100 MB/.test(r.reasons[0]) && /Auto-Install/.test(r.reasons[0]) && /--cap-mb 280/.test(r.reasons[0]); })());
    ok("!! at a cap of 300 it installs; at exactly 280 it installs (the cap is a limit, not a margin); at 279 it refuses; at 0 (unlimited) it installs", E.decide({ need: n280, capMB: 300, free: 50000 }).action === "install" && E.decide({ need: n280, capMB: 280, free: 50000 }).action === "install" && E.decide({ need: n280, capMB: 279, free: 50000 }).action === "refuse" && E.decide({ need: n280, capMB: 0, free: 50000 }).action === "install");
    ok("!! Playwright alone (15 MB) installs at the default cap", E.decide({ need: n15, capMB: 100, free: 50000 }).action === "install");
    ok("!! free space under 3x the estimate refuses (840 MB wanted for 280: 839 refuses, 840 installs), says how much is free and wanted, and the cap does not rescue it", (() => { const a = E.decide({ need: n280, capMB: 0, free: 839 }); return a.action === "refuse" && /839 MB free/.test(a.reasons[0]) && /840 MB wanted/.test(a.reasons[0]) && /free some space/.test(a.reasons[0]) && E.decide({ need: n280, capMB: 0, free: 840 }).action === "install"; })());
    ok("!! unknown free space is not a refusal; both limits failing gives both reasons", E.decide({ need: n280, capMB: 300, free: null }).action === "install" && E.decide({ need: n280, capMB: 100, free: 10 }).reasons.length === 2);
    ok("!! the steps: the browser install is 'npm', the copy is 'dxc', both when both; nothing missing is 'ready' with no steps; the DXC copy (no download) is never held by the cap or the space", J(E.decide({ need: n280, capMB: 0, free: null }).steps) === J(["npm"]) && J(E.decide({ need: { ...n280, dxc: true }, capMB: 0, free: null }).steps) === J(["npm", "dxc"]) && E.decide({ need: E.needOf({ playwright: true, shellThere: true, dxcNeeded: false }), capMB: 1, free: 0 }).action === "ready" && (() => { const r = E.decide({ need: nD, capMB: 1, free: 0 }); return r.action === "install" && J(r.steps) === J(["dxc"]); })());
}

sec("5. RUNNING npm (no shell string)");
{
    const nix = E.npmInvocation({ platform: "linux" }), cli = E.npmInvocation({ platform: "win32", execPath: "C:\\n\\node.exe", exists: () => true }), cmd = E.npmInvocation({ platform: "win32", execPath: "C:\\n\\node.exe", exists: () => false });
    ok("!! Linux/macOS: npm, no shell; Windows with node's own npm-cli.js: node running that file, no shell; Windows without it: npm.cmd through a shell (the arguments are fixed)", nix.cmd === "npm" && nix.shell === false && cli.cmd === "C:\\n\\node.exe" && /npm-cli\.js$/.test(cli.prefix[0]) && cli.shell === false && cmd.cmd === "npm.cmd" && cmd.shell === true);
    ok("!! the arguments are shipVerdict's fixCommand as a list: install --no-audit --no-fund [--ignore-scripts only where the browser is on disk and Playwright is not] --prefix <render-qa>", J(E.npmArgs("/e", { playwright: false, shell: false }).map(fwd)) === J(["install", "--no-audit", "--no-fund", "--prefix", "/e/tools/render-qa"]) && E.npmArgs("/e", { playwright: false, shell: true }).includes("--ignore-scripts") && !E.npmArgs("/e", { playwright: true, shell: true }).includes("--ignore-scripts") && !E.npmArgs("/e", { playwright: false, shell: false }).includes("--ignore-scripts"));
    ok("!! and they say the same as the verdict's own command text (so the two cannot drift): the same flags in the same order for each of the four cases", [[false, false], [false, true], [true, false], [true, true]].every(([playwright, shell]) => E.npmArgs("/e", { playwright, shell }).join(" ") === SV.fixCommand("/e", { playwright, shell }).replace(/"/g, "").replace(/^npm /, "")));
}

sec("6. THE COMMAND");
{
    const base = { eng: "/e", log: null, probe: null };
    const mk = (over = {}) => { const out = [], calls = []; const lacking = [{ what: "the browser gates cannot run here: x" }]; let state = 0;
        const io = { eng: "/e", log: (l) => out.push(l), readiness: () => (state ? [] : lacking), probe: () => E.needOf({ playwright: false, shellThere: false, dxcNeeded: false }), readPrefs: () => '{"autoCapMB":400}', freeMB: () => 50000, npmInvocation: () => ({ cmd: "npm", prefix: [], shell: false }), spawn: (c, a, o) => { calls.push({ c, a, o }); state = 1; return { status: 0 }; }, ensureDxc: () => ({ ok: true, copied: ["dxcompiler.dll"], dest: "/d" }), ...over }; return { io, out, calls }; };
    ok("!! arguments: --dry-run, --cap-mb N (0 or more); anything else is refused", throws(() => E.parseArgs(["--bogus"])) && throws(() => E.parseArgs(["--cap-mb"])) && throws(() => E.parseArgs(["--cap-mb", "-1"])) && throws(() => E.parseArgs(["--cap-mb", "x"])) && E.parseArgs(["--cap-mb", "0"]).capMB === 0 && E.parseArgs(["--dry-run"]).dry === true);
    const r0 = mk({ readiness: () => [] }); const c0 = E.command([], r0.io);
    ok("!! a box that is already ready installs nothing, probes nothing, exits 0", c0 === 0 && r0.calls.length === 0 && /nothing to install/.test(r0.out.join("")));
    const r1 = mk(); const c1 = E.command([], r1.io);
    ok("!! under the cap (400 MB in the prefs): runs npm install once with the fixed list, output inherited, the cwd untouched, checks readiness again, exits 0 and says done", c1 === 0 && r1.calls.length === 1 && r1.calls[0].c === "npm" && r1.calls[0].a.map(fwd).join(" ") === "install --no-audit --no-fund --prefix /e/tools/render-qa" && r1.calls[0].o.stdio === "inherit" && r1.calls[0].o.shell === false && /done; the browser gates can run/.test(r1.out[r1.out.length - 1]));
    const r2 = mk({ readPrefs: () => "" }); const c2 = E.command([], r2.io);
    ok("!! at the default cap the browser download is NOT run: exit 1, no spawn, the reasons, and the by-hand command", c2 === 1 && r2.calls.length === 0 && /NOT installing/.test(r2.out.join("\n")) && /cap is 100 MB/.test(r2.out.join("\n")) && /by hand: npm install --no-audit --no-fund --prefix/.test(r2.out.join("\n")));
    const r3 = mk({ readPrefs: () => "" }); const c3 = E.command(["--cap-mb", "300"], r3.io);
    ok("!! --cap-mb overrides the prefs for the run and says so", c3 === 0 && r3.calls.length === 1 && /\(this run\)/.test(r3.out.join("\n")));
    let asked = null; const r4a = mk({ freeMB: (d) => { asked = d; return 50000; } }); E.command([], r4a.io);
    ok("!! free space is measured on the folder installed into (tools/render-qa under the engine root)", fwd(asked) === "/e/tools/render-qa");
    const r4 = mk({ freeMB: () => 100 }); const c4 = E.command([], r4.io);
    ok("!! low free space refuses even under the cap", c4 === 1 && r4.calls.length === 0 && /100 MB free/.test(r4.out.join("\n")));
    const r5 = mk(); const c5 = E.command(["--dry-run"], r5.io);
    ok("!! --dry-run prints what it would run and runs nothing, and does not claim success (exit 1: the box is still not ready)", c5 === 1 && r5.calls.length === 0 && /would run: npm install/.test(r5.out.join("\n")) && /nothing was run/.test(r5.out.join("\n")));
    const r6 = mk({ spawn: () => ({ status: 7 }) }); const c6 = E.command([], r6.io);
    const r7 = mk({ spawn: () => ({ error: { code: "ENOENT" } }) }); const c7 = E.command([], r7.io);
    ok("!! a failing npm (exit 7) or one that cannot start (ENOENT) stops with exit 1 and says why; it does not go on to check or claim", c6 === 1 && /failed \(exit 7\)/.test(r6.out.join("")) && c7 === 1 && /failed \(ENOENT\)/.test(r7.out.join("")) && !/done;/.test(r6.out.join("")));
    const r8 = mk({ spawn: (c, a, o) => ({ status: 0 }) }); const c8 = E.command([], r8.io);
    ok("!! installed but still not ready (readiness still lists a fault) is exit 1 and the faults are printed", c8 === 1 && /still cannot run the browser gates/.test(r8.out.join("\n")) && /the browser gates cannot run here/.test(r8.out.join("\n")));
    const dxcOnly = mk({ probe: () => E.needOf({ playwright: true, shellThere: true, dxcNeeded: true }), readPrefs: () => "", freeMB: () => 0 }); let st = 0; dxcOnly.io.readiness = () => (st ? [] : [{ what: "dxc" }]); dxcOnly.io.ensureDxc = (o) => { st = 1; dxcOnly.calls.push({ c: "dxc", write: o.write }); return { ok: true, copied: ["dxcompiler.dll"], dest: "/d" }; };
    const c9 = E.command([], dxcOnly.io);
    ok("!! DXC missing only: the copy is made with write:true, npm is not run, the cap and space do not hold it, exit 0", c9 === 0 && dxcOnly.calls.length === 1 && dxcOnly.calls[0].c === "dxc" && dxcOnly.calls[0].write === true && /copied dxcompiler\.dll/.test(dxcOnly.out.join("\n")));
    const both = mk({ probe: () => ({ ...E.needOf({ playwright: false, shellThere: false, dxcNeeded: true }) }) }); const order = []; both.io.spawn = () => { order.push("npm"); return { status: 0 }; }; both.io.ensureDxc = () => { order.push("dxc"); return { ok: true, copied: ["dxcompiler.dll"], dest: "/d" }; }; let st2 = 0; both.io.readiness = () => (order.length === 2 ? [] : [{ what: "x" }]); void st2; const c11b = E.command([], both.io);
    ok("!! both missing: npm first, then the DXC copy (the copy needs the browser the install puts there), exit 0", c11b === 0 && J(order) === J(["npm", "dxc"]));
    const r10 = mk({ probe: () => E.needOf({ playwright: true, shellThere: true, dxcNeeded: false }) }); const c10 = E.command([], r10.io);
    ok("!! a fault the probe cannot name is reported with the faults, never 'fixed' by guessing; exit 1, no spawn", c10 === 1 && r10.calls.length === 0 && /nothing the probe can fix/.test(r10.out.join("\n")));
}

sec("7. THE SOURCE");
{
    const src = fs.readFileSync(new URL("./ensureBrowserGates.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no network of its own, no shell:true except the fixed npm.cmd fallback, and no write to the prefs file (the slider's value is read, never changed)", !/fetch\(|https?\.get|writeFileSync|appendFileSync/.test(code) && (code.match(/shell: true/g) || []).length === 1);
    const cmdSrc = fs.readFileSync(new URL("./ensureBrowserGatesCmd.mjs", import.meta.url), "utf8");
    ok("!! the command file imports command from the library, sets the exit code, and has no exports", /import \{ command \} from "\.\/ensureBrowserGates\.mjs"/.test(cmdSrc) && /process\.exitCode = command\(process\.argv\.slice\(2\)\)/.test(cmdSrc) && !/^export /m.test(cmdSrc));
}

sec("8. WHERE THE SETTING IS READ FROM (named here so the definition ratchet can see it)");
ok("!! PREFS_FILE is the engine's own auto-install file, ~/.voxelbridge/autoinstall.json, the one ai-bridge/autoInstall.js writes", /\.voxelbridge[\\/]autoinstall\.json$/.test(E.PREFS_FILE));

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
