package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.TrainingJourneyService;
import com.trainingplatform.core.entities.RepProgress;
import com.trainingplatform.domain.entities.TrainingJourneyEntity;
import com.trainingplatform.infrastructure.repositories.RepProgressRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Controller for Rep (Trainee) endpoints
 * All endpoints are prefixed with /api/rep
 */
@RestController
@RequestMapping("/api/rep")
@CrossOrigin(origins = "*")
public class RepController {
    
    @Autowired
    private TrainingJourneyService journeyService;
    
    @Autowired
    private RepProgressRepository repProgressRepository;
    
    /**
     * GET /api/rep/journeys
     * Get all journeys for a specific rep
     */
    @GetMapping("/journeys")
    public ResponseEntity<?> getJourneysForRep(@RequestParam String repId) {
        try {
            System.out.println("[RepController] getJourneysForRep called with repId: " + repId);
            
            List<TrainingJourneyEntity> journeys = journeyService.getJourneysForRep(repId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", journeys);
            response.put("count", journeys.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[RepController] Error in getJourneysForRep: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /api/rep/journeys/{id}
     * Get a specific journey by ID (only if the rep is enrolled)
     */
    @GetMapping("/journeys/{id}")
    public ResponseEntity<?> getJourneyById(
            @PathVariable String id,
            @RequestParam String repId) {
        try {
            Optional<TrainingJourneyEntity> journeyOpt = journeyService.getJourneyById(id);
            
            if (journeyOpt.isPresent()) {
                TrainingJourneyEntity journey = journeyOpt.get();
                
                // Verify that the rep is enrolled in this journey
                if (journey.getEnrolledRepIds() == null || 
                    !journey.getEnrolledRepIds().contains(repId)) {
                    Map<String, Object> errorResponse = new HashMap<>();
                    errorResponse.put("success", false);
                    errorResponse.put("error", "Rep is not enrolled in this journey");
                    return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
                }
                
                return ResponseEntity.ok(journey);
            } else {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
        } catch (Exception e) {
            System.err.println("[RepController] Error in getJourneyById: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /api/rep/progress
     * Get progress for a rep across all journeys or a specific journey
     */
    @GetMapping("/progress")
    public ResponseEntity<?> getRepProgress(
            @RequestParam String repId,
            @RequestParam(required = false) String journeyId) {
        try {
            System.out.println("[RepController] getRepProgress called with repId: " + repId + ", journeyId: " + journeyId);
            
            List<RepProgress> progressList;
            
            if (journeyId != null && !journeyId.isEmpty()) {
                // Get progress for a specific journey
                progressList = repProgressRepository.findByRepIdAndJourneyId(repId, journeyId);
            } else {
                // Get progress for all journeys
                progressList = repProgressRepository.findByRepId(repId);
            }
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", progressList);
            response.put("count", progressList.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[RepController] Error in getRepProgress: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /api/rep/dashboard
     * Get rep dashboard with overall progress and statistics
     */
    @GetMapping("/dashboard")
    public ResponseEntity<?> getRepDashboard(@RequestParam String repId) {
        try {
            System.out.println("[RepController] getRepDashboard called with repId: " + repId);
            
            // Get all journeys for this rep
            List<TrainingJourneyEntity> journeys = journeyService.getJourneysForRep(repId);
            
            // Get all progress records for this rep
            List<RepProgress> allProgress = repProgressRepository.findByRepId(repId);
            
            // Calculate statistics
            int totalJourneys = journeys.size();
            int activeJourneys = (int) journeys.stream()
                .filter(j -> "active".equals(j.getStatus()))
                .count();
            
            int completedModules = 0;
            double totalProgress = 0.0;
            int progressCount = 0;
            
            for (RepProgress progress : allProgress) {
                if ("completed".equals(progress.getStatus()) || progress.getProgress() >= 100) {
                    completedModules++;
                }
                totalProgress += progress.getProgress();
                progressCount++;
            }
            
            double averageProgress = progressCount > 0 ? totalProgress / progressCount : 0.0;
            
            Map<String, Object> dashboard = new HashMap<>();
            dashboard.put("repId", repId);
            dashboard.put("totalJourneys", totalJourneys);
            dashboard.put("activeJourneys", activeJourneys);
            dashboard.put("completedModules", completedModules);
            dashboard.put("averageProgress", Math.round(averageProgress * 100.0) / 100.0);
            dashboard.put("totalProgressRecords", progressCount);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", dashboard);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[RepController] Error in getRepDashboard: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
}

