// =============================================================================
// FILE: /core/ecs/aabbTree.js
// v1989 — dynamic AABB tree broadphase, the Box2D/Box3D-lineage structure
// (Erin Catto's b2DynamicTree, adapted to JS). Replaces O(n) entity scans for
// picking/hover raycasts and gives PhysicsSystem an O(log n) overlap query.
//
// Techniques carried over from the reference design:
//   · FAT AABBs — each leaf is inflated by a margin so small movements don't
//     require a reinsert (move() only touches the tree when the tight box
//     escapes the fat one);
//   · surface-area heuristic for picking the insertion sibling;
//   · bottom-up AVL-ish balancing on insert/remove;
//   · slab-test raycast that walks only intersecting branches.
//
// API:
//   const tree = new AABBTree();
//   const proxy = tree.insert(id, [minx,miny,minz], [maxx,maxy,maxz]);
//   tree.move(proxy, min, max)          → true if reinserted
//   tree.remove(proxy)
//   tree.query(min, max, (id) => ...)   → visit overlapping leaves
//   tree.raycast(origin, dir, maxDist, (id, tmin) => keepGoing)
//   tree.pairs((idA, idB) => ...)       → all overlapping leaf pairs
// =============================================================================

const MARGIN = 0.35;   // fat-AABB inflation, world units

export class AABBTree {
    constructor() {
        this.nodes = [];       // { min:[3], max:[3], parent, child1, child2, height, id }
        this.root = -1;
        this._free = [];
    }
    _alloc() {
        if (this._free.length) { const i = this._free.pop(); const n = this.nodes[i]; n.parent = -1; n.child1 = -1; n.child2 = -1; n.height = 0; n.id = null; return i; }
        this.nodes.push({ min: [0, 0, 0], max: [0, 0, 0], parent: -1, child1: -1, child2: -1, height: 0, id: null });
        return this.nodes.length - 1;
    }
    _freeNode(i) { this.nodes[i].height = -1; this._free.push(i); }

    insert(id, min, max) {
        const i = this._alloc();
        const n = this.nodes[i];
        for (let a = 0; a < 3; a++) { n.min[a] = min[a] - MARGIN; n.max[a] = max[a] + MARGIN; }
        n.id = id; n.height = 0;
        this._insertLeaf(i);
        return i;
    }
    remove(proxy) { this._removeLeaf(proxy); this._freeNode(proxy); }
    move(proxy, min, max) {
        const n = this.nodes[proxy];
        // still inside the fat box? nothing to do.
        let inside = true;
        for (let a = 0; a < 3; a++) if (min[a] < n.min[a] || max[a] > n.max[a]) { inside = false; break; }
        if (inside) return false;
        this._removeLeaf(proxy);
        for (let a = 0; a < 3; a++) { n.min[a] = min[a] - MARGIN; n.max[a] = max[a] + MARGIN; }
        this._insertLeaf(proxy);
        return true;
    }

    _sa(min, max) {  // surface area
        const dx = max[0] - min[0], dy = max[1] - min[1], dz = max[2] - min[2];
        return 2 * (dx * dy + dy * dz + dz * dx);
    }
    _combine(outMin, outMax, aMin, aMax, bMin, bMax) {
        for (let i = 0; i < 3; i++) { outMin[i] = Math.min(aMin[i], bMin[i]); outMax[i] = Math.max(aMax[i], bMax[i]); }
    }
    _insertLeaf(leaf) {
        if (this.root === -1) { this.root = leaf; this.nodes[leaf].parent = -1; return; }
        const N = this.nodes, L = N[leaf];
        // find best sibling via surface-area heuristic descent
        let index = this.root;
        const cMin = [0, 0, 0], cMax = [0, 0, 0];
        while (N[index].child1 !== -1) {
            const node = N[index], c1 = node.child1, c2 = node.child2;
            this._combine(cMin, cMax, node.min, node.max, L.min, L.max);
            const cost = 2 * this._sa(cMin, cMax);
            const inh = cost - 2 * this._sa(node.min, node.max);
            const costChild = (c) => {
                this._combine(cMin, cMax, N[c].min, N[c].max, L.min, L.max);
                const leafC = N[c].child1 === -1;
                return leafC ? this._sa(cMin, cMax) + inh
                             : (this._sa(cMin, cMax) - this._sa(N[c].min, N[c].max)) + inh;
            };
            const cost1 = costChild(c1), cost2 = costChild(c2);
            if (cost < cost1 && cost < cost2) break;
            index = cost1 < cost2 ? c1 : c2;
        }
        const sibling = index;
        // new parent
        const oldParent = N[sibling].parent;
        const newParent = this._alloc();
        const P = N[newParent];
        P.parent = oldParent; P.height = N[sibling].height + 1;
        this._combine(P.min, P.max, N[sibling].min, N[sibling].max, L.min, L.max);
        if (oldParent !== -1) {
            if (N[oldParent].child1 === sibling) N[oldParent].child1 = newParent; else N[oldParent].child2 = newParent;
        } else this.root = newParent;
        P.child1 = sibling; P.child2 = leaf;
        N[sibling].parent = newParent; N[leaf].parent = newParent;
        // walk up: refit + balance
        this._fixUp(N[leaf].parent);
    }
    _removeLeaf(leaf) {
        if (leaf === this.root) { this.root = -1; return; }
        const N = this.nodes;
        const parent = N[leaf].parent, grand = N[parent].parent;
        const sibling = N[parent].child1 === leaf ? N[parent].child2 : N[parent].child1;
        if (grand !== -1) {
            if (N[grand].child1 === parent) N[grand].child1 = sibling; else N[grand].child2 = sibling;
            N[sibling].parent = grand;
            this._freeNode(parent);
            this._fixUp(grand);
        } else {
            this.root = sibling; N[sibling].parent = -1;
            this._freeNode(parent);
        }
    }
    _fixUp(i) {
        const N = this.nodes;
        while (i !== -1) {
            // v1989 fix: refresh THIS node's height/AABB *before* balancing — _balance's
            // guard reads stored heights, and balancing against a stale height let 3-vs-0
            // imbalances slip through the walk untouched.
            const n = N[i];
            n.height = 1 + Math.max(N[n.child1].height, N[n.child2].height);
            this._combine(n.min, n.max, N[n.child1].min, N[n.child1].max, N[n.child2].min, N[n.child2].max);
            const ni = this._balance(i);
            i = N[ni].parent;
        }
    }
    _balance(iA) {   // returns new subtree root index (Catto's b2DynamicTree::Balance)
        const N = this.nodes, A = N[iA];
        if (A.child1 === -1 || A.height < 2) return iA;
        const iB = A.child1, iC = A.child2, B = N[iB], C = N[iC];
        const balance = C.height - B.height;
        const rotate = (iQ) => {   // promote Q (A's taller child) above A
            const Q = N[iQ];
            const iF = Q.child1, iG = Q.child2, F = N[iF], G = N[iG];
            Q.child1 = iA; Q.parent = A.parent; A.parent = iQ;
            if (Q.parent !== -1) { if (N[Q.parent].child1 === iA) N[Q.parent].child1 = iQ; else N[Q.parent].child2 = iQ; }
            else this.root = iQ;
            const [tall, short] = F.height > G.height ? [iF, iG] : [iG, iF];
            Q.child2 = tall;
            if (A.child1 === iQ) A.child1 = short; else A.child2 = short;
            N[short].parent = iA;
            this._combine(A.min, A.max, N[A.child1].min, N[A.child1].max, N[A.child2].min, N[A.child2].max);
            A.height = 1 + Math.max(N[A.child1].height, N[A.child2].height);
            // v1989 fix: the demoted node A may STILL be imbalanced (e.g. it kept a
            // height-2 grandchild against a height-0 child after a removal). A single
            // top-level rotation can't see that — recursively balance the demoted
            // subtree, then hang whatever its new root is back under Q.
            const iA2 = this._balance(iA);
            Q.child1 = iA2; N[iA2].parent = iQ;
            this._combine(Q.min, Q.max, N[Q.child1].min, N[Q.child1].max, N[Q.child2].min, N[Q.child2].max);
            Q.height = 1 + Math.max(N[Q.child1].height, N[Q.child2].height);
            return iQ;
        };
        if (balance > 1) return rotate(iC);
        if (balance < -1) return rotate(iB);
        return iA;
    }

    query(min, max, cb) {
        if (this.root === -1) return;
        const N = this.nodes, stack = [this.root];
        while (stack.length) {
            const i = stack.pop(), n = N[i];
            let hit = true;
            for (let a = 0; a < 3; a++) if (n.min[a] > max[a] || n.max[a] < min[a]) { hit = false; break; }
            if (!hit) continue;
            if (n.child1 === -1) { if (cb(n.id, i) === false) return; }
            else { stack.push(n.child1, n.child2); }
        }
    }
    raycast(origin, dir, maxDist, cb) {
        if (this.root === -1) return;
        const N = this.nodes, stack = [this.root];
        const inv = [1 / (dir[0] || 1e-12), 1 / (dir[1] || 1e-12), 1 / (dir[2] || 1e-12)];
        while (stack.length) {
            const i = stack.pop(), n = N[i];
            // slab test
            let tmin = 0, tmax = maxDist, miss = false;
            for (let a = 0; a < 3; a++) {
                let t1 = (n.min[a] - origin[a]) * inv[a], t2 = (n.max[a] - origin[a]) * inv[a];
                if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
                tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
                if (tmin > tmax) { miss = true; break; }
            }
            if (miss) continue;
            if (n.child1 === -1) { if (cb(n.id, tmin) === false) return; }
            else stack.push(n.child1, n.child2);
        }
    }
    pairs(cb) {   // all overlapping leaf pairs (tight test on fat boxes — cheap broadphase)
        const N = this.nodes, leaves = [];
        for (let i = 0; i < N.length; i++) if (N[i].height === 0 && N[i].id != null) leaves.push(i);
        for (const li of leaves) {
            const l = N[li];
            this.query(l.min, l.max, (id, i) => { if (i > li) cb(l.id, id); });
        }
    }
    validate() {   // test helper: structural invariants
        let leaves = 0, bad = 0;
        const walk = (i, parent) => {
            if (i === -1) return -1;
            const n = this.nodes[i];
            if (n.parent !== parent) bad++;
            if (n.child1 === -1) { leaves++; if (n.height !== 0) bad++; return 0; }
            const h1 = walk(n.child1, i), h2 = walk(n.child2, i);
            if (n.height !== 1 + Math.max(h1, h2)) bad++;
            if (Math.abs(h1 - h2) > 1) bad++;   // AVL balance
            for (let a = 0; a < 3; a++) {
                if (n.min[a] > Math.min(this.nodes[n.child1].min[a], this.nodes[n.child2].min[a]) + 1e-9) bad++;
                if (n.max[a] < Math.max(this.nodes[n.child1].max[a], this.nodes[n.child2].max[a]) - 1e-9) bad++;
            }
            return n.height;
        };
        walk(this.root, -1);
        return { leaves, bad };
    }
}
export default AABBTree;
