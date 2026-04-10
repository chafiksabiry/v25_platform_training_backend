import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import cloudinaryService from './cloudinaryService';

const ILLUSTRATIONS_FOLDER =
  process.env.CLOUDINARY_SLIDE_ILLUSTRATIONS_FOLDER || 'training/slide-illustrations';

/** URL de secours (CDN Unsplash directe) */
const STABLE_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80&auto=format&fit=crop';

type ImageMode = 'auto' | 'openai' | 'claude' | 'none';

function imageMode(): ImageMode {
  const p = (process.env.IMAGE_GENERATION_PROVIDER || '').toLowerCase().trim();
  if (p === 'openai' || p === 'dalle' || p === 'dall-e') return 'openai';
  if (p === 'claude' || p === 'claude_svg' || p === 'svg') return 'claude';
  if (p === 'none' || p === 'off') return 'none';
  return 'auto';
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function extractSvg(raw: string): string | null {
  const cleaned = raw
    .replace(/^```(?:svg|xml)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const m = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
  return m ? m[0].trim() : null;
}

export class ImageGenerationService {
  /**
   * Illustration pour une slide : upload Cloudinary quand possible.
   * - Claude ne sort pas de JPEG : on utilise soit DALL·E (OPENAI_API_KEY), soit un SVG produit par Claude puis hébergé.
   * - auto : DALL·E si clé OpenAI, sinon SVG Claude si ANTHROPIC_API_KEY, sinon image de secours.
   */
  static async generateImage(description: string): Promise<string> {
    if (!description?.trim()) {
      return STABLE_FALLBACK_IMAGE;
    }

    const mode = imageMode();
    if (mode === 'none') {
      return STABLE_FALLBACK_IMAGE;
    }

    try {
      let buffer: Buffer | null = null;

      if (mode !== 'claude' && process.env.OPENAI_API_KEY && (mode === 'openai' || mode === 'auto')) {
        const promptForPixels = await this.refinePromptWithClaude(description).catch(() => description);
        buffer = await this.generateViaOpenAI(promptForPixels);
      }

      if (!buffer && process.env.ANTHROPIC_API_KEY && (mode === 'claude' || mode === 'auto')) {
        buffer = await this.generateSvgWithClaude(description);
      }

      if (buffer && buffer.length > 80) {
        const publicId = `slide_${uuidv4().replace(/-/g, '')}`;
        try {
          const { url } = await cloudinaryService.uploadImageBuffer(buffer, ILLUSTRATIONS_FOLDER, publicId);
          console.log('[ImageGenerationService] Illustration uploaded to Cloudinary');
          return url;
        } catch (ce) {
          console.error('[ImageGenerationService] Cloudinary upload failed:', (ce as Error)?.message);
          const head = buffer.toString('utf8', 0, Math.min(buffer.length, 400));
          if (head.includes('<svg')) {
            return `data:image/svg+xml;base64,${buffer.toString('base64')}`;
          }
        }
      }
    } catch (e) {
      console.error('[ImageGenerationService]', (e as Error)?.message);
    }

    return STABLE_FALLBACK_IMAGE;
  }

  /** Raccourcit / clarifie le prompt pour DALL·E (anglais, style slide corporate). */
  private static async refinePromptWithClaude(description: string): Promise<string> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return truncate(description, 3900);

    const client = new Anthropic({ apiKey: key });
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
    const res = await client.messages.create({
      model,
      max_tokens: 400,
      system:
        'You compress image briefs into a single English DALL·E prompt: no text overlays, no logos, no real persons, corporate training slide illustration, clean professional look. Reply with the prompt only, no quotes.',
      messages: [{ role: 'user', content: truncate(description, 6000) }]
    });
    const block = res.content[0];
    const text = block.type === 'text' ? block.text.trim() : '';
    return text ? truncate(text, 3900) : truncate(description, 3900);
  }

  private static async generateViaOpenAI(description: string): Promise<Buffer | null> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;

    const model = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';
    const client = new OpenAI({ apiKey: key });
    const prompt = truncate(description, model.includes('dall-e-3') ? 3900 : 900);

    const res = await client.images.generate({
      model: model as 'dall-e-3' | 'dall-e-2',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json'
    });

    const b64 = res.data?.[0]?.b64_json;
    if (!b64) return null;
    return Buffer.from(b64, 'base64');
  }

  /** Illustration vectorielle (Claude) — pas de pixels, mais rendu fiable sans OpenAI. */
  private static async generateSvgWithClaude(description: string): Promise<Buffer | null> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;

    const client = new Anthropic({ apiKey: key });
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system:
        'You output ONLY a single valid SVG root element. No markdown, no commentary. viewBox="0 0 1200 675". Abstract corporate / training visual: gradients, simple shapes, optional very short title text (max 4 words). No external images, no script, no foreignObject.',
      messages: [
        {
          role: 'user',
          content: `Create an SVG illustration for this slide concept:\n\n${truncate(description, 4000)}`
        }
      ]
    });
    const block = res.content[0];
    const text = block.type === 'text' ? block.text : '';
    const svg = extractSvg(text);
    if (!svg) {
      console.warn('[ImageGenerationService] Claude did not return parseable SVG');
      return null;
    }
    return Buffer.from(svg, 'utf8');
  }
}
