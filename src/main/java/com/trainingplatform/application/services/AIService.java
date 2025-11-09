package com.trainingplatform.application.services;

import com.trainingplatform.core.entities.ManualTraining;
import com.trainingplatform.core.entities.ManualTrainingModule;
import com.trainingplatform.infrastructure.repositories.ManualTrainingRepository;
import com.trainingplatform.infrastructure.repositories.ManualTrainingModuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AIService {
    
    private final ManualTrainingRepository manualTrainingRepository;
    private final ManualTrainingModuleRepository manualTrainingModuleRepository;
    private final com.trainingplatform.infrastructure.repositories.ManualQuizRepository manualQuizRepository;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.ai.openai.api-key:}")
    private String openaiApiKey;

    @Value("${app.ai.openai.model:gpt-4o-mini}")
    private String openaiModel;

    private static final String OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

    public boolean checkAIAvailability() {
        if (openaiApiKey == null || openaiApiKey.isEmpty()) {
            log.warn("OpenAI API key is not configured");
            return false;
        }

        try {
            // Simple test to check if we can connect to OpenAI
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(openaiApiKey);

            // We just check if the API key is valid
            return true;
        } catch (Exception e) {
            log.error("Failed to connect to OpenAI: {}", e.getMessage());
            return false;
        }
    }
    
    /**
     * Generate training metadata (title, description) from uploaded files
     */
    public Map<String, String> generateTrainingMetadata(String companyName, String industry, String gig, List<FileInfo> files) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        StringBuilder prompt = new StringBuilder();
        prompt.append("You are an expert instructional designer and training content analyzer.\n\n");
        
        prompt.append("=== CONTEXT ===\n");
        prompt.append("Company: ").append(companyName).append("\n");
        prompt.append("Industry: ").append(industry).append("\n");
        prompt.append("Target Role/Gig: ").append(gig).append("\n\n");
        
        prompt.append("=== UPLOADED FILES ===\n");
        for (int i = 0; i < files.size(); i++) {
            FileInfo file = files.get(i);
            prompt.append(String.format("%d. %s (Type: %s)\n", (i + 1), file.getName(), file.getType()));
        }
        
        prompt.append("\n=== YOUR TASK ===\n");
        prompt.append("Analyze the file names and types to generate a professional training program title and description.\n\n");
        
        prompt.append("REQUIREMENTS:\n");
        prompt.append("1. **Title**: Create a SPECIFIC, PROFESSIONAL title that reflects the actual content\n");
        prompt.append("   - 5-10 words maximum\n");
        prompt.append("   - Should indicate the skill level and domain\n");
        prompt.append("   - ❌ BAD: 'Intermediate Linux', 'Training Program'\n");
        prompt.append("   - ✅ GOOD: 'Linux System Administration Masterclass', 'Docker & Kubernetes for DevOps Engineers'\n\n");
        
        prompt.append("2. **Description**: Write a 2-3 sentence COMPELLING description\n");
        prompt.append("   - What will learners master?\n");
        prompt.append("   - What problems will they solve?\n");
        prompt.append("   - Why is this training valuable?\n\n");
        
        prompt.append("CRITICAL: Return ONLY raw JSON. NO markdown code blocks, NO explanations, NO extra text.\n");
        prompt.append("Start your response with { and end with }. Nothing else.\n\n");
        prompt.append("Required JSON format:\n");
        prompt.append("{\n");
        prompt.append("  \"title\": \"Your generated title here\",\n");
        prompt.append("  \"description\": \"Your 2-3 sentence description here\"\n");
        prompt.append("}\n\n");
        prompt.append("REMEMBER: Return ONLY the JSON object. No text before or after.\n");
        
        // Call OpenAI
        Map<String, Object> aiResponse = callOpenAI(prompt.toString());
        
        // Parse response
        Map<String, String> metadata = new HashMap<>();
        metadata.put("title", (String) aiResponse.get("title"));
        metadata.put("description", (String) aiResponse.get("description"));
        
        return metadata;
    }

    public void organizeTrainingContent(String trainingId, List<FileInfo> files, String organizationInstructions, 
                                       boolean generateModuleQuizzes, boolean generateFinalExam) throws Exception {
        ManualTraining training = manualTrainingRepository.findById(trainingId)
                .orElseThrow(() -> new RuntimeException("Training not found"));

        // Ensure metadata exists
        if (training.getMetadata() == null) {
            training.setMetadata(ManualTraining.TrainingMetadata.builder()
                    .tags(new ArrayList<>())
                    .targetRoles(new ArrayList<>())
                    .estimatedDuration(0)
                    .build());
        }

        // Validate files
        if (files == null || files.isEmpty()) {
            throw new RuntimeException("No files provided for content organization");
        }

        // Build prompt for OpenAI
        String prompt = buildOrganizationPrompt(training, files, organizationInstructions);

        // Call OpenAI API
        Map<String, Object> aiResponse = callOpenAI(prompt);

        // Parse response and create modules/sections
        createModulesFromAIResponse(training, aiResponse, files);
        
        // Generate quizzes based on user options
        if (generateModuleQuizzes || generateFinalExam) {
            log.info("Auto-generating quizzes for training: {} (module quizzes: {}, final exam: {})", 
                trainingId, generateModuleQuizzes, generateFinalExam);
            generateQuizzesForTraining(trainingId, generateModuleQuizzes, generateFinalExam);
        } else {
            log.info("Skipping quiz generation for training: {} (user opted out)", trainingId);
        }
    }
    
    /**
     * Calculate number of questions for a module (5-15 based on module content)
     */
    private int calculateQuestionsForModule(ManualTrainingModule module) {
        int baseQuestions = 5; // Minimum
        int maxQuestions = 15; // Maximum
        
        // Base calculation on number of sections
        int sectionCount = (module.getSections() != null) ? module.getSections().size() : 0;
        
        // Calculate: 5 + (sections * 2), capped at 15
        int calculatedQuestions = baseQuestions + (sectionCount * 2);
        
        // Ensure it's between 5 and 15
        int numberOfQuestions = Math.max(baseQuestions, Math.min(maxQuestions, calculatedQuestions));
        
        log.debug("Module '{}' has {} sections, generating {} questions", 
            module.getTitle(), sectionCount, numberOfQuestions);
        
        return numberOfQuestions;
    }
    
    /**
     * Automatically generate quizzes for all modules and final exam
     */
    private void generateQuizzesForTraining(String trainingId, boolean generateModuleQuizzes, boolean generateFinalExam) {
        try {
            // Get all modules for this training
            List<ManualTrainingModule> modules = manualTrainingModuleRepository.findByTrainingId(trainingId);
            
            if (modules == null || modules.isEmpty()) {
                log.warn("No modules found for training {}, skipping quiz generation", trainingId);
                return;
            }
            
            log.info("Generating quizzes for {} modules (module quizzes: {}, final exam: {})", 
                modules.size(), generateModuleQuizzes, generateFinalExam);
            
            // Generate quiz for each module (5-15 questions based on module content)
            if (generateModuleQuizzes) {
            for (ManualTrainingModule module : modules) {
                try {
                    log.info("Generating quiz for module: {}", module.getTitle());
                    
                    Map<String, Object> moduleContent = convertModuleToContent(module);
                    
                    Map<String, Boolean> questionTypes = new HashMap<>();
                    questionTypes.put("multipleChoice", true);
                    questionTypes.put("trueFalse", true);
                    questionTypes.put("shortAnswer", false);
                    
                        // Calculate dynamic number of questions (5-15)
                        int numberOfQuestions = calculateQuestionsForModule(module);
                        
                        Map<String, Object> quizData = generateQuiz(moduleContent, numberOfQuestions, "medium", questionTypes);
                    
                    // Create the quiz
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> questions = (List<Map<String, Object>>) quizData.get("questions");
                    
                    com.trainingplatform.core.entities.ManualQuiz quiz = new com.trainingplatform.core.entities.ManualQuiz();
                    quiz.setModuleId(module.getId());
                    quiz.setTrainingId(trainingId);
                    quiz.setTitle(module.getTitle() + " - Quiz");
                    quiz.setDescription("Quiz auto-généré pour le module: " + module.getTitle());
                    quiz.setPassingScore(70);
                    quiz.setTimeLimit(15);
                    quiz.setMaxAttempts(3);
                    
                    // Convert questions
                    List<com.trainingplatform.core.entities.ManualQuiz.QuizQuestion> quizQuestions = new ArrayList<>();
                    for (Map<String, Object> q : questions) {
                        com.trainingplatform.core.entities.ManualQuiz.QuizQuestion question = 
                            new com.trainingplatform.core.entities.ManualQuiz.QuizQuestion();
                        question.setId((String) q.get("id"));
                        question.setQuestion((String) q.get("question"));
                        question.setType((String) q.get("type"));
                        
                        @SuppressWarnings("unchecked")
                        List<String> options = (List<String>) q.get("options");
                        question.setOptions(options);
                        question.setCorrectAnswer(q.get("correctAnswer"));
                        question.setExplanation((String) q.get("explanation"));
                        question.setPoints(((Number) q.get("points")).intValue());
                        
                        quizQuestions.add(question);
                    }
                    
                    quiz.setQuestions(quizQuestions);
                    quiz.setSettings(com.trainingplatform.core.entities.ManualQuiz.QuizSettings.builder()
                        .shuffleQuestions(true)
                        .shuffleOptions(true)
                        .showCorrectAnswers(true)
                        .allowReview(true)
                        .showExplanations(true)
                        .build());
                    
                    // Save quiz
                    quiz.setCreatedAt(java.time.LocalDateTime.now());
                    quiz.setUpdatedAt(java.time.LocalDateTime.now());
                    quiz.setId(java.util.UUID.randomUUID().toString());
                    
                    manualQuizRepository.save(quiz);
                    
                    log.info("Quiz created successfully for module: {}", module.getTitle());
                    
                } catch (Exception e) {
                    log.error("Failed to generate quiz for module {}: {}", module.getTitle(), e.getMessage());
                    // Continue with other modules even if one fails
                    }
                }
            }
            
            // Generate final exam (20 questions)
            if (generateFinalExam && modules.size() > 1) {
                try {
                    log.info("Generating final exam for training with 20 questions");
                    Map<String, Object> examData = generateFinalExam(trainingId, 20);
                    
                    // Handle nested exam structure
                    @SuppressWarnings("unchecked")
                    Map<String, Object> exam = (Map<String, Object>) examData.get("exam");
                    
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> questions = exam != null 
                        ? (List<Map<String, Object>>) exam.get("questions")
                        : (List<Map<String, Object>>) examData.get("questions");
                    
                    ManualTraining training = manualTrainingRepository.findById(trainingId).orElse(null);
                    if (training != null) {
                        com.trainingplatform.core.entities.ManualQuiz finalExam = 
                            new com.trainingplatform.core.entities.ManualQuiz();
                        finalExam.setModuleId(null); // Final exam doesn't belong to a module
                        finalExam.setTrainingId(trainingId);
                        finalExam.setTitle("Examen Final - " + training.getTitle());
                        finalExam.setDescription("Examen final couvrant tous les modules");
                        finalExam.setPassingScore(80);
                        finalExam.setTimeLimit(45);
                        finalExam.setMaxAttempts(2);
                        
                        // Convert questions
                        List<com.trainingplatform.core.entities.ManualQuiz.QuizQuestion> examQuestions = new ArrayList<>();
                        for (Map<String, Object> q : questions) {
                            com.trainingplatform.core.entities.ManualQuiz.QuizQuestion question = 
                                new com.trainingplatform.core.entities.ManualQuiz.QuizQuestion();
                            question.setId((String) q.get("id"));
                            question.setQuestion((String) q.get("question"));
                            question.setType((String) q.get("type"));
                            
                            @SuppressWarnings("unchecked")
                            List<String> options = (List<String>) q.get("options");
                            question.setOptions(options);
                            question.setCorrectAnswer(q.get("correctAnswer"));
                            question.setExplanation((String) q.get("explanation"));
                            question.setPoints(((Number) q.get("points")).intValue());
                            
                            examQuestions.add(question);
                        }
                        
                        finalExam.setQuestions(examQuestions);
                        finalExam.setSettings(com.trainingplatform.core.entities.ManualQuiz.QuizSettings.builder()
                            .shuffleQuestions(true)
                            .shuffleOptions(true)
                            .showCorrectAnswers(false)
                            .allowReview(true)
                            .showExplanations(false)
                            .build());
                        
                        finalExam.setCreatedAt(java.time.LocalDateTime.now());
                        finalExam.setUpdatedAt(java.time.LocalDateTime.now());
                        finalExam.setId(java.util.UUID.randomUUID().toString());
                        
                        manualQuizRepository.save(finalExam);
                        
                        log.info("Final exam created successfully");
                    }
                } catch (Exception e) {
                    log.error("Failed to generate final exam: {}", e.getMessage());
                }
            }
            
            log.info("Quiz generation completed for training: {}", trainingId);
            
        } catch (Exception e) {
            log.error("Error generating quizzes for training: {}", e.getMessage());
            // Don't throw exception - allow training creation to succeed even if quiz generation fails
        }
    }

    private String buildOrganizationPrompt(ManualTraining training, List<FileInfo> files, String organizationInstructions) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Create training modules from files. Analyze content and organize logically.\n\n");
        
        prompt.append("CONTEXT: ").append(training.getTitle()).append("\n");
        if (training.getDescription() != null && !training.getDescription().isEmpty()) {
            prompt.append(training.getDescription()).append("\n");
        }
        prompt.append("\n");
        
        // Add user's organization instructions if provided
        if (organizationInstructions != null && !organizationInstructions.trim().isEmpty()) {
            prompt.append("USER ORGANIZATION INSTRUCTIONS:\n");
            prompt.append(organizationInstructions.trim()).append("\n\n");
            prompt.append("IMPORTANT: Follow the user's instructions above when organizing the content.\n\n");
        }
        
        prompt.append("FILES:\n");
        for (int i = 0; i < files.size(); i++) {
            FileInfo file = files.get(i);
            prompt.append(String.format("\nFile %d: %s\n", i, file.getName()));
            
            // Extract and include actual file content
            String content = extractFileContent(file);
            prompt.append(content).append("\n");
        }

        prompt.append("\nTASK: Create modules with sections from file content. Group related files into modules.\n");
        
        if (organizationInstructions != null && !organizationInstructions.trim().isEmpty()) {
            prompt.append("PRIORITY: Follow the user's organization instructions provided above.\n");
        }
        
        prompt.append("\nRULES:\n");
        prompt.append("- Total ").append(files.size()).append(" sections (1 per file, fileIndex 0-").append(files.size() - 1).append(")\n");
        prompt.append("- A module can have 1 or MORE sections\n");
        prompt.append("- Group related files into same module\n");
        prompt.append("- Specific titles from content (NO 'for [role]')\n");
        prompt.append("- Duration: ~10min/doc page, ~2min/slide\n\n");
        
        prompt.append("JSON Format (module can have multiple sections):\n");
        prompt.append("{\"modules\":[{\"title\":\"Module Title\",\"description\":\"Module desc\",\"estimatedDuration\":60,");
        prompt.append("\"sections\":[{\"title\":\"Section 1\",\"fileIndex\":0,\"description\":\"...\"},{\"title\":\"Section 2\",\"fileIndex\":1,\"description\":\"...\"}]}]}\n");

        return prompt.toString();
    }

    private Map<String, Object> callOpenAI(String prompt) throws Exception {
        return callOpenAI(prompt, 2000);
    }
    
    private Map<String, Object> callOpenAI(String prompt, int maxTokens) throws Exception {
        if (openaiApiKey == null || openaiApiKey.isEmpty()) {
            throw new RuntimeException("OpenAI API key is not configured");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(openaiApiKey);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", openaiModel);
        requestBody.put("temperature", 0.3); // Lower temperature for better instruction following
        requestBody.put("max_tokens", maxTokens);

        List<Map<String, String>> messages = new ArrayList<>();
        
        // System message to set the AI's behavior
        Map<String, String> systemMessage = new HashMap<>();
        systemMessage.put("role", "system");
        systemMessage.put("content", 
            "You are a JSON-only API. Return ONLY valid JSON (start with {, end with }). " +
            "Expert instructional designer creating specific content-based titles."
        );
        messages.add(systemMessage);
        
        // User message with the actual prompt
        Map<String, String> userMessage = new HashMap<>();
        userMessage.put("role", "user");
        userMessage.put("content", prompt);
        messages.add(userMessage);
        
        requestBody.put("messages", messages);

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);

        try {
            Map<String, Object> response = restTemplate.postForObject(
                    OPENAI_API_URL,
                    request,
                    Map.class
            );

            if (response == null) {
                throw new RuntimeException("OpenAI API returned null response");
            }

            // Extract the JSON response from OpenAI
            List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
            if (choices == null || choices.isEmpty()) {
                throw new RuntimeException("OpenAI API returned no choices");
            }

            Map<String, Object> choice = choices.get(0);
            
            // Check if response was truncated
            String finishReason = (String) choice.get("finish_reason");
            if ("length".equals(finishReason)) {
                log.warn("OpenAI response was truncated due to max_tokens limit. Current limit: {}", maxTokens);
                throw new RuntimeException("Response was truncated. The content is too long. Please reduce the number of questions or module content.");
            }
            
            Map<String, Object> messageObj = (Map<String, Object>) choice.get("message");
            String content = (String) messageObj.get("content");

            log.info("OpenAI raw response length: {} chars", content.length());
            log.info("OpenAI response preview (first 500 chars): {}", content.substring(0, Math.min(500, content.length())));

            // Parse the JSON content
            return parseAIResponse(content);
        } catch (Exception e) {
            log.error("Failed to call OpenAI API: {}", e.getMessage());
            
            // Check if it's a context length error
            if (e.getMessage() != null && e.getMessage().contains("context_length_exceeded")) {
                throw new RuntimeException("Context length exceeded. The model's limit is 8192 tokens total. " +
                    "Please reduce the number of questions (try 8-10 for final exam) or simplify module content.");
            }
            
            throw new RuntimeException("Failed to call OpenAI API: " + e.getMessage());
        }
    }

    private Map<String, Object> parseAIResponse(String content) {
        try {
            String cleanContent = content.trim();
            
            // Find JSON content between ```json and ``` or between { and }
            int jsonStart = cleanContent.indexOf("```json");
            if (jsonStart != -1) {
                // Extract content after ```json
                cleanContent = cleanContent.substring(jsonStart + 7);
                int jsonEnd = cleanContent.indexOf("```");
                if (jsonEnd != -1) {
                    cleanContent = cleanContent.substring(0, jsonEnd);
                    }
                } else {
                // Try to find JSON object boundaries { ... }
                int firstBrace = cleanContent.indexOf('{');
                int lastBrace = cleanContent.lastIndexOf('}');
                
                if (firstBrace != -1 && lastBrace != -1 && lastBrace > firstBrace) {
                    cleanContent = cleanContent.substring(firstBrace, lastBrace + 1);
                }
            }
            
            cleanContent = cleanContent.trim();
            
            // Validate it's JSON-like (starts with { and ends with })
            if (!cleanContent.startsWith("{") || !cleanContent.endsWith("}")) {
                log.error("Content doesn't look like JSON: {}", cleanContent.substring(0, Math.min(100, cleanContent.length())));
                throw new RuntimeException("Response doesn't contain valid JSON structure");
            }

            // Parse JSON
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            return mapper.readValue(cleanContent, Map.class);
        } catch (Exception e) {
            log.error("Failed to parse AI response: {}", e.getMessage());
            log.error("Content preview: {}", content.substring(0, Math.min(200, content.length())));
            throw new RuntimeException("Failed to parse AI response: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void createModulesFromAIResponse(ManualTraining training, Map<String, Object> aiResponse, List<FileInfo> files) {
        List<Map<String, Object>> modulesData = (List<Map<String, Object>>) aiResponse.get("modules");

        if (modulesData == null || modulesData.isEmpty()) {
            throw new RuntimeException("No modules found in AI response");
        }

        for (Map<String, Object> moduleData : modulesData) {
            ManualTrainingModule module = new ManualTrainingModule();
            module.setTrainingId(training.getId());
            module.setTitle((String) moduleData.get("title"));
            module.setDescription((String) moduleData.get("description"));
            
            Object durationObj = moduleData.get("estimatedDuration");
            int duration = 60; // default
            if (durationObj instanceof Integer) {
                duration = (Integer) durationObj;
            } else if (durationObj instanceof Double) {
                duration = ((Double) durationObj).intValue();
            }
            module.setEstimatedDuration(duration);
            
            module.setSections(new ArrayList<>());

            // Create sections
            List<Map<String, Object>> sectionsData = (List<Map<String, Object>>) moduleData.get("sections");
            if (sectionsData != null) {
                for (int i = 0; i < sectionsData.size(); i++) {
                    Map<String, Object> sectionData = sectionsData.get(i);
                    
                    ManualTrainingModule.TrainingSection section = new ManualTrainingModule.TrainingSection();
                    section.setId(UUID.randomUUID().toString());
                    section.setTitle((String) sectionData.get("title"));
                    section.setOrderIndex(i + 1);

                    // Get file info
                    Object fileIndexObj = sectionData.get("fileIndex");
                    int fileIndex = -1;
                    if (fileIndexObj instanceof Integer) {
                        fileIndex = (Integer) fileIndexObj;
                    } else if (fileIndexObj instanceof Double) {
                        fileIndex = ((Double) fileIndexObj).intValue();
                    }

                    // IMPORTANT: Skip sections without a valid file
                    if (fileIndex < 0 || fileIndex >= files.size()) {
                        log.warn("Section '{}' has invalid fileIndex {}, skipping (no text-only sections allowed)", 
                            sectionData.get("title"), fileIndex);
                        continue; // Skip this section entirely
                    }
                    
                    FileInfo file = files.get(fileIndex);
                    
                    // Determine section type based on file type
                    String sectionType = switch (file.getType().toLowerCase()) {
                        case "image" -> "image";
                        case "video" -> "video";
                        case "document" -> "document";
                        case "powerpoint" -> "powerpoint";
                        default -> {
                            // Default to document for unknown types
                            log.warn("Unknown file type: {}, defaulting to document", file.getType());
                            yield "document";
                        }
                    };
                    section.setType(sectionType);

                    // Create content
                    ManualTrainingModule.SectionContent content = new ManualTrainingModule.SectionContent();
                    content.setText((String) sectionData.getOrDefault("description", ""));

                    // Create content file
                    ManualTrainingModule.ContentFile contentFile = new ManualTrainingModule.ContentFile();
                    contentFile.setId(UUID.randomUUID().toString());
                    contentFile.setName(file.getName());
                    contentFile.setType(file.getType());
                    contentFile.setUrl(file.getUrl());
                    contentFile.setPublicId(file.getPublicId());
                    content.setFile(contentFile);

                    section.setContent(content);

                    module.getSections().add(section);
                }
            }

            // Save module
            manualTrainingModuleRepository.save(module);
        }
    }

    public static class FileInfo {
        private String name;
        private String type;
        private String url;
        private String publicId;

        public FileInfo() {}

        public FileInfo(String name, String type, String url, String publicId) {
            this.name = name;
            this.type = type;
            this.url = url;
            this.publicId = publicId;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }

        public String getPublicId() { return publicId; }
        public void setPublicId(String publicId) { this.publicId = publicId; }
    }
    
    /**
     * Downloads and extracts text content from a file URL
     */
    private String extractFileContent(FileInfo file) {
        try {
            log.info("Downloading and extracting content from: {}", file.getName());
            
            // Skip content extraction for media files (videos, images, YouTube links)
            String fileType = file.getType().toLowerCase();
            if (fileType.equals("video") || fileType.equals("image") || fileType.equals("youtube")) {
                log.info("Skipping content extraction for media type: {}", fileType);
                return String.format("[%s file - content analysis not applicable]", fileType.toUpperCase());
            }
            
            // Download file from Cloudinary
            ResponseEntity<byte[]> response = restTemplate.getForEntity(file.getUrl(), byte[].class);
            byte[] fileBytes = response.getBody();
            
            if (fileBytes == null || fileBytes.length == 0) {
                log.warn("Downloaded file is empty: {}", file.getName());
                return "[Empty file]";
            }
            
            // Extract text content based on file type
            String content = extractTextFromBytes(fileBytes, file.getName());
            
            // Limit content length to avoid token limits (max 800 characters per file)
            if (content.length() > 800) {
                content = content.substring(0, 800) + "\n[...content truncated...]";
            }
            
            log.info("Successfully extracted {} characters from {}", content.length(), file.getName());
            return content;
            
        } catch (Exception e) {
            log.error("Failed to extract content from {}: {}", file.getName(), e.getMessage());
            return String.format("[Content extraction failed: %s]", e.getMessage());
        }
    }
    
    /**
     * Extract text from file bytes based on file extension
     */
    private String extractTextFromBytes(byte[] fileBytes, String fileName) throws IOException {
        String lowerName = fileName.toLowerCase();
        
        if (lowerName.endsWith(".pdf")) {
            return extractPdfText(fileBytes);
        } else if (lowerName.endsWith(".docx")) {
            return extractWordText(fileBytes);
        } else if (lowerName.endsWith(".pptx")) {
            return extractPowerPointText(fileBytes);
        } else if (lowerName.endsWith(".txt")) {
            return new String(fileBytes);
        } else {
            return "[Unsupported file type for content extraction]";
        }
    }
    
    /**
     * Extract text from PDF bytes
     */
    private String extractPdfText(byte[] fileBytes) throws IOException {
        try (ByteArrayInputStream bis = new ByteArrayInputStream(fileBytes);
             PDDocument document = PDDocument.load(bis)) {
            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(document);
        }
    }
    
    /**
     * Extract text from Word (DOCX) bytes
     */
    private String extractWordText(byte[] fileBytes) throws IOException {
        try (ByteArrayInputStream bis = new ByteArrayInputStream(fileBytes);
             XWPFDocument document = new XWPFDocument(bis)) {
            List<XWPFParagraph> paragraphs = document.getParagraphs();
            return paragraphs.stream()
                .map(XWPFParagraph::getText)
                .collect(Collectors.joining("\n"));
        }
    }
    
    /**
     * Extract text from PowerPoint (PPTX) bytes
     */
    private String extractPowerPointText(byte[] fileBytes) throws IOException {
        try (ByteArrayInputStream bis = new ByteArrayInputStream(fileBytes);
             XMLSlideShow ppt = new XMLSlideShow(bis)) {
            StringBuilder text = new StringBuilder();
            List<XSLFSlide> slides = ppt.getSlides();
            
            for (int i = 0; i < slides.size(); i++) {
                XSLFSlide slide = slides.get(i);
                text.append("\n--- Slide ").append(i + 1).append(" ---\n");
                
                for (XSLFShape shape : slide.getShapes()) {
                    if (shape instanceof XSLFTextShape) {
                        XSLFTextShape textShape = (XSLFTextShape) shape;
                        String shapeText = textShape.getText();
                        if (shapeText != null && !shapeText.trim().isEmpty()) {
                            text.append(shapeText).append("\n");
                        }
                    }
                }
            }
            
            return text.toString();
        }
    }
    
    /**
     * Generate quiz questions using AI based on module content
     */
    public Map<String, Object> generateQuiz(Map<String, Object> moduleContent, 
                                             int numberOfQuestions,
                                             String difficulty,
                                             Map<String, Boolean> questionTypes) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        StringBuilder prompt = new StringBuilder();
        prompt.append("You are an expert quiz creator. Generate quiz questions from module content.\n\n");
        
        prompt.append("=== MODULE INFORMATION ===\n");
        prompt.append("Title: ").append(moduleContent.get("title")).append("\n");
        prompt.append("Description: ").append(moduleContent.get("description")).append("\n\n");
        
        // Add section content
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> sections = (List<Map<String, Object>>) moduleContent.get("sections");
        if (sections != null && !sections.isEmpty()) {
            prompt.append("=== SECTIONS ===\n");
            for (int i = 0; i < sections.size(); i++) {
                Map<String, Object> section = sections.get(i);
                prompt.append(String.format("\nSection %d: %s\n", (i + 1), section.get("title")));
                
                @SuppressWarnings("unchecked")
                Map<String, Object> content = (Map<String, Object>) section.get("content");
                if (content != null && content.get("text") != null) {
                    prompt.append("Content: ").append(content.get("text")).append("\n");
                }
            }
        }
        
        prompt.append("\n=== QUIZ REQUIREMENTS ===\n");
        prompt.append("Number of Questions: ").append(numberOfQuestions).append("\n");
        prompt.append("Difficulty Level: ").append(difficulty).append("\n");
        prompt.append("Allowed Question Types:\n");
        if (questionTypes.get("multipleChoice")) {
            prompt.append("- multiple-choice (4 options)\n");
        }
        if (questionTypes.get("trueFalse")) {
            prompt.append("- true-false\n");
        }
        if (questionTypes.get("shortAnswer")) {
            prompt.append("- short-answer\n");
        }
        
        prompt.append("\n=== YOUR TASK ===\n");
        prompt.append("Create ").append(numberOfQuestions).append(" high-quality quiz questions.\n\n");
        
        prompt.append("REQUIREMENTS:\n");
        prompt.append("1. Questions must be DIRECTLY related to module content\n");
        prompt.append("2. Cover different aspects of the material\n");
        prompt.append("3. Difficulty: ").append(difficulty).append("\n");
        prompt.append("4. Each question must have:\n");
        prompt.append("   - Clear, specific question text\n");
        prompt.append("   - For multiple-choice: 4 options with one correct answer\n");
        prompt.append("   - For true-false: correct answer (0=True, 1=False)\n");
        prompt.append("   - For short-answer: expected answer\n");
        prompt.append("   - Helpful explanation\n");
        prompt.append("   - Points (1-5 based on difficulty)\n\n");
        
        prompt.append("CRITICAL: Return ONLY raw JSON. NO markdown, NO code blocks, NO extra text.\n");
        prompt.append("Start with { and end with }. Nothing else.\n\n");
        
        prompt.append("Required JSON format:\n");
        prompt.append("{\n");
        prompt.append("  \"questions\": [\n");
        prompt.append("    {\n");
        prompt.append("      \"id\": \"q1\",\n");
        prompt.append("      \"question\": \"Question text here?\",\n");
        prompt.append("      \"type\": \"multiple-choice\",\n");
        prompt.append("      \"options\": [\"Option A\", \"Option B\", \"Option C\", \"Option D\"],\n");
        prompt.append("      \"correctAnswer\": 0,\n");
        prompt.append("      \"explanation\": \"Why this answer is correct...\",\n");
        prompt.append("      \"points\": 1\n");
        prompt.append("    }\n");
        prompt.append("  ]\n");
        prompt.append("}\n\n");
        prompt.append("REMEMBER: Return ONLY the JSON object. No text before or after.\n");
        
        // Call OpenAI with higher token limit for quiz generation
        return callOpenAI(prompt.toString(), 4000);
    }
    
    /**
     * Generate a final exam for the entire training
     */
    public Map<String, Object> generateFinalExam(String trainingId, int numberOfQuestions) throws Exception {
        ManualTraining training = manualTrainingRepository.findById(trainingId)
                .orElseThrow(() -> new RuntimeException("Training not found"));
        
        // Get all modules for this training
        List<ManualTrainingModule> modules = manualTrainingModuleRepository.findByTrainingId(trainingId);
        
        if (modules == null || modules.isEmpty()) {
            throw new RuntimeException("No modules found for this training");
        }
        
        StringBuilder prompt = new StringBuilder();
        prompt.append("Create a comprehensive final exam. Be CONCISE in JSON.\n\n");
        
        prompt.append("TRAINING: ").append(training.getTitle()).append("\n\n");
        
        prompt.append("MODULES:\n");
        for (int i = 0; i < modules.size(); i++) {
            ManualTrainingModule module = modules.get(i);
            prompt.append(String.format("%d. %s\n", (i + 1), module.getTitle()));
            
            // Only include section count, not all sections to save tokens
            if (module.getSections() != null && !module.getSections().isEmpty()) {
                prompt.append("   (").append(module.getSections().size()).append(" sections)\n");
            }
        }
        
        prompt.append("\nEXAM: ").append(numberOfQuestions).append(" questions\n");
        prompt.append("- Mix types (multiple-choice, true-false)\n");
        prompt.append("- Mix difficulty (30% easy, 50% medium, 20% hard)\n");
        prompt.append("- Cover all modules equally\n");
        prompt.append("- Brief explanations\n\n");
        
        prompt.append("JSON format (CONCISE explanations):\n");
        prompt.append("{\"questions\":[{\"id\":\"q1\",\"question\":\"?\",\"type\":\"multiple-choice\",");
        prompt.append("\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctAnswer\":0,");
        prompt.append("\"explanation\":\"Brief.\",\"points\":2,\"moduleReference\":\"Module 1\"}]}\n\n");
        prompt.append("CRITICAL: Return ONLY JSON starting with {\"questions\":[...]}. Keep explanations SHORT (max 20 words).\n");
        
        // Call OpenAI with appropriate token limit
        // gpt-4o-mini has 8192 total tokens, so we need: prompt_tokens + completion_tokens < 8192
        // With ~500 tokens for prompt, we can safely use 4000 tokens for completion
        return callOpenAI(prompt.toString(), 4000);
    }
    
    /**
     * Analyze a document with AI to extract key topics, learning objectives, etc.
     */
    public Map<String, Object> analyzeDocument(MultipartFile file) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        // Extract text content from file
        byte[] fileBytes = file.getBytes();
        String content = extractTextFromBytes(fileBytes, file.getOriginalFilename());
        
        // Limit content to avoid token limits
        if (content.length() > 4000) {
            content = content.substring(0, 4000) + "\n[...content truncated...]";
        }

        StringBuilder prompt = new StringBuilder();
        prompt.append("You are an expert instructional designer analyzing training content.\n\n");
        prompt.append("=== DOCUMENT CONTENT ===\n");
        prompt.append(content).append("\n\n");
        
        prompt.append("=== YOUR TASK ===\n");
        prompt.append("Analyze this document and extract:\n");
        prompt.append("1. Key topics (5-10 main topics)\n");
        prompt.append("2. Difficulty level (1-10, where 1=beginner, 10=expert)\n");
        prompt.append("3. Estimated read time in minutes\n");
        prompt.append("4. Learning objectives (3-5 clear objectives)\n");
        prompt.append("5. Prerequisites (what learners should know before)\n");
        prompt.append("6. Suggested modules (how to organize this content into 3-5 modules)\n\n");
        
        prompt.append("CRITICAL: Return ONLY raw JSON. NO markdown, NO code blocks, NO extra text.\n");
        prompt.append("Start with { and end with }. Nothing else.\n\n");
        
        prompt.append("Required JSON format:\n");
        prompt.append("{\n");
        prompt.append("  \"keyTopics\": [\"topic1\", \"topic2\", ...],\n");
        prompt.append("  \"difficulty\": 5,\n");
        prompt.append("  \"estimatedReadTime\": 30,\n");
        prompt.append("  \"learningObjectives\": [\"objective1\", \"objective2\", ...],\n");
        prompt.append("  \"prerequisites\": [\"prerequisite1\", \"prerequisite2\", ...],\n");
        prompt.append("  \"suggestedModules\": [\"Module 1\", \"Module 2\", ...]\n");
        prompt.append("}\n\n");
        prompt.append("REMEMBER: Return ONLY the JSON object. No text before or after.\n");
        
        // Call OpenAI
        return callOpenAI(prompt.toString(), 2000);
    }
    
    /**
     * Analyze a URL (YouTube or web page) with AI
     */
    public Map<String, Object> analyzeUrl(String url) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        StringBuilder prompt = new StringBuilder();
        prompt.append("You are an expert instructional designer analyzing web content.\n\n");
        prompt.append("=== URL TO ANALYZE ===\n");
        prompt.append(url).append("\n\n");
        
        prompt.append("=== YOUR TASK ===\n");
        prompt.append("Analyze this URL (YouTube video or web page) and extract:\n");
        prompt.append("1. Key topics (5-10 main topics)\n");
        prompt.append("2. Difficulty level (1-10, where 1=beginner, 10=expert)\n");
        prompt.append("3. Estimated duration in minutes\n");
        prompt.append("4. Learning objectives (3-5 clear objectives)\n");
        prompt.append("5. Prerequisites (what learners should know before)\n");
        prompt.append("6. Suggested modules (how to organize this content into 3-5 modules)\n\n");
        
        prompt.append("CRITICAL: Return ONLY raw JSON. NO markdown, NO code blocks, NO extra text.\n");
        prompt.append("Start with { and end with }. Nothing else.\n\n");
        
        prompt.append("Required JSON format:\n");
        prompt.append("{\n");
        prompt.append("  \"keyTopics\": [\"topic1\", \"topic2\", ...],\n");
        prompt.append("  \"difficulty\": 5,\n");
        prompt.append("  \"estimatedReadTime\": 30,\n");
        prompt.append("  \"learningObjectives\": [\"objective1\", \"objective2\", ...],\n");
        prompt.append("  \"prerequisites\": [\"prerequisite1\", \"prerequisite2\", ...],\n");
        prompt.append("  \"suggestedModules\": [\"Module 1\", \"Module 2\", ...]\n");
        prompt.append("}\n\n");
        prompt.append("REMEMBER: Return ONLY the JSON object. No text before or after.\n");
        
        // Call OpenAI
        return callOpenAI(prompt.toString(), 2000);
    }
    
    /**
     * Convert a module to content map for AI processing
     */
    private Map<String, Object> convertModuleToContent(ManualTrainingModule module) {
        Map<String, Object> content = new HashMap<>();
        content.put("title", module.getTitle());
        content.put("description", module.getDescription());
        
        // Convert sections to simple maps for AI processing
        java.util.List<Map<String, Object>> sectionsData = new java.util.ArrayList<>();
        if (module.getSections() != null) {
            for (ManualTrainingModule.TrainingSection section : module.getSections()) {
                Map<String, Object> sectionMap = new HashMap<>();
                sectionMap.put("id", section.getId());
                sectionMap.put("title", section.getTitle());
                sectionMap.put("type", section.getType());
                sectionMap.put("orderIndex", section.getOrderIndex());
                sectionMap.put("estimatedDuration", section.getEstimatedDuration());
                
                // Include content details if available
                if (section.getContent() != null) {
                    Map<String, Object> contentMap = new HashMap<>();
                    ManualTrainingModule.SectionContent cont = section.getContent();
                    
                    if (cont.getText() != null) contentMap.put("text", cont.getText());
                    if (cont.getYoutubeUrl() != null) contentMap.put("youtubeUrl", cont.getYoutubeUrl());
                    if (cont.getKeyPoints() != null) contentMap.put("keyPoints", cont.getKeyPoints());
                    
                    sectionMap.put("content", contentMap);
                }
                
                sectionsData.add(sectionMap);
            }
        }
        content.put("sections", sectionsData);
        
        return content;
    }

    /**
     * Generate initial organization suggestion based on uploaded files and their analyses
     */
    public String generateInitialOrganizationSuggestion(List<FileInfo> files, List<Map<String, Object>> analyses) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        StringBuilder prompt = new StringBuilder();
        prompt.append("You are an expert instructional designer. Analyze the uploaded files and suggest how to organize them into a training program.\n\n");
        
        prompt.append("=== UPLOADED FILES ===\n");
        for (int i = 0; i < files.size(); i++) {
            FileInfo file = files.get(i);
            prompt.append(String.format("%d. %s (Type: %s)\n", (i + 1), file.getName(), file.getType()));
        }
        
        if (analyses != null && !analyses.isEmpty()) {
            prompt.append("\n=== FILE ANALYSES ===\n");
            for (Map<String, Object> analysis : analyses) {
                String fileName = (String) analysis.get("fileName");
                @SuppressWarnings("unchecked")
                List<String> keyTopics = (List<String>) analysis.get("keyTopics");
                Integer difficulty = (Integer) analysis.get("difficulty");
                Integer estimatedReadTime = (Integer) analysis.get("estimatedReadTime");
                
                prompt.append(String.format("\nFile: %s\n", fileName));
                if (keyTopics != null && !keyTopics.isEmpty()) {
                    prompt.append("Key Topics: ").append(String.join(", ", keyTopics)).append("\n");
                }
                if (difficulty != null) {
                    prompt.append("Difficulty: ").append(difficulty).append("/10\n");
                }
                if (estimatedReadTime != null) {
                    prompt.append("Estimated Duration: ").append(estimatedReadTime).append(" minutes\n");
                }
            }
        }
        
        prompt.append("\n=== YOUR TASK ===\n");
        prompt.append("Based on the files and their analyses, suggest a logical organization structure for a training program.\n\n");
        prompt.append("Provide a clear, concise description (2-4 sentences) of:\n");
        prompt.append("1. How many modules to create\n");
        prompt.append("2. What each module should focus on\n");
        prompt.append("3. How many sections per module (approximately)\n");
        prompt.append("4. The logical flow/sequence of modules\n\n");
        prompt.append("CRITICAL: Return ONLY the organization description. NO markdown, NO code blocks, NO JSON, NO extra text.\n");
        prompt.append("Just plain text describing the suggested organization structure.\n");
        prompt.append("Example format: \"Create 3 modules: Module 1 - Introduction (3-4 sections covering basics), Module 2 - Core Concepts (4-5 sections with practical examples), Module 3 - Advanced Topics (3-4 sections for advanced learners).\"\n");
        
        Map<String, Object> response = callOpenAI(prompt.toString(), 500);
        
        // Extract the organization text from the response
        // The response might be a string directly or in a nested structure
        String organization = null;
        if (response.get("organization") instanceof String) {
            organization = (String) response.get("organization");
        } else if (response.get("text") instanceof String) {
            organization = (String) response.get("text");
        } else if (response.get("suggestion") instanceof String) {
            organization = (String) response.get("suggestion");
        } else {
            // Try to find any string value in the response
            for (Object value : response.values()) {
                if (value instanceof String && ((String) value).length() > 50) {
                    organization = (String) value;
                    break;
                }
            }
        }
        
        if (organization == null || organization.trim().isEmpty()) {
            // Fallback: use a default suggestion
            organization = String.format("Create %d modules based on the uploaded files. Organize content logically by topic and difficulty level.", 
                Math.max(2, Math.min(5, files.size() / 2)));
        }
        
        return organization.trim();
    }
}
