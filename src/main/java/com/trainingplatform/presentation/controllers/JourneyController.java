package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.TrainingJourneyService;
import com.trainingplatform.domain.entities.TrainingJourneyEntity;
import com.trainingplatform.domain.entities.GigEntity;
import com.trainingplatform.domain.repositories.GigRepository;
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

@RestController
@RequestMapping("/training_journeys")
public class JourneyController {
    
    @Autowired
    private TrainingJourneyService journeyService;
    
    @Autowired
    private GigRepository gigRepository;
    
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
    public ResponseEntity<Map<String, Object>> createJourney(@RequestBody Map<String, Object> journeyData) {
        try {
            System.out.println("[JourneyController] Create journey - journeyData keys: " + journeyData.keySet());
            System.out.println("[JourneyController] Create journey - title: " + journeyData.get("title"));
            System.out.println("[JourneyController] Create journey - industry: " + journeyData.get("industry"));
            
            TrainingJourneyEntity journey = convertToEntity(journeyData);
            
            // Ensure title and industry are set
            if (journeyData.containsKey("title") && journey.getTitle() == null) {
                journey.setTitle((String) journeyData.get("title"));
            }
            if (journeyData.containsKey("industry") && journey.getIndustry() == null) {
                Object industryObj = journeyData.get("industry");
                if (industryObj instanceof String) {
                    journey.setIndustry((String) industryObj);
                } else if (industryObj instanceof Map) {
                    Map<String, Object> industryMap = (Map<String, Object>) industryObj;
                    if (industryMap.containsKey("$oid")) {
                        journey.setIndustry((String) industryMap.get("$oid"));
                    } else if (industryMap.containsKey("_id")) {
                        Object idObj = industryMap.get("_id");
                        if (idObj instanceof String) {
                            journey.setIndustry((String) idObj);
                        } else if (idObj instanceof Map) {
                            Map<String, Object> idMap = (Map<String, Object>) idObj;
                            journey.setIndustry((String) idMap.get("$oid"));
                        }
                    }
                }
            }
            
            System.out.println("[JourneyController] After conversion - title: " + journey.getTitle());
            System.out.println("[JourneyController] After conversion - industry: " + journey.getIndustry());
            
            TrainingJourneyEntity savedJourney = journeyService.saveJourney(journey);
            
            System.out.println("[JourneyController] After save - title: " + savedJourney.getTitle());
            System.out.println("[JourneyController] After save - industry: " + savedJourney.getIndustry());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("journey", savedJourney);
            response.put("message", "Journey saved successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in createJourney: " + e.getMessage());
            e.printStackTrace();
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
            
            System.out.println("[JourneyController] Launch journey - journeyData keys: " + journeyData.keySet());
            System.out.println("[JourneyController] Launch journey - title: " + journeyData.get("title"));
            System.out.println("[JourneyController] Launch journey - industry: " + journeyData.get("industry"));
            
            // Convert journeyData to TrainingJourneyEntity
            TrainingJourneyEntity journey = convertToEntity(journeyData);
            
            // Ensure title and industry are set (they might be missing from the conversion)
            if (journeyData.containsKey("title") && journey.getTitle() == null) {
                journey.setTitle((String) journeyData.get("title"));
            }
            if (journeyData.containsKey("industry") && journey.getIndustry() == null) {
                Object industryObj = journeyData.get("industry");
                // Handle both String and ObjectId cases
                if (industryObj instanceof String) {
                    journey.setIndustry((String) industryObj);
                } else if (industryObj instanceof Map) {
                    // If it's an object with _id, extract the _id
                    Map<String, Object> industryMap = (Map<String, Object>) industryObj;
                    if (industryMap.containsKey("$oid")) {
                        journey.setIndustry((String) industryMap.get("$oid"));
                    } else if (industryMap.containsKey("_id")) {
                        Object idObj = industryMap.get("_id");
                        if (idObj instanceof String) {
                            journey.setIndustry((String) idObj);
                        } else if (idObj instanceof Map) {
                            Map<String, Object> idMap = (Map<String, Object>) idObj;
                            journey.setIndustry((String) idMap.get("$oid"));
                        }
                    }
                }
            }
            
            System.out.println("[JourneyController] After conversion - title: " + journey.getTitle());
            System.out.println("[JourneyController] After conversion - industry: " + journey.getIndustry());
            
            // Launch the journey
            TrainingJourneyEntity launchedJourney = journeyService.launchJourney(journey, enrolledRepIds);
            
            System.out.println("[JourneyController] After launch - title: " + launchedJourney.getTitle());
            System.out.println("[JourneyController] After launch - industry: " + launchedJourney.getIndustry());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("journey", launchedJourney);
            response.put("message", "Journey launched successfully!");
            response.put("enrolledCount", enrolledRepIds.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in launchJourney: " + e.getMessage());
            e.printStackTrace();
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
            
            // Populate gig titles
            List<Map<String, Object>> journeysWithGigTitles = journeys.stream().map(journey -> {
                Map<String, Object> journeyMap = objectMapper.convertValue(journey, Map.class);
                
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
                
                return journeyMap;
            }).collect(Collectors.toList());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", journeysWithGigTitles);
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
            
            // Populate gig titles
            List<Map<String, Object>> journeysWithGigTitles = journeys.stream().map(journey -> {
                Map<String, Object> journeyMap = objectMapper.convertValue(journey, Map.class);
                
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
                
                return journeyMap;
            }).collect(Collectors.toList());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", journeysWithGigTitles);
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

