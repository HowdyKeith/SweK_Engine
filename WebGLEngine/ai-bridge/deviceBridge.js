// FILE: ai-bridge/deviceBridge.js
//
// v2813 - front door for the roundhouse DEVICE registry. run-device.mjs was CLI-only; this lets device.html pick
// a lab and WATCH the proposer/evaluator loop crystallise, round by round, as the physics actually runs.
//
// WHY A RUN STORE RATHER THAN ONE BLOCKING CALL: each round runs a real simulation, so a loop can take tens of
// seconds. Returning only the finished transcript would show the answer but not the thing worth watching -- a
// claim being proposed, measured against the sim, and refused or accepted on the number. So /device/start kicks
// the loop off and returns a run id; roundhouseDevice's onRound seam pushes each completed round into the store;
// /device/progress hands back whatever has landed so far. The page polls that.
//
// THE PHYSICS DECIDES, NOT THE MODEL. numericVerdict compares the claim against the MEASURED observable, and the
// loop exits only when that comparison passes. A model that talks itself into a conclusion still fails here,
// which is the whole point of the roundhouse and the reason the page shows measured values beside every claim.

const path = require("path");
const { pathToFileURL } = require("url");

const ENGINE = path.join(__dirname, "..");
const esm = (rel) => import(pathToFileURL(path.join(ENGINE, rel)).href);

const PREFIX = "/device";

// Resolve a provider key SERVER-SIDE, vault first, exactly as roundhouseBridge does for Claude. The value never
// leaves this process -- /device/list reports availability as a boolean and nothing more.
function providerKey(envName) {
    if (process.env[envName]) return true;
    try {
        const creds = require("./aiCreds.js");
        if (typeof creds.loadKeysIntoEnv === "function") { creds.loadKeysIntoEnv(); return !!process.env[envName]; }
    } catch { /* no vault on this box is an ordinary state */ }
    return false;
}
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

// runId -> { device, caller, rounds:[], done, result, error, started }
const RUNS = new Map();
let seq = 0;
const MAX_RUNS = 20;

function newRun(device, caller) {
    const id = "r" + (++seq) + "-" + Date.now().toString(36);
    RUNS.set(id, { id, device, caller, rounds: [], done: false, result: null, error: null, started: Date.now() });
    // keep the store bounded: a long session must not accumulate transcripts forever
    while (RUNS.size > MAX_RUNS) RUNS.delete(RUNS.keys().next().value);
    return RUNS.get(id);
}

// Trim a round to what the page shows. The raw objects carry whole sim states; sending those would be a lot of
// bytes to render three numbers.
function shapeRound(r) {
    const claim = (r.hyp && r.hyp.claim) || null;
    const obs = r.observable || {};
    const picked = {};
    if (claim && claim.observable) picked[claim.observable] = obs[claim.observable];
    for (const k of Object.keys(obs).slice(0, 6)) if (!(k in picked)) picked[k] = obs[k];
    return {
        round: r.round,
        claim,
        measured: r.verdict && "measured" in r.verdict ? r.verdict.measured : undefined,
        verdict: r.verdict || null,
        done: !!r.done,
        observables: picked,
        critique: typeof r.critique === "string" ? r.critique.slice(0, 400)
            : (r.critique && r.critique.note ? String(r.critique.note).slice(0, 400) : null),
    };
}

// NOTE: DEMO_HYPS is keyed by the REGISTRY name ("blackhole"), while device.name is descriptive
// ("paczynski-wiita-black-hole"). Deriving one from the other looked tempting and was wrong -- the registry
// name is passed in explicitly instead.
async function makeCaller(kind, opts, device, regName) {
    if (kind === "mock") {
        // Reuse run-device.mjs's DEMO_HYPS -- true statements each device can crystallise quickly -- rather than
        // keeping a second copy here. One source of truth for the demo claims; if the CLI's demo changes, the
        // page's does too. This is the "prove the wiring" path: no model, no key, but the REAL sim runs.
        const { DEMO_HYPS } = await esm("tools/roundhouse/run-device.mjs");
        const demo = opts.hyp || DEMO_HYPS[regName] || null;
        if (!demo) throw new Error("device '" + regName + "' has no demo claim -- choose a model caller, or pass a hypothesis");
        return async (role) => (role === "proposer" ? demo : { note: "mock evaluator: the measured number decided this, not a model" });
    }
    if (kind === "ollama") {
        const { ollamaCaller } = await esm("tools/roundhouse/ollamaRoleCaller.mjs");
        return ollamaCaller({ model: opts.model || "qwen2.5:7b", host: opts.host || undefined });
    }
    if (kind === "gemini") {
        if (!providerKey("GEMINI_API_KEY")) {
            throw new Error("No GEMINI_API_KEY. Store one in the credential vault (the same one the AI bridge uses) or set it for this server. The local 'ollama' and keyless 'mock' callers need no key.");
        }
        const { geminiCaller } = await esm("tools/roundhouse/geminiRoleCaller.mjs");
        return geminiCaller({ model: opts.model || undefined });
    }
    throw new Error("unknown caller: " + kind + " (use mock, ollama or gemini)");
}

function readBody(req, limit = 65536) {
    return new Promise((resolve) => {
        let s = "";
        req.on("data", (c) => { s += c; if (s.length > limit) { s = s.slice(0, limit); req.destroy(); } });
        req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
        req.on("error", () => resolve({}));
    });
}

async function handle(req, res, { sendJson }) {
    const url = new URL(req.url, "http://x");
    const route = url.pathname.slice(PREFIX.length) || "/";

    if (route === "/list" || route === "/") {
        const { DEVICE_NAMES, getDevice } = await esm("tools/roundhouse/devices.mjs");
        const devices = [];
        for (const name of DEVICE_NAMES) {
            // v3129 -- THE KNOBS SHIP WITH THE OBSERVABLES NOW. The list told a caller what each device MEASURES
            // and never what it can CHANGE, so the agent proposed claims about a fixed operating point forever.
            try {
                const d = await getDevice(name);
                let knobs = null;
                try { const { declaredKnobs } = await esm("tools/roundhouse/knobGate.mjs"); const r = declaredKnobs(d); knobs = r && r.knobs; } catch {}
                // v3189 -- REPORT THE MODES. The listing carried name, observables and knobs and NOT modes,
                // so v3174's finding -- that a device with ONE mode cannot separate the key's truncation from
                // its own defect -- was invisible on the page built to look at devices. checkMode has existed
                // since v3144 and this listing never reached for it.
                let modeInfo = { declared: [], source: "probed", enforced: null };
                try {
                    const { modesOf } = await esm("tools/roundhouse/deviceModes.mjs");
                    const { checkMode } = await esm("tools/roundhouse/knobGate.mjs");
                    modeInfo = modesOf(d, checkMode);
                    // *** WHETHER THE DEVICE REFUSES A NONSENSE MODE IS REPORTED SEPARATELY FROM HOW MANY IT
                    // HAS. *** Three devices echo back ANY string, so checkMode cannot protect them -- and a
                    // long mode list from a device that accepts everything is not a rich device, it is an
                    // unguarded one. Those two must never share a number.
                    modeInfo.enforced = checkMode(d, "zzz_not_a_mode_zzz").ok === false;
                } catch { /* a device that cannot be asked is reported with an empty list, not skipped */ }
                devices.push({ name, observables: d.observables || [], knobs: knobs || [],
                               modes: modeInfo.declared, modeSource: modeInfo.source, modesEnforced: modeInfo.enforced });
            }
            catch (e) { devices.push({ name, observables: [], error: String(e && e.message || e) }); }
        }
        let localModels = [];
        try { const { listLocalModels } = await esm("tools/roundhouse/ollamaCaller.mjs"); localModels = (await listLocalModels()).map((m) => m.name); } catch {}
        // availability only -- never the key itself
        const callers = {
            mock: { available: true, note: "no key, no network; runs the REAL simulation" },
            ollama: { available: localModels.length > 0, note: localModels.length ? "local, free, private" : "install Ollama and pull a model" },
            gemini: { available: providerKey("GEMINI_API_KEY"), note: providerKey("GEMINI_API_KEY") ? "remote, free tier (per-minute limits are tight)" : "no GEMINI_API_KEY in the vault or environment" },
        };
        return sendJson({ ok: true, devices, localModels, callers });
    }

    if (route === "/start") {
        const body = req.method === "POST" ? await readBody(req) : {};
        const deviceName = String(body.device || url.searchParams.get("device") || "").trim();
        const callerKind = String(body.caller || "mock").trim();
        const maxRounds = Math.max(1, Math.min(12, parseInt(body.rounds || 4, 10)));
        const { getDevice, DEVICE_NAMES } = await esm("tools/roundhouse/devices.mjs");
        if (!DEVICE_NAMES.includes(deviceName)) return sendJson({ ok: false, error: "unknown-device", message: "Pick one of: " + DEVICE_NAMES.join(", ") }, 400);

        let device, caller;
        try {
            device = await getDevice(deviceName);
            caller = await makeCaller(callerKind, body, device, deviceName);
            // v2850 -- OPT-IN DETERMINISTIC CRITIC. roleDecompose (v2789) sat gated and used by nothing for
            // sixty-one versions until v2847's graveyard census found it. The critic is CODE, not a model:
            // every MALFORMED outcome the bench counts has a mechanical cause -- no claim, no observable named,
            // an observable this device does not have, no comparator -- and every one is answerable by LOOKING
            // AT THE DEVICE. A second model would be slower, cost a call, and could itself be wrong.
            // MEASURED over 48 runs against a synthetic model with a realistic failure mix:
            //     malformed 33% -> 0%      refused 27% -> 21%      crystallised 40% -> 79%
            // It fixes FORM, not SUBSTANCE, which is exactly right: only the physics can decide truth, so a
            // critic that moved the REFUSED rate would be doing something it has no business doing.
            if (body.critic !== false) {
                const { withCritic } = await esm("tools/roundhouse/deviceCritic.mjs");
                caller = withCritic(caller, device, { maxRounds: 2 });
            }
        } catch (e) { return sendJson({ ok: false, error: "setup", message: String(e && e.message || e) }, 400); }

        const run = newRun(deviceName, callerKind);
        const { roundhouseDevice } = await esm("tools/roundhouse/deviceBind.mjs");
        // v3482 -- *** THE PHYSICS LEAVES THE EVENT LOOP HERE, AND THIS ONE LINE IS THE WHOLE WIRING. *** v3477's
        // profiler named the stall (12132ms in physics/optics/diffraction.js:53) and v3481 proved a worker gives
        // bit-identical observables with the main-thread stall falling from 1144ms to 3ms. Until this line, that
        // worker existed and NOTHING CALLED IT -- a fix nobody uses is not a fix, which graveyard would have said
        // about it within a round.
        //
        // ONLY `build` MOVES. The round loop, the model calls and the progress streaming stay here, because the
        // caller is a CLOSURE that cannot cross a thread boundary and its network I/O is the one part that
        // genuinely belongs on an event loop.
        const { offThreadDevice } = await esm("ai-bridge/deviceWorker.mjs");
        device = offThreadDevice(device, deviceName);
        // fire and forget: the page polls /progress
        roundhouseDevice({
            callModel: caller, device, question: body.question || "Make and test one falsifiable claim.",
            maxRounds, onRound: (r) => { run.rounds.push(shapeRound(r)); },
        }).then((result) => {
            run.result = { crystallized: !!result.crystallized, rounds: result.rounds, reason: result.reason || null, claim: result.claim || null, verdict: result.verdict || null };
            run.done = true;
        }).catch((e) => { run.error = String(e && e.message || e); run.done = true; });

        return sendJson({ ok: true, runId: run.id, device: deviceName, caller: callerKind, maxRounds });
    }

    if (route === "/models") {
        // The catalogue PLUS what this Ollama actually has, so the page can show "installed / fits / too big"
        // rather than a flat list that invites choosing something the machine cannot hold.
        const { CATALOGUE, describePeer, verifyAgainstInstalled, unverifiedTags } = await esm("tools/roundhouse/modelCatalogue.mjs");
        const base = process.env.OLLAMA_HOST || "http://localhost:11434";
        let installed = [];
        try { const { listLocalModels } = await esm("tools/roundhouse/ollamaCaller.mjs"); installed = (await listLocalModels(base)).map((m) => m.name); } catch {}
        const memoryGB = Number(url.searchParams.get("memoryGB") || 0) || null;
        const kind = url.searchParams.get("kind") || "gpu";
        const peer = memoryGB ? describePeer({ name: "this peer", url: base, kind, memoryGB, totalRamGB: memoryGB }) : null;
        return sendJson({
            ok: true, base, installed,
            catalogue: verifyAgainstInstalled(installed, CATALOGUE),
            peer,
            // named, not hidden: a tag nobody has checked is a guess wearing a list's clothing
            unverified: unverifiedTags(verifyAgainstInstalled(installed, CATALOGUE)),
        });
    }

    if (route === "/pull") {
        // Install on demand. REFUSES anything not in the catalogue -- otherwise this endpoint is "download and
        // run arbitrary weights named by the page", which is a different and much worse thing than a picker.
        const body = req.method === "POST" ? await readBody(req) : {};
        const tag = String(body.tag || url.searchParams.get("tag") || "").trim();
        const { CATALOGUE } = await esm("tools/roundhouse/modelCatalogue.mjs");
        if (!CATALOGUE.some((e) => e.tag === tag)) {
            return sendJson({ ok: false, error: "not-in-catalogue", message: "Refusing to pull '" + tag + "'. Only catalogue models can be installed from here: " + CATALOGUE.map((e) => e.tag).join(", ") }, 400);
        }
        const base = process.env.OLLAMA_HOST || "http://localhost:11434";
        try {
            const r = await fetch(base.replace(/\/$/, "") + "/api/pull", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: tag, stream: false }),
            });
            if (!r.ok) return sendJson({ ok: false, error: "pull-failed", status: r.status, message: "Ollama refused the pull (HTTP " + r.status + "). Is the daemon running?" }, 502);
            return sendJson({ ok: true, tag, note: "pull requested; large models take minutes and Ollama continues in the background" });
        } catch (e) {
            return sendJson({ ok: false, error: "unreachable", message: "Could not reach Ollama at " + base + ": " + (e && e.message) }, 502);
        }
    }

    if (route === "/bench/start") {
        // A MATRIX run: several peers, one model each, every device, N runs. Long-lived, so it uses the same
        // start/poll shape as a single device run rather than blocking a request for an hour.
        const body = req.method === "POST" ? await readBody(req) : {};
        const { describePeer, assignModels } = await esm("tools/roundhouse/modelCatalogue.mjs");
        const { runMatrix } = await esm("tools/roundhouse/modelBench.mjs");
        const { getDevice, DEVICE_NAMES } = await esm("tools/roundhouse/devices.mjs");

        const peerSpecs = Array.isArray(body.peers) ? body.peers : [];
        if (!peerSpecs.length) return sendJson({ ok: false, error: "no-peers", message: "Give at least one peer: [{name,url,kind,memoryGB|totalRamGB}]" }, 400);
        const wanted = Array.isArray(body.devices) && body.devices.length ? body.devices : DEVICE_NAMES;
        const unknown = wanted.filter((n) => !DEVICE_NAMES.includes(n));
        if (unknown.length) return sendJson({ ok: false, error: "unknown-device", message: "Not devices: " + unknown.join(", ") }, 400);

        const peers = peerSpecs.map((p) => describePeer(p));
        const assignments = assignModels(peers).map((a, i) => ({ ...a, url: peerSpecs[i].url, name: peerSpecs[i].name }));
        const devices = [];
        for (const n of wanted) devices.push({ name: n, device: await getDevice(n) });

        const runsPer = Math.max(1, Math.min(20, parseInt(body.runsPer || 3, 10)));
        const maxRounds = Math.max(1, Math.min(8, parseInt(body.maxRounds || 4, 10)));
        const callerKind = String(body.caller || "ollama");

        const run = newRun("matrix", callerKind);
        run.assignments = assignments;
        run.total = assignments.filter((a) => a.model).length * devices.length * runsPer;

        const makeCaller = async ({ peer, model }) => {
            if (callerKind === "mock") {
                // THE NAMING TRAP, THIRD TIME: DEMO_HYPS is keyed by the REGISTRY name ("geometry") while the
                // proposer payload carries device.name, which is DESCRIPTIVE ("marching-tets-geometry"). The
                // first version looked up a key that does not exist and every run came back malformed -- a 0%
                // win rate that looked like a model result. Build the map from the list we already hold instead
                // of deriving it: pass the key, do not guess it.
                const { DEMO_HYPS } = await esm("tools/roundhouse/run-device.mjs");
                const byDescriptive = new Map(devices.map((d) => [d.device.name, DEMO_HYPS[d.name]]));
                return async (role, ctx) => (role === "proposer"
                    ? (byDescriptive.get(ctx && ctx.device) || { claim: {} })
                    : { note: "mock" });
            }
            // A REMOTE peer routes by its OWN provider, not by the matrix-wide caller choice -- that is the
            // point of mixing them: local boxes and a free remote tier in one matrix, judged by one gate.
            if (peer && peer.kind === "remote") {
                const provider = peer.provider || "gemini";
                if (provider !== "gemini") throw new Error("unknown remote provider '" + provider + "' (only gemini is wired)");
                if (!providerKey("GEMINI_API_KEY")) throw new Error("Remote peer '" + peer.name + "' needs a GEMINI_API_KEY in the vault or environment.");
                const { geminiCaller } = await esm("tools/roundhouse/geminiRoleCaller.mjs");
                return geminiCaller({ model });
            }
            const { ollamaCaller } = await esm("tools/roundhouse/ollamaRoleCaller.mjs");
            return ollamaCaller({ model, host: peer.url });
        };

        runMatrix({
            assignments, devices, runsPer, maxRounds, makeCaller,
            onProgress: (row) => { run.rounds.push(row); },
            shouldStop: () => run.stopRequested === true,
        }).then(async (m) => {
            const { collate, collateByDevice, benchReport } = await esm("tools/roundhouse/modelBench.mjs");
            run.result = { models: collate(m.runs), devices: collateByDevice(m.runs), report: benchReport(m.runs), elapsedMs: m.elapsedMs, peers: m.peers.map((p) => ({ peer: p.peer, model: p.model, runs: p.runs.length, skipped: !!p.skipped, failed: !!p.failed, reason: p.reason || null })) };
            run.done = true;
        }).catch((e) => { run.error = String(e && e.message || e); run.done = true; });

        return sendJson({ ok: true, runId: run.id, assignments, devices: wanted.length, runsPer, total: run.total });
    }

    if (route === "/bench/stop") {
        const run = RUNS.get(url.searchParams.get("id") || "");
        if (!run) return sendJson({ ok: false, error: "unknown-run" }, 404);
        run.stopRequested = true;
        return sendJson({ ok: true, stopping: true });
    }

    if (route === "/progress") {
        const id = url.searchParams.get("id") || "";
        const run = RUNS.get(id);
        if (!run) return sendJson({ ok: false, error: "unknown-run", message: "No such run (it may have aged out)." }, 404);
        return sendJson({ ok: true, id: run.id, device: run.device, caller: run.caller, rounds: run.rounds, done: run.done, result: run.result, error: run.error, elapsedMs: Date.now() - run.started, total: run.total || null, assignments: run.assignments || null });
    }

    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, PREFIX, _runs: RUNS };
