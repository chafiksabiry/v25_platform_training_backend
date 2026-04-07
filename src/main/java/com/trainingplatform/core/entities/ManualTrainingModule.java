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

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTrainingId() { return trainingId; }
    public void setTrainingId(String trainingId) { this.trainingId = trainingId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getOrderIndex() { return orderIndex; }
    public void setOrderIndex(Integer orderIndex) { this.orderIndex = orderIndex; }
    
    @Builder.Default
    private List<TrainingSection> sections = new ArrayList<>();

    public List<TrainingSection> getSections() { return sections; }
    public void setSections(List<TrainingSection> sections) { this.sections = sections; }
    
    private Integer estimatedDuration; // in minutes
    
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Integer getEstimatedDuration() { return estimatedDuration; }
    public void setEstimatedDuration(Integer estimatedDuration) { this.estimatedDuration = estimatedDuration; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    
    public static class TrainingSection {
        private String id;
        private String title;
        private String type; // text, video, document, youtube, interactive
        private SectionContent content;
        private Integer orderIndex;
        private Integer estimatedDuration;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public SectionContent getContent() { return content; }
        public void setContent(SectionContent content) { this.content = content; }
        public Integer getOrderIndex() { return orderIndex; }
        public void setOrderIndex(Integer orderIndex) { this.orderIndex = orderIndex; }
        public Integer getEstimatedDuration() { return estimatedDuration; }
        public void setEstimatedDuration(Integer estimatedDuration) { this.estimatedDuration = estimatedDuration; }
    }
    
    public static class SectionContent {
        private String text;
        private ContentFile file;
        private String youtubeUrl;
        private String embedCode;
        private List<String> keyPoints;

        public String getText() { return text; }
        public void setText(String text) { this.text = text; }
        public ContentFile getFile() { return file; }
        public void setFile(ContentFile file) { this.file = file; }
        public String getYoutubeUrl() { return youtubeUrl; }
        public void setYoutubeUrl(String youtubeUrl) { this.youtubeUrl = youtubeUrl; }
        public String getEmbedCode() { return embedCode; }
        public void setEmbedCode(String embedCode) { this.embedCode = embedCode; }
        public List<String> getKeyPoints() { return keyPoints; }
        public void setKeyPoints(List<String> keyPoints) { this.keyPoints = keyPoints; }
    }
    
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ContentFile {
        private String id;
        private String name;
        private String type; // video, pdf, word, image
        private String url; // GCS URL
        private String publicId; // GCS public ID
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

