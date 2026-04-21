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

  /**
   * Generates an SVG image buffer using Claude only (no OpenAI image API).
   */
  static async generateImageBuffer(description: string, anthropicApiKey?: string): Promise<Buffer> {
    const scene = String(description || '').trim() || 'Training slide';
    const seed = this.hashSeed(scene).toString(16).slice(0, 8);
    const svgPrompt = [
      'Generate a valid standalone SVG for a 16:9 training slide.',
      'Output only raw SVG markup (no markdown, no prose).',
      'Use viewBox="0 0 1920 1080".',
      'Style: corporate PowerPoint slide, crisp vector style, modern clean look.',
      'Must include meaningful slide text (title + 4-6 bullet points) based on the provided scene.',
      'Use a different composition than previous slides (vary card placements and accent zones).',
      'Keep excellent contrast and readability.',
      'Do not include external images or fonts.',
      `Scene content: ${scene}`,
      `Variation key: ${seed}`,
    ].join('\n');
    let rawSvg = '';
    try {
      rawSvg = await aiService.generateWithClaude(
        svgPrompt,
        'You are an SVG designer. Return only valid SVG.',
        anthropicApiKey,
        2200,
        { temperature: 0.6, preferredModels: [String(process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5')] }
      );
    } catch (e: any) {
      throw new Error(`Claude SVG generation failed: ${String(e?.message || e)}`);
    }
    const svg = this.extractSvg(rawSvg);
    if (!svg) {
      throw new Error('Claude response does not contain a valid <svg>...</svg> block');
    }
    return Buffer.from(svg, 'utf-8');
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
