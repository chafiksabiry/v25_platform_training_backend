package com.trainingplatform.presentation.controllers;

import com.trainingplatform.application.services.CloudinaryService;
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
public class FileUploadController {

    private final CloudinaryService cloudinaryService;

    @PostMapping("/image")
    public ResponseEntity<Map<String, Object>> uploadImage(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", defaultValue = "trainings/images") String folder) {
        try {
            CloudinaryService.CloudinaryUploadResult result = cloudinaryService.uploadImage(file, folder);
            return ResponseEntity.ok(convertToMap(result));
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/video")
    public ResponseEntity<Map<String, Object>> uploadVideo(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", defaultValue = "trainings/videos") String folder) {
        try {
            CloudinaryService.CloudinaryUploadResult result = cloudinaryService.uploadVideo(file, folder);
            return ResponseEntity.ok(convertToMap(result));
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/document")
    public ResponseEntity<Map<String, Object>> uploadDocument(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", defaultValue = "trainings/documents") String folder) {
        try {
            CloudinaryService.CloudinaryUploadResult result = cloudinaryService.uploadDocument(file, folder);
            return ResponseEntity.ok(convertToMap(result));
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @DeleteMapping("/{publicId}")
    public ResponseEntity<Map<String, Object>> deleteFile(
            @PathVariable String publicId,
            @RequestParam String resourceType) {
        try {
            cloudinaryService.deleteFile(publicId, resourceType);
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "File deleted successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    private Map<String, Object> convertToMap(CloudinaryService.CloudinaryUploadResult result) {
        Map<String, Object> map = new HashMap<>();
        map.put("publicId", result.getPublicId());
        map.put("url", result.getUrl());
        map.put("secureUrl", result.getUrl());
        map.put("format", result.getFormat());
        map.put("resourceType", result.getResourceType());
        map.put("bytes", result.getBytes());
        map.put("width", result.getWidth());
        map.put("height", result.getHeight());
        map.put("duration", result.getDuration());
        map.put("thumbnailUrl", result.getThumbnailUrl());
        return map;
    }
}

