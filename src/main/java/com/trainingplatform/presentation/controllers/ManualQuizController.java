package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.AIService;
import com.trainingplatform.application.services.ManualModuleService;
import com.trainingplatform.application.services.ManualQuizService;
import com.trainingplatform.core.entities.ManualQuiz;
import com.trainingplatform.core.entities.ManualTrainingModule;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/manual-trainings")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "*")
public class ManualQuizController {
    
    private final ManualQuizService quizService;
    private final AIService aiService;
    private final ManualModuleService moduleService;
    
    /**
     * Create a new quiz
     */
    @PostMapping("/modules/{moduleId}/quizzes")
    public ResponseEntity<?> createQuiz(
        @PathVariable String moduleId,
        @RequestBody ManualQuiz quiz
    ) {
        try {
            // Handle special case for final exam
            if ("final-exam".equals(moduleId) || "FINAL_EXAM".equals(moduleId)) {
                quiz.setModuleId(null); // Final exam doesn't belong to a specific module
                log.info("Creating final exam for training: {}", quiz.getTrainingId());
            } else {
                quiz.setModuleId(moduleId);
            }
            
            ManualQuiz created = quizService.createQuiz(quiz);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Quiz created successfully",
                "data", created
            ));
        } catch (Exception e) {
            log.error("Error creating quiz", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Get all quizzes for a module
     */
    @GetMapping("/modules/{moduleId}/quizzes")
    public ResponseEntity<?> getQuizzesByModule(@PathVariable String moduleId) {
        try {
            List<ManualQuiz> quizzes = quizService.getQuizzesByModule(moduleId);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "data", quizzes
            ));
        } catch (Exception e) {
            log.error("Error fetching quizzes", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Get all quizzes for a training
     */
    @GetMapping("/{trainingId}/quizzes")
    public ResponseEntity<?> getQuizzesByTraining(@PathVariable String trainingId) {
        try {
            List<ManualQuiz> quizzes = quizService.getQuizzesByTraining(trainingId);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "data", quizzes
            ));
        } catch (Exception e) {
            log.error("Error fetching quizzes", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Get quiz by ID
     */
    @GetMapping("/quizzes/{id}")
    public ResponseEntity<?> getQuizById(@PathVariable String id) {
        try {
            ManualQuiz quiz = quizService.getQuizById(id);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "data", quiz
            ));
        } catch (Exception e) {
            log.error("Error fetching quiz", e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Update quiz
     */
    @PutMapping("/quizzes/{id}")
    public ResponseEntity<?> updateQuiz(
        @PathVariable String id,
        @RequestBody ManualQuiz quiz
    ) {
        try {
            ManualQuiz updated = quizService.updateQuiz(id, quiz);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Quiz updated successfully",
                "data", updated
            ));
        } catch (Exception e) {
            log.error("Error updating quiz", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Add question to quiz
     */
    @PostMapping("/quizzes/{quizId}/questions")
    public ResponseEntity<?> addQuestion(
        @PathVariable String quizId,
        @RequestBody ManualQuiz.QuizQuestion question
    ) {
        try {
            ManualQuiz updated = quizService.addQuestion(quizId, question);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Question added successfully",
                "data", updated
            ));
        } catch (Exception e) {
            log.error("Error adding question", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Update question
     */
    @PutMapping("/quizzes/{quizId}/questions/{questionId}")
    public ResponseEntity<?> updateQuestion(
        @PathVariable String quizId,
        @PathVariable String questionId,
        @RequestBody ManualQuiz.QuizQuestion question
    ) {
        try {
            ManualQuiz updated = quizService.updateQuestion(quizId, questionId, question);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Question updated successfully",
                "data", updated
            ));
        } catch (Exception e) {
            log.error("Error updating question", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Delete question
     */
    @DeleteMapping("/quizzes/{quizId}/questions/{questionId}")
    public ResponseEntity<?> deleteQuestion(
        @PathVariable String quizId,
        @PathVariable String questionId
    ) {
        try {
            ManualQuiz updated = quizService.deleteQuestion(quizId, questionId);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Question deleted successfully",
                "data", updated
            ));
        } catch (Exception e) {
            log.error("Error deleting question", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Submit quiz attempt with security validation
     */
    @PostMapping("/quizzes/{quizId}/submit")
    public ResponseEntity<?> submitQuiz(
        @PathVariable String quizId,
        @RequestBody SubmitQuizRequest request
    ) {
        try {
            log.info("📥 Quiz submission received - User: {}, Quiz: {}, Violations: {}", 
                    request.getUserId(), quizId, 
                    request.getMetadata() != null ? request.getMetadata().getViolationCount() : 0);
            
            // Validate metadata
            if (request.getMetadata() == null) {
                log.warn("⚠️ No security metadata provided for quiz submission");
                // Create empty metadata to avoid null
                request.setMetadata(com.trainingplatform.core.entities.QuizAttemptMetadata.builder().build());
            }
            
            ManualQuizService.QuizResult result = quizService.submitQuiz(
                request.getUserId(), 
                quizId, 
                request.getAnswers(),
                request.getMetadata()
            );
            
            // Build response message
            String message;
            if (result.isSecurityViolation()) {
                message = "🚨 SECURITY VIOLATION: " + result.getSecurityMessage();
            } else if (result.isPenaltyApplied()) {
                message = String.format("Quiz completed with %d%% penalty due to violations. %s", 
                    result.getPenaltyPercentage(),
                    result.isPassed() ? "Passed!" : "Failed. Try again!");
            } else {
                message = result.isPassed() ? "Quiz passed!" : "Quiz failed. Try again!";
            }
            
            return ResponseEntity.ok(Map.of(
                "success", !result.isSecurityViolation(),
                "message", message,
                "data", result
            ));
        } catch (SecurityException e) {
            log.error("🚨 Security violation during quiz submission", e);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("success", false, "message", e.getMessage()));
        } catch (Exception e) {
            log.error("Error submitting quiz", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Delete quiz
     */
    @DeleteMapping("/quizzes/{id}")
    public ResponseEntity<?> deleteQuiz(@PathVariable String id) {
        try {
            quizService.deleteQuiz(id);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Quiz deleted successfully"
            ));
        } catch (Exception e) {
            log.error("Error deleting quiz", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Generate quiz using AI
     */
    @PostMapping("/ai/generate-quiz")
    public ResponseEntity<?> generateQuizWithAI(@RequestBody GenerateQuizRequest request) {
        Map<String, Object> response = new HashMap<>();
        
        try {
            log.info("Generating AI quiz with {} questions for module {}", 
                request.getNumberOfQuestions(), request.getModuleId());
            
            // ✨ If moduleContent is not provided, load it from moduleId
            Map<String, Object> moduleContent = request.getModuleContent();
            if (moduleContent == null && request.getModuleId() != null) {
                log.info("Loading module content for moduleId: {}", request.getModuleId());
                moduleContent = convertModuleToContent(request.getModuleId());
            }
            
            if (moduleContent == null) {
                throw new RuntimeException("Either moduleContent or moduleId must be provided");
            }
            
            Map<String, Object> result = aiService.generateQuiz(
                    moduleContent,
                    request.getNumberOfQuestions(),
                    request.getDifficulty(),
                    request.getQuestionTypes()
            );
            
            response.put("success", true);
            response.put("data", result);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error generating quiz with AI", e);
            response.put("success", false);
            response.put("message", "Error generating quiz: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }
    
    /**
     * Convert a module to content map for AI processing
     */
    private Map<String, Object> convertModuleToContent(String moduleId) {
        try {
            ManualTrainingModule module = moduleService.getModuleById(moduleId);
            
            Map<String, Object> content = new HashMap<>();
            content.put("title", module.getTitle());
            content.put("description", module.getDescription());
            
            // ✨ Convert sections to simple maps for AI processing
            List<Map<String, Object>> sectionsData = new ArrayList<>();
            if (module.getSections() != null) {
                for (ManualTrainingModule.TrainingSection section : module.getSections()) {
                    Map<String, Object> sectionMap = new HashMap<>();
                    sectionMap.put("id", section.getId());
                    sectionMap.put("title", section.getTitle());
                    sectionMap.put("type", section.getType());
                    sectionMap.put("orderIndex", section.getOrderIndex());
                    sectionMap.put("estimatedDuration", section.getEstimatedDuration());
                    
                    // Include content details if available
                    if (section.getContent() != null) {
                        Map<String, Object> contentMap = new HashMap<>();
                        ManualTrainingModule.SectionContent cont = section.getContent();
                        
                        if (cont.getText() != null) contentMap.put("text", cont.getText());
                        if (cont.getYoutubeUrl() != null) contentMap.put("youtubeUrl", cont.getYoutubeUrl());
                        if (cont.getKeyPoints() != null) contentMap.put("keyPoints", cont.getKeyPoints());
                        
                        sectionMap.put("content", contentMap);
                    }
                    
                    sectionsData.add(sectionMap);
                }
            }
            content.put("sections", sectionsData);
            
            return content;
        } catch (Exception e) {
            log.error("Error converting module to content", e);
            throw new RuntimeException("Failed to load module content: " + e.getMessage());
        }
    }
    
    /**
     * Generate final exam using AI
     */
    @PostMapping("/ai/generate-final-exam")
    public ResponseEntity<?> generateFinalExamWithAI(@RequestBody GenerateFinalExamRequest request) {
        Map<String, Object> response = new HashMap<>();
        
        try {
            log.info("Generating AI final exam with {} questions for training {}", 
                request.getNumberOfQuestions(), request.getTrainingId());
            
            Map<String, Object> result = aiService.generateFinalExam(
                    request.getTrainingId(),
                    request.getNumberOfQuestions()
            );
            
            response.put("success", true);
            response.put("data", result);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error generating final exam with AI", e);
            response.put("success", false);
            response.put("message", "Error generating final exam: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }
    }
    
    // Request DTOs
    public static class GenerateQuizRequest {
        private Map<String, Object> moduleContent;
        private int numberOfQuestions;
        private String difficulty;
        private Map<String, Boolean> questionTypes;
        private String moduleId;
        private String trainingId;

        public Map<String, Object> getModuleContent() { return moduleContent; }
        public void setModuleContent(Map<String, Object> moduleContent) { this.moduleContent = moduleContent; }

        public int getNumberOfQuestions() { return numberOfQuestions; }
        public void setNumberOfQuestions(int numberOfQuestions) { this.numberOfQuestions = numberOfQuestions; }

        public String getDifficulty() { return difficulty; }
        public void setDifficulty(String difficulty) { this.difficulty = difficulty; }

        public Map<String, Boolean> getQuestionTypes() { return questionTypes; }
        public void setQuestionTypes(Map<String, Boolean> questionTypes) { this.questionTypes = questionTypes; }

        public String getModuleId() { return moduleId; }
        public void setModuleId(String moduleId) { this.moduleId = moduleId; }

        public String getTrainingId() { return trainingId; }
        public void setTrainingId(String trainingId) { this.trainingId = trainingId; }
    }
    
    public static class GenerateFinalExamRequest {
        private String trainingId;
        private int numberOfQuestions;

        public String getTrainingId() { return trainingId; }
        public void setTrainingId(String trainingId) { this.trainingId = trainingId; }

        public int getNumberOfQuestions() { return numberOfQuestions; }
        public void setNumberOfQuestions(int numberOfQuestions) { this.numberOfQuestions = numberOfQuestions; }
    }
    
    /**
     * DTO for quiz submission with security metadata
     */
    public static class SubmitQuizRequest {
        private String userId;
        private Map<String, Object> answers;
        private com.trainingplatform.core.entities.QuizAttemptMetadata metadata;

        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }

        public Map<String, Object> getAnswers() { return answers; }
        public void setAnswers(Map<String, Object> answers) { this.answers = answers; }

        public com.trainingplatform.core.entities.QuizAttemptMetadata getMetadata() { return metadata; }
        public void setMetadata(com.trainingplatform.core.entities.QuizAttemptMetadata metadata) { 
            this.metadata = metadata; 
        }
    }
}

