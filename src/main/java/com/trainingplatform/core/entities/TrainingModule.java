package com.trainingplatform.core.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Min;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Document(collection = "training_modules")
public class TrainingModule {
    @Id
    private String id;
    
    private String journeyId;
    
    @NotBlank(message = "Module title is required")
    private String title;
    
    private String description;
    
    @Min(value = 1, message = "Duration must be at least 1 minute")
    private int duration; // in minutes
    
    private String difficulty = "intermediate"; // beginner, intermediate, advanced
    private String moduleType = "interactive"; // video, interactive, simulation, ai-tutor, reading
    private List<String> topics;
    private List<String> learningObjectives;
    private List<Map<String, Object>> content;
    private List<Map<String, Object>> assessments;
    private List<String> prerequisites;
    private int orderIndex = 0;
    private boolean aiEnhanced = false;
    
    @CreatedDate
    private LocalDateTime createdAt;
    
    @LastModifiedDate
    private LocalDateTime updatedAt;

    // Constructors
    public TrainingModule() {}

    public TrainingModule(String journeyId, String title, String description, int duration) {
        this.journeyId = journeyId;
        this.title = title;
        this.description = description;
        this.duration = duration;
    }

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getJourneyId() { return journeyId; }
    public void setJourneyId(String journeyId) { this.journeyId = journeyId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public int getDuration() { return duration; }
    public void setDuration(int duration) { this.duration = duration; }

    public String getDifficulty() { return difficulty; }
    public void setDifficulty(String difficulty) { this.difficulty = difficulty; }

    public String getModuleType() { return moduleType; }
    public void setModuleType(String moduleType) { this.moduleType = moduleType; }

    public List<String> getTopics() { return topics; }
    public void setTopics(List<String> topics) { this.topics = topics; }

    public List<String> getLearningObjectives() { return learningObjectives; }
    public void setLearningObjectives(List<String> learningObjectives) { this.learningObjectives = learningObjectives; }

    public List<Map<String, Object>> getContent() { return content; }
    public void setContent(List<Map<String, Object>> content) { this.content = content; }

    public List<Map<String, Object>> getAssessments() { return assessments; }
    public void setAssessments(List<Map<String, Object>> assessments) { this.assessments = assessments; }

    public List<String> getPrerequisites() { return prerequisites; }
    public void setPrerequisites(List<String> prerequisites) { this.prerequisites = prerequisites; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }

    public boolean isAiEnhanced() { return aiEnhanced; }
    public void setAiEnhanced(boolean aiEnhanced) { this.aiEnhanced = aiEnhanced; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}