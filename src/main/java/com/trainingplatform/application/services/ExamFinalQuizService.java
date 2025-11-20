package com.trainingplatform.application.services;

import com.trainingplatform.core.entities.ExamFinalQuiz;
import com.trainingplatform.infrastructure.repositories.ExamFinalQuizRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@Slf4j
@RequiredArgsConstructor
public class ExamFinalQuizService {
    
    private final ExamFinalQuizRepository quizRepository;
    
    /**
     * Create a new final exam quiz
     * MongoDB will automatically generate an ObjectId if _id is null
     */
    public ExamFinalQuiz createFinalExam(ExamFinalQuiz quiz) {
        // Don't set _id - let MongoDB generate ObjectId automatically
        // Only set _id if it's already set (for updates)
        if (quiz.get_id() == null || quiz.get_id().isEmpty()) {
            quiz.set_id(null); // Let MongoDB generate ObjectId
        }
        quiz.setCreatedAt(LocalDateTime.now());
        quiz.setUpdatedAt(LocalDateTime.now());
        
        // Set default settings if not provided
        if (quiz.getSettings() == null) {
            quiz.setSettings(ExamFinalQuiz.QuizSettings.builder()
                .shuffleQuestions(true)
                .shuffleOptions(true)
                .showCorrectAnswers(true)
                .allowReview(true)
                .showExplanations(true)
                .build());
        }
        
        log.info("Creating new final exam quiz: {} for training: {}", quiz.getTitle(), quiz.getTrainingId());
        return quizRepository.save(quiz);
    }
    
    /**
     * Get final exam by training ID
     */
    public ExamFinalQuiz getFinalExamByTraining(String trainingId) {
        List<ExamFinalQuiz> exams = quizRepository.findByTrainingId(trainingId);
        return exams.isEmpty() ? null : exams.get(0);
    }
    
    /**
     * Get final exam by journey ID
     */
    public ExamFinalQuiz getFinalExamByJourney(String journeyId) {
        return quizRepository.findFirstByJourneyId(journeyId).orElse(null);
    }
    
    /**
     * Get final exam by ID
     */
    public ExamFinalQuiz getFinalExamById(String id) {
        return quizRepository.findById(id).orElse(null);
    }
    
    /**
     * Update final exam
     */
    public ExamFinalQuiz updateFinalExam(ExamFinalQuiz quiz) {
        quiz.setUpdatedAt(LocalDateTime.now());
        return quizRepository.save(quiz);
    }
    
    /**
     * Delete final exam
     */
    public void deleteFinalExam(String id) {
        quizRepository.deleteById(id);
    }
    
    /**
     * Delete final exam by training ID
     */
    public void deleteFinalExamByTraining(String trainingId) {
        quizRepository.deleteByTrainingId(trainingId);
    }
    
    /**
     * Delete final exam by journey ID
     */
    public void deleteFinalExamByJourney(String journeyId) {
        quizRepository.deleteByJourneyId(journeyId);
    }
}

