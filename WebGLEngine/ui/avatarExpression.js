// WebGLEngine/ui/avatarExpression.js -- v4112
//
// THE JOIN: A NAMED EXPRESSION FROM A FACE, ONTO A GLB'S OWN MORPH TARGETS.
//
// v4110 gave the tree a named expression (ui/faceExpressionSet.js). v4112 gave face/avatarStage.js a
// setMorph(). This is the one owner that connects them -- written as a module on the first line, for the same
// reason ui/faceExpression.js, ui/faceRig.js and ui/knownState.js were: the last several times a judgement
// like this was written inline it had to be extracted a round later.
//
// *** THE HARD PART IS NOT THE WIRING, IT IS THAT MORPH NAMES ARE THE MODELLER'S, NOT OURS. ***
// RobotExpressive.glb ships "Angry", "Surprised", "Sad". A different GLB might ship "angry", "mouthAngry",
// "expression_angry", or nothing at all. So a fixed table like { angry: "Angry" } would work on exactly one
// model and silently do nothing on every other -- and "silently does nothing" is the failure this tree keeps
// paying for, because it is indistinguishable from a feature that is merely switched off.
//
// So the mapping is CANDIDATES, matched case-insensitively against WHAT THE MODEL ACTUALLY SHIPS, and
// resolveMorphMap() reports WHICH candidate matched (or that none did) rather than returning an empty map that
// a caller would push to the GPU as a no-op.
//
// *** WHAT IS DELIBERATELY NOT MAPPED, AND WHY THAT IS NOT A SHORTFALL. *** The classifier names eight
// expressions; RobotExpressive ships three morphs. Six of the eight therefore have nothing to drive on THAT
// model, and inventing a blend ("kiss is 0.5 Surprised + 0.3 Sad") would be an expression the modeller never
// authored, moving the face for reasons a viewer cannot read -- faceRig.js's own rule, verbatim, one file
// over: "noise wearing the costume of detail". An expression with no matching morph resolves to NULL and the
// avatar keeps its neutral face, which is the honest answer.
"use strict";

/**
 * Candidate morph-target names per expression, most-specific first. Matched case-insensitively, and also
 * against a de-punctuated form, so "mouth_angry" and "mouthAngry" both hit the same candidate.
 *
 * The lists deliberately include the ARKit/common-rig spellings as well as the plain English one, because
 * those are the two conventions a GLB in the wild actually uses.
 */
export const MORPH_CANDIDATES = {
    smile: ["smile", "happy", "mouthSmile", "expressionHappy", "joy"],
    shock: ["surprised", "surprise", "shock", "mouthOpen", "expressionSurprised", "jawOpen"],
    glare: ["angry", "glare", "squint", "eyeSquint", "mad"],
    angry: ["angry", "mad", "rage", "mouthAngry", "expressionAngry", "browDown"],
    sad: ["sad", "frown", "mouthSad", "mouthFrown", "expressionSad", "sorrow"],
    kiss: ["kiss", "pucker", "mouthPucker", "kissy"],
    puff: ["puff", "cheekPuff", "blow"],
    wink: ["wink", "blink", "eyeBlink", "eyeBlinkLeft"],
    neutral: [],
};

/** Strip case and non-alphanumerics so mouth_angry / mouthAngry / MouthAngry all compare equal. */
const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * *** PURE. *** Given an expression name and the morph names a model really ships, decide what to send to
 * setMorph().
 *
 * Returns { ok, map, morph, candidate } -- `ok:false` with a reason when nothing matched, rather than an
 * empty map, so a caller can tell "this model cannot show anger" apart from "anger was applied as zero".
 */
export function resolveMorphMap(expression, availableNames, strength = 1) {
    const avail = Array.isArray(availableNames) ? availableNames : [];
    if (!expression || expression === "neutral") return { ok: true, map: null, morph: null, candidate: null, why: "neutral -- the base mesh" };
    const cands = MORPH_CANDIDATES[expression];
    if (!cands) return { ok: false, map: null, morph: null, candidate: null, why: "no candidate list for '" + expression + "'" };
    if (!avail.length) return { ok: false, map: null, morph: null, candidate: null, why: "this model ships no morph targets" };

    const byNorm = new Map();
    for (const n of avail) { const k = norm(n); if (!byNorm.has(k)) byNorm.set(k, n); }
    for (const c of cands) {
        const hit = byNorm.get(norm(c));
        if (hit) {
            const w = Math.max(0, Math.min(1, +strength || 0));
            return { ok: true, map: { [hit]: w }, morph: hit, candidate: c, why: "" };
        }
    }
    return { ok: false, map: null, morph: null, candidate: null,
             why: "'" + expression + "' has no morph on this model (tried " + cands.join(", ") + "; it ships " + avail.join(", ") + ")" };
}

/**
 * Which of the classifier's expressions can this model actually show? Exported so a page can SAY so up front
 * rather than leaving a reader to discover that six of eight do nothing.
 */
export function supportedExpressions(availableNames) {
    const out = { supported: [], unsupported: [] };
    for (const name of Object.keys(MORPH_CANDIDATES)) {
        if (name === "neutral") continue;
        (resolveMorphMap(name, availableNames, 1).ok ? out.supported : out.unsupported).push(name);
    }
    return out;
}

/**
 * The live wiring: read a face, name the expression, drive the avatar's morphs.
 *
 * Polls at its OWN low rate rather than riding the tracker's callback -- ui/faceExpression.js's v3115 rule,
 * for the same reason: a morph apply is a full-mesh CPU blend plus a bufferSubData, and putting that on the
 * detect path would make the tracker slower the moment somebody smiles.
 *
 * @param stage    an avatarStage with setMorph()/morphInfo()
 * @param reader   an expression reader from faceExpressionSet.makeExpressionReader()
 * @param getSnap  () => the tracker's snapshot(), or null
 */
export function attachAvatarExpression(stage, reader, getSnap, opts = {}) {
    const hz = opts.hz || 10;
    const strength = opts.strength != null ? opts.strength : 0.9;
    const info = (stage && stage.morphInfo) ? stage.morphInfo() : { ok: false, names: [] };
    let timer = null, lastMorph = null;

    const tick = () => {
        let snap = null;
        try { snap = getSnap ? getSnap() : null; } catch { snap = null; }
        const out = reader.read(snap && snap.active ? snap.blendShapes : null);
        // A LOST FACE CLEARS THE MORPH rather than freezing the last one. Leaving an angry face on an avatar
        // whose camera has stopped is the stale-expression lie v3114 refused, with a whole face behind it.
        if (!out.usable) { if (lastMorph !== null) { try { stage.setMorph(null); } catch {} lastMorph = null; } return { name: null, applied: null }; }
        const r = resolveMorphMap(out.name, info.names, strength);
        const key = r.morph || null;
        if (key !== lastMorph) { try { stage.setMorph(r.map); } catch {} lastMorph = key; }
        if (typeof opts.onExpression === "function") { try { opts.onExpression(out.name, r); } catch {} }
        return { name: out.name, applied: key };
    };

    timer = setInterval(tick, Math.max(1, Math.round(1000 / hz)));
    tick();
    return {
        info,
        stop() {
            if (timer) clearInterval(timer);
            timer = null;
            try { stage.setMorph(null); } catch {}
            lastMorph = null;
        },
    };
}
