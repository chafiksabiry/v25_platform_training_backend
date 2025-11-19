package com.trainingplatform.domain.entities;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;

@Document(collection = "training_journeys")
public class TrainingJourneyEntity {
    
    @Id
    private String id;
    
    private String title;
    private String description;
    private String industry;
    private String status; // draft, active, completed, archived
    
    private String companyId;
    private String gigId;
    
    private CompanyInfo company;
    private TrainingVision vision;
    private List<String> moduleIds; // References to TrainingModule documents (ObjectIds)
    private String finalExamId; // Reference to ExamFinalQuiz document (ObjectId) - 0 or 1
    private List<String> enrolledRepIds;
    
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime launchDate;
    
    private LaunchSettings launchSettings;
    private RehearsalData rehearsalData;
    
    // Getters and Setters
    
    public String getId() {
        return id;
    }
    
    public void setId(String id) {
        this.id = id;
    }
    
    public String getTitle() {
        return title;
    }
    
    public void setTitle(String title) {
        this.title = title;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public String getIndustry() {
        return industry;
    }
    
    public void setIndustry(String industry) {
        this.industry = industry;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public String getCompanyId() {
        return companyId;
    }
    
    public void setCompanyId(String companyId) {
        this.companyId = companyId;
    }
    
    public String getGigId() {
        return gigId;
    }
    
    public void setGigId(String gigId) {
        this.gigId = gigId;
    }
    
    public CompanyInfo getCompany() {
        return company;
    }
    
    public void setCompany(CompanyInfo company) {
        this.company = company;
    }
    
    public TrainingVision getVision() {
        return vision;
    }
    
    public void setVision(TrainingVision vision) {
        this.vision = vision;
    }
    
    public List<String> getModuleIds() {
        return moduleIds;
    }
    
    public void setModuleIds(List<String> moduleIds) {
        this.moduleIds = moduleIds;
    }
    
    public String getFinalExamId() {
        return finalExamId;
    }
    
    public void setFinalExamId(String finalExamId) {
        this.finalExamId = finalExamId;
    }
    
    public List<String> getEnrolledRepIds() {
        return enrolledRepIds;
    }
    
    public void setEnrolledRepIds(List<String> enrolledRepIds) {
        this.enrolledRepIds = enrolledRepIds;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
    
    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
    
    public LocalDateTime getLaunchDate() {
        return launchDate;
    }
    
    public void setLaunchDate(LocalDateTime launchDate) {
        this.launchDate = launchDate;
    }
    
    public LaunchSettings getLaunchSettings() {
        return launchSettings;
    }
    
    public void setLaunchSettings(LaunchSettings launchSettings) {
        this.launchSettings = launchSettings;
    }
    
    public RehearsalData getRehearsalData() {
        return rehearsalData;
    }
    
    public void setRehearsalData(RehearsalData rehearsalData) {
        this.rehearsalData = rehearsalData;
    }
    
    // Nested Classes
    
    public static class CompanyInfo {
        private String name;
        private String industry;
        private int teamSize;
        
        public String getName() {
            return name;
        }
        
        public void setName(String name) {
            this.name = name;
        }
        
        public String getIndustry() {
            return industry;
        }
        
        public void setIndustry(String industry) {
            this.industry = industry;
        }
        
        public int getTeamSize() {
            return teamSize;
        }
        
        public void setTeamSize(int teamSize) {
            this.teamSize = teamSize;
        }
    }
    
    public static class TrainingVision {
        private List<String> goals;
        private List<String> challenges;
        private String targetAudience;
        
        public List<String> getGoals() {
            return goals;
        }
        
        public void setGoals(List<String> goals) {
            this.goals = goals;
        }
        
        public List<String> getChallenges() {
            return challenges;
        }
        
        public void setChallenges(List<String> challenges) {
            this.challenges = challenges;
        }
        
        public String getTargetAudience() {
            return targetAudience;
        }
        
        public void setTargetAudience(String targetAudience) {
            this.targetAudience = targetAudience;
        }
    }
    
    public static class LaunchSettings {
        private boolean sendNotifications;
        private boolean allowSelfPaced;
        private boolean enableLiveStreaming;
        private boolean recordSessions;
        private boolean aiTutorEnabled;
        
        public boolean isSendNotifications() {
            return sendNotifications;
        }
        
        public void setSendNotifications(boolean sendNotifications) {
            this.sendNotifications = sendNotifications;
        }
        
        public boolean isAllowSelfPaced() {
            return allowSelfPaced;
        }
        
        public void setAllowSelfPaced(boolean allowSelfPaced) {
            this.allowSelfPaced = allowSelfPaced;
        }
        
        public boolean isEnableLiveStreaming() {
            return enableLiveStreaming;
        }
        
        public void setEnableLiveStreaming(boolean enableLiveStreaming) {
            this.enableLiveStreaming = enableLiveStreaming;
        }
        
        public boolean isRecordSessions() {
            return recordSessions;
        }
        
        public void setRecordSessions(boolean recordSessions) {
            this.recordSessions = recordSessions;
        }
        
        public boolean isAiTutorEnabled() {
            return aiTutorEnabled;
        }
        
        public void setAiTutorEnabled(boolean aiTutorEnabled) {
            this.aiTutorEnabled = aiTutorEnabled;
        }
    }
    
    public static class RehearsalData {
        private int rating;
        private int modulesCompleted;
        private List<String> feedback;
        
        public int getRating() {
            return rating;
        }
        
        public void setRating(int rating) {
            this.rating = rating;
        }
        
        public int getModulesCompleted() {
            return modulesCompleted;
        }
        
        public void setModulesCompleted(int modulesCompleted) {
            this.modulesCompleted = modulesCompleted;
        }
        
        public List<String> getFeedback() {
            return feedback;
        }
        
        public void setFeedback(List<String> feedback) {
            this.feedback = feedback;
        }
    }
}

