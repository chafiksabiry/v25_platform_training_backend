package com.trainingplatform.core.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Document(collection = "rep_progress")
public class RepProgress {
    @Id
    private String id;
    
    private String repId;
    private String journeyId;
    
    private int moduleTotal = 0;
    
    // Map of moduleId -> ModuleProgress
    private Map<String, ModuleProgress> modules = new HashMap<>();
    
    // Counters
    private int moduleFinished = 0;
    private int moduleNotStarted = 0;
    private int moduleInProgress = 0;
    
    private int timeSpent = 0; // Total time spent in minutes
    
    @Min(value = 0, message = "Engagement score cannot be negative")
    @Max(value = 100, message = "Engagement score cannot exceed 100")
    private int engagementScore = 0;
    
    private LocalDateTime lastAccessed;
    
    @CreatedDate
    private LocalDateTime createdAt;
    
    @LastModifiedDate
    private LocalDateTime updatedAt;

    // Constructors
    public RepProgress() {}

    public RepProgress(String repId, String journeyId) {
        this.repId = repId;
        this.journeyId = journeyId;
        this.lastAccessed = LocalDateTime.now();
    }

    // Helper method to update counters
    public void updateCounters() {
        moduleFinished = 0;
        moduleNotStarted = 0;
        moduleInProgress = 0;
        
        for (ModuleProgress moduleProgress : modules.values()) {
            String status = moduleProgress.getStatus();
            if ("completed".equals(status) || "finished".equals(status)) {
                moduleFinished++;
            } else if ("in-progress".equals(status)) {
                moduleInProgress++;
            } else {
                moduleNotStarted++;
            }
        }
    }

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getRepId() { return repId; }
    public void setRepId(String repId) { this.repId = repId; }

    public String getJourneyId() { return journeyId; }
    public void setJourneyId(String journeyId) { this.journeyId = journeyId; }

    public int getModuleTotal() { return moduleTotal; }
    public void setModuleTotal(int moduleTotal) { this.moduleTotal = moduleTotal; }

    public Map<String, ModuleProgress> getModules() { return modules; }
    public void setModules(Map<String, ModuleProgress> modules) { 
        this.modules = modules != null ? modules : new HashMap<>();
        updateCounters();
    }

    public int getModuleFinished() { return moduleFinished; }
    public void setModuleFinished(int moduleFinished) { this.moduleFinished = moduleFinished; }

    public int getModuleNotStarted() { return moduleNotStarted; }
    public void setModuleNotStarted(int moduleNotStarted) { this.moduleNotStarted = moduleNotStarted; }

    public int getModuleInProgress() { return moduleInProgress; }
    public void setModuleInProgress(int moduleInProgress) { this.moduleInProgress = moduleInProgress; }

    public int getTimeSpent() { return timeSpent; }
    public void setTimeSpent(int timeSpent) { this.timeSpent = timeSpent; }

    public int getEngagementScore() { return engagementScore; }
    public void setEngagementScore(int engagementScore) { this.engagementScore = engagementScore; }

    public LocalDateTime getLastAccessed() { return lastAccessed; }
    public void setLastAccessed(LocalDateTime lastAccessed) { this.lastAccessed = lastAccessed; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    // Inner class for Module Progress
    public static class ModuleProgress {
        private String status = "not-started"; // not-started, in-progress, completed/finished
        
        @Min(value = 0, message = "Progress cannot be negative")
        @Max(value = 100, message = "Progress cannot exceed 100")
        private int progress = 0; // 0-100
        
        @Min(value = 0, message = "Score cannot be negative")
        @Max(value = 100, message = "Score cannot exceed 100")
        private Integer score; // Quiz score
        
        private int timeSpent = 0; // Time spent on this module in minutes
        
        // Map of sectionId -> SectionProgress
        private Map<String, SectionProgress> sections = new HashMap<>();
        
        // Map of quizId -> QuizResult to track quiz attempts and results
        private Map<String, QuizResult> quizz = new HashMap<>();
        
        private LocalDateTime lastAccessed;

        // Constructors
        public ModuleProgress() {}

        public ModuleProgress(String status) {
            this.status = status;
            this.lastAccessed = LocalDateTime.now();
        }

        // Getters and Setters
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }

        public int getProgress() { return progress; }
        public void setProgress(int progress) { this.progress = progress; }

        public Integer getScore() { return score; }
        public void setScore(Integer score) { this.score = score; }

        public int getTimeSpent() { return timeSpent; }
        public void setTimeSpent(int timeSpent) { this.timeSpent = timeSpent; }

        public Map<String, SectionProgress> getSections() { return sections; }
        public void setSections(Map<String, SectionProgress> sections) { 
            this.sections = sections != null ? sections : new HashMap<>();
        }

        public Map<String, QuizResult> getQuizz() { return quizz; }
        public void setQuizz(Map<String, QuizResult> quizz) { 
            this.quizz = quizz != null ? quizz : new HashMap<>(); 
        }

        public LocalDateTime getLastAccessed() { return lastAccessed; }
        public void setLastAccessed(LocalDateTime lastAccessed) { this.lastAccessed = lastAccessed; }
    }
    
    // Inner class for Quiz Result
    public static class QuizResult {
        private String quizId;
        private Integer score; // Score obtained (0-100)
        private Boolean passed; // Whether the quiz was passed
        private Integer totalQuestions; // Total number of questions
        private Integer correctAnswers; // Number of correct answers
        private LocalDateTime completedAt; // When the quiz was completed
        private Integer attempts; // Number of attempts
        
        // Constructors
        public QuizResult() {}
        
        public QuizResult(String quizId, Integer score, Boolean passed) {
            this.quizId = quizId;
            this.score = score;
            this.passed = passed;
            this.completedAt = LocalDateTime.now();
            this.attempts = 1;
        }
        
        // Getters and Setters
        public String getQuizId() { return quizId; }
        public void setQuizId(String quizId) { this.quizId = quizId; }
        
        public Integer getScore() { return score; }
        public void setScore(Integer score) { this.score = score; }
        
        public Boolean getPassed() { return passed; }
        public void setPassed(Boolean passed) { this.passed = passed; }
        
        public Integer getTotalQuestions() { return totalQuestions; }
        public void setTotalQuestions(Integer totalQuestions) { this.totalQuestions = totalQuestions; }
        
        public Integer getCorrectAnswers() { return correctAnswers; }
        public void setCorrectAnswers(Integer correctAnswers) { this.correctAnswers = correctAnswers; }
        
        public LocalDateTime getCompletedAt() { return completedAt; }
        public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }
        
        public Integer getAttempts() { return attempts; }
        public void setAttempts(Integer attempts) { this.attempts = attempts; }
    }

    // Inner class for Section Progress
    public static class SectionProgress {
        private boolean completed = false;
        
        @Min(value = 0, message = "Progress cannot be negative")
        @Max(value = 100, message = "Progress cannot exceed 100")
        private int progress = 0; // 0-100
        
        private int timeSpent = 0; // Time spent on this section in minutes
        
        private LocalDateTime lastAccessed;

        // Constructors
        public SectionProgress() {}

        public SectionProgress(boolean completed) {
            this.completed = completed;
            this.lastAccessed = LocalDateTime.now();
        }

        // Getters and Setters
        public boolean isCompleted() { return completed; }
        public void setCompleted(boolean completed) { this.completed = completed; }

        public int getProgress() { return progress; }
        public void setProgress(int progress) { this.progress = progress; }

        public int getTimeSpent() { return timeSpent; }
        public void setTimeSpent(int timeSpent) { this.timeSpent = timeSpent; }

        public LocalDateTime getLastAccessed() { return lastAccessed; }
        public void setLastAccessed(LocalDateTime lastAccessed) { this.lastAccessed = lastAccessed; }
    }
}
