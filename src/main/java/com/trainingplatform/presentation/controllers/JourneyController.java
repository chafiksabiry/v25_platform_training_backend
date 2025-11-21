package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.TrainingJourneyService;
import com.trainingplatform.application.services.ModuleQuizService;
import com.trainingplatform.application.services.ExamFinalQuizService;
import com.trainingplatform.core.entities.ModuleQuiz;
import com.trainingplatform.core.entities.ExamFinalQuiz;
import com.trainingplatform.domain.entities.TrainingJourneyEntity;
import com.trainingplatform.domain.entities.GigEntity;
import com.trainingplatform.domain.entities.IndustryEntity;
import com.trainingplatform.domain.repositories.GigRepository;
import com.trainingplatform.domain.repositories.IndustryRepository;
import com.trainingplatform.infrastructure.repositories.RepProgressRepository;
import com.trainingplatform.core.entities.RepProgress;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/training_journeys")
@CrossOrigin(origins = "*")
public class JourneyController {
    
    @Autowired
    private TrainingJourneyService journeyService;
    
    @Autowired
    private GigRepository gigRepository;
    
    @Autowired
    private IndustryRepository industryRepository;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    @Autowired
    private ModuleQuizService moduleQuizService;
    
    @Autowired
    private ExamFinalQuizService examFinalQuizService;
    
    @Autowired
    private RepProgressRepository repProgressRepository;
    
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
     * GET /journeys/trainee/available
     * Get all available training journeys for trainees (active and completed only)
     * This endpoint returns all journeys that trainees can see, regardless of enrollment
     */
    @GetMapping("/trainee/available")
    public ResponseEntity<?> getAllAvailableJourneysForTrainees() {
        try {
            List<TrainingJourneyEntity> journeys = journeyService.getAllAvailableJourneysForTrainees();
            
            // Populate gig titles if available
            List<Map<String, Object>> journeysWithPopulated = journeys.stream().map(journey -> {
                Map<String, Object> journeyMap = new HashMap<>();
                try {
                    journeyMap = objectMapper.convertValue(journey, Map.class);
                    
                    // Populate gig title if gigId exists
                    if (journey.getGigId() != null && !journey.getGigId().isEmpty()) {
                        Optional<GigEntity> gigOpt = gigRepository.findById(journey.getGigId());
                        if (gigOpt.isPresent()) {
                            journeyMap.put("gigTitle", gigOpt.get().getTitle());
                        }
                    }
                    
                    // Populate industry title if industry exists
                    if (journey.getIndustry() != null && !journey.getIndustry().isEmpty()) {
                        Optional<IndustryEntity> industryOpt = industryRepository.findById(journey.getIndustry());
                        if (industryOpt.isPresent()) {
                            journeyMap.put("industryTitle", industryOpt.get().getName());
                        }
                    }
                } catch (Exception e) {
                    System.err.println("[JourneyController] Error populating journey data: " + e.getMessage());
                }
                
                return journeyMap;
            }).collect(Collectors.toList());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", journeysWithPopulated);
            response.put("count", journeys.size());
            
            System.out.println("[JourneyController] Found " + journeys.size() + " available journeys for trainees");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in getAllAvailableJourneysForTrainees: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_journeys/rep-progress?repId={repId}&journeyId={journeyId}
     * Get progress for a specific rep and journey
     */
    @GetMapping("/rep-progress")
    public ResponseEntity<?> getRepProgress(
            @RequestParam String repId,
            @RequestParam(required = false) String journeyId) {
        try {
            System.out.println("[JourneyController] getRepProgress called with repId: " + repId + ", journeyId: " + journeyId);
            
            List<RepProgress> progressList;
            if (journeyId != null && !journeyId.isEmpty()) {
                progressList = repProgressRepository.findByRepIdAndJourneyId(repId, journeyId);
            } else {
                progressList = repProgressRepository.findByRepId(repId);
            }
            
            System.out.println("[JourneyController] Found " + progressList.size() + " progress records");
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", progressList);
            response.put("count", progressList.size());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in getRepProgress: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_journeys/rep/{repId}/progress/overview
     * Get overall progress overview for a rep (all trainings)
     */
    @GetMapping("/rep/{repId}/progress/overview")
    public ResponseEntity<?> getRepProgressOverview(@PathVariable String repId) {
        try {
            System.out.println("[JourneyController] getRepProgressOverview called with repId: " + repId);
            
            // Get all progress records for this rep
            List<RepProgress> allProgress = repProgressRepository.findByRepId(repId);
            
            // Get all journeys this rep is enrolled in
            List<TrainingJourneyEntity> journeys = journeyService.getJourneysForRep(repId);
            
            // Calculate overall statistics
            int totalTrainings = journeys.size();
            int completedTrainings = 0;
            int inProgressTrainings = 0;
            int notStartedTrainings = 0;
            double overallProgress = 0.0;
            double overallEngagement = 0.0;
            int totalTimeSpent = 0;
            
            Map<String, Object> trainingsProgress = new HashMap<>();
            
            for (TrainingJourneyEntity journey : journeys) {
                List<RepProgress> journeyProgress = repProgressRepository.findByRepIdAndJourneyId(repId, journey.getId());
                
                if (journeyProgress.isEmpty()) {
                    notStartedTrainings++;
                    trainingsProgress.put(journey.getId(), Map.of(
                        "journeyId", journey.getId(),
                        "journeyTitle", journey.getTitle() != null ? journey.getTitle() : "Untitled",
                        "status", "not-started",
                        "progress", 0,
                        "engagementScore", 0,
                        "timeSpent", 0
                    ));
                } else {
                    // Calculate average progress for this journey
                    double journeyProgressAvg = journeyProgress.stream()
                        .mapToInt(RepProgress::getProgress)
                        .average()
                        .orElse(0.0);
                    
                    double journeyEngagementAvg = journeyProgress.stream()
                        .mapToInt(RepProgress::getEngagementScore)
                        .average()
                        .orElse(0.0);
                    
                    int journeyTimeSpent = journeyProgress.stream()
                        .mapToInt(RepProgress::getTimeSpent)
                        .sum();
                    
                    String status = journeyProgress.stream()
                        .anyMatch(p -> "completed".equals(p.getStatus()) || p.getProgress() >= 100)
                        ? "completed"
                        : journeyProgress.stream().anyMatch(p -> "in-progress".equals(p.getStatus()))
                        ? "in-progress"
                        : "not-started";
                    
                    if ("completed".equals(status)) {
                        completedTrainings++;
                    } else if ("in-progress".equals(status)) {
                        inProgressTrainings++;
                    } else {
                        notStartedTrainings++;
                    }
                    
                    overallProgress += journeyProgressAvg;
                    overallEngagement += journeyEngagementAvg;
                    totalTimeSpent += journeyTimeSpent;
                    
                    trainingsProgress.put(journey.getId(), Map.of(
                        "journeyId", journey.getId(),
                        "journeyTitle", journey.getTitle() != null ? journey.getTitle() : "Untitled",
                        "status", status,
                        "progress", Math.round(journeyProgressAvg),
                        "engagementScore", Math.round(journeyEngagementAvg),
                        "timeSpent", journeyTimeSpent
                    ));
                }
            }
            
            if (totalTrainings > 0) {
                overallProgress = overallProgress / totalTrainings;
                overallEngagement = overallEngagement / totalTrainings;
            }
            
            Map<String, Object> overview = new HashMap<>();
            overview.put("repId", repId);
            overview.put("totalTrainings", totalTrainings);
            overview.put("completedTrainings", completedTrainings);
            overview.put("inProgressTrainings", inProgressTrainings);
            overview.put("notStartedTrainings", notStartedTrainings);
            overview.put("overallProgress", Math.round(overallProgress));
            overview.put("overallEngagement", Math.round(overallEngagement));
            overview.put("totalTimeSpent", totalTimeSpent);
            overview.put("trainingsProgress", trainingsProgress);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", overview);
            
            System.out.println("[JourneyController] Progress overview: " + completedTrainings + "/" + totalTrainings + " completed");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in getRepProgressOverview: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_journeys/rep/{repId}/progress/gig/{gigId}
     * Get progress for a rep filtered by gigId
     */
    @GetMapping("/rep/{repId}/progress/gig/{gigId}")
    public ResponseEntity<?> getRepProgressByGig(
            @PathVariable String repId,
            @PathVariable String gigId) {
        try {
            System.out.println("[JourneyController] getRepProgressByGig called with repId: " + repId + ", gigId: " + gigId);
            
            // Get all journeys for this gig
            List<TrainingJourneyEntity> journeys = journeyService.getJourneysByGigId(gigId);
            
            // Get progress for all journeys
            Map<String, Object> gigProgress = new HashMap<>();
            int totalTrainings = journeys.size();
            int completedTrainings = 0;
            int inProgressTrainings = 0;
            int notStartedTrainings = 0;
            double overallProgress = 0.0;
            int totalTimeSpent = 0;
            
            List<Map<String, Object>> trainingsProgressList = new ArrayList<>();
            
            for (TrainingJourneyEntity journey : journeys) {
                List<RepProgress> journeyProgress = repProgressRepository.findByRepIdAndJourneyId(repId, journey.getId());
                
                Map<String, Object> trainingProgress = new HashMap<>();
                trainingProgress.put("journeyId", journey.getId());
                trainingProgress.put("journeyTitle", journey.getTitle() != null ? journey.getTitle() : "Untitled");
                trainingProgress.put("description", journey.getDescription());
                
                if (journeyProgress.isEmpty()) {
                    notStartedTrainings++;
                    trainingProgress.put("status", "not-started");
                    trainingProgress.put("progress", 0);
                    trainingProgress.put("timeSpent", 0);
                } else {
                    double journeyProgressAvg = journeyProgress.stream()
                        .mapToInt(RepProgress::getProgress)
                        .average()
                        .orElse(0.0);
                    
                    int journeyTimeSpent = journeyProgress.stream()
                        .mapToInt(RepProgress::getTimeSpent)
                        .sum();
                    
                    String status = journeyProgress.stream()
                        .anyMatch(p -> "completed".equals(p.getStatus()) || p.getProgress() >= 100)
                        ? "completed"
                        : journeyProgress.stream().anyMatch(p -> "in-progress".equals(p.getStatus()))
                        ? "in-progress"
                        : "not-started";
                    
                    if ("completed".equals(status)) {
                        completedTrainings++;
                    } else if ("in-progress".equals(status)) {
                        inProgressTrainings++;
                    } else {
                        notStartedTrainings++;
                    }
                    
                    overallProgress += journeyProgressAvg;
                    totalTimeSpent += journeyTimeSpent;
                    
                    trainingProgress.put("status", status);
                    trainingProgress.put("progress", Math.round(journeyProgressAvg));
                    trainingProgress.put("timeSpent", journeyTimeSpent);
                    trainingProgress.put("modulesProgress", journeyProgress.stream().map(p -> Map.of(
                        "moduleId", p.getModuleId() != null ? p.getModuleId() : "",
                        "progress", p.getProgress(),
                        "status", p.getStatus(),
                        "timeSpent", p.getTimeSpent()
                    )).collect(Collectors.toList()));
                }
                
                trainingsProgressList.add(trainingProgress);
            }
            
            if (totalTrainings > 0) {
                overallProgress = overallProgress / totalTrainings;
            }
            
            gigProgress.put("repId", repId);
            gigProgress.put("gigId", gigId);
            gigProgress.put("totalTrainings", totalTrainings);
            gigProgress.put("completedTrainings", completedTrainings);
            gigProgress.put("inProgressTrainings", inProgressTrainings);
            gigProgress.put("notStartedTrainings", notStartedTrainings);
            gigProgress.put("overallProgress", Math.round(overallProgress));
            gigProgress.put("totalTimeSpent", totalTimeSpent);
            gigProgress.put("trainings", trainingsProgressList);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", gigProgress);
            
            System.out.println("[JourneyController] Gig progress: " + completedTrainings + "/" + totalTrainings + " completed");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in getRepProgressByGig: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
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
            
            // Check if journey has an ID (for update) or needs to be created
            String journeyId = null;
            if (journeyData.containsKey("id")) {
                journeyId = (String) journeyData.get("id");
            } else if (journeyData.containsKey("_id")) {
                Object idObj = journeyData.get("_id");
                if (idObj instanceof String) {
                    journeyId = (String) idObj;
                }
            }
            
            TrainingJourneyEntity journey;
            boolean isUpdate = false;
            
            if (journeyId != null && !journeyId.isEmpty()) {
                // Try to get existing journey
                Optional<TrainingJourneyEntity> existingJourneyOpt = journeyService.getJourneyById(journeyId);
                if (existingJourneyOpt.isPresent()) {
                    journey = existingJourneyOpt.get();
                    isUpdate = true;
                    System.out.println("[JourneyController] Updating existing journey for launch: " + journeyId);
                    
                    // Update fields from request
                    if (journeyData.containsKey("title")) {
                        journey.setTitle((String) journeyData.get("title"));
                    }
                    if (journeyData.containsKey("description")) {
                        journey.setDescription((String) journeyData.get("description"));
                    }
                    if (journeyData.containsKey("modules")) {
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> modulesData = (List<Map<String, Object>>) journeyData.get("modules");
                        List<TrainingJourneyEntity.TrainingModuleEntity> modules = convertModules(modulesData);
                        journey.setModules(modules);
                    }
                    if (journeyData.containsKey("finalExam")) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> finalExamData = (Map<String, Object>) journeyData.get("finalExam");
                        TrainingJourneyEntity.FinalExamEntity finalExam = convertFinalExam(finalExamData);
                        journey.setFinalExam(finalExam);
                    }
                    if (journeyData.containsKey("launchSettings")) {
                        // Update launch settings if needed
                    }
                    if (journeyData.containsKey("rehearsalData")) {
                        // Update rehearsal data if needed
                    }
                } else {
                    // Journey not found, create new one
                    journey = convertToEntity(journeyData);
                    System.out.println("[JourneyController] Journey ID provided but not found, creating new journey");
                }
            } else {
                // No ID provided, create new journey
                journey = convertToEntity(journeyData);
                System.out.println("[JourneyController] No journey ID provided, creating new journey");
            }
            
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
            System.out.println("[JourneyController] Is update: " + isUpdate);
            
            // Launch the journey
            TrainingJourneyEntity launchedJourney = journeyService.launchJourney(journey, enrolledRepIds);
            
            System.out.println("[JourneyController] After launch - title: " + launchedJourney.getTitle());
            System.out.println("[JourneyController] After launch - industry: " + launchedJourney.getIndustry());
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("journey", launchedJourney);
            response.put("message", isUpdate ? "Journey updated and launched successfully!" : "Journey launched successfully!");
            response.put("enrolledCount", enrolledRepIds != null ? enrolledRepIds.size() : 0);
            
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
     * POST /training_journeys/rep-progress/start
     * Initialize progress when a rep starts a training journey
     */
    @PostMapping("/rep-progress/start")
    public ResponseEntity<?> startTrainingProgress(@RequestBody Map<String, Object> requestData) {
        try {
            System.out.println("[JourneyController] startTrainingProgress called with data: " + requestData);
            
            String repId = (String) requestData.get("repId");
            String journeyId = (String) requestData.get("journeyId");
            
            if (repId == null || journeyId == null) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "repId and journeyId are required");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorResponse);
            }
            
            // Get the journey to find all modules
            Optional<TrainingJourneyEntity> journeyOpt = journeyService.getJourneyById(journeyId);
            if (!journeyOpt.isPresent()) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
            
            TrainingJourneyEntity journey = journeyOpt.get();
            List<TrainingJourneyEntity.TrainingModuleEntity> modules = journey.getModules();
            
            if (modules == null || modules.isEmpty()) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey has no modules");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorResponse);
            }
            
            // Create initial progress records for all modules
            List<RepProgress> createdProgress = new ArrayList<>();
            for (TrainingJourneyEntity.TrainingModuleEntity module : modules) {
                // TrainingModuleEntity uses _id, not id
                String moduleId = module.get_id();
                
                if (moduleId == null || moduleId.isEmpty()) {
                    System.out.println("[JourneyController] Warning: Module has no _id, skipping. Module title: " + module.getTitle());
                    continue;
                }
                
                // Check if progress already exists
                Optional<RepProgress> existingProgress = repProgressRepository.findByRepIdAndJourneyIdAndModuleId(repId, journeyId, moduleId);
                
                if (!existingProgress.isPresent()) {
                    // Create new progress record
                    RepProgress progress = new RepProgress(repId, journeyId, moduleId);
                    progress.setStatus("not-started");
                    progress.setProgress(0);
                    progress.setTimeSpent(0);
                    progress.setEngagementScore(0);
                    
                    RepProgress savedProgress = repProgressRepository.save(progress);
                    createdProgress.add(savedProgress);
                    System.out.println("[JourneyController] Created progress for module: " + moduleId);
                } else {
                    // Update existing progress to "in-progress" if it's still "not-started"
                    RepProgress existing = existingProgress.get();
                    if ("not-started".equals(existing.getStatus())) {
                        existing.setStatus("in-progress");
                        existing.setLastAccessed(java.time.LocalDateTime.now());
                        repProgressRepository.save(existing);
                        createdProgress.add(existing);
                        System.out.println("[JourneyController] Updated progress to in-progress for module: " + moduleId);
                    } else {
                        createdProgress.add(existing);
                        System.out.println("[JourneyController] Progress already exists for module: " + moduleId);
                    }
                }
            }
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Training progress initialized");
            response.put("data", createdProgress);
            response.put("count", createdProgress.size());
            
            System.out.println("[JourneyController] Initialized " + createdProgress.size() + " progress records for repId: " + repId + ", journeyId: " + journeyId);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in startTrainingProgress: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /training_journeys/rep-progress/update
     * Update or create progress for a rep
     */
    @PostMapping("/rep-progress/update")
    public ResponseEntity<?> updateRepProgress(@RequestBody Map<String, Object> progressData) {
        try {
            System.out.println("[JourneyController] updateRepProgress called with data: " + progressData);
            
            String repId = (String) progressData.get("repId");
            String journeyId = (String) progressData.get("journeyId");
            String moduleId = (String) progressData.get("moduleId");
            
            if (repId == null || journeyId == null || moduleId == null) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "repId, journeyId, and moduleId are required");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorResponse);
            }
            
            // Get or create progress record
            Optional<RepProgress> existingProgress = repProgressRepository.findByRepIdAndJourneyIdAndModuleId(repId, journeyId, moduleId);
            RepProgress progress;
            
            if (existingProgress.isPresent()) {
                progress = existingProgress.get();
            } else {
                progress = new RepProgress(repId, journeyId, moduleId);
            }
            
            // Update progress fields
            if (progressData.containsKey("progress")) {
                Object progressValue = progressData.get("progress");
                if (progressValue instanceof Number) {
                    progress.setProgress(((Number) progressValue).intValue());
                }
            }
            
            if (progressData.containsKey("status")) {
                progress.setStatus((String) progressData.get("status"));
            }
            
            if (progressData.containsKey("score")) {
                Object scoreValue = progressData.get("score");
                if (scoreValue instanceof Number) {
                    progress.setScore(((Number) scoreValue).intValue());
                }
            }
            
            if (progressData.containsKey("timeSpent")) {
                Object timeSpentValue = progressData.get("timeSpent");
                if (timeSpentValue instanceof Number) {
                    progress.setTimeSpent(((Number) timeSpentValue).intValue());
                }
            }
            
            if (progressData.containsKey("engagementScore")) {
                Object engagementValue = progressData.get("engagementScore");
                if (engagementValue instanceof Number) {
                    progress.setEngagementScore(((Number) engagementValue).intValue());
                }
            }
            
            // Update last accessed
            progress.setLastAccessed(java.time.LocalDateTime.now());
            
            // Save progress
            RepProgress savedProgress = repProgressRepository.save(progress);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", savedProgress);
            response.put("message", "Progress updated successfully");
            
            System.out.println("[JourneyController] Progress updated for repId: " + repId + ", journeyId: " + journeyId + ", moduleId: " + moduleId);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in updateRepProgress: " + e.getMessage());
            e.printStackTrace();
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
     * GET /training_journeys/gig/{gigId}
     * Get all training journeys for a specific gig
     * NOTE: This must be placed before /trainer/companyId/{companyId} to avoid routing conflicts
     */
    @GetMapping("/gig/{gigId}")
    public ResponseEntity<?> getTrainingsByGig(@PathVariable String gigId) {
        try {
            System.out.println("[JourneyController] getTrainingsByGig called with gigId: " + gigId);
            
            List<TrainingJourneyEntity> journeys = journeyService.getJourneysByGigId(gigId);
            
            // Populate gig title and industry title
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
            response.put("count", journeys.size());
            
            System.out.println("[JourneyController] Found " + journeys.size() + " trainings for gigId: " + gigId);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error in getTrainingsByGig: " + e.getMessage());
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
            TrainingJourneyEntity entity = objectMapper.convertValue(data, TrainingJourneyEntity.class);
            
            // Explicitly handle embedded modules and finalExam
            if (data.containsKey("modules")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> modulesData = (List<Map<String, Object>>) data.get("modules");
                List<TrainingJourneyEntity.TrainingModuleEntity> modules = convertModules(modulesData);
                entity.setModules(modules);
                System.out.println("[JourneyController] Set modules: " + modules.size() + " modules");
            }
            if (data.containsKey("finalExam")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> finalExamData = (Map<String, Object>) data.get("finalExam");
                TrainingJourneyEntity.FinalExamEntity finalExam = convertFinalExam(finalExamData);
                entity.setFinalExam(finalExam);
                System.out.println("[JourneyController] Set finalExam");
            }
            
            return entity;
        } catch (Exception e) {
            System.err.println("[JourneyController] Error converting with ObjectMapper, using fallback: " + e.getMessage());
            e.printStackTrace();
            // Fallback : conversion manuelle basique
            TrainingJourneyEntity entity = new TrainingJourneyEntity();
            
            if (data.containsKey("id")) {
                Object idObj = data.get("id");
                if (idObj instanceof Map) {
                    Map<String, Object> idMap = (Map<String, Object>) idObj;
                    if (idMap.containsKey("$oid")) {
                        entity.setId((String) idMap.get("$oid"));
                    }
                } else {
                    entity.setId(idObj != null ? idObj.toString() : null);
                }
            }
            if (data.containsKey("title")) {
                entity.setTitle(data.get("title") != null ? data.get("title").toString() : null);
            }
            if (data.containsKey("description")) {
                entity.setDescription(data.get("description") != null ? data.get("description").toString() : null);
            }
            if (data.containsKey("industry")) {
                Object industryObj = data.get("industry");
                if (industryObj instanceof Map) {
                    Map<String, Object> industryMap = (Map<String, Object>) industryObj;
                    if (industryMap.containsKey("$oid")) {
                        entity.setIndustry((String) industryMap.get("$oid"));
                    }
                } else {
                    entity.setIndustry(industryObj != null ? industryObj.toString() : null);
                }
            }
            if (data.containsKey("status")) {
                entity.setStatus(data.get("status") != null ? data.get("status").toString() : null);
            }
            if (data.containsKey("companyId")) {
                Object companyIdObj = data.get("companyId");
                if (companyIdObj instanceof Map) {
                    Map<String, Object> companyIdMap = (Map<String, Object>) companyIdObj;
                    if (companyIdMap.containsKey("$oid")) {
                        entity.setCompanyId((String) companyIdMap.get("$oid"));
                    }
                } else {
                    entity.setCompanyId(companyIdObj != null ? companyIdObj.toString() : null);
                }
            }
            if (data.containsKey("gigId")) {
                Object gigIdObj = data.get("gigId");
                if (gigIdObj instanceof Map) {
                    Map<String, Object> gigIdMap = (Map<String, Object>) gigIdObj;
                    if (gigIdMap.containsKey("$oid")) {
                        entity.setGigId((String) gigIdMap.get("$oid"));
                    }
                } else {
                    entity.setGigId(gigIdObj != null ? gigIdObj.toString() : null);
                }
            }
            if (data.containsKey("modules")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> modulesData = (List<Map<String, Object>>) data.get("modules");
                List<TrainingJourneyEntity.TrainingModuleEntity> modules = convertModules(modulesData);
                entity.setModules(modules);
            }
            if (data.containsKey("finalExam")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> finalExamData = (Map<String, Object>) data.get("finalExam");
                TrainingJourneyEntity.FinalExamEntity finalExam = convertFinalExam(finalExamData);
                entity.setFinalExam(finalExam);
            }
            
            System.err.println("⚠️ Conversion partielle - certains champs peuvent manquer");
            return entity;
        }
    }
    
    // Helper method to convert modules list
    private List<TrainingJourneyEntity.TrainingModuleEntity> convertModules(List<Map<String, Object>> modulesData) {
        List<TrainingJourneyEntity.TrainingModuleEntity> modules = new java.util.ArrayList<>();
        if (modulesData == null) return modules;
        
        for (Map<String, Object> moduleData : modulesData) {
            TrainingJourneyEntity.TrainingModuleEntity module = new TrainingJourneyEntity.TrainingModuleEntity();
            
            // Extract _id if present (Extended JSON format)
            if (moduleData.containsKey("_id")) {
                Object idObj = moduleData.get("_id");
                if (idObj instanceof Map) {
                    Map<String, Object> idMap = (Map<String, Object>) idObj;
                    if (idMap.containsKey("$oid")) {
                        module.set_id((String) idMap.get("$oid"));
                    }
                } else {
                    module.set_id(idObj != null ? idObj.toString() : null);
                }
            }
            
            if (moduleData.containsKey("title")) {
                module.setTitle(moduleData.get("title") != null ? moduleData.get("title").toString() : null);
            }
            if (moduleData.containsKey("description")) {
                module.setDescription(moduleData.get("description") != null ? moduleData.get("description").toString() : null);
            }
            if (moduleData.containsKey("duration")) {
                Object durationObj = moduleData.get("duration");
                if (durationObj instanceof Number) {
                    module.setDuration(((Number) durationObj).intValue());
                }
            }
            if (moduleData.containsKey("difficulty")) {
                module.setDifficulty(moduleData.get("difficulty") != null ? moduleData.get("difficulty").toString() : null);
            }
            if (moduleData.containsKey("learningObjectives")) {
                @SuppressWarnings("unchecked")
                List<String> objectives = (List<String>) moduleData.get("learningObjectives");
                module.setLearningObjectives(objectives != null ? objectives : new java.util.ArrayList<>());
            }
            if (moduleData.containsKey("prerequisites")) {
                @SuppressWarnings("unchecked")
                List<String> prereqs = (List<String>) moduleData.get("prerequisites");
                module.setPrerequisites(prereqs != null ? prereqs : new java.util.ArrayList<>());
            }
            if (moduleData.containsKey("topics")) {
                @SuppressWarnings("unchecked")
                List<String> topics = (List<String>) moduleData.get("topics");
                module.setTopics(topics != null ? topics : new java.util.ArrayList<>());
            }
            if (moduleData.containsKey("order")) {
                Object orderObj = moduleData.get("order");
                if (orderObj instanceof Number) {
                    module.setOrder(((Number) orderObj).intValue());
                }
            }
            
            // Convert sections
            if (moduleData.containsKey("sections")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> sectionsData = (List<Map<String, Object>>) moduleData.get("sections");
                List<TrainingJourneyEntity.SectionEntity> sections = convertSections(sectionsData);
                module.setSections(sections);
            }
            
            // Convert quizzes
            if (moduleData.containsKey("quizzes")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> quizzesData = (List<Map<String, Object>>) moduleData.get("quizzes");
                List<TrainingJourneyEntity.QuizEntity> quizzes = convertQuizzes(quizzesData);
                module.setQuizzes(quizzes);
            }
            
            modules.add(module);
        }
        
        return modules;
    }
    
    // Helper method to convert sections list
    private List<TrainingJourneyEntity.SectionEntity> convertSections(List<Map<String, Object>> sectionsData) {
        List<TrainingJourneyEntity.SectionEntity> sections = new java.util.ArrayList<>();
        if (sectionsData == null) return sections;
        
        for (Map<String, Object> sectionData : sectionsData) {
            TrainingJourneyEntity.SectionEntity section = new TrainingJourneyEntity.SectionEntity();
            
            // Extract _id if present
            if (sectionData.containsKey("_id")) {
                Object idObj = sectionData.get("_id");
                if (idObj instanceof Map) {
                    Map<String, Object> idMap = (Map<String, Object>) idObj;
                    if (idMap.containsKey("$oid")) {
                        section.set_id((String) idMap.get("$oid"));
                    }
                } else {
                    section.set_id(idObj != null ? idObj.toString() : null);
                }
            }
            
            if (sectionData.containsKey("title")) {
                section.setTitle(sectionData.get("title") != null ? sectionData.get("title").toString() : null);
            }
            if (sectionData.containsKey("type")) {
                section.setType(sectionData.get("type") != null ? sectionData.get("type").toString() : null);
            }
            if (sectionData.containsKey("order")) {
                Object orderObj = sectionData.get("order");
                if (orderObj instanceof Number) {
                    section.setOrder(((Number) orderObj).intValue());
                }
            }
            if (sectionData.containsKey("duration")) {
                Object durationObj = sectionData.get("duration");
                if (durationObj instanceof Number) {
                    section.setDuration(((Number) durationObj).intValue());
                }
            }
            if (sectionData.containsKey("content")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> contentData = (Map<String, Object>) sectionData.get("content");
                TrainingJourneyEntity.SectionContent content = convertSectionContent(contentData);
                section.setContent(content);
            }
            
            sections.add(section);
        }
        
        return sections;
    }
    
    // Helper method to convert section content
    private TrainingJourneyEntity.SectionContent convertSectionContent(Map<String, Object> contentData) {
        if (contentData == null) return null;
        
        TrainingJourneyEntity.SectionContent content = new TrainingJourneyEntity.SectionContent();
        
        if (contentData.containsKey("text")) {
            content.setText(contentData.get("text") != null ? contentData.get("text").toString() : null);
        }
        if (contentData.containsKey("youtubeUrl")) {
            content.setYoutubeUrl(contentData.get("youtubeUrl") != null ? contentData.get("youtubeUrl").toString() : null);
        }
        if (contentData.containsKey("file")) {
            @SuppressWarnings("unchecked")
            Map<String, Object> fileData = (Map<String, Object>) contentData.get("file");
            TrainingJourneyEntity.SectionFile file = convertSectionFile(fileData);
            content.setFile(file);
        }
        
        return content;
    }
    
    // Helper method to convert section file
    private TrainingJourneyEntity.SectionFile convertSectionFile(Map<String, Object> fileData) {
        if (fileData == null) return null;
        
        TrainingJourneyEntity.SectionFile file = new TrainingJourneyEntity.SectionFile();
        
        if (fileData.containsKey("id")) {
            file.setId(fileData.get("id") != null ? fileData.get("id").toString() : null);
        }
        if (fileData.containsKey("name")) {
            file.setName(fileData.get("name") != null ? fileData.get("name").toString() : null);
        }
        if (fileData.containsKey("type")) {
            file.setType(fileData.get("type") != null ? fileData.get("type").toString() : null);
        }
        if (fileData.containsKey("url")) {
            file.setUrl(fileData.get("url") != null ? fileData.get("url").toString() : null);
        }
        if (fileData.containsKey("publicId")) {
            file.setPublicId(fileData.get("publicId") != null ? fileData.get("publicId").toString() : null);
        }
        if (fileData.containsKey("size")) {
            Object sizeObj = fileData.get("size");
            if (sizeObj instanceof Number) {
                file.setSize(((Number) sizeObj).longValue());
            }
        }
        if (fileData.containsKey("mimeType")) {
            file.setMimeType(fileData.get("mimeType") != null ? fileData.get("mimeType").toString() : null);
        }
        
        return file;
    }
    
    // Helper method to convert quizzes list
    private List<TrainingJourneyEntity.QuizEntity> convertQuizzes(List<Map<String, Object>> quizzesData) {
        List<TrainingJourneyEntity.QuizEntity> quizzes = new java.util.ArrayList<>();
        if (quizzesData == null) return quizzes;
        
        for (Map<String, Object> quizData : quizzesData) {
            TrainingJourneyEntity.QuizEntity quiz = new TrainingJourneyEntity.QuizEntity();
            
            // Extract _id if present
            if (quizData.containsKey("_id")) {
                Object idObj = quizData.get("_id");
                if (idObj instanceof Map) {
                    Map<String, Object> idMap = (Map<String, Object>) idObj;
                    if (idMap.containsKey("$oid")) {
                        quiz.set_id((String) idMap.get("$oid"));
                    }
                } else {
                    quiz.set_id(idObj != null ? idObj.toString() : null);
                }
            }
            
            if (quizData.containsKey("title")) {
                quiz.setTitle(quizData.get("title") != null ? quizData.get("title").toString() : null);
            }
            if (quizData.containsKey("description")) {
                quiz.setDescription(quizData.get("description") != null ? quizData.get("description").toString() : null);
            }
            if (quizData.containsKey("passingScore")) {
                Object passingScoreObj = quizData.get("passingScore");
                if (passingScoreObj instanceof Number) {
                    quiz.setPassingScore(((Number) passingScoreObj).intValue());
                }
            }
            if (quizData.containsKey("timeLimit")) {
                Object timeLimitObj = quizData.get("timeLimit");
                if (timeLimitObj instanceof Number) {
                    quiz.setTimeLimit(((Number) timeLimitObj).intValue());
                }
            }
            if (quizData.containsKey("maxAttempts")) {
                Object maxAttemptsObj = quizData.get("maxAttempts");
                if (maxAttemptsObj instanceof Number) {
                    quiz.setMaxAttempts(((Number) maxAttemptsObj).intValue());
                }
            }
            if (quizData.containsKey("questions")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> questionsData = (List<Map<String, Object>>) quizData.get("questions");
                List<TrainingJourneyEntity.QuizQuestion> questions = convertQuizQuestions(questionsData);
                quiz.setQuestions(questions);
            }
            if (quizData.containsKey("settings")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> settingsData = (Map<String, Object>) quizData.get("settings");
                TrainingJourneyEntity.QuizSettings settings = convertQuizSettings(settingsData);
                quiz.setSettings(settings);
            }
            
            quizzes.add(quiz);
        }
        
        return quizzes;
    }
    
    // Helper method to convert quiz questions
    private List<TrainingJourneyEntity.QuizQuestion> convertQuizQuestions(List<Map<String, Object>> questionsData) {
        List<TrainingJourneyEntity.QuizQuestion> questions = new java.util.ArrayList<>();
        if (questionsData == null) return questions;
        
        for (Map<String, Object> questionData : questionsData) {
            TrainingJourneyEntity.QuizQuestion question = new TrainingJourneyEntity.QuizQuestion();
            
            if (questionData.containsKey("_id")) {
                Object idObj = questionData.get("_id");
                if (idObj instanceof Map) {
                    Map<String, Object> idMap = (Map<String, Object>) idObj;
                    if (idMap.containsKey("$oid")) {
                        question.set_id((String) idMap.get("$oid"));
                    }
                } else {
                    question.set_id(idObj != null ? idObj.toString() : null);
                }
            }
            
            if (questionData.containsKey("question")) {
                question.setQuestion(questionData.get("question") != null ? questionData.get("question").toString() : null);
            }
            if (questionData.containsKey("type")) {
                question.setType(questionData.get("type") != null ? questionData.get("type").toString() : null);
            }
            if (questionData.containsKey("options")) {
                @SuppressWarnings("unchecked")
                List<String> options = (List<String>) questionData.get("options");
                question.setOptions(options != null ? options : new java.util.ArrayList<>());
            }
            if (questionData.containsKey("correctAnswer")) {
                question.setCorrectAnswer(questionData.get("correctAnswer"));
            }
            if (questionData.containsKey("explanation")) {
                question.setExplanation(questionData.get("explanation") != null ? questionData.get("explanation").toString() : null);
            }
            if (questionData.containsKey("points")) {
                Object pointsObj = questionData.get("points");
                if (pointsObj instanceof Number) {
                    question.setPoints(((Number) pointsObj).intValue());
                }
            }
            if (questionData.containsKey("orderIndex")) {
                Object orderIndexObj = questionData.get("orderIndex");
                if (orderIndexObj instanceof Number) {
                    question.setOrderIndex(((Number) orderIndexObj).intValue());
                }
            }
            if (questionData.containsKey("imageUrl")) {
                question.setImageUrl(questionData.get("imageUrl") != null ? questionData.get("imageUrl").toString() : null);
            }
            
            questions.add(question);
        }
        
        return questions;
    }
    
    // Helper method to convert quiz settings
    private TrainingJourneyEntity.QuizSettings convertQuizSettings(Map<String, Object> settingsData) {
        if (settingsData == null) return null;
        
        TrainingJourneyEntity.QuizSettings settings = new TrainingJourneyEntity.QuizSettings();
        
        if (settingsData.containsKey("shuffleQuestions")) {
            Object shuffleQuestionsObj = settingsData.get("shuffleQuestions");
            if (shuffleQuestionsObj instanceof Boolean) {
                settings.setShuffleQuestions((Boolean) shuffleQuestionsObj);
            }
        }
        if (settingsData.containsKey("shuffleOptions")) {
            Object shuffleOptionsObj = settingsData.get("shuffleOptions");
            if (shuffleOptionsObj instanceof Boolean) {
                settings.setShuffleOptions((Boolean) shuffleOptionsObj);
            }
        }
        if (settingsData.containsKey("showCorrectAnswers")) {
            Object showCorrectAnswersObj = settingsData.get("showCorrectAnswers");
            if (showCorrectAnswersObj instanceof Boolean) {
                settings.setShowCorrectAnswers((Boolean) showCorrectAnswersObj);
            }
        }
        if (settingsData.containsKey("allowReview")) {
            Object allowReviewObj = settingsData.get("allowReview");
            if (allowReviewObj instanceof Boolean) {
                settings.setAllowReview((Boolean) allowReviewObj);
            }
        }
        if (settingsData.containsKey("showExplanations")) {
            Object showExplanationsObj = settingsData.get("showExplanations");
            if (showExplanationsObj instanceof Boolean) {
                settings.setShowExplanations((Boolean) showExplanationsObj);
            }
        }
        
        return settings;
    }
    
    // Helper method to convert final exam
    private TrainingJourneyEntity.FinalExamEntity convertFinalExam(Map<String, Object> finalExamData) {
        if (finalExamData == null) return null;
        
        TrainingJourneyEntity.FinalExamEntity finalExam = new TrainingJourneyEntity.FinalExamEntity();
        
        // Extract _id if present
        if (finalExamData.containsKey("_id")) {
            Object idObj = finalExamData.get("_id");
            if (idObj instanceof Map) {
                Map<String, Object> idMap = (Map<String, Object>) idObj;
                if (idMap.containsKey("$oid")) {
                    finalExam.set_id((String) idMap.get("$oid"));
                }
            } else {
                finalExam.set_id(idObj != null ? idObj.toString() : null);
            }
        }
        
        if (finalExamData.containsKey("title")) {
            finalExam.setTitle(finalExamData.get("title") != null ? finalExamData.get("title").toString() : null);
        }
        if (finalExamData.containsKey("description")) {
            finalExam.setDescription(finalExamData.get("description") != null ? finalExamData.get("description").toString() : null);
        }
        if (finalExamData.containsKey("passingScore")) {
            Object passingScoreObj = finalExamData.get("passingScore");
            if (passingScoreObj instanceof Number) {
                finalExam.setPassingScore(((Number) passingScoreObj).intValue());
            }
        }
        if (finalExamData.containsKey("timeLimit")) {
            Object timeLimitObj = finalExamData.get("timeLimit");
            if (timeLimitObj instanceof Number) {
                finalExam.setTimeLimit(((Number) timeLimitObj).intValue());
            }
        }
        if (finalExamData.containsKey("maxAttempts")) {
            Object maxAttemptsObj = finalExamData.get("maxAttempts");
            if (maxAttemptsObj instanceof Number) {
                finalExam.setMaxAttempts(((Number) maxAttemptsObj).intValue());
            }
        }
        if (finalExamData.containsKey("questions")) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> questionsData = (List<Map<String, Object>>) finalExamData.get("questions");
            List<TrainingJourneyEntity.QuizQuestion> questions = convertQuizQuestions(questionsData);
            finalExam.setQuestions(questions);
        }
        if (finalExamData.containsKey("settings")) {
            @SuppressWarnings("unchecked")
            Map<String, Object> settingsData = (Map<String, Object>) finalExamData.get("settings");
            TrainingJourneyEntity.QuizSettings settings = convertQuizSettings(settingsData);
            finalExam.setSettings(settings);
        }
        
        return finalExam;
    }
    
    /**
     * POST /training_journeys/modules/{moduleId}/quizzes
     * Create a module quiz in module_quizzes collection
     */
    /**
     * POST /training_journeys/modules/{moduleId}/quizzes
     * Create a module quiz in module_quizzes collection
     * Note: moduleId in the path is ignored; the actual moduleId stored will be the trainingId (ObjectId of training journey)
     */
    @PostMapping("/modules/{moduleId}/quizzes")
    public ResponseEntity<Map<String, Object>> createModuleQuiz(
            @PathVariable String moduleId,
            @RequestBody Map<String, Object> quizData) {
        try {
            ModuleQuiz quiz = convertMapToModuleQuiz(quizData);
            // Use trainingId as moduleId (ObjectId reference to training journey)
            // This allows moduleId to be stored as MongoDB ObjectId instead of string like "module-3"
            String trainingId = quiz.getTrainingId();
            if (trainingId != null && !trainingId.isEmpty()) {
                // Store trainingId (ObjectId) as moduleId - this is the _id of the training journey
                quiz.setModuleId(trainingId);
                System.out.println("[JourneyController] Setting moduleId to trainingId (ObjectId): " + trainingId);
            } else {
                // Fallback to moduleId from path if trainingId not provided (should not happen)
                System.out.println("[JourneyController] Warning: trainingId not provided, using moduleId from path: " + moduleId);
                quiz.setModuleId(moduleId);
            }
            
            ModuleQuiz created = moduleQuizService.createQuiz(quiz);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Module quiz created successfully");
            response.put("data", created);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error creating module quiz: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_journeys/modules/quizzes/{quizId}
     * Get a module quiz by ID
     */
    @GetMapping("/modules/quizzes/{quizId}")
    public ResponseEntity<Map<String, Object>> getModuleQuiz(@PathVariable String quizId) {
        try {
            ModuleQuiz quiz = moduleQuizService.getQuizById(quizId);
            
            if (quiz != null) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("data", quiz);
                return ResponseEntity.ok(response);
            } else {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Quiz not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
        } catch (Exception e) {
            System.err.println("[JourneyController] Error getting module quiz: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_journeys/modules/{moduleId}/quizzes
     * Get all quizzes for a module
     * Note: moduleId is actually the trainingId (ObjectId of the training journey)
     */
    @GetMapping("/modules/{moduleId}/quizzes")
    public ResponseEntity<Map<String, Object>> getModuleQuizzes(@PathVariable String moduleId) {
        try {
            // moduleId is actually trainingId (ObjectId reference to training journey)
            List<ModuleQuiz> quizzes = moduleQuizService.getQuizzesByModule(moduleId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", quizzes);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error getting module quizzes: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * POST /training_journeys/{trainingId}/final-exam
     * Create a final exam quiz in exam_final_quizzes collection
     */
    @PostMapping("/{trainingId}/final-exam")
    public ResponseEntity<Map<String, Object>> createFinalExam(
            @PathVariable String trainingId,
            @RequestBody Map<String, Object> examData) {
        try {
            ExamFinalQuiz exam = convertMapToExamFinalQuiz(examData);
            exam.setTrainingId(trainingId);
            exam.setJourneyId(trainingId); // Use trainingId as journeyId
            
            ExamFinalQuiz created = examFinalQuizService.createFinalExam(exam);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Final exam created successfully");
            response.put("data", created);
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[JourneyController] Error creating final exam: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * GET /training_journeys/{trainingId}/final-exam
     * Get final exam for a training journey
     */
    @GetMapping("/{trainingId}/final-exam")
    public ResponseEntity<Map<String, Object>> getFinalExam(@PathVariable String trainingId) {
        try {
            ExamFinalQuiz exam = examFinalQuizService.getFinalExamByTraining(trainingId);
            
            if (exam != null) {
                Map<String, Object> response = new HashMap<>();
                response.put("success", true);
                response.put("data", exam);
                return ResponseEntity.ok(response);
            } else {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Final exam not found");
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorResponse);
            }
        } catch (Exception e) {
            System.err.println("[JourneyController] Error getting final exam: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    
    /**
     * Helper method to convert Map to ModuleQuiz
     */
    private ModuleQuiz convertMapToModuleQuiz(Map<String, Object> data) {
        try {
            return objectMapper.convertValue(data, ModuleQuiz.class);
        } catch (Exception e) {
            // Fallback manual conversion
            ModuleQuiz quiz = new ModuleQuiz();
            if (data.containsKey("title")) quiz.setTitle((String) data.get("title"));
            if (data.containsKey("description")) quiz.setDescription((String) data.get("description"));
            if (data.containsKey("moduleId")) quiz.setModuleId((String) data.get("moduleId"));
            if (data.containsKey("trainingId")) quiz.setTrainingId((String) data.get("trainingId"));
            if (data.containsKey("passingScore")) quiz.setPassingScore(((Number) data.get("passingScore")).intValue());
            if (data.containsKey("timeLimit")) quiz.setTimeLimit(((Number) data.get("timeLimit")).intValue());
            if (data.containsKey("maxAttempts")) quiz.setMaxAttempts(((Number) data.get("maxAttempts")).intValue());
            if (data.containsKey("questions")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> questionsData = (List<Map<String, Object>>) data.get("questions");
                List<ModuleQuiz.QuizQuestion> questions = questionsData.stream().map(qData -> {
                    ModuleQuiz.QuizQuestion q = new ModuleQuiz.QuizQuestion();
                    if (qData.containsKey("_id")) q.set_id((String) qData.get("_id"));
                    if (qData.containsKey("id")) q.set_id((String) qData.get("id"));
                    if (qData.containsKey("question")) q.setQuestion((String) qData.get("question"));
                    if (qData.containsKey("text")) q.setQuestion((String) qData.get("text"));
                    if (qData.containsKey("type")) q.setType((String) qData.get("type"));
                    if (qData.containsKey("options")) q.setOptions((List<String>) qData.get("options"));
                    if (qData.containsKey("correctAnswer")) q.setCorrectAnswer(qData.get("correctAnswer"));
                    if (qData.containsKey("explanation")) q.setExplanation((String) qData.get("explanation"));
                    if (qData.containsKey("points")) q.setPoints(((Number) qData.get("points")).intValue());
                    if (qData.containsKey("orderIndex")) q.setOrderIndex(((Number) qData.get("orderIndex")).intValue());
                    return q;
                }).collect(java.util.stream.Collectors.toList());
                quiz.setQuestions(questions);
            }
            if (data.containsKey("settings")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> settingsData = (Map<String, Object>) data.get("settings");
                ModuleQuiz.QuizSettings settings = new ModuleQuiz.QuizSettings();
                if (settingsData.containsKey("shuffleQuestions")) settings.setShuffleQuestions((Boolean) settingsData.get("shuffleQuestions"));
                if (settingsData.containsKey("shuffleOptions")) settings.setShuffleOptions((Boolean) settingsData.get("shuffleOptions"));
                if (settingsData.containsKey("showCorrectAnswers")) settings.setShowCorrectAnswers((Boolean) settingsData.get("showCorrectAnswers"));
                if (settingsData.containsKey("allowReview")) settings.setAllowReview((Boolean) settingsData.get("allowReview"));
                if (settingsData.containsKey("showExplanations")) settings.setShowExplanations((Boolean) settingsData.get("showExplanations"));
                quiz.setSettings(settings);
            }
            return quiz;
        }
    }
    
    /**
     * Helper method to convert Map to ExamFinalQuiz
     */
    private ExamFinalQuiz convertMapToExamFinalQuiz(Map<String, Object> data) {
        try {
            return objectMapper.convertValue(data, ExamFinalQuiz.class);
        } catch (Exception e) {
            // Fallback manual conversion
            ExamFinalQuiz exam = new ExamFinalQuiz();
            if (data.containsKey("title")) exam.setTitle((String) data.get("title"));
            if (data.containsKey("description")) exam.setDescription((String) data.get("description"));
            if (data.containsKey("trainingId")) exam.setTrainingId((String) data.get("trainingId"));
            if (data.containsKey("journeyId")) exam.setJourneyId((String) data.get("journeyId"));
            if (data.containsKey("passingScore")) exam.setPassingScore(((Number) data.get("passingScore")).intValue());
            if (data.containsKey("timeLimit")) exam.setTimeLimit(((Number) data.get("timeLimit")).intValue());
            if (data.containsKey("maxAttempts")) exam.setMaxAttempts(((Number) data.get("maxAttempts")).intValue());
            if (data.containsKey("questions")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> questionsData = (List<Map<String, Object>>) data.get("questions");
                List<ExamFinalQuiz.QuizQuestion> questions = questionsData.stream().map(qData -> {
                    ExamFinalQuiz.QuizQuestion q = new ExamFinalQuiz.QuizQuestion();
                    if (qData.containsKey("_id")) q.set_id((String) qData.get("_id"));
                    if (qData.containsKey("id")) q.set_id((String) qData.get("id"));
                    if (qData.containsKey("question")) q.setQuestion((String) qData.get("question"));
                    if (qData.containsKey("text")) q.setQuestion((String) qData.get("text"));
                    if (qData.containsKey("type")) q.setType((String) qData.get("type"));
                    if (qData.containsKey("options")) q.setOptions((List<String>) qData.get("options"));
                    if (qData.containsKey("correctAnswer")) q.setCorrectAnswer(qData.get("correctAnswer"));
                    if (qData.containsKey("explanation")) q.setExplanation((String) qData.get("explanation"));
                    if (qData.containsKey("points")) q.setPoints(((Number) qData.get("points")).intValue());
                    if (qData.containsKey("orderIndex")) q.setOrderIndex(((Number) qData.get("orderIndex")).intValue());
                    return q;
                }).collect(java.util.stream.Collectors.toList());
                exam.setQuestions(questions);
            }
            if (data.containsKey("settings")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> settingsData = (Map<String, Object>) data.get("settings");
                ExamFinalQuiz.QuizSettings settings = new ExamFinalQuiz.QuizSettings();
                if (settingsData.containsKey("shuffleQuestions")) settings.setShuffleQuestions((Boolean) settingsData.get("shuffleQuestions"));
                if (settingsData.containsKey("shuffleOptions")) settings.setShuffleOptions((Boolean) settingsData.get("shuffleOptions"));
                if (settingsData.containsKey("showCorrectAnswers")) settings.setShowCorrectAnswers((Boolean) settingsData.get("showCorrectAnswers"));
                if (settingsData.containsKey("allowReview")) settings.setAllowReview((Boolean) settingsData.get("allowReview"));
                if (settingsData.containsKey("showExplanations")) settings.setShowExplanations((Boolean) settingsData.get("showExplanations"));
                exam.setSettings(settings);
            }
            return exam;
        }
    }
}

