import jwt from 'jsonwebtoken';
import { knowledgeReadHeaders } from '../services/scriptModuleService';

describe('jeton de service vers le service de connaissance', () => {
  const saved = process.env.JWT_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = saved;
  });

  it('porte la portée kb-read, signée avec JWT_SECRET, et expire vite', () => {
    process.env.JWT_SECRET = 'test-secret';
    const { Authorization } = knowledgeReadHeaders();
    const decoded = jwt.verify(Authorization.replace(/^Bearer /, ''), 'test-secret') as jwt.JwtPayload;
    expect(decoded.scope).toBe('kb-read');
    expect((decoded.exp || 0) - (decoded.iat || 0)).toBeLessThanOrEqual(120);
  });

  it('sans JWT_SECRET, aucun jeton (pas de secret de repli)', () => {
    delete process.env.JWT_SECRET;
    expect(knowledgeReadHeaders()).toEqual({});
  });
});
