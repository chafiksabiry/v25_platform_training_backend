import fs from 'fs';
import path from 'path';
import {
  assertCompanyHasAiTokens,
  chargeCompanyAiTokens,
  tokenGateErrorResponse,
  AiTokenUsage,
} from '../utils/aiTokenBilling';

const usage: AiTokenUsage = { provider: 'anthropic', model: 'm', inputTokens: 700, outputTokens: 300, totalTokens: 1000, estimated: false };
const jsonRes = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as any;

describe('jetons IA toujours prépayés (aucun premier gig gratuit)', () => {
  const realFetch = (global as any).fetch;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    process.env.COMPORCHESTRATOR_API_URL = 'https://orch.test/api';
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    (global as any).fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('solde suffisant → autorisé avec le VRAI solde, puis débit réel de l’usage', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { success: true, data: { tokens: 54321 } }));
    const gate = await assertCompanyHasAiTokens('c1', 1000);
    expect(gate).toEqual({ ok: true, tokens: 54321 });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://orch.test/api/tokens-company/c1/check?min=1000');

    fetchMock.mockResolvedValueOnce(jsonRes(200, { charged: true, data: { tokens: 53321 } }));
    const charge = await chargeCompanyAiTokens({ companyId: 'c1', usageId: 'u1', usage, tool: 'training.chat', gigId: 'g1' });
    expect(charge).toEqual({ billed: true, tokens: 53321, charged: 1000 });
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toBe('https://orch.test/api/tokens-company/charge-usage');
    expect(JSON.parse(init.body)).toMatchObject({ companyId: 'c1', usageId: 'u1', tokensUsed: 1000, tool: 'training.chat', gigId: 'g1' });
    expect(console.info).toHaveBeenCalledWith('[aiTokenBilling] charge', expect.objectContaining({ billed: true, charged: 1000, tokensUsed: 1000 }));
  });

  it('solde insuffisant → refus 402 avec le solde réel', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(402, { success: false, message: 'Solde insuffisant', data: { tokens: 12 } }));
    const gate = await assertCompanyHasAiTokens('c1', 5000);
    expect(gate).toMatchObject({ ok: false, code: 'insufficient_tokens', tokens: 12 });
    const denied = tokenGateErrorResponse(gate);
    expect(denied.status).toBe(402);
    expect(denied.body).toMatchObject({ success: false, error: 'insufficient_tokens', data: { tokens: 12 } });
  });

  it('solde réel 0 renvoyé tel quel (jamais un marqueur)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(402, { success: false, data: { tokens: 0 } }));
    const gate = await assertCompanyHasAiTokens('c1', 1);
    expect(gate.tokens).toBe(0);
    expect(gate.ok).toBe(false);
  });

  it.each([
    ['HTTP 500', () => fetchMock.mockResolvedValueOnce(jsonRes(500, {}))],
    ['HTTP 401', () => fetchMock.mockResolvedValueOnce(jsonRes(401, {}))],
    ['erreur réseau', () => fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))],
    ['réponse sans solde', () => fetchMock.mockResolvedValueOnce(jsonRes(200, { success: true, data: {} }))],
  ])('erreur orchestrateur (%s) → refus propre 503, pas de génération gratuite', async (_label, arrange) => {
    arrange();
    const gate = await assertCompanyHasAiTokens('c1', 1);
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('balance_unavailable');
    expect(gate.message).toMatch(/Impossible de vérifier/);
    expect(gate.tokens).toBeUndefined();
    expect(tokenGateErrorResponse(gate).status).toBe(503);
  });

  it('sans companyId → refus clair 400, aucun appel réseau', async () => {
    for (const id of [undefined, null, '', '  ']) {
      const gate = await assertCompanyHasAiTokens(id as any, 1);
      expect(gate).toMatchObject({ ok: false, code: 'company_required' });
      expect(tokenGateErrorResponse(gate).status).toBe(400);
    }
    const charge = await chargeCompanyAiTokens({ companyId: undefined, usageId: 'u', usage, tool: 't' });
    expect(charge).toMatchObject({ billed: false, charged: 0, reason: 'company_required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('plus aucun appel au service des gigs : un seul gig ne dispense plus du débit', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { success: true, data: { tokens: 10 } }));
    await assertCompanyHasAiTokens('c-un-seul-gig', 1);
    fetchMock.mockResolvedValueOnce(jsonRes(200, { charged: true, data: { tokens: 0 } }));
    const charge = await chargeCompanyAiTokens({ companyId: 'c-un-seul-gig', usageId: 'u', usage, tool: 't' });
    expect(charge.billed).toBe(true);
    for (const [url] of fetchMock.mock.calls) expect(String(url)).not.toMatch(/gigs|has-gigs/);
  });

  it('débit refusé (402) ou en échec → billed false journalisé avec la raison', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(402, { data: { tokens: 3 } }));
    expect(await chargeCompanyAiTokens({ companyId: 'c1', usageId: 'u', usage, tool: 't' })).toEqual({
      billed: false, tokens: 3, charged: 0, reason: 'insufficient_tokens',
    });
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect(await chargeCompanyAiTokens({ companyId: 'c1', usageId: 'u', usage, tool: 't' })).toMatchObject({
      billed: false, charged: 0, reason: 'charge_failed',
    });
    expect(console.info).toHaveBeenCalledWith('[aiTokenBilling] charge', expect.objectContaining({ billed: false }));
  });

  it('aucun usage → rien à débiter', async () => {
    const r = await chargeCompanyAiTokens({ companyId: 'c1', usageId: 'u', usage: { ...usage, totalTokens: 0 }, tool: 't' });
    expect(r).toMatchObject({ billed: false, charged: 0, reason: 'no_usage' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('plus aucune trace de firstGigFree / premier gig dans le code', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(full);
        return full.endsWith('.ts') ? [full] : [];
      });
    for (const f of walk(path.join(__dirname, '..'))) {
      const src = fs.readFileSync(f, 'utf8');
      expect({ f, hit: /firstGigFree|isFirstGigForCompany|skipIfFirstGig|skipCharge|has-gigs/.test(src) }).toEqual({ f, hit: false });
    }
  });
});
