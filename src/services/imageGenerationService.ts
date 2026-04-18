import axios from 'axios';
import OpenAI from 'openai';
import aiService from './aiService';

export class ImageGenerationService {
  private static openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

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

  /**
   * Generates an AI image buffer that can be uploaded to Cloudinary.
   * Prompt is first refined with Claude to improve visual relevance.
   */
  static async generateImageBuffer(description: string, anthropicApiKey?: string): Promise<Buffer> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is missing; cannot generate AI thumbnail.');
    }

    const prompt = await this.buildClaudeVisualPrompt(description, anthropicApiKey);
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    const size = process.env.OPENAI_IMAGE_SIZE || '1024x1024';

    const response: any = await this.openai.images.generate({
      model,
      prompt,
      size,
      quality: 'medium'
    } as any);

    const first = response?.data?.[0];
    const b64 = first?.b64_json;
    if (b64) return Buffer.from(b64, 'base64');

    const imageUrl = String(first?.url || '').trim();
    if (imageUrl) {
      const imageResponse = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 20000
      });
      return Buffer.from(imageResponse.data);
    }

    throw new Error('Image model returned no binary data and no URL.');
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
