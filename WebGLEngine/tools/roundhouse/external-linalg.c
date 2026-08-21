// WebGLEngine/tools/roundhouse/external-linalg.c -- v3687
// ---------------------------------------------------------------------------------------------------------------
// THE OUTSIDE ANSWER KEY. It was Mac-only until v3936, and its gate had therefore reported "absent" -- not pass,
// ABSENT -- for ~250 versions: a control designed, built, argued for, and never once fired, because producing the
// key needed hardware the gates do not run on. Reference LAPACK is the same dgesvd/dgetrf and installs anywhere.
// THE INDEPENDENCE ARGUMENT IS UNCHANGED: what matters is that nobody who wrote these routines has seen this
// engine. Running BOTH is strictly better than running either, and that is now a thing Keith can do rather than
// the only thing that works.
//
//   cd WebGLEngine
//   node tools/roundhouse/externalLinalg.mjs --write-problems
//   # on a Mac:            clang -O2 tools/roundhouse/external-linalg.c -framework Accelerate -o /tmp/exlinalg
//   # where the gates run: cc    -O2 tools/roundhouse/external-linalg.c -llapack -lm      -o /tmp/exlinalg
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
// v3936 -- TWO LAPACKS, ONE PROGRAM. The Mac path is untouched; what is new is that this can also be built where
// the gates actually run. dgesvd_ and dgetrf_ are the Fortran symbols BOTH libraries export, so the body below is
// identical on either -- only the integer width and the header differ. Declaring the two symbols by hand on the
// non-Apple side keeps the dependency down to liblapack alone: no LAPACKE, no CBLAS, no header hunt.
#ifdef __APPLE__
#include <Accelerate/Accelerate.h>
typedef __CLPK_integer lapack_int_t;
#define LINALG_SOURCE "Accelerate LAPACK (macOS) via external-linalg.c"
#else
// Reference LAPACK builds its Fortran INTEGER as 32-bit by default, which is what `int` is on every platform this
// is likely to see. If anyone links an ILP64 build, THIS IS THE LINE THAT IS WRONG -- and it will not be subtle.
typedef int lapack_int_t;
extern void dgesvd_(char *jobu, char *jobvt, lapack_int_t *m, lapack_int_t *n, double *a, lapack_int_t *lda,
                    double *s, double *u, lapack_int_t *ldu, double *vt, lapack_int_t *ldvt,
                    double *work, lapack_int_t *lwork, lapack_int_t *info);
extern void dgetrf_(lapack_int_t *m, lapack_int_t *n, double *a, lapack_int_t *lda,
                    lapack_int_t *ipiv, lapack_int_t *info);
#define LINALG_SOURCE "reference LAPACK (Netlib) via external-linalg.c"
#endif

#define MAXN 64

// LAPACK is COLUMN-MAJOR and the exported rows are ROW-MAJOR. Getting this backwards produces a transposed matrix,
// which has the SAME rank and the SAME determinant -- so a transpose bug would pass both checks silently on these
// problems. It is transposed explicitly here rather than relied upon.
static void to_col_major(const double *rowmaj, double *colmaj, int m, int n) {
    for (int i = 0; i < m; i++) for (int j = 0; j < n; j++) colmaj[j * m + i] = rowmaj[i * n + j];
}

static int rank_by_svd(const double *A, int m, int n, double *s1_out) {
    double a[MAXN * MAXN], s[MAXN], work[8 * MAXN * MAXN];
    lapack_int_t M = m, N = n, lda = m, lwork = 8 * MAXN * MAXN, info = 0, one = 1;
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
    lapack_int_t N = n, lda = n, ipiv[MAXN], info = 0;
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
    printf("{\n \"source\": \"%s\",\n \"answers\": [\n", LINALG_SOURCE);
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
