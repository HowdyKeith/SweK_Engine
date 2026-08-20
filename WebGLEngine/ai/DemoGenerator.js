// FILE: ai/DemoGenerator.js
// VERSION: v1
//
// Asks a local Ollama daemon to synthesize demo specs (the same JSON
// shape the demo menu reads). Two modes:
//
//   * generateSingle(prompt) — one camera pose
//   * generateSequence(prompt, steps) — N-step cinematic walkthrough
//
// World context (biome layout, coord conventions, height range, etc.)
// is baked into the system prompt so the model produces poses that
// actually frame interesting parts of the world. The schema is shown
// with a worked example so the model has a template to mirror.
//
// Uses its own OllamaClient instance (separate from NarrativeEngine's)
// so demo generation gets a 20s timeout + 600 token budget without
// affecting the narrative latency profile.

import { OllamaClient } from "./OllamaClient.js";

const SYSTEM_PROMPT_BASE = `You write camera demo specs for a voxel engine called VoxelEngine.

WORLD GEOMETRY
- Coordinate system: Y is up. X and Z are horizontal. Y=0 is the world floor.
- Biomes (smooth low-frequency noise picks one at every X,Z):
  * desert  (low, flat, sand all the way down) — biome value < -0.5
  * plains  (gentle hills, grass on top, dirt below) — between -0.5 and 0.5
  * mountain (taller peaks, stone exposed above y=36) — biome value > 0.5
- Terrain heights: ~y=1 in lowest desert valleys, ~y=49 at mountain peaks. Water level is y=8 — anything lower in the world is ocean.
- Cyan memory obelisks stand at world positions (12, surface, 8), (-8, surface, 14), and (5, surface, -10). Each is a 3x3 base with a 4-tall spire.
- Camera spawn pose is x=0 y=60 z=80 yaw=0 pitch=-0.4 (looking forward and slightly down).

CAMERA CONVENTIONS
- yaw is in radians. yaw=0 looks toward -Z. yaw=PI/2 (~1.57) looks toward +X. yaw=-PI/2 looks toward -X. yaw=PI looks toward +Z.
- pitch is in radians. pitch=0 is level. negative pitch tilts the camera down toward the ground; -1.4 is nearly straight down. Positive pitch tilts up toward the sky.
- Reasonable y values for cameras: 15-30 for low/cinematic angles, 40-80 for surveying, 100-200 for sky views.

GOOD WELL-FORMED EXAMPLES
{"name":"Mountain Ridge","description":"Side-on view of a mountain peak with sun behind it.","camera":{"x":50,"y":65,"z":70,"yaw":-0.6,"pitch":-0.4}}
{"name":"Origin Sky Survey","description":"High top-down view of biome distribution.","camera":{"x":0,"y":140,"z":30,"yaw":0,"pitch":-1.3}}
{"name":"Desert Walk","description":"Low-altitude human-scale view across desert sand.","camera":{"x":-40,"y":18,"z":40,"yaw":1.2,"pitch":-0.1}}

OUTPUT RULES
- Reply with ONLY the JSON object. No commentary, no Markdown fences, no code blocks.
- Use double-quoted JSON keys and string values.
- All numeric fields must be plain numbers (no expressions, no Math.PI — use 3.14 if you mean PI).
- Pick coordinates that frame something visually interesting given the user's request.`;

const SCHEMA_SINGLE = `
SCHEMA YOU MUST RETURN
{
  "name": "<short evocative name, 2-5 words>",
  "description": "<one sentence describing what the viewer will see>",
  "camera": { "x": <number>, "y": <number>, "z": <number>, "yaw": <number>, "pitch": <number> }
}`;

const SCHEMA_SEQUENCE = (n) => `
SCHEMA YOU MUST RETURN
{
  "name": "<short evocative name, 2-5 words>",
  "description": "<one sentence describing the cinematic arc>",
  "sequence": [
    { "camera": { "x": <n>, "y": <n>, "z": <n>, "yaw": <n>, "pitch": <n> }, "duration": <seconds> },
    ...
  ]
}

The sequence should be ${n} steps. Each step is a camera target; the engine will smoothly tween from each step to the next over its duration.
- duration is seconds (use 2.0-5.0 per step).
- Each step's camera should be different from the previous one — actually move through the world.
- Total runtime ≈ ${n * 3} seconds. Tell a small visual story: establish, approach, reveal.`;

const SCHEMA_STRUCTURE = `
PRIMITIVES YOU CAN COMPOSE
The "structures" array can contain any of these. Each is expanded into voxel writes by the engine.

  box: { "kind":"box", "x0":n, "y0":n, "z0":n, "x1":n, "y1":n, "z1":n, "material":m, "hollow":true|false }
       — Axis-aligned rectangular volume. hollow:true gives only the shell.
  column: { "kind":"column", "x":n, "z":n, "y0":n, "y1":n, "material":m }
       — Vertical pillar at (x, z) from y0 to y1.
  ring: { "kind":"ring", "cx":n, "cy":n, "cz":n, "radius":n, "material":m }
       — Hollow horizontal circle at height cy. Stack at multiple cy to form a tube/tower.
  disk: { "kind":"disk", "cx":n, "cy":n, "cz":n, "radius":n, "material":m }
       — Filled horizontal disk at height cy.
  line: { "kind":"line", "x0":n, "y0":n, "z0":n, "x1":n, "y1":n, "z1":n, "material":m }
       — 3D Bresenham line between two points.

MATERIAL IDs (use these exact integers)
  0 = air (carve)        1 = stone        2 = dirt         3 = grass
  4 = sand              10 = water       12 = lava        30 = memory (cyan)

CONSTRAINTS
- Coordinates: x and z in [-200, 200]. y in [0, 63]. Out-of-range gets clamped, so stay reasonable.
- Total expanded voxels are capped at 2000 per generation.
- Place the structure somewhere visible: near the origin (small radii), or near the camera you specify.
- The camera should frame the structure — look toward it from a good distance and angle.

OUTPUT SCHEMA
{
  "name": "<short evocative name>",
  "description": "<one sentence>",
  "camera": { "x":n, "y":n, "z":n, "yaw":n, "pitch":n },
  "structures": [
    { "kind":"...", ... },
    ...
  ]
}

WORKED EXAMPLE — small hollow stone tower at origin
{"name":"Stone Tower","description":"Small hollow stone tower at the world origin.","camera":{"x":15,"y":28,"z":15,"yaw":-2.4,"pitch":-0.25},"structures":[{"kind":"ring","cx":0,"cy":15,"cz":0,"radius":3,"material":1},{"kind":"ring","cx":0,"cy":16,"cz":0,"radius":3,"material":1},{"kind":"ring","cx":0,"cy":17,"cz":0,"radius":3,"material":1},{"kind":"ring","cx":0,"cy":18,"cz":0,"radius":3,"material":1},{"kind":"ring","cx":0,"cy":19,"cz":0,"radius":3,"material":1},{"kind":"ring","cx":0,"cy":20,"cz":0,"radius":3,"material":1},{"kind":"disk","cx":0,"cy":21,"cz":0,"radius":3,"material":1}]}`;

export class DemoGenerator {
    constructor(opts = {}) {
        // Dedicated client: longer timeout + larger budget than narrative.
        // Generating a sequence of 5 cameras can take 8-15s on a small
        // local model; the narrative engine's 4s would always abort.
        this.client = new OllamaClient({
            model: opts.model ?? "llama3.2",
            timeoutMs: opts.timeoutMs ?? 20000,
        });
    }

    async generateSingle(userPrompt) {
        const sys = SYSTEM_PROMPT_BASE + SCHEMA_SINGLE;
        const full = `${sys}

USER REQUEST: ${userPrompt}

JSON RESPONSE:`;
        return this._callAndParse(full, /*tokens*/ 250);
    }

    async generateSequence(userPrompt, steps = 5) {
        steps = Math.max(2, Math.min(8, steps | 0));
        const sys = SYSTEM_PROMPT_BASE + SCHEMA_SEQUENCE(steps);
        const full = `${sys}

USER REQUEST: ${userPrompt}

JSON RESPONSE:`;
        return this._callAndParse(full, /*tokens*/ 700);
    }

    async generateStructure(userPrompt) {
        const sys = SYSTEM_PROMPT_BASE + SCHEMA_STRUCTURE;
        const full = `${sys}

USER REQUEST: ${userPrompt}

JSON RESPONSE:`;
        // Larger budget — structures with many primitives need it.
        return this._callAndParse(full, /*tokens*/ 900);
    }

    // Generate a small voxel creature spec — same schema as
    // generateStructure but constrained to creature-shaped output:
    // small (≤6 primitives), centered around origin. Used by first-run
    // population (ui/firstRunModal.js) to seed models/scene/ with
    // procedural creatures while we wait for real GLBs.
    async generateCreature(name, descriptor) {
        const sys = SYSTEM_PROMPT_BASE + SCHEMA_STRUCTURE;
        const full = `${sys}

USER REQUEST: Generate a small voxel creature spec called "${name}".
Description: ${descriptor || name}.
Constraints: 3 to 6 primitives, total height 2-4 units, centered near origin (0,0,0).
At least one box or column primitive for the body mass. Use any materials
from {1: stone, 2: dirt, 3: grass, 12: lava, 30: memory} that fit the
creature's nature.

JSON RESPONSE:`;
        return this._callAndParse(full, /*tokens*/ 600);
    }

    // ---- internals ---------------------------------------------------

    async _callAndParse(prompt, num_predict) {
        const raw = await this.client.generate(prompt, {
            num_predict,
            temperature: 0.8,
            stop: [],   // don't stop on \n\n — JSON has those
        });
        if (!raw) {
            console.warn("[DemoGenerator] Ollama returned null (unreachable / model missing / timeout)");
            return null;
        }
        const obj = this._extractJSON(raw);
        if (!obj) {
            console.warn("[DemoGenerator] could not extract JSON from response:", raw.slice(0, 200));
            return null;
        }
        if (!this._validate(obj)) {
            console.warn("[DemoGenerator] response failed schema validation:", obj);
            return null;
        }
        return obj;
    }

    // Models often wrap JSON in ```json ... ``` or include leading/
    // trailing prose. Find the first { and the last }, parse the slice.
    _extractJSON(text) {
        const first = text.indexOf("{");
        const last  = text.lastIndexOf("}");
        if (first < 0 || last <= first) return null;
        try {
            return JSON.parse(text.slice(first, last + 1));
        } catch (e) {
            return null;
        }
    }

    // Loose validation — we accept anything with at least the camera
    // fields a demo applier would consume. Missing fields are filled
    // by the applier with sensible defaults.
    _validate(spec) {
        if (!spec || typeof spec !== "object") return false;
        if (typeof spec.name !== "string" || !spec.name.trim()) return false;
        if (Array.isArray(spec.sequence)) {
            if (spec.sequence.length === 0) return false;
            for (const s of spec.sequence) {
                if (!s || !s.camera) return false;
                if (typeof s.camera.x !== "number") return false;
                if (typeof s.camera.y !== "number") return false;
                if (typeof s.camera.z !== "number") return false;
            }
            return true;
        }
        if (Array.isArray(spec.structures)) {
            if (spec.structures.length === 0) return false;
            for (const s of spec.structures) {
                if (!s || typeof s.kind !== "string") return false;
            }
            // Camera optional with structures (we'll keep current pose
            // if missing). Per-primitive coord validation is the
            // expander's responsibility — it clamps anything out of
            // range silently.
            return true;
        }
        if (spec.camera) {
            const c = spec.camera;
            if (typeof c.x !== "number") return false;
            if (typeof c.y !== "number") return false;
            if (typeof c.z !== "number") return false;
            return true;
        }
        return false;
    }
}
