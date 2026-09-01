// Name: swekWipe
// Author: SweK
// License: MIT
//
// A directional wipe with a soft edge. Written from the spec, not copied: the published wipeLeft is four
// lines and this is not those four lines. The point of it being here is that the tree has a conforming
// transition of its own to validate, so the gate is not testing the parser against nothing.

uniform vec2 direction; // = vec2(1.0, 0.0)
uniform float softness; // = 0.05

vec4 transition(vec2 uv) {
  // Project onto the wipe direction. `ratio` makes the edge stay straight on a non-square viewport instead
  // of shearing -- which is the whole reason the spec hands a transition its aspect ratio.
  vec2 p = vec2((uv.x - 0.5) * ratio, uv.y - 0.5);
  vec2 d = normalize(vec2(direction.x * ratio, direction.y) + vec2(1e-6));
  float extent = 0.5 * (abs(d.x) * ratio + abs(d.y)) * 2.0;
  float t = (dot(p, d) / max(extent, 1e-6)) + 0.5;
  // The front must have swept entirely past both ends at progress 0 and 1, or the endpoint law fails: at
  // progress 0 a soft edge still straddling t=0 would show some `to`. Hence the +-softness overshoot.
  float front = progress * (1.0 + 2.0 * softness) - softness;
  // *** THE EDGES ARE REVERSED, AND GETTING THIS BACKWARDS IS WHAT THE ENDPOINT HARNESS CAUGHT. *** The
  // factor must be 1 where the wipe has ALREADY passed, i.e. where t is BELOW the front -- so the wider
  // edge comes first. The first version of this line read smoothstep(front - softness, front + softness,
  // 1.0 - t), which is inverted twice and cancels to exactly the wrong answer: it returned all `to` at
  // progress 0 and all `from` at progress 1, an error of 1.0, the maximum possible, at every aspect ratio.
  // swekIris.glsl was written minutes earlier and uses this reversed form correctly, which is why it
  // passed. Two shaders, one mistake, and only a measurement told them apart.
  return mix(getFromColor(uv), getToColor(uv), smoothstep(front + softness, front - softness, t));
}
