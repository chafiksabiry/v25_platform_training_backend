package com.trainingplatform.core.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "manual_trainings")
public class ManualTraining {
    private String id;
    private String companyId;
    private String title;
    private String description;
    private String thumbnail;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getCompanyId() { return companyId; }
    public void setCompanyId(String companyId) { this.companyId = companyId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getThumbnail() { return thumbnail; }
    public void setThumbnail(String thumbnail) { this.thumbnail = thumbnail; }
    
    private TrainingMetadata metadata;
    
    @Builder.Default
    private List<String> moduleIds = new ArrayList<>();
    
    private String status; // draft, published, archived
    
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public TrainingMetadata getMetadata() { return metadata; }
    public void setMetadata(TrainingMetadata metadata) { this.metadata = metadata; }
    public List<String> getModuleIds() { return moduleIds; }
    public void setModuleIds(List<String> moduleIds) { this.moduleIds = moduleIds; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TrainingMetadata {
        private String category;
        private String difficulty; // beginner, intermediate, advanced
        private Integer estimatedDuration; // in minutes
        private List<String> tags;
        private List<String> targetRoles;
        private String language;

        public String getCategory() { return category; }
        public void setCategory(String category) { this.category = category; }
        public String getDifficulty() { return difficulty; }
        public void setDifficulty(String difficulty) { this.difficulty = difficulty; }
        public Integer getEstimatedDuration() { return estimatedDuration; }
        public void setEstimatedDuration(Integer estimatedDuration) { this.estimatedDuration = estimatedDuration; }
        public List<String> getTags() { return tags; }
        public void setTags(List<String> tags) { this.tags = tags; }
        public List<String> getTargetRoles() { return targetRoles; }
        public void setTargetRoles(List<String> targetRoles) { this.targetRoles = targetRoles; }
        public String getLanguage() { return language; }
        public void setLanguage(String language) { this.language = language; }
    }
}

