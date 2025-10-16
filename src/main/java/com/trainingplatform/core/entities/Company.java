package com.trainingplatform.core.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.Map;

@Document(collection = "companies")
public class Company {
    @Id
    private String id;
    
    @NotBlank(message = "Company name is required")
    @Size(min = 2, max = 200, message = "Company name must be between 2 and 200 characters")
    private String name;
    
    @NotBlank(message = "Industry is required")
    private String industry;
    
    @NotBlank(message = "Company size is required")
    private String size; // startup, small, medium, large, enterprise
    
    private boolean setupComplete = false;
    private Map<String, Object> settings;
    
    @CreatedDate
    private LocalDateTime createdAt;
    
    @LastModifiedDate
    private LocalDateTime updatedAt;

    // Constructors
    public Company() {}

    public Company(String name, String industry, String size) {
        this.name = name;
        this.industry = industry;
        this.size = size;
    }

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getIndustry() { return industry; }
    public void setIndustry(String industry) { this.industry = industry; }

    public String getSize() { return size; }
    public void setSize(String size) { this.size = size; }

    public boolean isSetupComplete() { return setupComplete; }
    public void setSetupComplete(boolean setupComplete) { this.setupComplete = setupComplete; }

    public Map<String, Object> getSettings() { return settings; }
    public void setSettings(Map<String, Object> settings) { this.settings = settings; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}