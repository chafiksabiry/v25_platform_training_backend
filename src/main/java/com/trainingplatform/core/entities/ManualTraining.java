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
    @Id
    private String id;
    
    private String companyId;
    private String title;
    private String description;
    private String thumbnail;
    
    private TrainingMetadata metadata;
    
    @Builder.Default
    private List<String> moduleIds = new ArrayList<>();
    
    private String status; // draft, published, archived
    
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
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
    }
}

