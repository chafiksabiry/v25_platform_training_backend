package com.trainingplatform.application.services;

import com.trainingplatform.domain.entities.TrainingJourneyEntity;
import com.trainingplatform.domain.repositories.TrainingJourneyRepository;
import com.trainingplatform.core.entities.RepProgress;
import com.trainingplatform.core.entities.Rep;
import com.trainingplatform.infrastructure.repositories.RepProgressRepository;
import com.trainingplatform.infrastructure.repositories.RepRepository;
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
    private RepProgressRepository repProgressRepository;
    
    @Autowired
    private RepRepository repRepository;
    
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
     */
    public List<TrainingJourneyEntity> getJourneysByCompanyAndGig(String companyId, String gigId) {
        if (gigId != null && !gigId.isEmpty()) {
            return journeyRepository.findByCompanyIdAndGigId(companyId, gigId);
        } else {
            return journeyRepository.findByCompanyId(companyId);
        }
    }
    
    /**
     * Get trainer dashboard statistics
     */
    public TrainerDashboardDTO getTrainerDashboard(String companyId, String gigId) {
        // Get all journeys for this company/gig
        List<TrainingJourneyEntity> journeys = getJourneysByCompanyAndGig(companyId, gigId);
        
        // Collect all unique enrolled rep IDs
        Set<String> enrolledRepIds = new HashSet<>();
        for (TrainingJourneyEntity journey : journeys) {
            if (journey.getEnrolledRepIds() != null) {
                enrolledRepIds.addAll(journey.getEnrolledRepIds());
            }
        }
        
        TrainerDashboardDTO dashboard = new TrainerDashboardDTO();
        dashboard.setTotalTrainees(enrolledRepIds.size());
        
        // Get all rep progress for these journeys
        Map<String, List<RepProgress>> repProgressMap = new HashMap<>();
        Map<String, Rep> repMap = new HashMap<>();
        
        int totalProgress = 0;
        int totalEngagement = 0;
        int activeCount = 0;
        int completedCount = 0;
        
        List<TrainerDashboardDTO.TraineeInfo> allTrainees = new ArrayList<>();
        
        for (String repId : enrolledRepIds) {
            // Get rep info
            Optional<Rep> repOpt = repRepository.findById(repId);
            if (!repOpt.isPresent()) continue;
            
            Rep rep = repOpt.get();
            repMap.put(repId, rep);
            
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
            traineeInfo.setName(rep.getName());
            traineeInfo.setEmail(rep.getEmail());
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
        
        // Calculate averages
        if (!enrolledRepIds.isEmpty()) {
            dashboard.setCompletionRate((double) completedCount / enrolledRepIds.size() * 100);
            dashboard.setAverageEngagement(totalEngagement / enrolledRepIds.size());
        } else {
            dashboard.setCompletionRate(0);
            dashboard.setAverageEngagement(0);
        }
        
        dashboard.setActiveTrainees(activeCount);
        
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
        
        if (strugglingTrainees.size() > enrolledRepIds.size() * 0.3) {
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
        for (TrainingJourneyEntity journey : journeys) {
            if (journey.getModules() != null) {
                for (int i = 0; i < Math.min(journey.getModules().size(), 3); i++) {
                    TrainerDashboardDTO.DeadlineInfo deadline = new TrainerDashboardDTO.DeadlineInfo();
                    deadline.setTraineeId(enrolledRepIds.iterator().next());
                    deadline.setTraineeName(repMap.get(enrolledRepIds.iterator().next()).getName());
                    deadline.setTask("Complete Module: " + journey.getModules().get(i).getTitle());
                    deadline.setDueDate(LocalDateTime.now().plusDays(7).format(DateTimeFormatter.ofPattern("MMM dd, yyyy")));
                    deadline.setRiskLevel("medium");
                    deadlines.add(deadline);
                }
            }
        }
        dashboard.setUpcomingDeadlines(deadlines);
        
        return dashboard;
    }
}

