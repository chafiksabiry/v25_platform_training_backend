package com.trainingplatform.application.services;

import com.trainingplatform.core.entities.ManualQuiz;
import com.trainingplatform.core.entities.TrainingProgress;
import com.trainingplatform.infrastructure.repositories.ManualQuizRepository;
import com.trainingplatform.infrastructure.repositories.TrainingProgressRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class ManualQuizService {
    
    private final ManualQuizRepository quizRepository;
    private final TrainingProgressRepository progressRepository;
    
    /**
     * Create a new quiz
     */
    public ManualQuiz createQuiz(ManualQuiz quiz) {
        quiz.setId(UUID.randomUUID().toString());
        quiz.setCreatedAt(LocalDateTime.now());
        quiz.setUpdatedAt(LocalDateTime.now());
        
        // Set default settings if not provided
        if (quiz.getSettings() == null) {
            quiz.setSettings(ManualQuiz.QuizSettings.builder()
                .shuffleQuestions(false)
                .shuffleOptions(false)
                .showCorrectAnswers(true)
                .allowReview(true)
                .showExplanations(true)
                .build());
        }
        
        log.info("Creating new quiz: {} for module: {}", quiz.getTitle(), quiz.getModuleId());
        return quizRepository.save(quiz);
    }
    
    /**
     * Get all quizzes for a module
     */
    public List<ManualQuiz> getQuizzesByModule(String moduleId) {
        return quizRepository.findByModuleId(moduleId);
    }
    
    /**
     * Get all quizzes for a training
     */
    public List<ManualQuiz> getQuizzesByTraining(String trainingId) {
        return quizRepository.findByTrainingId(trainingId);
    }
    
    /**
     * Get quiz by ID
     */
    public ManualQuiz getQuizById(String id) {
        return quizRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Quiz not found: " + id));
    }
    
    /**
     * Update quiz
     */
    public ManualQuiz updateQuiz(String id, ManualQuiz quiz) {
        ManualQuiz existing = getQuizById(id);
        
        existing.setTitle(quiz.getTitle());
        existing.setDescription(quiz.getDescription());
        existing.setQuestions(quiz.getQuestions());
        existing.setPassingScore(quiz.getPassingScore());
        existing.setTimeLimit(quiz.getTimeLimit());
        existing.setMaxAttempts(quiz.getMaxAttempts());
        existing.setSettings(quiz.getSettings());
        existing.setUpdatedAt(LocalDateTime.now());
        
        log.info("Updating quiz: {}", id);
        return quizRepository.save(existing);
    }
    
    /**
     * Add question to quiz
     */
    public ManualQuiz addQuestion(String quizId, ManualQuiz.QuizQuestion question) {
        ManualQuiz quiz = getQuizById(quizId);
        
        question.setId(UUID.randomUUID().toString());
        
        // Set order index if not provided
        if (question.getOrderIndex() == null) {
            question.setOrderIndex(quiz.getQuestions().size());
        }
        
        quiz.getQuestions().add(question);
        quiz.setUpdatedAt(LocalDateTime.now());
        
        log.info("Adding question to quiz: {}", quizId);
        return quizRepository.save(quiz);
    }
    
    /**
     * Update question
     */
    public ManualQuiz updateQuestion(String quizId, String questionId, ManualQuiz.QuizQuestion updatedQuestion) {
        ManualQuiz quiz = getQuizById(quizId);
        
        quiz.getQuestions().stream()
            .filter(q -> q.getId().equals(questionId))
            .findFirst()
            .ifPresent(question -> {
                question.setQuestion(updatedQuestion.getQuestion());
                question.setType(updatedQuestion.getType());
                question.setOptions(updatedQuestion.getOptions());
                question.setCorrectAnswer(updatedQuestion.getCorrectAnswer());
                question.setExplanation(updatedQuestion.getExplanation());
                question.setPoints(updatedQuestion.getPoints());
                question.setOrderIndex(updatedQuestion.getOrderIndex());
                question.setImageUrl(updatedQuestion.getImageUrl());
            });
        
        quiz.setUpdatedAt(LocalDateTime.now());
        
        log.info("Updating question {} in quiz: {}", questionId, quizId);
        return quizRepository.save(quiz);
    }
    
    /**
     * Delete question
     */
    public ManualQuiz deleteQuestion(String quizId, String questionId) {
        ManualQuiz quiz = getQuizById(quizId);
        
        quiz.getQuestions().removeIf(q -> q.getId().equals(questionId));
        quiz.setUpdatedAt(LocalDateTime.now());
        
        log.info("Deleting question {} from quiz: {}", questionId, quizId);
        return quizRepository.save(quiz);
    }
    
    /**
     * Submit quiz attempt
     */
    public QuizResult submitQuiz(String userId, String quizId, Map<String, Object> answers) {
        ManualQuiz quiz = getQuizById(quizId);
        
        // Calculate score
        int totalPoints = quiz.getQuestions().stream()
            .mapToInt(ManualQuiz.QuizQuestion::getPoints)
            .sum();
        
        int earnedPoints = 0;
        Map<String, Boolean> correctness = new HashMap<>();
        
        for (ManualQuiz.QuizQuestion question : quiz.getQuestions()) {
            Object userAnswer = answers.get(question.getId());
            boolean isCorrect = checkAnswer(question, userAnswer);
            correctness.put(question.getId(), isCorrect);
            
            if (isCorrect) {
                earnedPoints += question.getPoints();
            }
        }
        
        int scorePercentage = (totalPoints > 0) ? (earnedPoints * 100 / totalPoints) : 0;
        boolean passed = scorePercentage >= quiz.getPassingScore();
        
        // Save to progress
        saveQuizAttempt(userId, quiz, scorePercentage, earnedPoints, totalPoints, passed, answers);
        
        log.info("User {} submitted quiz {}: {}% ({})", userId, quizId, scorePercentage, passed ? "PASSED" : "FAILED");
        
        return QuizResult.builder()
            .score(scorePercentage)
            .earnedPoints(earnedPoints)
            .totalPoints(totalPoints)
            .passed(passed)
            .correctness(correctness)
            .build();
    }
    
    private boolean checkAnswer(ManualQuiz.QuizQuestion question, Object userAnswer) {
        if (userAnswer == null) return false;
        
        Object correctAnswer = question.getCorrectAnswer();
        
        if (correctAnswer instanceof List) {
            // Multiple correct answers
            return correctAnswer.equals(userAnswer);
        } else if (correctAnswer instanceof String) {
            return correctAnswer.equals(userAnswer.toString());
        } else if (correctAnswer instanceof Integer) {
            return correctAnswer.equals(Integer.parseInt(userAnswer.toString()));
        } else if (correctAnswer instanceof Boolean) {
            return correctAnswer.equals(Boolean.parseBoolean(userAnswer.toString()));
        }
        
        return false;
    }
    
    private void saveQuizAttempt(String userId, ManualQuiz quiz, int score, int earnedPoints, 
                                  int totalPoints, boolean passed, Map<String, Object> answers) {
        TrainingProgress progress = progressRepository
            .findByUserIdAndTrainingId(userId, quiz.getTrainingId())
            .orElseGet(() -> {
                TrainingProgress newProgress = new TrainingProgress();
                newProgress.setId(UUID.randomUUID().toString());
                newProgress.setUserId(userId);
                newProgress.setTrainingId(quiz.getTrainingId());
                newProgress.setStatus("in-progress");
                newProgress.setStartedAt(LocalDateTime.now());
                return newProgress;
            });
        
        TrainingProgress.QuizAttempt attempt = TrainingProgress.QuizAttempt.builder()
            .quizId(quiz.getId())
            .attemptId(UUID.randomUUID().toString())
            .attemptNumber(progress.getQuizAttempts().stream()
                .filter(a -> a.getQuizId().equals(quiz.getId()))
                .toList()
                .size() + 1)
            .score(score)
            .maxScore(100)
            .passed(passed)
            .startedAt(LocalDateTime.now())
            .completedAt(LocalDateTime.now())
            .answers(answers)
            .build();
        
        progress.getQuizAttempts().add(attempt);
        progress.setLastAccessedAt(LocalDateTime.now());
        
        progressRepository.save(progress);
    }
    
    /**
     * Delete quiz
     */
    public void deleteQuiz(String id) {
        ManualQuiz quiz = getQuizById(id);
        quizRepository.delete(quiz);
        
        log.info("Deleted quiz: {}", id);
    }
    
    public static class QuizResult {
        private int score;
        private int earnedPoints;
        private int totalPoints;
        private boolean passed;
        private Map<String, Boolean> correctness;
        
        public static QuizResultBuilder builder() {
            return new QuizResultBuilder();
        }
        
        public int getScore() { return score; }
        public int getEarnedPoints() { return earnedPoints; }
        public int getTotalPoints() { return totalPoints; }
        public boolean isPassed() { return passed; }
        public Map<String, Boolean> getCorrectness() { return correctness; }
        
        public static class QuizResultBuilder {
            private int score;
            private int earnedPoints;
            private int totalPoints;
            private boolean passed;
            private Map<String, Boolean> correctness;
            
            public QuizResultBuilder score(int score) {
                this.score = score;
                return this;
            }
            
            public QuizResultBuilder earnedPoints(int earnedPoints) {
                this.earnedPoints = earnedPoints;
                return this;
            }
            
            public QuizResultBuilder totalPoints(int totalPoints) {
                this.totalPoints = totalPoints;
                return this;
            }
            
            public QuizResultBuilder passed(boolean passed) {
                this.passed = passed;
                return this;
            }
            
            public QuizResultBuilder correctness(Map<String, Boolean> correctness) {
                this.correctness = correctness;
                return this;
            }
            
            public QuizResult build() {
                QuizResult result = new QuizResult();
                result.score = this.score;
                result.earnedPoints = this.earnedPoints;
                result.totalPoints = this.totalPoints;
                result.passed = this.passed;
                result.correctness = this.correctness;
                return result;
            }
        }
    }
}

