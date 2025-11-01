package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.AIService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
    
    @PostMapping("/organize-training")
    public ResponseEntity<Map<String, Object>> organizeTraining(@RequestBody OrganizeTrainingRequest request) {
            Map<String, Object> response = new HashMap<>();
        
        try {
            log.info("Organizing training {} with {} files", request.getTrainingId(), request.getFiles().size());
            
            // Convert request files to AIService.FileInfo
            List<AIService.FileInfo> files = request.getFiles().stream()
                    .map(f -> new AIService.FileInfo(f.getName(), f.getType(), f.getUrl(), f.getPublicId()))
                    .toList();
            
            aiService.organizeTrainingContent(request.getTrainingId(), files);
            
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

        public String getTrainingId() { return trainingId; }
        public void setTrainingId(String trainingId) { this.trainingId = trainingId; }

        public List<FileInfoRequest> getFiles() { return files; }
        public void setFiles(List<FileInfoRequest> files) { this.files = files; }
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
}
