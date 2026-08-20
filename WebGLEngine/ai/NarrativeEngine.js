// FILE: ai/NarrativeEngine.js
// VERSION: v2 - SYNC TEMPLATES + ASYNC LLM REPHRASE
//
// Why two paths:
//   * UI cells need a caption *now* the moment a civ event arrives.
//     The hand-rolled templates from v1 do this synchronously in <1ms.
//   * The LLM gives much better text but takes 1–4s. If we waited, the
//     TV would feel laggy and Ollama outages would freeze captions.
//
// Solution: interpret() (sync) returns the templated story immediately
// for instant display. interpretAsync() (async) returns a Promise that
// resolves with an LLM-generated story when ready. Callers (TVScreenAgent)
// kick off the async call right after using the sync result, then swap
// the caption text in-place when the Promise resolves.
//
// LLM is opt-in: useLLM(client) wires an OllamaClient. Without it,
// interpretAsync() always returns null and callers stick with sync.
//
// Templates remain in v2 because:
//   1. They're the immediate caption (zero latency).
//   2. They're the fallback when Ollama is down.
//   3. They feed the prompt as a "starter line" for the LLM rephrase.

export class NarrativeEngine {
    constructor() {
        this.history = [];
        this.llm = null;
    }

    useLLM(client) {
        this.llm = client;
    }

    // ------------------------------------------------------------
    // SYNC — instant templated story
    // ------------------------------------------------------------
    interpret(events, screenId = 0) {
        if (!events || events.length === 0) return null;
        const e = events[events.length - 1];
        const intensity = e.intensity ?? 0;
        const name = e.civName || "An unnamed cluster";

        let text = "";
        if (e.type === "event") {
            // Generic non-civ events keep the old anonymous templates
            if (intensity > 0.8)      text = "A major structural surge reshapes the voxel ecosystem.";
            else if (intensity > 0.5) text = "Localized civilization growth stabilizes.";
            else                      text = "Minor fluctuations ripple through the system.";
        }
        // Civ-typed events: name-aware (and v2's empty birth/death
        // templates are filled in here for the first time).
        if (e.type === "birth") {
            // Round 34 — personality flavors the birth narrative
            const flavor = {
                peaceful:     "rises in quiet harmony",
                expansionist: "rises with hungry ambition",
                religious:    "rises around a sacred geometry",
                tech:         "rises with crackling industry",
                militaristic: "rises with steel and watchfires",
            }[e.civPersonality] ?? "begins to take shape";
            text = `${name} ${flavor}.`;
        }
        if (e.type === "expand")   text = `${name} expands its influence.`;
        if (e.type === "collapse") text = `${name} falters under decay pressure.`;
        if (e.type === "death")    text = `${name} has fallen.`;
        if (e.type === "summon_kaiju")
            text = `${name} desperately summons a kaiju to its aid.`;

        // Kaiju events — name from kaijuName, or "A creature" fallback
        const kName = e.kaijuName ?? "A creature";
        if (e.type === "kaiju_spawn")
            text = `${kName} emerges from the ${e.kaijuOrigin ?? "void"}.`;
        if (e.type === "kaiju_engage")
            text = `${kName} sets upon the civilization.`;
        if (e.type === "kaiju_clash") {
            const o = e.otherKaijuName ?? "another beast";
            text = `${kName} and ${o} clash in titanic combat.`;
        }
        if (e.type === "kaiju_victory") {
            const v = e.victimKaijuName ?? "its rival";
            text = `${kName} stands victorious over ${v}.`;
        }
        if (e.type === "kaiju_death")
            text = `${kName} has been slain.`;

        // Round 20 — queen ascension. Origin word doubles as biome
        // descriptor: "queen of the inferno" reads better than "of hell".
        if (e.type === "kaiju_queen_rises") {
            const origin = e.kaijuOrigin ?? "void";
            text = `${kName} ascends as queen of the ${origin}.`;
        }
        // Round 36 — king ascension (queen → king). Mythic-tier title.
        if (e.type === "kaiju_king_rises") {
            text = `${kName} is crowned king of the kaiju.`;
        }
        // Round 36 — throw narrative
        if (e.type === "kaiju_throws") {
            text = `${kName} hurls a tree across the world.`;
        }

        // Round 12 — first-run creature materialization
        if (e.type === "model_placed") {
            const mName = e.modelName ?? "An entity";
            text = `${mName} materializes into being.`;
        }

        // Round 13 — civ vs civ war
        if (e.type === "civ_conflict") {
            const o = e.otherCivName ?? "a neighboring civilization";
            text = `${name} declares war upon ${o}.`;
        }
        if (e.type === "civ_victory") {
            const d = e.defeatedCivName ?? "their rival";
            text = `${name} has conquered ${d}.`;
        }

        // Round 25 — megastructure project lifecycle
        if (e.type === "megaproject_start") {
            const m = e.megaName ?? "a great monument";
            text = `${name} breaks ground on ${m}.`;
        }
        if (e.type === "megaproject_complete") {
            const m = e.megaName ?? "their monument";
            text = `${name} completes ${m}.`;
        }

        // Round 27 — tech progression
        if (e.type === "tech_advance") {
            const tName = e.techName ?? "advanced technology";
            text = `${name} unlocks ${tName}.`;
        }
        if (e.type === "tech_walls_complete") {
            text = `${name} raises defensive walls.`;
        }
        if (e.type === "tech_watchtowers_complete") {
            text = `${name} mans the watchtowers.`;
        }
        if (e.type === "civ_fires_counter") {
            const k = e.targetKaijuName ?? "a kaiju";
            text = `${name} retaliates against ${k}.`;
        }

        // Round 30 — kaiju ranged attacks
        if (e.type === "kaiju_ranged_attack") {
            const verb = e.verb ?? "attacks";
            const t = e.targetName ?? "the area";
            const kn = e.kaijuName ?? "A kaiju";
            text = `${kn} ${verb} ${t}.`;
        }

        // Round 32 — weather changes + thunder
        if (e.type === "weather_change") {
            const verb = {
                clear:  "The skies clear.",
                cloudy: "Clouds gather overhead.",
                rain:   "Rain begins to fall.",
                snow:   "Snow drifts down across the world.",
                storm:  "A storm rolls in.",
            }[e.next] ?? `Weather shifts to ${e.next}.`;
            text = verb;
        }
        if (e.type === "weather_thunder") {
            text = "Thunder cracks across the sky.";
        }

        // Round 35 — hellspawn portals
        if (e.type === "kaiju_portal_drop") {
            const kn = e.kaijuName ?? "A hell queen";
            text = `${kn} tears open a portal to her realm.`;
        }

        // Round 36 — kings, throws, duels
        if (e.type === "kaiju_king_rises") {
            const kn = e.kaijuName ?? "A queen";
            const kk = e.kaijuKind ?? "kaiju";
            text = `${kn} ascends as KING — the ${kk} kinds bow to her.`;
        }
        if (e.type === "kaiju_throws") {
            const kn = e.kaijuName ?? "A kaiju";
            text = `${kn} hurls a tree.`;
        }
        if (e.type === "kaiju_duel") {
            const a = e.kaijuAName ?? "a kaiju";
            const b = e.kaijuBName ?? "a kaiju";
            text = `${a} and ${b} clash in single combat.`;
        }

        // Round 37 — tech alien metal trees
        if (e.type === "kaiju_metal_tree_drop") {
            const kn = e.kaijuName ?? "A tech alien";
            text = `${kn} plants a metal tree — its glyph hums.`;
        }

        // Round 40 — mech self-destruct
        if (e.type === "mech_eject_armed") {
            text = "Pilot eject sequence engaged — mech going critical.";
        }
        if (e.type === "mech_detonate") {
            const k = e.killed ?? 0;
            const s = e.survived ?? 0;
            if (s > 0) {
                text = `MECH DETONATES — ${k} kaiju vaporized; ${s} king${s>1?"s":""} ate the fire and survived.`;
            } else if (k > 0) {
                text = `MECH DETONATES — ${k} kaiju vaporized in the blast.`;
            } else {
                text = "MECH DETONATES — empty crater, no kaiju nearby.";
            }
        }

        const output = {
            screenId,
            text,
            intensity,
            timestamp: Date.now(),
            source: "template",
        };

        this.history.push(output);
        if (this.history.length > 200) this.history.shift();
        return output;
    }

    // ------------------------------------------------------------
    // ASYNC — LLM rephrased story (or null if no LLM / failure)
    // ------------------------------------------------------------
    async interpretAsync(events, screenId = 0) {
        if (!this.llm) return null;
        if (!events || events.length === 0) return null;
        const e = events[events.length - 1];
        const intensity = e.intensity ?? 0;

        const prompt = this._buildPrompt(e, screenId);
        const llmText = await this.llm.generate(prompt, {
            temperature: 0.85,
            num_predict: 30,
            stop: ["\n", "."],
        });
        if (!llmText) return null;

        // Trim and ensure trailing period
        let text = llmText.trim().replace(/^[\s"'`*-]+|[\s"'`*-]+$/g, "");
        if (text && !text.match(/[.!?]$/)) text += ".";
        if (!text) return null;

        const output = {
            screenId,
            text,
            intensity,
            timestamp: Date.now(),
            source: "llm",
        };

        this.history.push(output);
        if (this.history.length > 200) this.history.shift();
        return output;
    }

    _buildPrompt(e, screenId) {
        // Compact one-shot. Documentary-narrator voice, terse, single
        // sentence, no preamble. Civ name + style are passed in so
        // captions read as "Velthar's outposts expand" rather than
        // "a civilization expands".
        const where = (e.x != null && e.z != null)
            ? ` at coordinates (${Math.round(e.x)}, ${Math.round(e.z)})`
            : "";
        const intensity = (e.intensity ?? 0).toFixed(2);

        // Subject phrase — prefers the civ name + style when present,
        // falls back to anonymous phrasing for non-civ events.
        let subject;
        if (e.civName) {
            const style = e.civStyle && e.civStyle !== "unknown"
                ? ` (${e.civStyle} style)`
                : "";
            subject = `the civilization "${e.civName}"${style}`;
        } else {
            subject = "an anonymous cluster";
        }

        return [
            "You narrate a documentary about voxel-based civilizations rising and falling in a simulated world.",
            "Each event is a moment in their existence. Reply with EXACTLY ONE evocative sentence under 90 characters. No preamble, no quotes, no explanation.",
            "Use the civilization's name when given — it is the subject of the sentence.",
            "",
            `Event: ${e.type} (intensity ${intensity}) involving ${subject}${where}.`,
            "",
            "Sentence:"
        ].join("\n");
    }
}
