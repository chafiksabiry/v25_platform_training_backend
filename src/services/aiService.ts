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

  async generateWithClaude(prompt: string, systemPrompt?: string): Promise<string> {
    // Force stable model to resolve production 404 error
    const model = 'claude-3-sonnet-20240229';

    try {
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4096'),
        system: systemPrompt || 'You are an expert training content creator.',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7')
      });

      const firstContent = response.content[0];
      if (firstContent.type === 'text') {
        return firstContent.text;
      }
      return '';
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw new Error('Failed to generate content with Claude');
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
