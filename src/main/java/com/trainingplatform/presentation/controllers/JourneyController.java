package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.TrainingJourneyService;
import com.trainingplatform.domain.entities.TrainingJourneyEntity;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/training_journeys")
public class JourneyController {
    
    @Autowired
    private TrainingJourneyService journeyService;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    /**
     * GET /journeys
     * Get all training journeys
     */
    @GetMapping
    public ResponseEntity<List<TrainingJourneyEntity>> getAllJourneys() {
        List<TrainingJourneyEntity> journeys = journeyService.getAllJourneys();
        return ResponseEntity.ok(journeys);
    }
    
    /**
     * GET /journeys/{id}
     * Get a specific journey by ID
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getJourneyById(@PathVariable String id) {
        Optional<TrainingJourneyEntity> journey = journeyService.getJourneyById(id);
        if (journey.isPresent()) {
            return ResponseEntity.ok(journey.get());
        } else {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", "Journey not found");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
        }
    }
    
    /**
     * GET /journeys/status/{status}
     * Get journeys by status
     */
    @GetMapping("/status/{status}")
    public ResponseEntity<List<TrainingJourneyEntity>> getJourneysByStatus(@PathVariable String status) {
        List<TrainingJourneyEntity> journeys = journeyService.getJourneysByStatus(status);
        return ResponseEntity.ok(journeys);
    }
    
    /**
     * GET /journeys/industry/{industry}
     * Get journeys by industry
     */
    @GetMapping("/industry/{industry}")
    public ResponseEntity<List<TrainingJourneyEntity>> getJourneysByIndustry(@PathVariable String industry) {
        List<TrainingJourneyEntity> journeys = journeyService.getJourneysByIndustry(industry);
        return ResponseEntity.ok(journeys);
    }
    
    /**
     * GET /journeys/rep/{repId}
     * Get journeys for a specific rep
     */
    @GetMapping("/rep/{repId}")
    public ResponseEntity<List<TrainingJourneyEntity>> getJourneysForRep(@PathVariable String repId) {
        List<TrainingJourneyEntity> journeys = journeyService.getJourneysForRep(repId);
        return ResponseEntity.ok(journeys);
    }
    
    /**
     * POST /journeys
     * Create or update a training journey
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createJourney(@RequestBody TrainingJourneyEntity journey) {
        try {
            TrainingJourneyEntity savedJourney = journeyService.saveJourney(journey);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("journey", savedJourney);
            response.put("message", "Journey saved successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /journeys/launch
     * Launch a training journey with enrolled reps
     */
    @PostMapping("/launch")
    public ResponseEntity<Map<String, Object>> launchJourney(@RequestBody Map<String, Object> request) {
        try {
            // Extract journey data
            Map<String, Object> journeyData = (Map<String, Object>) request.get("journey");
            List<String> enrolledRepIds = (List<String>) request.get("enrolledRepIds");
            
            // Convert journeyData to TrainingJourneyEntity
            TrainingJourneyEntity journey = convertToEntity(journeyData);
            
            // Launch the journey
            TrainingJourneyEntity launchedJourney = journeyService.launchJourney(journey, enrolledRepIds);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("journey", launchedJourney);
            response.put("message", "Journey launched successfully!");
            response.put("enrolledCount", enrolledRepIds.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * PUT /journeys/{id}
     * Update an existing journey
     */
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateJourney(
        @PathVariable String id, 
        @RequestBody TrainingJourneyEntity journey
    ) {
        try {
            journey.setId(id);
            TrainingJourneyEntity updatedJourney = journeyService.saveJourney(journey);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("journey", updatedJourney);
            response.put("message", "Journey updated successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * DELETE /journeys/{id}
     * Delete a journey
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteJourney(@PathVariable String id) {
        try {
            journeyService.deleteJourney(id);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Journey deleted successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /journeys/{id}/archive
     * Archive a journey (soft delete)
     */
    @PostMapping("/{id}/archive")
    public ResponseEntity<Map<String, Object>> archiveJourney(@PathVariable String id) {
        try {
            TrainingJourneyEntity archivedJourney = journeyService.archiveJourney(id);
            
            if (archivedJourney != null) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("journey", archivedJourney);
                response.put("message", "Journey archived successfully");
                
                return ResponseEntity.ok(response);
            } else {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
        } catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /journeys/trainer/dashboard
     * Get trainer dashboard statistics by companyId and optionally gigId
     * NOTE: This must be before /trainer/{companyId} to avoid routing conflicts
     */
    @GetMapping("/trainer/dashboard")
    public ResponseEntity<?> getTrainerDashboard(
            @RequestParam String companyId,
            @RequestParam(required = false) String gigId) {
        try {
            System.out.println("[JourneyController] getTrainerDashboard called with companyId: " + companyId + ", gigId: " + gigId);
            
            com.trainingplatform.presentation.dtos.TrainerDashboardDTO dashboard = 
                journeyService.getTrainerDashboard(companyId, gigId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", dashboard);
            
            System.out.println("[JourneyController] Dashboard returned: totalTrainees=" + dashboard.getTotalTrainees());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in getTrainerDashboard: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_journeys/trainer/companyId/{companyId}/gigId/{gigId}
     * Get all journeys for a company filtered by gigId
     */
    @GetMapping("/trainer/companyId/{companyId}/gigId/{gigId}")
    public ResponseEntity<?> getJourneysByCompanyAndGig(
            @PathVariable String companyId,
            @PathVariable String gigId) {
        try {
            System.out.println("[JourneyController] getJourneysByCompanyAndGig called with companyId: " + companyId + ", gigId: " + gigId);
            
            List<TrainingJourneyEntity> journeys = journeyService.getJourneysByCompanyAndGig(companyId, gigId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", journeys);
            response.put("count", journeys.size());
            
            System.out.println("[JourneyController] Found " + journeys.size() + " journeys for companyId: " + companyId + ", gigId: " + gigId);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in getJourneysByCompanyAndGig: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_journeys/trainer/companyId/{companyId}
     * Get all journeys for a company
     */
    @GetMapping("/trainer/companyId/{companyId}")
    public ResponseEntity<?> getJourneysByCompany(@PathVariable String companyId) {
        try {
            System.out.println("[JourneyController] getJourneysByCompany called with companyId: " + companyId);
            
            List<TrainingJourneyEntity> journeys = journeyService.getJourneysByCompanyAndGig(companyId, null);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", journeys);
            response.put("count", journeys.size());
            
            System.out.println("[JourneyController] Found " + journeys.size() + " journeys for companyId: " + companyId);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in getJourneysByCompany: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    // Helper method to convert Map to TrainingJourneyEntity using Jackson
    private TrainingJourneyEntity convertToEntity(Map<String, Object> data) {
        try {
            // ✅ Utiliser Jackson pour une conversion complète de TOUS les champs
            return objectMapper.convertValue(data, TrainingJourneyEntity.class);
        } catch (Exception e) {
            // Fallback : conversion manuelle basique
            TrainingJourneyEntity entity = new TrainingJourneyEntity();
            
            if (data.containsKey("id")) {
                entity.setId((String) data.get("id"));
            }
            if (data.containsKey("title")) {
                entity.setTitle((String) data.get("title"));
            }
            if (data.containsKey("description")) {
                entity.setDescription((String) data.get("description"));
            }
            if (data.containsKey("industry")) {
                entity.setIndustry((String) data.get("industry"));
            }
            if (data.containsKey("status")) {
                entity.setStatus((String) data.get("status"));
            }
            if (data.containsKey("companyId")) {
                entity.setCompanyId((String) data.get("companyId"));
            }
            if (data.containsKey("gigId")) {
                entity.setGigId((String) data.get("gigId"));
            }
            
            System.err.println("⚠️ Conversion partielle - certains champs peuvent manquer: " + e.getMessage());
            return entity;
        }
    }
}

