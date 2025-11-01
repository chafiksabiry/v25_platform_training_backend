package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.ManualTrainingService;
import com.trainingplatform.core.entities.ManualTraining;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/manual-trainings")
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "*")
public class ManualTrainingController {
    
    private final ManualTrainingService trainingService;
    
    /**
     * Create a new manual training
     */
    @PostMapping
    public ResponseEntity<?> createTraining(@RequestBody ManualTraining training) {
        try {
            ManualTraining created = trainingService.createTraining(training);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Training created successfully",
                "data", created
            ));
        } catch (Exception e) {
            log.error("Error creating training", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Get all trainings for a company
     */
    @GetMapping("/company/{companyId}")
    public ResponseEntity<?> getTrainingsByCompany(@PathVariable String companyId) {
        try {
            List<ManualTraining> trainings = trainingService.getTrainingsByCompany(companyId);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "data", trainings
            ));
        } catch (Exception e) {
            log.error("Error fetching trainings", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Get training by ID
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getTrainingById(@PathVariable String id) {
        try {
            ManualTraining training = trainingService.getTrainingById(id);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "data", training
            ));
        } catch (Exception e) {
            log.error("Error fetching training", e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Update training
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateTraining(
        @PathVariable String id,
        @RequestBody ManualTraining training
    ) {
        try {
            ManualTraining updated = trainingService.updateTraining(id, training);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Training updated successfully",
                "data", updated
            ));
        } catch (Exception e) {
            log.error("Error updating training", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Upload training thumbnail
     */
    @PostMapping("/{id}/thumbnail")
    public ResponseEntity<?> uploadThumbnail(
        @PathVariable String id,
        @RequestParam("file") MultipartFile file
    ) {
        try {
            ManualTraining updated = trainingService.uploadThumbnail(id, file);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Thumbnail uploaded successfully",
                "data", updated
            ));
        } catch (Exception e) {
            log.error("Error uploading thumbnail", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Publish training
     */
    @PostMapping("/{id}/publish")
    public ResponseEntity<?> publishTraining(@PathVariable String id) {
        try {
            ManualTraining published = trainingService.publishTraining(id);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Training published successfully",
                "data", published
            ));
        } catch (Exception e) {
            log.error("Error publishing training", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Archive training
     */
    @PostMapping("/{id}/archive")
    public ResponseEntity<?> archiveTraining(@PathVariable String id) {
        try {
            ManualTraining archived = trainingService.archiveTraining(id);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Training archived successfully",
                "data", archived
            ));
        } catch (Exception e) {
            log.error("Error archiving training", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Delete training
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteTraining(@PathVariable String id) {
        try {
            trainingService.deleteTraining(id);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Training deleted successfully"
            ));
        } catch (Exception e) {
            log.error("Error deleting training", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
    
    /**
     * Get training statistics
     */
    @GetMapping("/company/{companyId}/stats")
    public ResponseEntity<?> getTrainingStats(@PathVariable String companyId) {
        try {
            ManualTrainingService.TrainingStats stats = trainingService.getTrainingStats(companyId);
            return ResponseEntity.ok(Map.of(
                "success", true,
                "data", stats
            ));
        } catch (Exception e) {
            log.error("Error fetching stats", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("success", false, "message", e.getMessage()));
        }
    }
}

