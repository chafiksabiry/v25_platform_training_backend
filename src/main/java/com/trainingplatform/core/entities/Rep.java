package com.trainingplatform.core.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Document(collection = "reps")
public class Rep {
    @Id
    private String id;
    
    private String userId;
    
    @NotBlank(message = "Name is required")
    private String name;
    
    @Email(message = "Email should be valid")
    @NotBlank(message = "Email is required")
    private String email;
    
    private String role = "trainee";
    private String department;
    private List<String> skills;
    private String learningStyle = "visual";
    private Map<String, Object> aiPersonalityProfile;
    private LocalDateTime joinDate;
    
    @CreatedDate
    private LocalDateTime createdAt;
    
    @LastModifiedDate
    private LocalDateTime updatedAt;

    // Constructors
    public Rep() {}

    public Rep(String userId, String name, String email, String role, String department) {
        this.userId = userId;
        this.name = name;
        this.email = email;
        this.role = role;
        this.department = department;
        this.joinDate = LocalDateTime.now();
    }

    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public List<String> getSkills() { return skills; }
    public void setSkills(List<String> skills) { this.skills = skills; }

    public String getLearningStyle() { return learningStyle; }
    public void setLearningStyle(String learningStyle) { this.learningStyle = learningStyle; }

    public Map<String, Object> getAiPersonalityProfile() { return aiPersonalityProfile; }
    public void setAiPersonalityProfile(Map<String, Object> aiPersonalityProfile) { this.aiPersonalityProfile = aiPersonalityProfile; }

    public LocalDateTime getJoinDate() { return joinDate; }
    public void setJoinDate(LocalDateTime joinDate) { this.joinDate = joinDate; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}