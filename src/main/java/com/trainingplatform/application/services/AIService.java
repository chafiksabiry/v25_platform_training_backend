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
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;


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
    private final ObjectMapper objectMapper = new ObjectMapper();


    @Value("${app.ai.openai.api-key:}")
    private String openaiApiKey;

    @Value("${app.ai.openai.model:gpt-4o-mini}")
    private String openaiModel;

    @Value("${app.ai.anthropic.api-key:}")
    private String anthropicApiKey;

    @Value("${app.ai.anthropic.model:claude-3-5-sonnet-20240620}")
    private String anthropicModel;

    private static final String OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
    private static final String ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

    public boolean checkAIAvailability() {
        boolean openAiAvailable = openaiApiKey != null && !openaiApiKey.isEmpty();
        boolean anthropicAvailable = anthropicApiKey != null && !anthropicApiKey.isEmpty();
        
        if (!openAiAvailable && !anthropicAvailable) {
            log.warn("Neither OpenAI nor Anthropic API keys are configured");
            return false;
        }

        return true;
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
        
        // Call AI (prefer Anthropic if available)
        Map<String, Object> aiResponse = callAI(prompt.toString(), 1500);
        
        // Parse response
        Map<String, String> metadata = new HashMap<>();
        metadata.put("title", (String) aiResponse.get("title"));
        metadata.put("description", (String) aiResponse.get("description"));
        
        return metadata;
    }

    /**
     * Generate a complete training module based on Gig knowledge base documents
     */
    public Map<String, Object> generateGigTrainingModule(String knowledgeBaseContent, String format) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        String prompt = "You are an AI instructional designer integrated into an LMS platform.\n\n" +
            "Your task is to generate a complete training module.\n\n" +
            "Context:\n" +
            "- The training must be based ONLY on the provided knowledge base documents (Gig knowledge base).\n" +
            "- You must follow the 360° learning methodology (analysis, design, development, implementation, evaluation).\n" +
            "- The user can choose the output format: Presentation or Video. (Selected Format: " + format + ")\n\n" +
            "Knowledge Base Content:\n" +
            knowledgeBaseContent + "\n\n" +
            "Instructions:\n" +
            "1. Analyze the provided documents: Extract key concepts, processes, and important insights. Identify learning objectives.\n" +
            "2. Structure the training using the 360° methodology:\n" +
            "   - Introduction (context + objectives)\n" +
            "   - Core content (well-structured modules/sections)\n" +
            "   - Practical examples or use cases\n" +
            "   - Summary\n" +
            "   - Evaluation (quiz or questions)\n" +
            "3. Generate output based on user choice:\n" +
            "   IF format = \"presentation\":\n" +
            "   - Create a slide-by-slide structure\n" +
            "   - Each slide must include: Title, Bullet points (clear and concise), Optional speaker notes\n" +
            "   IF format = \"video\":\n" +
            "   - Generate a detailed video script (10 minutes)\n" +
            "   - Include: Narration text, Scene descriptions, Timing suggestions, Visual recommendations\n" +
            "4. Ensure:\n" +
            "   - Clear pedagogy (simple explanations)\n" +
            "   - Logical flow\n" +
            "   - Professional tone\n" +
            "   - No hallucination: ONLY use knowledge base content\n" +
            "   - Adapt the difficulty level to beginner/intermediate learners\n" +
            "5. Output format must be structured JSON EXACTLY as below, do not add markdown backticks:\n\n" +
            "{\n" +
            "  \"title\": \"\",\n  \"objectives\": [],\n  \"format\": \"" + format + "\",\n  \"content\": [],\n  \"evaluation\": []\n}\n";

        // Limit length to avoid blowing up the token context
        if (prompt.length() > 30000) {
            prompt = prompt.substring(0, 30000) + "... (content truncated to save context)";
        }

        // Use a slightly larger maxToken limit for detailed content
        return callAI(prompt, 3000);
    }

    /**
     * Generate a comprehensive training curriculum program
     */
    public Map<String, Object> generateRealCurriculum(Map<String, Object> analysis, String industry, String gig) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        String prompt = "You are an expert AI instructional designer.\n\n" +
            "Your task is to generate a comprehensive training curriculum program based on the provided document analysis and the gig requirements.\n\n" +
            "=== CONTEXT ===\n" +
            "Industry: " + industry + "\n" +
            "Gig / Role: " + (gig != null ? gig : "General") + "\n\n" +
            "=== DOCUMENT ANALYSIS ===\n" +
            (analysis != null ? analysis.toString() : "No document analysis provided.") + "\n\n" +
            "=== INSTRUCTIONS ===\n" +
            "1. Analyze the context and document topics to create a complete training program.\n" +
            "2. Ensure the program has logical progression (from basics to advanced).\n" +
            "3. For each module, generate a specific title, description, and learning objectives.\n" +
            "4. Return ONLY valid JSON format EXACTLY matching the required structure.\n\n" +
            "=== REQUIRED JSON FORMAT ===\n" +
            "{\n" +
            "  \"title\": \"Name of the Training Program\",\n" +
            "  \"description\": \"Comprehensive description...\",\n" +
            "  \"totalDuration\": 120,\n" +
            "  \"modules\": [\n" +
            "    {\n" +
            "      \"title\": \"Module 1: Title\",\n" +
            "      \"description\": \"Detailed description...\",\n" +
            "      \"duration\": 30,\n" +
            "      \"difficulty\": \"intermediate\",\n" +
            "      \"learningObjectives\": [\"Objective 1\", \"Objective 2\"]\n" +
            "    }\n" +
            "  ]\n" +
            "}\n";

        return callAI(prompt, 2000);
    }

    /**
     * Generate detailed content sections for a specific module
     */
    public List<Map<String, Object>> generateDetailedModuleContent(String moduleTitle, String moduleDescription, String fullTranscription, List<String> learningObjectives) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        String prompt = "You are an expert AI instructional designer.\n\n" +
            "Your task is to generate the detailed textual content for a specific training module.\n\n" +
            "=== MODULE DETAILS ===\n" +
            "Title: " + moduleTitle + "\n" +
            "Description: " + moduleDescription + "\n" +
            "Objectives: " + (learningObjectives != null ? String.join(", ", learningObjectives) : "") + "\n\n" +
            "=== KNOWLEDGE BASE / FULL TRANSCRIPTIONS ===\n" +
            (fullTranscription.length() > 25000 ? fullTranscription.substring(0, 25000) + "..." : fullTranscription) + "\n\n" +
            "=== INSTRUCTIONS ===\n" +
            "1. Divide the module into 3 to 6 logical learning sections based on the knowledge base.\n" +
            "2. For each section, provide a title and detailed, educational textual content incorporating concepts from the knowledge base.\n" +
            "3. Format the response as a JSON object containing a 'sections' array EXACTLY as below (do not include markdown codeblocks or the word json):\n" +
            "{\n" +
            "  \"sections\": [\n" +
            "    {\n" +
            "      \"title\": \"Section name\",\n" +
            "      \"type\": \"text\",\n" +
            "      \"content\": \"Comprehensive paragraph explaining the concepts...\",\n" +
            "      \"duration\": 10\n" +
            "    }\n" +
            "  ]\n" +
            "}\n";

        Map<String, Object> response = callAI(prompt, 3000);
        return (List<Map<String, Object>>) response.get("sections");
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

        // Call AI API
        Map<String, Object> aiResponse = callAI(prompt);

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
                        
                        Map<String, Object> quizData = generateQuiz(moduleContent, numberOfQuestions, "medium", questionTypes, null);
                    
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

    public static class FileAnalysis {
        private String fileName;
        private List<String> keyTopics;
        private Integer difficulty;
        private Integer estimatedReadTime;

        public FileAnalysis() {}

        public FileAnalysis(String fileName, List<String> keyTopics, Integer difficulty, Integer estimatedReadTime) {
            this.fileName = fileName;
            this.keyTopics = keyTopics;
            this.difficulty = difficulty;
            this.estimatedReadTime = estimatedReadTime;
        }

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
            
            // Download file from GCS
            ResponseEntity<byte[]> response = restTemplate.getForEntity(file.getUrl(), byte[].class);
            byte[] fileBytes = response.getBody();
            
            if (fileBytes == null || fileBytes.length == 0) {
                log.warn("Downloaded file is empty: {}", file.getName());
                return "[Empty file]";
            }
            
            // Extract text content based on file type
            String content = extractTextFromBytes(fileBytes, file.getName());
            
            // Limit content length to avoid token limits (max 10,000 characters per file)
            if (content.length() > 10000) {
                content = content.substring(0, 10000) + "\n[...content truncated...]";
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
                                             Map<String, Boolean> questionTypes,
                                             Map<String, Object> questionDistribution) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        StringBuilder prompt = new StringBuilder();
        prompt.append("You are an expert quiz creator. Generate quiz questions from module content.\n\n");
        
        prompt.append("=== MODULE INFORMATION ===\n");
        prompt.append("Title: ").append(moduleContent.get("title")).append("\n");
        String description = (String) moduleContent.get("description");
        if (description != null && !description.isEmpty()) {
            prompt.append("Description: ").append(description).append("\n");
        }
        
        // Add learning objectives if available
        @SuppressWarnings("unchecked")
        List<String> learningObjectives = (List<String>) moduleContent.get("learningObjectives");
        if (learningObjectives != null && !learningObjectives.isEmpty()) {
            prompt.append("Learning Objectives: ");
            for (int i = 0; i < Math.min(learningObjectives.size(), 5); i++) {
                if (i > 0) prompt.append(", ");
                prompt.append(learningObjectives.get(i));
            }
            prompt.append("\n");
        }
        prompt.append("\n");
        
        // Add section content
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> sections = (List<Map<String, Object>>) moduleContent.get("sections");
        if (sections != null && !sections.isEmpty()) {
            prompt.append("=== SECTIONS ===\n");
            // For large quizzes (like final exams with 30 questions), only include titles
            boolean includeContent = numberOfQuestions < 20;
            
            // Limit number of sections for large quizzes
            int maxSections = numberOfQuestions >= 20 ? Math.min(sections.size(), 10) : sections.size();
            
            for (int i = 0; i < maxSections; i++) {
                Map<String, Object> section = sections.get(i);
                prompt.append(String.format("Section %d: %s", (i + 1), section.get("title")));
                
                if (includeContent) {
                @SuppressWarnings("unchecked")
                Map<String, Object> content = (Map<String, Object>) section.get("content");
                if (content != null && content.get("text") != null) {
                        String sectionText = (String) content.get("text");
                        // Truncate if too long
                        if (sectionText.length() > 2000) {
                            sectionText = sectionText.substring(0, 2000) + "...";
                        }
                        if (!sectionText.isEmpty()) {
                            prompt.append("\nContent: ").append(sectionText);
                        }
                    }
                }
                prompt.append("\n");
            }
            if (sections.size() > maxSections) {
                prompt.append(String.format("... and %d more sections\n", sections.size() - maxSections));
            }
        }
        
        // Simplified prompt for large quizzes to save tokens
        if (numberOfQuestions >= 20) {
            prompt.append("\n=== QUIZ REQUIREMENTS ===\n");
            prompt.append("Generate EXACTLY ").append(numberOfQuestions).append(" questions.\n");
            if (questionDistribution != null && !questionDistribution.isEmpty()) {
                Object mcCount = questionDistribution.get("multipleChoice");
                Object tfCount = questionDistribution.get("trueFalse");
                Object mcaCount = questionDistribution.get("multipleCorrect");
                prompt.append("Distribution: ").append(mcCount).append(" multiple-choice, ")
                      .append(tfCount).append(" true/false, ").append(mcaCount).append(" multiple-correct.\n");
            }
            prompt.append("Difficulty: ").append(difficulty).append("\n");
            prompt.append("Format: JSON with questions array. Each question: id, question, type, options, correctAnswer, explanation, points.\n");
        } else {
        prompt.append("\n=== QUIZ REQUIREMENTS ===\n");
        prompt.append("Number of Questions: ").append(numberOfQuestions).append("\n");
        prompt.append("Difficulty Level: ").append(difficulty).append("\n");
            
            // Add question distribution if provided
            if (questionDistribution != null && !questionDistribution.isEmpty()) {
                prompt.append("\n=== QUESTION DISTRIBUTION (MANDATORY) ===\n");
                Object mcCount = questionDistribution.get("multipleChoice");
                Object tfCount = questionDistribution.get("trueFalse");
                Object mcaCount = questionDistribution.get("multipleCorrect");
                
                if (mcCount != null) {
                    prompt.append("Multiple Choice Questions: ").append(mcCount).append("\n");
                }
                if (tfCount != null) {
                    prompt.append("True/False Questions: ").append(tfCount).append("\n");
                }
                if (mcaCount != null) {
                    prompt.append("Multiple Correct Answer Questions: ").append(mcaCount).append("\n");
                }
                prompt.append("CRITICAL: You MUST follow this exact distribution. The total must equal ").append(numberOfQuestions).append(".\n");
            } else {
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
        }
        
        prompt.append("\n=== YOUR TASK ===\n");
            prompt.append("Create EXACTLY ").append(numberOfQuestions).append(" high-quality quiz questions.\n");
            prompt.append("CRITICAL: You MUST generate exactly ").append(numberOfQuestions).append(" questions. No more, no less.\n");
            prompt.append("If question distribution is specified, you MUST follow it exactly.\n\n");
        
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
        }
        
        // Simplified format instructions for large quizzes
        if (numberOfQuestions >= 20) {
            prompt.append("Return JSON: {\"questions\":[{id,question,type,options,correctAnswer,explanation,points},...]}\n");
            prompt.append("MUST return ALL ").append(numberOfQuestions).append(" questions.\n");
        } else {
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
            prompt.append("CRITICAL: You MUST return ALL ").append(numberOfQuestions).append(" questions in the JSON array. Do not truncate or skip any questions.\n");
        }
        
        // Calculate maxTokens based on number of questions
        // For 30 questions, we need more tokens (approximately 200-300 tokens per question)
        // Base: 4000 tokens, add 200 tokens per question above 10
        int baseTokens = 4000;
        int additionalTokens = Math.max(0, (numberOfQuestions - 10) * 200);
        int maxTokens = baseTokens + additionalTokens;
        
        // Cap at 8000 tokens (safe limit for most models)
        maxTokens = Math.min(maxTokens, 8000);
        
        log.info("Generating quiz with {} questions, using {} max_tokens", numberOfQuestions, maxTokens);
        
        // Call AI with calculated token limit
        return callAI(prompt.toString(), maxTokens);
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
        
        // Call AI with appropriate token limit
        return callAI(prompt.toString(), 4000);
    }

    /**
     * Generate a final exam based on provided modules metadata (titles and descriptions)
     */
    public Map<String, Object> generateFinalExamFromModules(List<Map<String, Object>> modules, String formationTitle, int numberOfQuestions) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        StringBuilder prompt = new StringBuilder();
        prompt.append("Create a comprehensive final exam for a professional training. Be CONCISE in JSON.\n\n");
        
        prompt.append("TRAINING: ").append(formationTitle != null ? formationTitle : "Professional Training").append("\n\n");
        
        prompt.append("MODULES:\n");
        for (int i = 0; i < modules.size(); i++) {
            Map<String, Object> module = modules.get(i);
            prompt.append(String.format("%d. %s\n", (i + 1), module.get("title")));
            if (module.get("description") != null) {
                prompt.append("   Desc: ").append(module.get("description")).append("\n");
            }
            @SuppressWarnings("unchecked")
            List<String> objectives = (List<String>) module.get("learningObjectives");
            if (objectives != null && !objectives.isEmpty()) {
                prompt.append("   Obj: ").append(String.join(", ", objectives.subList(0, Math.min(objectives.size(), 3)))).append("\n");
            }
        }
        
        prompt.append("\nEXAM: ").append(numberOfQuestions).append(" questions\n");
        prompt.append("- Mix types: multiple-choice (4 options), true-false\n");
        prompt.append("- Difficulty: 30% easy, 50% medium, 20% hard\n");
        prompt.append("- Distribute questions equally across all modules\n");
        prompt.append("- Explanations: VERY SHORT (max 15 words)\n\n");
        
        prompt.append("JSON format (Return EXACTLY this structure):\n");
        prompt.append("{\n");
        prompt.append("  \"questionCount\": ").append(numberOfQuestions).append(",\n");
        prompt.append("  \"totalPoints\": ").append(numberOfQuestions * 10).append(",\n");
        prompt.append("  \"passingScore\": 70,\n");
        prompt.append("  \"duration\": ").append(numberOfQuestions * 1.5).append(",\n");
        prompt.append("  \"questions\": [\n");
        prompt.append("    {\n");
        prompt.append("      \"id\": \"q1\",\n");
        prompt.append("      \"text\": \"Question text?\",\n");
        prompt.append("      \"type\": \"multiple-choice\",\n");
        prompt.append("      \"options\": [\"Opt1\", \"Opt2\", \"Opt3\", \"Opt4\"],\n");
        prompt.append("      \"correctAnswer\": 0,\n");
        prompt.append("      \"explanation\": \"Short reason.\",\n");
        prompt.append("      \"points\": 10,\n");
        prompt.append("      \"moduleTitle\": \"Module Name\"\n");
        prompt.append("    }\n");
        prompt.append("  ]\n");
        prompt.append("}\n\n");
        prompt.append("CRITICAL: Return ONLY JSON. Keep it concise to avoid truncation.\n");

        Map<String, Object> response = callAI(prompt.toString(), 4000);
        
        // Robustness: ensure we have camelCase keys
        Map<String, Object> normalized = new HashMap<>();
        for (Map.Entry<String, Object> entry : response.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            
            // Normalize common keys: snake_case -> camelCase
            if (key.equals("question_count")) key = "questionCount";
            else if (key.equals("total_points")) key = "totalPoints";
            else if (key.equals("passing_score")) key = "passingScore";
            
            normalized.put(key, value);
        }
        
        return normalized;
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
        
        // Call AI
        return callAI(prompt.toString(), 2000);
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
        
        // Call AI
        return callAI(prompt.toString(), 2000);
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
    public String generateInitialOrganizationSuggestion(List<FileInfo> files, List<FileAnalysis> analyses) throws Exception {
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
            for (FileAnalysis analysis : analyses) {
                String fileName = analysis.getFileName();
                List<String> keyTopics = analysis.getKeyTopics();
                Integer difficulty = analysis.getDifficulty();
                Integer estimatedReadTime = analysis.getEstimatedReadTime();
                
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
        
        Map<String, Object> response = callAI(prompt.toString(), 500);
        
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

    /**
     * Unified entry point for AI calls with default max tokens (1500).
     */
    private Map<String, Object> callAI(String prompt) throws Exception {
        return callAI(prompt, 1500);
    }

    /**
     * Unified entry point for AI calls. 
     * Tries Anthropic Claude first, fallbacks to OpenAI GPT if Anthropic is not available.
     */
    private Map<String, Object> callAI(String prompt, int maxTokens) throws Exception {
        if (anthropicApiKey != null && !anthropicApiKey.trim().isEmpty()) {
            try {
                return callAnthropic(prompt, maxTokens);
            } catch (Exception e) {
                log.error("Anthropic call failed, falling back to OpenAI: {}", e.getMessage());
                if (openaiApiKey != null && !openaiApiKey.trim().isEmpty()) {
                    return callOpenAI(prompt, maxTokens);
                }
                throw e;
            }
        } else if (openaiApiKey != null && !openaiApiKey.trim().isEmpty()) {
            return callOpenAI(prompt, maxTokens);
        } else {
            throw new RuntimeException("No AI provider (Anthropic or OpenAI) is configured.");
        }
    }

    /**
     * Calls Anthropic Claude API
     */
    private Map<String, Object> callAnthropic(String prompt, int maxTokens) throws Exception {
        log.info("Calling Anthropic Claude API (model: {})", anthropicModel);
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("x-api-key", anthropicApiKey);
        headers.set("anthropic-version", "2023-06-01");

        Map<String, Object> body = new HashMap<>();
        body.put("model", anthropicModel);
        body.put("max_tokens", maxTokens);
        
        List<Map<String, String>> messages = new ArrayList<>();
        Map<String, String> message = new HashMap<>();
        message.put("role", "user");
        message.put("content", prompt);
        messages.add(message);
        body.put("messages", messages);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        
        ResponseEntity<String> response = restTemplate.postForEntity(ANTHROPIC_API_URL, entity, String.class);
        
        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new RuntimeException("Anthropic API call failed with status: " + response.getStatusCode());
        }

        Map<String, Object> responseMap = objectMapper.readValue(response.getBody(), new TypeReference<Map<String, Object>>() {});
        List<Map<String, Object>> contentList = (List<Map<String, Object>>) responseMap.get("content");
        
        if (contentList != null && !contentList.isEmpty()) {
            String text = (String) contentList.get(0).get("text");
            return parseAIResponse(text);
        }
        
        throw new RuntimeException("Empty response from Anthropic");
    }

    /**
     * Calls OpenAI GPT API
     */
    private Map<String, Object> callOpenAI(String prompt, int maxTokens) throws Exception {
        log.info("Calling OpenAI GPT API (model: {})", openaiModel);
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(openaiApiKey);

        Map<String, Object> body = new HashMap<>();
        body.put("model", openaiModel);
        
        List<Map<String, String>> messages = new ArrayList<>();
        Map<String, String> message = new HashMap<>();
        message.put("role", "user");
        message.put("content", prompt);
        messages.add(message);
        body.put("messages", messages);
        body.put("max_tokens", maxTokens);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        
        ResponseEntity<String> response = restTemplate.postForEntity(OPENAI_API_URL, entity, String.class);
        
        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new RuntimeException("OpenAI API call failed with status: " + response.getStatusCode());
        }

        Map<String, Object> responseMap = objectMapper.readValue(response.getBody(), new TypeReference<Map<String, Object>>() {});
        List<Map<String, Object>> choices = (List<Map<String, Object>>) responseMap.get("choices");
        
        if (choices != null && !choices.isEmpty()) {
            Map<String, Object> choice = choices.get(0);
            Map<String, Object> choiceMessage = (Map<String, Object>) choice.get("message");
            String text = (String) choiceMessage.get("content");
            return parseAIResponse(text);
        }
        
        throw new RuntimeException("Empty response from OpenAI");
    }

    /**
     * Helper to parse AI response string into a Map, handling markdown code blocks
     */
    private Map<String, Object> parseAIResponse(String text) {
        if (text == null) return new HashMap<>();
        
        String jsonContent = text.trim();
        
        // Remove markdown backticks if present (e.g. ```json ... ```)
        if (jsonContent.startsWith("```")) {
            int firstBrace = jsonContent.indexOf("{");
            int lastBrace = jsonContent.lastIndexOf("}");
            if (firstBrace != -1 && lastBrace != -1 && lastBrace > firstBrace) {
                jsonContent = jsonContent.substring(firstBrace, lastBrace + 1);
            }
        }
        
        try {
            return objectMapper.readValue(jsonContent, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            log.error("Failed to parse AI JSON response: {}. Raw text: {}", e.getMessage(), text);
            // Fallback: return a map with the raw text
            Map<String, Object> fallback = new HashMap<>();
            fallback.put("text", text);
            return fallback;
        }
    }
}
