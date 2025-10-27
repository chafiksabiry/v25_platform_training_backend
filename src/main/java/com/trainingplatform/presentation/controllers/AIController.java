package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.AIService;
import com.trainingplatform.application.services.DocumentParserService;
import com.trainingplatform.application.services.PPTExportService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/ai")
public class AIController {
    
    @Autowired
    private AIService aiService;
    
    @Autowired
    private DocumentParserService documentParserService;
    
    @Autowired
    private PPTExportService pptExportService;
    
    /**
     * POST /api/ai/analyze-document
     * Analyse un document uploadé
     */
    @PostMapping("/analyze-document")
    public ResponseEntity<Map<String, Object>> analyzeDocument(
        @RequestParam("file") MultipartFile file
    ) {
        try {
            System.out.println("📄 Analyzing document: " + file.getOriginalFilename() + " (" + file.getSize() + " bytes)");
            
            String content = documentParserService.extractText(file);
            System.out.println("✅ Text extracted: " + content.substring(0, Math.min(100, content.length())) + "...");
            
            Map<String, Object> analysis = aiService.analyzeDocument(content, file.getOriginalFilename());
            System.out.println("✅ AI Analysis complete");
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("fileName", file.getOriginalFilename());
            response.put("fileSize", file.getSize());
            response.put("analysis", analysis);
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            System.err.println("❌ ERROR analyzing document: " + e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
            
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage() != null ? e.getMessage() : "Unknown error occurred");
            errorResponse.put("errorType", e.getClass().getSimpleName());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /ai/analyze-multiple-documents
     * Analyse PLUSIEURS documents et génère UNE SEULE formation consolidée
     */
    @PostMapping("/analyze-multiple-documents")
    public ResponseEntity<Map<String, Object>> analyzeMultipleDocuments(
        @RequestParam("files") List<MultipartFile> files,
        @RequestParam(value = "industry", defaultValue = "General") String industry
    ) {
        try {
            // Extraire le texte de TOUS les fichiers
            List<String> allContents = new ArrayList<>();
            List<String> fileNames = new ArrayList<>();
            long totalSize = 0;
            
            for (MultipartFile file : files) {
                String content = documentParserService.extractText(file);
                allContents.add(content);
                fileNames.add(file.getOriginalFilename());
                totalSize += file.getSize();
            }
            
            // Consolider tous les contenus
            String consolidatedContent = String.join("\n\n--- NEW DOCUMENT ---\n\n", allContents);
            
            // Analyser le contenu consolidé
            Map<String, Object> consolidatedAnalysis = aiService.analyzeConsolidatedDocuments(
                consolidatedContent, fileNames, industry
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("filesCount", files.size());
            response.put("fileNames", fileNames);
            response.put("totalSize", totalSize);
            response.put("analysis", consolidatedAnalysis);
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /api/ai/enhance-content
     */
    @PostMapping("/enhance-content")
    public ResponseEntity<Map<String, Object>> enhanceContent(
        @RequestBody Map<String, String> request
    ) {
        try {
            String originalContent = request.get("content");
            String enhancedContent = aiService.enhanceContent(originalContent);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("enhancedContent", enhancedContent);
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /api/ai/generate-quiz
     */
    @PostMapping("/generate-quiz")
    public ResponseEntity<Map<String, Object>> generateQuiz(
        @RequestBody Map<String, Object> request
    ) {
        try {
            String content = (String) request.get("content");
            int count = request.containsKey("count") ? 
                ((Number) request.get("count")).intValue() : 5;
            
            List<Map<String, Object>> questions = aiService.generateQuizQuestions(content, count);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("questions", questions);
            response.put("count", questions.size());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /api/ai/generate-audio
     */
    @PostMapping("/generate-audio")
    public ResponseEntity<byte[]> generateAudio(
        @RequestBody Map<String, String> request
    ) {
        try {
            String text = request.get("text");
            byte[] audioData = aiService.generateAudio(text);
            
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType("audio/mpeg"));
            headers.setContentLength(audioData.length);
            headers.set("Content-Disposition", "attachment; filename=\"audio.mp3\"");
            
            return new ResponseEntity<>(audioData, headers, HttpStatus.OK);
            
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(null);
        }
    }
    
    /**
     * POST /api/ai/chat
     */
    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(
        @RequestBody Map<String, String> request
    ) {
        try {
            String message = request.get("message");
            String context = request.getOrDefault("context", "");
            
            String response = aiService.chatWithTutor(message, context);
            
            Map<String, Object> responseMap = new HashMap<>();
            responseMap.put("success", true);
            responseMap.put("response", response);
            responseMap.put("timestamp", System.currentTimeMillis());
            
            return ResponseEntity.ok(responseMap);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /ai/generate-curriculum
     * Génère un curriculum complet basé sur l'analyse du document
     */
    @PostMapping("/generate-curriculum")
    public ResponseEntity<Map<String, Object>> generateCurriculum(
        @RequestBody Map<String, Object> request
    ) {
        try {
            System.out.println("📚 Generating curriculum...");
            
            Map<String, Object> documentAnalysis = (Map<String, Object>) request.get("analysis");
            String industry = (String) request.getOrDefault("industry", "General");
            
            if (documentAnalysis == null) {
                throw new IllegalArgumentException("Document analysis is required");
            }
            
            System.out.println("📊 Industry: " + industry);
            System.out.println("📊 Analysis topics: " + documentAnalysis.get("keyTopics"));
            
            Map<String, Object> curriculum = aiService.generateCurriculum(documentAnalysis, industry);
            
            System.out.println("✅ Curriculum generated successfully with " + 
                ((List<?>) curriculum.getOrDefault("modules", new ArrayList<>())).size() + " modules");
            
            return ResponseEntity.ok(curriculum);
            
        } catch (Exception e) {
            System.err.println("❌ ERROR generating curriculum: " + e.getClass().getName() + ": " + e.getMessage());
            e.printStackTrace();
            
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage() != null ? e.getMessage() : "Unknown error occurred");
            errorResponse.put("errorType", e.getClass().getSimpleName());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /ai/generate-video-script
     * Génère un script vidéo détaillé pour un module
     */
    @PostMapping("/generate-video-script")
    public ResponseEntity<Map<String, Object>> generateVideoScript(
        @RequestBody Map<String, Object> request
    ) {
        try {
            String moduleTitle = (String) request.get("title");
            String moduleDescription = (String) request.getOrDefault("description", "Training module");
            List<String> learningObjectives = (List<String>) request.getOrDefault("learningObjectives", new ArrayList<>());
            
            Map<String, Object> script = aiService.generateVideoScript(moduleTitle, moduleDescription, learningObjectives);
            
            return ResponseEntity.ok(script);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /ai/export-powerpoint
     * Exporte un curriculum de formation en PowerPoint (PPT/PPTX)
     * Génère des slides animées avec design moderne et images
     */
    @PostMapping("/export-powerpoint")
    public ResponseEntity<byte[]> exportPowerPoint(@RequestBody Map<String, Object> request) {
        try {
            Map<String, Object> curriculum = (Map<String, Object>) request.get("curriculum");
            
            if (curriculum == null) {
                throw new IllegalArgumentException("Le curriculum est requis");
            }
            
            // Générer le PowerPoint
            byte[] pptData = pptExportService.generatePowerPoint(curriculum);
            
            // Préparer les headers HTTP
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.presentationml.presentation"));
            headers.setContentLength(pptData.length);
            
            String filename = "Formation_" + System.currentTimeMillis() + ".pptx";
            headers.set("Content-Disposition", "attachment; filename=\"" + filename + "\"");
            
            return new ResponseEntity<>(pptData, headers, HttpStatus.OK);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", "Erreur lors de la génération du PowerPoint: " + e.getMessage());
            
            // En cas d'erreur, retourner un JSON d'erreur
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .headers(headers)
                .body(null);
        }
    }
}

