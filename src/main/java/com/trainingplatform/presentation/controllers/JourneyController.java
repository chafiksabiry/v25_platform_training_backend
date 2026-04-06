package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.TrainingJourneyService;
import com.trainingplatform.infrastructure.repositories.RepProgressRepository;
import com.trainingplatform.core.entities.RepProgress;
import com.trainingplatform.domain.entities.TrainingJourneyEntity;
import com.trainingplatform.core.entities.TrainingModule;
import com.trainingplatform.core.entities.TrainingSection;
import com.trainingplatform.domain.entities.GigEntity;
import com.trainingplatform.domain.entities.IndustryEntity;
import com.trainingplatform.domain.repositories.GigRepository;
import com.trainingplatform.domain.repositories.IndustryRepository;
import java.util.Optional;
import java.util.stream.Collectors;
import org.bson.types.ObjectId;

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
                Optional<RepProgress> progressOpt = repProgressRepository.findByRepIdAndJourneyId(repId, journeyId);
                progressList = progressOpt.map(List::of).orElse(new ArrayList<>());
            } else {
                progressList = repProgressRepository.findByRepId(repId);
            }
            
            // Update counters
            for (RepProgress repProgress : progressList) {
                repProgress.updateCounters();
                repProgressRepository.save(repProgress);
            }
            
            System.out.println("[JourneyController] Found " + progressList.size() + " progress records");
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", progressList.isEmpty() ? null : (progressList.size() == 1 ? progressList.get(0) : progressList));
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
                Optional<RepProgress> journeyProgressOpt = repProgressRepository.findByRepIdAndJourneyId(repId, journey.getId());
                
                if (!journeyProgressOpt.isPresent()) {
                    notStartedTrainings++;
                    trainingsProgress.put(journey.getId(), Map.of(
                        "journeyId", journey.getId(),
                        "journeyTitle", journey.getTitle() != null ? journey.getTitle() : "Untitled",
                        "status", "not-started",
                        "progress", 0,
                        "engagementScore", 0,
                        "timeSpent", 0,
                        "moduleTotal", 0,
                        "moduleFinished", 0,
                        "moduleInProgress", 0,
                        "moduleNotStarted", 0
                    ));
                } else {
                    RepProgress journeyProgress = journeyProgressOpt.get();
                    
                    // Calculate average progress from modules
                    Map<String, RepProgress.ModuleProgress> modules = journeyProgress.getModules();
                    double journeyProgressAvg = 0.0;
                    if (modules != null && !modules.isEmpty()) {
                        journeyProgressAvg = modules.values().stream()
                            .mapToInt(RepProgress.ModuleProgress::getProgress)
                            .average()
                            .orElse(0.0);
                    }
                    
                    double journeyEngagementAvg = journeyProgress.getEngagementScore();
                    int journeyTimeSpent = journeyProgress.getTimeSpent();
                    
                    String status = journeyProgress.getModuleFinished() == journeyProgress.getModuleTotal() && journeyProgress.getModuleTotal() > 0
                        ? "completed"
                        : journeyProgress.getModuleInProgress() > 0
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
                        "timeSpent", journeyTimeSpent,
                        "moduleTotal", journeyProgress.getModuleTotal(),
                        "moduleFinished", journeyProgress.getModuleFinished(),
                        "moduleInProgress", journeyProgress.getModuleInProgress(),
                        "moduleNotStarted", journeyProgress.getModuleNotStarted()
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
                Optional<RepProgress> journeyProgressOpt = repProgressRepository.findByRepIdAndJourneyId(repId, journey.getId());
                
                Map<String, Object> trainingProgress = new HashMap<>();
                trainingProgress.put("journeyId", journey.getId());
                trainingProgress.put("journeyTitle", journey.getTitle() != null ? journey.getTitle() : "Untitled");
                trainingProgress.put("description", journey.getDescription());
                
                if (!journeyProgressOpt.isPresent()) {
                    notStartedTrainings++;
                    trainingProgress.put("status", "not-started");
                    trainingProgress.put("progress", 0);
                    trainingProgress.put("timeSpent", 0);
                    trainingProgress.put("moduleTotal", 0);
                    trainingProgress.put("moduleFinished", 0);
                    trainingProgress.put("moduleInProgress", 0);
                    trainingProgress.put("moduleNotStarted", 0);
                    trainingProgress.put("modulesProgress", new ArrayList<>());
                } else {
                    RepProgress journeyProgress = journeyProgressOpt.get();
                    
                    // Calculate average progress from modules
                    Map<String, RepProgress.ModuleProgress> modules = journeyProgress.getModules();
                    double journeyProgressAvg = 0.0;
                    if (modules != null && !modules.isEmpty()) {
                        journeyProgressAvg = modules.values().stream()
                            .mapToInt(RepProgress.ModuleProgress::getProgress)
                            .average()
                            .orElse(0.0);
                    }
                    
                    int journeyTimeSpent = journeyProgress.getTimeSpent();
                    
                    String status = journeyProgress.getModuleFinished() == journeyProgress.getModuleTotal() && journeyProgress.getModuleTotal() > 0
                        ? "completed"
                        : journeyProgress.getModuleInProgress() > 0
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
                    
                    // Build modules progress list
                    List<Map<String, Object>> modulesProgressList = new ArrayList<>();
                    if (modules != null) {
                        for (Map.Entry<String, RepProgress.ModuleProgress> entry : modules.entrySet()) {
                            RepProgress.ModuleProgress moduleProg = entry.getValue();
                            Map<String, Object> moduleProgMap = new HashMap<>();
                            moduleProgMap.put("moduleId", entry.getKey());
                            moduleProgMap.put("progress", moduleProg.getProgress());
                            moduleProgMap.put("status", moduleProg.getStatus());
                            moduleProgMap.put("timeSpent", moduleProg.getTimeSpent());
                            modulesProgressList.add(moduleProgMap);
                        }
                    }
                    
                    trainingProgress.put("status", status);
                    trainingProgress.put("progress", Math.round(journeyProgressAvg));
                    trainingProgress.put("timeSpent", journeyTimeSpent);
                    trainingProgress.put("moduleTotal", journeyProgress.getModuleTotal());
                    trainingProgress.put("moduleFinished", journeyProgress.getModuleFinished());
                    trainingProgress.put("moduleInProgress", journeyProgress.getModuleInProgress());
                    trainingProgress.put("moduleNotStarted", journeyProgress.getModuleNotStarted());
                    trainingProgress.put("modulesProgress", modulesProgressList);
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
            
            System.out.println("[JourneyController] Journey found: " + journey.getTitle());
            System.out.println("[JourneyController] Number of modules: " + (modules != null ? modules.size() : 0));
            
            if (modules == null || modules.isEmpty()) {
                System.out.println("[JourneyController] WARNING: Journey has no modules!");
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "Journey has no modules");
                errorResponse.put("journeyId", journeyId);
                errorResponse.put("journeyTitle", journey.getTitle());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorResponse);
            }
            
            // Check if progress already exists for this rep/journey
            Optional<RepProgress> existingProgressOpt = repProgressRepository.findByRepIdAndJourneyId(repId, journeyId);
            
            RepProgress repProgress;
            boolean isNew = false;
            
            if (existingProgressOpt.isPresent()) {
                repProgress = existingProgressOpt.get();
                System.out.println("[JourneyController] Found existing progress for repId: " + repId + ", journeyId: " + journeyId);
            } else {
                // Create new progress document
                repProgress = new RepProgress(repId, journeyId);
                repProgress.setModuleTotal(modules.size());
                repProgress.setModules(new java.util.HashMap<>());
                isNew = true;
                System.out.println("[JourneyController] Creating new progress document for repId: " + repId + ", journeyId: " + journeyId);
            }
            
            // Initialize or update modules progress
            Map<String, RepProgress.ModuleProgress> modulesMap = repProgress.getModules();
            if (modulesMap == null) {
                modulesMap = new java.util.HashMap<>();
            }
            
            for (int i = 0; i < modules.size(); i++) {
                TrainingJourneyEntity.TrainingModuleEntity module = modules.get(i);
                System.out.println("[JourneyController] Processing module " + (i + 1) + "/" + modules.size() + ": " + module.getTitle());
                
                // TrainingModuleEntity uses _id (MongoDB ObjectId)
                String moduleId = module.get_id();
                
                // If module has no _id, generate a MongoDB ObjectId
                if (moduleId == null || moduleId.isEmpty() || !ObjectId.isValid(moduleId)) {
                    moduleId = new ObjectId().toHexString();
                    module.set_id(moduleId);
                    System.out.println("[JourneyController] Generated MongoDB ObjectId for module: " + moduleId);
                } else {
                    System.out.println("[JourneyController] Module _id (MongoDB ObjectId): " + moduleId);
                }
                
                // Check if module progress already exists by _id
                boolean moduleExists = modulesMap.containsKey(moduleId);
                
                // Initialize module progress if it doesn't exist
                if (!moduleExists) {
                    RepProgress.ModuleProgress moduleProgress = new RepProgress.ModuleProgress("not-started");
                    moduleProgress.setProgress(0);
                    moduleProgress.setTimeSpent(0);
                    moduleProgress.setSections(new java.util.HashMap<>());
                    
                    // Initialize sections progress
                    if (module.getSections() != null) {
                        for (TrainingJourneyEntity.SectionEntity section : module.getSections()) {
                            String sectionId = section.get_id();
                            // If section has no _id, generate a MongoDB ObjectId
                            if (sectionId == null || sectionId.isEmpty() || !ObjectId.isValid(sectionId)) {
                                sectionId = new ObjectId().toHexString();
                                section.set_id(sectionId);
                            }
                            RepProgress.SectionProgress sectionProgress = new RepProgress.SectionProgress(false);
                            sectionProgress.setProgress(0);
                            sectionProgress.setTimeSpent(0);
                            moduleProgress.getSections().put(sectionId, sectionProgress);
                        }
                    }
                    
                    modulesMap.put(moduleId, moduleProgress);
                    System.out.println("[JourneyController] ✅ Initialized progress for module: " + moduleId);
                } else {
                    System.out.println("[JourneyController] ℹ️ Module progress already exists: " + moduleId);
                }
            }
            
            repProgress.setModules(modulesMap);
            repProgress.setModuleTotal(modules.size());
            repProgress.setLastAccessed(java.time.LocalDateTime.now());
            repProgress.updateCounters();
            
            RepProgress savedProgress = repProgressRepository.save(repProgress);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", isNew ? "Training progress initialized" : "Training progress updated");
            response.put("data", savedProgress);
            response.put("moduleTotal", savedProgress.getModuleTotal());
            response.put("moduleFinished", savedProgress.getModuleFinished());
            response.put("moduleNotStarted", savedProgress.getModuleNotStarted());
            response.put("moduleInProgress", savedProgress.getModuleInProgress());
            
            System.out.println("[JourneyController] ✅ Saved progress for repId: " + repId + ", journeyId: " + journeyId);
            System.out.println("[JourneyController] Module stats - Total: " + savedProgress.getModuleTotal() + 
                             ", Finished: " + savedProgress.getModuleFinished() + 
                             ", In Progress: " + savedProgress.getModuleInProgress() + 
                             ", Not Started: " + savedProgress.getModuleNotStarted());
            
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
            String sectionId = (String) progressData.get("sectionId"); // Optional
            
            if (repId == null || journeyId == null || moduleId == null) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "repId, journeyId, and moduleId are required");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorResponse);
            }
            
            // Get or create progress record
            Optional<RepProgress> existingProgressOpt = repProgressRepository.findByRepIdAndJourneyId(repId, journeyId);
            RepProgress repProgress;
            
            if (existingProgressOpt.isPresent()) {
                repProgress = existingProgressOpt.get();
            } else {
                // If progress doesn't exist, initialize it first
                repProgress = new RepProgress(repId, journeyId);
                repProgress.setModules(new java.util.HashMap<>());
                System.out.println("[JourneyController] Creating new progress document for update");
            }
            
            // Get or create module progress
            Map<String, RepProgress.ModuleProgress> modulesMap = repProgress.getModules();
            if (modulesMap == null) {
                modulesMap = new java.util.HashMap<>();
            }
            
            // Validate that moduleId is a valid MongoDB ObjectId
            if (!ObjectId.isValid(moduleId)) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("error", "moduleId must be a valid MongoDB ObjectId: " + moduleId);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorResponse);
            }
            
            // Try to find module by the provided moduleId (MongoDB ObjectId)
            RepProgress.ModuleProgress moduleProgress = modulesMap.get(moduleId);
            
            // If not found, verify the module exists in the journey and create progress
            if (moduleProgress == null) {
                Optional<TrainingJourneyEntity> journeyOpt = journeyService.getJourneyById(journeyId);
                boolean moduleExistsInJourney = false;
                
                if (journeyOpt.isPresent()) {
                    TrainingJourneyEntity journey = journeyOpt.get();
                    List<TrainingJourneyEntity.TrainingModuleEntity> journeyModules = journey.getModules();
                    
                    if (journeyModules != null) {
                        // Verify the module exists in the journey by _id
                        for (TrainingJourneyEntity.TrainingModuleEntity journeyModule : journeyModules) {
                            String journeyModuleId = journeyModule.get_id();
                            
                            // Ensure journey module has a valid ObjectId
                            if (journeyModuleId == null || journeyModuleId.isEmpty() || !ObjectId.isValid(journeyModuleId)) {
                                journeyModuleId = new ObjectId().toHexString();
                                journeyModule.set_id(journeyModuleId);
                            }
                            
                            if (moduleId.equals(journeyModuleId)) {
                                moduleExistsInJourney = true;
                                break;
                            }
                        }
                    }
                }
                
                if (!moduleExistsInJourney) {
                    Map<String, Object> errorResponse = new HashMap<>();
                    errorResponse.put("success", false);
                    errorResponse.put("error", "Module with _id " + moduleId + " not found in journey " + journeyId);
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorResponse);
                }
            }
            
            // If still not found, create new module progress
            if (moduleProgress == null) {
                moduleProgress = new RepProgress.ModuleProgress("not-started");
                moduleProgress.setSections(new java.util.HashMap<>());
                modulesMap.put(moduleId, moduleProgress);
                System.out.println("[JourneyController] Created new module progress with MongoDB ObjectId: " + moduleId);
            } else {
                System.out.println("[JourneyController] Found existing module progress with MongoDB ObjectId: " + moduleId);
            }
            
            // Update module progress if sectionId is not provided
            if (sectionId == null || sectionId.isEmpty()) {
                // Update module-level progress
                if (progressData.containsKey("progress")) {
                    Object progressValue = progressData.get("progress");
                    if (progressValue instanceof Number) {
                        moduleProgress.setProgress(((Number) progressValue).intValue());
                    }
                }
                
                if (progressData.containsKey("status")) {
                    String status = (String) progressData.get("status");
                    moduleProgress.setStatus(status);
                }
                
                moduleProgress.setLastAccessed(java.time.LocalDateTime.now());
            } else {
                // Update section-level progress
                Map<String, RepProgress.SectionProgress> sectionsMap = moduleProgress.getSections();
                if (sectionsMap == null) {
                    sectionsMap = new java.util.HashMap<>();
                    moduleProgress.setSections(sectionsMap);
                }
                
                RepProgress.SectionProgress sectionProgress = sectionsMap.get(sectionId);
                if (sectionProgress == null) {
                    sectionProgress = new RepProgress.SectionProgress(false);
                    sectionsMap.put(sectionId, sectionProgress);
                }
                
                if (progressData.containsKey("progress")) {
                    Object progressValue = progressData.get("progress");
                    if (progressValue instanceof Number) {
                        sectionProgress.setProgress(((Number) progressValue).intValue());
                    }
                }
                
                if (progressData.containsKey("completed")) {
                    Object completedValue = progressData.get("completed");
                    if (completedValue instanceof Boolean) {
                        sectionProgress.setCompleted((Boolean) completedValue);
                    }
                }
                
                if (progressData.containsKey("timeSpent")) {
                    Object timeSpentValue = progressData.get("timeSpent");
                    if (timeSpentValue instanceof Number) {
                        sectionProgress.setTimeSpent(((Number) timeSpentValue).intValue());
                    }
                }
                
                sectionProgress.setLastAccessed(java.time.LocalDateTime.now());
            }
            
            // Update engagement score if provided
            if (progressData.containsKey("engagementScore")) {
                Object engagementValue = progressData.get("engagementScore");
                if (engagementValue instanceof Number) {
                    repProgress.setEngagementScore(((Number) engagementValue).intValue());
                }
            }
            
            // Update total time spent
            if (progressData.containsKey("totalTimeSpent")) {
                Object totalTimeSpentValue = progressData.get("totalTimeSpent");
                if (totalTimeSpentValue instanceof Number) {
                    repProgress.setTimeSpent(((Number) totalTimeSpentValue).intValue());
                }
            }
            
            repProgress.setModules(modulesMap);
            repProgress.setLastAccessed(java.time.LocalDateTime.now());
            repProgress.updateCounters();
            
            // Save progress
            RepProgress savedProgress = repProgressRepository.save(repProgress);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("data", savedProgress);
            response.put("message", "Progress updated successfully");
            
            System.out.println("[JourneyController] Progress updated for repId: " + repId + ", journeyId: " + journeyId + ", moduleId: " + moduleId + 
                             (sectionId != null ? ", sectionId: " + sectionId : ""));
            
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
            
            // Explicitly handle embedded modules
            if (data.containsKey("modules")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> modulesData = (List<Map<String, Object>>) data.get("modules");
                List<TrainingModule> modules = convertModules(modulesData);
                entity.setModules(modules);
                System.out.println("[JourneyController] Set modules: " + (modules != null ? modules.size() : 0) + " modules");
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
                List<TrainingModule> modules = convertModules(modulesData);
                entity.setModules(modules);
            }
            return entity;
        }
    }
    
    // Helper method to convert modules list
    private List<TrainingModule> convertModules(List<Map<String, Object>> modulesData) {
        List<TrainingModule> modules = new java.util.ArrayList<>();
        if (modulesData == null) return modules;
        
        for (Map<String, Object> moduleData : modulesData) {
            TrainingModule module = new TrainingModule();
            
            // Extract _id if present (Extended JSON format)
            String moduleId = null;
            if (moduleData.containsKey("_id")) {
                Object idObj = moduleData.get("_id");
                if (idObj instanceof Map) {
                    Map<String, Object> idMap = (Map<String, Object>) idObj;
                    if (idMap.containsKey("$oid")) {
                        moduleId = (String) idMap.get("$oid");
                    }
                } else {
                    moduleId = idObj != null ? idObj.toString() : null;
                }
            }
            
            // If module has no _id or invalid ObjectId, generate a MongoDB ObjectId
            if (moduleId == null || moduleId.isEmpty() || !ObjectId.isValid(moduleId)) {
                moduleId = new ObjectId().toHexString();
                System.out.println("[JourneyController] Generated MongoDB ObjectId for module: " + moduleId);
            }
            module.set_id(moduleId);
            
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
            if (moduleData.containsKey("sections")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> sectionsData = (List<Map<String, Object>>) moduleData.get("sections");
                List<TrainingSection> sections = convertSections(sectionsData);
                module.setSections(sections);
            }
        }
        
        return modules;
    }
    
    // Helper method to convert sections list
    private List<TrainingSection> convertSections(List<Map<String, Object>> sectionsData) {
        List<TrainingSection> sections = new java.util.ArrayList<>();
        if (sectionsData == null) return sections;
        
        for (Map<String, Object> sectionData : sectionsData) {
            TrainingSection section = new TrainingSection();
            
            // Extract _id if present (Extended JSON format)
            String sectionId = null;
            if (sectionData.containsKey("_id")) {
                Object idObj = sectionData.get("_id");
                if (idObj instanceof Map) {
                    Map<String, Object> idMap = (Map<String, Object>) idObj;
                    if (idMap.containsKey("$oid")) {
                        sectionId = (String) idMap.get("$oid");
                    }
                } else {
                    sectionId = idObj != null ? idObj.toString() : null;
                }
            }
            
            // If section has no _id or invalid ObjectId, generate a MongoDB ObjectId
            if (sectionId == null || sectionId.isEmpty() || !ObjectId.isValid(sectionId)) {
                sectionId = new ObjectId().toHexString();
                System.out.println("[JourneyController] Generated MongoDB ObjectId for section: " + sectionId);
            }
            section.set_id(sectionId);
            
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
                TrainingSection.SectionContent content = convertSectionContent(contentData);
                section.setContent(content);
            }
            
            sections.add(section);
        }
        
        return sections;
    }
    
    // Helper method to convert section content
    private TrainingSection.SectionContent convertSectionContent(Map<String, Object> contentData) {
        if (contentData == null) return null;
        
        TrainingSection.SectionContent content = new TrainingSection.SectionContent();
        
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
    private TrainingSection.SectionFile convertSectionFile(Map<String, Object> fileData) {
        if (fileData == null) return null;
        
        TrainingSection.SectionFile file = new TrainingSection.SectionFile();
        
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
    
}






