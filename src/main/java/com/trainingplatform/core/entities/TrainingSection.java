package com.trainingplatform.core.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "training_sections")
public class TrainingSection {
    @Id
    private String _id;
    
    private String moduleId; // Reference to TrainingModule (ObjectId)
    private String title;
    private String type; // document, video, text, etc.
    private Integer order; // Order within the module
    
    // Content can be file-based or text-based
    private SectionContent content;
    
    private Integer duration; // in minutes
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SectionContent {
        private String text;
        private SectionFile file;
        private String youtubeUrl;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SectionFile {
        private String id;
        private String name;
        private String type; // pdf, mp4, docx, etc.
        private String url;
        private String publicId;
        private Long size;
        private String mimeType;
    }
}

