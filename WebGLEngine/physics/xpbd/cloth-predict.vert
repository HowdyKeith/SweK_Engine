#version 300 es
// physics/xpbd/cloth-predict.vert -- transform-feedback PREDICT pass. RIG-ONLY. Mirrors predictPass in clothLoop.js.
// Per vertex: save prev, integrate gravity into velocity, project the predicted position. Reads a_pos/a_vel from the
// source buffers, writes v_prev/v_vel/v_pred via transform feedback into separate destination buffers -- no readback.
precision highp float;
in vec3 a_pos;
in vec3 a_vel;
in float a_invMass;
uniform float u_dt;
uniform vec3  u_gravity;
out vec3 v_prev;
out vec3 v_vel;
out vec3 v_pred;
void main() {
    v_prev = a_pos;
    if (a_invMass > 0.0) {
        v_vel  = a_vel + u_gravity * u_dt;
        v_pred = a_pos + v_vel * u_dt;
    } else {
        v_vel  = a_vel;
        v_pred = a_pos;
    }
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
