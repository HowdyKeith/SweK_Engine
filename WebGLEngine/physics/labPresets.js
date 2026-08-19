// physics/labPresets.js
//
// Curated starting points for the Physics Lab -- one working configuration per regime, so a user opens the Lab to a
// menu of foundations to build on rather than a blank balloon. Each preset names a scene, the slider values, a camera,
// and whether the skin is on. The Lab renders them as a dropdown and applies them through the same restore path the
// URL save/load uses; catalog-style, catalogLab... no -- physicsLab-selfcheck.mjs runs each preset and proves it names
// a real scene and produces a finite, working state, so a preset cannot rot into a broken start.
//
// Shared by physics-lab.html (the menu) and physicsLab-selfcheck.mjs (the check). Pure data.

export const PRESETS = [
    { name: "Blobarium \u2014 body heat (aquarium)", scene: "aquarium", params: { tempK: 310 }, yaw: 42, pitch: 26, skin: 1 },
    { name: "Diffusion \u2014 boiling", scene: "diffusion", params: { tempK: 373 }, yaw: 35, pitch: 20, skin: 1 },
    { name: "Diffusion \u2014 near freezing", scene: "diffusion", params: { tempK: 255 }, yaw: 35, pitch: 18, skin: 0 },
    { name: "Muscle \u2014 full flex", scene: "muscle", params: { activation: 1 }, yaw: 55, pitch: 12, skin: 0 },
    { name: "Flag \u2014 gale", scene: "flag", params: { wind: 8 }, yaw: 28, pitch: 16, skin: 0 },
    { name: "Fabric \u2014 soft weft", scene: "stretch", params: { weft: 0.0028 }, yaw: 40, pitch: 30, skin: 0 },
    { name: "Sand \u2014 steep pile", scene: "pile", params: { mu: 0.85 }, yaw: 25, pitch: 22, skin: 0 },
    { name: "Balloon \u2014 over-inflated", scene: "balloon", params: { inflation: 2.3 }, yaw: 35, pitch: 18, skin: 0 },
    { name: "Eddy \u2014 fast swirl", scene: "swirl", params: { strength: 2.6 }, yaw: 35, pitch: 24, skin: 0 },
    { name: "Centrifuge \u2014 separating a mixture", scene: "centrifuge", params: { omega: 0.8 }, yaw: 20, pitch: 55, skin: 0 },
    { name: "Gyroscope \u2014 steady precession", scene: "gyroscope", params: { omega: 40 }, yaw: 35, pitch: 22, skin: 0 },
    { name: "Pendulum wave \u2014 the re-sync", scene: "pendulum-wave", params: { k: 20 }, yaw: 18, pitch: 30, skin: 0 },
    { name: "Orbit \u2014 an eccentric ellipse", scene: "orbit", params: { e: 0.5 }, yaw: 22, pitch: 62, skin: 0 },
    { name: "Vibrations \u2014 the third mode", scene: "vibrations", params: { mode: 3 }, yaw: 12, pitch: 24, skin: 0 },
    { name: "Figure-eight \u2014 three-body choreography", scene: "figure-eight", params: { trail: 260 }, yaw: 0, pitch: 90, skin: 0 },
    { name: "Black hole \u2014 a precessing orbit (Paczynski-Wiita)", scene: "black-hole", params: { r0: 10 }, yaw: 0, pitch: 90, skin: 0 },
    { name: "Solar system \u2014 real orbital elements", scene: "solar-system", params: { planets: 6 }, yaw: 0, pitch: 90, skin: 0 },
    { name: "Neutron star \u2014 an orbit grazing the surface", scene: "neutron-star", params: { r0: 9 }, yaw: 0, pitch: 90, skin: 0 },
    { name: "White dwarf \u2014 drag the mass to the Chandrasekhar limit", scene: "white-dwarf", params: { mass: 0.6 }, yaw: 0, pitch: 90, skin: 0 },
    { name: "Plasma \u2014 a particle trapped in a magnetic bottle", scene: "plasma", params: { vpar: 0.4 }, yaw: 20, pitch: 20, skin: 0 },
    { name: "Asteroid impact \u2014 aim it into the capture radius", scene: "impact", params: { b: 1.3 }, yaw: 0, pitch: 90, skin: 0 },
    { name: "Star catalog \u2014 real stars, flat sky to true 3D", scene: "star-catalog", params: { depth: 1 }, yaw: 30, pitch: 25, skin: 0 },
    { name: "Distributed render \u2014 split a frame across peers", scene: "distributed-render", params: { peers: 4 }, yaw: 0, pitch: 90, skin: 0 },
    { name: "Render cluster \u2014 catch a faulty peer", scene: "render-cluster", params: { faulty: 2 }, yaw: 0, pitch: 90, skin: 0 },
    { name: "Hologram \u2014 interference fringes", scene: "hologram", params: { sep: 20 }, yaw: 0, pitch: 35, skin: 0 },
];

// Contrast pairs: two sides of one scene differing in a single parameter, meant to be flipped between so the
// DIFFERENCE is the lesson. The Lab loads a side and an A/B flip re-runs the scene on the other side; the gate proves
// both sides run and, crucially, that they actually differ -- a contrast whose sides look the same teaches nothing.
export const CONTRASTS = [
    { name: "Friction \u2014 loose vs packed", scene: "pile", sides: [{ label: "loose (\u03bc 0.1)", params: { mu: 0.1 } }, { label: "packed (\u03bc 0.9)", params: { mu: 0.9 } }], yaw: 25, pitch: 20, skin: 0 },
    { name: "Diffusion \u2014 cold vs boiling", scene: "diffusion", sides: [{ label: "cold (255 K)", params: { tempK: 255 } }, { label: "boiling (373 K)", params: { tempK: 373 } }], yaw: 35, pitch: 20, skin: 0 },
    { name: "Centrifuge \u2014 gentle vs hard spin", scene: "centrifuge", sides: [{ label: "gentle (\u03c9 0.4)", params: { omega: 0.4 } }, { label: "hard (\u03c9 1.1)", params: { omega: 1.1 } }], yaw: 20, pitch: 55, skin: 0 },
    { name: "Muscle \u2014 relaxed vs fired", scene: "muscle", sides: [{ label: "relaxed", params: { activation: 0 } }, { label: "fired", params: { activation: 1 } }], yaw: 55, pitch: 12, skin: 0 },
    { name: "Balloon \u2014 slack vs taut", scene: "balloon", sides: [{ label: "slack", params: { inflation: 0.6 } }, { label: "taut", params: { inflation: 2.2 } }], yaw: 35, pitch: 18, skin: 0 },
    { name: "Black hole \u2014 stable orbit vs plunge (the ISCO)", scene: "black-hole", sides: [{ label: "outside ISCO (r 10)", params: { r0: 10 } }, { label: "inside ISCO (r 4.5)", params: { r0: 4.5 } }], yaw: 0, pitch: 90, skin: 0 },
];
