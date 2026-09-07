// /api/db/:entity/:op  — see MIGRATION-PLAN.md C-2.
// Thin transport over db/client.ts; all semantics live there.

import { HttpError, badRequest } from '../lib/http';
import { isEntity } from '../db/registry';
import type { Ctx } from '../types';

const OPS = new Set(['filter', 'list', 'get', 'create', 'bulkCreate', 'update', 'delete', 'import']);

export async function handleDb(
  entity: string,
  op: string,
  body: any,
  ctx: Ctx,
): Promise<unknown> {
  if (!isEntity(entity)) throw new HttpError(404, `Unknown entity: ${entity}`);
  if (!OPS.has(op)) throw new HttpError(404, `Unknown operation: ${op}`);

  const api = ctx.db[entity];
  const b = body || {};

  switch (op) {
    case 'filter':
      return api.filter(b.where || {}, b.sort, b.limit, b.offset);

    case 'list':
      return api.list(b.sort, b.limit, b.offset);

    case 'get': {
      if (!b.id) throw badRequest('id is required');
      const row = await api.get(b.id);
      if (!row) throw new HttpError(404, `${entity} ${b.id} not found`);
      return row;
    }

    case 'create':
      if (!b.values || typeof b.values !== 'object') throw badRequest('values is required');
      return api.create(b.values);

    case 'bulkCreate':
      if (!Array.isArray(b.values)) throw badRequest('values must be an array');
      return api.bulkCreate(b.values);

    case 'update':
      if (!b.id) throw badRequest('id is required');
      if (!b.values || typeof b.values !== 'object') throw badRequest('values is required');
      return api.update(b.id, b.values);

    case 'delete':
      if (!b.id) throw badRequest('id is required');
      return api.delete(b.id);

    // CUTOVER ONLY — preserves ids so foreign keys survive. See db/client.ts.
    // Consider removing this op from OPS once Phase 13 is signed off.
    case 'import':
      if (!Array.isArray(b.rows)) throw badRequest('rows must be an array');
      return api.importRows(b.rows);

    default:
      throw new HttpError(404, `Unknown operation: ${op}`);
  }
}
