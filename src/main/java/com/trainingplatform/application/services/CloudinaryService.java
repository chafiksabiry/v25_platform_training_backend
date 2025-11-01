package com.trainingplatform.application.services;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class CloudinaryService {
    
    private final Cloudinary cloudinary;
    
    @Value("${app.cloudinary.presets.training-images}")
    private String trainingImagesPreset;
    
    @Value("${app.cloudinary.presets.training-content}")
    private String trainingContentPreset;
    
    @Value("${app.cloudinary.limits.image-size-mb}")
    private Integer imageSizeLimitMb;
    
    @Value("${app.cloudinary.limits.document-size-mb}")
    private Integer documentSizeLimitMb;
    
    @Value("${app.cloudinary.limits.video-size-mb}")
    private Integer videoSizeLimitMb;
    
    /**
     * Upload an image to Cloudinary
     */
    public CloudinaryUploadResult uploadImage(MultipartFile file, String folder) throws IOException {
        validateImage(file);
        
        Map<String, Object> params = new HashMap<>();
        params.put("folder", folder);
        params.put("upload_preset", trainingImagesPreset);
        params.put("resource_type", "image");
        // Note: Transformations are applied when retrieving URLs, not during upload
        
        return uploadFile(file, params);
    }
    
    /**
     * Upload a video to Cloudinary
     */
    public CloudinaryUploadResult uploadVideo(MultipartFile file, String folder) throws IOException {
        validateVideo(file);
        
        Map<String, Object> params = new HashMap<>();
        params.put("folder", folder);
        params.put("upload_preset", trainingContentPreset);
        params.put("resource_type", "video");
        // Note: Transformations are applied when retrieving URLs, not during upload
        
        return uploadFile(file, params);
    }
    
    /**
     * Upload a document (PDF, Word, etc.) to Cloudinary
     */
    public CloudinaryUploadResult uploadDocument(MultipartFile file, String folder) throws IOException {
        validateDocument(file);
        
        Map<String, Object> params = new HashMap<>();
        params.put("folder", folder);
        params.put("upload_preset", trainingContentPreset);
        params.put("resource_type", "raw");
        
        return uploadFile(file, params);
    }
    
    /**
     * Upload any file to Cloudinary
     */
    private CloudinaryUploadResult uploadFile(MultipartFile file, Map<String, Object> params) throws IOException {
        try {
            String publicId = UUID.randomUUID().toString();
            params.put("public_id", publicId);
            
            log.info("Uploading file to Cloudinary: {} (size: {} bytes)", file.getOriginalFilename(), file.getSize());
            
            Map uploadResult = cloudinary.uploader().upload(file.getBytes(), params);
            
            log.info("File uploaded successfully: {}", uploadResult.get("secure_url"));
            
            return CloudinaryUploadResult.builder()
                .publicId((String) uploadResult.get("public_id"))
                .url((String) uploadResult.get("secure_url"))
                .format((String) uploadResult.get("format"))
                .resourceType((String) uploadResult.get("resource_type"))
                .bytes(((Number) uploadResult.get("bytes")).longValue())
                .width(uploadResult.get("width") != null ? ((Number) uploadResult.get("width")).intValue() : null)
                .height(uploadResult.get("height") != null ? ((Number) uploadResult.get("height")).intValue() : null)
                .duration(uploadResult.get("duration") != null ? ((Number) uploadResult.get("duration")).doubleValue() : null)
                .thumbnailUrl(generateThumbnailUrl((String) uploadResult.get("public_id"), (String) uploadResult.get("resource_type")))
                .build();
                
        } catch (IOException e) {
            log.error("Error uploading file to Cloudinary: {}", e.getMessage(), e);
            throw new IOException("Failed to upload file to Cloudinary: " + e.getMessage(), e);
        }
    }
    
    /**
     * Delete a file from Cloudinary
     */
    public void deleteFile(String publicId, String resourceType) throws IOException {
        try {
            Map params = ObjectUtils.asMap("resource_type", resourceType);
            Map result = cloudinary.uploader().destroy(publicId, params);
            
            log.info("File deleted from Cloudinary: {} - Result: {}", publicId, result.get("result"));
            
        } catch (IOException e) {
            log.error("Error deleting file from Cloudinary: {}", e.getMessage(), e);
            throw new IOException("Failed to delete file from Cloudinary: " + e.getMessage(), e);
        }
    }
    
    /**
     * Generate a thumbnail URL for a video
     */
    private String generateThumbnailUrl(String publicId, String resourceType) {
        if ("video".equals(resourceType)) {
            // Generate thumbnail URL with transformation parameters
            return cloudinary.url()
                .resourceType("video")
                .format("jpg")
                .generate(publicId + ".jpg");
        }
        return null;
    }
    
    // Validation methods
    private void validateImage(MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new IOException("File is empty");
        }
        
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IOException("File is not an image");
        }
        
        long maxSize = imageSizeLimitMb * 1024L * 1024L;
        if (file.getSize() > maxSize) {
            throw new IOException("Image size exceeds limit of " + imageSizeLimitMb + "MB");
        }
    }
    
    private void validateVideo(MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new IOException("File is empty");
        }
        
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("video/")) {
            throw new IOException("File is not a video");
        }
        
        long maxSize = videoSizeLimitMb * 1024L * 1024L;
        if (file.getSize() > maxSize) {
            throw new IOException("Video size exceeds limit of " + videoSizeLimitMb + "MB");
        }
    }
    
    private void validateDocument(MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new IOException("File is empty");
        }
        
        String contentType = file.getContentType();
        if (contentType == null) {
            throw new IOException("Unknown file type");
        }
        
        // Allow PDF, Word, Excel, PowerPoint
        boolean isValidDocument = contentType.equals("application/pdf") ||
            contentType.equals("application/msword") ||
            contentType.equals("application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
            contentType.equals("application/vnd.ms-excel") ||
            contentType.equals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") ||
            contentType.equals("application/vnd.ms-powerpoint") ||
            contentType.equals("application/vnd.openxmlformats-officedocument.presentationml.presentation");
            
        if (!isValidDocument) {
            throw new IOException("File type not supported: " + contentType);
        }
        
        long maxSize = documentSizeLimitMb * 1024L * 1024L;
        if (file.getSize() > maxSize) {
            throw new IOException("Document size exceeds limit of " + documentSizeLimitMb + "MB");
        }
    }
    
    /**
     * Result object for Cloudinary uploads
     */
    public static class CloudinaryUploadResult {
        private String publicId;
        private String url;
        private String format;
        private String resourceType;
        private Long bytes;
        private Integer width;
        private Integer height;
        private Double duration;
        private String thumbnailUrl;
        
        public static CloudinaryUploadResultBuilder builder() {
            return new CloudinaryUploadResultBuilder();
        }
        
        // Getters
        public String getPublicId() { return publicId; }
        public String getUrl() { return url; }
        public String getFormat() { return format; }
        public String getResourceType() { return resourceType; }
        public Long getBytes() { return bytes; }
        public Integer getWidth() { return width; }
        public Integer getHeight() { return height; }
        public Double getDuration() { return duration; }
        public String getThumbnailUrl() { return thumbnailUrl; }
        
        // Builder
        public static class CloudinaryUploadResultBuilder {
            private String publicId;
            private String url;
            private String format;
            private String resourceType;
            private Long bytes;
            private Integer width;
            private Integer height;
            private Double duration;
            private String thumbnailUrl;
            
            public CloudinaryUploadResultBuilder publicId(String publicId) {
                this.publicId = publicId;
                return this;
            }
            
            public CloudinaryUploadResultBuilder url(String url) {
                this.url = url;
                return this;
            }
            
            public CloudinaryUploadResultBuilder format(String format) {
                this.format = format;
                return this;
            }
            
            public CloudinaryUploadResultBuilder resourceType(String resourceType) {
                this.resourceType = resourceType;
                return this;
            }
            
            public CloudinaryUploadResultBuilder bytes(Long bytes) {
                this.bytes = bytes;
                return this;
            }
            
            public CloudinaryUploadResultBuilder width(Integer width) {
                this.width = width;
                return this;
            }
            
            public CloudinaryUploadResultBuilder height(Integer height) {
                this.height = height;
                return this;
            }
            
            public CloudinaryUploadResultBuilder duration(Double duration) {
                this.duration = duration;
                return this;
            }
            
            public CloudinaryUploadResultBuilder thumbnailUrl(String thumbnailUrl) {
                this.thumbnailUrl = thumbnailUrl;
                return this;
            }
            
            public CloudinaryUploadResult build() {
                CloudinaryUploadResult result = new CloudinaryUploadResult();
                result.publicId = this.publicId;
                result.url = this.url;
                result.format = this.format;
                result.resourceType = this.resourceType;
                result.bytes = this.bytes;
                result.width = this.width;
                result.height = this.height;
                result.duration = this.duration;
                result.thumbnailUrl = this.thumbnailUrl;
                return result;
            }
        }
    }
}

