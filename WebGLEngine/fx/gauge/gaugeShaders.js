// fx/gauge/gaugeShaders.js -- the wormhole and black-hole gauges as GLSL, for the 3D avatar stage.
// The shader does NOT get its own copy of the numbers. Every constant is interpolated in from GAUGE_CONST, the same
// object the Canvas2D painters read, so the porthole on the stage and the gauge on the page are the same instrument
// by construction -- they cannot drift, because there is only one set of numbers. (That is the lesson lava taught:
// it ended up written three times because each renderer typed its own.)
//
// One disc, stood upright to face the viewer, shaded entirely from the radius: a porthole onto a piece of spacetime.
"use strict";
import { GAUGE_CONST as C } from "./spacetimeGauges.js";
const f = (x) => Number(x).toFixed(6);

const SPACETIME_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in float aU;
uniform mat4 uViewProj; uniform mat4 uModel;
out vec2 vXY;
void main(){ vXY = aPos.xz; gl_Position = uViewProj * uModel * vec4(aPos,1.0); }`;

// uMode: 0 = wormhole (throat OPENS with the value), 1 = black hole (horizon GROWS, squeezing the accretion band)
const SPACETIME_FRAG = `#version 300 es
precision highp float;
in vec2 vXY;
uniform float uTime; uniform float uValue; uniform int uMode; uniform vec3 uColor;
out vec4 frag;
const float THROAT_BASE = ${f(C.throatBase)};
const float THROAT_GAIN = ${f(C.throatGain)};
const float RING_POW    = ${f(C.ringPow)};
const float TWIST_BASE  = ${f(C.twistBase)};
const float TWIST_GAIN  = ${f(C.twistGain)};
const float HORIZON_BASE= ${f(C.horizonBase)};
const float HORIZON_GAIN= ${f(C.horizonGain)};
const float PHOTON_MUL  = ${f(C.photonMul)};
const float INNER_MUL   = ${f(C.innerMul)};
const float OUTER       = ${f(C.outer)};
const float KEPLER      = ${f(C.kepler)};

void main(){
  float r = length(vXY);
  if (r > 1.0) discard;                                  // stay inside the bezel
  float v = clamp(uValue, 0.0, 1.0);
  float a = atan(vXY.y, vXY.x);
  vec3 col = vec3(0.0); float alpha = 0.0;

  if (uMode == 0) {
    // WORMHOLE -- the throat opens with the value; rings recede into it, twisting and fading with depth.
    float throat = THROAT_BASE + v * THROAT_GAIN;
    if (r <= throat) {                                    // the way through
      float k = 1.0 - r / max(throat, 1e-4);
      col = mix(uColor, vec3(1.0), k * (0.25 + v * 0.55));
      alpha = 0.25 + v * 0.7 * k + 0.15;
    } else {
      float depth = pow(clamp((1.0 - r) / max(1.0 - throat, 1e-4), 0.0, 1.0), 1.0 / RING_POW);
      float twist = depth * (TWIST_BASE + v * TWIST_GAIN) + uTime * (0.5 + v * 1.5);
      float bands = 0.5 + 0.5 * sin((depth * 9.0 - twist) * 3.14159);
      float fade = (1.0 - depth * 0.82) * (0.35 + v * 0.5);
      float swirl = 0.5 + 0.5 * sin(a * 3.0 + twist * 2.0);
      col = uColor * (0.35 + 0.65 * swirl);
      alpha = bands * fade;
    }
  } else {
    // BLACK HOLE -- the horizon grows, so the accretion band between it and the bezel is squeezed thinner and faster.
    float horizon = HORIZON_BASE + v * HORIZON_GAIN;
    float photon  = horizon * PHOTON_MUL;
    float inner   = photon * INNER_MUL;
    if (r <= horizon) { frag = vec4(0.0, 0.0, 0.0, 1.0); return; }        // the horizon itself
    float ring = exp(-pow((r - photon) / 0.035, 2.0));                     // photon ring, always outside the horizon
    if (r >= inner && r <= OUTER) {
      float u = (r - inner) / max(OUTER - inner, 1e-4);
      float w = pow(inner / max(r, 1e-4), KEPLER);                         // Keplerian: inner orbits faster
      float spin = 0.5 + 0.5 * sin(a * 2.0 + uTime * w * 6.0);
      float fade = (0.25 + 0.6 * (1.0 - u)) * (0.35 + v * 0.6);
      col = uColor * (0.55 + 0.75 * spin) * (1.0 - u * 0.35);
      alpha = fade * (0.55 + 0.45 * spin);
    }
    col += vec3(1.0, 0.88, 0.75) * ring * (0.55 + v * 0.4);
    alpha = max(alpha, ring * (0.6 + v * 0.4));
  }
  if (alpha <= 0.004) discard;
  frag = vec4(col, clamp(alpha, 0.0, 1.0));
}`;

const GAUGE_STYLES = ["wormhole", "blackhole"];
function isSpacetimeStyle(s) { return GAUGE_STYLES.indexOf(s) >= 0; }
function modeFor(style) { return style === "blackhole" ? 1 : 0; }
export { SPACETIME_VERT, SPACETIME_FRAG, GAUGE_STYLES, isSpacetimeStyle, modeFor };
