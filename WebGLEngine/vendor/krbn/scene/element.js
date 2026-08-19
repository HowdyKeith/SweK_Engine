// A scene element: a `FeatureSource` plus authoring semantics (docs/DESIGN.md §2.8).
//
// `importance`/`role` express what matters; the engine allocates detail from
// them. Importance's primary lever is the abstraction stage (not built yet), so
// for now it is carried and `role` supplies styling defaults. `style()` sets
// per-element overrides that win over scene defaults.
let autoId = 0;
export class Element {
    source;
    id;
    importance;
    role;
    styleOverride;
    /** Emit this element's own strokes to the output? (It always still occludes.) */
    output;
    constructor(source, opts = {}) {
        this.source = source;
        this.id = source.id ?? `element-${autoId++}`;
        this.importance = opts.importance ?? 0.5;
        this.role = opts.role ?? "default";
        this.styleOverride = { ...opts.style };
        this.output = opts.output ?? true;
    }
    /** Set importance (0..1); optionally the semantic role. Chainable. */
    setImportance(value, opts = {}) {
        this.importance = value;
        if (opts.role)
            this.role = opts.role;
        return this;
    }
    setRole(role) {
        this.role = role;
        return this;
    }
    /** Toggle whether this element emits its own strokes (it still occludes).
     *  Chainable. See {@link ElementOptions.output}. */
    setOutput(value) {
        this.output = value;
        return this;
    }
    /** Merge per-element style overrides. Chainable. */
    style(override) {
        this.styleOverride = { ...this.styleOverride, ...override };
        return this;
    }
}
//# sourceMappingURL=element.js.map