import Gig from '../models/Gig';
import TrainingJourney, { ITrainingJourney } from '../models/TrainingJourney';
import aiService from './aiService';
import { AppError } from '../middleware/errorHandler';

class GigTrainingGeneratorService {
  async generateTrainingFromGig(gigId: string): Promise<ITrainingJourney> {
    const gig = await Gig.findById(gigId);
    if (!gig) {
      throw new AppError('Gig not found', 404);
    }

    const programPrompt = `
      Generate a comprehensive training program for a professional gig with the following details:
      Title: ${gig.title}
      Description: ${gig.description}
      Industry: ${gig.industry}

      The output MUST be a JSON object that matches this structure:
      {
        "name": "Program Name",
        "title": "Program Title",
        "description": "Program Description",
        "estimatedDuration": "X hours",
        "targetRoles": ["Role 1", "Role 2"],
        "modules": [
          {
            "title": "Module Title",
            "description": "Module Description",
            "duration": 60,
            "difficulty": "beginner",
            "learningObjectives": ["Obj 1", "Obj 2"],
            "topics": ["Topic 1", "Topic 2"],
            "sections": [
              {
                "title": "Section Title",
                "content": "Comprehensive markdown content for this section.",
                "type": "text",
                "duration": 20
              }
            ],
            "quizzes": [
              {
                "title": "Quiz Title",
                "questions": [
                  {
                    "question": "Question text?",
                    "options": ["Opt 1", "Opt 2", "Opt 3", "Opt 4"],
                    "correctAnswer": 0,
                    "explanation": "Why this is correct"
                  }
                ],
                "passingScore": 70
              }
            ]
          }
        ]
      }
      
      Return ONLY the JSON object.
    `;

    const presentationPrompt = `
      Generate a training presentation (slides) for the training program of this gig:
      Title: ${gig.title}
      Description: ${gig.description}

      The output MUST be a JSON object representing slides:
      {
        "slides": [
          {
            "title": "Slide Title",
            "content": "Slide content (bullet points or brief text)",
            "speakerNotes": "Notes for the trainer"
          }
        ]
      }
      
      Return ONLY the JSON object.
    `;

    try {
      // Generate Program
      const programRaw = await aiService.generateWithClaude(programPrompt, "You are an expert training architect. Return only valid JSON.");
      const programData = JSON.parse(this.cleanJsonResponse(programRaw));

      // Generate Presentation
      const presentationRaw = await aiService.generateWithClaude(presentationPrompt, "You are an expert presentation designer. Return only valid JSON.");
      const presentationData = JSON.parse(this.cleanJsonResponse(presentationRaw));

      // Create the journey
      const journeyData: Partial<ITrainingJourney> = {
        ...programData,
        companyId: gig.companyId,
        gigId: gig._id,
        industry: gig.industry,
        status: 'draft',
        methodologyData: {
          presentation: presentationData.slides,
          generatedAt: new Date()
        }
      };

      const journey = await TrainingJourney.create(journeyData);
      return journey;
    } catch (error) {
      console.error('Generation error:', error);
      throw new AppError('Failed to generate training content from Gig', 500);
    }
  }

  private cleanJsonResponse(raw: string): string {
    // Remove markdown code blocks if present
    return raw.replace(/```json\n?/, '').replace(/```\n?/, '').trim();
  }
}

export default new GigTrainingGeneratorService();
