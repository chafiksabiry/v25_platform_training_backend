package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.TrainingModuleService;
import com.trainingplatform.application.services.TrainingSectionService;
import com.trainingplatform.core.entities.TrainingModule;
import com.trainingplatform.core.entities.TrainingSection;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/training_modules")
@CrossOrigin(origins = "*")
public class TrainingModuleController {
    
    @Autowired
    private TrainingModuleService moduleService;
    
    @Autowired
    private TrainingSectionService sectionService;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    /**
     * POST /training_modules
     * Create a new training module
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createModule(@RequestBody Map<String, Object> moduleData) {
        try {
            TrainingModule module = convertMapToModule(moduleData);
            TrainingModule created = moduleService.createModule(module);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Module created successfully");
            response.put("data", created);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error creating module: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_modules/{id}
     * Get a module by ID
     */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getModule(@PathVariable String id) {
        try {
            TrainingModule module = moduleService.getModuleById(id);
            
            if (module != null) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("data", module);
                return ResponseEntity.ok(response);
            } else {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Module not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error getting module: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_modules/journey/{journeyId}
     * Get all modules for a training journey
     */
    @GetMapping("/journey/{journeyId}")
    public ResponseEntity<Map<String, Object>> getModulesByJourney(@PathVariable String journeyId) {
        try {
            List<TrainingModule> modules = moduleService.getModulesByTrainingJourney(journeyId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", modules);
            response.put("count", modules.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error getting modules: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * PUT /training_modules/{id}
     * Update a module
     */
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateModule(
            @PathVariable String id,
            @RequestBody Map<String, Object> moduleData) {
        try {
            TrainingModule module = convertMapToModule(moduleData);
            module.set_id(id);
            TrainingModule updated = moduleService.updateModule(module);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Module updated successfully");
            response.put("data", updated);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error updating module: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * DELETE /training_modules/{id}
     * Delete a module
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteModule(@PathVariable String id) {
        try {
            moduleService.deleteModule(id);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Module deleted successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error deleting module: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /training_modules/{moduleId}/sections
     * Create a section for a module
     */
    @PostMapping("/{moduleId}/sections")
    public ResponseEntity<Map<String, Object>> createSection(
            @PathVariable String moduleId,
            @RequestBody Map<String, Object> sectionData) {
        try {
            TrainingSection section = convertMapToSection(sectionData);
            section.setModuleId(moduleId);
            TrainingSection created = sectionService.createSection(section);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Section created successfully");
            response.put("data", created);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error creating section: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_modules/{moduleId}/sections
     * Get all sections for a module
     */
    @GetMapping("/{moduleId}/sections")
    public ResponseEntity<Map<String, Object>> getSectionsByModule(@PathVariable String moduleId) {
        try {
            List<TrainingSection> sections = sectionService.getSectionsByModule(moduleId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", sections);
            response.put("count", sections.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error getting sections: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_sections/{id}
     * Get a section by ID
     */
    @GetMapping("/sections/{id}")
    public ResponseEntity<Map<String, Object>> getSection(@PathVariable String id) {
        try {
            TrainingSection section = sectionService.getSectionById(id);
            
            if (section != null) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("data", section);
                return ResponseEntity.ok(response);
            } else {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Section not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error getting section: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * PUT /training_sections/{id}
     * Update a section
     */
    @PutMapping("/sections/{id}")
    public ResponseEntity<Map<String, Object>> updateSection(
            @PathVariable String id,
            @RequestBody Map<String, Object> sectionData) {
        try {
            TrainingSection section = convertMapToSection(sectionData);
            section.set_id(id);
            TrainingSection updated = sectionService.updateSection(section);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Section updated successfully");
            response.put("data", updated);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error updating section: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * DELETE /training_sections/{id}
     * Delete a section
     */
    @DeleteMapping("/sections/{id}")
    public ResponseEntity<Map<String, Object>> deleteSection(@PathVariable String id) {
        try {
            sectionService.deleteSection(id);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Section deleted successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error deleting section: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * Helper method to convert Map to TrainingModule
     */
    private TrainingModule convertMapToModule(Map<String, Object> data) {
        try {
            return objectMapper.convertValue(data, TrainingModule.class);
        } catch (Exception e) {
            // Fallback manual conversion
            TrainingModule module = new TrainingModule();
            if (data.containsKey("title")) module.setTitle((String) data.get("title"));
            if (data.containsKey("description")) module.setDescription((String) data.get("description"));
            if (data.containsKey("trainingJourneyId")) module.setTrainingJourneyId((String) data.get("trainingJourneyId"));
            if (data.containsKey("duration")) module.setDuration(((Number) data.get("duration")).intValue());
            if (data.containsKey("difficulty")) module.setDifficulty((String) data.get("difficulty"));
            if (data.containsKey("learningObjectives")) module.setLearningObjectives((List<String>) data.get("learningObjectives"));
            if (data.containsKey("prerequisites")) module.setPrerequisites((List<String>) data.get("prerequisites"));
            if (data.containsKey("topics")) module.setTopics((List<String>) data.get("topics"));
            if (data.containsKey("sectionIds")) module.setSectionIds((List<String>) data.get("sectionIds"));
            if (data.containsKey("quizIds")) module.setQuizIds((List<String>) data.get("quizIds"));
            if (data.containsKey("order")) module.setOrder(((Number) data.get("order")).intValue());
            return module;
        }
    }
    
    /**
     * Helper method to convert Map to TrainingSection
     */
    private TrainingSection convertMapToSection(Map<String, Object> data) {
        try {
            return objectMapper.convertValue(data, TrainingSection.class);
        } catch (Exception e) {
            // Fallback manual conversion
            TrainingSection section = new TrainingSection();
            if (data.containsKey("title")) section.setTitle((String) data.get("title"));
            if (data.containsKey("type")) section.setType((String) data.get("type"));
            if (data.containsKey("moduleId")) section.setModuleId((String) data.get("moduleId"));
            if (data.containsKey("order")) section.setOrder(((Number) data.get("order")).intValue());
            if (data.containsKey("duration")) section.setDuration(((Number) data.get("duration")).intValue());
            if (data.containsKey("content")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> contentData = (Map<String, Object>) data.get("content");
                TrainingSection.SectionContent content = new TrainingSection.SectionContent();
                if (contentData.containsKey("text")) content.setText((String) contentData.get("text"));
                if (contentData.containsKey("youtubeUrl")) content.setYoutubeUrl((String) contentData.get("youtubeUrl"));
                if (contentData.containsKey("file")) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> fileData = (Map<String, Object>) contentData.get("file");
                    TrainingSection.SectionFile file = new TrainingSection.SectionFile();
                    if (fileData.containsKey("id")) file.setId((String) fileData.get("id"));
                    if (fileData.containsKey("name")) file.setName((String) fileData.get("name"));
                    if (fileData.containsKey("type")) file.setType((String) fileData.get("type"));
                    if (fileData.containsKey("url")) file.setUrl((String) fileData.get("url"));
                    if (fileData.containsKey("publicId")) file.setPublicId((String) fileData.get("publicId"));
                    if (fileData.containsKey("size")) file.setSize(((Number) fileData.get("size")).longValue());
                    if (fileData.containsKey("mimeType")) file.setMimeType((String) fileData.get("mimeType"));
                    content.setFile(file);
                }
                section.setContent(content);
            }
            return section;
        }
    }
}

