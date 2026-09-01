// Name: swekIris
// Author: SweK
// License: MIT
//
// A circular iris opening from a point. Ratio-corrected, so the iris is a circle on a 16:9 viewport rather
// than an ellipse -- the defect the spec's `ratio` exists to prevent and the one a square preview hides.

uniform vec2 centre;    // = vec2(0.5, 0.5)
uniform float softness; // = 0.03

vec4 transition(vec2 uv) {
  vec2 p = vec2((uv.x - centre.x) * ratio, uv.y - centre.y);
  // The furthest corner from the centre, in the same ratio-corrected space. The iris must reach it at
  // progress 1 or the last frame keeps a ring of `from`.
  vec2 far = vec2(max(centre.x, 1.0 - centre.x) * ratio, max(centre.y, 1.0 - centre.y));
  float maxR = length(far);
  float r = progress * (maxR + softness * 2.0) - softness;
  return mix(getFromColor(uv), getToColor(uv), smoothstep(r + softness, r - softness, length(p)));
}
