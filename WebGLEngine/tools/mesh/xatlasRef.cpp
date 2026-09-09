// tools/mesh/xatlasRef.cpp -- v4560
//
// A reference oracle, not a dependency. Reads a mesh on stdin, runs vendor/xatlas, writes its result on
// stdout. Deliberately text in and text out: a JSON parser in C++ would be more code than the harness.
//
//   in :  <nverts> <ntris>\n  then nverts "x y z" lines, then ntris "i j k" lines
//   out:  charts <n>\n atlas <w> <h>\n util <f>\n uv <nverts_out>\n  then "x y z u v origIndex" lines
//
// The output carries the OUTPUT vertex list, because xatlas splits vertices along seams and the caller needs
// the mapping back to the input to score anything.
#include "xatlas.h"
#include <cstdio>
#include <cstdlib>
#include <vector>

int main() {
    int nv = 0, nt = 0;
    if (scanf("%d %d", &nv, &nt) != 2 || nv <= 0 || nt <= 0) { fprintf(stderr, "bad header\n"); return 2; }
    std::vector<float> pos(nv * 3);
    for (int i = 0; i < nv * 3; i++) if (scanf("%f", &pos[i]) != 1) { fprintf(stderr, "bad vertex\n"); return 2; }
    std::vector<uint32_t> idx(nt * 3);
    for (int i = 0; i < nt * 3; i++) if (scanf("%u", &idx[i]) != 1) { fprintf(stderr, "bad index\n"); return 2; }

    xatlas::Atlas *atlas = xatlas::Create();
    xatlas::MeshDecl mesh;
    mesh.vertexCount = (uint32_t)nv;
    mesh.vertexPositionData = pos.data();
    mesh.vertexPositionStride = sizeof(float) * 3;
    mesh.indexCount = (uint32_t)(nt * 3);
    mesh.indexData = idx.data();
    mesh.indexFormat = xatlas::IndexFormat::UInt32;
    if (xatlas::AddMesh(atlas, mesh) != xatlas::AddMeshError::Success) { fprintf(stderr, "AddMesh failed\n"); return 3; }
    xatlas::Generate(atlas);

    const xatlas::Mesh &out = atlas->meshes[0];
    float util = atlas->utilization ? atlas->utilization[0] : 0.0f;
    printf("charts %u\natlas %u %u\nutil %.6f\nuv %u\n", out.chartCount, atlas->width, atlas->height, util, out.vertexCount);
    for (uint32_t i = 0; i < out.vertexCount; i++) {
        const xatlas::Vertex &v = out.vertexArray[i];
        const float *p = &pos[v.xref * 3];
        printf("%.7g %.7g %.7g %.7g %.7g %u\n", p[0], p[1], p[2],
               atlas->width ? v.uv[0] / (float)atlas->width : 0.0f,
               atlas->height ? v.uv[1] / (float)atlas->height : 0.0f, v.xref);
    }
    printf("tris %u\n", out.indexCount / 3);
    for (uint32_t i = 0; i < out.indexCount; i += 3)
        printf("%u %u %u\n", out.indexArray[i], out.indexArray[i + 1], out.indexArray[i + 2]);
    xatlas::Destroy(atlas);
    return 0;
}
