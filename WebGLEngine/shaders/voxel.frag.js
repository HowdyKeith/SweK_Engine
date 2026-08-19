precision mediump float;

varying vec3 vNormal;
varying vec2 vUV;
varying float vMaterial;

void main() {

    // Stable debug shading (NO GRID LOGIC YET)
    vec3 baseColor = vec3(0.75);

    // Simple directional shading
    float light = dot(normalize(vNormal), normalize(vec3(0.4, 1.0, 0.2)));
    light = clamp(light * 0.5 + 0.5, 0.2, 1.0);

    gl_FragColor = vec4(baseColor * light, 1.0);
}