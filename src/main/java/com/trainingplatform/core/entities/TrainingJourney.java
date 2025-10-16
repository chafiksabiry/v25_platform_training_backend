package com.trainingplatform.core.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Document(collection = "training_journeys")
public class TrainingJourney {
    @Id
    private String id;
    
    private String companyId;
    
    @NotBlank(message = "Journey name is required")
    @Size(min = 2, max = 200, message = "Journey name must be between 2 and 200 characters")
    private String name;
    
    private String description;
    private String status = "draft"; // draft, rehearsal, active, completed, archived
    private String estimatedDuration;
    private List<String> targetRoles;
    private Map<String, Object> methodologyData;
    
    @CreatedDate
    private LocalDateTime createdAt;
    
    @LastModifiedDate
    private LocalDateTime updatedAt;

    // Constructors
    public TrainingJourney() {}

    public TrainingJourney(String companyId, String name, String description) {
        this.companyId = companyId;
        this.name = name;
        this.description = description;
    }

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getCompanyId() { return companyId; }
    public void setCompanyId(String companyId) { this.companyId = companyId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getEstimatedDuration() { return estimatedDuration; }
    public void setEstimatedDuration(String estimatedDuration) { this.estimatedDuration = estimatedDuration; }

    public List<String> getTargetRoles() { return targetRoles; }
    public void setTargetRoles(List<String> targetRoles) { this.targetRoles = targetRoles; }

    public Map<String, Object> getMethodologyData() { return methodologyData; }
    public void setMethodologyData(Map<String, Object> methodologyData) { this.methodologyData = methodologyData; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}