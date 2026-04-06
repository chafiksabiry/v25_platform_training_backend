package com.trainingplatform.application.services;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.util.UUID;

@Service
@Slf4j
public class GCPStorageService {

    private Storage storage;

    @Value("${app.upload.directory:uploads}")
    private String localUploadDir;

    @Value("${app.gcp.storage.bucket-name:harx-training-media}")
    private String bucketName;

    @PostConstruct
    public void init() {
        try {
            // Create local uploads directory if it doesn't exist
            File directory = new File(localUploadDir);
            if (!directory.exists()) {
                directory.mkdirs();
                log.info("📁 Created local upload directory: {}", localUploadDir);
            }

            this.storage = StorageOptions.getDefaultInstance().getService();
            log.info("✅ GCP Storage Service initialized with bucket: {}", bucketName);
        } catch (Exception e) {
            log.warn("⚠️ Failed to initialize GCP Storage (using local fallback): {}", e.getMessage());
        }
    }

    public String uploadFile(MultipartFile file, String folder) throws IOException {
        String originalName = file.getOriginalFilename();
        String uniqueName = UUID.randomUUID().toString() + "_" + originalName;
        String fileName = folder + "/" + uniqueName;

        try {
            if (storage != null) {
                BlobId blobId = BlobId.of(bucketName, fileName);
                BlobInfo blobInfo = BlobInfo.newBuilder(blobId)
                        .setContentType(file.getContentType())
                        .build();

                storage.create(blobInfo, file.getBytes());
                String publicUrl = String.format("https://storage.googleapis.com/%s/%s", bucketName, fileName);
                log.info("✅ Uploaded file to GCS: {}", publicUrl);
                return publicUrl;
            }
        } catch (Exception e) {
            log.warn("⚠️ GCS upload failed, falling back to local: {}", e.getMessage());
        }

        // Local Fallback
        return uploadLocal(file, uniqueName);
    }

    private String uploadLocal(MultipartFile file, String uniqueName) throws IOException {
        Path path = Paths.get(localUploadDir, uniqueName);
        Files.copy(file.getInputStream(), path, StandardCopyOption.REPLACE_EXISTING);
        
        // Relative URL that matches WebConfig resource handler
        String localUrl = "/uploads/" + uniqueName;
        log.info("📂 File saved locally: {}", localUrl);
        return localUrl;
    }

    /**
     * Upload raw bytes to GCS
     */
    public String uploadBytes(byte[] data, String fileName, String contentType) {
        if (storage == null) {
            log.error("❌ GCS storage is not initialized — cannot upload bytes for {}", fileName);
            throw new IllegalStateException("GCP Storage is not available. Check service account credentials.");
        }
        BlobId blobId = BlobId.of(bucketName, fileName);
        BlobInfo blobInfo = BlobInfo.newBuilder(blobId)
                .setContentType(contentType)
                .build();

        storage.create(blobInfo, data);
        String publicUrl = String.format("https://storage.googleapis.com/%s/%s", bucketName, fileName);
        log.info("✅ Uploaded bytes to GCS: {}", publicUrl);
        return publicUrl;
    }

    /**
     * Helper specifically for Cloudinary replacement in ManualModuleService
     */
    public GCSUploadResult uploadGeneric(MultipartFile file, String folder) throws IOException {
        String url = uploadFile(file, folder);
        return GCSUploadResult.builder()
                .url(url)
                .publicId(url) // Using URL as publicId for simplicity in migration
                .bytes(file.getSize())
                .format(getFileExtension(file.getOriginalFilename()))
                .build();
    }

    private String getFileExtension(String fileName) {
        if (fileName == null || !fileName.contains(".")) return "";
        return fileName.substring(fileName.lastIndexOf(".") + 1);
    }

    /**
     * Delete a file from GCS by its URL or publicId
     */
    public void deleteFile(String urlOrPublicId, String ignoredResourceType) {
        try {
            if (urlOrPublicId == null) return;
            String objectName = urlOrPublicId;
            // If it's a full URL, extract the path after the bucket name
            if (urlOrPublicId.contains(bucketName)) {
                objectName = urlOrPublicId.substring(urlOrPublicId.indexOf(bucketName) + bucketName.length() + 1);
            }
            BlobId blobId = BlobId.of(bucketName, objectName);
            boolean deleted = storage.delete(blobId);
            if (deleted) {
                log.info("Deleted file from GCS: {}", objectName);
            } else {
                log.warn("File not found or couldn't be deleted in GCS: {}", objectName);
            }
        } catch (Exception e) {
            log.error("Failed to delete file from GCS: {}", e.getMessage());
        }
    }

    @lombok.Builder
    @lombok.Getter
    public static class GCSUploadResult {
        private String url;
        private String publicId;
        private Long bytes;
        private String format;
        private Integer width;
        private Integer height;
        private Double duration;
        private String thumbnailUrl;
    }
}
