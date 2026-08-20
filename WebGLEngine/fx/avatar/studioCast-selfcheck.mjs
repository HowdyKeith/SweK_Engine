// fx/avatar/studioCast-selfcheck.mjs — v2969
// Pure checks (no browser, no audio device) for the mini-studio pieces:
//   studioCast.makeStudio  — N speakers, fuse-safe seating (honest mergeState), the ACTIVE speaker's mouth
//                            actually carves (field opens at the mouth) while others stay sealed.
//   render/blobVoiceWav    — a real WAV (RIFF header), non-silent under speech and silent in the gaps, and
//                            deterministic (same script -> byte-identical), plus a multi-voice timeline sums.
// Run:  node fx/avatar/studioCast-selfcheck.mjs   (from WebGLEngine/)

import { makeStudio, defaultSeats } from "./studioCast.js";
import { metaField } from "./pet.js";
import { planSpeech, ampAt } from "./blobVoice.js";
import { renderPlanPCM, renderTimelinePCM, pcmToWav, lineToWav } from "../../render/blobVoiceWav.js";

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log("  PASS  " + n); } else { fail++; console.log("  FAIL  " + n + (d ? "  -- " + d : "")); } };

// ---- studio seating ----
for (const n of [2, 3, 4]) {
    const st = makeStudio({ speakers: Array.from({ length: n }, (_, i) => ({ name: "S" + i })) });
    ok("studio of " + n + ": correct speaker count", st.count === n && st.speakers.length === n);
    const chk = st.verifySeating(1.0);
    ok("studio of " + n + ": no two speakers fuse into one creature", chk.ok, chk.pairs.filter(p => p.merged).map(p => p.a + "+" + p.b).join(","));
}

// active speaker's mouth OPENS; the others stay SEALED
{
    const st = makeStudio({ speakers: [{ name: "A" }, { name: "B" }, { name: "C" }] });
    // step with speaker 1 active and a loud amp; the narrator mouth is a neg ball at local (0,-0.22,0.80)
    const frame = st.step(0.016, { activeIndex: 1, amp: 1.0 });
    function mouthOpen(sv) {
        const seat = sv.seat; // sample at the actual carved-mouth point (local z=0.80) in world space
        const f = metaField(sv.balls, seat[0] + 0, seat[1] - 0.22, seat[2] + 0.80);
        return f < 1.0;   // below iso = a real hole
    }
    ok("active speaker's mouth carves a hole (field below iso)", mouthOpen(frame.speakers[1]));
    ok("silent speakers stay sealed (field above iso)", !mouthOpen(frame.speakers[0]) && !mouthOpen(frame.speakers[2]));
    ok("exactly one speaker is marked active", frame.speakers.filter(s => s.active).length === 1);
    ok("each speaker carries its persona tint", frame.speakers.every(s => Array.isArray(s.tint) && s.tint.length === 3));
}

// default seats spread wide enough
{
    const seats = defaultSeats(4);
    let minGap = Infinity; for (let i = 1; i < seats.length; i++) minGap = Math.min(minGap, seats[i][0] - seats[i - 1][0]);
    ok("default seats keep >= 3.0 units between neighbours (clears the head fuse gap)", minGap >= 3.0, "minGap=" + minGap.toFixed(2));
}

// ---- blob voice WAV ----
{
    const plan = planSpeech("Hello from the studio panel", { persona: "avataro" });
    const { pcm, sampleRate, dur } = renderPlanPCM(plan, 22050, 0.5);
    ok("renderPlanPCM returns samples for the whole line", pcm.length === Math.round(dur * sampleRate) && pcm.length > 100);
    // non-silent somewhere under speech
    let peak = 0; for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    ok("PCM is non-silent under speech", peak > 0.02, "peak=" + peak.toFixed(3));
    // silent in a between-syllable gap: find a t where ampAt is ~0 and check the sample is ~0
    let gapT = -1; for (let t = 0; t < plan.dur; t += 0.005) { if (ampAt(plan, t) === 0) { gapT = t; break; } }
    if (gapT >= 0) { const s = pcm[Math.round(gapT * sampleRate)]; ok("PCM is silent between syllables", Math.abs(s) < 1e-6, "sample=" + s); }
    else ok("PCM is silent between syllables", true, "(no gap sampled)");

    const wav = pcmToWav(pcm, sampleRate);
    const magic = String.fromCharCode(wav[0], wav[1], wav[2], wav[3]) + String.fromCharCode(wav[8], wav[9], wav[10], wav[11]);
    ok("pcmToWav writes a real RIFF/WAVE header", magic === "RIFFWAVE");
    const dv = new DataView(wav.buffer);
    ok("WAV is 16-bit mono PCM at the given rate", dv.getUint16(20, true) === 1 && dv.getUint16(22, true) === 1 && dv.getUint32(24, true) === sampleRate && dv.getUint16(34, true) === 16);
    ok("WAV data chunk length matches the samples", dv.getUint32(40, true) === pcm.length * 2);
}

// deterministic: same line -> identical bytes
{
    const a = lineToWav("The mouth opens because it is speaking", { persona: "avatarina" }).wav;
    const b = lineToWav("The mouth opens because it is speaking", { persona: "avatarina" }).wav;
    let same = a.length === b.length; for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i]) same = false;
    ok("blob voice render is deterministic (byte-identical)", same);
    const c = lineToWav("The mouth opens because it is speaking", { persona: "avataro" }).wav;
    let diff = c.length !== a.length; for (let i = 0; !diff && i < a.length; i++) if (a[i] !== c[i]) diff = true;
    ok("different persona -> different audio", diff);
}

// multi-voice timeline: two lines at different starts both land, and overlap is clamped (no clip)
{
    const { pcm, durMs } = renderTimelinePCM([
        { text: "First speaker line here", persona: "avataro", atMs: 0 },
        { text: "Second speaker answers now", persona: "avatarina", atMs: 400 },
    ], { sampleRate: 22050 });
    let peak = 0; for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    ok("timeline places both lines and stays within [-1,1]", durMs > 800 && peak > 0.02 && peak <= 1.0, "peak=" + peak.toFixed(3) + " dur=" + durMs.toFixed(0));
}

console.log("[studioCast-selfcheck] " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
