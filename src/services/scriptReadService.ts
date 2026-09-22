import mongoose from 'mongoose';
import RepScriptRead from '../models/RepScriptRead';
import { AppError } from '../middleware/errorHandler';

const isOid = (v: string): boolean => /^[a-f\d]{24}$/i.test(v);

export type ScriptReadRow = {
  repId: string;
  gigId: string;
  journeyId?: string;
  scriptId?: string;
  readAt: string;
};

function toRow(doc: {
  repId: mongoose.Types.ObjectId;
  gigId: mongoose.Types.ObjectId;
  journeyId?: mongoose.Types.ObjectId;
  scriptId?: string;
  readAt: Date;
}): ScriptReadRow {
  return {
    repId: String(doc.repId),
    gigId: String(doc.gigId),
    journeyId: doc.journeyId ? String(doc.journeyId) : undefined,
    scriptId: doc.scriptId || undefined,
    readAt: new Date(doc.readAt).toISOString(),
  };
}

export async function markScriptRead(input: {
  repId: string;
  gigId: string;
  journeyId?: string;
  scriptId?: string;
}): Promise<ScriptReadRow> {
  const repId = String(input.repId || '').trim();
  const gigId = String(input.gigId || '').trim();
  const journeyId = String(input.journeyId || '').trim();
  const scriptId = String(input.scriptId || '').trim();

  if (!isOid(repId) || !isOid(gigId)) {
    throw new AppError('repId and gigId must be valid ObjectIds', 400);
  }

  const update: Record<string, unknown> = {
    repId: new mongoose.Types.ObjectId(repId),
    gigId: new mongoose.Types.ObjectId(gigId),
    readAt: new Date(),
  };
  if (isOid(journeyId)) {
    update.journeyId = new mongoose.Types.ObjectId(journeyId);
  }
  if (scriptId) {
    update.scriptId = scriptId;
  }

  const doc = await RepScriptRead.findOneAndUpdate(
    { repId: update.repId, gigId: update.gigId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  if (!doc) {
    throw new AppError('Failed to persist script read', 500);
  }
  return toRow(doc as any);
}

export async function listScriptReadsForRep(repId: string): Promise<ScriptReadRow[]> {
  const id = String(repId || '').trim();
  if (!isOid(id)) return [];

  const rows = await RepScriptRead.find({
    repId: new mongoose.Types.ObjectId(id),
  })
    .sort({ readAt: -1 })
    .lean();

  return rows.map((r) => toRow(r as any));
}

export async function isScriptRead(repId: string, gigId: string): Promise<boolean> {
  const r = String(repId || '').trim();
  const g = String(gigId || '').trim();
  if (!isOid(r) || !isOid(g)) return false;
  const found = await RepScriptRead.exists({
    repId: new mongoose.Types.ObjectId(r),
    gigId: new mongoose.Types.ObjectId(g),
  });
  return Boolean(found);
}

export default {
  markScriptRead,
  listScriptReadsForRep,
  isScriptRead,
};
