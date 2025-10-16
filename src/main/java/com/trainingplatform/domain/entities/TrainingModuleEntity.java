package com.trainingplatform.domain.entities;

import java.util.List;

public class TrainingModuleEntity {
    
    private String id;
    private String title;
    private String description;
    private int duration; // in minutes
    private String difficulty; // beginner, intermediate, advanced
    
    private List<String> learningObjectives;
    private List<String> prerequisites;
    private List<String> topics;
    
    private List<ModuleContent> content;
    private VideoScript videoScript;
    
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
    
    public int getDuration() {
        return duration;
    }
    
    public void setDuration(int duration) {
        this.duration = duration;
    }
    
    public String getDifficulty() {
        return difficulty;
    }
    
    public void setDifficulty(String difficulty) {
        this.difficulty = difficulty;
    }
    
    public List<String> getLearningObjectives() {
        return learningObjectives;
    }
    
    public void setLearningObjectives(List<String> learningObjectives) {
        this.learningObjectives = learningObjectives;
    }
    
    public List<String> getPrerequisites() {
        return prerequisites;
    }
    
    public void setPrerequisites(List<String> prerequisites) {
        this.prerequisites = prerequisites;
    }
    
    public List<String> getTopics() {
        return topics;
    }
    
    public void setTopics(List<String> topics) {
        this.topics = topics;
    }
    
    public List<ModuleContent> getContent() {
        return content;
    }
    
    public void setContent(List<ModuleContent> content) {
        this.content = content;
    }
    
    public VideoScript getVideoScript() {
        return videoScript;
    }
    
    public void setVideoScript(VideoScript videoScript) {
        this.videoScript = videoScript;
    }
    
    // Nested Classes
    
    public static class ModuleContent {
        private String id;
        private String type; // text, video, quiz, interactive
        private String title;
        private Object content; // Can be String, Map, etc.
        private int duration;
        
        public String getId() {
            return id;
        }
        
        public void setId(String id) {
            this.id = id;
        }
        
        public String getType() {
            return type;
        }
        
        public void setType(String type) {
            this.type = type;
        }
        
        public String getTitle() {
            return title;
        }
        
        public void setTitle(String title) {
            this.title = title;
        }
        
        public Object getContent() {
            return content;
        }
        
        public void setContent(Object content) {
            this.content = content;
        }
        
        public int getDuration() {
            return duration;
        }
        
        public void setDuration(int duration) {
            this.duration = duration;
        }
    }
    
    public static class VideoScript {
        private String title;
        private String description;
        private int duration;
        private String type; // gpt4-script, fallback
        private List<VideoScene> scenes;
        
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
        
        public int getDuration() {
            return duration;
        }
        
        public void setDuration(int duration) {
            this.duration = duration;
        }
        
        public String getType() {
            return type;
        }
        
        public void setType(String type) {
            this.type = type;
        }
        
        public List<VideoScene> getScenes() {
            return scenes;
        }
        
        public void setScenes(List<VideoScene> scenes) {
            this.scenes = scenes;
        }
    }
    
    public static class VideoScene {
        private String timestamp;
        private String title;
        private String visual;
        private String narration;
        private List<String> onScreenText;
        
        public String getTimestamp() {
            return timestamp;
        }
        
        public void setTimestamp(String timestamp) {
            this.timestamp = timestamp;
        }
        
        public String getTitle() {
            return title;
        }
        
        public void setTitle(String title) {
            this.title = title;
        }
        
        public String getVisual() {
            return visual;
        }
        
        public void setVisual(String visual) {
            this.visual = visual;
        }
        
        public String getNarration() {
            return narration;
        }
        
        public void setNarration(String narration) {
            this.narration = narration;
        }
        
        public List<String> getOnScreenText() {
            return onScreenText;
        }
        
        public void setOnScreenText(List<String> onScreenText) {
            this.onScreenText = onScreenText;
        }
    }
}

