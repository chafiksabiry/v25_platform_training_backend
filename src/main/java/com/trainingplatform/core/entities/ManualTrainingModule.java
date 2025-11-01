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
@Document(collection = "manual_training_modules")
public class ManualTrainingModule {
    @Id
    private String id;
    
    private String trainingId;
    private String title;
    private String description;
    private Integer orderIndex;
    
    @Builder.Default
    private List<TrainingSection> sections = new ArrayList<>();
    
    @Builder.Default
    private List<String> quizIds = new ArrayList<>();
    
    private Integer estimatedDuration; // in minutes
    
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TrainingSection {
        private String id;
        private String title;
        private String type; // text, video, document, youtube, interactive
        private SectionContent content;
        private Integer orderIndex;
        private Integer estimatedDuration;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SectionContent {
        private String text;
        private ContentFile file;
        private String youtubeUrl;
        private String embedCode;
        private List<String> keyPoints;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ContentFile {
        private String id;
        private String name;
        private String type; // video, pdf, word, image
        private String url; // Cloudinary URL
        private String publicId; // Cloudinary public ID
        private String thumbnailUrl;
        private Long size; // in bytes
        private String mimeType;
        private FileMetadata metadata;
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FileMetadata {
        private Integer duration; // for videos in seconds
        private Integer pageCount; // for documents
        private Integer width; // for images/videos
        private Integer height; // for images/videos
        private String format;
    }
}

