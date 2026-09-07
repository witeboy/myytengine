// Entity client — the drop-in replacement for `base44.entities.*`.
// See MIGRATION-PLAN.md C-2 (semantics) and C-3 (table shape).
//
// Behaviour that MUST match Base44, because ~440 call sites depend on it:
//   • filter(where, sort?, limit?, offset?)  equality AND; returns [] never null
//   • list(sort?, limit?, offset?)           default sort '-created_date'
//   • update(id, values)                     PARTIAL merge, not replace
//   • create/update                          return the FULL row
//   • unknown fields round-trip              (Base44 was schemaless -> `attrs`)
//
// Call sites observed in the repo, for reference:
//   .filter({ project_id }, 'scene_number', PAGE, offset)
//   .filter({ status: 'active' }, '-created_date')
//   .list('-created_date', 500)
//   .list()

import { ENTITIES, isEntity, type EntityDef, type FieldType } from './registry';
import { maybeOffload, rehydrate, purge } from './cold';
import { HttpError, newId, nowIso } from '../lib/http';
import type { Env, User } from '../types';

export type Row = Record<string, any>;

export interface EntityApi {
  filter(where?: Row, sort?: string, limit?: number, offset?: number): Promise<Row[]>;
  list(sort?: string, limit?: number, offset?: number): Promise<Row[]>;
  get(id: string): Promise<Row | null>;
  create(values: Row): Promise<Row>;
  bulkCreate(values: Row[]): Promise<Row[]>;
  update(id: string, values: Row): Promise<Row>;
  delete(id: string): Promise<{ id: string; deleted: true }>;
  /**
   * CUTOVER ONLY. Writes a row preserving its `id`, `created_date` and `created_by`.
   *
   * Every other write mints a fresh id, which is correct for normal use and fatal for a
   * data migration: `Scenes.project_id` points at `Projects.id`, and roughly a dozen
   * other columns do the same. Re-keying on import would silently orphan the entire
   * dataset. Uses INSERT OR REPLACE so a re-run is idempotent.
   */
  importRows(rows: Row[]): Promise<{ imported: number }>;
}

export type Db = Record<string, EntityApi>;

const META = ['id', 'created_date', 'updated_date', 'created_by'] as const;
const DEFAULT_LIMIT = 1000;

// ── (de)serialization ─────────────────────────────────────────────────────────

function toColumn(type: FieldType, v: any): any {
  if (v === undefined || v === null) return null;
  switch (type) {
    case 'boolean':
      return v ? 1 : 0;
    case 'number':
    case 'integer':
      return typeof v === 'number' ? v : Number(v);
    case 'array':
    case 'object':
      return typeof v === 'string' ? v : JSON.stringify(v);
    default:
      return typeof v === 'string' ? v : String(v);
  }
}

function fromColumn(type: FieldType, v: any): any {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'boolean':
      return !!v;
    case 'number':
    case 'integer':
      return typeof v === 'number' ? v : Number(v);
    case 'array':
    case 'object':
      if (typeof v !== 'string') return v;
      try {
        return JSON.parse(v);
      } catch {
        return v; // tolerate legacy non-JSON text rather than throwing
      }
    default:
      return v;
  }
}

/** Split an incoming payload into typed columns and `attrs` overflow. */
function split(def: EntityDef, values: Row) {
  const cols: Row = {};
  const attrs: Row = {};
  for (const [k, v] of Object.entries(values)) {
    if ((META as readonly string[]).includes(k)) continue; // server-owned
    if (k in def.cols) cols[k] = v;
    else attrs[k] = v;
  }
  return { cols, attrs };
}

// ── row assembly ──────────────────────────────────────────────────────────────

async function hydrate(
  entity: string,
  def: EntityDef,
  raw: Row,
  cold: R2Bucket,
): Promise<Row> {
  const out: Row = {
    id: raw.id,
    created_date: raw.created_date,
    updated_date: raw.updated_date,
    created_by: raw.created_by ?? null,
  };

  for (const [name, type] of Object.entries(def.cols)) {
    let v = raw[name];
    if (def.cold.includes(name) && typeof v === 'string' && v.includes('"__r2"')) {
      v = await rehydrate(cold, v);
    }
    out[name] = fromColumn(type, v);
  }

  if (raw.attrs) {
    try {
      Object.assign(out, JSON.parse(raw.attrs));
    } catch {
      /* corrupt attrs must not take the whole row down */
    }
  }
  return out;
}

// ── query building ────────────────────────────────────────────────────────────

/** `-created_date` -> ORDER BY created_date DESC. Falls back to json_extract for attrs. */
function orderBy(def: EntityDef, sort?: string): string {
  const s = (sort || '-created_date').trim();
  const desc = s.startsWith('-');
  const field = desc ? s.slice(1) : s;
  const dir = desc ? 'DESC' : 'ASC';

  if ((META as readonly string[]).includes(field) || field in def.cols) {
    return `ORDER BY "${field}" ${dir}`;
  }
  // Sorting on an undeclared field — it lives in attrs.
  return `ORDER BY json_extract(attrs, '$.${field}') ${dir}`;
}

function whereClause(def: EntityDef, where: Row) {
  const parts: string[] = [];
  const binds: any[] = [];
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    if ((META as readonly string[]).includes(k)) {
      parts.push(`"${k}" = ?`);
      binds.push(v);
    } else if (k in def.cols) {
      parts.push(`"${k}" = ?`);
      binds.push(toColumn(def.cols[k], v));
    } else {
      parts.push(`json_extract(attrs, '$.${k}') = ?`);
      binds.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
    }
  }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', binds };
}

// ── factory ───────────────────────────────────────────────────────────────────

export function makeDb(env: Env, user: User): Db {
  const db: Db = {};

  for (const [entity, def] of Object.entries(ENTITIES)) {
    const table = `"${entity}"`;

    const readMany = async (
      where: Row,
      sort?: string,
      limit?: number,
      offset?: number,
    ): Promise<Row[]> => {
      const w = whereClause(def, where);
      const sql =
        `SELECT * FROM ${table} ${w.sql} ${orderBy(def, sort)} LIMIT ? OFFSET ?`.replace(
          /\s+/g,
          ' ',
        );
      const res = await env.DB.prepare(sql)
        .bind(...w.binds, limit ?? DEFAULT_LIMIT, offset ?? 0)
        .all<Row>();
      const rows = res.results || [];
      return Promise.all(rows.map((r) => hydrate(entity, def, r, env.COLD)));
    };

    /** Build the column/bind pair for an insert or update. */
    const materialize = async (id: string, cols: Row, attrs: Row) => {
      const names: string[] = [];
      const binds: any[] = [];
      for (const [k, v] of Object.entries(cols)) {
        let stored = toColumn(def.cols[k], v);
        if (def.cold.includes(k) && typeof stored === 'string') {
          stored = await maybeOffload(env.COLD, entity, id, k, stored);
        }
        names.push(k);
        binds.push(stored);
      }
      return { names, binds, attrsJson: JSON.stringify(attrs) };
    };

    db[entity] = {
      async filter(where = {}, sort, limit, offset) {
        return readMany(where, sort, limit, offset);
      },

      async list(sort, limit, offset) {
        return readMany({}, sort, limit, offset);
      },

      async get(id) {
        const raw = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`)
          .bind(id)
          .first<Row>();
        return raw ? hydrate(entity, def, raw, env.COLD) : null;
      },

      async create(values) {
        const id = newId();
        const ts = nowIso();
        const { cols, attrs } = split(def, values);
        const m = await materialize(id, cols, attrs);

        const allNames = ['id', 'created_date', 'updated_date', 'created_by', ...m.names, 'attrs'];
        const allBinds = [id, ts, ts, user.email ?? null, ...m.binds, m.attrsJson];

        await env.DB.prepare(
          `INSERT INTO ${table} (${allNames.map((n) => `"${n}"`).join(', ')}) ` +
            `VALUES (${allNames.map(() => '?').join(', ')})`,
        )
          .bind(...allBinds)
          .run();

        return (await this.get(id))!;
      },

      async bulkCreate(values) {
        if (!Array.isArray(values) || values.length === 0) return [];
        const ids: string[] = [];
        const stmts: D1PreparedStatement[] = [];
        const ts = nowIso();

        for (const v of values) {
          const id = newId();
          ids.push(id);
          const { cols, attrs } = split(def, v);
          const m = await materialize(id, cols, attrs);
          const names = ['id', 'created_date', 'updated_date', 'created_by', ...m.names, 'attrs'];
          const binds = [id, ts, ts, user.email ?? null, ...m.binds, m.attrsJson];
          stmts.push(
            env.DB.prepare(
              `INSERT INTO ${table} (${names.map((n) => `"${n}"`).join(', ')}) ` +
                `VALUES (${names.map(() => '?').join(', ')})`,
            ).bind(...binds),
          );
        }

        await env.DB.batch(stmts);
        const out: Row[] = [];
        for (const id of ids) out.push((await this.get(id))!);
        return out;
      },

      async update(id, values) {
        const existingRaw = await env.DB.prepare(
          `SELECT attrs FROM ${table} WHERE id = ?`,
        )
          .bind(id)
          .first<{ attrs: string }>();
        if (!existingRaw) throw new HttpError(404, `${entity} ${id} not found`);

        let existingAttrs: Row = {};
        try {
          existingAttrs = JSON.parse(existingRaw.attrs || '{}');
        } catch {
          /* ignore */
        }

        const { cols, attrs } = split(def, values);
        // PARTIAL merge — undeclared fields not present in this call must survive.
        const mergedAttrs = { ...existingAttrs, ...attrs };
        const m = await materialize(id, cols, mergedAttrs);

        const sets = [...m.names.map((n) => `"${n}" = ?`), 'attrs = ?', 'updated_date = ?'];
        const binds = [...m.binds, m.attrsJson, nowIso(), id];

        await env.DB.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`)
          .bind(...binds)
          .run();

        return (await this.get(id))!;
      },

      async delete(id) {
        await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
        if (def.cold.length) await purge(env.COLD, entity, id);
        return { id, deleted: true };
      },

      async importRows(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return { imported: 0 };
        const stmts: D1PreparedStatement[] = [];

        for (const row of rows) {
          const id = row.id;
          if (!id) throw new HttpError(400, `${entity}: every imported row needs an id`);

          // split() strips the meta fields; on import we want them kept.
          const { cols, attrs } = split(def, row);
          const m = await materialize(id, cols, attrs);

          const names = ['id', 'created_date', 'updated_date', 'created_by', ...m.names, 'attrs'];
          const binds = [
            id,
            row.created_date || nowIso(),
            row.updated_date || row.created_date || nowIso(),
            row.created_by ?? null,
            ...m.binds,
            m.attrsJson,
          ];

          stmts.push(
            env.DB.prepare(
              `INSERT OR REPLACE INTO ${table} (${names.map((n) => `"${n}"`).join(', ')}) ` +
                `VALUES (${names.map(() => '?').join(', ')})`,
            ).bind(...binds),
          );
        }

        await env.DB.batch(stmts);
        return { imported: rows.length };
      },
    };
  }

  return db;
}

export function assertEntity(name: string): asserts name is string {
  if (!isEntity(name)) throw new HttpError(404, `Unknown entity: ${name}`);
}
