import axios from 'axios';

const DASH_REP_API = String(
  process.env.DASH_REP_API_URL ||
    process.env.REP_DASH_API_URL ||
    'https://v25dashrepback-production.up.railway.app/api'
).replace(/\/$/, '');

function resolveId(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const o = value as { _id?: unknown; $oid?: unknown; id?: unknown };
    if (o._id) return resolveId(o._id);
    if (o.$oid) return String(o.$oid);
    if (o.id) return String(o.id);
  }
  return String(value).trim();
}

export async function persistActivityNotification(input: {
  repId: unknown;
  kind: string;
  notificationKey: string;
  title: string;
  message: string;
  gigId?: unknown;
  journeyId?: unknown;
  actionPath?: string;
  status?: string;
}): Promise<unknown> {
  const repId = resolveId(input.repId);
  const notificationKey = String(input.notificationKey || '').trim();
  const kind = String(input.kind || 'general').trim();
  if (!repId || !notificationKey || !kind) return null;

  const gigId = resolveId(input.gigId);
  const journeyId = resolveId(input.journeyId);

  try {
    const res = await axios.post(
      `${DASH_REP_API}/notifications/upsert`,
      {
        notificationKey,
        kind,
        status: input.status || kind,
        title: String(input.title || '').trim(),
        message: String(input.message || '').trim(),
        ...(gigId ? { gigId } : {}),
        ...(journeyId ? { journeyId } : {}),
        ...(input.actionPath ? { actionPath: String(input.actionPath) } : {}),
        read: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-agent-id': repId,
        },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (res.status >= 400) {
      console.error('[RepActivityNotif] upsert failed', kind, res.status);
      return null;
    }
    return res.data?.data || res.data || null;
  } catch (err: any) {
    console.error('[RepActivityNotif] upsert error', err?.message || err);
    return null;
  }
}

function isConsigne(journey: { type?: unknown; category?: unknown; title?: unknown; name?: unknown }): boolean {
  return /consigne|instruction/i.test(
    `${journey?.type || ''} ${journey?.category || ''} ${journey?.title || ''} ${journey?.name || ''}`
  );
}

/** Notify enrolled REPs that a training/consigne was launched. */
export async function notifyTrainingLaunched(journey: {
  _id?: unknown;
  id?: unknown;
  title?: unknown;
  name?: unknown;
  type?: unknown;
  category?: unknown;
  gigId?: unknown;
  enrolledRepIds?: unknown[];
}): Promise<void> {
  const jid = resolveId(journey._id || journey.id);
  if (!jid) return;
  const gigId = resolveId(journey.gigId);
  const jTitle = String(journey.title || journey.name || 'Formation');
  const consigne = isConsigne(journey);
  const reps = Array.isArray(journey.enrolledRepIds)
    ? journey.enrolledRepIds.map(resolveId).filter(Boolean)
    : [];

  await Promise.allSettled(
    reps.map((repId) =>
      persistActivityNotification({
        repId,
        kind: 'training_added',
        status: 'training_added',
        notificationKey: `training:${jid}`,
        journeyId: jid,
        gigId: gigId || undefined,
        actionPath: gigId ? `/training?gigId=${encodeURIComponent(gigId)}` : '/training',
        title: consigne ? 'Nouvelle consigne' : 'Nouvelle formation',
        message: consigne
          ? `La consigne « ${jTitle} » a été ajoutée.`
          : `La formation « ${jTitle} » a été ajoutée.`,
      })
    )
  );

  // Also surface as assigned actions for each REP.
  await Promise.allSettled(
    reps.map((repId) =>
      persistActivityNotification({
        repId,
        kind: 'action_assigned',
        status: 'action_assigned',
        notificationKey: `action:journey:${jid}`,
        journeyId: jid,
        gigId: gigId || undefined,
        actionPath: '/training',
        title: 'Action assignée',
        message: `Une formation vous a été assignée : « ${jTitle} ».`,
      })
    )
  );
}

/** Notify enrolled REPs that a training was deactivated/archived. */
export async function notifyTrainingDeactivated(journey: {
  _id?: unknown;
  id?: unknown;
  title?: unknown;
  name?: unknown;
  gigId?: unknown;
  enrolledRepIds?: unknown[];
}): Promise<void> {
  const jid = resolveId(journey._id || journey.id);
  if (!jid) return;
  const gigId = resolveId(journey.gigId);
  const jTitle = String(journey.title || journey.name || 'Formation');
  const reps = Array.isArray(journey.enrolledRepIds)
    ? journey.enrolledRepIds.map(resolveId).filter(Boolean)
    : [];

  await Promise.allSettled(
    reps.map((repId) =>
      persistActivityNotification({
        repId,
        kind: 'deactivated',
        status: 'deactivated',
        notificationKey: `deact:training:${jid}`,
        journeyId: jid,
        gigId: gigId || undefined,
        actionPath: gigId ? `/training?gigId=${encodeURIComponent(gigId)}` : '/training',
        title: 'Formation désactivée',
        message: `« ${jTitle} » n’est plus active.`,
      })
    )
  );
}
