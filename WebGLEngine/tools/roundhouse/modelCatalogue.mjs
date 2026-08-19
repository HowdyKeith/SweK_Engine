// tools/roundhouse/modelCatalogue.mjs
//
// v2826 -- a curated list of local models the roundhouse can propose with, plus the arithmetic for WHICH OF THEM
// A GIVEN MACHINE CAN ACTUALLY RUN. The fleet is heterogeneous -- an 8GB GTX 1070, Macs with unified memory, and
// CPU-only boxes -- so "which model" is not one answer, it is a function of the peer.
//
// THE CATALOGUE IS A STARTING POINT, NOT AN AUTHORITY, and the code says so in a way that cannot be ignored:
// every entry carries verified:false until it has been checked against a real Ollama registry. Model tags move,
// get renamed, and get pulled; a hardcoded list recalled from documentation is exactly the kind of "truth" that
// was wrong in the fifth decimal during the Fresnel round. verifyAgainstInstalled() replaces belief with a
// lookup, and unverifiedTags() names what has not been checked yet rather than letting it pass quietly.
//
// SIZING RULE, and it is arithmetic rather than opinion:
//     required memory ~= the Q4_K_M artifact size + ~1.5 GB of KV cache and runtime overhead
// A model that does not fit does not merely run slowly -- it spills to system memory and drops by an order of
// magnitude, which would poison a latency measurement without ever looking like a failure.
//
// ON APPLE SILICON the pool is UNIFIED, so the budget is total RAM minus what the OS needs, not a separate VRAM
// figure. That is why a 16GB Mac reaches a model class an 8GB discrete card cannot.
//
// Pure, no imports, browser-safe.

export const KV_OVERHEAD_GB = 1.5;

// approxGB = Q4_K_M artifact size. params is billions. jsonNote records what is known about STRUCTURED OUTPUT
// reliability, because that -- not general chat quality -- is what decides whether a proposer is usable here.
export const CATALOGUE = [
    { tag: "llama3.2:3b",      params: 3,    approxGB: 2.0, tier: "tiny",   jsonNote: "small and fast; expect more malformed proposals", verified: false },
    { tag: "phi4-mini",        params: 3.8,  approxGB: 2.5, tier: "tiny",   jsonNote: "reported unusually reliable at structured output for its size -- worth a slot on a CPU peer", verified: false },
    { tag: "qwen2.5:7b",       params: 7,    approxGB: 4.4, tier: "small",  jsonNote: "solid general proposer at the 8GB tier", verified: false },
    { tag: "mistral:7b",       params: 7,    approxGB: 4.4, tier: "small",  jsonNote: "keep the context short at this tier", verified: false },
    { tag: "llama3.1:8b",      params: 8,    approxGB: 4.9, tier: "small",  jsonNote: "widely used baseline", verified: false },
    { tag: "qwen2.5:14b",      params: 14,   approxGB: 9.0, tier: "medium", jsonNote: "needs a 16GB-class peer; out of reach of an 8GB card", verified: false },
    { tag: "gemma3:27b",       params: 27,   approxGB: 16.0, tier: "large", jsonNote: "32GB-class unified memory", verified: false },
    { tag: "qwen2.5:32b",      params: 32,   approxGB: 20.0, tier: "large", jsonNote: "the class an 8GB card cannot touch -- the reason to compare at all", verified: false },
];

// What a peer can hold. `memoryGB` is VRAM for a discrete card, or (total RAM - OS reserve) for unified memory.
export const requiredGB = (entry) => entry.approxGB + KV_OVERHEAD_GB;
export const fitsIn = (entry, memoryGB) => requiredGB(entry) <= memoryGB;

// Everything this peer can run, largest first -- the largest that fits is usually the one worth measuring.
export function modelsFor(memoryGB, catalogue = CATALOGUE) {
    return catalogue.filter((e) => fitsIn(e, memoryGB)).sort((a, b) => b.params - a.params);
}

// The single best candidate for a peer, or null when nothing fits (an honest answer, not a shrug).
export function bestFor(memoryGB, catalogue = CATALOGUE) {
    const f = modelsFor(memoryGB, catalogue);
    return f.length ? f[0] : null;
}

// Apple Silicon shares one pool with the OS. Reserving a fixed slice is cruder than measuring, but it fails in
// the safe direction: under-promise the budget rather than pick a model that will swap.
export const unifiedBudgetGB = (totalRamGB, osReserveGB = 4) => Math.max(0, totalRamGB - osReserveGB);

// ON A CPU PEER, MEMORY IS NOT THE BINDING CONSTRAINT -- THROUGHPUT IS. A CPU box with 16GB of RAM will happily
// LOAD a 14B and then generate at roughly a token a second, which is not slow-but-usable, it is a run that never
// finishes. The first version of describePeer sized CPU peers purely by memory and duly assigned one a 14B; the
// fleet printout is what caught it. So a CPU peer is capped by PARAMETER COUNT as well as by fit.
export const CPU_MAX_PARAMS = 4;

// A REMOTE peer consumes NONE of the fleet's hardware -- no VRAM, no throughput cap, no swap cost -- so the
// memory arithmetic that governs every local peer simply does not apply to it. Its model is NAMED rather than
// fitted, because we cannot know (and do not need to know) what the far end is running on. That is also why a
// remote peer runs fully parallel with every local one: it competes for nothing except a rate limit.
//
// Which is the one thing it DOES need: a free tier is per-minute tight, so a remote peer carries a minimum
// interval between runs. Pacing is cheaper than discovering the limit as a wall of 429s halfway through a matrix.
export const DEFAULT_REMOTE_INTERVAL_MS = 6500;      // ~9/min, inside a 10 RPM ceiling with room to spare

// A peer descriptor the scheduler and the page both read.
export function describePeer({ name, url, kind = "gpu", memoryGB = 0, totalRamGB = 0, osReserveGB = 4, model = null, provider = null, minIntervalMs = null }) {
    if (kind === "remote") {
        if (!model) return { name, url, kind, remote: true, budgetGB: null, canRun: [], best: null, nothingFits: true, reason: "a remote peer must NAME its model -- there is no local memory to fit it against" };
        return {
            name, url, kind, remote: true, provider: provider || "gemini",
            budgetGB: null,                 // deliberately null, not 0: the concept does not apply
            canRun: [model], best: model, nothingFits: false,
            batchOnly: false, cappedByThroughput: null,
            minIntervalMs: minIntervalMs == null ? DEFAULT_REMOTE_INTERVAL_MS : minIntervalMs,
        };
    }
    const budget = kind === "unified" ? unifiedBudgetGB(totalRamGB, osReserveGB) : memoryGB;
    const fits = modelsFor(budget).filter((e) => kind !== "cpu" || e.params <= CPU_MAX_PARAMS);
    return {
        name, url, kind, budgetGB: budget,
        // CPU peers are not "too slow to bother with" -- this workload is BATCH. A proposal is a few hundred
        // tokens, so a small model on a CPU peer still produces hundreds of samples overnight, and the RATE it
        // measures is the same rate a fast peer measures. Only its latency column differs.
        batchOnly: kind === "cpu",
        cappedByThroughput: kind === "cpu" ? CPU_MAX_PARAMS : null,
        canRun: fits.map((e) => e.tag),
        best: fits.length ? fits[0].tag : null,
        nothingFits: fits.length === 0,
        remote: false,
        minIntervalMs: 0,                   // local hardware needs no pacing; it is limited by its own speed
    };
}

// --- verification: replace belief with a lookup ---------------------------------------------------------
// installedTags comes from Ollama's /api/tags. An entry is verified when the registry actually has it.
export function verifyAgainstInstalled(installedTags, catalogue = CATALOGUE) {
    const have = new Set((installedTags || []).map((t) => String(t).trim()));
    const baseOf = (t) => String(t).split(":")[0];
    const haveBases = new Set([...have].map(baseOf));
    return catalogue.map((e) => ({
        ...e,
        installed: have.has(e.tag),
        // a different quant of the same family counts as present-but-not-exact, which is worth distinguishing
        familyPresent: haveBases.has(baseOf(e.tag)),
        verified: have.has(e.tag),
    }));
}

// What has NOT been checked. Naming it is the point: an unverified tag is a guess wearing a list's clothing.
export function unverifiedTags(catalogue = CATALOGUE) {
    return catalogue.filter((e) => !e.verified).map((e) => e.tag);
}

// Assign one model per peer so nothing ever swaps: each peer keeps its model resident for the whole run.
// Distinct models where possible, because two peers running the SAME model measure the same thing twice.
export function assignModels(peers, catalogue = CATALOGUE) {
    const used = new Set();
    return peers.map((p) => {
        // A REMOTE peer already knows its model -- there is nothing to fit, so it passes straight through.
        if (p.remote) {
            if (p.best) used.add(p.best);
            return { peer: p.name, url: p.url, model: p.best, budgetGB: null, kind: "remote", provider: p.provider || "gemini", minIntervalMs: p.minIntervalMs || DEFAULT_REMOTE_INTERVAL_MS, reason: p.best ? null : (p.reason || "no model named") };
        }
        // respect the peer's OWN canRun list, which already carries the CPU throughput cap
        const allowed = p.canRun ? new Set(p.canRun) : null;
        const options = modelsFor(p.budgetGB, catalogue).filter((e) => !allowed || allowed.has(e.tag));
        const pick = options.find((e) => !used.has(e.tag)) || options[0] || null;
        if (pick) used.add(pick.tag);
        return { peer: p.name, url: p.url, model: pick ? pick.tag : null, budgetGB: p.budgetGB, kind: p.kind, provider: null, minIntervalMs: 0, reason: pick ? null : "no catalogue model fits this peer" };
    });
}
