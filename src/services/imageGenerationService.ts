import aiService from './aiService';

export class ImageGenerationService {
  private static async buildClaudeVisualPrompt(seed: string, anthropicApiKey?: string): Promise<string> {
    const safeSeed = String(seed || '').trim() || 'professional training thumbnail';
    const userPrompt = [
      'Create ONE concise image-generation prompt for a professional training thumbnail.',
      'Return plain text only, no markdown, no quotes.',
      'Focus on realistic corporate learning scene, clean composition, modern lighting, no logos, no text overlay.',
      `Business context: ${safeSeed}`
    ].join('\n');

    const systemPrompt = [
      'You are a visual prompt engineer.',
      'Return a single high quality prompt suitable for image generation models.',
      'No extra commentary.'
    ].join(' ');

    try {
      const generated = await aiService.generateWithClaude(
        userPrompt,
        systemPrompt,
        anthropicApiKey,
        220,
        { temperature: 0.4 }
      );
      const normalized = String(generated || '')
        .replace(/^```[\s\S]*?\n?/g, '')
        .replace(/```$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return normalized || safeSeed;
    } catch {
      // Keep service resilient if Claude prompt-crafting fails.
      return safeSeed;
    }
  }

  private static extractSvg(raw: string): string | null {
    const txt = String(raw || '').trim();
    const match = txt.match(/<svg[\s\S]*<\/svg>/i);
    return match ? match[0] : null;
  }

  private static buildFallbackSvg(title: string, subtitle: string): string {
    const safeTitle = String(title || 'Training Slide').replace(/[<>&"]/g, '');
    const safeSubtitle = String(subtitle || '').replace(/[<>&"]/g, '');
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">',
      '<rect width="1920" height="1080" fill="#f8fbff"/>',
      '<rect x="0" y="0" width="1920" height="110" fill="#dceeff"/>',
      '<rect x="80" y="170" width="1760" height="810" rx="18" fill="#ffffff" stroke="#d7e3f4" stroke-width="4"/>',
      `<text x="120" y="280" font-size="64" font-family="Arial, sans-serif" fill="#0f4c81" font-weight="700">${safeTitle}</text>`,
      `<text x="120" y="350" font-size="34" font-family="Arial, sans-serif" fill="#244d70">${safeSubtitle}</text>`,
      '<line x1="120" y1="390" x2="1780" y2="390" stroke="#e7eef8" stroke-width="3"/>',
      '<rect x="120" y="430" width="760" height="470" rx="14" fill="#f6f9fe" stroke="#d9e6f7"/>',
      '<rect x="920" y="430" width="860" height="220" rx="14" fill="#f6f9fe" stroke="#d9e6f7"/>',
      '<rect x="920" y="680" width="860" height="220" rx="14" fill="#f6f9fe" stroke="#d9e6f7"/>',
      '</svg>',
    ].join('');
  }

  /**
   * Generates an SVG image buffer using Claude only (no OpenAI image API).
   */
  static async generateImageBuffer(description: string, anthropicApiKey?: string): Promise<Buffer> {
    const prompt = await this.buildClaudeVisualPrompt(description, anthropicApiKey);
    const svgPrompt = [
      'Generate a valid standalone SVG for a 16:9 training slide.',
      'Output only raw SVG markup (no markdown, no prose).',
      'Use viewBox="0 0 1920 1080".',
      'Style: corporate PowerPoint slide, light background, blue accents.',
      'Include title area and text-friendly layout blocks.',
      'Do not include external images or fonts.',
      `Slide intent: ${prompt}`,
    ].join('\n');
    try {
      const rawSvg = await aiService.generateWithClaude(
        svgPrompt,
        'You are an SVG designer. Return only valid SVG.',
        anthropicApiKey,
        1800,
        { temperature: 0.25, preferredModels: [String(process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5')] }
      );
      const svg = this.extractSvg(rawSvg);
      if (svg) return Buffer.from(svg, 'utf-8');
    } catch {
      // fallback below
    }
    return Buffer.from(this.buildFallbackSvg('Training slide', prompt.slice(0, 120)), 'utf-8');
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
