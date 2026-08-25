// ui/faceMoves.js -- ENGINE EVENTS AS A FACE, WITHOUT A CAMERA.
//
// v3999 -- Keith: "we want to hide camera when it is shown on server.html. server.html is self driven avatars."
// then: "Would we be able to generate the animations that the other avatars show, but with the face expressions?"
//
// *** YES, AND NOTHING NEW HAD TO BE INVENTED TO CARRY IT, BECAUSE THE CONSUMER WAS ALREADY DUCK-TYPED. ***
// ui/faceExpression.js takes "anything with snapshot() -> { active, blendShapes }" and ui/faceRig.js the same.
// Neither has ever known it was talking to a camera. So this file is a SECOND PRODUCER for that one interface:
// it emits MediaPipe-shaped blendshapes generated from the SweK robot's own moves instead of from a webcam, and
// both consumers drive off it unchanged.
//
//   camera:  MediaPipeFaceTracker --\
//                                    >-- snapshot() --> faceExpression / faceRig --> a face
//   engine:  createMoveFaceSource --/
//
// AND THE MOVES ALREADY BROADCAST THEMSELVES. ui/swekRobot.js's play() and flashError() have dispatched
// `swek:move` on window since v1690, and ui/pipboyWireframe.js has been mirroring them onto a stick figure ever
// since -- head nods on "nod", both arms up on "cheer", a jitter on "error". This is that same subscription,
// read as a face rather than as a body, so server.html's avatars stay driven by what the machine is actually
// doing rather than by whoever is sitting in front of it.
//
// ================================================================================================================
// THE CLOCK IS AN ARGUMENT, AND THAT IS THE WHOLE REASON THIS IS TESTABLE
// ================================================================================================================
//
// A face built on Date.now() and Math.random() can only be checked by watching it. `now` is injected, so a gate
// can ask for the expression at t = 0, 400 and 3000 ms and get the SAME answer every run -- the blink phase, the
// jaw oscillation and the move decay are all pure functions of it. Nothing here reads a wall clock unless the
// caller declines to supply one.
"use strict";

/** The moves ui/swekRobot.js can play, plus the resting state. Kept in this order for the gate to read. */
export const MOVES = ["idle", "nod", "wave", "cheer", "spin", "dance", "error"];

/** How long each move reads on a face, matching swekRobot's own durations so the two surfaces stay in step. */
export const MOVE_MS = { nod: 2000, wave: 2000, spin: 2000, dance: 4200, cheer: 3200, error: 1200 };

// The MediaPipe coefficient names the two consumers between them read. ui/faceRig.js reads all fourteen;
// ui/faceExpression.js reads the first three. EMITTING THE UNION rather than either subset is what lets one
// source drive the SVG robot and the wireframe head without either of them knowing which producer it got.
//
// *** THE LAST THREE WERE MISSING UNTIL THE GATE WAS POINTED THE RIGHT WAY ROUND. *** The first draft of
// avatarServerViews-selfcheck section 4 asked "is every name faceMoves emits one faceRig reads?", which is the
// easy direction and is true of any subset -- it passed while eyeWideLeft, eyeWideRight and mouthFunnel were
// simply absent, so the wireframe head read 0 for three of its channels forever. The check now runs the other
// way: every name faceRig LOOKS UP must be one this file emits. A sabotage run is what found it; the check as
// written could not fail, and a control that cannot fail is decoration.
export const EMITTED = [
    "jawOpen", "mouthSmileLeft", "mouthSmileRight",
    "mouthFrownLeft", "mouthFrownRight",
    "browInnerUp", "browDownLeft", "browDownRight",
    "eyeBlinkLeft", "eyeBlinkRight", "mouthPucker",
    "eyeWideLeft", "eyeWideRight", "mouthFunnel",
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The expression for one move at one instant, as plain numbers. Pure: same (move, t, talking) -> same result.
 *
 * `phase` is seconds since the move started; `t` is seconds since the source began, and drives the blink and
 * the idle drift so a resting face is never completely still -- a face that does not blink reads as a
 * photograph, which is the one thing an avatar must not look like.
 */
export function expressionFor(move, phase, t, talking) {
    const ph = phase * 4;                                   // pipboyWireframe uses the same 4x, so they beat together
    // A BLINK IS A SPIKE, NOT A SINE. Eyes are shut for a tenth of a second every few seconds; a sine would
    // leave them permanently half-closed, which reads as drowsy rather than alive.
    const blinkCycle = 4.3, into = t % blinkCycle;
    const blink = into < 0.12 ? clamp01(1 - Math.abs(into - 0.06) / 0.06) : 0;
    // talking drives the jaw directly, and it beats faster than any move
    const talkJaw = talking ? clamp01(0.28 + 0.34 * Math.abs(Math.sin(t * 11))) : 0;

    // mouthFunnel is the "ooh" shape, so speech drives it the way speech drives the jaw
    let jaw = talkJaw, smile = 0, frown = 0, browUp = 0, browDn = 0, pucker = 0;
    let wide = 0, funnel = talking ? 0.18 + 0.14 * Math.abs(Math.sin(t * 11 + 1)) : 0;
    switch (move) {
        case "nod":                                          // agreeing: mouth works a little, brows lift
            jaw = Math.max(jaw, 0.18 + 0.14 * Math.abs(Math.sin(ph * 1.4))); browUp = 0.25; break;
        case "wave":                                         // greeting: a half smile and raised brows
            smile = 0.34; browUp = 0.52; jaw = Math.max(jaw, 0.12); wide = 0.20; break;
        case "cheer":                                        // *** the one that must cross faceExpression's 0.45
            smile = 0.86; browUp = 0.60; jaw = Math.max(jaw, 0.40); wide = 0.38; break;  // SMILE_ON threshold, or the robot never cheers
        case "spin":                                         // dizzy: a pucker and a funnel, eyes wide open
            smile = 0.30; pucker = 0.35; browUp = 0.30; wide = 0.55; funnel = Math.max(funnel, 0.45); break;
        case "dance":
            smile = 0.55 + 0.25 * Math.sin(ph); browUp = 0.4 + 0.2 * Math.sin(ph * 0.7);
            jaw = Math.max(jaw, 0.3 + 0.2 * Math.abs(Math.sin(ph * 2)));
            funnel = Math.max(funnel, 0.15 + 0.15 * Math.abs(Math.sin(ph * 2 + 0.8))); break;
        case "error":                                        // the alarm: shut, frowning, brows down, eyes WIDE.
            // wide eyes UNDER lowered brows is the alarm face; wide eyes under raised brows would be surprise,
            // and the blink is suppressed below so the whole thing reads as a stare rather than a flinch.
            jaw = 0; smile = 0; frown = 0.75; browDn = 0.8; wide = 0.45; funnel = 0; break;
        default:                                             // idle -- alive, not animated
            smile = 0.10 + 0.05 * Math.sin(t * 0.5); browUp = 0.06; break;
    }
    return {
        jawOpen: clamp01(jaw),
        mouthSmileLeft: clamp01(smile), mouthSmileRight: clamp01(smile),
        mouthFrownLeft: clamp01(frown), mouthFrownRight: clamp01(frown),
        browInnerUp: clamp01(browUp), browDownLeft: clamp01(browDn), browDownRight: clamp01(browDn),
        // an ERROR face does not blink -- it stares. Everything else does.
        eyeBlinkLeft: clamp01(move === "error" ? 0 : blink), eyeBlinkRight: clamp01(move === "error" ? 0 : blink),
        mouthPucker: clamp01(pucker),
        // a blink shuts the eyes, so eyeWide has to give way to it or the two channels fight
        eyeWideLeft: clamp01(wide * (1 - blink)), eyeWideRight: clamp01(wide * (1 - blink)),
        mouthFunnel: clamp01(funnel),
    };
}

/** Wrap plain numbers in the exact shape MediaPipe's FaceLandmarker returns, because that is what is consumed. */
export function toBlendShapes(expr) {
    return { categories: EMITTED.map((categoryName) => ({ categoryName, score: expr[categoryName] || 0 })) };
}

/**
 * A tracker-shaped source driven by moves rather than by a camera.
 *
 * @param opts.now      () => ms. Injected so a gate can pin the blink phase and the move decay.
 * @param opts.subscribe  (fn) => unsubscribe. Defaults to window's `swek:move`; a gate passes its own.
 * @returns { snapshot, setMove, setTalking, move, stop } -- snapshot() is the interface faceExpression/faceRig take
 */
export function createMoveFaceSource(opts = {}) {
    const now = opts.now || (() => Date.now());
    const t0 = now();
    let move = "idle", moveUntil = 0, talking = false, off = null;

    const setMove = (name, ms) => {
        if (!MOVES.includes(name) || name === "idle") { if (name === "idle") { move = "idle"; moveUntil = 0; } return; }
        move = name;
        moveUntil = now() + (ms || MOVE_MS[name] || 2000);
    };

    // The default subscription is the same event pipboyWireframe has listened to since v1690. A gate supplies
    // its own so it never has to touch a real window.
    if (opts.subscribe !== null) {
        const sub = opts.subscribe || ((fn) => {
            if (typeof window === "undefined") return () => {};
            const h = (e) => { try { fn((e && e.detail && e.detail.move) || "idle"); } catch {} };
            window.addEventListener("swek:move", h);
            return () => window.removeEventListener("swek:move", h);
        });
        try { off = sub((m) => setMove(m)); } catch { off = null; }
    }

    return {
        setMove,
        setTalking(on) { talking = !!on; },
        move() { return now() < moveUntil ? move : "idle"; },
        /** THE INTERFACE. Identical in shape to MediaPipeFaceTracker.snapshot(). */
        snapshot() {
            const ms = now();
            const cur = ms < moveUntil ? move : "idle";
            const phase = cur === "idle" ? 0 : (ms - (moveUntil - (MOVE_MS[cur] || 2000))) / 1000;
            return { active: true, blendShapes: toBlendShapes(expressionFor(cur, phase, (ms - t0) / 1000, talking)) };
        },
        stop() { if (typeof off === "function") { try { off(); } catch {} } off = null; },
    };
}
