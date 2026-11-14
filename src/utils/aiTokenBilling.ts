/**
 * HARX prepaid AI tokens — normalize provider usage + charge orchestrator wallet.
 * Providers: Anthropic (Claude), OpenAI, Gemini/Vertex. Fallback: ~4 chars ≈ 1 token.
 *
 * Product rule: AI tokens are ALWAYS prepaid and debited (no free first gig). Without a companyId the
 * request is refused; if the balance cannot be read the request fails cleanly (never a silent free generation).
 */

import crypto from 'crypto';

const b64url = (v: string | Buffer) =>
  Buffer.from(v).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** JWT HS256 de service à service, valable une minute (même format que ceux vérifiés par l'orchestrateur). */
export function signServiceToken(secret: string, payload: Record<string, unknown>, ttlSeconds = 60): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })
  )}`;
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'estimated';

export type AiTokenUsage = {
  provider: AiProvider;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimated: boolean;
};

export function estimateTokensFromText(...parts: Array<string | undefined | null>): number {
  const chars = parts.reduce((sum, p) => sum + String(p || '').length, 0);
  return Math.max(1, Math.ceil(chars / 4));
}

export function usageFromAnthropic(raw: any, model?: string): AiTokenUsage | null {
  const u = raw?.usage || raw;
  const input = Number(u?.input_tokens ?? u?.inputTokens ?? 0);
  const output = Number(u?.output_tokens ?? u?.outputTokens ?? 0);
  if (!Number.isFinite(input + output) || input + output <= 0) return null;
  return {
    provider: 'anthropic',
    model: model || undefined,
    inputTokens: Math.max(0, Math.round(input)),
    outputTokens: Math.max(0, Math.round(output)),
    totalTokens: Math.max(0, Math.round(input + output)),
    estimated: false,
  };
}

export function usageFromOpenAI(raw: any, model?: string): AiTokenUsage | null {
  const u = raw?.usage || raw;
  const input = Number(u?.prompt_tokens ?? u?.input_tokens ?? u?.promptTokens ?? 0);
  const output = Number(u?.completion_tokens ?? u?.output_tokens ?? u?.completionTokens ?? 0);
  const total = Number(u?.total_tokens ?? input + output);
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    provider: 'openai',
    model: model || raw?.model || undefined,
    inputTokens: Math.max(0, Math.round(input)),
    outputTokens: Math.max(0, Math.round(output)),
    totalTokens: Math.max(0, Math.round(total)),
    estimated: false,
  };
}

export function usageFromGemini(raw: any, model?: string): AiTokenUsage | null {
  const u = raw?.usageMetadata || raw?.usage || raw;
  const input = Number(
    u?.promptTokenCount ?? u?.prompt_token_count ?? u?.inputTokens ?? u?.input_tokens ?? 0
  );
  const output = Number(
    u?.candidatesTokenCount ??
      u?.candidates_token_count ??
      u?.outputTokens ??
      u?.output_tokens ??
      0
  );
  const total = Number(u?.totalTokenCount ?? u?.total_token_count ?? input + output);
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    provider: 'gemini',
    model: model || undefined,
    inputTokens: Math.max(0, Math.round(input)),
    outputTokens: Math.max(0, Math.round(output)),
    totalTokens: Math.max(0, Math.round(total)),
    estimated: false,
  };
}

export function fallbackEstimatedUsage(
  ...parts: Array<string | undefined | null>
): AiTokenUsage {
  const total = estimateTokensFromText(...parts);
  return {
    provider: 'estimated',
    inputTokens: 0,
    outputTokens: total,
    totalTokens: total,
    estimated: true,
  };
}

export function resolveUsageOrEstimate(
  usage: AiTokenUsage | null | undefined,
  ...textParts: Array<string | undefined | null>
): AiTokenUsage {
  if (usage && usage.totalTokens > 0) return usage;
  return fallbackEstimatedUsage(...textParts);
}

function getOrchestratorApiBase(): string {
  const raw =
    process.env.COMPORCHESTRATOR_API_URL ||
    process.env.ORCHESTRATOR_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    'https://v25comporchestratorback-production.up.railway.app/api';
  return String(raw).replace(/\/$/, '');
}

export type TokenGateCode = 'company_required' | 'insufficient_tokens' | 'balance_unavailable';

export interface TokenGateResult {
  ok: boolean;
  /** Solde réel lu à l'orchestrateur (jamais un marqueur : undefined si inconnu). */
  tokens?: number;
  code?: TokenGateCode;
  message?: string;
}

/** Réponse HTTP uniforme d'un refus de garde (400 sans entreprise, 402 solde insuffisant, 503 solde illisible). */
export function tokenGateErrorResponse(gate: TokenGateResult): { status: number; body: Record<string, unknown> } {
  const status = gate.code === 'company_required' ? 400 : gate.code === 'balance_unavailable' ? 503 : 402;
  return {
    status,
    body: {
      success: false,
      error: gate.code || 'insufficient_tokens',
      message: gate.message,
      data: { tokens: gate.tokens },
    },
  };
}

/**
 * Vérifie le solde de jetons prépayés de l'entreprise auprès de l'orchestrateur.
 * - sans companyId : refus (400) ;
 * - solde < minRequired : refus (402) avec le vrai solde ;
 * - solde illisible (réseau, 401, 5xx, réponse invalide) : refus propre (503), jamais de génération gratuite.
 */
export async function assertCompanyHasAiTokens(
  companyId: string | undefined | null,
  minRequired = 1
): Promise<TokenGateResult> {
  const id = String(companyId || '').trim();
  if (!id) {
    return {
      ok: false,
      code: 'company_required',
      message: "Identifiant d'entreprise requis pour utiliser les jetons IA.",
    };
  }

  const min = Math.max(1, Math.ceil(Number(minRequired) || 1));
  const unavailable = (detail: string): TokenGateResult => {
    console.warn('[aiTokenBilling] balance check unavailable:', detail);
    return {
      ok: false,
      code: 'balance_unavailable',
      message: "Impossible de vérifier votre solde de jetons IA pour le moment. Réessayez dans quelques instants.",
    };
  };

  try {
    const base = getOrchestratorApiBase();
    // L'orchestrateur exige un JWT sur /check (PAY-12) : appel de service à service, jeton signé avec le secret commun.
    const headers: Record<string, string> = {};
    if (process.env.JWT_SECRET) {
      headers.Authorization = `Bearer ${signServiceToken(process.env.JWT_SECRET, { service: 'training', companyId: id })}`;
    }
    const res = await fetch(`${base}/tokens-company/${encodeURIComponent(id)}/check?min=${min}`, { headers });
    const json: any = await res.json().catch(() => ({}));
    const balance = json?.data?.tokens;
    const hasBalance = typeof balance === 'number' && Number.isFinite(balance);

    if (res.status === 402 || json?.success === false) {
      return {
        ok: false,
        code: 'insufficient_tokens',
        tokens: hasBalance ? balance : undefined,
        message: json?.message || 'Solde de tokens AI insuffisant. Rechargez pour continuer.',
      };
    }
    if (!res.ok) return unavailable(`HTTP ${res.status}`);
    if (!hasBalance) return unavailable('balance missing in orchestrator response');
    return { ok: true, tokens: balance };
  } catch (err) {
    return unavailable(String((err as any)?.message || err));
  }
}

export interface ChargeResult {
  billed: boolean;
  /** Solde restant renvoyé par l'orchestrateur, si connu. */
  tokens?: number;
  /** Montant réellement débité (0 si non débité). */
  charged: number;
  /** Raison lorsque rien n'a été débité. */
  reason?: 'company_required' | 'no_usage' | 'insufficient_tokens' | 'charge_failed';
}

/** Débite le coût réel après génération (toujours, aucun gig gratuit) ; le résultat est journalisé et renvoyé. */
export async function chargeCompanyAiTokens(opts: {
  companyId?: string | null;
  usageId: string;
  usage: AiTokenUsage;
  tool: string;
  gigId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<ChargeResult> {
  const id = String(opts.companyId || '').trim();
  const log = (r: ChargeResult, tokensUsed: number): ChargeResult => {
    console.info('[aiTokenBilling] charge', {
      tool: opts.tool,
      usageId: opts.usageId,
      companyId: id || null,
      tokensUsed,
      billed: r.billed,
      charged: r.charged,
      balance: r.tokens,
      reason: r.reason,
    });
    return r;
  };
  const tokensUsed = Math.max(0, Math.round(opts.usage.totalTokens || 0));
  if (!id) return log({ billed: false, charged: 0, reason: 'company_required' }, tokensUsed);
  if (tokensUsed <= 0) return log({ billed: false, charged: 0, reason: 'no_usage' }, tokensUsed);

  try {
    const base = getOrchestratorApiBase();
    const gigId = String(opts.gigId || opts.meta?.gigId || '').trim() || undefined;
    const res = await fetch(`${base}/tokens-company/charge-usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: id,
        usageId: opts.usageId,
        tokensUsed,
        tool: opts.tool,
        gigId: gigId || undefined,
        meta: {
          ...(opts.meta || {}),
          provider: opts.usage.provider,
          model: opts.usage.model || null,
          inputTokens: opts.usage.inputTokens,
          outputTokens: opts.usage.outputTokens,
          estimated: opts.usage.estimated,
          ...(gigId ? { gigId } : {}),
        },
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    const balance = typeof json?.data?.tokens === 'number' ? json.data.tokens : undefined;
    if (res.status === 402) {
      return log({ billed: false, tokens: balance, charged: 0, reason: 'insufficient_tokens' }, tokensUsed);
    }
    if (!res.ok) {
      console.warn('[aiTokenBilling] charge failed', res.status, json);
      return log({ billed: false, charged: 0, reason: 'charge_failed' }, tokensUsed);
    }
    const billed = Boolean(json?.charged);
    return log(
      { billed, tokens: balance, charged: billed ? tokensUsed : 0, ...(billed ? {} : { reason: 'charge_failed' as const }) },
      tokensUsed
    );
  } catch (err) {
    console.warn('[aiTokenBilling] charge error:', err);
    return log({ billed: false, charged: 0, reason: 'charge_failed' }, tokensUsed);
  }
}

export function setAiUsageResponseHeaders(
  res: { setHeader: (k: string, v: string) => void },
  usage: AiTokenUsage,
  billed: boolean
) {
  res.setHeader('X-Ai-Tokens-Used', String(usage.totalTokens));
  res.setHeader('X-Ai-Tokens-Charged', billed ? '1' : '0');
  res.setHeader('X-Ai-Provider', usage.provider);
  if (usage.model) res.setHeader('X-Ai-Model', usage.model);
  res.setHeader('X-Ai-Tokens-Estimated', usage.estimated ? '1' : '0');
}
