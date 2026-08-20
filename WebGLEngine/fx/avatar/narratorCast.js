// fx/avatar/narratorCast.js -- the export video's cast. Avataro narrates; a pet co-hosts beside it, nodding along and
// perking up when a new line starts (it has its own driver, so between lines it fidgets on its own); and the persona
// shifts as the script moves through its sections, so a long video isn't one flat face. The co-host is placed far
// enough out that the two stay SEPARATE creatures -- close in and their metaball fields would simply fuse into one
// blob, which is charming in the herd and wrong in a two-shot. That distance is verified, not guessed.
"use strict";
import { makeBlobNarrator } from "./blobNarrator.js";
import { makePet, mergeState } from "./pet.js";
import { makeAvatarDriver } from "./avatarBrain.js";

const PERSONAS = ["both", "avataro", "avatarina"];

function makeCast(opts = {}) {
    const narrator = makeBlobNarrator({ persona: PERSONAS[0] });
    const seat = opts.seat || [2.6, -0.35, 0];     // where the co-host sits: outside the fuse distance
    const cohost = makePet({ rng: opts.rng, _now: opts._now, p: seat.slice(), orbitR: 0.0001, roamTime: 1e9 });
    const driver = makeAvatarDriver(cohost, { rng: opts.rng, _now: opts._now, mood: 0.55 });
    const linesPerPersona = opts.linesPerPersona || 3;
    let lastLine = -1;
    // the persona shifts as the script moves along -- a long read shouldn't be one flat face
    function personaFor(lineIndex) { return PERSONAS[Math.floor(Math.max(0, lineIndex) / linesPerPersona) % PERSONAS.length]; }
    function step(dt, st = {}) {
        const li = st.lineIndex == null ? 0 : st.lineIndex;
        const persona = personaFor(li);
        if (persona !== narrator.persona) narrator.persona = persona;
        if (li !== lastLine) { lastLine = li; cohost.react(li % 2 ? "perk" : "wag"); }   // it reacts to each new line
        driver.step(dt);                                                                  // and fidgets on its own between them
        cohost.step(dt, seat);                                                            // seated: its "host" is its own chair
        return { narrator: narrator.step(dt, st.amp || 0), cohost: cohost.balls(), persona, tint: narrator.personaTint() };
    }
    // do the two read as separate creatures from where they're sitting?
    function separate(iso = 1.0) { const a = narrator.step(0, 0), b = cohost.balls(); return !mergeState(a, b, iso).merged; }
    return { step, personaFor, separate, narrator, cohost, driver, PERSONAS, seat };
}
export { makeCast, PERSONAS };
