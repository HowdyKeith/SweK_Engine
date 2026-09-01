// Name: swekCrossfade
// Author: SweK
// License: MIT
//
// The identity case, and it is here on purpose. A crossfade satisfies the endpoint law exactly -- no edge,
// no softness, no ratio -- so it is the control that says a failing endpoint measurement on another
// transition is that transition's fault and not the harness's.

vec4 transition(vec2 uv) {
  return mix(getFromColor(uv), getToColor(uv), progress);
}
