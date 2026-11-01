// WebGLEngine/render/brainUi.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE CLICKS OF THE BRAIN PANEL, FOR A PAGE THAT HAS A CANVAS AND NOTHING ELSE TO WRITE: which neuron is selected, which view is showing (bars or layers), and the hit areas of the last drawing. A page makes one with its canvas and (optionally)
// its view <select>, asks it for `neuron` and `view` when it builds and draws the panel, hands it `drawPanel`'s `rects` after each drawing, and tells it WHO the panel is about (`forWho`) so a neuron selected on one aircraft is let go when another is
// picked. The sub aquarium has its own handler (it also steers); this is the flight pages' (select and read, no steer: their sims have no per-neuron hook).
// Pure but for the two listeners it adds: a gate drives it with a fake canvas and select.
"use strict";
import { pickNeuron } from "./brainLens.mjs";

/**
 * Returns { get neuron() (the selected { layer, i } or null), get view() ("bars" | "layers"), setRects(rects), forWho(key), click(x, y) (canvas coordinates; returns the selection now held) }. `onChange()` is called after every
 * change a page should redraw for (a click, a change of view). A second click on the selected neuron lets go of it; a click on nothing clears the selection.
 */
export function createBrainUi({ canvas, modeEl = null, onChange = () => {} } = {}) {
    let neuron = null, rects = [], who = null;
    const ui = {
        get neuron() { return neuron; },
        get view() { return modeEl && modeEl.value === "layers" ? "layers" : "bars"; },
        setRects(r) { rects = Array.isArray(r) ? r : []; },
        forWho(key) { if (key !== who) { who = key; neuron = null; } },
        click(x, y) {
            const hit = pickNeuron(rects, x, y);
            neuron = hit && neuron && neuron.layer === hit.layer && neuron.i === hit.i ? null : hit;
            onChange(); return neuron;
        },
    };
    if (canvas && canvas.addEventListener) canvas.addEventListener("click", (e) => { const b = canvas.getBoundingClientRect(); ui.click((e.clientX - b.left) * canvas.width / b.width, (e.clientY - b.top) * canvas.height / b.height); });
    if (modeEl && modeEl.addEventListener) modeEl.addEventListener("change", () => onChange());
    if (canvas && canvas.style) canvas.style.cursor = "pointer";
    return ui;
}
