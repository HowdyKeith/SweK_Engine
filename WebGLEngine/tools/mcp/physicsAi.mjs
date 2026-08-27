#!/usr/bin/env node
// WebGLEngine/tools/mcp/physicsAi.mjs -- v4067
// ---------------------------------------------------------------------------------------------------------------
// THE PHYSICS AI, REACHABLE BY AN MCP CLIENT -- the proposer registry as callable tools instead of source
// somebody has to read.
//
// *** WHAT THIS REPLACES, CONCRETELY. *** Answering "which knobs are still on a hand-picked shortlist, and what
// would the adaptive search find on each" currently means writing a throwaway script, running it, reading the
// output and deleting it. That is how v4066 was built and it is how every question about this registry has been
// answered. This makes it a standing interface: list, run, compare, and the monotonicity probe that decides
// whether a knob may declare a search at all.
//
// *** THE TRAP THIS FILE IS BUILT TO AVOID IS THE ONE THIS TREE NAMES MOST OFTEN: A SECOND DECLARATION. *** An
// MCP shim is a natural place to hand-type a description of what runProposer returns and which proposers exist
// -- and then proposers.mjs changes (as it did last round, gaining `searched`) and the shim silently describes a
// shape nobody returns any more. Every tool below is therefore DERIVED FROM THE LIVE REGISTRY:
//
//   - the proposer id list comes from listProposers() at call time, never from an enum typed here
//   - "does this knob have a search" is read off the registered proposer, never from a list in this file
//   - NO `outputSchema` IS DECLARED ANYWHERE. Declaring one would be a second copy of runProposer's return
//     shape, which is exactly the drift being avoided; the real object is returned as JSON and the caller reads
//     the fields proposers.mjs actually produced.
//
// *** AND IT IS READ-ONLY WHERE IT MATTERS: grantLicence IS DELIBERATELY NOT EXPOSED. *** It is the one path in
// the registry that WRITES (knob-licences.json) and the one that RAISES a tier. proposers.mjs already refuses to
// take a caller's bare {pass:true} -- it re-checks the adjudication itself -- so exposing it would not be
// forgeable. It is still not exposed, because today only this repo's own runs can move the ratchet at all, and
// an MCP client is by construction something else. Reading the licences is offered; changing them is not.
// applyKnobs is likewise absent: at 'adopt' it is the apply path, and nothing here should be able to reach it.
//
// RUN:  node tools/mcp/physicsAi.mjs           (speaks MCP over stdio)
// WIRE: add to an MCP client's server list, e.g. claude_desktop_config.json:
//         { "mcpServers": { "swek-physics": { "command": "node",
//             "args": ["<abs path>/WebGLEngine/tools/mcp/physicsAi.mjs"] } } }
//
// DEPENDENCY, AND WHY IT IS OPTIONAL: @modelcontextprotocol/sdk lives in ai-bridge/'s optionalDependencies
// beside ffmpeg-static and puppeteer-core, which is the precedent for "a real feature that not every rig needs
// installed". This process is standalone -- ai-bridge/server.js does not load it -- so a rig without the SDK
// boots exactly as before and this file says what is missing rather than throwing a module-not-found stack.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

// The SDK is resolved from ai-bridge/node_modules (where package.json declares it) as well as any ambient
// install, and a MISSING one is NAMED rather than allowed to surface as a raw stack trace -- v3237/v3258's
// rule, which this tree has had to learn more than once: "not installed" and "broken" are different facts.
// *** EVERY DEPENDENCY IS RESOLVED THE SAME TWO WAYS, AND THE FIRST DRAFT GOT THIS WRONG IN THE WAY THAT IS
// HARDEST TO SEE. *** The SDK was found by an explicit ai-bridge/node_modules path but `zod` -- the SDK's own
// peer, installed beside it -- was still imported as a BARE SPECIFIER, which does not resolve from tools/mcp/.
// The zod import threw inside the same try, the loop fell through, and the process printed
// "@modelcontextprotocol/sdk is not installed" WITH THE SDK SITTING ON DISK. A diagnosis that names the wrong
// missing thing is worse than a stack trace, and it is exactly the misattribution playwrightResolve.mjs was
// written to end for chromium ("it printed 'no chromium at SHELL' whenever EITHER half was missing"). So the
// resolver reports WHICH half failed, on its own evidence.
const NM = path.join(ENG, "ai-bridge", "node_modules");
async function importEither(bare, rel) {
    try { return await import(bare); } catch {}
    return await import("file://" + path.join(NM, rel));
}
async function loadSdk() {
    let mcp, stdio, zod;
    try { mcp = await importEither("@modelcontextprotocol/sdk/server/mcp.js", "@modelcontextprotocol/sdk/dist/esm/server/mcp.js"); }
    catch (e) { return { error: "@modelcontextprotocol/sdk not resolvable (" + ((e && e.code) || e) + ")" }; }
    try { stdio = await importEither("@modelcontextprotocol/sdk/server/stdio.js", "@modelcontextprotocol/sdk/dist/esm/server/stdio.js"); }
    catch (e) { return { error: "the SDK resolved but its stdio transport did not (" + ((e && e.code) || e) + ")" }; }
    try { zod = await importEither("zod", "zod/index.js"); }
    catch (e) { return { error: "the SDK resolved but ITS PEER `zod` did not -- the SDK is present and its dependency tree is incomplete; re-run npm install in ai-bridge/ (" + ((e && e.code) || e) + ")" }; }
    return { McpServer: mcp.McpServer, StdioServerTransport: stdio.StdioServerTransport, z: zod.z || zod.default?.z };
}

/**
 * Load the physics registry. Kept as a function rather than a top-level import so the gate can call it directly
 * and so a registry that throws is reported as a tool error instead of killing the server at boot.
 */
export async function loadRegistry() {
    const proposers = await import("file://" + path.join(ENG, "physics", "proposers.mjs"));
    const registry = await import("file://" + path.join(ENG, "physics", "knobRegistry.mjs"));
    proposers.resetRegistry();
    registry.registerAll();
    return { proposers, registry };
}

const asText = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });
const asError = (msg) => ({ isError: true, content: [{ type: "text", text: msg }] });

/**
 * The tool set, built against a loaded registry. Exported so the gate can exercise every handler WITHOUT
 * standing up a transport -- a gate that only checked "the server starts" would prove nothing about what the
 * tools return, which is the whole surface.
 */
export function buildTools({ proposers, registry }) {
    const { listProposers, getProposer, runProposer, probeMonotone } = proposers;

    // ONE resolver for "is this a real proposer", so every tool refuses an unknown id the same way and names
    // the ids that do exist rather than answering with an empty result that reads like "nothing to report".
    const resolve = (id) => {
        const p = getProposer(id);
        if (!p) {
            const known = listProposers().map((x) => x.id).join(", ");
            return { error: "no proposer '" + id + "'. Registered: " + known };
        }
        return { p };
    };

    return {
        physics_list_proposers: {
            config: {
                title: "List physics knob proposers",
                description:
                    "Every registered proposer in the SweK physics lab: its instrument, the knobs it tunes, its " +
                    "licence tier, and whether it uses the ADAPTIVE boundary search or a hand-picked static " +
                    "shortlist. Also returns the instruments deliberately NOT registered, with the reason for " +
                    "each. Read this first -- ids from here are the input to every other tool.",
                inputSchema: {},
            },
            handler: async () => {
                const rows = listProposers().map((r) => {
                    const p = getProposer(r.id);
                    return {
                        ...r,
                        // DERIVED from the live proposer, never a list maintained in this file.
                        searchKind: p.search ? "adaptive-bisect" : "static-shortlist",
                        searchKnob: p.search ? (p.search.knob || null) : null,
                        searchRange: p.search ? { cheap: p.search.cheap, costly: p.search.costly,
                                                  integer: !!p.search.integer } : null,
                    };
                });
                return asText({
                    registered: rows,
                    counts: { total: rows.length,
                              adaptive: rows.filter((r) => r.searchKind === "adaptive-bisect").length,
                              static: rows.filter((r) => r.searchKind === "static-shortlist").length },
                    notRegistered: registry.NOT_REGISTERED,
                    note: "A static-shortlist proposer answers with the cheapest of a few hand-typed numbers " +
                          "that survives adjudication -- not the cheapest value that survives. Use " +
                          "physics_compare_paths to see the gap on a specific knob.",
                });
            },
        },

        physics_run_proposer: {
            config: {
                title: "Run one physics knob proposer",
                description:
                    "Runs propose -> score -> adjudicate for one instrument and returns the full result, " +
                    "including every candidate tried with its verdict. `accepted` is the cheapest candidate " +
                    "that survived the independent adjudicator; null means every candidate was refused, which " +
                    "is a real outcome. Set adaptive=false to force the static shortlist on a proposer that " +
                    "declares a search.",
                inputSchema: { id: null, adaptive: null },   // filled in with zod by the caller below
            },
            handler: async ({ id, adaptive }) => {
                const r = resolve(id);
                if (r.error) return asError(r.error);
                try {
                    const out = runProposer(id, adaptive === false ? { adaptive: false } : {});
                    return asText(out);
                } catch (e) { return asError("runProposer(" + id + ") threw: " + ((e && e.message) || e)); }
            },
        },

        physics_compare_paths: {
            config: {
                title: "Compare the static shortlist against the adaptive boundary search",
                description:
                    "Runs BOTH paths on one proposer and reports what each accepts. This is the question the " +
                    "shortlist could never answer about itself: the static walk returns the cheapest hand-typed " +
                    "number that passes, the adaptive search returns the actual edge, and the gap between them " +
                    "is how much the instrument was overpaying. Works on any proposer -- one that declares no " +
                    "search reports that, rather than pretending to have searched.",
                inputSchema: { id: null },
            },
            handler: async ({ id }) => {
                const r = resolve(id);
                if (r.error) return asError(r.error);
                const p = r.p;
                if (!p.search) {
                    return asText({
                        id, comparable: false,
                        why: "this proposer declares no `search`, so there is no adaptive path to compare " +
                             "against. Its answer is the cheapest of its hand-picked shortlist that passes.",
                        static: runProposer(id, { adaptive: false }),
                    });
                }
                const st = runProposer(id, { adaptive: false });
                const ad = runProposer(id);
                const knob = ad.searched.knob;
                const pick = (res) => (res.accepted && knob && knob in res.accepted) ? res.accepted[knob] : res.accepted;
                return asText({
                    id, comparable: true, knob,
                    staticAccepted: pick(st), adaptiveAccepted: pick(ad),
                    staticAdjudications: st.adjudicated, adaptiveAdjudications: ad.adjudicated,
                    boundaryVerified: ad.searched.boundaryVerified,
                    failingSide: ad.searched.failingSide,
                    // Reported on every adaptive answer: a bisection proves its bracket and its local edge, not
                    // that the verdict flips only once. physics_probe_monotone is how you check that.
                    assumesMonotone: ad.searched.assumesMonotone,
                    note: "adaptiveAccepted is an EDGE: it passes and failingSide, one step cheaper, does not. " +
                          "The cost of knowing that is the extra adjudications shown above.",
                });
            },
        },

        physics_probe_monotone: {
            config: {
                title: "Check whether a knob's adjudicator is monotone",
                description:
                    "Sweeps a proposer's declared range and COUNTS how many times the adjudicator's verdict " +
                    "flips. A bisection is only valid where it flips once. This is the check that licenses a " +
                    "knob to declare a search -- and the one that disqualified lz-window, whose Landau-Zener " +
                    "sweep rings (PASS at T=4, fail at 5, PASS at 6 and 7, fail at 8). Give cheap/costly " +
                    "explicitly to probe a proposer that declares no search of its own.",
                inputSchema: { id: null, samples: null, cheap: null, costly: null },
            },
            handler: async ({ id, samples, cheap, costly }) => {
                const r = resolve(id);
                if (r.error) return asError(r.error);
                const p = r.p, s = p.search;
                const lo = (cheap !== undefined && cheap !== null) ? cheap : (s ? s.cheap : undefined);
                const hi = (costly !== undefined && costly !== null) ? costly : (s ? s.costly : undefined);
                if (lo === undefined || hi === undefined) {
                    return asError("'" + id + "' declares no search, so there is no range to sweep. Pass cheap " +
                                   "and costly explicitly to probe it anyway.");
                }
                // A proposer with no `search` has no make(), so a single-knob candidate is built from its first
                // declared knob name -- stated here because it is an ASSUMPTION about that proposer's shape.
                const make = (s && s.make) ? s.make
                    : (v) => ({ [(p.knobs && p.knobs[0]) || "value"]: v });
                try {
                    const m = probeMonotone({
                        cheap: lo, costly: hi, integer: !!(s && s.integer),
                        samples: samples || 24,
                        passes: (v) => p.adjudicate(make(v)).pass === true,
                    });
                    return asText({
                        id, cheap: lo, costly: hi, flips: m.flips, monotone: m.monotone,
                        samples: m.samples, firstPass: m.firstPass, resolved: m.resolved,
                        trail: m.trail,
                        verdict: m.monotone
                            ? "one flip: a bisection over this range is valid, and the search's answer is THE edge"
                            : "more than one flip: a bisection would find AN edge and report it with the " +
                              "confidence of the right one. This knob should stay on its static shortlist.",
                        madeCandidateBy: (s && s.make) ? "the proposer's own search.make()"
                            : "assuming a single knob named '" + ((p.knobs && p.knobs[0]) || "value") + "'",
                    });
                } catch (e) { return asError("probe threw: " + ((e && e.message) || e)); }
            },
        },

        physics_licences: {
            config: {
                title: "Read the knob licence tiers (read-only)",
                description:
                    "Current licence tier for every proposer, plus the adjudicated evidence any raised tier was " +
                    "granted on. READ ONLY BY DESIGN: granting a tier writes to disk and is the one path that " +
                    "can let a device turn its own knobs, so it is not exposed here at all. Tiers: read (may " +
                    "report, may not change), propose (suggests; a human or gate applies), adopt (applies on " +
                    "its own, and only after its adjudicator passes).",
                inputSchema: {},
            },
            handler: async () => asText({
                licencePath: proposers.licencePath(),
                tiers: proposers.TIERS,
                licences: listProposers().map((r) => {
                    const p = getProposer(r.id);
                    return { id: r.id, tier: p.tier, instrument: p.instrument,
                             granted: (p.granted || []).map((g) => ({ tier: g.tier, at: g.at, evidence: g.evidence })) };
                }),
                readOnly: "grantLicence and applyKnobs are deliberately not exposed by this shim",
            }),
        },
    };
}

// ---- transport ------------------------------------------------------------------------------------------
async function main() {
    const sdk = await loadSdk();
    if (sdk.error) {
        console.error("[mcp-physics] cannot start: " + sdk.error + "\n" +
            "  Install where package.json already declares it:\n" +
            "    cd " + path.join(ENG, "ai-bridge") + " && npm install\n" +
            "  (it is an optionalDependency, so a bridge install skips it silently when the network is down)");
        process.exit(1);
    }
    const { McpServer, StdioServerTransport, z } = sdk;

    let loaded;
    try { loaded = await loadRegistry(); }
    catch (e) {
        console.error("[mcp-physics] the physics registry failed to load: " + ((e && e.message) || e));
        process.exit(1);
    }

    const server = new McpServer({ name: "swek-physics-ai", version: "4067" });
    const tools = buildTools(loaded);

    // Zod shapes live HERE and not in buildTools, so the handlers stay plain functions the gate can call with
    // ordinary objects -- the schema is the transport's business, not the tool's.
    const shapes = {
        physics_list_proposers: {},
        physics_run_proposer: {
            id: z.string().describe("proposer id from physics_list_proposers"),
            adaptive: z.boolean().optional().describe("false forces the static shortlist even on a searching proposer"),
        },
        physics_compare_paths: { id: z.string().describe("proposer id from physics_list_proposers") },
        physics_probe_monotone: {
            id: z.string().describe("proposer id from physics_list_proposers"),
            samples: z.number().int().min(3).max(200).optional().describe("sweep resolution (default 24)"),
            cheap: z.number().optional().describe("cheap end; defaults to the proposer's declared search range"),
            costly: z.number().optional().describe("costly end; defaults to the proposer's declared search range"),
        },
        physics_licences: {},
    };

    for (const [name, t] of Object.entries(tools)) {
        server.registerTool(name, { ...t.config, inputSchema: shapes[name] }, t.handler);
    }

    await server.connect(new StdioServerTransport());
    console.error("[mcp-physics] serving " + Object.keys(tools).length + " tools over stdio");
}

// Only run the transport when executed directly; importing this file (as the gate does) must not open stdio.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error("[mcp-physics] fatal: " + ((e && e.stack) || e)); process.exit(1); });
}
