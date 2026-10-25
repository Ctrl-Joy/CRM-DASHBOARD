import { Router, type Request } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { badRequest, handler, notFound } from '../lib/http';
import { can, me } from '../lib/auth';
import { scopeWhere } from '../lib/scope';
import { audit } from '../lib/audit';
import { userSelect } from '../lib/records';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PARENTS = { contactId: ['contact', 'ownerId'], companyId: ['company', 'ownerId'], dealId: ['deal', 'ownerId'], leadId: ['lead', 'ownerId'], ticketId: ['ticket', 'assigneeId'] } as const;
type ParentKey = keyof typeof PARENTS;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // Random storage names: user-supplied file names never touch the filesystem.
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

/** The attachment's parent must be a record the user can see. */
async function parentFor(req: Request, source: Record<string, unknown>) {
  const key = (Object.keys(PARENTS) as ParentKey[]).find((k) => typeof source[k] === 'string' && source[k]);
  if (!key) throw badRequest('Attach the file to a record');
  const [model, ownerField] = PARENTS[key];
  const scope = await scopeWhere(me(req), ownerField);
  const row = await (prisma as any)[model].findFirst({ where: { AND: [scope, { id: source[key] }] }, select: { id: true } });
  if (!row) throw notFound('Record');
  return { [key]: row.id as string };
}

export const filesRouter = Router();

filesRouter.get('/', handler(async (req) => {
  const parent = await parentFor(req, req.query);
  return { data: await prisma.attachment.findMany({ where: { ...parent, orgId: me(req).orgId }, include: { uploadedBy: { select: userSelect } }, orderBy: { createdAt: 'desc' } }) };
}));

filesRouter.post('/', upload.single('file'), handler(async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Choose a file to upload');
  try {
    const parent = await parentFor(req, req.body);
    const att = await prisma.attachment.create({
      data: {
        orgId: me(req).orgId, fileName: file.originalname.slice(0, 200), mimeType: file.mimetype, size: file.size,
        storageKey: file.filename, uploadedById: me(req).id, ...parent,
      },
      include: { uploadedBy: { select: userSelect } },
    });
    await audit(req, 'upload', 'attachment', att.id, { fileName: att.fileName });
    res.status(201);
    return att;
  } catch (err) {
    fs.rm(file.path, () => {});
    throw err;
  }
}));

async function findAttachment(req: Request) {
  const att = await prisma.attachment.findFirst({ where: { id: req.params.id, orgId: me(req).orgId } });
  if (!att) throw notFound('File');
  await parentFor(req, att as unknown as Record<string, unknown>);
  return att;
}

filesRouter.get('/:id/download', handler(async (req, res) => {
  const att = await findAttachment(req);
  const file = path.join(UPLOAD_DIR, path.basename(att.storageKey));
  if (!fs.existsSync(file)) throw notFound('File');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.fileName)}"; filename*=UTF-8''${encodeURIComponent(att.fileName)}`);
  fs.createReadStream(file).pipe(res);
}));

filesRouter.delete('/:id', handler(async (req) => {
  const att = await findAttachment(req);
  if (att.uploadedById !== me(req).id && !can(me(req), 'records:delete')) throw badRequest("You can only delete files you uploaded");
  await prisma.attachment.delete({ where: { id: att.id } });
  fs.rm(path.join(UPLOAD_DIR, path.basename(att.storageKey)), () => {});
  await audit(req, 'delete', 'attachment', att.id, { fileName: att.fileName });
  return { ok: true };
}));
