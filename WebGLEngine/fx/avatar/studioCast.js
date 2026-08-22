// fx/avatar/studioCast.js -- a mini studio: N blob speakers seated at fuse-safe distances, any one of whom
// can hold the floor. It generalizes narratorCast.js (Avataro + one pet co-host) to a panel/interview.
//
// Each speaker is a blobNarrator -- the same carved-mouth head the single narrator uses -- so whoever is
// ACTIVE gets their mouth carved by the shared voice envelope while the rest idle (a small breathing bob and
// the occasional react). Personas/skins/voices are per seat, so a panel reads as distinct characters.
//
// The one rule metaballs impose: two fields sum, so seats too close FUSE into a single creature (charming in
// the herd, wrong in a panel). makeStudio verifies every pair stays separate at the working iso via pet.js's
// honest mergeState (minimum field along the segment, not just the midpoint), and reports offenders instead of
// silently rendering a two-headed blob. Pure + verifiable: no canvas, no audio -- step() returns geometry.
"use strict";
import { makeBlobNarrator } from "./blobNarrator.js";
import { mergeState } from "./pet.js";

const DEFAULT_PERSONAS = ["avataro", "avatarina", "both"];

// A reasonable default panel line: seats spread horizontally, alternating personas, all outside the fuse gap.
// Narrator heads are bigger than the pet (breathing head + brow + chin balls), so they fuse until ~3.0 units
// apart -- measured, not guessed (see studioCast-selfcheck). 3.4 per gap leaves clear air between neighbours.
function defaultSeats(n) {
    const GAP = 3.4;
    const seats = [];
    const span = Math.max(GAP, (n - 1) * GAP);
    for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : -span / 2 + span * i / (n - 1);
        seats.push([x, 0, 0]);
    }
    return seats;
}

function makeStudio(opts = {}) {
    const specs = (opts.speakers && opts.speakers.length ? opts.speakers : [{ name: "Avataro" }, { name: "Avatarina" }]).slice();
    const n = specs.length;
    const seats = specs.map((s, i) => (s.seat || (opts.seats && opts.seats[i]) || null));
    const auto = defaultSeats(n);
    for (let i = 0; i < n; i++) if (!seats[i]) seats[i] = auto[i];

    const speakers = specs.map((s, i) => {
        const persona = s.persona || DEFAULT_PERSONAS[i % DEFAULT_PERSONAS.length];
        const narrator = makeBlobNarrator({ persona });
        return {
            name: s.name || ("Speaker " + (i + 1)),
            persona, skin: s.skin || null, voice: s.voice || persona,
            seat: seats[i].slice(), narrator,
            _idle: 0,
        };
    });

    let t = 0;
    // step(dt, { activeIndex, amp, lineIndex }): the active speaker's mouth follows amp; others idle.
    function step(dt, st = {}) {
        t += dt;
        const active = (st.activeIndex == null ? -1 : st.activeIndex);
        const out = [];
        for (let i = 0; i < speakers.length; i++) {
            const sp = speakers[i];
            const isActive = (i === active);
            const amp = isActive ? (st.amp || 0) : 0;
            // narrator geometry is centered at origin; translate to the seat and add a gentle idle bob for
            // the non-active speakers so the panel isn't a row of frozen heads.
            const balls = sp.narrator.step(dt, amp);
            const idleBob = isActive ? 0 : Math.sin(t * 1.7 + i * 1.3) * 0.03;
            const placed = balls.map((b) => ({ id: sp.name + ":" + b.id, neg: b.neg, r: b.r,
                p: [b.p[0] + sp.seat[0], b.p[1] + sp.seat[1] + idleBob, b.p[2] + sp.seat[2]] }));
            out.push({ index: i, name: sp.name, persona: sp.persona, skin: sp.skin, active: isActive,
                tint: sp.narrator.personaTint(), balls: placed, seat: sp.seat });
        }
        return { speakers: out, activeIndex: active };
    }

    // Every pair must render as two creatures at the working iso. Returns { ok, pairs:[{a,b,field,merged}] }.
    function verifySeating(iso = 1.0) {
        const frame = step(0, { activeIndex: -1, amp: 0 });
        const pairs = [];
        let ok = true;
        for (let a = 0; a < frame.speakers.length; a++) {
            for (let b = a + 1; b < frame.speakers.length; b++) {
                const ms = mergeState(frame.speakers[a].balls, frame.speakers[b].balls, iso);
                if (ms.merged) ok = false;
                pairs.push({ a, b, field: ms.field, gap: ms.gap, merged: ms.merged });
            }
        }
        return { ok, pairs };
    }

    return { step, verifySeating, speakers, seats: speakers.map((s) => s.seat.slice()), count: n };
}

export { makeStudio, defaultSeats, DEFAULT_PERSONAS };
if (typeof module !== "undefined" && module.exports) module.exports = { makeStudio, defaultSeats, DEFAULT_PERSONAS };
