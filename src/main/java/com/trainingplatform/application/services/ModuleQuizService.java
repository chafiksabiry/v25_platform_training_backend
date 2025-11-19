package com.trainingplatform.application.services;

import com.trainingplatform.core.entities.ModuleQuiz;
import com.trainingplatform.infrastructure.repositories.ModuleQuizRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class ModuleQuizService {
    
    private final ModuleQuizRepository quizRepository;
    
    /**
     * Create a new module quiz
     */
    public ModuleQuiz createQuiz(ModuleQuiz quiz) {
        quiz.set_id(UUID.randomUUID().toString());
        quiz.setCreatedAt(LocalDateTime.now());
        quiz.setUpdatedAt(LocalDateTime.now());
        
        // Set default settings if not provided
        if (quiz.getSettings() == null) {
            quiz.setSettings(ModuleQuiz.QuizSettings.builder()
                .shuffleQuestions(false)
                .shuffleOptions(false)
                .showCorrectAnswers(true)
                .allowReview(true)
                .showExplanations(true)
                .build());
        }
        
        log.info("Creating new module quiz: {} for module: {}", quiz.getTitle(), quiz.getModuleId());
        return quizRepository.save(quiz);
    }
    
    /**
     * Get all quizzes for a module
     */
    public List<ModuleQuiz> getQuizzesByModule(String moduleId) {
        return quizRepository.findByModuleId(moduleId);
    }
    
    /**
     * Get all quizzes for a training
     */
    public List<ModuleQuiz> getQuizzesByTraining(String trainingId) {
        return quizRepository.findByTrainingId(trainingId);
    }
    
    /**
     * Get quiz by ID
     */
    public ModuleQuiz getQuizById(String id) {
        return quizRepository.findById(id).orElse(null);
    }
    
    /**
     * Update quiz
     */
    public ModuleQuiz updateQuiz(ModuleQuiz quiz) {
        quiz.setUpdatedAt(LocalDateTime.now());
        return quizRepository.save(quiz);
    }
    
    /**
     * Delete quiz
     */
    public void deleteQuiz(String id) {
        quizRepository.deleteById(id);
    }
    
    /**
     * Delete all quizzes for a module
     */
    public void deleteQuizzesByModule(String moduleId) {
        quizRepository.deleteByModuleId(moduleId);
    }
    
    /**
     * Delete all quizzes for a training
     */
    public void deleteQuizzesByTraining(String trainingId) {
        quizRepository.deleteByTrainingId(trainingId);
    }
}

