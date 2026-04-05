package com.trainingplatform.presentation.controllers;

import com.trainingplatform.domain.entities.TrainingPresentationEntity;
import com.trainingplatform.domain.repositories.TrainingPresentationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/presentations")
@CrossOrigin(origins = "*")
public class PresentationController {

    @Autowired
    private TrainingPresentationRepository presentationRepository;

    /**
     * POST /api/presentations
     * Save a new AI-generated presentation
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> savePresentation(@RequestBody TrainingPresentationEntity presentation) {
        try {
            System.out.println("[PresentationController] Saving presentation: " + presentation.getTitle());
            
            presentation.setCreatedAt(LocalDateTime.now());
            presentation.setUpdatedAt(LocalDateTime.now());
            
            TrainingPresentationEntity saved = presentationRepository.save(presentation);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Presentation saved successfully");
            response.put("data", saved);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[PresentationController] Error saving presentation: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * GET /api/presentations/available
     * Get all presentations for a company or overall
     */
    @GetMapping("/available")
    public ResponseEntity<Map<String, Object>> getAvailablePresentations(@RequestParam(required = false) String companyId) {
        try {
            List<TrainingPresentationEntity> presentations;
            if (companyId != null && !companyId.isEmpty()) {
                presentations = presentationRepository.findByCompanyId(companyId);
            } else {
                presentations = presentationRepository.findAll();
            }
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", presentations);
            response.put("count", presentations.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * GET /api/presentations/{id}
     * Get a specific presentation
     */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getPresentation(@PathVariable String id) {
        try {
            Optional<TrainingPresentationEntity> presentation = presentationRepository.findById(id);
            
            if (presentation.isPresent()) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("data", presentation.get());
                return ResponseEntity.ok(response);
            } else {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "Presentation not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
}
