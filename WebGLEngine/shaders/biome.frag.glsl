// FILE: shaders/biome.frag.glsl

precision mediump float;

varying vec3 vWorldPos;

uniform float uTime;

// SIMPLE HASH (for subtle variation)
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// BIOME DETECTION (matches JS logic conceptually)
float biome(vec2 xz) {

    float t = hash(xz * 0.01);

    return t;
}

void main() {

    float b = biome(vWorldPos.xz);

    vec3 color;

    // --------------------------------------------------------
    // BIOME BLENDING
    // --------------------------------------------------------
    if (b < 0.33) {
        color = vec3(0.76, 0.70, 0.50); // desert
    }
    else if (b < 0.66) {
        color = vec3(0.20, 0.70, 0.25); // plains
    }
    else {
        color = vec3(0.10, 0.45, 0.15); // forest
    }

    // --------------------------------------------------------
    // HEIGHT DARKENING (fake ambient occlusion)
    // --------------------------------------------------------
    float heightShade = clamp(vWorldPos.y / 60.0, 0.2, 1.0);
    color *= heightShade;

    // --------------------------------------------------------
    // WATER TINT LAYER
    // --------------------------------------------------------
    if (vWorldPos.y < 10.0) {
        color = mix(color, vec3(0.0, 0.3, 0.6), 0.4);
    }

    // --------------------------------------------------------
    // SUBTLE SHIMMER
    // --------------------------------------------------------
    color += 0.02 * sin(uTime + vWorldPos.x * 0.1);

    gl_FragColor = vec4(color, 1.0);
}