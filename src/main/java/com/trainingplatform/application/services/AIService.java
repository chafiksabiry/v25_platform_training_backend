package com.trainingplatform.application.services;

import com.theokanning.openai.completion.chat.ChatCompletionRequest;
import com.theokanning.openai.completion.chat.ChatCompletionResult;
import com.theokanning.openai.completion.chat.ChatMessage;
import com.theokanning.openai.completion.chat.ChatMessageRole;
import com.theokanning.openai.service.OpenAiService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.*;

@Service
public class AIService {
    
    @Value("${app.ai.openai.api-key}")
    private String openAiApiKey;
    
    @Value("${app.ai.openai.model}")
    private String openAiModel;
    
    @Value("${app.ai.elevenlabs.api-key}")
    private String elevenLabsApiKey;
    
    @Value("${app.ai.elevenlabs.voice-id}")
    private String elevenLabsVoiceId;
    
    private OpenAiService openAiService;
    private WebClient elevenLabsClient;
    
    @jakarta.annotation.PostConstruct
    public void init() {
        this.openAiService = new OpenAiService(openAiApiKey, Duration.ofSeconds(60));
        this.elevenLabsClient = WebClient.builder()
            .baseUrl("https://api.elevenlabs.io/v1")
            .defaultHeader("xi-api-key", elevenLabsApiKey)
            .build();
    }
    
    /**
     * Analyse un document avec GPT-4
     */
    public Map<String, Object> analyzeDocument(String content, String fileName) {
        String prompt = String.format("""
            Analyze this training document and provide:
            1. Key topics (list of 3-5 main topics)
            2. Difficulty level (scale 1-10)
            3. Estimated reading time in minutes
            4. Learning objectives (3-5 specific objectives)
            5. Prerequisites (2-3 prerequisites)
            6. Suggested module structure (4-6 module names)
            
            Document: %s
            
            Respond in JSON format:
            {
              "keyTopics": ["topic1", "topic2", ...],
              "difficulty": 5,
              "estimatedReadTime": 25,
              "learningObjectives": ["objective1", ...],
              "prerequisites": ["prereq1", ...],
              "suggestedModules": ["module1", ...]
            }
            """, content.substring(0, Math.min(content.length(), 4000)));
        
        List<ChatMessage> messages = Arrays.asList(
            new ChatMessage(ChatMessageRole.SYSTEM.value(), 
                "You are an expert training content analyzer. Always respond with valid JSON."),
            new ChatMessage(ChatMessageRole.USER.value(), prompt)
        );
        
        ChatCompletionRequest request = ChatCompletionRequest.builder()
            .model(openAiModel)
            .messages(messages)
            .temperature(0.7)
            .maxTokens(2000)
            .build();
        
        ChatCompletionResult result = openAiService.createChatCompletion(request);
        String responseContent = result.getChoices().get(0).getMessage().getContent();
        
        return parseJsonResponse(responseContent);
    }
    
    /**
     * Génère du contenu texte amélioré
     */
    public String enhanceContent(String originalContent) {
        String prompt = String.format("""
            Improve this training content to make it more engaging, clear, and pedagogical.
            Add examples, clarify concepts, and structure it better for learning.
            
            Original content:
            %s
            
            Enhanced content:
            """, originalContent);
        
        List<ChatMessage> messages = Arrays.asList(
            new ChatMessage(ChatMessageRole.SYSTEM.value(), 
                "You are an expert instructional designer."),
            new ChatMessage(ChatMessageRole.USER.value(), prompt)
        );
        
        ChatCompletionRequest request = ChatCompletionRequest.builder()
            .model(openAiModel)
            .messages(messages)
            .temperature(0.8)
            .maxTokens(2000)
            .build();
        
        ChatCompletionResult result = openAiService.createChatCompletion(request);
        return result.getChoices().get(0).getMessage().getContent();
    }
    
    /**
     * Génère des questions de quiz
     */
    public List<Map<String, Object>> generateQuizQuestions(String content, int count) {
        String prompt = String.format("""
            Generate %d multiple-choice quiz questions based on this content.
            Each question should have 4 options with one correct answer.
            
            Content: %s
            
            Respond in JSON format:
            [
              {
                "text": "Question text?",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correctAnswer": 0,
                "explanation": "Why this is correct"
              }
            ]
            """, count, content.substring(0, Math.min(content.length(), 5190)));
        
        List<ChatMessage> messages = Arrays.asList(
            new ChatMessage(ChatMessageRole.SYSTEM.value(), 
                "You are an expert at creating educational assessments. Always respond with valid JSON array."),
            new ChatMessage(ChatMessageRole.USER.value(), prompt)
        );
        
        ChatCompletionRequest request = ChatCompletionRequest.builder()
            .model(openAiModel)
            .messages(messages)
            .temperature(0.7)
            .maxTokens(2000)
            .build();
        
        ChatCompletionResult result = openAiService.createChatCompletion(request);
        String responseContent = result.getChoices().get(0).getMessage().getContent();
        
        return parseJsonArrayResponse(responseContent);
    }
    
    /**
     * Génère un audio avec ElevenLabs
     */
    public byte[] generateAudio(String text) {
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("text", text);
        requestBody.put("model_id", "eleven_monolingual_v1");
        requestBody.put("voice_settings", Map.of(
            "stability", 0.5,
            "similarity_boost", 0.75
        ));
        
        return elevenLabsClient.post()
            .uri("/text-to-speech/" + elevenLabsVoiceId)
            .bodyValue(requestBody)
            .retrieve()
            .bodyToMono(byte[].class)
            .block();
    }
    
    /**
     * Chat avec AI Tutor
     */
    public String chatWithTutor(String userMessage, String context) {
        List<ChatMessage> messages = Arrays.asList(
            new ChatMessage(ChatMessageRole.SYSTEM.value(), 
                "You are a helpful AI tutor. Help the student understand concepts clearly. " +
                "Context: " + context),
            new ChatMessage(ChatMessageRole.USER.value(), userMessage)
        );
        
        ChatCompletionRequest request = ChatCompletionRequest.builder()
            .model(openAiModel)
            .messages(messages)
            .temperature(0.9)
            .maxTokens(500)
            .build();
        
        ChatCompletionResult result = openAiService.createChatCompletion(request);
        return result.getChoices().get(0).getMessage().getContent();
    }
    
    /**
     * Génère un curriculum de formation complet basé sur l'analyse du document
     */
    public Map<String, Object> generateCurriculum(Map<String, Object> documentAnalysis, String industry) {
        // Extraire les informations de l'analyse
        String keyTopics = documentAnalysis.getOrDefault("keyTopics", new ArrayList<>()).toString();
        String learningObjectives = documentAnalysis.getOrDefault("learningObjectives", new ArrayList<>()).toString();
        String suggestedModules = documentAnalysis.getOrDefault("suggestedModules", new ArrayList<>()).toString();
        Double difficulty = ((Number) documentAnalysis.getOrDefault("difficulty", 5)).doubleValue();
        
        String prompt = String.format("""
            Create a comprehensive training curriculum based on this document analysis:
            
            Key Topics: %s
            Learning Objectives: %s
            Suggested Modules: %s
            Difficulty Level: %.1f/10
            Industry: %s
            
            Generate a detailed curriculum with:
            1. A curriculum title
            2. A description (2-3 sentences)
            3. Total training duration estimate in hours
            4. 4-6 detailed training modules, each with:
               - Module title
               - Module description (2 sentences)
               - Duration in minutes
               - Difficulty level (beginner/intermediate/advanced)
               - Number of content items
               - Number of assessments
               - Enhanced content elements (list 3-5 multimedia elements like videos, infographics, scenarios)
               - 3-7 specific learning objectives for that module
            
            Return ONLY valid JSON in this exact format:
            {
                "title": "Curriculum Title",
                "description": "Curriculum description",
                "totalDuration": 480,
                "methodology": "360° Methodology",
                "modules": [
                    {
                        "title": "Module Title",
                        "description": "Module description",
                        "duration": 90,
                        "difficulty": "beginner",
                        "contentItems": 5,
                        "assessments": 1,
                        "enhancedElements": ["Video Introduction", "Interactive Infographic", "Knowledge Check"],
                        "learningObjectives": ["Objective 1", "Objective 2", "Objective 3"]
                    }
                ]
            }
            """, keyTopics, learningObjectives, suggestedModules, difficulty, industry);
        
        try {
            ChatMessage systemMessage = new ChatMessage(ChatMessageRole.SYSTEM.value(), 
                "You are an expert instructional designer. Create comprehensive, engaging training curricula with multimedia elements.");
            ChatMessage userMessage = new ChatMessage(ChatMessageRole.USER.value(), prompt);
            
            ChatCompletionRequest request = ChatCompletionRequest.builder()
                .model(openAiModel)
                .messages(Arrays.asList(systemMessage, userMessage))
                .temperature(0.7)
                .maxTokens(2500)
                .build();
            
            ChatCompletionResult result = openAiService.createChatCompletion(request);
            String response = result.getChoices().get(0).getMessage().getContent();
            
            Map<String, Object> curriculum = parseJsonResponse(response);
            curriculum.put("success", true);
            
            return curriculum;
        } catch (Exception e) {
            // Fallback curriculum
            Map<String, Object> fallbackCurriculum = new HashMap<>();
            fallbackCurriculum.put("success", false);
            fallbackCurriculum.put("error", "Failed to generate curriculum: " + e.getMessage());
            fallbackCurriculum.put("title", "Training Curriculum");
            fallbackCurriculum.put("description", "Comprehensive training based on uploaded content");
            fallbackCurriculum.put("totalDuration", 360);
            fallbackCurriculum.put("methodology", "360° Methodology");
            
            List<Map<String, Object>> modules = new ArrayList<>();
            List<String> modulesList = (List<String>) documentAnalysis.getOrDefault("suggestedModules", 
                Arrays.asList("Introduction", "Core Content", "Advanced Topics", "Practice & Assessment"));
            
            for (int i = 0; i < modulesList.size(); i++) {
                Map<String, Object> module = new HashMap<>();
                module.put("title", modulesList.get(i));
                module.put("description", "Comprehensive training module covering key concepts and practical applications");
                module.put("duration", 60);
                module.put("difficulty", i == 0 ? "beginner" : (i < 2 ? "intermediate" : "advanced"));
                module.put("contentItems", 4);
                module.put("assessments", 1);
                module.put("enhancedElements", Arrays.asList("Video Introduction", "Core Learning Content", "Interactive Scenario", "Knowledge Assessment"));
                module.put("learningObjectives", Arrays.asList("Master core concepts", "Apply knowledge in practice", "Demonstrate competency"));
                modules.add(module);
            }
            
            fallbackCurriculum.put("modules", modules);
            return fallbackCurriculum;
        }
    }
    
    /**
     * Génère un script vidéo détaillé pour un module de formation
     */
    public Map<String, Object> generateVideoScript(String moduleTitle, String moduleDescription, List<String> learningObjectives) {
        String objectives = learningObjectives != null ? String.join(", ", learningObjectives) : "core concepts";
        
        String prompt = String.format("""
            Create a detailed video script for a training module:
            
            Module Title: %s
            Description: %s
            Learning Objectives: %s
            
            Generate a professional training video script with:
            1. Video duration (in seconds, between 120-300)
            2. 5-8 scenes, each with:
               - Timestamp (start-end in format "MM:SS-MM:SS")
               - Scene title
               - Visual description (what appears on screen)
               - Narration text (what the narrator says)
               - On-screen text (key points to display)
            
            Return ONLY valid JSON in this format:
            {
                "title": "Video Title",
                "duration": 180,
                "description": "Brief video description",
                "scenes": [
                    {
                        "timestamp": "00:00-00:30",
                        "title": "Introduction",
                        "visual": "Opening title card with module name",
                        "narration": "Welcome to this module on...",
                        "onScreenText": ["Key Point 1", "Key Point 2"]
                    }
                ]
            }
            """, moduleTitle, moduleDescription, objectives);
        
        try {
            ChatMessage systemMessage = new ChatMessage(ChatMessageRole.SYSTEM.value(), 
                "You are a professional instructional video script writer. Create engaging, clear, and pedagogical video scripts.");
            ChatMessage userMessage = new ChatMessage(ChatMessageRole.USER.value(), prompt);
            
            ChatCompletionRequest request = ChatCompletionRequest.builder()
                .model(openAiModel)
                .messages(Arrays.asList(systemMessage, userMessage))
                .temperature(0.7)
                .maxTokens(2000)
                .build();
            
            ChatCompletionResult result = openAiService.createChatCompletion(request);
            String response = result.getChoices().get(0).getMessage().getContent();
            
            Map<String, Object> script = parseJsonResponse(response);
            script.put("success", true);
            script.put("type", "gpt4-script");
            
            return script;
        } catch (Exception e) {
            // Fallback script
            Map<String, Object> fallbackScript = new HashMap<>();
            fallbackScript.put("success", true);
            fallbackScript.put("type", "fallback");
            fallbackScript.put("title", moduleTitle + " - Training Video");
            fallbackScript.put("duration", 180);
            fallbackScript.put("description", "Professional training video for " + moduleTitle);
            
            List<Map<String, Object>> scenes = new ArrayList<>();
            
            // Scene 1: Introduction
            Map<String, Object> scene1 = new HashMap<>();
            scene1.put("timestamp", "00:00-00:30");
            scene1.put("title", "Introduction");
            scene1.put("visual", "Opening title card with module name and objectives");
            scene1.put("narration", "Welcome to " + moduleTitle + ". " + moduleDescription);
            scene1.put("onScreenText", Arrays.asList("Module: " + moduleTitle, "Let's begin!"));
            scenes.add(scene1);
            
            // Scene 2: Core Content
            Map<String, Object> scene2 = new HashMap<>();
            scene2.put("timestamp", "00:30-02:00");
            scene2.put("title", "Core Concepts");
            scene2.put("visual", "Animated diagrams and illustrations");
            scene2.put("narration", "Let's explore the key concepts you'll learn in this module.");
            scene2.put("onScreenText", learningObjectives != null ? learningObjectives : Arrays.asList("Key Concept 1", "Key Concept 2"));
            scenes.add(scene2);
            
            // Scene 3: Conclusion
            Map<String, Object> scene3 = new HashMap<>();
            scene3.put("timestamp", "02:00-03:00");
            scene3.put("title", "Summary and Next Steps");
            scene3.put("visual", "Summary slide with key takeaways");
            scene3.put("narration", "Great work! You've learned the fundamentals. Now it's time to practice.");
            scene3.put("onScreenText", Arrays.asList("Summary", "Practice Time", "Continue Learning"));
            scenes.add(scene3);
            
            fallbackScript.put("scenes", scenes);
            return fallbackScript;
        }
    }
    
    // Helper methods
    private Map<String, Object> parseJsonResponse(String json) {
        try {
            int startIdx = json.indexOf("{");
            int endIdx = json.lastIndexOf("}") + 1;
            if (startIdx >= 0 && endIdx > startIdx) {
                json = json.substring(startIdx, endIdx);
            }
            
            com.google.gson.Gson gson = new com.google.gson.Gson();
            return gson.fromJson(json, Map.class);
        } catch (Exception e) {
            Map<String, Object> defaultResponse = new HashMap<>();
            defaultResponse.put("keyTopics", Arrays.asList("General Training", "Skills Development"));
            defaultResponse.put("difficulty", 5);
            defaultResponse.put("estimatedReadTime", 20);
            defaultResponse.put("learningObjectives", Arrays.asList("Understand core concepts"));
            defaultResponse.put("prerequisites", Arrays.asList("Basic knowledge"));
            defaultResponse.put("suggestedModules", Arrays.asList("Introduction", "Core Content", "Practice"));
            return defaultResponse;
        }
    }
    
    private List<Map<String, Object>> parseJsonArrayResponse(String json) {
        try {
            int startIdx = json.indexOf("[");
            int endIdx = json.lastIndexOf("]") + 1;
            if (startIdx >= 0 && endIdx > startIdx) {
                json = json.substring(startIdx, endIdx);
            }
            
            com.google.gson.Gson gson = new com.google.gson.Gson();
            return gson.fromJson(json, List.class);
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }
}

