import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

class AIService {
  private openai: OpenAI;
  private anthropic: Anthropic;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || ''
    });
  }

  /** Extrait le premier objet ou tableau JSON équilibré (évite lastIndexOf sur ] internes ex. visualElements). */
  private extractBalancedJsonFragment(s: string, open: '{' | '['): string | null {
    const start = s.indexOf(open);
    if (start === -1) return null;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (inString) {
        if (c === '\\') escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
    return null;
  }

  /**
   * LLM outputs sometimes include invalid JSON escapes inside strings (e.g. \').
   * This normalizes those sequences so JSON.parse can succeed.
   */
  private normalizeInvalidJsonEscapes(input: string): string {
    let out = '';
    let inString = false;
    let i = 0;

    while (i < input.length) {
      const c = input[i];

      if (c === '"' && (i === 0 || input[i - 1] !== '\\')) {
        inString = !inString;
        out += c;
        i += 1;
        continue;
      }

      if (inString && c === '\\') {
        const n = input[i + 1];
        if (!n) {
          out += c;
          i += 1;
          continue;
        }

        const validSimpleEscapes = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
        if (!validSimpleEscapes.has(n)) {
          // Common invalid pattern from models: \' -> '
          if (n === "'") {
            i += 1; // drop backslash, keep apostrophe on next iteration
            continue;
          }
          // Preserve literal backslash safely by escaping it.
          out += '\\\\';
          i += 1;
          continue;
        }
      }

      out += c;
      i += 1;
    }

    return out;
  }

  public parseJson(raw: string, label: string = 'JSON'): any {
    try {
      let cleaned = raw.trim();

      // Strip markdown fences (models often wrap JSON in ```json ... ```)
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
        const fenceEnd = cleaned.lastIndexOf('```');
        if (fenceEnd !== -1) cleaned = cleaned.slice(0, fenceEnd).trimEnd();
      }
      cleaned = cleaned
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      // Supprimer tout préambule (# titre, prose…) avant le premier { ou [
      const braceOrBracket = cleaned.search(/[\{\[]/);
      if (braceOrBracket > 0) cleaned = cleaned.slice(braceOrBracket);

      const firstObject = cleaned.indexOf('{');
      const firstArray = cleaned.indexOf('[');
      const hasObject = firstObject !== -1;
      const hasArray = firstArray !== -1;
      if (!hasObject && !hasArray) throw new Error(`Aucun JSON valide trouvé (${label})`);

      let jsonString = '';
      if (hasArray && (!hasObject || firstArray < firstObject)) {
        const balanced = this.extractBalancedJsonFragment(cleaned, '[');
        if (!balanced) throw new Error(`JSON array tronqué ou mal formé (${label})`);
        jsonString = balanced;
      } else {
        const balanced = this.extractBalancedJsonFragment(cleaned, '{');
        if (balanced) {
          jsonString = balanced;
        } else {
          // Some models return a JSON object encoded as a quoted string:
          // "{\"key\":\"value\"}". In that case, decode once then parse again.
          const quotedObjectStart = cleaned.indexOf('"{');
          const quotedArrayStart = cleaned.indexOf('"[');
          const quotedStartCandidates = [quotedObjectStart, quotedArrayStart].filter((v) => v !== -1);
          if (quotedStartCandidates.length === 0) {
            throw new Error(`JSON object tronqué ou mal formé (${label})`);
          }
          const quotedStart = Math.min(...quotedStartCandidates);
          const quotedEnd = cleaned.lastIndexOf('"');
          if (quotedEnd <= quotedStart) {
            throw new Error(`JSON stringifié tronqué ou mal formé (${label})`);
          }
          const quotedJson = cleaned.slice(quotedStart, quotedEnd + 1);
          const decoded = JSON.parse(quotedJson);
          if (typeof decoded !== 'string') {
            throw new Error(`Format JSON stringifié inattendu (${label})`);
          }
          jsonString = decoded.trim();
        }
      }
      
      // 1. Remove JS-style comments
      jsonString = jsonString
        .replace(/\/\*[\s\S]*?\*\//g, '') // remove multi-line comments
        .replace(/\/\/.*$/gm, '');        // remove single-line comments

      // 2. Remove trailing commas in arrays and objects
      // This regex looks for a comma followed by optional whitespace and a closing bracket or brace
      jsonString = jsonString.replace(/,(\s*[\]\}])/g, '$1');

      // 3. Fix potential unescaped newlines in strings (common in LLM outputs)
      // This is a bit risky but often necessary for large content blocks
      // We only do this if standard parsing fails initially
      try {
        const normalizedJson = this.normalizeInvalidJsonEscapes(jsonString);
        const parsed = JSON.parse(normalizedJson);
        // If the model returned a JSON payload as a JSON string, parse one more time.
        if (typeof parsed === 'string') {
          const nested = parsed.trim();
          if (
            (nested.startsWith('{') && nested.endsWith('}')) ||
            (nested.startsWith('[') && nested.endsWith(']'))
          ) {
            return JSON.parse(nested);
          }
        }
        return parsed;
      } catch (firstError) {
        // Some models return over-escaped JSON blocks like \"key\": \"value\"
        try {
          const unescapedQuotes = jsonString.replace(/\\"/g, '"');
          return JSON.parse(unescapedQuotes);
        } catch (_escapedError) {
          // Continue to newline-escape fallback
        }

        // Try one more aggressive cleanup: remove actual newlines inside strings
        // This is complex, so we'll just try to escape them if they look like they're inside quotes
        const escapedJson = jsonString.replace(/(?<=[:\s])"([\s\S]*?)"(?=[,\s\}\]])/g, (m, p1) => {
          return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
        });
        return JSON.parse(escapedJson);
      }
    } catch (e: any) {
      console.error(`❌ JSON Parsing Error (${label}):`, e.message);
      console.error(`📄 Raw content was:`, raw.slice(0, 1000) + (raw.length > 1000 ? '...' : ''));
      throw new Error(`Failed to parse AI response: ${e.message}`);
    }
  }

  async generateTrainingContent(prompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert training content creator. Generate comprehensive, engaging, and educational training materials.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000')
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate training content');
    }
  }

  async generateWithClaude(
    prompt: string,
    systemPrompt?: string,
    apiKey?: string,
    maxTokensOverride?: number,
    options?: { temperature?: number; preferredModels?: string[] }
  ): Promise<string> {
    const client = apiKey ? new Anthropic({ apiKey }) : this.anthropic;

    const defaultChain = [
      process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-sonnet-20240620',
      'claude-3-haiku-20240307',
    ];
    const preferred = (options?.preferredModels || []).filter(Boolean);
    const modelsToTry = [...new Set([...preferred, ...defaultChain])];

    const temperature =
      options?.temperature != null
        ? options.temperature
        : parseFloat(process.env.OPENAI_TEMPERATURE || '0.7');

    let lastError: any;
    for (const model of modelsToTry) {
      try {
        console.log(`🤖 Attempting analysis with Claude model: ${model}${apiKey ? ' (using custom API key)' : ''}`);
        const envMaxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '8192', 10);
        const maxTokens =
          maxTokensOverride != null
            ? maxTokensOverride
            : Math.max(envMaxTokens, 8192);
        
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt || 'You are an expert training content creator.',
          messages: [{ role: 'user', content: prompt }],
          temperature
        }, {
          headers: { 'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15' }
        });


        const firstContent = response.content[0];
        if (firstContent.type === 'text') {
          console.log(`✅ Analysis successful with Claude model: ${model}`);
          if (response.stop_reason === 'max_tokens') {
            console.warn(`⚠️ Claude response TRUNCATED due to max_tokens (${model})`);
          }
          return firstContent.text;
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`⚠️ Claude model ${model} failed: ${error.message}`);
        // If it's not a 404/401/403, we might want to stop, but for now we follow the waterfall
      }
    }

    // FINAL FALLBACK: OpenAI
    console.log('🔄 All Claude models failed. Falling back to OpenAI...');
    try {
      const isJsonRequested = prompt.toLowerCase().includes('json') || (systemPrompt || '').toLowerCase().includes('json');
      const model = process.env.OPENAI_MODEL || 'gpt-4o';
      const basePayload: any = {
        model,
        messages: [
          { role: 'system', content: systemPrompt || 'You are an expert training content creator.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      };

      try {
        const response = await this.openai.chat.completions.create({
          ...basePayload,
          response_format: isJsonRequested ? { type: 'json_object' } : undefined
        });
        console.log('✅ Analysis successful with OpenAI fallback');
        return response.choices[0]?.message?.content || '';
      } catch (openAiErr: any) {
        const message = String(openAiErr?.message || '');
        const unsupportedResponseFormat =
          message.includes("Invalid parameter: 'response_format'") ||
          message.includes('response_format') ||
          openAiErr?.param === 'response_format';

        if (!unsupportedResponseFormat) throw openAiErr;

        console.warn('⚠️ OpenAI model does not support response_format=json_object. Retrying without response_format...');
        const retryResponse = await this.openai.chat.completions.create(basePayload);
        console.log('✅ Analysis successful with OpenAI fallback (without response_format)');
        return retryResponse.choices[0]?.message?.content || '';
      }
    } catch (openaiError: any) {
      console.error('❌ ALL AI models failed (Claude & OpenAI):', openaiError);
      throw new Error(`AI Analysis failed: ${lastError?.message || openaiError.message}`);
    }
  }

  async generateQuiz(topic: string, numberOfQuestions: number = 5): Promise<any> {
    const prompt = `Generate ${numberOfQuestions} multiple choice quiz questions about ${topic}.
    Return a JSON array with this structure:
    [
      {
        "question": "Question text",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswer": 0,
        "explanation": "Explanation of the correct answer"
      }
    ]`;

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a quiz generator. Return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
      });

      const content = response.choices[0]?.message?.content || '[]';
      return JSON.parse(content);
    } catch (error) {
      console.error('Quiz generation error:', error);
      throw new Error('Failed to generate quiz');
    }
  }

  async analyzeUserProgress(progressData: any): Promise<string> {
    const prompt = `Analyze this user's training progress and provide personalized recommendations:
    ${JSON.stringify(progressData)}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a training coach. Provide helpful, constructive feedback.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Progress analysis error:', error);
      throw new Error('Failed to analyze user progress');
    }
  }
}

export default new AIService();
