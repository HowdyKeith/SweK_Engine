// FILE: ai-bridge/roundhouseBridge.js
//
// v2804 - front door for the roundhouse agent. Everything under tools/roundhouse/ was CLI-only; this exposes it
// at /roundhouse so roundhouse.html can drive it from the engine instead of a console.
//
// THE KEY NEVER REACHES THE BROWSER. The page asks this bridge to run a route; the bridge resolves the API key
// server-side -- from the existing Windows Credential Manager vault via aiCreds.loadKeysIntoEnv(), falling back
// to an already-set env var -- calls the model, and returns only the ROUTE RESULT (models tried, gate verdicts,
// costs, savings, replay audit). /roundhouse/status reports whether a key is available as a boolean and never
// the value.
//
// Reusing the vault matters: it means no globally-exported ANTHROPIC_API_KEY, which is the exact thing that
// would silently move Claude Code off the subscription onto API billing.
//
// The agent modules are ESM; this bridge is CJS like its siblings, so they load through await import().

const path = require("path");
const { pathToFileURL } = require("url");

const ENGINE = path.join(__dirname, "..");
const esm = (rel) => import(pathToFileURL(path.join(ENGINE, rel)).href);

const PREFIX = "/roundhouse";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

// Resolve a key WITHOUT returning it. true/false only.
function keyAvailable() {
    if (process.env.ANTHROPIC_API_KEY) return { available: true, source: "env" };
    try {
        const creds = require("./aiCreds.js");
        if (typeof creds.loadKeysIntoEnv === "function") {
            const loaded = creds.loadKeysIntoEnv();
            if (process.env.ANTHROPIC_API_KEY) return { available: true, source: (loaded && loaded.claude) || "vault" };
        }
    } catch (e) {
        return { available: false, source: "none", note: "credential vault unavailable: " + (e && e.message ? e.message : e) };
    }
    return { available: false, source: "none" };
}

function readBody(req, limit = 65536) {
    return new Promise((resolve) => {
        let s = "";
        req.on("data", (c) => { s += c; if (s.length > limit) { s = s.slice(0, limit); req.destroy(); } });
        req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
        req.on("error", () => resolve({}));
    });
}

// Strip anything that is not a result: never echo the task payload's internals or any client state.
function shapeRun(r) {
    return {
        truth: r.truth,
        chosen: r.result.chosen,
        verified: r.result.verified,
        escalationExhausted: !!r.result.escalationExhausted,
        escalations: r.stats.escalations,
        totalCost: r.stats.totalCost,
        ifAlwaysStrongest: r.stats.ifAlwaysStrongest,
        saved: r.stats.saved,
        steps: r.stats.perStep,
        replayConsistent: r.audit.consistent,
    };
}

async function handle(req, res, { sendJson }) {
    const url = new URL(req.url, "http://x");
    const route = url.pathname.slice(PREFIX.length) || "/";

    // v3184 -- THE FRONT DOOR FOR labExport. v3183 shipped the format and the re-runnability guarantee with
    // NO CALLER, and this project's law is that a module with no caller is unfinished. Routed here rather than
    // given its own prefix, because /roundhouse already owns the lab and a second owner for one area is the
    // six-copies mistake wearing a URL.
    if (route === "/devices") {
        const { DEVICE_NAMES } = await esm("tools/roundhouse/devices.mjs");
        return sendJson({ ok: true, devices: DEVICE_NAMES });
    }
    if (route === "/export") {
        const D = await esm("tools/roundhouse/devices.mjs");
        const L = await esm("tools/roundhouse/labExport.mjs");
        const want = (url.searchParams.get("devices") || "").split(",").map((x) => x.trim()).filter(Boolean);
        const mode = url.searchParams.get("mode") || null;
        let config = null;
        // A CONFIG THAT WILL NOT PARSE IS REFUSED BY NAME, not quietly dropped. Running with config:null after
        // the caller asked for one would return numbers from a DIFFERENT RUN than the one requested, and the
        // record would carry a config nobody used -- the exact failure this whole arc exists to prevent.
        const raw = url.searchParams.get("config");
        if (raw) { try { config = JSON.parse(raw); } catch (e) { return sendJson({ ok: false, error: "config is not JSON: " + e.message }); } }
        const names = want.length ? want : D.DEVICE_NAMES;
        const unknown = names.filter((n) => !D.DEVICE_NAMES.includes(n));
        if (unknown.length) return sendJson({ ok: false, error: "unknown device(s): " + unknown.join(", ") });
        const records = [];
        for (const n of names) records.push(await L.runRecord(D, n, { mode, config }));
        if (url.searchParams.get("format") === "csv") {
            res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8",
                                 "Content-Disposition": 'attachment; filename="swek-lab-export.csv"' });
            res.end(L.toCSV(records));
            return true;
        }
        return sendJson({ ok: true, count: records.length, records });
    }

    if (route === "/models") {
        // What local models are actually installed. An absent Ollama is an ordinary state, not an error: the
        // chain simply has no local tier, and the page says so rather than offering a model that is not there.
        const { listLocalModels, DEFAULT_OLLAMA } = await esm("tools/roundhouse/ollamaCaller.mjs");
        const base = process.env.OLLAMA_HOST || DEFAULT_OLLAMA;
        const models = await listLocalModels(base);
        return sendJson({ ok: true, base, available: models.length > 0, models });
    }

    if (route === "/status" || route === "/") {
        const { DEFAULT_CHAIN } = await esm("tools/roundhouse/escalateRouteLive.mjs");
        const k = keyAvailable();
        return sendJson({
            ok: true,
            key: { available: k.available, source: k.source, note: k.note },   // boolean only, never the key
            chain: DEFAULT_CHAIN,
            gate: "faceCountGate (exposed voxel faces via the RLE surface stack)",
        });
    }

    if (route === "/run" || route === "/bench") {
        const body = req.method === "POST" ? await readBody(req) : {};
        const dry = !!body.dry || url.searchParams.get("dry") === "1";
        const live = await esm("tools/roundhouse/runLive.mjs");
        const localModel = (body.local || url.searchParams.get("local") || "").trim() || null;

        let client;
        if (dry) {
            client = live.makeDryClient();
        } else {
            const k = keyAvailable();
            if (!k.available) {
                return sendJson({
                    ok: false,
                    error: "no-key",
                    message: "No Anthropic API key available. Store one in the credential vault (the same one the AI bridge uses) or set ANTHROPIC_API_KEY for this server, then retry. Dry run needs no key.",
                }, 400);
            }
            try { client = await live.makeLiveClient(); }
            catch (e) { return sendJson({ ok: false, error: "client", message: e && e.message ? e.message : String(e) }, 400); }
        }

        // A local tier needs no key: if a local model was chosen and there is no client, the chain is local-only.
        try {
            if (localModel) {
                const { makeMixedSetup } = live;
                const setup = await makeMixedSetup({ localModel, client: dry ? null : client });
                const { recordRoute, replayRoute, traceStats } = await esm("tools/roundhouse/agentTrace.mjs");
                const { faceCountGate, makeFaceCountTask } = await esm("tools/roundhouse/swekGates.mjs");
                const task = makeFaceCountTask(3, 4, 5);
                const { result, trace } = await recordRoute({ task, chain: setup.chain, client: null, runGate: faceCountGate, callModel: setup.callModel });
                const audit = await replayRoute(trace, { runGate: faceCountGate });
                return sendJson({ ok: true, dry, mode: "run", localModel, chain: setup.chain, ...shapeRun({ result, trace, audit, stats: traceStats(trace), truth: faceCountGate({}, task).truth }) });
            }
            if (route === "/bench") {
                const count = Math.max(1, Math.min(50, parseInt(body.count || url.searchParams.get("count") || "12", 10)));
                const { stats } = await live.runBench({ client, count });
                return sendJson({ ok: true, dry, mode: "bench", stats });
            }
            const r = await live.runOne({ client });
            return sendJson({ ok: true, dry, mode: "run", ...shapeRun(r) });
        } catch (e) {
            return sendJson({ ok: false, error: "run", message: e && e.message ? e.message : String(e) }, 500);
        }
    }

    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, keyAvailable, PREFIX };
