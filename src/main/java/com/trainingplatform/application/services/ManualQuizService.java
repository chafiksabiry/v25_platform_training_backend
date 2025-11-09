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
     * Submit quiz attempt with security validation
     */
    public QuizResult submitQuiz(String userId, String quizId, Map<String, Object> answers, 
                                  com.trainingplatform.core.entities.QuizAttemptMetadata metadata) {
        ManualQuiz quiz = getQuizById(quizId);
        
        // ✅ SECURITY VALIDATION
        SecurityValidationResult securityResult = validateQuizSecurity(quiz, metadata);
        
        if (!securityResult.isValid()) {
            log.error("🚨 SECURITY VIOLATION: User {} - Quiz {} - Reason: {}", 
                     userId, quizId, securityResult.getReason());
            
            // Return failed result with security warning
            return QuizResult.builder()
                .score(0)
                .earnedPoints(0)
                .totalPoints(0)
                .passed(false)
                .correctness(new HashMap<>())
                .securityViolation(true)
                .securityMessage(securityResult.getReason())
                .build();
        }
        
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
        
        // Apply penalty multiplier based on violations
        double penaltyMultiplier = calculatePenaltyMultiplier(metadata);
        
        int scorePercentage = (totalPoints > 0) ? 
            (int)((earnedPoints * 100.0 / totalPoints) * penaltyMultiplier) : 0;
        boolean passed = scorePercentage >= quiz.getPassingScore();
        
        // Log security metrics
        if (metadata != null && metadata.getViolationCount() != null && metadata.getViolationCount() > 0) {
            log.warn("⚠️ User {} had {} violations - Score penalty applied: {}%", 
                    userId, metadata.getViolationCount(), 
                    (int)((1 - penaltyMultiplier) * 100));
        }
        
        // Save to progress with metadata
        saveQuizAttempt(userId, quiz, scorePercentage, earnedPoints, totalPoints, passed, answers, metadata);
        
        log.info("User {} submitted quiz {}: {}% ({}) - Violations: {}", 
                userId, quizId, scorePercentage, 
                passed ? "PASSED" : "FAILED",
                metadata != null && metadata.getViolationCount() != null ? metadata.getViolationCount() : 0);
        
        return QuizResult.builder()
            .score(scorePercentage)
            .earnedPoints(earnedPoints)
            .totalPoints(totalPoints)
            .passed(passed)
            .correctness(correctness)
            .penaltyApplied(penaltyMultiplier < 1.0)
            .penaltyPercentage((int)((1 - penaltyMultiplier) * 100))
            .build();
    }
    
    /**
     * Validate quiz security based on metadata
     * TOUTES LES VALIDATIONS DÉSACTIVÉES
     */
    private SecurityValidationResult validateQuizSecurity(ManualQuiz quiz, 
                                                          com.trainingplatform.core.entities.QuizAttemptMetadata metadata) {
        // Toutes les validations de sécurité sont désactivées
        // Les quiz peuvent être soumis sans restrictions de temps ou de comportement
        return SecurityValidationResult.valid();
        
        /* VALIDATIONS DÉSACTIVÉES:
        
        if (metadata == null) {
            return SecurityValidationResult.invalid("No security metadata provided");
        }
        
        // 1. Validate timing - DÉSACTIVÉ
        if (metadata.getStartTime() != null && metadata.getEndTime() != null) {
            long totalTime = metadata.getEndTime() - metadata.getStartTime();
            long minExpectedTime = quiz.getQuestions().size() * 10000L; // 10 seconds per question
            
            if (totalTime < minExpectedTime) {
                return SecurityValidationResult.invalid(
                    String.format("Quiz completed too quickly (%d ms). Minimum expected: %d ms", 
                                totalTime, minExpectedTime));
            }
        }
        
        // 2. Validate violations threshold
        if (metadata.getViolationCount() != null && metadata.getViolationCount() > 10) {
            return SecurityValidationResult.invalid(
                String.format("Too many violations detected (%d). Maximum allowed: 10", 
                            metadata.getViolationCount()));
        }
        
        // 3. Validate question response times (detect bot patterns)
        if (metadata.getQuestionResponseTimes() != null) {
            long suspiciouslyFastCount = metadata.getQuestionResponseTimes().values().stream()
                .filter(time -> time != null && time < 2000) // < 2 seconds
                .count();
            
            // If more than 80% of questions answered in < 2 seconds → likely bot
            if (suspiciouslyFastCount > quiz.getQuestions().size() * 0.8) {
                return SecurityValidationResult.invalid(
                    String.format("Bot-like behavior detected: %d/%d questions answered instantly", 
                                suspiciouslyFastCount, quiz.getQuestions().size()));
            }
        }
        
        return SecurityValidationResult.valid();
        */
    }
    
    /**
     * Calculate penalty multiplier based on violations
     * Each violation reduces score by 5%, up to maximum 50% penalty
     * DÉSACTIVÉ - Aucune pénalité appliquée
     */
    private double calculatePenaltyMultiplier(com.trainingplatform.core.entities.QuizAttemptMetadata metadata) {
        // Aucune pénalité appliquée - toujours retourner 1.0
        return 1.0;
        
        /* PÉNALITÉS DÉSACTIVÉES:
        if (metadata == null || metadata.getViolationCount() == null || metadata.getViolationCount() == 0) {
            return 1.0; // No penalty
        }
        
        // -5% per violation, max 50% penalty
        double penalty = Math.min(metadata.getViolationCount() * 0.05, 0.5);
        return 1.0 - penalty;
        */
    }
    
    /**
     * Security validation result
     */
    private static class SecurityValidationResult {
        private final boolean valid;
        private final String reason;
        
        private SecurityValidationResult(boolean valid, String reason) {
            this.valid = valid;
            this.reason = reason;
        }
        
        public static SecurityValidationResult valid() {
            return new SecurityValidationResult(true, null);
        }
        
        public static SecurityValidationResult invalid(String reason) {
            return new SecurityValidationResult(false, reason);
        }
        
        public boolean isValid() {
            return valid;
        }
        
        public String getReason() {
            return reason;
        }
    }
    
    private boolean checkAnswer(ManualQuiz.QuizQuestion question, Object userAnswer) {
        if (userAnswer == null) return false;
        
        Object correctAnswer = question.getCorrectAnswer();
        
        try {
            if (correctAnswer instanceof List) {
                // Multiple correct answers
                return correctAnswer.equals(userAnswer);
            } else if (correctAnswer instanceof String) {
                return correctAnswer.equals(userAnswer.toString());
            } else if (correctAnswer instanceof Integer) {
                try {
                    return correctAnswer.equals(Integer.parseInt(userAnswer.toString()));
                } catch (NumberFormatException e) {
                    return false;
                }
            } else if (correctAnswer instanceof Boolean) {
                return correctAnswer.equals(Boolean.parseBoolean(userAnswer.toString()));
            }
        } catch (Exception e) {
            log.warn("Error checking answer for question {}: {}", question.getId(), e.getMessage());
            return false;
        }
        
        return false;
    }
    
    private void saveQuizAttempt(String userId, ManualQuiz quiz, int score, int earnedPoints, 
                                  int totalPoints, boolean passed, Map<String, Object> answers,
                                  com.trainingplatform.core.entities.QuizAttemptMetadata metadata) {
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
            .startedAt(metadata != null && metadata.getStartTime() != null ? 
                      java.time.Instant.ofEpochMilli(metadata.getStartTime())
                          .atZone(java.time.ZoneId.systemDefault())
                          .toLocalDateTime() : 
                      LocalDateTime.now())
            .completedAt(metadata != null && metadata.getEndTime() != null ? 
                        java.time.Instant.ofEpochMilli(metadata.getEndTime())
                            .atZone(java.time.ZoneId.systemDefault())
                            .toLocalDateTime() : 
                        LocalDateTime.now())
            .answers(answers)
            .build();
        
        progress.getQuizAttempts().add(attempt);
        progress.setLastAccessedAt(LocalDateTime.now());
        
        progressRepository.save(progress);
        
        // Log security metadata for audit trail
        if (metadata != null && metadata.getViolationCount() != null && metadata.getViolationCount() > 0) {
            log.info("📊 Security Audit - User: {}, Quiz: {}, Violations: {}, Types: {}", 
                    userId, quiz.getId(), 
                    metadata.getViolationCount(),
                    metadata.getViolationTypes());
        }
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
        private boolean securityViolation;
        private String securityMessage;
        private boolean penaltyApplied;
        private int penaltyPercentage;
        
        public static QuizResultBuilder builder() {
            return new QuizResultBuilder();
        }
        
        public int getScore() { return score; }
        public int getEarnedPoints() { return earnedPoints; }
        public int getTotalPoints() { return totalPoints; }
        public boolean isPassed() { return passed; }
        public Map<String, Boolean> getCorrectness() { return correctness; }
        public boolean isSecurityViolation() { return securityViolation; }
        public String getSecurityMessage() { return securityMessage; }
        public boolean isPenaltyApplied() { return penaltyApplied; }
        public int getPenaltyPercentage() { return penaltyPercentage; }
        
        public static class QuizResultBuilder {
            private int score;
            private int earnedPoints;
            private int totalPoints;
            private boolean passed;
            private Map<String, Boolean> correctness;
            private boolean securityViolation;
            private String securityMessage;
            private boolean penaltyApplied;
            private int penaltyPercentage;
            
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
            
            public QuizResultBuilder securityViolation(boolean securityViolation) {
                this.securityViolation = securityViolation;
                return this;
            }
            
            public QuizResultBuilder securityMessage(String securityMessage) {
                this.securityMessage = securityMessage;
                return this;
            }
            
            public QuizResultBuilder penaltyApplied(boolean penaltyApplied) {
                this.penaltyApplied = penaltyApplied;
                return this;
            }
            
            public QuizResultBuilder penaltyPercentage(int penaltyPercentage) {
                this.penaltyPercentage = penaltyPercentage;
                return this;
            }
            
            public QuizResult build() {
                QuizResult result = new QuizResult();
                result.score = this.score;
                result.earnedPoints = this.earnedPoints;
                result.totalPoints = this.totalPoints;
                result.passed = this.passed;
                result.correctness = this.correctness;
                result.securityViolation = this.securityViolation;
                result.securityMessage = this.securityMessage;
                result.penaltyApplied = this.penaltyApplied;
                result.penaltyPercentage = this.penaltyPercentage;
                return result;
            }
        }
    }
}

