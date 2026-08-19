// ui/exportScripts.js -- narration scripts for the YouTube export panel. The avatar speaks these in first person as
// the voice of the SweK Engine project: what a feature is, why it was built the way it was, and an honest word about
// the work behind it. Each script is an array of { text, gap } lines; the narrator (narrator.js) speaks them and its
// waveform "mouth" moves in time. Keep lines short -- they read as spoken captions and as YouTube subtitles.
"use strict";

const SCRIPTS = {
    overview: {
        title: "SweK Engine",
        subtitle: "a multi-runtime WebGL2 / WebGPU / Node portfolio engine",
        lines: [
            { text: "This is SweK Engine.", gap: 500 },
            { text: "It runs the same code across WebGL2, WebGPU, and Node -- one engine, many runtimes.", gap: 500 },
            { text: "It was built the hard way, on purpose: every renderer, every physics step, verified against a reference before it ships.", gap: 500 },
            { text: "What you are watching is real -- rendered live, not a recording pasted over a mock-up.", gap: 500 },
            { text: "Let me show you a few of the pieces.", gap: 400 }
        ]
    },
    physics: {
        title: "Physics: box3d + Jolt",
        subtitle: "one facade, three engines, real body-to-body collision",
        lines: [
            { text: "Physics runs through a single facade with three backends behind it.", gap: 500 },
            { text: "There is a lightweight CPU solver of our own -- cheap, and it holds sixty frames a second into the hundreds of thousands of bodies.", gap: 500 },
            { text: "And there are two real rigid-body engines: box3d, and Jolt.", gap: 450 },
            { text: "The difference matters. The CPU solver is fast but does floor-only contact.", gap: 450 },
            { text: "box3d and Jolt do true body-to-body collision -- which is what makes a pyramid of boxes actually pile up and settle.", gap: 500 },
            { text: "The same scene runs on any of the three, and you can switch between them live.", gap: 450 },
            { text: "Honestly, the box3d and Jolt integration is my favorite part of this engine.", gap: 500 }
        ]
    },
    ev: {
        title: "Escape Velocity & Endless Sky",
        subtitle: "an EV Nova-compatible space sim, running in the browser",
        lines: [
            { text: "This engine speaks Escape Velocity.", gap: 500 },
            { text: "It reads Endless Sky's data -- the EV Nova lineage -- and flies it: real ships, real missions, real combat.", gap: 500 },
            { text: "The pilots are driven by a learning brain that plans navigation fields and chooses tactics.", gap: 500 },
            { text: "And it is built for company -- peers can share a system, fight alongside each other, and stay in sync over the LAN.", gap: 500 },
            { text: "Escape Velocity deserves to keep flying. This is one way to keep it in the air.", gap: 450 }
        ]
    },
    living: {
        title: "The Living Box",
        subtitle: "autonomous art -- a black hole, a nebula, and a ship that never dies",
        lines: [
            { text: "Not everything here is a game. Some of it is just meant to be watched.", gap: 500 },
            { text: "Matter falls into a black hole, is consumed at the horizon, and is reborn at the edge -- so it never empties.", gap: 500 },
            { text: "The little ship is flown by an evade brain. It has no goal but to survive, and it does -- it just flies, and evades, forever.", gap: 550 },
            { text: "It runs on its own. Leave it going, like a window into a small, living place.", gap: 450 }
        ]
    },
    thanks: {
        title: "Built with care",
        subtitle: "every feature verified before it shipped",
        lines: [
            { text: "Every piece you have seen was built and checked the same disciplined way.", gap: 500 },
            { text: "Nothing ships unless it passes its own tests -- the physics stays honest, the shaders match their references.", gap: 500 },
            { text: "It took a lot of rounds, and a lot of care, from both of us.", gap: 500 },
            { text: "Thanks for watching. There is a lot more where this came from.", gap: 400 }
        ]
    }
};


// Estimate a deterministic narration timeline: a spoken duration per line (~2.7 words/sec) so a headless render can
// advance captions + avatar without live speech, and the server-side TTS can be timed to match. Returns the script
// with durMs on every line and a totalMs.
function estimateNarrationPlan(script) {
    const wps = 2.7; let total = 0;
    const lines = script.lines.map(l => { const words = String(l.text).trim().split(/\s+/).length; const durMs = Math.max(900, Math.round((words / wps) * 1000)); total += durMs + (l.gap || 400); return { text: l.text, gap: l.gap || 400, durMs }; });
    return { title: script.title, subtitle: script.subtitle, lines, totalMs: total };
}

const ORDER = ["overview", "physics", "ev", "living", "thanks"];
function scriptById(id) { return SCRIPTS[id] || SCRIPTS.overview; }

// ---- THE BRAIN SPEAKS FOR ITSELF (v2442) ----
// Every other script in this file is something I wrote in advance: true when it was written, but written. This one is
// not written at all. The lines come from /ai/brain/caption -- Gemini Vision looking at the GPU brain's actual flow
// field when a key and a rendered frame exist, or a sentence built from the numbers the brain itself posted when they
// do not. Either way it is what the brain was really doing at the moment the video was recorded.
//
// The rule that matters: if the brain has nothing true to say, this section does not exist. It is never padded with a
// written line pretending to be a live one -- that would quietly turn the one honest section into the least honest.
const BRAIN_INTRO = "And this is the brain, describing itself.";

function buildBrainScript(captions) {
    const seen = new Set(), lines = [];
    for (const c of captions || []) {
        const text = String((c && c.text) || "").trim();
        if (!text || (c && c.source === "none")) continue;      // nothing true -> nothing said
        if (seen.has(text)) continue;                            // the brain repeating itself is not two lines
        seen.add(text);
        lines.push({ text, gap: 450, source: c.source || "state" });
    }
    if (!lines.length) return null;                              // no honest lines -> no section at all
    return { title: "The GPU Brain", subtitle: "it is describing itself, live", live: true,
        lines: [{ text: BRAIN_INTRO, gap: 400 }].concat(lines) };
}
// Watch the brain for a few seconds and keep what it actually said. Silent and section-less when the bridge is absent.
async function fetchBrainScript(opts = {}) {
    const f = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
    if (!f) return null;
    const n = opts.samples || 4, every = opts.everyMs == null ? 1200 : opts.everyMs, wait = opts._wait || ((ms) => new Promise(r => setTimeout(r, ms)));
    const got = [];
    for (let i = 0; i < n; i++) {
        try { const j = await f(opts.url || "/ai/brain/caption", { cache: "no-store" }).then(r => r.json()); if (j) got.push(j); }
        catch (e) { break; }                                     // bridge down -> keep whatever it already said
        if (i < n - 1) await wait(every);
    }
    return buildBrainScript(got);
}
export { SCRIPTS, ORDER, scriptById, estimateNarrationPlan, buildBrainScript, fetchBrainScript, BRAIN_INTRO };
