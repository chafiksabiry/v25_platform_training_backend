package com.trainingplatform.application.services;

import com.trainingplatform.domain.entities.TrainingJourneyEntity;
import com.trainingplatform.domain.entities.GigEntity;
import com.trainingplatform.domain.repositories.TrainingJourneyRepository;
import com.trainingplatform.domain.repositories.GigRepository;
import com.trainingplatform.core.entities.RepProgress;
import com.trainingplatform.core.entities.Rep;
import com.trainingplatform.core.entities.TrainingModule;
import com.trainingplatform.application.services.TrainingModuleService;
import com.trainingplatform.infrastructure.repositories.RepProgressRepository;
import com.trainingplatform.infrastructure.repositories.RepRepository;
import java.util.Optional;
import com.trainingplatform.presentation.dtos.TrainerDashboardDTO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class TrainingJourneyService {
    
    @Autowired
    private TrainingJourneyRepository journeyRepository;
    
    @Autowired
    private GigRepository gigRepository;
    
    @Autowired
    private RepProgressRepository repProgressRepository;
    
    @Autowired
    private RepRepository repRepository;
    
    @Autowired
    private TrainingModuleService moduleService;
    
    /**
     * Create or update a training journey
     */
    public TrainingJourneyEntity saveJourney(TrainingJourneyEntity journey) {
        if (journey.getId() == null) {
            journey.setCreatedAt(LocalDateTime.now());
        }
        journey.setUpdatedAt(LocalDateTime.now());
        
        return journeyRepository.save(journey);
    }
    
    /**
     * Launch a training journey
     */
    public TrainingJourneyEntity launchJourney(TrainingJourneyEntity journey, List<String> enrolledRepIds) {
        journey.setStatus("active");
        journey.setEnrolledRepIds(enrolledRepIds);
        journey.setLaunchDate(LocalDateTime.now());
        journey.setUpdatedAt(LocalDateTime.now());
        
        return journeyRepository.save(journey);
    }
    
    /**
     * Get a journey by ID
     */
    public Optional<TrainingJourneyEntity> getJourneyById(String id) {
        return journeyRepository.findById(id);
    }
    
    /**
     * Get all journeys
     */
    public List<TrainingJourneyEntity> getAllJourneys() {
        return journeyRepository.findAll();
    }
    
    /**
     * Get journeys by status
     */
    public List<TrainingJourneyEntity> getJourneysByStatus(String status) {
        return journeyRepository.findByStatus(status);
    }
    
    /**
     * Get journeys by industry
     */
    public List<TrainingJourneyEntity> getJourneysByIndustry(String industry) {
        return journeyRepository.findByIndustry(industry);
    }
    
    /**
     * Get journeys for a specific rep
     */
    public List<TrainingJourneyEntity> getJourneysForRep(String repId) {
        return journeyRepository.findByEnrolledRepIdsContaining(repId);
    }
    
    /**
     * Delete a journey
     */
    public void deleteJourney(String id) {
        journeyRepository.deleteById(id);
    }
    
    /**
     * Archive a journey (soft delete)
     */
    public TrainingJourneyEntity archiveJourney(String id) {
        Optional<TrainingJourneyEntity> journeyOpt = journeyRepository.findById(id);
        if (journeyOpt.isPresent()) {
            TrainingJourneyEntity journey = journeyOpt.get();
            journey.setStatus("archived");
            journey.setUpdatedAt(LocalDateTime.now());
            return journeyRepository.save(journey);
        }
        return null;
    }
    
    /**
     * Get journeys by company ID and optionally by gig ID
     * Populates gig title information
     */
    public List<TrainingJourneyEntity> getJourneysByCompanyAndGig(String companyId, String gigId) {
        System.out.println("[TrainerDashboard] getJourneysByCompanyAndGig - companyId: " + companyId + ", gigId: " + gigId);
        
        List<TrainingJourneyEntity> journeys;
        if (gigId != null && !gigId.isEmpty()) {
            System.out.println("[TrainerDashboard] Searching by companyId AND gigId");
            journeys = journeyRepository.findByCompanyIdAndGigId(companyId, gigId);
        } else {
            System.out.println("[TrainerDashboard] Searching by companyId only");
            journeys = journeyRepository.findByCompanyId(companyId);
        }
        
        System.out.println("[TrainerDashboard] Found " + journeys.size() + " journeys");
        
        // Populate gig titles
        for (TrainingJourneyEntity journey : journeys) {
            if (journey.getGigId() != null && !journey.getGigId().isEmpty()) {
                Optional<GigEntity> gigOpt = gigRepository.findById(journey.getGigId());
                if (gigOpt.isPresent()) {
                    GigEntity gig = gigOpt.get();
                    // Store gig title in a custom field or use reflection to add it
                    // Since we can't modify the entity easily, we'll use a Map approach in the controller
                    System.out.println("[TrainerDashboard] Found gig: " + gig.getTitle() + " for journey: " + journey.getId());
                } else {
                    System.out.println("[TrainerDashboard] Gig not found for ID: " + journey.getGigId());
                }
            }
            System.out.println("[TrainerDashboard] Journey: " + journey.getId() + " - " + journey.getTitle() + 
                             " (companyId: " + journey.getCompanyId() + ", gigId: " + journey.getGigId() + ")");
        }
        
        return journeys;
    }
    
    /**
     * Get trainer dashboard statistics
     */
    public TrainerDashboardDTO getTrainerDashboard(String companyId, String gigId) {
        System.out.println("[TrainerDashboard] Getting dashboard for companyId: " + companyId + ", gigId: " + gigId);
        
        // Get all journeys for this company/gig
        List<TrainingJourneyEntity> journeys = getJourneysByCompanyAndGig(companyId, gigId);
        System.out.println("[TrainerDashboard] Found " + journeys.size() + " journeys");
        
        // Collect all unique enrolled rep IDs
        Set<String> enrolledRepIds = new HashSet<>();
        for (TrainingJourneyEntity journey : journeys) {
            System.out.println("[TrainerDashboard] Journey ID: " + journey.getId() + ", Title: " + journey.getTitle());
            System.out.println("[TrainerDashboard] Journey status: " + journey.getStatus());
            System.out.println("[TrainerDashboard] Journey companyId: " + journey.getCompanyId() + ", gigId: " + journey.getGigId());
            
            if (journey.getEnrolledRepIds() != null && !journey.getEnrolledRepIds().isEmpty()) {
                System.out.println("[TrainerDashboard] EnrolledRepIds (" + journey.getEnrolledRepIds().size() + "): " + journey.getEnrolledRepIds());
                enrolledRepIds.addAll(journey.getEnrolledRepIds());
            } else {
                System.out.println("[TrainerDashboard] ⚠️ Journey has no enrolledRepIds (null or empty)");
            }
        }
        
        System.out.println("[TrainerDashboard] Total unique enrolledRepIds collected: " + enrolledRepIds.size());
        
        TrainerDashboardDTO dashboard = new TrainerDashboardDTO();
        
        // If no enrolledRepIds, return dashboard with journey info only
        if (enrolledRepIds.isEmpty()) {
            System.out.println("[TrainerDashboard] No enrolledRepIds found. Returning dashboard with journey statistics only.");
            dashboard.setTotalTrainees(0);
            dashboard.setActiveTrainees(0);
            dashboard.setCompletionRate(0.0);
            dashboard.setAverageEngagement(0.0);
            dashboard.setTopPerformers(new ArrayList<>());
            dashboard.setStrugglingTrainees(new ArrayList<>());
            dashboard.setUpcomingDeadlines(new ArrayList<>());
            
            // Generate AI insights based on journeys only
            List<TrainerDashboardDTO.AIInsight> insights = new ArrayList<>();
            if (journeys.isEmpty()) {
                TrainerDashboardDTO.AIInsight insight = new TrainerDashboardDTO.AIInsight();
                insight.setId("insight-no-journeys");
                insight.setTitle("No Training Journeys");
                insight.setDescription("No training journeys found for this company/gig. Create a new journey to get started.");
                insight.setPriority("medium");
                insight.setSuggestedActions(Arrays.asList(
                    "Create a new training journey",
                    "Check if the company ID and gig ID are correct"
                ));
                insights.add(insight);
            } else {
                TrainerDashboardDTO.AIInsight insight = new TrainerDashboardDTO.AIInsight();
                insight.setId("insight-no-trainees");
                insight.setTitle("No Trainees Enrolled");
                insight.setDescription("You have " + journeys.size() + " journey(s) but no trainees are enrolled yet. Launch a journey with enrolled reps to start tracking progress.");
                insight.setPriority("low");
                insight.setSuggestedActions(Arrays.asList(
                    "Launch a journey and enroll trainees",
                    "Check journey enrollment settings"
                ));
                insights.add(insight);
            }
            dashboard.setAiInsights(insights);
            return dashboard;
        }
        
        dashboard.setTotalTrainees(0); // Will be updated later with actual valid rep count
        
        // Get all rep progress for these journeys
        Map<String, List<RepProgress>> repProgressMap = new HashMap<>();
        Map<String, Rep> repMap = new HashMap<>();
        
        int totalEngagement = 0;
        int activeCount = 0;
        int completedCount = 0;
        
        List<TrainerDashboardDTO.TraineeInfo> allTrainees = new ArrayList<>();
        
        for (String repId : enrolledRepIds) {
            if (repId == null || repId.trim().isEmpty()) {
                System.out.println("[TrainerDashboard] Warning: Empty repId found, skipping");
                continue;
            }
            
            // Get rep info - skip if rep doesn't exist
            Optional<Rep> repOpt = repRepository.findById(repId);
            if (!repOpt.isPresent()) {
                System.out.println("[TrainerDashboard] Warning: Rep not found for ID: " + repId);
                continue;
            }
            
            Rep rep = repOpt.get();
            if (rep == null) {
                System.out.println("[TrainerDashboard] Warning: Rep is null for ID: " + repId);
                continue;
            }
            repMap.put(repId, rep);
            System.out.println("[TrainerDashboard] Found Rep: " + rep.getName() + " (ID: " + repId + ")");
            
            // Get progress for all journeys
            List<RepProgress> progressList = new ArrayList<>();
            for (TrainingJourneyEntity journey : journeys) {
                List<RepProgress> journeyProgress = repProgressRepository.findByRepIdAndJourneyId(repId, journey.getId());
                progressList.addAll(journeyProgress);
            }
            repProgressMap.put(repId, progressList);
            
            // Calculate metrics for this rep
            double avgProgress = 0;
            double avgEngagement = 0;
            boolean isActive = false;
            boolean isCompleted = false;
            
            if (!progressList.isEmpty()) {
                avgProgress = progressList.stream()
                    .mapToInt(RepProgress::getProgress)
                    .average()
                    .orElse(0.0);
                
                avgEngagement = progressList.stream()
                    .mapToInt(RepProgress::getEngagementScore)
                    .average()
                    .orElse(0.0);
                
                isActive = progressList.stream()
                    .anyMatch(p -> "in-progress".equals(p.getStatus()));
                
                isCompleted = progressList.stream()
                    .allMatch(p -> "completed".equals(p.getStatus()) || p.getProgress() >= 100);
            }
            
            if (isActive) activeCount++;
            if (isCompleted) completedCount++;
            
            totalEngagement += avgEngagement;
            
            // Create trainee info
            TrainerDashboardDTO.TraineeInfo traineeInfo = new TrainerDashboardDTO.TraineeInfo();
            traineeInfo.setId(repId);
            traineeInfo.setName(rep.getName() != null ? rep.getName() : "Unknown");
            traineeInfo.setEmail(rep.getEmail() != null ? rep.getEmail() : "");
            traineeInfo.setDepartment(rep.getDepartment() != null ? rep.getDepartment() : "Unknown");
            traineeInfo.setProgress(avgProgress);
            traineeInfo.setEngagement(avgEngagement);
            
            // Get last active time
            Optional<RepProgress> lastActive = progressList.stream()
                .filter(p -> p.getLastAccessed() != null)
                .max(Comparator.comparing(RepProgress::getLastAccessed));
            
            if (lastActive.isPresent()) {
                LocalDateTime lastAccess = lastActive.get().getLastAccessed();
                long hoursAgo = java.time.Duration.between(lastAccess, LocalDateTime.now()).toHours();
                traineeInfo.setLastActive(hoursAgo + " hours ago");
            } else {
                traineeInfo.setLastActive("Never");
            }
            
            allTrainees.add(traineeInfo);
        }
        
        // Calculate averages - only count reps that actually exist
        int validRepCount = repMap.size();
        if (validRepCount > 0) {
            dashboard.setCompletionRate((double) completedCount / validRepCount * 100);
            dashboard.setAverageEngagement(totalEngagement / validRepCount);
        } else {
            dashboard.setCompletionRate(0);
            dashboard.setAverageEngagement(0);
        }
        
        dashboard.setActiveTrainees(activeCount);
        dashboard.setTotalTrainees(validRepCount); // Update total to only count valid reps
        
        // Sort and get top performers (by progress and engagement)
        List<TrainerDashboardDTO.TraineeInfo> topPerformers = allTrainees.stream()
            .sorted((a, b) -> Double.compare(
                (b.getProgress() + b.getEngagement()) / 2,
                (a.getProgress() + a.getEngagement()) / 2
            ))
            .limit(5)
            .collect(Collectors.toList());
        dashboard.setTopPerformers(topPerformers);
        
        // Get struggling trainees (low progress or low engagement)
        List<TrainerDashboardDTO.TraineeInfo> strugglingTrainees = allTrainees.stream()
            .filter(t -> t.getProgress() < 50 || t.getEngagement() < 50)
            .sorted((a, b) -> Double.compare(
                (a.getProgress() + a.getEngagement()) / 2,
                (b.getProgress() + b.getEngagement()) / 2
            ))
            .limit(5)
            .collect(Collectors.toList());
        dashboard.setStrugglingTrainees(strugglingTrainees);
        
        // Generate AI insights
        List<TrainerDashboardDTO.AIInsight> insights = new ArrayList<>();
        
        if (dashboard.getCompletionRate() < 50) {
            TrainerDashboardDTO.AIInsight insight = new TrainerDashboardDTO.AIInsight();
            insight.setId("insight-1");
            insight.setTitle("Low Completion Rate");
            insight.setDescription("The overall completion rate is below 50%. Consider providing additional support or adjusting the training pace.");
            insight.setPriority("high");
            insight.setSuggestedActions(Arrays.asList(
                "Send reminder messages to inactive trainees",
                "Schedule one-on-one check-ins with struggling trainees",
                "Review and simplify complex modules"
            ));
            insights.add(insight);
        }
        
        if (repMap.size() > 0 && strugglingTrainees.size() > repMap.size() * 0.3) {
            TrainerDashboardDTO.AIInsight insight = new TrainerDashboardDTO.AIInsight();
            insight.setId("insight-2");
            insight.setTitle("High Number of Struggling Trainees");
            insight.setDescription("More than 30% of trainees are struggling. Consider providing additional resources or adjusting the curriculum.");
            insight.setPriority("medium");
            insight.setSuggestedActions(Arrays.asList(
                "Create additional practice exercises",
                "Provide video tutorials for complex topics",
                "Organize group study sessions"
            ));
            insights.add(insight);
        }
        
        dashboard.setAiInsights(insights);
        
        // Generate upcoming deadlines (mock for now - can be enhanced with actual deadline data)
        List<TrainerDashboardDTO.DeadlineInfo> deadlines = new ArrayList<>();
        if (!repMap.isEmpty() && !journeys.isEmpty()) {
            String firstRepId = repMap.keySet().iterator().next();
            Rep firstRep = repMap.get(firstRepId);
            
            for (TrainingJourneyEntity journey : journeys) {
                if (journey.getModuleIds() != null && !journey.getModuleIds().isEmpty() && firstRep != null) {
                    List<TrainingModule> modules = moduleService.getModulesByTrainingJourney(journey.getId());
                    for (int i = 0; i < Math.min(modules.size(), 3); i++) {
                        TrainerDashboardDTO.DeadlineInfo deadline = new TrainerDashboardDTO.DeadlineInfo();
                        deadline.setTraineeId(firstRepId);
                        deadline.setTraineeName(firstRep.getName() != null ? firstRep.getName() : "Unknown");
                        deadline.setTask("Complete Module: " + modules.get(i).getTitle());
                        deadline.setDueDate(LocalDateTime.now().plusDays(7).format(DateTimeFormatter.ofPattern("MMM dd, yyyy")));
                        deadline.setRiskLevel("medium");
                        deadlines.add(deadline);
                    }
                }
            }
        }
        dashboard.setUpcomingDeadlines(deadlines);
        
        return dashboard;
    }
}

