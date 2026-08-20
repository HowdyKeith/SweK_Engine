// FILE: shaders/waterScreen.frag.glsl

precision mediump float;

uniform sampler2D uScene;
uniform sampler2D uDepth;

uniform vec2 uResolution;
uniform float uTime;

varying vec2 vUV;

// pseudo noise
float n(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

void main() {

    vec2 uv = gl_FragCoord.xy / uResolution;

    float depth = texture2D(uDepth, uv).r;

    vec3 scene = texture2D(uScene, uv).rgb;

    // --------------------------------------------------------
    // WATER MASK (simple depth threshold approximation)
    // --------------------------------------------------------
    float waterMask = smoothstep(0.2, 0.5, depth);

    // --------------------------------------------------------
    // REFRACTION OFFSET
    // --------------------------------------------------------
    vec2 offset = vec2(
        n(uv + uTime * 0.01),
        n(uv - uTime * 0.01)
    ) * 0.01;

    vec3 refracted = texture2D(uScene, uv + offset).rgb;

    // --------------------------------------------------------
    // WATER COLOR
    // --------------------------------------------------------
    vec3 waterColor = vec3(0.0, 0.35, 0.6);

    vec3 finalColor = mix(scene, waterColor + refracted * 0.5, waterMask);

    gl_FragColor = vec4(finalColor, 1.0);
}