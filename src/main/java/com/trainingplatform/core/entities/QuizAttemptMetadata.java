package com.trainingplatform.core.entities;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * Metadata for tracking quiz attempt security and anti-cheat measures
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuizAttemptMetadata {
    
    /**
     * Timestamp when quiz was started (milliseconds since epoch)
     */
    private Long startTime;
    
    /**
     * Timestamp when quiz was submitted (milliseconds since epoch)
     */
    private Long endTime;
    
    /**
     * Total number of violations detected (unique questions with violations)
     */
    private Integer violationCount;
    
    /**
     * Response time for each question in milliseconds
     * Key: questionId, Value: response time in ms
     */
    private Map<String, Long> questionResponseTimes;
    
    /**
     * Types of violations detected
     * e.g. ["tab_switch", "copy", "right_click", "keyboard_shortcut"]
     */
    private List<String> violationTypes;
    
    /**
     * Detailed violation data per question
     * Key: questionId, Value: list of violation types for that question
     */
    private Map<String, List<String>> violationsByQuestion;
    
    /**
     * IP address of the user during quiz
     */
    private String ipAddress;
    
    /**
     * User agent (browser fingerprint)
     */
    private String userAgent;
    
    /**
     * Session token for this quiz attempt
     */
    private String sessionToken;
    
    /**
     * Questions that were locked (one-way navigation)
     */
    private List<String> lockedQuestions;
    
    /**
     * Total number of tab switches detected
     */
    private Integer tabSwitchCount;
    
    /**
     * Whether user attempted to use keyboard shortcuts
     */
    private Boolean keyboardShortcutAttempted;
    
    /**
     * Whether user attempted to copy/paste
     */
    private Boolean copyPasteAttempted;
    
    /**
     * Whether user attempted right-click
     */
    private Boolean rightClickAttempted;
}

