// face/fidgetScenes.js — v992
// The ambient "fidget" scenes avatarStage can render WITHOUT an avatar mesh
// (boids flock, pendulum wave, gears, Newton's cradle, a wandering bird, a
// sloshing water tank). Shared by the universal-viewer fidget cycler and the
// phone's quiet-time screensaver so the list lives in one place.

export const FIDGET_SCENES = ["boids", "pendulum", "gears", "cradle", "bird", "wave", "asteroids"];

// Pick a random fidget scene, avoiding `exclude` so consecutive picks differ.
export function pickFidget(exclude) {
    const pool = FIDGET_SCENES.filter(s => s !== exclude);
    const src = pool.length ? pool : FIDGET_SCENES;
    return src[Math.floor(Math.random() * src.length)];
}
