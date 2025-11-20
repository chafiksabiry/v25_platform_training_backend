package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.TrainingJourneyService;
import com.trainingplatform.domain.entities.TrainingJourneyEntity;
import com.trainingplatform.domain.entities.GigEntity;
import com.trainingplatform.domain.entities.IndustryEntity;
import com.trainingplatform.domain.repositories.GigRepository;
import com.trainingplatform.domain.repositories.IndustryRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Controller for Trainer (Company) endpoints
 * All endpoints are prefixed with /api/trainer
 */
@RestController
@RequestMapping("/api/trainer")
@CrossOrigin(origins = "*")
public class TrainerController {
    
    @Autowired
    private TrainingJourneyService journeyService;
    
    @Autowired
    private GigRepository gigRepository;
    
    @Autowired
    private IndustryRepository industryRepository;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    // ModuleQuizService and ExamFinalQuizService not needed in TrainerController
    // Quizzes are embedded in modules within the journey
    
    /**
     * GET /api/trainer/dashboard
     * Get trainer dashboard statistics by companyId and optionally gigId
     */
    @GetMapping("/dashboard")
    public ResponseEntity<?> getTrainerDashboard(
            @RequestParam String companyId,
            @RequestParam(required = false) String gigId) {
        try {
            System.out.println("[TrainerController] getTrainerDashboard called with companyId: " + companyId + ", gigId: " + gigId);
            
            com.trainingplatform.presentation.dtos.TrainerDashboardDTO dashboard = 
                journeyService.getTrainerDashboard(companyId, gigId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", dashboard);
            
            System.out.println("[TrainerController] Dashboard returned: totalTrainees=" + dashboard.getTotalTrainees());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainerController] Error in getTrainerDashboard: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /api/trainer/journeys
     * Get all journeys for a company, optionally filtered by gigId
     */
    @GetMapping("/journeys")
    public ResponseEntity<?> getJourneysByCompany(
            @RequestParam String companyId,
            @RequestParam(required = false) String gigId) {
        try {
            System.out.println("[TrainerController] getJourneysByCompany called with companyId: " + companyId + ", gigId: " + gigId);
            
            List<TrainingJourneyEntity> journeys = journeyService.getJourneysByCompanyAndGig(companyId, gigId);
            
            // Populate gig titles and industry titles
            List<Map<String, Object>> journeysWithPopulated = journeys.stream().map(journey -> {
                Map<String, Object> journeyMap = objectMapper.convertValue(journey, Map.class);
                
                // Populate gig title
                if (journey.getGigId() != null && !journey.getGigId().isEmpty()) {
                    Optional<GigEntity> gigOpt = gigRepository.findById(journey.getGigId());
                    if (gigOpt.isPresent()) {
                        journeyMap.put("gigTitle", gigOpt.get().getTitle());
                    } else {
                        journeyMap.put("gigTitle", null);
                    }
                } else {
                    journeyMap.put("gigTitle", null);
                }
                
                // Populate industry title
                if (journey.getIndustry() != null && !journey.getIndustry().isEmpty()) {
                    Optional<IndustryEntity> industryOpt = industryRepository.findById(journey.getIndustry());
                    if (industryOpt.isPresent()) {
                        journeyMap.put("industryTitle", industryOpt.get().getName());
                    } else {
                        journeyMap.put("industryTitle", null);
                    }
                } else {
                    journeyMap.put("industryTitle", null);
                }
                
                return journeyMap;
            }).collect(Collectors.toList());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", journeysWithPopulated);
            response.put("count", journeysWithPopulated.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainerController] Error in getJourneysByCompany: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /api/trainer/journeys/{id}
     * Get a specific journey by ID (only if it belongs to the company)
     */
    @GetMapping("/journeys/{id}")
    public ResponseEntity<?> getJourneyById(
            @PathVariable String id,
            @RequestParam String companyId) {
        try {
            Optional<TrainingJourneyEntity> journeyOpt = journeyService.getJourneyById(id);
            
            if (journeyOpt.isPresent()) {
                TrainingJourneyEntity journey = journeyOpt.get();
                
                // Verify that the journey belongs to the company
                if (!journey.getCompanyId().equals(companyId)) {
                    Map<String, Object> errorResponse = new HashMap<>();
                    errorResponse.put("success", false);
                    errorResponse.put("error", "Journey does not belong to this company");
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
            System.err.println("[TrainerController] Error in getJourneyById: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /api/trainer/journeys
     * Create a new training journey
     */
    @PostMapping("/journeys")
    public ResponseEntity<Map<String, Object>> createJourney(
            @RequestBody Map<String, Object> journeyData,
            @RequestParam String companyId) {
        try {
            System.out.println("[TrainerController] Create journey - journeyData keys: " + journeyData.keySet());
            
            // Ensure companyId is set
            journeyData.put("companyId", companyId);
            
            TrainingJourneyEntity journey = convertToEntity(journeyData);
            
            // Ensure title and industry are set
            if (journeyData.containsKey("title") && journey.getTitle() == null) {
                journey.setTitle((String) journeyData.get("title"));
            }
            if (journeyData.containsKey("industry") && journey.getIndustry() == null) {
                journey.setIndustry((String) journeyData.get("industry"));
            }
            
            TrainingJourneyEntity savedJourney = journeyService.saveJourney(journey);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", savedJourney);
            response.put("message", "Journey created successfully");
            
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            System.err.println("[TrainerController] Error creating journey: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * PUT /api/trainer/journeys/{id}
     * Update an existing training journey
     */
    @PutMapping("/journeys/{id}")
    public ResponseEntity<Map<String, Object>> updateJourney(
            @PathVariable String id,
            @RequestBody Map<String, Object> journeyData,
            @RequestParam String companyId) {
        try {
            Optional<TrainingJourneyEntity> existingJourneyOpt = journeyService.getJourneyById(id);
            
            if (!existingJourneyOpt.isPresent()) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
            
            TrainingJourneyEntity existingJourney = existingJourneyOpt.get();
            
            // Verify that the journey belongs to the company
            if (!existingJourney.getCompanyId().equals(companyId)) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey does not belong to this company");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
            }
            
            // Ensure companyId is set
            journeyData.put("companyId", companyId);
            journeyData.put("id", id);
            
            TrainingJourneyEntity journey = convertToEntity(journeyData);
            journey.setId(id); // Set the ID for update
            TrainingJourneyEntity updatedJourney = journeyService.saveJourney(journey);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", updatedJourney);
            response.put("message", "Journey updated successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainerController] Error updating journey: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * DELETE /api/trainer/journeys/{id}
     * Delete a training journey
     */
    @DeleteMapping("/journeys/{id}")
    public ResponseEntity<Map<String, Object>> deleteJourney(
            @PathVariable String id,
            @RequestParam String companyId) {
        try {
            Optional<TrainingJourneyEntity> journeyOpt = journeyService.getJourneyById(id);
            
            if (!journeyOpt.isPresent()) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
            
            TrainingJourneyEntity journey = journeyOpt.get();
            
            // Verify that the journey belongs to the company
            if (!journey.getCompanyId().equals(companyId)) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey does not belong to this company");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
            }
            
            journeyService.deleteJourney(id);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Journey deleted successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainerController] Error deleting journey: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /api/trainer/journeys/{id}/launch
     * Launch a training journey with enrolled reps
     */
    @PostMapping("/journeys/{id}/launch")
    public ResponseEntity<Map<String, Object>> launchJourney(
            @PathVariable String id,
            @RequestBody Map<String, Object> launchData,
            @RequestParam String companyId) {
        try {
            Optional<TrainingJourneyEntity> journeyOpt = journeyService.getJourneyById(id);
            
            if (!journeyOpt.isPresent()) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
            
            TrainingJourneyEntity journey = journeyOpt.get();
            
            // Verify that the journey belongs to the company
            if (!journey.getCompanyId().equals(companyId)) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey does not belong to this company");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
            }
            
            @SuppressWarnings("unchecked")
            List<String> enrolledRepIds = (List<String>) launchData.get("enrolledRepIds");
            
            if (enrolledRepIds == null || enrolledRepIds.isEmpty()) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "No enrolled reps provided");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorResponse);
            }
            
            TrainingJourneyEntity launchedJourney = journeyService.launchJourney(journey, enrolledRepIds);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", launchedJourney);
            response.put("message", "Journey launched successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[TrainerController] Error launching journey: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    // Helper method to convert Map to TrainingJourneyEntity
    private TrainingJourneyEntity convertToEntity(Map<String, Object> journeyData) {
        return objectMapper.convertValue(journeyData, TrainingJourneyEntity.class);
    }
}

