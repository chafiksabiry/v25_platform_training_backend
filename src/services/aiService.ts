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

  public parseJson(raw: string, label: string = 'JSON'): any {
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/) || cleaned.match(/\[[\s\S]*\]/);
      if (!match) throw new Error(`Aucun JSON valide trouvé (${label})`);
      return JSON.parse(match[0]);
    } catch (e: any) {
      console.error(`❌ JSON Parsing Error (${label}):`, e.message);
      console.error(`📄 Raw content was:`, raw.slice(0, 500) + '...');
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

  async generateWithClaude(prompt: string, systemPrompt?: string, apiKey?: string): Promise<string> {
    const client = apiKey ? new Anthropic({ apiKey }) : this.anthropic;

    const modelsToTry = [
      process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-sonnet-20240620',
      'claude-3-haiku-20240307',
    ];

    let lastError: any;
    for (const model of modelsToTry) {
      try {
        console.log(`🤖 Attempting analysis with Claude model: ${model}${apiKey ? ' (using custom API key)' : ''}`);
        const maxTokens = parseInt(process.env.ANTHROPIC_MAX_TOKENS || '8192');
        const response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt || 'You are an expert training content creator.',
          messages: [{ role: 'user', content: prompt }],
          temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7')
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
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt || 'You are an expert training content creator.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      });

      console.log('✅ Analysis successful with OpenAI fallback');
      return response.choices[0]?.message?.content || '';
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
