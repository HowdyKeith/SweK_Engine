const counts = new Map();
/** A provisional, per-kind id for a source built outside a Scene. */
export function autoName(kind) {
    const n = counts.get(kind) ?? 0;
    counts.set(kind, n + 1);
    return `${kind}-${n}`;
}
//# sourceMappingURL=auto-id.js.map