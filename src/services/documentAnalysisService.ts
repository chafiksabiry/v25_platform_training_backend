import documentParserService from './documentParserService';
import aiService from './aiService';
import { AppError } from '../middleware/errorHandler';

interface DocumentAnalysisResult {
  extractedContent: {
    text: string;
    keyTopics: string[];
    complexity: number;
  };
  aiAnalysis: {
    readabilityScore: number;
    keyConceptsExtracted: string[];
    suggestedLearningObjectives: string[];
    recommendedModuleStructure: string[];
    contentGaps: string[];
    engagementScore: number;
    improvementSuggestions: Array<{
      type: 'media' | 'interactivity' | 'content' | 'assessment';
      priority: 'low' | 'medium' | 'high' | 'critical';
      suggestion: string;
      implementation: string;
      expectedImpact: string;
    }>;
    mediaRecommendations: Array<{
      type: 'video' | 'audio' | 'image' | 'infographic';
      purpose: string;
      description: string;
      priority: number;
    }>;
  };
}

class DocumentAnalysisService {
  async analyzeDocument(filePath: string, fileType: string): Promise<DocumentAnalysisResult> {
    try {
      const text = await documentParserService.parseDocument(filePath, fileType);
      
      const analysisPrompt = `
        Analyze the following text extracted from a training document and provide a comprehensive training analysis.
        Text: ${text.substring(0, 15000)} // Limit text size for stability
        
        The output MUST be a JSON object that matches this structure:
        {
          "readabilityScore": 85,
          "keyConceptsExtracted": ["Concept A", "Concept B"],
          "suggestedLearningObjectives": ["Objective 1", "Objective 2"],
          "recommendedModuleStructure": ["Module 1", "Module 2"],
          "contentGaps": ["Gap 1"],
          "engagementScore": 75,
          "improvementSuggestions": [
            {
              "type": "media",
              "priority": "high",
              "suggestion": "...",
              "implementation": "...",
              "expectedImpact": "..."
            }
          ],
          "mediaRecommendations": [
            {
              "type": "video",
              "purpose": "...",
              "description": "...",
              "priority": 8
            }
          ]
        }
        
        Return ONLY the JSON object.
      `;

      const aiResponse = await aiService.generateWithClaude(
        analysisPrompt,
        "You are an expert training analyst. Return only valid JSON."
      );

      const aiAnalysisRaw = JSON.parse(this.cleanJsonResponse(aiResponse));
      
      // Ensure all required fields exist with defaults to prevent UI crashes
      const aiAnalysis = {
        readabilityScore: aiAnalysisRaw.readabilityScore || 0,
        keyConceptsExtracted: aiAnalysisRaw.keyConceptsExtracted || [],
        suggestedLearningObjectives: aiAnalysisRaw.suggestedLearningObjectives || [],
        recommendedModuleStructure: aiAnalysisRaw.recommendedModuleStructure || [],
        contentGaps: aiAnalysisRaw.contentGaps || [],
        engagementScore: aiAnalysisRaw.engagementScore || 0,
        improvementSuggestions: aiAnalysisRaw.improvementSuggestions || [],
        mediaRecommendations: aiAnalysisRaw.mediaRecommendations || []
      };

      return {
        extractedContent: {
          text: text.substring(0, 5000), // Return a sample for the UI
          keyTopics: aiAnalysis.keyConceptsExtracted.slice(0, 5),
          complexity: aiAnalysisRaw.complexity || 5
        },
        aiAnalysis
      };
    } catch (error) {
      console.error('Document analysis error:', error);
      throw new AppError('Failed to analyze document', 500);
    }
  }

  async generateTrainingProgram(analysis: any): Promise<any> {
    const prompt = `
      Based on this analysis of a training document, generate a full training program structure.
      Analysis: ${JSON.stringify(analysis)}
      
      The output MUST be a JSON object that matches this structure:
      {
        "title": "Program Title",
        "description": "Program Description",
        "modules": [
          {
            "title": "Module Title",
            "description": "Module Description",
            "duration": 60,
            "difficulty": "beginner",
            "learningObjectives": ["Obj 1"],
            "topics": ["Topic 1"],
            "sections": [
              {
                "title": "Section Title",
                "content": "Full markdown content...",
                "type": "text",
                "duration": 20
              }
            ],
            "quizzes": [
              {
                "title": "Quiz",
                "questions": [
                  {
                    "question": "Question?",
                    "options": ["A", "B"],
                    "correctAnswer": 0,
                    "explanation": "..."
                  }
                ]
              }
            ]
          }
        ]
      }
      
      Return ONLY the JSON object.
    `;

    const response = await aiService.generateWithClaude(prompt, "You are a curriculum designer. Return only valid JSON.");
    const programRaw = JSON.parse(this.cleanJsonResponse(response));
    
    // Ensure nested structures exist
    return {
      title: programRaw.title || 'Training Program',
      description: programRaw.description || '',
      modules: (programRaw.modules || []).map((m: any) => ({
        ...m,
        learningObjectives: m.learningObjectives || [],
        topics: m.topics || [],
        sections: m.sections || [],
        quizzes: (m.quizzes || []).map((q: any) => ({
          ...q,
          questions: q.questions || []
        }))
      }))
    };
  }

  async generatePresentation(program: any): Promise<any> {
    const prompt = `
      Create a presentation slides deck for this training program:
      Program: ${JSON.stringify(program)}
      
      The output MUST be a JSON object:
      {
        "slides": [
          {
            "title": "Title",
            "content": "Bullet points",
            "speakerNotes": "Notes"
          }
        ]
      }
    `;

    const response = await aiService.generateWithClaude(prompt, "You are a presentation expert. Return only valid JSON.");
    const presentationRaw = JSON.parse(this.cleanJsonResponse(response));
    return {
      slides: (presentationRaw.slides || []).map((s: any) => ({
        title: s.title || 'Slide',
        content: s.content || '',
        speakerNotes: s.speakerNotes || ''
      }))
    };
  }

  private cleanJsonResponse(raw: string): string {
    try {
      // Find the first { and last } to extract JSON even if AI adds conversational text
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        return raw.substring(start, end + 1);
      }
      return raw.replace(/```json\n?/, '').replace(/```\n?/, '').trim();
    } catch (e) {
      return raw.trim();
    }
  }
}

export default new DocumentAnalysisService();
