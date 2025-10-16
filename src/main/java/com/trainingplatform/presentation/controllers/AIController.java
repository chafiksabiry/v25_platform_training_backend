package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.AIService;
import com.trainingplatform.application.services.DocumentParserService;
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
    
    /**
     * POST /api/ai/analyze-document
     * Analyse un document uploadé
     */
    @PostMapping("/analyze-document")
    public ResponseEntity<Map<String, Object>> analyzeDocument(
        @RequestParam("file") MultipartFile file
    ) {
        try {
            String content = documentParserService.extractText(file);
            Map<String, Object> analysis = aiService.analyzeDocument(content, file.getOriginalFilename());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("fileName", file.getOriginalFilename());
            response.put("fileSize", file.getSize());
            response.put("analysis", analysis);
            
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
            Map<String, Object> documentAnalysis = (Map<String, Object>) request.get("analysis");
            String industry = (String) request.getOrDefault("industry", "General");
            
            Map<String, Object> curriculum = aiService.generateCurriculum(documentAnalysis, industry);
            
            return ResponseEntity.ok(curriculum);
            
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
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
}

