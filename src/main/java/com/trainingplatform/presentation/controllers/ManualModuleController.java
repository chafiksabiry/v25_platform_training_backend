package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.ManualModuleService;
import com.trainingplatform.core.entities.ManualTrainingModule;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/manual-trainings")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "*")
public class ManualModuleController {
    
    private final ManualModuleService moduleService;
    
    /**
     * Create a new module
     */
    @PostMapping("/{trainingId}/modules")
    public ResponseEntity<?> createModule(
        @PathVariable String trainingId,
        @RequestBody ManualTrainingModule module
    ) {
        try {
            module.setTrainingId(trainingId);
            ManualTrainingModule created = moduleService.createModule(module);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Module created successfully",
                "data", created
            ));
        } catch (Exception e) {
            log.error("Error creating module", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Get all modules for a training
     */
    @GetMapping("/{trainingId}/modules")
    public ResponseEntity<?> getModulesByTraining(@PathVariable String trainingId) {
        try {
            List<ManualTrainingModule> modules = moduleService.getModulesByTraining(trainingId);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "data", modules
            ));
        } catch (Exception e) {
            log.error("Error fetching modules", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Get module by ID
     */
    @GetMapping("/modules/{id}")
    public ResponseEntity<?> getModuleById(@PathVariable String id) {
        try {
            ManualTrainingModule module = moduleService.getModuleById(id);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "data", module
            ));
        } catch (Exception e) {
            log.error("Error fetching module", e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Update module
     */
    @PutMapping("/modules/{id}")
    public ResponseEntity<?> updateModule(
        @PathVariable String id,
        @RequestBody ManualTrainingModule module
    ) {
        try {
            ManualTrainingModule updated = moduleService.updateModule(id, module);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Module updated successfully",
                "data", updated
            ));
        } catch (Exception e) {
            log.error("Error updating module", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Add section to module
     */
    @PostMapping("/modules/{moduleId}/sections")
    public ResponseEntity<?> addSection(
        @PathVariable String moduleId,
        @RequestBody ManualTrainingModule.TrainingSection section
    ) {
        try {
            ManualTrainingModule updated = moduleService.addSection(moduleId, section);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Section added successfully",
                "data", updated
            ));
        } catch (Exception e) {
            log.error("Error adding section", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Update section
     */
    @PutMapping("/modules/{moduleId}/sections/{sectionId}")
    public ResponseEntity<?> updateSection(
        @PathVariable String moduleId,
        @PathVariable String sectionId,
        @RequestBody ManualTrainingModule.TrainingSection section
    ) {
        try {
            ManualTrainingModule updated = moduleService.updateSection(moduleId, sectionId, section);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Section updated successfully",
                "data", updated
            ));
        } catch (Exception e) {
            log.error("Error updating section", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Delete section
     */
    @DeleteMapping("/modules/{moduleId}/sections/{sectionId}")
    public ResponseEntity<?> deleteSection(
        @PathVariable String moduleId,
        @PathVariable String sectionId
    ) {
        try {
            ManualTrainingModule updated = moduleService.deleteSection(moduleId, sectionId);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Section deleted successfully",
                "data", updated
            ));
        } catch (Exception e) {
            log.error("Error deleting section", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Move section from one module to another
     */
    @PostMapping("/modules/{targetModuleId}/sections/move")
    public ResponseEntity<?> moveSection(
        @PathVariable String targetModuleId,
        @RequestBody Map<String, Object> request
    ) {
        try {
            String sectionId = (String) request.get("sectionId");
            String fromModuleId = (String) request.get("fromModuleId");
            Integer targetIndex = request.get("targetIndex") != null ? (Integer) request.get("targetIndex") : null;
            
            if (sectionId == null || fromModuleId == null) {
                return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "message", "sectionId and fromModuleId are required"));
            }
            
            moduleService.moveSection(fromModuleId, targetModuleId, sectionId, targetIndex);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Section moved successfully"
            ));
        } catch (Exception e) {
            log.error("Error moving section", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Reorder section within the same module
     */
    @PostMapping("/modules/{moduleId}/sections/reorder")
    public ResponseEntity<?> reorderSection(
        @PathVariable String moduleId,
        @RequestBody Map<String, Object> request
    ) {
        try {
            String sectionId = (String) request.get("sectionId");
            Integer newIndex = (Integer) request.get("newIndex");
            
            if (sectionId == null || newIndex == null) {
                return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "message", "sectionId and newIndex are required"));
            }
            
            moduleService.reorderSection(moduleId, sectionId, newIndex);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Section reordered successfully"
            ));
        } catch (Exception e) {
            log.error("Error reordering section", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Upload file for section
     */
    @PostMapping("/modules/upload")
    public ResponseEntity<?> uploadFile(
        @RequestParam("file") MultipartFile file,
        @RequestParam("fileType") String fileType
    ) {
        try {
            ManualTrainingModule.ContentFile contentFile = moduleService.uploadFile(file, fileType);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "File uploaded successfully",
                "data", contentFile
            ));
        } catch (Exception e) {
            log.error("Error uploading file", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Delete module
     */
    @DeleteMapping("/modules/{id}")
    public ResponseEntity<?> deleteModule(@PathVariable String id) {
        try {
            moduleService.deleteModule(id);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Module deleted successfully"
            ));
        } catch (Exception e) {
            log.error("Error deleting module", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Reorder modules
     */
    @PostMapping("/{trainingId}/modules/reorder")
    public ResponseEntity<?> reorderModules(
        @PathVariable String trainingId,
        @RequestBody List<String> moduleIds
    ) {
        try {
            moduleService.reorderModules(trainingId, moduleIds);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Modules reordered successfully"
            ));
        } catch (Exception e) {
            log.error("Error reordering modules", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
}

