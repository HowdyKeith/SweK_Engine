// ai/libraryGenerators.js — v643
//
// Templated Gemini-asset generators built on window.creature(). The user
// wants three growing libraries we can persist and reuse:
//
//   1. LEGO people — minifigure-proportioned voxel figures we can rig with
//      the engine skeleton. Build up a roster, drop into deathmatch, etc.
//   2. FLORA — trees / bushes / flowers / vines / mushrooms to break up the
//      "everything looks like the same box-tree" problem on terrain demos.
//   3. AQUARIA — fish + sea creatures for the aquarium demo.
//
// Each library has:
//   .generate(detail)   — one-shot create + spawn (auto-persisted by the
//                          creatures wrapper).
//   .populate(n, opts)  — bulk-generate N with random template variants,
//                          throttled so we don't slam Gemini.
//   .list()             — all saved entries in this category (filtered by
//                          prompt prefix).
//   .respawn(name)      — re-build from saved prompt (no new Gemini call
//                          unless metadata-only persistence is in use).
//
// Persistence: piggybacks the existing voxelengine.aiCreatures localStorage
// list. Category is identified by the prompt's leading tag, e.g.
// "lego figure: " or "flora: " — so filtering is just a startsWith check.
// No new storage key.
//
// Throttling: populate() waits 6s between calls by default. Gemini's free
// tier has rate limits and these calls take 5–15s each anyway.

const TAG_LEGO    = "lego figure: ";
const TAG_FLORA   = "flora: ";
const TAG_AQUARIA = "aquaria: ";

// Variety pools — kept short and evocative; combined randomly per generation
// to spread the population across professions/colors/styles.
const LEGO_ROLES = [
    "pirate captain", "knight in chrome armor", "astronaut", "wizard with staff",
    "detective with fedora", "ninja in red", "samurai in lacquer armor",
    "deep-sea diver", "construction worker", "firefighter", "park ranger",
    "DJ with headphones", "chef with white hat", "robot drummer",
    "vampire in cape", "alien in goldfish helmet", "scuba marine biologist",
    "mountain climber with pickaxe", "skateboarder in beanie", "florist",
    "racecar driver in helmet", "circus ringmaster", "snake charmer",
    "lumberjack with axe", "wizard apprentice", "warrior princess",
    "viking shieldmaiden", "egyptian queen", "samba dancer", "yodeler",
];
const LEGO_COLORS = ["red", "blue", "green", "yellow", "white", "black",
    "orange", "purple", "teal", "lime", "magenta", "tan", "grey", "brown"];

const FLORA_KINDS = [
    "twisted oak with knotted trunk", "tall pine with low branches",
    "weeping willow", "dead leafless tree", "cherry blossom in bloom",
    "palm tree leaning over", "bamboo cluster", "thick banyan with hanging roots",
    "tropical fern", "rose bush in red flower", "lavender bush",
    "thorn bush with red berries", "tall reeds", "mushroom cluster red caps",
    "blue glowing mushroom", "tulip patch", "sunflower stalks",
    "cactus with arms", "yucca plant", "bonsai pine", "vine creeper",
    "moss-covered rock", "wildflower meadow patch", "lily pad with flower",
];

const AQUARIA_KINDS = [
    "rainbow tropical fish", "angelfish with long fins", "clownfish",
    "blue tang", "moorish idol", "yellow tang", "discus fish",
    "neon tetra", "guppies in school", "betta fish with flowing fins",
    "small octopus", "tiny crab sideways", "starfish",
    "small lobster", "shrimp pink", "tiny seahorse",
    "manta ray", "small reef shark", "moray eel head",
    "puffer fish round", "swordfish small", "jellyfish translucent",
];

function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function _filterByTag(list, tag) {
    return (list || []).filter(c => c && typeof c.prompt === "string" && c.prompt.startsWith(tag));
}

// Build a generator with a category tag + a prompt-builder. Returns an
// object with generate/populate/list/respawn — same shape across all 3.
function _buildLib(tag, randPrompt, niceName) {
    return {
        async generate(detail, opts = {}) {
            const prompt = detail
                ? `${tag}${detail}`
                : `${tag}${randPrompt()}`;
            if (typeof window === "undefined" || !window.creature) {
                console.warn(`[${niceName}] window.creature not available`);
                return { ok: false, error: "no_creature_api" };
            }
            return await window.creature(prompt, opts);
        },
        async populate(n = 10, opts = {}) {
            const delayMs = opts.delayMs ?? 6000;
            n = Math.max(1, Math.min(n, 50));   // safety cap
            console.log(`[${niceName}] populating ${n} entries (one every ${delayMs / 1000}s) — Ctrl+C / refresh to abort`);
            const out = [];
            for (let i = 0; i < n; i++) {
                const r = await this.generate(undefined, opts);
                out.push(r);
                if (r?.ok) console.log(`[${niceName}] ${i + 1}/${n} ✓ ${r.name}`);
                else console.log(`[${niceName}] ${i + 1}/${n} ✗ ${r?.error || "failed"}`);
                if (i < n - 1) await _delay(delayMs);
            }
            const okCount = out.filter(r => r?.ok).length;
            console.log(`[${niceName}] done — ${okCount}/${n} succeeded. Total in library: ${this.list().length}`);
            return out;
        },
        list() {
            try {
                const all = JSON.parse(localStorage.getItem("voxelengine.aiCreatures") || "[]");
                return _filterByTag(all, tag).slice().reverse();   // newest first
            } catch { return []; }
        },
        async respawn(name) {
            if (typeof window === "undefined" || !window.creatures) {
                console.warn(`[${niceName}] window.creatures not available`);
                return { ok: false, error: "no_creatures_api" };
            }
            return await window.creatures.respawn(name);
        },
        // Quick stat report
        count() { return this.list().length; },
        tag: tag,
    };
}

export const lego    = _buildLib(TAG_LEGO,    () => `${_pick(LEGO_COLORS)} ${_pick(LEGO_ROLES)}, classic minifigure proportions, blocky arms and legs`, "lego");
export const flora   = _buildLib(TAG_FLORA,   () => _pick(FLORA_KINDS), "flora");
export const aquaria = _buildLib(TAG_AQUARIA, () => _pick(AQUARIA_KINDS), "aquaria");
