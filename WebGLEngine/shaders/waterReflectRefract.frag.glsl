// FILE: shaders/waterReflectRefract.frag.glsl

precision mediump float;

uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform sampler2D uNormal;

uniform vec2 uResolution;
uniform float uTime;

varying vec2 vUV;

// cheap wave distortion
vec2 distort(vec2 uv) {

    float t = uTime * 0.5;

    uv.x += sin(uv.y * 10.0 + t) * 0.003;
    uv.y += cos(uv.x * 10.0 + t) * 0.003;

    return uv;
}

void main() {

    vec2 uv = gl_FragCoord.xy / uResolution;

    float depth = texture2D(uDepth, uv).r;

    vec3 scene = texture2D(uScene, uv).rgb;

    vec2 warped = distort(uv);

    vec3 refracted = texture2D(uScene, warped).rgb;

    // fake reflection (flip Y)
    vec2 reflectUV = vec2(uv.x, 1.0 - uv.y);
    vec3 reflected = texture2D(uScene, reflectUV).rgb;

    float waterMask = smoothstep(0.2, 0.5, depth);

    vec3 water = mix(refracted, reflected, 0.5);

    water = mix(scene, water, waterMask);

    gl_FragColor = vec4(water, 1.0);
}