package com.trainingplatform.domain.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;

@Document(collection = "training_presentations")
public class TrainingPresentationEntity {
    
    @Id
    private String id;
    
    private String title;
    private String description;
    private String companyId;
    private String gigId;
    
    private List<SlideEntity> slides;
    private Integer totalSlides;
    private String estimatedTime;
    private String cloudinaryUrl;
    
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    // Getters and Setters
    
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public String getCompanyId() { return companyId; }
    public void setCompanyId(String companyId) { this.companyId = companyId; }
    
    public String getGigId() { return gigId; }
    public void setGigId(String gigId) { this.gigId = gigId; }
    
    public List<SlideEntity> getSlides() { return slides; }
    public void setSlides(List<SlideEntity> slides) { this.slides = slides; }
    
    public Integer getTotalSlides() { return totalSlides; }
    public void setTotalSlides(Integer totalSlides) { this.totalSlides = totalSlides; }
    
    public String getEstimatedTime() { return estimatedTime; }
    public void setEstimatedTime(String estimatedTime) { this.estimatedTime = estimatedTime; }
    
    public String getCloudinaryUrl() { return cloudinaryUrl; }
    public void setCloudinaryUrl(String cloudinaryUrl) { this.cloudinaryUrl = cloudinaryUrl; }
    
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    
    public static class SlideEntity {
        private Integer id;
        private String type; // cover, agenda, content, exercise, conclusion
        private String title;
        private String subtitle;
        private String content;
        private List<String> bullets;
        private String note;
        private String icon;
        private String highlight;
        private String imageUrl;
        
        // Getters and Setters
        public Integer getId() { return id; }
        public void setId(Integer id) { this.id = id; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getSubtitle() { return subtitle; }
        public void setSubtitle(String subtitle) { this.subtitle = subtitle; }
        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
        public List<String> getBullets() { return bullets; }
        public void setBullets(List<String> bullets) { this.bullets = bullets; }
        public String getNote() { return note; }
        public void setNote(String note) { this.note = note; }
        public String getIcon() { return icon; }
        public void setIcon(String icon) { this.icon = icon; }
        public String getHighlight() { return highlight; }
        public void setHighlight(String highlight) { this.highlight = highlight; }
        public String getImageUrl() { return imageUrl; }
        public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    }
}
