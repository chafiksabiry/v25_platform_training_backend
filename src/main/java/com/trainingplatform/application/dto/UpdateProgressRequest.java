package com.trainingplatform.application.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public class UpdateProgressRequest {
    private String repId;
    private String journeyId;
    private String moduleId;
    
    @Min(value = 0, message = "Progress cannot be negative")
    @Max(value = 100, message = "Progress cannot exceed 100")
    private int progress;
    
    @Min(value = 0, message = "Engagement score cannot be negative")
    @Max(value = 100, message = "Engagement score cannot exceed 100")
    private int engagementScore = 0;

    // Constructors
    public UpdateProgressRequest() {}

    public UpdateProgressRequest(String repId, String journeyId, String moduleId, int progress, int engagementScore) {
        this.repId = repId;
        this.journeyId = journeyId;
        this.moduleId = moduleId;
        this.progress = progress;
        this.engagementScore = engagementScore;
    }

    // Getters and Setters
    public String getRepId() { return repId; }
    public void setRepId(String repId) { this.repId = repId; }

    public String getJourneyId() { return journeyId; }
    public void setJourneyId(String journeyId) { this.journeyId = journeyId; }

    public String getModuleId() { return moduleId; }
    public void setModuleId(String moduleId) { this.moduleId = moduleId; }

    public int getProgress() { return progress; }
    public void setProgress(int progress) { this.progress = progress; }

    public int getEngagementScore() { return engagementScore; }
    public void setEngagementScore(int engagementScore) { this.engagementScore = engagementScore; }
}