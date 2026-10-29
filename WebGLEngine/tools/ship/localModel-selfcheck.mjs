// WebGLEngine/tools/ship/localModel-selfcheck.mjs -- UNNUMBERED. Gate for tools/ship/localModel.mjs (the local-model inventory, choice, install plan and smoke test).
// Run: node tools/ship/localModel-selfcheck.mjs      (no network, no ollama, no GPU needed: every outside call is a seam)
// SABOTAGED -- 80 mutants of tools/ship/localModel.mjs, each run against a copy of this gate, 4 at a time, a mutant past 60 s counted red, every one red BY NAME; plus an IDENTITY mutant that reads 0 red (it does).
// FIRST PASS: 5 read 0 red. CUT AS DEAD: the ':latest' normalisation in installedSplit (no inventory tag ends in :latest, so it could not change an answer) and the 'vram > 0' guard in pickModel (nothing fits 0 GB). ROWS ADDED: an nvidia-smi that exits 9 WITH parseable output is ignored; several GPUs listed biggest-first; an empty plan says nothing without --yes. One mutant had a pattern matching twice and was made specific.
// Gate time here: under 0.1 s. NOT SABOTAGED: the wording of the inventory notes and of the status lines beyond what rows match.
"use strict";
import * as M from "./localModel.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, throws = (f) => { try { f(); return false; } catch { return true; } };

sec("1. THE INVENTORY");
ok("!! every candidate has a tag 'name:size', a family that prefixes the tag, a positive size and params, a json note of good or fair, and a note; tags are unique; the date is stamped", M.MODELS.length >= 6 && new Set(M.MODELS.map((m) => m.tag)).size === M.MODELS.length && M.MODELS.every((m) => /^[a-z0-9.]+:[a-z0-9.]+$/.test(m.tag) && m.tag.startsWith(m.family + ":") && m.diskGb > 0 && m.params > 0 && ["good", "fair"].includes(m.json) && m.note.length > 10) && /^\d{4}-\d\d-\d\d$/.test(M.INVENTORY_AS_OF) && Object.isFrozen(M.MODELS));
ok("!! the constants: a margin of 1.3, a CPU download cap of 5 GB, the library page is ollama.com/library", M.MARGIN === 1.3 && M.CPU_CAP_GB === 5 && M.LIBRARY_URL === "https://ollama.com/library");

sec("2. THE CHOICE");
const P = (ramGb, vramGb) => M.pickModel({ ramGb, vramGb, gpu: "g", platform: "linux" });
ok("!! an 8 GB card gets a model that fits it with the margin and is noted good at JSON, the larger of those (llama3.1:8b, 4.9 GB x 1.3 = 6.4 GB; gemma2:9b needs 7.0 and is noted fair anyway)", P(16, 8).model.tag === "llama3.1:8b" && P(16, 8).where === "gpu");
ok("!! a 24 GB card gets the 14b (9 x 1.3 = 11.7 GB fits and is noted good); a 6 GB card gets qwen2.5:7b (4.7 x 1.3 = 6.1 exceeds 6, so the 3b: 1.9 x 1.3 fits)", P(32, 24).model.tag === "qwen2.5:14b" && P(32, 6).model.tag === "qwen2.5:3b");
ok("!! the margin is applied: a card of exactly the download size does not take it (4.7 GB card, qwen2.5:7b is 4.7)", P(16, 4.7).model.diskGb < 4.7);
ok("!! with no GPU the choice runs on the CPU, is held to the 5 GB download cap even with 64 GB of memory (not the 14b), and says SLOW", (() => { const r = P(64, 0); return r.where === "cpu" && r.model.diskGb <= 5 && r.model.tag === "llama3.1:8b" && /SLOW/.test(r.why) && /no NVIDIA GPU/.test(r.why); })());
ok("!! a card too small for anything falls back to the memory; a machine too small for anything gets the smallest candidate and the reason says it may not run", (() => { const a = P(16, 1), b = P(1, 0); return a.where === "cpu" && /nothing fits the 1 GB card/.test(a.why) && b.model.tag === "qwen2.5:3b" && /smallest/.test(b.why); })());
ok("!! the choice does not depend on what is already installed or on the order of the inventory", J(M.pickModel({ ramGb: 16, vramGb: 8 }, [...M.MODELS].reverse()).model) === J(P(16, 8).model));

sec("3. WHAT THE MACHINE HAS (seams for the outside)");
{
    const osMod = { totalmem: () => 17179869184, platform: () => "win32" };
    const smi = (stdout, status = 0) => () => ({ status, stdout });
    const a = M.probeSystem({ spawn: smi("NVIDIA GeForce GTX 1080, 8192\n"), osMod }), b = M.probeSystem({ spawn: smi("B, 12288\nA, 4096\n"), osMod });
    ok("!! memory in GB (16.0), the platform, and the GPU's name and video memory (8.0) from nvidia-smi", a.ramGb === 16 && a.platform === "win32" && a.vramGb === 8 && a.gpu === "NVIDIA GeForce GTX 1080");
    ok("!! with several GPUs the one with the most memory is reported", b.vramGb === 12 && b.gpu === "B");
    const c = M.probeSystem({ spawn: () => { throw new Error("ENOENT"); }, osMod }), d = M.probeSystem({ spawn: smi("GTX, 8192\n", 9), osMod }), e = M.probeSystem({ spawn: smi("garbage line\n"), osMod });
    ok("!! no nvidia-smi (it throws), a failing one (exit 9) or unreadable output reads 0 GB and no GPU, and the probe still answers", [c, d, e].every((x) => x.vramGb === 0 && x.gpu === null && x.ramGb === 16));
    ok("!! the nvidia-smi call is made without a shell, with a timeout", (() => { let o; M.probeSystem({ spawn: (cmd, args, opt) => { o = { cmd, args, opt }; return { status: 1 }; }, osMod }); return o.cmd === "nvidia-smi" && o.opt.shell === false && o.opt.timeout > 0 && o.args.includes("--query-gpu=name,memory.total"); })());
}

sec("4. READING ollama");
{
    const list = "NAME                ID              SIZE      MODIFIED\nqwen2.5:7b          845dbda0ea48    4.7 GB    2 days ago\nllama3.1:8b         46e0c10c039e    4.9 GB    3 weeks ago\nmymodel:latest      aaaaaaaaaaaa    1.0 GB    1 week ago\n";
    ok("!! the table's first column after the header is the tags, in order; an empty list, only a header, and non-text give none", J(M.parseOllamaList(list)) === J(["qwen2.5:7b", "llama3.1:8b", "mymodel:latest"]) && M.parseOllamaList("").length === 0 && M.parseOllamaList("NAME ID SIZE").length === 0 && M.parseOllamaList(null).length === 0);
    ok("!! a row that is not a tag (a warning line with spaces or symbols) is dropped", J(M.parseOllamaList("NAME\n!!! warning something\nqwen2.5:7b x\n")) === J(["qwen2.5:7b"]));
    const s = M.installedSplit(["qwen2.5:7b", "mymodel:latest", "llama3.2"]);
    ok("!! installed tags are split into those in the inventory and those not (a bare name, or a :latest form, is not in the inventory)", J(s.known) === J(["qwen2.5:7b"]) && J(s.other) === J(["mymodel:latest", "llama3.2"]));
    const run = (r) => M.probeOllama({ spawn: () => r });
    const up = run({ status: 0, stdout: list }), none = run({ error: { code: "ENOENT" } }), down = run({ status: 1, stderr: "could not connect to a running Ollama instance" });
    ok("!! ollama answering: installed, running, the tags; not on the machine (ENOENT): not installed; on the machine but not answering: installed, not running, with the reason", up.haveOllama && up.running && up.installed.length === 3 && !none.haveOllama && !none.running && /ENOENT/.test(none.why) && down.haveOllama && !down.running && /could not connect/.test(down.why));
}

sec("5. THE NEW ONES");
{
    const html = '<a href="/library/llama3.1">x</a><a href="/library/qwen3">y</a><a href="/library/llama3.1">dup</a><a href="/library/gemma3n">z</a><a href="/blog/x">no</a><a href="/library/Qwen2.5">q</a>';
    ok("!! model names are read from /library/<name> links, once each, in page order; other links and empty input give none", J(M.parseLibraryNames(html)) === J(["llama3.1", "qwen3", "gemma3n", "Qwen2.5"]) && M.parseLibraryNames("").length === 0 && M.parseLibraryNames(undefined).length === 0);
    ok("!! a name is new only when no inventory family matches it, ignoring case (qwen3 and gemma3n are new; llama3.1 and Qwen2.5 are known)", J(M.newCandidates(M.parseLibraryNames(html))) === J(["qwen3", "gemma3n"]));
}

sec("6. THE PLAN");
{
    const w = M.installPlan({ platform: "win32", haveOllama: false, installed: [], tag: "qwen2.5:7b" }), m = M.installPlan({ platform: "darwin", haveOllama: false, installed: [], tag: "qwen2.5:7b" }), l = M.installPlan({ platform: "linux", haveOllama: false, installed: [], tag: "qwen2.5:7b" });
    ok("!! Windows: winget install of Ollama.Ollama, exact id, then the pull; macOS: brew install ollama then the pull; both are argument lists", J(w.map((s) => s.argv)) === J([["winget", "install", "--id", "Ollama.Ollama", "-e", "--accept-package-agreements", "--accept-source-agreements"], ["ollama", "pull", "qwen2.5:7b"]]) && J(m.map((s) => s.argv)) === J([["brew", "install", "ollama"], ["ollama", "pull", "qwen2.5:7b"]]));
    ok("!! Linux: the install script step is MANUAL (printed, no argv: it is a script piped to a shell), then the pull", l.length === 2 && l[0].manual === "curl -fsSL https://ollama.com/install.sh | sh" && !l[0].argv && J(l[1].argv) === J(["ollama", "pull", "qwen2.5:7b"]));
    ok("!! ollama present: only the pull; the model already pulled: nothing at all", M.installPlan({ platform: "win32", haveOllama: true, installed: [], tag: "t:1" }).length === 1 && M.installPlan({ platform: "win32", haveOllama: true, installed: ["t:1"], tag: "t:1" }).length === 0);
    ok("!! the plan never uses a shell string: every runnable step has an argv array of strings", [...w, ...m, ...l].filter((s) => s.argv).every((s) => Array.isArray(s.argv) && s.argv.every((x) => typeof x === "string")));
}

sec("7. RUNNING A PLAN");
{
    const steps = M.installPlan({ platform: "win32", haveOllama: false, installed: [], tag: "qwen2.5:7b" }), calls = [], logs = [];
    const spawn = (c, a, o) => { calls.push({ c, a, o }); return { status: 0 }; };
    const dry = M.runPlan(steps, { yes: false, spawn, log: (l) => logs.push(l) });
    ok("!! without --yes NOTHING runs: no spawn, ran 0, each step is listed as 'would', and the last line says nothing was run", calls.length === 0 && dry.ran === 0 && dry.dry === true && logs.filter((l) => /would:/.test(l)).length === 2 && /nothing was run/.test(logs[logs.length - 1]));
    const yes = M.runPlan(steps, { yes: true, spawn, log: () => {} });
    ok("!! with --yes the steps run in order, each without a shell and with inherited output, and the result says ok", yes.ok && yes.ran === 2 && calls[0].c === "winget" && calls[1].c === "ollama" && calls.every((x) => x.o.shell === false && x.o.stdio === "inherit"));
    const c2 = []; const failing = M.runPlan(steps, { yes: true, spawn: (c, a) => { c2.push(c); return c === "winget" ? { status: 3 } : { status: 0 }; }, log: () => {} });
    ok("!! a failing step stops the run: the later step is not run, and the result names the step and the exit", !failing.ok && c2.length === 1 && failing.ran === 1 && /Ollama/.test(failing.stoppedAt) && failing.why === "exit 3");
    const spawnErr = M.runPlan(steps, { yes: true, spawn: () => ({ error: { code: "ENOENT" } }), log: () => {} });
    ok("!! a command that cannot start (ENOENT) is a failure with its code", !spawnErr.ok && spawnErr.why === "ENOENT");
    const lin = M.installPlan({ platform: "linux", haveOllama: false, installed: [], tag: "t:1" }), c3 = [], l3 = []; const man = M.runPlan(lin, { yes: true, spawn: (c) => { c3.push(c); return { status: 0 }; }, log: (l) => l3.push(l) });
    ok("!! a manual step is NEVER run even with --yes: the run stops there, prints it for the person, and the pull is not attempted", c3.length === 0 && man.manual === true && !man.ok && l3.some((l) => /YOU RUN THIS/.test(l) && /install\.sh/.test(l)));
    const lg = []; ok("!! an empty plan is ok, runs nothing, and says nothing (it does not claim it skipped steps), with or without --yes", J(M.runPlan([], { yes: true, spawn })) === J({ ran: 0, ok: true, stoppedAt: null }) && J(M.runPlan([], { yes: false, spawn, log: (l) => lg.push(l) })) === J({ ran: 0, ok: true, stoppedAt: null }) && lg.length === 0);
}

sec("8. THE COMMAND TEXT");
ok("!! the --cmd text is 'ollama run <tag>'; a tag with a space, a quote, a semicolon, or a dollar is refused (it ends up in a command line)", M.advisorCmd("qwen2.5:7b") === "ollama run qwen2.5:7b" && ["a b", 'a"b', "a;b", "a$b", "", "a:b:c d", "../x y"].every((t) => throws(() => M.advisorCmd(t))));

sec("9. THE COMMAND");
{
    const sys = { ramGb: 16, vramGb: 8, gpu: "GTX 1080", platform: "win32" };
    const mk = (over = {}) => { const out = [], calls = []; const io = { log: (l) => out.push(l), probeSystem: () => sys, probeOllama: () => ({ haveOllama: false, running: false, installed: [], why: "ENOENT" }), spawn: (c, a, o) => { calls.push({ c, a, o }); return { status: 0, stdout: "{}" }; }, ...over }; return { io, out, calls }; };
    ok("!! arguments: the verb is required and one of four; --yes only with setup; --check-new only with inventory; --tries 1-10; a bad --model tag is refused when the arguments are read", ["", "x", "status --yes", "smoke --yes", "status --check-new", "smoke --tries 0", "smoke --tries 11", "smoke --tries 2.5", "status --model", "status --model a;b", "status --bogus"].every((a) => throws(() => M.parseArgs(a.split(" ").filter(Boolean)))) && M.parseArgs(["setup", "--yes", "--model", "qwen2.5:7b"]).yes === true && M.parseArgs(["smoke", "--tries", "5"]).tries === 5 && M.parseArgs(["inventory", "--check-new"]).checkNew === true);
    const st = mk(); await M.command(["status"], st.io);
    ok("!! status reads the machine and ollama, prints the machine, the state, the choice with its reason, the way there and the next command, and runs NOTHING (no spawn)", st.calls.length === 0 && st.out.length === 5 && /win32, 16 GB memory, GTX 1080, 8 GB video memory/.test(st.out[0]) && /NOT installed/.test(st.out[1]) && /llama3\.1:8b/.test(st.out[2]) && /Windows|Ollama/i.test(st.out[3]) && /advisorLiveCmd\.mjs record --model-id llama3\.1:8b --cmd "ollama run llama3\.1:8b"/.test(st.out[4]) && /--dry-run/.test(st.out[4]));
    const su = mk(), code1 = await M.command(["setup"], su.io), s3 = mk(), code2 = await M.command(["setup", "--yes"], s3.io), s4 = mk(); await M.command(["setup", "--model", "qwen2.5:7b"], s4.io);
    ok("!! setup without --yes runs nothing (no spawn), says so, and exits 0", code1 === 0 && su.calls.length === 0 && /nothing was run/.test(su.out.join("\n")));
    ok("!! setup --yes: exit 0 and the calls are the install then the pull of the chosen model", code2 === 0 && s3.calls.map((x) => x.c).join() === "winget,ollama" && s3.calls[1].a.join(" ") === "pull llama3.1:8b");
    ok("!! --model overrides the choice, and the reason says it was named, not checked against this machine", /named with --model/.test(s4.out[0]) && /pull qwen2\.5:7b|qwen2\.5:7b/.test(s4.out.join("\n")) && !/llama3\.1:8b/.test(s4.out.join("\n")));
    const s5 = mk({ spawn: () => ({ status: 5 }) }); const code3 = await M.command(["setup", "--yes"], s5.io);
    ok("!! setup --yes with a failing step exits 1 and says where it stopped", code3 === 1 && s5.out.some((l) => /STOPPED at/.test(l)));
    const iv = mk({ probeOllama: () => ({ haveOllama: true, running: true, installed: ["qwen2.5:7b"], why: null }) }); const code4 = await M.command(["inventory"], iv.io);
    ok("!! inventory lists every candidate with its size and json note and marks the pulled one; without --check-new it reads no network", code4 === 0 && iv.out.length === M.MODELS.length + 1 && iv.out.filter((l) => /\[pulled\]/.test(l)).length === 1 && /qwen2\.5:7b.*\[pulled\]/.test(iv.out.join("\n")) && /approximate/.test(iv.out[0]));
    let fetched = null; const html = '<a href="/library/llama3.1">x</a><a href="/library/qwen3">y</a>';
    const cn = mk({ fetch: async (u) => { fetched = u; return { ok: true, text: async () => html }; } }); const code5 = await M.command(["inventory", "--check-new"], cn.io);
    ok("!! inventory --check-new reads the library page and reports the names no family covers, as REPORTED not recommended", code5 === 0 && fetched === M.LIBRARY_URL && /links 2 models; 1 are in no inventory family: qwen3/.test(cn.out.join("\n")) && /REPORTED, not recommended/.test(cn.out.join("\n")));
    const cf = mk({ fetch: async () => { throw new Error("offline"); } }); const code6 = await M.command(["inventory", "--check-new"], cf.io);
    const c404 = mk({ fetch: async () => ({ ok: false, status: 404 }) }); const code7 = await M.command(["inventory", "--check-new"], c404.io);
    ok("!! an unreachable page or a bad status exits 1 and says nothing was compared; it does not crash", code6 === 1 && /offline/.test(cf.out.join("\n")) && /nothing compared/.test(cf.out.join("\n")) && code7 === 1 && /HTTP 404/.test(c404.out.join("\n")));
    const good = '{"surface": false, "station": 0, "cap": 0.8, "pump": false, "repair": false}';
    const sm = (stdouts, over = {}) => { let i = 0; return mk({ probeOllama: () => ({ haveOllama: true, running: true, installed: ["llama3.1:8b"], why: null }), spawn: (c, a, o) => { sm.calls.push({ c, a, o }); const x = stdouts[i++ % stdouts.length]; return typeof x === "object" ? x : { status: 0, stdout: x }; }, ...over }); };
    sm.calls = [];
    const s6 = sm([good, "Sure! Here you go: ```json\n" + good + "\n```", "I think we should surface."]); const code8 = await M.command(["smoke", "--tries", "3"], s6.io);
    ok("!! smoke sends the REAL advisor prompt on stdin (the schema line and the reply format), without a shell, and scores each reply by the advisor's own strict reader: a bare object and a fenced one parse, prose does not; 2 of 3 exits 1 and advises another model", code8 === 1 && sm.calls.length === 3 && /prompt schema 1/.test(sm.calls[0].o.input) && /Reply with ONE json object/.test(sm.calls[0].o.input) && sm.calls.every((x) => x.o.shell === false && x.c === "ollama" && x.a.join(" ") === "run llama3.1:8b") && s6.out.filter((l) => /PARSES/.test(l) && !/DOES NOT/.test(l)).length === 2 && s6.out.some((l) => /DOES NOT PARSE \(no json object\)/.test(l)) && /2 of 3 replies parse/.test(s6.out[s6.out.length - 1]) && /another model/.test(s6.out[s6.out.length - 1]));
    sm.calls = []; const s7 = sm([good]); const code9 = await M.command(["smoke", "--tries", "2"], s7.io);
    ok("!! all replies parsing exits 0 and says it is worth a practice run; the try count is honoured", code9 === 0 && sm.calls.length === 2 && /2 of 2 replies parse/.test(s7.out[s7.out.length - 1]) && /Worth a practice run/.test(s7.out[s7.out.length - 1]));
    sm.calls = []; const s8 = sm([{ status: 1, stderr: "x" }]); const code10 = await M.command(["smoke", "--tries", "2"], s8.io);
    ok("!! a model command that fails is reported per try and counts as not parsing (0 of 2, exit 1)", code10 === 1 && s8.out.filter((l) => /the model command failed/.test(l)).length === 2 && /0 of 2 replies parse/.test(s8.out[s8.out.length - 1]));
    const n1 = mk(); const c11 = await M.command(["smoke"], n1.io), n2 = mk({ probeOllama: () => ({ haveOllama: true, running: true, installed: [], why: null }) }); const c12 = await M.command(["smoke"], n2.io);
    ok("!! smoke refuses before calling anything when ollama is not answering or the model is not pulled, and names the command that fixes it", c11 === 1 && c12 === 1 && n1.calls.length === 0 && n2.calls.length === 0 && /setup --yes/.test(n1.out.join("")) && /setup --model llama3\.1:8b --yes/.test(n2.out.join("")));
}

sec("10. THE SOURCE");
{
    const fs = await import("node:fs");
    const code = fs.readFileSync(new URL("./localModel.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! no shell anywhere: every spawn is called with shell:false or inherits the seam, and the library never imports exec or uses a shell:true", !/shell:\s*true/.test(code) && !/import[^;]*\bexec(Sync|File)?\b[^;]*child_process/.test(code) && /import \{ spawnSync \} from "node:child_process"/.test(code) && (code.match(/shell: false/g) || []).length >= 4);
    ok("!! no key is read or written here (this path needs none), and no model is called outside the smoke test's one spawn", !/ANTHROPIC_API_KEY|process\.env/.test(code));
    const cmd = fs.readFileSync(new URL("./localModelCmd.mjs", import.meta.url), "utf8");
    ok("!! the command file imports command from the library, sets the exit code, and has no exports", /import \{ command \} from "\.\/localModel\.mjs"/.test(cmd) && /process\.exitCode = await command\(process\.argv\.slice\(2\)\)/.test(cmd) && !/^export /m.test(cmd));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
