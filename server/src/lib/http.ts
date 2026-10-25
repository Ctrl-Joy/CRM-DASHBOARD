import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { Prisma } from '@prisma/client';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);
export const forbidden = (msg = "You don't have permission to do that") => new HttpError(403, msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);

/** Wrap an async route so rejections reach the error handler. */
export const handler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).then((out) => {
      if (out !== undefined && !res.headersSent) res.json(out);
    }, next);
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw zodToHttp(result.error);
  return result.data;
}

function zodToHttp(err: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  const first = err.issues[0];
  return new HttpError(400, first ? `${first.path.length ? first.path.join('.') + ': ' : ''}${first.message}` : 'Invalid input', { fields });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    const e = zodToHttp(err);
    res.status(400).json({ error: e.message, details: e.details });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') { res.status(409).json({ error: 'A record with that value already exists' }); return; }
    if (err.code === 'P2025') { res.status(404).json({ error: 'Record not found' }); return; }
    if (err.code === 'P2003') { res.status(400).json({ error: 'A linked record does not exist' }); return; }
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'Request is too large' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}

// ---------- query helpers ----------
export const str = (v: unknown) => (typeof v === 'string' && v.length ? v : undefined);
export const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
export function dateParam(v: unknown): Date | undefined {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function pagination(query: Request['query'], maxPageSize = 100) {
  const page = Math.max(1, Math.floor(num(query.page, 1)));
  const pageSize = Math.min(maxPageSize, Math.max(1, Math.floor(num(query.pageSize, 25))));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  const cell = (v: unknown) => {
    let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(','))].join('\r\n');
}
