// =============================================================================
// FILE: /world/gameAudio.js
// ROUND: 410
// =============================================================================
//
// Semantic audio routing. One place that maps GAME events (what
// happened in the world) to AUDIO voices (what the player hears),
// decoupling game logic from the audio engine's voice names.
//
// Before this, audio cues were scattered: kaijuAttackFx played a voice
// per attack (v402), megastructureFx and civDestructionFx each played
// their own inline cue (v408/v409). That works but spreads the
// "what does X sound like" decision across modules. This module
// centralizes the civ + kaiju LIFECYCLE cues so the mapping lives in
// one table.
//
// Division of responsibility:
//   • gameAudio (here)     — non-positional lifecycle cues: birth,
//     expand, collapse, death, megastructure complete, tech unlocks,
//     kaiju spawn / death / promotion. These are "world headlines".
//   • kaijuAttackFx (v402) — keeps its own SPATIAL per-attack sound,
//     because an attack's sound should come from the attack's location
//     (pan + distance), which is a different concern from a headline.
//
// The v408/v409 FX modules have had their inline audio removed; they
// now do visuals only, and gameAudio owns their sound. This keeps the
// "destruction looks like X" and "destruction sounds like Y" decisions
// in their natural homes.
//
// EVENT → VOICE TABLE
// Voices are real procedural generators from engine/audio.js. Picked
// to match each event's emotional register:
//   birth                       fps_level_start    bright, hopeful
//   expand                       ogre_wave_start    forward momentum
//   collapse                      ogre_hq_damaged    distress
//   death                          ogre_lose          mournful defeat
//   summon_kaiju                    ogre_breach        ominous
//   megaproject_start                ogre_buy           commit / construction
//   megaproject_complete              fps_level_clear    triumphant
//   tech_walls_complete                ogre_buy           upgrade chime
//   tech_watchtowers_complete           ogre_buy           upgrade chime
//   kaiju_spawn                          ogre_phase_transition  big arrival
//   kaiju_death                           ogre_internal_explosion
//   kaiju_queen_rises / king_rises         ogre_phase_transition  escalation

const EVENT_VOICE = {
    birth:                     { voice: "fps_level_start", vol: 0.45 },
    expand:                    { voice: "ogre_wave_start", vol: 0.30 },
    collapse:                  { voice: "ogre_hq_damaged", vol: 0.40 },
    death:                     { voice: "ogre_lose",       vol: 0.55 },
    summon_kaiju:              { voice: "ogre_breach",     vol: 0.50 },
    megaproject_start:         { voice: "ogre_buy",        vol: 0.35 },
    megaproject_complete:      { voice: "fps_level_clear", vol: 0.60 },
    tech_walls_complete:       { voice: "ogre_buy",        vol: 0.35 },
    tech_watchtowers_complete: { voice: "ogre_buy",        vol: 0.35 },
    kaiju_spawn:               { voice: "ogre_phase_transition", vol: 0.50 },
    kaiju_death:               { voice: "ogre_internal_explosion", vol: 0.55 },
    kaiju_queen_rises:         { voice: "ogre_phase_transition", vol: 0.55 },
    kaiju_king_rises:          { voice: "ogre_phase_transition", vol: 0.60 },
};

// Per-event-type minimum spacing (ms) so a burst of the same event
// (e.g. several civs dying at once) doesn't stack into a wall of sound.
const THROTTLE_MS = 350;

function _audio() {
    if (typeof window === "undefined") return null;
    return window.audio?.bus ?? window.audio ?? null;
}

function _camera() {
    if (typeof window === "undefined") return null;
    return window.camera ?? null;
}

/**
 * Install the semantic audio router on the event bus. Returns a
 * best-effort uninstall.
 *
 *   installGameAudio({ events: civEvents });
 */
export function installGameAudio({ events }) {
    if (!events?.subscribe) {
        console.warn("[gameAudio] no events bus — semantic audio disabled");
        return () => {};
    }
    const lastFired = new Map();      // event type → last performance.now()

    const subscriber = (event) => {
        if (subscriber._inert) return;
        // v997 — no lifecycle cues in an exclusive-isolation stage (blank
        // sandbox / rigged showcase): the sim is paused there, so the bell-like
        // round-start / buy chimes must not leak into the empty world on a click.
        if (typeof window !== "undefined" && window._demoIsolation === "exclusive") return;
        const type = event?.type;
        if (!type) return;
        const mapping = EVENT_VOICE[type];
        if (!mapping) return;            // event we don't sonify

        // Throttle per-type
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        const last = lastFired.get(type) ?? -Infinity;
        if (now - last < THROTTLE_MS) return;
        lastFired.set(type, now);

        try {
            _fire(event, mapping);
        } catch (e) {
            console.warn("[gameAudio] play failed:", e);
        }
    };

    events.subscribe(subscriber);
    console.log("[gameAudio] semantic audio router installed — " +
                Object.keys(EVENT_VOICE).length + " event types mapped");
    return () => { subscriber._inert = true; };
}

/**
 * Play the voice for one event. Uses spatial audio when the event
 * carries a position and a camera is available (so headlines from far
 * away are quieter / panned); falls back to flat procedural otherwise.
 * Exported for direct testing.
 */
export function _fire(event, mapping) {
    const audio = _audio();
    if (!audio) return false;
    const { voice, vol } = mapping;

    const hasPos = typeof event.x === "number"
                && typeof event.y === "number"
                && typeof event.z === "number";
    const cam = _camera();

    if (hasPos && cam && typeof audio.playSpatial === "function") {
        audio.playSpatial(voice, event.x, event.y, event.z, cam, { vol });
        return true;
    }
    if (typeof audio.playProcedural === "function") {
        audio.playProcedural(voice, vol);
        return true;
    }
    if (typeof audio.play === "function") {
        audio.play(voice);
        return true;
    }
    return false;
}

/** The event→voice table, exported so tests + tools can inspect it. */
export function getVoiceTable() {
    return { ...EVENT_VOICE };
}
