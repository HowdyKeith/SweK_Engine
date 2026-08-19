#!/usr/bin/env python3
# codegraph_read.py — best-effort reader for colbymchenry/codegraph's local graph DB.
# CodeGraph stores its knowledge graph as a SQLite file under a project's .codegraph/
# directory. The schema is NOT publicly documented, so this script introspects it at
# runtime: it lists every table + columns + row count (always), and then *heuristically*
# tries to identify a "nodes/symbols" table and an "edges/relations" table to extract a
# node-link graph for visualisation. If it can't confidently identify them, it still
# returns the full table inventory so the mapping can be done later. One JSON line out.
#
#   codegraph_read.py <db.sqlite> [node_limit] [edge_limit]
import sys, os, json, sqlite3


def out(o):
    sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush(); sys.exit(0)


NODE_TABLE_NAMES = ("symbols", "nodes", "definitions", "defs", "entities", "declarations", "symbol")
EDGE_TABLE_NAMES = ("edges", "relations", "relationships", "refs", "references", "calls", "callgraph", "dependencies", "edge", "links")
NAME_COLS = ("name", "symbol", "identifier", "label", "title")
FILE_COLS = ("file", "path", "filepath", "file_path", "uri", "location", "source_file")
KIND_COLS = ("kind", "type", "category", "node_type", "symbol_kind")
EDGE_PAIRS = (("from", "to"), ("src", "dst"), ("source", "target"), ("caller", "callee"),
              ("from_id", "to_id"), ("src_id", "dst_id"), ("source_id", "target_id"),
              ("caller_id", "callee_id"), ("a", "b"), ("parent", "child"), ("head", "tail"))


def _pick(cols, names):
    low = {c.lower(): c for c in cols}
    for n in names:
        if n in low:
            return low[n]
    return None


def _edge_pair(cols):
    low = {c.lower(): c for c in cols}
    for a, b in EDGE_PAIRS:
        if a in low and b in low:
            return low[a], low[b]
    return None


def main():
    if len(sys.argv) < 2:
        out({"ok": False, "error": "usage: codegraph_read.py <db.sqlite> [node_limit] [edge_limit]"})
    db = sys.argv[1]
    node_limit = int(sys.argv[2]) if len(sys.argv) > 2 else 1500
    edge_limit = int(sys.argv[3]) if len(sys.argv) > 3 else 3000
    if not os.path.exists(db):
        out({"ok": False, "error": "graph db not found: " + db, "need": "init"})
    try:
        con = sqlite3.connect("file:%s?mode=ro" % db, uri=True, timeout=5)
    except Exception as e:
        out({"ok": False, "error": "open failed: " + str(e)})
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    tables = []
    try:
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        tnames = [r[0] for r in cur.fetchall()]
    except Exception as e:
        out({"ok": False, "error": "schema read failed: " + str(e)})
    table_cols = {}
    for t in tnames:
        try:
            cur.execute('PRAGMA table_info("%s")' % t.replace('"', ""))
            cols = [r[1] for r in cur.fetchall()]
        except Exception:
            cols = []
        rows = 0
        try:
            cur.execute('SELECT COUNT(*) FROM "%s"' % t.replace('"', ""))
            rows = cur.fetchone()[0]
        except Exception:
            rows = -1
        table_cols[t] = cols
        tables.append({"name": t, "columns": cols, "rows": rows})

    # ---- pick a node table ----
    node_table = None
    for t in tnames:
        if t.lower() in NODE_TABLE_NAMES:
            node_table = t; break
    if not node_table:
        cands = [t for t in tnames if _pick(table_cols[t], NAME_COLS) and _pick(table_cols[t], FILE_COLS)]
        if cands:
            node_table = max(cands, key=lambda t: next((x["rows"] for x in tables if x["name"] == t), 0))

    # ---- pick an edge table ----
    edge_table = None
    for t in tnames:
        if t.lower() in EDGE_TABLE_NAMES and _edge_pair(table_cols[t]):
            edge_table = t; break
    if not edge_table:
        cands = [t for t in tnames if _edge_pair(table_cols[t])]
        if cands:
            edge_table = max(cands, key=lambda t: next((x["rows"] for x in tables if x["name"] == t), 0))

    nodes, edges, note = [], [], ""
    id_to_name = {}
    if node_table:
        cols = table_cols[node_table]
        ncol = _pick(cols, NAME_COLS) or (cols[0] if cols else None)
        fcol = _pick(cols, FILE_COLS)
        kcol = _pick(cols, KIND_COLS)
        idcol = "id" if "id" in [c.lower() for c in cols] else None
        sel = "rowid AS _rid, *"
        try:
            cur.execute('SELECT %s FROM "%s" LIMIT %d' % (sel, node_table.replace('"', ""), node_limit))
            for r in cur.fetchall():
                d = dict(r)
                nid = d.get(idcol) if idcol else d.get("_rid")
                nm = (str(d.get(ncol)) if ncol and d.get(ncol) is not None else ("#" + str(nid)))
                node = {"id": nid, "name": nm[:120]}
                if fcol and d.get(fcol) is not None:
                    node["file"] = str(d.get(fcol))[:200]
                if kcol and d.get(kcol) is not None:
                    node["kind"] = str(d.get(kcol))[:40]
                nodes.append(node)
                id_to_name[nid] = node["name"]
        except Exception as e:
            note += "node read partial: " + str(e) + "; "
    else:
        note += "could not identify a nodes/symbols table; "

    if edge_table:
        pair = _edge_pair(table_cols[edge_table])
        tcol = _pick(table_cols[edge_table], KIND_COLS)
        if pair:
            a, b = pair
            try:
                cur.execute('SELECT * FROM "%s" LIMIT %d' % (edge_table.replace('"', ""), edge_limit))
                for r in cur.fetchall():
                    d = dict(r)
                    e = {"from": d.get(a), "to": d.get(b)}
                    if tcol and d.get(tcol) is not None:
                        e["type"] = str(d.get(tcol))[:40]
                    edges.append(e)
            except Exception as e:
                note += "edge read partial: " + str(e) + "; "
    else:
        note += "could not identify an edges/relations table; "

    con.close()
    out({"ok": True, "db": db, "tables": tables, "nodeTable": node_table, "edgeTable": edge_table,
         "nodes": nodes, "edges": edges, "nodeCount": len(nodes), "edgeCount": len(edges),
         "note": note.strip() or "ok"})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        out({"ok": False, "error": str(e)})
