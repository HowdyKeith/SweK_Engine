// tools/mesh/mikktRef.cpp -- v4611 (task #41, backlog id "mikktspace-wasm")
//
// A reference oracle, not a dependency. Reads an INDEXED mesh on stdin (positions/normals/uvs shared per
// unique vertex, plus a triangle index list -- the same shape physics/mesh/mikktSpace.mjs's own JS port
// takes), runs vendor/mikktspace/mikktspace.c UNMODIFIED via its own SMikkTSpaceInterface callback contract,
// and writes its UNINDEXED per-triangle-corner tangent+sign output on stdout -- unindexed because that is
// what the real algorithm returns (mikktspace.h's own comment: "averaging/overwriting tangent spaces by
// using an already existing index list WILL produce INCORRECT results. DO NOT!"), and because that is
// exactly the shape the JS port under test also returns, so the two can be diffed corner-for-corner with no
// re-indexing step to get wrong on either side.
//
//   in :  <nverts> <ntris>\n  then nverts "px py pz nx ny nz u v" lines, then ntris "i j k" lines
//   out:  tspaces <ntris*3>\n  then that many "tx ty tz sign" lines, one per (face,vert) in input order
//
// Deliberately text in and text out, same reasoning as tools/mesh/xatlasRef.cpp: a JSON parser in C++ would
// be more code than the harness.
extern "C" {
#include "mikktspace.h"
}
#include <cstdio>
#include <cstdlib>
#include <vector>

struct MeshData {
    int nv, nt;
    std::vector<float> pos;    // nv*3
    std::vector<float> norm;   // nv*3
    std::vector<float> uv;     // nv*2
    std::vector<int> idx;      // nt*3
};

static int getNumFaces(const SMikkTSpaceContext *ctx) {
    return static_cast<MeshData *>(ctx->m_pUserData)->nt;
}
static int getNumVerticesOfFace(const SMikkTSpaceContext *, const int) { return 3; }
static void getPosition(const SMikkTSpaceContext *ctx, float out[], const int iFace, const int iVert) {
    MeshData *m = static_cast<MeshData *>(ctx->m_pUserData);
    int v = m->idx[iFace * 3 + iVert];
    out[0] = m->pos[v * 3]; out[1] = m->pos[v * 3 + 1]; out[2] = m->pos[v * 3 + 2];
}
static void getNormal(const SMikkTSpaceContext *ctx, float out[], const int iFace, const int iVert) {
    MeshData *m = static_cast<MeshData *>(ctx->m_pUserData);
    int v = m->idx[iFace * 3 + iVert];
    out[0] = m->norm[v * 3]; out[1] = m->norm[v * 3 + 1]; out[2] = m->norm[v * 3 + 2];
}
static void getTexCoord(const SMikkTSpaceContext *ctx, float out[], const int iFace, const int iVert) {
    MeshData *m = static_cast<MeshData *>(ctx->m_pUserData);
    int v = m->idx[iFace * 3 + iVert];
    out[0] = m->uv[v * 2]; out[1] = m->uv[v * 2 + 1];
}

static std::vector<float> g_outTangent;   // ntris*3*4, filled by setTSpaceBasic in (face,vert) order
static void setTSpaceBasic(const SMikkTSpaceContext *, const float fvTangent[], const float fSign,
                            const int iFace, const int iVert) {
    float *slot = &g_outTangent[(iFace * 3 + iVert) * 4];
    slot[0] = fvTangent[0]; slot[1] = fvTangent[1]; slot[2] = fvTangent[2]; slot[3] = fSign;
}

int main() {
    MeshData m;
    if (scanf("%d %d", &m.nv, &m.nt) != 2 || m.nv <= 0 || m.nt <= 0) { fprintf(stderr, "bad header\n"); return 2; }
    m.pos.resize(m.nv * 3); m.norm.resize(m.nv * 3); m.uv.resize(m.nv * 2);
    for (int i = 0; i < m.nv; i++) {
        if (scanf("%f %f %f %f %f %f %f %f", &m.pos[i * 3], &m.pos[i * 3 + 1], &m.pos[i * 3 + 2],
                   &m.norm[i * 3], &m.norm[i * 3 + 1], &m.norm[i * 3 + 2], &m.uv[i * 2], &m.uv[i * 2 + 1]) != 8) {
            fprintf(stderr, "bad vertex\n"); return 2;
        }
    }
    m.idx.resize(m.nt * 3);
    for (int i = 0; i < m.nt * 3; i++) if (scanf("%d", &m.idx[i]) != 1) { fprintf(stderr, "bad index\n"); return 2; }

    g_outTangent.assign(static_cast<size_t>(m.nt) * 3 * 4, 0.0f);

    SMikkTSpaceInterface iface;
    iface.m_getNumFaces = getNumFaces;
    iface.m_getNumVerticesOfFace = getNumVerticesOfFace;
    iface.m_getPosition = getPosition;
    iface.m_getNormal = getNormal;
    iface.m_getTexCoord = getTexCoord;
    iface.m_setTSpaceBasic = setTSpaceBasic;
    iface.m_setTSpace = nullptr;

    SMikkTSpaceContext ctx;
    ctx.m_pInterface = &iface;
    ctx.m_pUserData = &m;

    if (!genTangSpaceDefault(&ctx)) { fprintf(stderr, "genTangSpaceDefault failed\n"); return 3; }

    printf("tspaces %d\n", m.nt * 3);
    for (int i = 0; i < m.nt * 3; i++)
        printf("%.9g %.9g %.9g %.1f\n", g_outTangent[i * 4], g_outTangent[i * 4 + 1],
               g_outTangent[i * 4 + 2], g_outTangent[i * 4 + 3]);
    return 0;
}
