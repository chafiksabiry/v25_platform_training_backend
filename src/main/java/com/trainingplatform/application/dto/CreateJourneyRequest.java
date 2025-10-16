package com.trainingplatform.application.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public class CreateJourneyRequest {
    private String companyId;
    
    @NotBlank(message = "Journey name is required")
    @Size(min = 2, max = 200, message = "Journey name must be between 2 and 200 characters")
    private String name;
    
    private String description;
    private String estimatedDuration;
    private List<String> targetRoles;

    // Constructors
    public CreateJourneyRequest() {}

    // Getters and Setters
    public String getCompanyId() { return companyId; }
    public void setCompanyId(String companyId) { this.companyId = companyId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getEstimatedDuration() { return estimatedDuration; }
    public void setEstimatedDuration(String estimatedDuration) { this.estimatedDuration = estimatedDuration; }

    public List<String> getTargetRoles() { return targetRoles; }
    public void setTargetRoles(List<String> targetRoles) { this.targetRoles = targetRoles; }
}