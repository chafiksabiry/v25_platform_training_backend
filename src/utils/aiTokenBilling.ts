/**
 * HARX prepaid AI tokens — normalize provider usage + charge orchestrator wallet.
 * Providers: Anthropic (Claude), OpenAI, Gemini/Vertex. Fallback: ~4 chars ≈ 1 token.
 */

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

export async function assertCompanyHasAiTokens(
  companyId: string | undefined | null,
  minRequired = 1
): Promise<{ ok: boolean; tokens: number; message?: string }> {
  const id = String(companyId || '').trim();
  if (!id) return { ok: true, tokens: 0 }; // no company → skip gate (legacy callers)
  try {
    const base = getOrchestratorApiBase();
    const res = await fetch(
      `${base}/tokens-company/${encodeURIComponent(id)}/check?min=${Math.max(1, minRequired)}`
    );
    const json: any = await res.json().catch(() => ({}));
    const tokens = typeof json?.data?.tokens === 'number' ? json.data.tokens : 0;
    if (!res.ok || json?.success === false) {
      return {
        ok: false,
        tokens,
        message: json?.message || 'Solde de tokens AI insuffisant. Rechargez pour continuer.',
      };
    }
    return { ok: true, tokens };
  } catch (err) {
    console.warn('[aiTokenBilling] assert check failed (allowing request):', err);
    return { ok: true, tokens: 0 };
  }
}

export async function chargeCompanyAiTokens(opts: {
  companyId?: string | null;
  usageId: string;
  usage: AiTokenUsage;
  tool: string;
  gigId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<{ billed: boolean; tokens?: number }> {
  const id = String(opts.companyId || '').trim();
  if (!id) return { billed: false };
  const tokensUsed = Math.max(0, Math.round(opts.usage.totalTokens || 0));
  if (tokensUsed <= 0) return { billed: false };

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
    if (res.status === 402) {
      console.warn('[aiTokenBilling] charge 402 insufficient_tokens', id, tokensUsed);
      return { billed: false, tokens: json?.data?.tokens };
    }
    if (!res.ok) {
      console.warn('[aiTokenBilling] charge failed', res.status, json);
      return { billed: false };
    }
    return {
      billed: Boolean(json?.charged),
      tokens: typeof json?.data?.tokens === 'number' ? json.data.tokens : undefined,
    };
  } catch (err) {
    console.warn('[aiTokenBilling] charge error:', err);
    return { billed: false };
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
