// WebGLEngine/ui/joystickCore.js
// VERSION: v1 -- v3263
//
// THE PHONE REMOTE'S ANALOG STICK, AS ARITHMETIC RATHER THAN AS DOM.
//
// Keith: "the phone remote control for the tv is a better interface, and the full render view in SweK Engine has
// the old remote with just buttons... the phone view could/should be the default tv option choice in both the
// pc/mac full render, same as the phone. The old button view should be left as a panel view choice, but it
// doesn't have the smooth virtual joystick pad that the phone version does."
//
// *** THE STICK LIVES INLINE IN phone.html AND CANNOT BE MOUNTED ANYWHERE ELSE. *** About sixty lines of
// pointer handling with the geometry braided through it: element rect, knob transform, pointer capture, a 10Hz
// emit loop, and -- buried in the middle -- the actual decision, which is four lines of vector arithmetic.
//
// SO THE ARITHMETIC MOVES AND THE DOM STAYS. This module has no document, no element, no listener: it takes a
// point and a box and returns where the knob goes and which way that counts as. THAT IS THE PART THE RENDER
// WINDOW NEEDS, and it is also the only part that can be driven in a gate -- pointer capture and a 10Hz timer
// are not things this suite can check, and pretending otherwise is how a "tested" widget ships broken.
//
// SAME SHAPE AS v3239's WIREFRAME HEAD: the geometry became a module and the ~450 lines of animation stayed on
// the page that owns them. THE SHAPE IS WHAT WOULD DIVERGE IF COPIED; the plumbing is not.

/** Below this fraction of the base radius the stick reads as centred and emits nothing. */
export const DEADZONE = 0.18;

/** Knob radius in px, matching phone.html's .joyknob. Named because the original had it as a bare 33. */
export const KNOB_R = 33;

/**
 * Where the knob goes, and which cardinal that counts as.
 *
 * @param {{x:number,y:number}} pt      pointer position, in the same space as `box`
 * @param {{left,top,width,height}} box the joystick base's rect
 * @param {{deadzone?:number, knobR?:number}} opts
 * @returns {{ dx, dy, dist, t, dir }}  dir is "DPAD_UP"|"DPAD_DOWN"|"DPAD_LEFT"|"DPAD_RIGHT"|null
 *
 * *** THE CLAMP HAPPENS BEFORE THE DIRECTION, AND THAT ORDER IS NOT COSMETIC. *** Reading the direction from an
 * unclamped vector would make a fast flick past the edge of the base report a cardinal the knob never visibly
 * reached -- the control and the picture of the control disagreeing, which is the defect this whole project
 * keeps finding in other clothes.
 *
 * `dir` IS null INSIDE THE DEADZONE, NOT "CENTRE". A caller that treats a missing direction as a direction will
 * emit something; a caller that gets null has to decide, which is the honest arrangement.
 */
export function joystickSample(pt, box, { deadzone = DEADZONE, knobR = KNOB_R } = {}) {
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    let dx = pt.x - cx, dy = pt.y - cy;
    const maxR = box.width / 2 - knobR;
    let dist = Math.hypot(dx, dy);
    if (dist > maxR && dist > 0) { dx = dx / dist * maxR; dy = dy / dist * maxR; dist = maxR; }

    const t = box.width ? dist / (box.width / 2) : 0;
    let dir = null;
    if (t >= deadzone) {
        // AXIS-DOMINANT, NOT OCTANT. The TV expects a cardinal keycode; inventing diagonals here would send a
        // key the device does not have and the failure would look like a dead stick rather than a bad mapping.
        dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "DPAD_RIGHT" : "DPAD_LEFT")
                                          : (dy > 0 ? "DPAD_DOWN"  : "DPAD_UP");
    }
    return { dx, dy, dist, t, dir };
}

/** The knob transform, so both surfaces render the same offset the same way. */
export function knobTransform(s) { return "translate(" + s.dx + "px," + s.dy + "px)"; }
