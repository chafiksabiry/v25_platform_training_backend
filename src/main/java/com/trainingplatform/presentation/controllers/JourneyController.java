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
            
            // Explicitly handle moduleIds and finalExamId (new structure)
            if (data.containsKey("moduleIds")) {
                @SuppressWarnings("unchecked")
                List<String> moduleIds = (List<String>) data.get("moduleIds");
                entity.setModuleIds(moduleIds);
                System.out.println("[JourneyController] Set moduleIds: " + moduleIds.size() + " modules");
            }
            if (data.containsKey("finalExamId")) {
                entity.setFinalExamId((String) data.get("finalExamId"));
                System.out.println("[JourneyController] Set finalExamId: " + entity.getFinalExamId());
            }
            
            // IMPORTANT: If modules array is present (old structure), IGNORE IT
            // We only use moduleIds now - modules should be stored in separate collection
            if (data.containsKey("modules")) {
                System.out.println("[JourneyController] Warning: Ignoring embedded 'modules' field - using moduleIds instead");
                // Explicitly ensure modules field is NOT set
                // (Jackson might try to set it if there's a setter, but we don't have one)
            }
            
            return entity;
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
            if (data.containsKey("moduleIds")) {
                @SuppressWarnings("unchecked")
                List<String> moduleIds = (List<String>) data.get("moduleIds");
                entity.setModuleIds(moduleIds);
            }
            if (data.containsKey("finalExamId")) {
                entity.setFinalExamId((String) data.get("finalExamId"));
            }
            
            System.err.println("⚠️ Conversion partielle - certains champs peuvent manquer: " + e.getMessage());
            return entity;
        }
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

