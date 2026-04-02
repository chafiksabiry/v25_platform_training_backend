package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.GCPStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/upload")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
@lombok.extern.slf4j.Slf4j
public class FileUploadController {

    private final GCPStorageService gcpStorageService;

    @PostMapping("/image")
    public ResponseEntity<Map<String, Object>> uploadImage(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", defaultValue = "trainings/images") String folder) {
        try {
            GCPStorageService.GCSUploadResult result = gcpStorageService.uploadGeneric(file, folder);
            return ResponseEntity.ok(convertToMap(result));
        } catch (Exception e) {
            log.error("Image upload failed: {}", e.getMessage(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Image upload failed: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/video")
    public ResponseEntity<Map<String, Object>> uploadVideo(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", defaultValue = "trainings/videos") String folder) {
        try {
            GCPStorageService.GCSUploadResult result = gcpStorageService.uploadGeneric(file, folder);
            return ResponseEntity.ok(convertToMap(result));
        } catch (Exception e) {
            log.error("Video upload failed: {}", e.getMessage(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Video upload failed: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/document")
    public ResponseEntity<Map<String, Object>> uploadDocument(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", defaultValue = "trainings/documents") String folder) {
        try {
            GCPStorageService.GCSUploadResult result = gcpStorageService.uploadGeneric(file, folder);
            return ResponseEntity.ok(convertToMap(result));
        } catch (Exception e) {
            log.error("Document upload failed: {}", e.getMessage(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Document upload failed: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @DeleteMapping("/{publicId}")
    public ResponseEntity<Map<String, Object>> deleteFile(
            @PathVariable String publicId,
            @RequestParam String resourceType) {
        try {
            gcpStorageService.deleteFile(publicId, resourceType);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "File deleted successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Delete file failed: {}", e.getMessage(), e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Delete failed: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    private Map<String, Object> convertToMap(GCPStorageService.GCSUploadResult result) {
        Map<String, Object> map = new HashMap<>();
        map.put("publicId", result.getPublicId());
        map.put("url", result.getUrl());
        map.put("secureUrl", result.getUrl());
        map.put("format", result.getFormat());
        map.put("resourceType", "auto");
        map.put("bytes", result.getBytes());
        map.put("width", result.getWidth() != null ? result.getWidth() : 0);
        map.put("height", result.getHeight() != null ? result.getHeight() : 0);
        map.put("duration", result.getDuration() != null ? result.getDuration() : 0.0);
        map.put("thumbnailUrl", result.getThumbnailUrl() != null ? result.getThumbnailUrl() : result.getUrl());
        return map;
    }
}

