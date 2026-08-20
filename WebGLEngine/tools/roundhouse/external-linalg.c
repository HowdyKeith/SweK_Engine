// WebGLEngine/tools/roundhouse/external-linalg.c -- v3687
// ---------------------------------------------------------------------------------------------------------------
// THE OUTSIDE ANSWER KEY. Compile and run this ON A MAC; nothing in this tree can run it, which is the point.
//
//   cd WebGLEngine
//   node tools/roundhouse/externalLinalg.mjs --write-problems
//   clang -O2 tools/roundhouse/external-linalg.c -framework Accelerate -o /tmp/exlinalg
//   /tmp/exlinalg tools/roundhouse/external-linalg-problems.txt > tools/roundhouse/external-linalg-answers.json
//   node tools/roundhouse/externalLinalg.mjs          # now it grades instead of skipping
//
// WHY THIS IS WORTH THE TROUBLE: physics/control/controlStateSpace.mjs computes rank and det with code we wrote,
// and its own header argues that a number is only safe when several INDEPENDENT roads reach it. Every road it has
// is ours. LAPACK is not ours: dgesvd and dgetrf were written by people who have never seen this engine, they use
// different algorithms, and they were tested against different things. THAT IS WHAT AN ANSWER KEY IS.
//
// *** THE RANK COMPARISON IS THE ONE THAT MATTERS AND IT IS AN INTEGER. *** The engine decides rank by ELIMINATION
// against a typed tolerance; this decides it from the SINGULAR VALUE SPECTRUM, counting sigma > max(m,n)*eps*s1 --
// the standard numerical definition, and a genuinely different question about the same matrix. Two float answers
// agreeing to 1e-12 can always be an accident of tolerance. AN INTEGER AGREEING ACROSS TWO UNRELATED DERIVATIONS
// CANNOT.
//
// NOTE ON WHAT ACCELERATE ACTUALLY IS HERE: this links LAPACK, not the Neural Engine and not a GPU. On Apple
// Silicon the BLAS underneath will use the AMX/SME matrix units for the heavy steps, which is a nice property and
// is NOT the reason to do this. THE REASON IS INDEPENDENCE, NOT SPEED -- these matrices are 2x2 to 4x4 and the
// timing is meaningless. Anyone reading this later should not turn it into a benchmark.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <Accelerate/Accelerate.h>

#define MAXN 64

// LAPACK is COLUMN-MAJOR and the exported rows are ROW-MAJOR. Getting this backwards produces a transposed matrix,
// which has the SAME rank and the SAME determinant -- so a transpose bug would pass both checks silently on these
// problems. It is transposed explicitly here rather than relied upon.
static void to_col_major(const double *rowmaj, double *colmaj, int m, int n) {
    for (int i = 0; i < m; i++) for (int j = 0; j < n; j++) colmaj[j * m + i] = rowmaj[i * n + j];
}

static int rank_by_svd(const double *A, int m, int n, double *s1_out) {
    double a[MAXN * MAXN], s[MAXN], work[8 * MAXN * MAXN];
    __CLPK_integer M = m, N = n, lda = m, lwork = 8 * MAXN * MAXN, info = 0, one = 1;
    double u[1], vt[1];
    memcpy(a, A, sizeof(double) * m * n);
    char jobu = 'N', jobvt = 'N';
    dgesvd_(&jobu, &jobvt, &M, &N, a, &lda, s, u, &one, vt, &one, work, &lwork, &info);
    if (info != 0) return -1;
    int k = m < n ? m : n;
    double s1 = k > 0 ? s[0] : 0.0;
    if (s1_out) *s1_out = s1;
    // The standard numerical rank: singular values above max(m,n) * eps * sigma_1. NOT a typed 1e-9.
    double cut = (double)(m > n ? m : n) * 2.220446049250313e-16 * s1;
    int r = 0;
    for (int i = 0; i < k; i++) if (s[i] > cut) r++;
    return r;
}

static double det_by_lu(const double *A, int n) {
    double a[MAXN * MAXN];
    __CLPK_integer N = n, lda = n, ipiv[MAXN], info = 0;
    memcpy(a, A, sizeof(double) * n * n);
    dgetrf_(&N, &N, a, &lda, ipiv, &info);
    if (info < 0) return NAN;
    if (info > 0) return 0.0;                       // exactly singular, as LAPACK reports it
    double d = 1.0;
    for (int i = 0; i < n; i++) {
        d *= a[i * n + i];
        if (ipiv[i] != i + 1) d = -d;               // each row swap flips the sign
    }
    return d;
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s problems.txt\n", argv[0]); return 2; }
    FILE *f = fopen(argv[1], "r");
    if (!f) { fprintf(stderr, "cannot open %s\n", argv[1]); return 2; }
    int count = 0;
    if (fscanf(f, "%d", &count) != 1) { fprintf(stderr, "bad header\n"); return 2; }
    printf("{\n \"source\": \"Accelerate LAPACK via external-linalg.c\",\n \"answers\": [\n");
    for (int p = 0; p < count; p++) {
        char name[128], claim[32];
        int m = 0, n = 0;
        if (fscanf(f, "%127s %31s %d %d", name, claim, &m, &n) != 4) { fprintf(stderr, "bad block %d\n", p); return 2; }
        if (m > MAXN || n > MAXN) { fprintf(stderr, "matrix too large\n"); return 2; }
        double rowmaj[MAXN * MAXN], colmaj[MAXN * MAXN];
        for (int i = 0; i < m * n; i++) if (fscanf(f, "%lf", &rowmaj[i]) != 1) { fprintf(stderr, "short matrix\n"); return 2; }
        to_col_major(rowmaj, colmaj, m, n);
        double value = 0.0;
        if (strcmp(claim, "rank") == 0) { double s1; value = (double)rank_by_svd(colmaj, m, n, &s1); }
        else if (strcmp(claim, "det") == 0) { value = (m == n) ? det_by_lu(colmaj, n) : NAN; }
        else { fprintf(stderr, "unknown claim %s\n", claim); return 2; }
        printf("  {\"name\": \"%s\", \"claim\": \"%s\", \"value\": %.17g}%s\n",
               name, claim, value, (p + 1 < count) ? "," : "");
    }
    printf(" ]\n}\n");
    fclose(f);
    return 0;
}
