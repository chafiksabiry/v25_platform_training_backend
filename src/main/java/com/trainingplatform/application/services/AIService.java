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

    @Value("${app.upload.directory:uploads}")
    private String localUploadDir;

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
            "  \"title\": \"\",\n  \"objectives\": [],\n  \"format\": \"" + format + "\",\n  \"content\": []\n}\n";

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

        String keyTopics = analysis != null && analysis.get("keyTopics") != null ? analysis.get("keyTopics").toString() : "";
        String learningObjs = analysis != null && analysis.get("learningObjectives") != null ? analysis.get("learningObjectives").toString() : "";
        String suggestedModules = analysis != null && analysis.get("suggestedModules") != null ? analysis.get("suggestedModules").toString() : "";

        String baseContext = "Industrie: " + industry + "\n" +
            "Rôle: " + (gig != null ? gig : "Général") + "\n" +
            "Sujets clés: " + keyTopics + "\n" +
            "Objectifs d'apprentissage suggérés: " + learningObjs + "\n" +
            "Modules suggérés: " + suggestedModules;

        // ── Call 1: Program metadata + module plan (no sessions yet) ──────────
        String metaPrompt = "Tu es un expert en conception pédagogique.\n\n" +
            baseContext + "\n\n" +
            "Génère UNIQUEMENT les métadonnées du programme et la liste des modules (sans détailler les sessions).\n" +
            "Réponds en JSON valide uniquement, sans markdown :\n" +
            "{\n" +
            "  \"title\": \"Titre du programme\",\n" +
            "  \"subtitle\": \"Sous-titre accrocheur\",\n" +
            "  \"description\": \"Description en 2-3 phrases\",\n" +
            "  \"totalDuration\": 420,\n" +
            "  \"level\": \"Intermédiaire\",\n" +
            "  \"methodology\": \"Description de la méthodologie pédagogique\",\n" +
            "  \"objectives\": [\"objectif 1\", \"objectif 2\", \"objectif 3\"],\n" +
            "  \"modules\": [\n" +
            "    { \"id\": 1, \"title\": \"Titre module 1\", \"duration\": 60, \"description\": \"Description courte\" }\n" +
            "  ]\n" +
            "}";

        log.info("📚 [Step 1/2] Generating program metadata and module plan...");
        Map<String, Object> meta = callAI(metaPrompt, 3000);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> modulePlan = (List<Map<String, Object>>) meta.get("modules");
        if (modulePlan == null || modulePlan.isEmpty()) {
            log.warn("No modules returned, using metadata only");
            return meta;
        }

        // ── Call 2 (parallel): Detailed sessions for each module in 2 batches ──
        int half = (modulePlan.size() + 1) / 2;
        List<Map<String, Object>> batch1Modules = modulePlan.subList(0, half);
        List<Map<String, Object>> batch2Modules = modulePlan.subList(half, modulePlan.size());

        String programTitle = (String) meta.getOrDefault("title", "Programme de formation");
        String programLevel = (String) meta.getOrDefault("level", "Intermédiaire");
        String programDuration = meta.getOrDefault("totalDuration", "7h").toString();

        java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newFixedThreadPool(2);

        java.util.concurrent.Future<Map<String, Object>> future1 = executor.submit(() -> {
            String sessionPrompt = buildSessionPrompt(programTitle, programLevel, batch1Modules);
            return callAI(sessionPrompt, 4000);
        });
        java.util.concurrent.Future<Map<String, Object>> future2 = executor.submit(() -> {
            if (batch2Modules.isEmpty()) return new HashMap<>();
            String sessionPrompt = buildSessionPrompt(programTitle, programLevel, batch2Modules);
            return callAI(sessionPrompt, 4000);
        });

        log.info("📚 [Step 2/2] Generating detailed sessions in 2 parallel batches...");
        Map<String, Object> sessions1 = future1.get();
        Map<String, Object> sessions2 = future2.get();
        executor.shutdown();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> detailedModules1 = (List<Map<String, Object>>) sessions1.get("modules");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> detailedModules2 = (List<Map<String, Object>>) sessions2.get("modules");

        List<Map<String, Object>> allModules = new ArrayList<>();
        if (detailedModules1 != null) allModules.addAll(detailedModules1);
        if (detailedModules2 != null) allModules.addAll(detailedModules2);

        meta.put("modules", allModules.isEmpty() ? modulePlan : allModules);
        log.info("✅ Program generated with {} modules", allModules.size());
        return meta;
    }

    private String buildSessionPrompt(String programTitle, String level, List<Map<String, Object>> modules) {
        StringBuilder sb = new StringBuilder();
        sb.append("Tu es un expert en conception pédagogique.\n\n");
        sb.append("Programme: ").append(programTitle).append("\nNiveau: ").append(level).append("\n\n");
        sb.append("Pour chacun des modules suivants, génère des sessions détaillées.\n");
        sb.append("Réponds en JSON valide uniquement, sans markdown:\n");
        sb.append("{\n  \"modules\": [\n");
        sb.append("    {\n");
        sb.append("      \"id\": 1, \"title\": \"Titre\", \"duration\": 60, \"description\": \"Description\",\n");
        sb.append("      \"learningObjectives\": [\"objectif 1\", \"objectif 2\"],\n");
        sb.append("      \"difficulty\": \"intermediate\",\n");
        sb.append("      \"sessions\": [\n");
        sb.append("        { \"title\": \"Titre session\", \"duration\": \"45min\", \"type\": \"cours|atelier|exercice|discussion\", \"description\": \"Contenu\" }\n");
        sb.append("      ]\n    }\n  ]\n}\n\n");
        sb.append("Modules à détailler:\n");
        for (Map<String, Object> m : modules) {
            sb.append("- Module ").append(m.get("id")).append(": ").append(m.get("title"))
              .append(" (").append(m.get("duration")).append(" min) — ").append(m.get("description")).append("\n");
        }
        return sb.toString();
    }

    /**
     * Generate a rich presentation from a curriculum using 3 parallel batches (port of program-generator (3))
     */
    public Map<String, Object> generatePresentation(Map<String, Object> curriculum) throws Exception {
        if (!checkAIAvailability()) {
            throw new RuntimeException("AI service is not available");
        }

        String programInfo = "Titre: " + curriculum.getOrDefault("title", "") + "\n" +
            "Description: " + curriculum.getOrDefault("description", "") + "\n" +
            "Durée: " + curriculum.getOrDefault("totalDuration", "") + " min\n" +
            "Niveau: " + curriculum.getOrDefault("level", "") + "\n" +
            "Objectifs: " + curriculum.getOrDefault("objectives", "") + "\n" +
            "Modules: " + curriculum.getOrDefault("modules", "");

        String slideJsonFormat = "{\"slides\": [{\"id\": 1, \"type\": \"cover|agenda|content|exercise|conclusion\", " +
            "\"title\": \"Titre\", \"subtitle\": \"Sous-titre\", \"content\": \"Contenu principal (2-3 phrases)\", " +
            "\"bullets\": [\"point 1\", \"point 2\"], \"note\": \"Note pr\u00E9sentateur\", " +
            "\"icon\": \"emoji\", \"highlight\": \"chiffre cl\u00E9\", " +
            "\"imageUrl\": \"Générer une URL d'image Pollinations AI. Format obligatoire exact: https://image.pollinations.ai/prompt/DESCRIPTION+EN+ANGLAIS+ICI+ultra+realiste+photographic?width=800&height=600&nologo=true Exemple: https://image.pollinations.ai/prompt/a+professional+business+meeting+in+modern+office+ultra+realiste?width=800&height=600&nologo=true\"}]}";

        String batch1Desc = "Slide 1: Slide de titre — accroche très impactante, slogan fort, chiffre clé du domaine\n" +
            "Slide 2: Contexte et problématique — statistiques, enjeux actuels, chiffres de référence\n" +
            "Slide 3: Définitions et concepts fondamentaux — clair, accessible, avec exemples\n" +
            "Slide 4: Historique et évolution — dates clés, faits marquants\n" +
            "Slide 5: Fonctionnement détaillé — mécanismes, processus étape par étape\n" +
            "Slide 6: Comparaisons et distinctions importantes";

        String batch2Desc = "Slide 7: Typologies et catégories\n" +
            "Slide 8: Services et offres disponibles — liste complète avec exemples\n" +
            "Slide 9: Avantages pour les bénéficiaires — chiffres, témoignages\n" +
            "Slide 10: Inconvénients et limites — regard critique\n" +
            "Slide 11: Cas pratique — exemple réel avec chiffres concrets";

        String batch3Desc = "Slide 12: Rôle dans l'écosystème global — lien avec le secteur\n" +
            "Slide 13: Enjeux actuels — digitalisation, accessibilité, défis\n" +
            "Slide 14: Innovations — nouvelles technologies, tendances\n" +
            "Slide 15: Conclusion synthétique — récapitulatif, messages clés, perspectives";

        String prompt1 = buildPresentationBatchPrompt(programInfo, batch1Desc, 1, slideJsonFormat);
        String prompt2 = buildPresentationBatchPrompt(programInfo, batch2Desc, 7, slideJsonFormat);
        String prompt3 = buildPresentationBatchPrompt(programInfo, batch3Desc, 12, slideJsonFormat);

        log.info("📊 Generating presentation in 3 parallel batches...");

        java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newFixedThreadPool(3);
        java.util.concurrent.Future<Map<String, Object>> f1 = executor.submit(() -> callAI(prompt1, 5000));
        java.util.concurrent.Future<Map<String, Object>> f2 = executor.submit(() -> callAI(prompt2, 5000));
        java.util.concurrent.Future<Map<String, Object>> f3 = executor.submit(() -> callAI(prompt3, 5000));

        Map<String, Object> r1 = f1.get();
        Map<String, Object> r2 = f2.get();
        Map<String, Object> r3 = f3.get();
        executor.shutdown();

        @SuppressWarnings("unchecked") List<Map<String, Object>> slides1 = (List<Map<String, Object>>) r1.get("slides");
        @SuppressWarnings("unchecked") List<Map<String, Object>> slides2 = (List<Map<String, Object>>) r2.get("slides");
        @SuppressWarnings("unchecked") List<Map<String, Object>> slides3 = (List<Map<String, Object>>) r3.get("slides");

        List<Map<String, Object>> allSlides = new ArrayList<>();
        int idx = 1;
        if (slides1 != null) for (Map<String, Object> s : slides1) { s.put("id", idx++); allSlides.add(s); }
        if (slides2 != null) for (Map<String, Object> s : slides2) { s.put("id", idx++); allSlides.add(s); }
        if (slides3 != null) for (Map<String, Object> s : slides3) { s.put("id", idx++); allSlides.add(s); }

        Map<String, Object> presentation = new HashMap<>();
        presentation.put("title", curriculum.getOrDefault("title", "Présentation"));
        presentation.put("slides", allSlides);
        presentation.put("totalSlides", allSlides.size());
        presentation.put("estimatedTime", curriculum.getOrDefault("totalDuration", "60") + " min");

        log.info("✅ Presentation generated with {} slides", allSlides.size());
        return presentation;
    }

    private String buildPresentationBatchPrompt(String programInfo, String slideDescriptions, int startId, String slideJsonFormat) {
        return "Tu es un expert en création de présentations professionnelles.\n\n" +
            "PROGRAMME:\n" + programInfo + "\n\n" +
            "Génère UNIQUEMENT les slides suivantes. Chaque slide doit être riche et détaillée.\n" +
            slideDescriptions + "\n\n" +
            "Réponds UNIQUEMENT avec ce JSON valide, sans markdown (slide id commence à " + startId + "):\n" +
            slideJsonFormat;
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

    public void organizeTrainingContent(String trainingId, List<FileInfo> files, String organizationInstructions) throws Exception {
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
        
        // Generate quizzes based on user options - DISABLED as per content-only requirement
        log.info("Quiz generation disabled for training: {} (content-only mode active)", trainingId);
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
            
            // Set basic info with safety
            String trainingId = (training != null) ? training.getId() : null;
            if (trainingId == null) {
                log.warn("ManualTraining ID is null, skipping module mapping");
                continue;
            }
            
            module.setTrainingId(trainingId);
            module.setTitle((String) moduleData.getOrDefault("title", "Untitled Module"));
            module.setDescription((String) moduleData.getOrDefault("description", ""));
            
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

                    // Get file info with safety
                    Object fileIndexObj = sectionData.get("fileIndex");
                    int fileIndex = -1;
                    if (fileIndexObj instanceof Number number) {
                        fileIndex = number.intValue();
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
            
            // Download file from GCS or read from Local Storage
            byte[] fileBytes;
            if (file.getUrl().startsWith("/uploads/")) {
                String fileName = file.getUrl().substring("/uploads/".length());
                java.nio.file.Path path = java.nio.file.Paths.get(localUploadDir, fileName);
                fileBytes = java.nio.file.Files.readAllBytes(path);
                log.info("📂 Read file from local storage: {}", path);
            } else {
                ResponseEntity<byte[]> response = restTemplate.getForEntity(file.getUrl(), byte[].class);
                fileBytes = response.getBody();
            }
            
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
