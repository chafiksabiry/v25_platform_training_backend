package com.trainingplatform.core.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.LocalDateTime;

@Document(collection = "rep_progress")
public class RepProgress {
    @Id
    private String id;
    
    private String repId;
    private String journeyId;
    private String moduleId;
    
    @Min(value = 0, message = "Progress cannot be negative")
    @Max(value = 100, message = "Progress cannot exceed 100")
    private int progress = 0;
    
    private String status = "not-started"; // not-started, in-progress, completed
    
    @Min(value = 0, message = "Score cannot be negative")
    @Max(value = 100, message = "Score cannot exceed 100")
    private Integer score;
    
    private int timeSpent = 0; // in minutes
    
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

    public RepProgress(String repId, String journeyId, String moduleId) {
        this.repId = repId;
        this.journeyId = journeyId;
        this.moduleId = moduleId;
        this.lastAccessed = LocalDateTime.now();
    }

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getRepId() { return repId; }
    public void setRepId(String repId) { this.repId = repId; }

    public String getJourneyId() { return journeyId; }
    public void setJourneyId(String journeyId) { this.journeyId = journeyId; }

    public String getModuleId() { return moduleId; }
    public void setModuleId(String moduleId) { this.moduleId = moduleId; }

    public int getProgress() { return progress; }
    public void setProgress(int progress) { this.progress = progress; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Integer getScore() { return score; }
    public void setScore(Integer score) { this.score = score; }

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
}