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
    private List<TrainingModuleEntity> modules; // Embedded modules with sections and quizzes
    private FinalExamEntity finalExam; // Embedded final exam (0 or 1)
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
    
    public List<TrainingModuleEntity> getModules() {
        return modules;
    }
    
    public void setModules(List<TrainingModuleEntity> modules) {
        this.modules = modules;
    }
    
    public FinalExamEntity getFinalExam() {
        return finalExam;
    }
    
    public void setFinalExam(FinalExamEntity finalExam) {
        this.finalExam = finalExam;
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
    
    // Embedded Module Entity
    public static class TrainingModuleEntity {
        private String _id; // Auto-generated ObjectId
        private String title;
        private String description;
        private Integer duration; // in minutes
        private String difficulty; // beginner, intermediate, advanced
        private List<String> learningObjectives = new java.util.ArrayList<>();
        private List<String> prerequisites = new java.util.ArrayList<>();
        private List<String> topics = new java.util.ArrayList<>();
        private List<SectionEntity> sections = new java.util.ArrayList<>();
        private List<QuizEntity> quizzes = new java.util.ArrayList<>();
        private Integer order; // Order within the training journey
        
        // Getters and Setters
        public String get_id() { return _id; }
        public void set_id(String _id) { this._id = _id; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public Integer getDuration() { return duration; }
        public void setDuration(Integer duration) { this.duration = duration; }
        public String getDifficulty() { return difficulty; }
        public void setDifficulty(String difficulty) { this.difficulty = difficulty; }
        public List<String> getLearningObjectives() { return learningObjectives; }
        public void setLearningObjectives(List<String> learningObjectives) { this.learningObjectives = learningObjectives; }
        public List<String> getPrerequisites() { return prerequisites; }
        public void setPrerequisites(List<String> prerequisites) { this.prerequisites = prerequisites; }
        public List<String> getTopics() { return topics; }
        public void setTopics(List<String> topics) { this.topics = topics; }
        public List<SectionEntity> getSections() { return sections; }
        public void setSections(List<SectionEntity> sections) { this.sections = sections; }
        public List<QuizEntity> getQuizzes() { return quizzes; }
        public void setQuizzes(List<QuizEntity> quizzes) { this.quizzes = quizzes; }
        public Integer getOrder() { return order; }
        public void setOrder(Integer order) { this.order = order; }
    }
    
    // Embedded Section Entity
    public static class SectionEntity {
        private String _id; // Auto-generated ObjectId
        private String title;
        private String type; // document, video, text, etc.
        private Integer order; // Order within the module
        private SectionContent content;
        private Integer duration; // in minutes
        
        // Getters and Setters
        public String get_id() { return _id; }
        public void set_id(String _id) { this._id = _id; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public Integer getOrder() { return order; }
        public void setOrder(Integer order) { this.order = order; }
        public SectionContent getContent() { return content; }
        public void setContent(SectionContent content) { this.content = content; }
        public Integer getDuration() { return duration; }
        public void setDuration(Integer duration) { this.duration = duration; }
    }
    
    // Section Content
    public static class SectionContent {
        private String text;
        private SectionFile file;
        private String youtubeUrl;
        
        public String getText() { return text; }
        public void setText(String text) { this.text = text; }
        public SectionFile getFile() { return file; }
        public void setFile(SectionFile file) { this.file = file; }
        public String getYoutubeUrl() { return youtubeUrl; }
        public void setYoutubeUrl(String youtubeUrl) { this.youtubeUrl = youtubeUrl; }
    }
    
    // Section File
    public static class SectionFile {
        private String id;
        private String name;
        private String type; // pdf, mp4, docx, etc.
        private String url;
        private String publicId;
        private Long size;
        private String mimeType;
        
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }
        public String getPublicId() { return publicId; }
        public void setPublicId(String publicId) { this.publicId = publicId; }
        public Long getSize() { return size; }
        public void setSize(Long size) { this.size = size; }
        public String getMimeType() { return mimeType; }
        public void setMimeType(String mimeType) { this.mimeType = mimeType; }
    }
    
    // Embedded Quiz Entity (for module quizzes)
    public static class QuizEntity {
        private String _id; // Auto-generated ObjectId
        private String title;
        private String description;
        private List<QuizQuestion> questions = new java.util.ArrayList<>();
        private Integer passingScore; // percentage
        private Integer timeLimit; // in minutes, null for unlimited
        private Integer maxAttempts;
        private QuizSettings settings;
        
        // Getters and Setters
        public String get_id() { return _id; }
        public void set_id(String _id) { this._id = _id; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public List<QuizQuestion> getQuestions() { return questions; }
        public void setQuestions(List<QuizQuestion> questions) { this.questions = questions; }
        public Integer getPassingScore() { return passingScore; }
        public void setPassingScore(Integer passingScore) { this.passingScore = passingScore; }
        public Integer getTimeLimit() { return timeLimit; }
        public void setTimeLimit(Integer timeLimit) { this.timeLimit = timeLimit; }
        public Integer getMaxAttempts() { return maxAttempts; }
        public void setMaxAttempts(Integer maxAttempts) { this.maxAttempts = maxAttempts; }
        public QuizSettings getSettings() { return settings; }
        public void setSettings(QuizSettings settings) { this.settings = settings; }
    }
    
    // Final Exam Entity
    public static class FinalExamEntity {
        private String _id; // Auto-generated ObjectId
        private String title;
        private String description;
        private List<QuizQuestion> questions = new java.util.ArrayList<>();
        private Integer passingScore; // percentage
        private Integer timeLimit; // in minutes, null for unlimited
        private Integer maxAttempts;
        private QuizSettings settings;
        
        // Getters and Setters
        public String get_id() { return _id; }
        public void set_id(String _id) { this._id = _id; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public List<QuizQuestion> getQuestions() { return questions; }
        public void setQuestions(List<QuizQuestion> questions) { this.questions = questions; }
        public Integer getPassingScore() { return passingScore; }
        public void setPassingScore(Integer passingScore) { this.passingScore = passingScore; }
        public Integer getTimeLimit() { return timeLimit; }
        public void setTimeLimit(Integer timeLimit) { this.timeLimit = timeLimit; }
        public Integer getMaxAttempts() { return maxAttempts; }
        public void setMaxAttempts(Integer maxAttempts) { this.maxAttempts = maxAttempts; }
        public QuizSettings getSettings() { return settings; }
        public void setSettings(QuizSettings settings) { this.settings = settings; }
    }
    
    // Quiz Question (shared by QuizEntity and FinalExamEntity)
    public static class QuizQuestion {
        private String _id;
        private String question;
        private String type; // multiple-choice, true-false, short-answer, essay
        private List<String> options;
        private Object correctAnswer; // Can be String, Integer, Boolean, or List<Integer>
        private String explanation;
        private Integer points;
        private Integer orderIndex;
        private String imageUrl;
        
        public String get_id() { return _id; }
        public void set_id(String _id) { this._id = _id; }
        public String getQuestion() { return question; }
        public void setQuestion(String question) { this.question = question; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public List<String> getOptions() { return options; }
        public void setOptions(List<String> options) { this.options = options; }
        public Object getCorrectAnswer() { return correctAnswer; }
        public void setCorrectAnswer(Object correctAnswer) { this.correctAnswer = correctAnswer; }
        public String getExplanation() { return explanation; }
        public void setExplanation(String explanation) { this.explanation = explanation; }
        public Integer getPoints() { return points; }
        public void setPoints(Integer points) { this.points = points; }
        public Integer getOrderIndex() { return orderIndex; }
        public void setOrderIndex(Integer orderIndex) { this.orderIndex = orderIndex; }
        public String getImageUrl() { return imageUrl; }
        public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    }
    
    // Quiz Settings (shared by QuizEntity and FinalExamEntity)
    public static class QuizSettings {
        private Boolean shuffleQuestions;
        private Boolean shuffleOptions;
        private Boolean showCorrectAnswers;
        private Boolean allowReview;
        private Boolean showExplanations;
        
        public Boolean getShuffleQuestions() { return shuffleQuestions; }
        public void setShuffleQuestions(Boolean shuffleQuestions) { this.shuffleQuestions = shuffleQuestions; }
        public Boolean getShuffleOptions() { return shuffleOptions; }
        public void setShuffleOptions(Boolean shuffleOptions) { this.shuffleOptions = shuffleOptions; }
        public Boolean getShowCorrectAnswers() { return showCorrectAnswers; }
        public void setShowCorrectAnswers(Boolean showCorrectAnswers) { this.showCorrectAnswers = showCorrectAnswers; }
        public Boolean getAllowReview() { return allowReview; }
        public void setAllowReview(Boolean allowReview) { this.allowReview = allowReview; }
        public Boolean getShowExplanations() { return showExplanations; }
        public void setShowExplanations(Boolean showExplanations) { this.showExplanations = showExplanations; }
    }
}

