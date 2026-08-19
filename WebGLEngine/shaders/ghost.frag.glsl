// FILE: shaders/ghost.frag.glsl

precision mediump float;

void main() {

    // soft translucent green/yellow preview
    gl_FragColor = vec4(0.2, 1.0, 0.4, 0.35);
}