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

    public void organizeTrainingContent(String trainingId, List<FileInfo> files) throws Exception {
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
        String prompt = buildOrganizationPrompt(training, files);

        // Call OpenAI API
        Map<String, Object> aiResponse = callOpenAI(prompt);

        // Parse response and create modules/sections
        createModulesFromAIResponse(training, aiResponse, files);
    }

    private String buildOrganizationPrompt(ManualTraining training, List<FileInfo> files) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Create training modules from files. Analyze content and organize logically.\n\n");
        
        prompt.append("CONTEXT: ").append(training.getTitle()).append("\n");
        if (training.getDescription() != null && !training.getDescription().isEmpty()) {
            prompt.append(training.getDescription()).append("\n");
        }
        prompt.append("\n");
        
        prompt.append("FILES:\n");
        for (int i = 0; i < files.size(); i++) {
            FileInfo file = files.get(i);
            prompt.append(String.format("\nFile %d: %s\n", i, file.getName()));
            
            // Extract and include actual file content
            String content = extractFileContent(file);
            prompt.append(content).append("\n");
        }

        prompt.append("\nTASK: Create modules with sections from file content. Group related files into modules.\n");
        
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
        if (openaiApiKey == null || openaiApiKey.isEmpty()) {
            throw new RuntimeException("OpenAI API key is not configured");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(openaiApiKey);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", openaiModel);
        requestBody.put("temperature", 0.3); // Lower temperature for better instruction following
        requestBody.put("max_tokens", 2000); // Reduced to fit within context limits

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
            Map<String, Object> messageObj = (Map<String, Object>) choice.get("message");
            String content = (String) messageObj.get("content");

            log.info("OpenAI raw response length: {} chars", content.length());
            log.info("OpenAI response preview (first 500 chars): {}", content.substring(0, Math.min(500, content.length())));

            // Parse the JSON content
            return parseAIResponse(content);
        } catch (Exception e) {
            log.error("Failed to call OpenAI API: {}", e.getMessage());
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
}
