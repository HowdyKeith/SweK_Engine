#version 300 es
// physics/xpbd/cloth-finalize.vert -- transform-feedback FINALIZE pass. RIG-ONLY. Mirrors finalizePass in
// clothLoop.js. Per vertex: derive velocity from the solved prediction minus the pre-solve position, then commit the
// new position. Reads a_pred/a_prev, writes v_pos/v_vel via transform feedback. The v_pos buffer becomes next
// frame's a_pos -- ping-pong, no readback. Between predict and finalize the SOLVE runs as graph-colored passes
// (physics/xpbd/xpbd-distance.wgsl for structural/shear/bending, physics/xpbd/cloth-collision.wgsl for contact).
precision highp float;
in vec3 a_pred;
in vec3 a_prev;
in vec3 a_vel;
in float a_invMass;
uniform float u_dt;
out vec3 v_pos;
out vec3 v_vel;
void main() {
    if (a_invMass > 0.0) { v_vel = (a_pred - a_prev) / u_dt; } else { v_vel = a_vel; }
    v_pos = a_pred;
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
