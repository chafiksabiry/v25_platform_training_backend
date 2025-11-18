package com.trainingplatform.presentation.dtos;

import java.util.List;
import java.util.Map;

public class TrainerDashboardDTO {
    private int totalTrainees;
    private int activeTrainees;
    private double completionRate;
    private double averageEngagement;
    private List<TraineeInfo> topPerformers;
    private List<TraineeInfo> strugglingTrainees;
    private List<AIInsight> aiInsights;
    private List<DeadlineInfo> upcomingDeadlines;
    
    // Getters and Setters
    public int getTotalTrainees() {
        return totalTrainees;
    }
    
    public void setTotalTrainees(int totalTrainees) {
        this.totalTrainees = totalTrainees;
    }
    
    public int getActiveTrainees() {
        return activeTrainees;
    }
    
    public void setActiveTrainees(int activeTrainees) {
        this.activeTrainees = activeTrainees;
    }
    
    public double getCompletionRate() {
        return completionRate;
    }
    
    public void setCompletionRate(double completionRate) {
        this.completionRate = completionRate;
    }
    
    public double getAverageEngagement() {
        return averageEngagement;
    }
    
    public void setAverageEngagement(double averageEngagement) {
        this.averageEngagement = averageEngagement;
    }
    
    public List<TraineeInfo> getTopPerformers() {
        return topPerformers;
    }
    
    public void setTopPerformers(List<TraineeInfo> topPerformers) {
        this.topPerformers = topPerformers;
    }
    
    public List<TraineeInfo> getStrugglingTrainees() {
        return strugglingTrainees;
    }
    
    public void setStrugglingTrainees(List<TraineeInfo> strugglingTrainees) {
        this.strugglingTrainees = strugglingTrainees;
    }
    
    public List<AIInsight> getAiInsights() {
        return aiInsights;
    }
    
    public void setAiInsights(List<AIInsight> aiInsights) {
        this.aiInsights = aiInsights;
    }
    
    public List<DeadlineInfo> getUpcomingDeadlines() {
        return upcomingDeadlines;
    }
    
    public void setUpcomingDeadlines(List<DeadlineInfo> upcomingDeadlines) {
        this.upcomingDeadlines = upcomingDeadlines;
    }
    
    // Nested classes
    public static class TraineeInfo {
        private String id;
        private String name;
        private String email;
        private String department;
        private double progress;
        private double engagement;
        private String lastActive;
        
        public String getId() {
            return id;
        }
        
        public void setId(String id) {
            this.id = id;
        }
        
        public String getName() {
            return name;
        }
        
        public void setName(String name) {
            this.name = name;
        }
        
        public String getEmail() {
            return email;
        }
        
        public void setEmail(String email) {
            this.email = email;
        }
        
        public String getDepartment() {
            return department;
        }
        
        public void setDepartment(String department) {
            this.department = department;
        }
        
        public double getProgress() {
            return progress;
        }
        
        public void setProgress(double progress) {
            this.progress = progress;
        }
        
        public double getEngagement() {
            return engagement;
        }
        
        public void setEngagement(double engagement) {
            this.engagement = engagement;
        }
        
        public String getLastActive() {
            return lastActive;
        }
        
        public void setLastActive(String lastActive) {
            this.lastActive = lastActive;
        }
    }
    
    public static class AIInsight {
        private String id;
        private String title;
        private String description;
        private String priority; // high, medium, low
        private List<String> suggestedActions;
        
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
        
        public String getPriority() {
            return priority;
        }
        
        public void setPriority(String priority) {
            this.priority = priority;
        }
        
        public List<String> getSuggestedActions() {
            return suggestedActions;
        }
        
        public void setSuggestedActions(List<String> suggestedActions) {
            this.suggestedActions = suggestedActions;
        }
    }
    
    public static class DeadlineInfo {
        private String traineeId;
        private String traineeName;
        private String task;
        private String dueDate;
        private String riskLevel; // low, medium, high
        
        public String getTraineeId() {
            return traineeId;
        }
        
        public void setTraineeId(String traineeId) {
            this.traineeId = traineeId;
        }
        
        public String getTraineeName() {
            return traineeName;
        }
        
        public void setTraineeName(String traineeName) {
            this.traineeName = traineeName;
        }
        
        public String getTask() {
            return task;
        }
        
        public void setTask(String task) {
            this.task = task;
        }
        
        public String getDueDate() {
            return dueDate;
        }
        
        public void setDueDate(String dueDate) {
            this.dueDate = dueDate;
        }
        
        public String getRiskLevel() {
            return riskLevel;
        }
        
        public void setRiskLevel(String riskLevel) {
            this.riskLevel = riskLevel;
        }
    }
}

