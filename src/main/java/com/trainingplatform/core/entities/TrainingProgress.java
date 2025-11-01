package com.trainingplatform.core.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "training_progress")
public class TrainingProgress {
    @Id
    private String id;
    
    private String userId;
    private String trainingId;
    
    private String status; // not-started, in-progress, completed
    private Integer overallProgress; // 0-100
    
    @Builder.Default
    private Map<String, ModuleProgress> moduleProgress = new HashMap<>();
    
    @Builder.Default
    private List<QuizAttempt> quizAttempts = new ArrayList<>();
    
    private LocalDateTime startedAt;
    private LocalDateTime completedAt;
    private LocalDateTime lastAccessedAt;
    
    private Integer totalTimeSpent; // in minutes
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ModuleProgress {
        private String moduleId;
        private String status; // not-started, in-progress, completed
        private Integer progress; // 0-100
        private Map<String, Boolean> sectionsCompleted;
        private Integer timeSpent; // in minutes
        private LocalDateTime startedAt;
        private LocalDateTime completedAt;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuizAttempt {
        private String quizId;
        private String attemptId;
        private Integer attemptNumber;
        private Integer score;
        private Integer maxScore;
        private Boolean passed;
        private Integer timeSpent; // in seconds
        private LocalDateTime startedAt;
        private LocalDateTime completedAt;
        private Map<String, Object> answers;
    }
}

