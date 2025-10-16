package com.trainingplatform.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Min;

import java.util.List;

public class CreateModuleRequest {
    private String journeyId;
    
    @NotBlank(message = "Module title is required")
    private String title;
    
    private String description;
    
    @Min(value = 1, message = "Duration must be at least 1 minute")
    private int duration;
    
    private String difficulty = "intermediate";
    private List<String> topics;
    private List<String> learningObjectives;
    private int orderIndex = 0;

    // Constructors
    public CreateModuleRequest() {}

    // Getters and Setters
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

    public List<String> getTopics() { return topics; }
    public void setTopics(List<String> topics) { this.topics = topics; }

    public List<String> getLearningObjectives() { return learningObjectives; }
    public void setLearningObjectives(List<String> learningObjectives) { this.learningObjectives = learningObjectives; }

    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
}