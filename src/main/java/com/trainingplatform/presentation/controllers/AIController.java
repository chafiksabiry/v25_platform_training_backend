package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.AIService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
@Slf4j
public class AIController {
    
    private final AIService aiService;
    
    @GetMapping("/check-availability")
    public ResponseEntity<Map<String, Object>> checkAIAvailability() {
        Map<String, Object> response = new HashMap<>();
        
        try {
            boolean available = aiService.checkAIAvailability();
            response.put("available", available);
            response.put("message", available ? 
                "AI service is available" : 
                "AI service is not available. Please configure OpenAI API key.");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error checking AI availability: {}", e.getMessage());
            response.put("available", false);
            response.put("message", "Error checking AI availability: " + e.getMessage());
            return ResponseEntity.ok(response);
        }
    }

    @PostMapping("/generate-training-metadata")
    public ResponseEntity<Map<String, Object>> generateTrainingMetadata(@RequestBody GenerateMetadataRequest request) {
        Map<String, Object> response = new HashMap<>();
        
        try {
            log.info("Generating training metadata from {} files", request.getFiles().size());
            
            // Convert request files to AIService.FileInfo
            List<AIService.FileInfo> files = request.getFiles().stream()
                    .map(f -> new AIService.FileInfo(f.getName(), f.getType(), f.getUrl(), f.getPublicId()))
                    .toList();
            
            Map<String, String> metadata = aiService.generateTrainingMetadata(
                    request.getCompanyName(),
                    request.getIndustry(),
                    request.getGig(),
                    files
            );
            
            response.put("success", true);
            response.put("title", metadata.get("title"));
            response.put("description", metadata.get("description"));
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error generating training metadata: {}", e.getMessage(), e);
            response.put("success", false);
            response.put("message", "Error generating training metadata: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    @PostMapping("/generate-initial-organization")
    public ResponseEntity<Map<String, Object>> generateInitialOrganization(@RequestBody GenerateInitialOrganizationRequest request) {
        Map<String, Object> response = new HashMap<>();
        try {
            int fileCount = request.getFiles() != null ? request.getFiles().size() : 0;
            log.info("Generating initial organization suggestion for {} files", fileCount);
            
            // Convert request FileInfoRequest -> AIService.FileInfo
            List<AIService.FileInfo> files = request.getFiles() != null
                ? request.getFiles().stream()
                    .map(f -> new AIService.FileInfo(f.getName(), f.getType(), f.getUrl(), f.getPublicId()))
                    .toList()
                : List.of();

            // Convert request FileAnalysisRequest -> AIService.FileAnalysis (if analyses exist)
            List<AIService.FileAnalysis> analyses = request.getAnalyses() != null
                ? request.getAnalyses().stream()
                    .map(a -> new AIService.FileAnalysis(a.getFileName(), a.getKeyTopics(), a.getDifficulty(), a.getEstimatedReadTime()))
                    .toList()
                : List.of();
            
            String organization = aiService.generateInitialOrganizationSuggestion(
                files,
                analyses
            );
            
            response.put("success", true);
            response.put("organization", organization);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error generating initial organization: {}", e.getMessage(), e);
            response.put("success", false);
            response.put("error", "Error generating initial organization: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    @PostMapping("/organize-training")
    public ResponseEntity<Map<String, Object>> organizeTraining(@RequestBody OrganizeTrainingRequest request) {
            Map<String, Object> response = new HashMap<>();
        
        try {
            log.info("Organizing training {} with {} files", request.getTrainingId(), request.getFiles().size());
            
            // Convert request files to AIService.FileInfo
            List<AIService.FileInfo> files = request.getFiles().stream()
                    .map(f -> new AIService.FileInfo(f.getName(), f.getType(), f.getUrl(), f.getPublicId()))
                    .toList();
            
            GenerationOptionsRequest options = request.getGenerationOptions();
            boolean generateModuleQuizzes = options != null ? options.getGenerateModuleQuizzes() : false;
            boolean generateFinalExam = options != null ? options.getGenerateFinalExam() : false;
            
            aiService.organizeTrainingContent(
                request.getTrainingId(), 
                files,
                request.getOrganizationInstructions(),
                generateModuleQuizzes,
                generateFinalExam
            );
            
            response.put("success", true);
            response.put("message", "Training content organized successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error organizing training content: {}", e.getMessage(), e);
            response.put("success", false);
            response.put("message", "Error organizing training content: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    public static class GenerateMetadataRequest {
        private String companyName;
        private String industry;
        private String gig;
        private List<FileInfoRequest> files;

        public String getCompanyName() { return companyName; }
        public void setCompanyName(String companyName) { this.companyName = companyName; }

        public String getIndustry() { return industry; }
        public void setIndustry(String industry) { this.industry = industry; }

        public String getGig() { return gig; }
        public void setGig(String gig) { this.gig = gig; }

        public List<FileInfoRequest> getFiles() { return files; }
        public void setFiles(List<FileInfoRequest> files) { this.files = files; }
    }

    public static class OrganizeTrainingRequest {
        private String trainingId;
        private List<FileInfoRequest> files;
        private String organizationInstructions;
        private GenerationOptionsRequest generationOptions;

        public String getTrainingId() { return trainingId; }
        public void setTrainingId(String trainingId) { this.trainingId = trainingId; }

        public List<FileInfoRequest> getFiles() { return files; }
        public void setFiles(List<FileInfoRequest> files) { this.files = files; }

        public String getOrganizationInstructions() { return organizationInstructions; }
        public void setOrganizationInstructions(String organizationInstructions) { 
            this.organizationInstructions = organizationInstructions; 
        }

        public GenerationOptionsRequest getGenerationOptions() { return generationOptions; }
        public void setGenerationOptions(GenerationOptionsRequest generationOptions) {
            this.generationOptions = generationOptions;
        }
    }

    public static class GenerationOptionsRequest {
        private Boolean generateModuleQuizzes;
        private Boolean generateFinalExam;

        public Boolean getGenerateModuleQuizzes() { return generateModuleQuizzes != null ? generateModuleQuizzes : false; }
        public void setGenerateModuleQuizzes(Boolean generateModuleQuizzes) { this.generateModuleQuizzes = generateModuleQuizzes; }

        public Boolean getGenerateFinalExam() { return generateFinalExam != null ? generateFinalExam : false; }
        public void setGenerateFinalExam(Boolean generateFinalExam) { this.generateFinalExam = generateFinalExam; }
    }

    public static class FileInfoRequest {
        private String name;
        private String type;
        private String url;
        private String publicId;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }

        public String getPublicId() { return publicId; }
        public void setPublicId(String publicId) { this.publicId = publicId; }
    }

    public static class GenerateInitialOrganizationRequest {
        private List<FileInfoRequest> files;
        private List<FileAnalysisRequest> analyses;

        public List<FileInfoRequest> getFiles() { return files; }
        public void setFiles(List<FileInfoRequest> files) { this.files = files; }

        public List<FileAnalysisRequest> getAnalyses() { return analyses; }
        public void setAnalyses(List<FileAnalysisRequest> analyses) { this.analyses = analyses; }
    }

    public static class FileAnalysisRequest {
        private String fileName;
        private List<String> keyTopics;
        private Integer difficulty;
        private Integer estimatedReadTime;

        public String getFileName() { return fileName; }
        public void setFileName(String fileName) { this.fileName = fileName; }

        public List<String> getKeyTopics() { return keyTopics; }
        public void setKeyTopics(List<String> keyTopics) { this.keyTopics = keyTopics; }

        public Integer getDifficulty() { return difficulty; }
        public void setDifficulty(Integer difficulty) { this.difficulty = difficulty; }

        public Integer getEstimatedReadTime() { return estimatedReadTime; }
        public void setEstimatedReadTime(Integer estimatedReadTime) { this.estimatedReadTime = estimatedReadTime; }
    }
    
    /**
     * Generate quiz questions using AI for a module
     */
    @PostMapping("/generate-quiz")
    public ResponseEntity<Map<String, Object>> generateQuiz(@RequestBody GenerateQuizRequest request) {
        Map<String, Object> response = new HashMap<>();
        
        try {
            log.info("Generating quiz with {} questions for module", request.getNumberOfQuestions());
            if (request.getQuestionDistribution() != null) {
                log.info("Question distribution: {} QCM, {} True/False, {} Multiple Correct", 
                    request.getQuestionDistribution().get("multipleChoice"),
                    request.getQuestionDistribution().get("trueFalse"),
                    request.getQuestionDistribution().get("multipleCorrect"));
            }
            
            Map<String, Object> result = aiService.generateQuiz(
                    request.getModuleContent(),
                    request.getNumberOfQuestions(),
                    request.getDifficulty(),
                    request.getQuestionTypes(),
                    request.getQuestionDistribution()
            );
            
            // Verify number of questions returned
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> questions = (List<Map<String, Object>>) result.get("questions");
            if (questions != null) {
                log.info("Generated {} questions (requested: {})", questions.size(), request.getNumberOfQuestions());
                if (questions.size() != request.getNumberOfQuestions()) {
                    log.warn("⚠️ Mismatch: Requested {} questions but generated {}", 
                        request.getNumberOfQuestions(), questions.size());
                }
            }
            
            response.put("success", true);
            response.put("data", result);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error generating quiz: {}", e.getMessage(), e);
            response.put("success", false);
            response.put("message", "Error generating quiz: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    /**
     * Generate a final exam for the entire training
     */
    @PostMapping("/generate-final-exam")
    public ResponseEntity<Map<String, Object>> generateFinalExam(@RequestBody GenerateFinalExamRequest request) {
        Map<String, Object> response = new HashMap<>();
        
        try {
            log.info("Generating final exam with {} questions for training {}", 
                request.getNumberOfQuestions(), request.getTrainingId());
            
            Map<String, Object> result = aiService.generateFinalExam(
                    request.getTrainingId(),
                    request.getNumberOfQuestions()
            );
            
            response.put("success", true);
            response.put("data", result);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error generating final exam: {}", e.getMessage(), e);
            response.put("success", false);
            response.put("message", "Error generating final exam: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    public static class GenerateQuizRequest {
        private Map<String, Object> moduleContent;
        private int numberOfQuestions;
        private String difficulty;
        private Map<String, Boolean> questionTypes;
        private Map<String, Object> questionDistribution;
        private String moduleId;
        private String trainingId;

        public Map<String, Object> getModuleContent() { return moduleContent; }
        public void setModuleContent(Map<String, Object> moduleContent) { this.moduleContent = moduleContent; }

        public int getNumberOfQuestions() { return numberOfQuestions; }
        public void setNumberOfQuestions(int numberOfQuestions) { this.numberOfQuestions = numberOfQuestions; }

        public String getDifficulty() { return difficulty; }
        public void setDifficulty(String difficulty) { this.difficulty = difficulty; }

        public Map<String, Boolean> getQuestionTypes() { return questionTypes; }
        public void setQuestionTypes(Map<String, Boolean> questionTypes) { this.questionTypes = questionTypes; }

        public Map<String, Object> getQuestionDistribution() { return questionDistribution; }
        public void setQuestionDistribution(Map<String, Object> questionDistribution) { this.questionDistribution = questionDistribution; }

        public String getModuleId() { return moduleId; }
        public void setModuleId(String moduleId) { this.moduleId = moduleId; }

        public String getTrainingId() { return trainingId; }
        public void setTrainingId(String trainingId) { this.trainingId = trainingId; }
    }
    
    public static class GenerateFinalExamRequest {
        private String trainingId;
        private int numberOfQuestions;

        public String getTrainingId() { return trainingId; }
        public void setTrainingId(String trainingId) { this.trainingId = trainingId; }

        public int getNumberOfQuestions() { return numberOfQuestions; }
        public void setNumberOfQuestions(int numberOfQuestions) { this.numberOfQuestions = numberOfQuestions; }
    }
    
    /**
     * Analyze a document with AI to extract key topics, learning objectives, etc.
     */
    @PostMapping("/analyze-document")
    public ResponseEntity<Map<String, Object>> analyzeDocument(@RequestParam("file") MultipartFile file) {
        Map<String, Object> response = new HashMap<>();
        
        try {
            log.info("Analyzing document: {}", file.getOriginalFilename());
            
            Map<String, Object> analysis = aiService.analyzeDocument(file);
            
            response.put("success", true);
            response.put("analysis", analysis);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error analyzing document: {}", e.getMessage(), e);
            response.put("success", false);
            response.put("error", "Error analyzing document: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    /**
     * Analyze a URL (YouTube or web page) with AI
     */
    @PostMapping("/analyze-url")
    public ResponseEntity<Map<String, Object>> analyzeUrl(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        
        try {
            String url = request.get("url");
            log.info("Analyzing URL: {}", url);
            
            Map<String, Object> analysis = aiService.analyzeUrl(url);
            
            response.put("success", true);
            response.put("analysis", analysis);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error analyzing URL: {}", e.getMessage(), e);
            response.put("success", false);
            response.put("error", "Error analyzing URL: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    /**
     * Generate curriculum structure from files
     */
    @PostMapping("/generate-curriculum")
    public ResponseEntity<Map<String, Object>> generateCurriculum(@RequestBody GenerateCurriculumRequest request) {
        Map<String, Object> response = new HashMap<>();
        
        try {
            log.info("Generating curriculum for training with {} files", 
                request.getFiles() != null ? request.getFiles().size() : 0);
            
            // Convert request files to AIService.FileInfo
            List<AIService.FileInfo> files = request.getFiles() != null
                ? request.getFiles().stream()
                    .map(f -> new AIService.FileInfo(f.getName(), f.getType(), f.getUrl(), f.getPublicId()))
                    .toList()
                : List.of();
            
            // For now, return a simple curriculum structure
            // In a real implementation, this would use AI to analyze files and create modules
            Map<String, Object> curriculum = new HashMap<>();
            curriculum.put("title", request.getTitle() != null ? request.getTitle() : "Training Curriculum");
            curriculum.put("description", request.getDescription() != null ? request.getDescription() : "Generated curriculum");
            curriculum.put("totalModules", files.size());
            curriculum.put("estimatedDuration", files.size() * 60); // 60 minutes per file
            
            response.put("success", true);
            response.put("curriculum", curriculum);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Error generating curriculum: {}", e.getMessage(), e);
            response.put("success", false);
            response.put("error", "Error generating curriculum: " + e.getMessage());
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    public static class GenerateCurriculumRequest {
        private String title;
        private String description;
        private List<FileInfoRequest> files;
        private String companyName;
        private String industry;
        private String gig;

        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }

        public List<FileInfoRequest> getFiles() { return files; }
        public void setFiles(List<FileInfoRequest> files) { this.files = files; }

        public String getCompanyName() { return companyName; }
        public void setCompanyName(String companyName) { this.companyName = companyName; }

        public String getIndustry() { return industry; }
        public void setIndustry(String industry) { this.industry = industry; }

        public String getGig() { return gig; }
        public void setGig(String gig) { this.gig = gig; }
    }
}
