import aiService from './aiService';

export class ImageGenerationService {
  private static hashSeed(input: string): number {
    const txt = String(input || '');
    let h = 2166136261;
    for (let i = 0; i < txt.length; i += 1) {
      h ^= txt.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
  }

  private static extractSvg(raw: string): string | null {
    const txt = String(raw || '').trim();
    const match = txt.match(/<svg[\s\S]*<\/svg>/i);
    return match ? match[0] : null;
  }

  private static escapeXml(txt: string): string {
    return String(txt || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private static pickBulletsFromPrompt(prompt: string, maxBullets = 4): string[] {
    const src = String(prompt || '');
    const afterSource = src.match(/Source thread[\s\S]*?:\s*([\s\S]*)$/i);
    const working = (afterSource?.[1] || src).trim();
    const normalized = working
      .replace(/\r/g, '\n')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/(^|\s)[#*_`]+/g, ' ')
      .replace(/\s{2,}/g, ' ');

    const raw = normalized
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^\[(COVER|AGENDA|CONTENT|CONCLUSION)\]/i.test(l))
      .filter((l) => !/^source thread/i.test(l))
      .filter((l) => !/^agenda items derived/i.test(l))
      .filter((l) => !/derive visible title/i.test(l))
      .filter((l) => !/training overview/i.test(l))
      .filter((l) => !/closing summary grounded/i.test(l))
      .map((l) => l.replace(/^[-•*]\s+/, '').replace(/^\d+[.)]\s+/, '').replace(/^(User|Assistant)\s*:\s*/i, '').trim())
      .filter((l) => l.length > 18 && l.length < 180);
    const dedup: string[] = [];
    for (const line of raw) {
      if (!dedup.includes(line)) dedup.push(line);
      if (dedup.length >= maxBullets) break;
    }
    if (dedup.length > 0) return dedup;
    return [
      'Comprendre les points cles du module',
      'Appliquer les bonnes pratiques sur le terrain',
      'Identifier les erreurs frequentes a eviter',
      'Retenir une checklist actionnable',
    ].slice(0, maxBullets);
  }

  /**
   * Deterministic non-AI slide renderer (SVG template).
   * This avoids image-model variability and keeps text readable.
   */
  static generateTemplateSlideBuffer(params: {
    title: string;
    prompt: string;
    trainingTitle?: string;
    language?: string;
    index?: number;
    total?: number;
  }): Buffer {
    const title = String(params.title || 'Slide')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/^#+\s*/, '')
      .replace(/[*_`#]+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 92);
    const trainingTitle = String(params.trainingTitle || 'Formation').slice(0, 100);
    const bullets = this.pickBulletsFromPrompt(params.prompt, 4);
    const lines = bullets.map((b) => this.escapeXml(b.slice(0, 115)));
    const footer = `${trainingTitle} | Slide ${Math.max(1, Number(params.index || 1))}/${Math.max(1, Number(params.total || 1))}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect width="1920" height="1080" fill="#f8fafc"/>
  <rect x="0" y="0" width="1920" height="132" fill="#b00020"/>
  <text x="960" y="82" text-anchor="middle" fill="#ffffff" font-size="56" font-family="Arial, Helvetica, sans-serif" font-weight="700">${this.escapeXml(title)}</text>
  <rect x="120" y="188" width="1680" height="760" rx="18" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <g font-family="Arial, Helvetica, sans-serif" fill="#0f172a">
    ${lines
      .map(
        (l, i) =>
          `<circle cx="190" cy="${290 + i * 150}" r="10" fill="#b00020"/><text x="220" y="${300 + i * 150}" font-size="38" font-weight="600">${l}</text>`
      )
      .join('')}
  </g>
  <text x="960" y="1028" text-anchor="middle" fill="#64748b" font-size="24" font-family="Arial, Helvetica, sans-serif">${this.escapeXml(
    footer
  )}</text>
</svg>`;
    return Buffer.from(svg, 'utf-8');
  }

  /**
   * Generates an SVG image buffer using Claude only (no OpenAI image API).
  */
  static async generateImageBuffer(
    description: string,
    anthropicApiKey?: string,
    mode: 'slide' | 'thumbnail' = 'slide'
  ): Promise<Buffer> {
    const scene = String(description || '').trim() || 'Training slide';
    const seed = this.hashSeed(scene).toString(16).slice(0, 8);
    const baseRules = mode === 'thumbnail'
      ? [
          'Generate a valid standalone SVG for a 16:9 training thumbnail/cover image.',
          'Output only raw SVG markup (no markdown, no prose).',
          'Use viewBox="0 0 1920 1080".',
          'Return compact SVG under 12000 characters.',
          'Style: premium corporate cover image, modern clean illustration.',
          'DO NOT create slide layout. DO NOT include title text. DO NOT include bullet points.',
          'Focus on a single visual concept with strong composition and high contrast.',
          'Prefer abstract/product/industry illustration with simple geometric shapes.',
          'Do not include external images or fonts.',
          `Scene content: ${scene}`,
          `Variation key: ${seed}`,
        ].join('\n')
      : [
          'Generate a valid standalone SVG for a 16:9 training slide.',
          'Output only raw SVG markup (no markdown, no prose).',
          'Use viewBox="0 0 1920 1080".',
          'Return compact SVG under 12000 characters.',
          'Style: corporate PowerPoint slide, crisp vector style, modern clean look.',
          'Layout: keep all text inside x=80..1840 (max width ~1760). Title near y=72–140. Bullet block y=200–980 with generous line spacing (1.35em+).',
          'Must include readable title + 3-4 bullet points from the scene; shorten phrasing so NO text is clipped at right or bottom edges.',
          'If a callout/checklist box is used, place it fully below the bullet block with at least 48px vertical gap—never overlap bullets.',
          'Prefer explicit line breaks using multiple <tspan x="..." dy="..."> lines per bullet when a line would exceed ~72 characters.',
          'Keep excellent contrast and readability.',
          'Do not include external images or fonts.',
          `Scene content: ${scene}`,
          `Variation key: ${seed}`,
        ].join('\n');
    const retryRules = [
      baseRules,
      'Retry mode: use simpler layout with fewer shapes.',
      'Retry mode: avoid gradients and keep XML minimal.',
    ].join('\n');
    const prompts = [baseRules, retryRules];
    let lastError = '';
    for (let i = 0; i < prompts.length; i += 1) {
      try {
        const rawSvg = await aiService.generateWithClaude(
          prompts[i],
          'You are an SVG designer. Return only valid SVG.',
          anthropicApiKey,
          7000,
          { temperature: 0.45, preferredModels: [String(process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5')] }
        );
        const svg = this.extractSvg(rawSvg);
        if (svg) return Buffer.from(svg, 'utf-8');
        lastError = 'Claude response does not contain a valid <svg>...</svg> block';
      } catch (e: any) {
        lastError = `Claude SVG generation failed: ${String(e?.message || e)}`;
      }
    }
    throw new Error(lastError || 'Claude SVG generation failed');
  }

  // Backward compatibility for existing journey/module illustration flows.
  static async generateImage(description: string): Promise<string> {
    const rawSeed = (description || 'professional training thumbnail')
      .split(' ')
      .filter(word => word.length > 3)
      .slice(0, 6)
      .join('-')
      .toLowerCase();
    const safeSeed = rawSeed.replace(/[^a-z0-9-]/g, '') || `training-${Date.now()}`;
    return `https://picsum.photos/seed/${encodeURIComponent(safeSeed)}/1200/800`;
  }
}
