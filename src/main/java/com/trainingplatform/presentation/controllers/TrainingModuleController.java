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

import java.util.ArrayList;
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
            System.out.println("[TrainingModuleController] Creating module with data: " + moduleData);
            TrainingModule module = convertMapToModule(moduleData);
            System.out.println("[TrainingModuleController] Converted module: title=" + module.getTitle() + ", trainingJourneyId=" + module.getTrainingJourneyId());
            TrainingModule created = moduleService.createModule(module);
            System.out.println("[TrainingModuleController] Created module: _id=" + created.get_id() + ", title=" + created.getTitle());
            
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
            System.out.println("[TrainingModuleController] Converting Map to TrainingModule: " + data);
            TrainingModule module = objectMapper.convertValue(data, TrainingModule.class);
            System.out.println("[TrainingModuleController] Converted module: title=" + module.getTitle() + ", trainingJourneyId=" + module.getTrainingJourneyId());
            return module;
        } catch (Exception e) {
            System.err.println("[TrainingModuleController] Error converting with ObjectMapper, using fallback: " + e.getMessage());
            // Fallback manual conversion
            TrainingModule module = new TrainingModule();
            if (data.containsKey("title")) {
                Object titleObj = data.get("title");
                module.setTitle(titleObj != null ? titleObj.toString() : null);
            }
            if (data.containsKey("description")) {
                Object descObj = data.get("description");
                module.setDescription(descObj != null ? descObj.toString() : null);
            }
            if (data.containsKey("trainingJourneyId")) {
                Object journeyIdObj = data.get("trainingJourneyId");
                module.setTrainingJourneyId(journeyIdObj != null ? journeyIdObj.toString() : null);
            }
            if (data.containsKey("duration")) {
                Object durationObj = data.get("duration");
                if (durationObj instanceof Number) {
                    module.setDuration(((Number) durationObj).intValue());
                }
            }
            if (data.containsKey("difficulty")) {
                Object diffObj = data.get("difficulty");
                module.setDifficulty(diffObj != null ? diffObj.toString() : null);
            }
            if (data.containsKey("learningObjectives")) {
                @SuppressWarnings("unchecked")
                List<String> objectives = (List<String>) data.get("learningObjectives");
                module.setLearningObjectives(objectives != null ? objectives : new ArrayList<>());
            }
            if (data.containsKey("prerequisites")) {
                @SuppressWarnings("unchecked")
                List<String> prereqs = (List<String>) data.get("prerequisites");
                module.setPrerequisites(prereqs != null ? prereqs : new ArrayList<>());
            }
            if (data.containsKey("topics")) {
                @SuppressWarnings("unchecked")
                List<String> topics = (List<String>) data.get("topics");
                module.setTopics(topics != null ? topics : new ArrayList<>());
            }
            if (data.containsKey("sectionIds")) {
                @SuppressWarnings("unchecked")
                List<String> sectionIds = (List<String>) data.get("sectionIds");
                module.setSectionIds(sectionIds != null ? sectionIds : new ArrayList<>());
            }
            if (data.containsKey("quizIds")) {
                @SuppressWarnings("unchecked")
                List<String> quizIds = (List<String>) data.get("quizIds");
                module.setQuizIds(quizIds != null ? quizIds : new ArrayList<>());
            }
            if (data.containsKey("order")) {
                Object orderObj = data.get("order");
                if (orderObj instanceof Number) {
                    module.setOrder(((Number) orderObj).intValue());
                }
            }
            System.out.println("[TrainingModuleController] Fallback conversion result: title=" + module.getTitle() + ", trainingJourneyId=" + module.getTrainingJourneyId());
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

