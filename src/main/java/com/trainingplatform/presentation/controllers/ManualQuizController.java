package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.ManualQuizService;
import com.trainingplatform.core.entities.ManualQuiz;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/manual-trainings")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "*")
public class ManualQuizController {
    
    private final ManualQuizService quizService;
    
    /**
     * Create a new quiz
     */
    @PostMapping("/modules/{moduleId}/quizzes")
    public ResponseEntity<?> createQuiz(
        @PathVariable String moduleId,
        @RequestBody ManualQuiz quiz
    ) {
        try {
            quiz.setModuleId(moduleId);
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
     * Submit quiz attempt
     */
    @PostMapping("/quizzes/{quizId}/submit")
    public ResponseEntity<?> submitQuiz(
        @PathVariable String quizId,
        @RequestParam String userId,
        @RequestBody Map<String, Object> answers
    ) {
        try {
            ManualQuizService.QuizResult result = quizService.submitQuiz(userId, quizId, answers);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", result.isPassed() ? "Quiz passed!" : "Quiz failed. Try again!",
                "data", result
            ));
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
}

