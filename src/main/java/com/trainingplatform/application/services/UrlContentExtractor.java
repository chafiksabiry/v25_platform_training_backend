package com.trainingplatform.application.services;

import okhttp3.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class UrlContentExtractor {
    
    @Autowired(required = false)
    private AIService aiService;
    
    private final OkHttpClient httpClient;
    
    public UrlContentExtractor() {
        this.httpClient = new OkHttpClient.Builder()
            .followRedirects(true)
            .build();
    }
    
    /**
     * Extract content from a URL (YouTube or HTML page)
     */
    public String extractContentFromUrl(String url) throws IOException {
        if (isYouTubeUrl(url)) {
            return extractYouTubeContent(url);
        } else {
            return extractHtmlContent(url);
        }
    }
    
    /**
     * Check if URL is a YouTube link
     */
    private boolean isYouTubeUrl(String url) {
        return url.contains("youtube.com") || url.contains("youtu.be");
    }
    
    /**
     * Extract YouTube video ID from URL
     */
    private String extractYouTubeVideoId(String url) {
        String videoId = null;
        
        // Pattern for youtube.com/watch?v=VIDEO_ID
        Pattern pattern1 = Pattern.compile("(?:youtube\\.com/watch\\?v=)([a-zA-Z0-9_-]+)");
        Matcher matcher1 = pattern1.matcher(url);
        if (matcher1.find()) {
            videoId = matcher1.group(1);
        }
        
        // Pattern for youtu.be/VIDEO_ID
        Pattern pattern2 = Pattern.compile("(?:youtu\\.be/)([a-zA-Z0-9_-]+)");
        Matcher matcher2 = pattern2.matcher(url);
        if (matcher2.find()) {
            videoId = matcher2.group(1);
        }
        
        return videoId;
    }
    
    /**
     * Extract content from YouTube video (transcript/subtitles)
     */
    private String extractYouTubeContent(String url) throws IOException {
        System.out.println("🎥 Extracting content from YouTube: " + url);
        
        String videoId = extractYouTubeVideoId(url);
        if (videoId == null) {
            throw new IllegalArgumentException("Invalid YouTube URL");
        }
        
        System.out.println("📹 YouTube Video ID: " + videoId);
        
        // Method 1: Try to get transcript/subtitles (fast, no download)
        try {
            String transcript = fetchYouTubeTranscript(videoId);
            if (transcript != null && !transcript.isEmpty()) {
                System.out.println("✅ YouTube transcript extracted successfully");
                return transcript;
            }
        } catch (Exception e) {
            System.err.println("⚠️ Failed to extract YouTube transcript: " + e.getMessage());
        }
        
        // Method 2: Download audio and transcribe with Whisper (slower but comprehensive)
        System.out.println("🔄 Attempting to download and transcribe YouTube audio...");
        try {
            String audioTranscript = downloadAndTranscribeYouTubeAudio(videoId, url);
            if (audioTranscript != null && !audioTranscript.isEmpty()) {
                System.out.println("✅ YouTube audio transcribed successfully");
                return audioTranscript;
            }
        } catch (Exception e) {
            System.err.println("⚠️ Audio download/transcription failed: " + e.getMessage());
            e.printStackTrace();
        }
        
        // Fallback: Get video metadata only
        System.out.println("⚠️ Using fallback: metadata only");
        return fetchYouTubeMetadata(videoId, url);
    }
    
    /**
     * Download YouTube audio and transcribe it with Whisper
     */
    private String downloadAndTranscribeYouTubeAudio(String videoId, String url) throws Exception {
        if (aiService == null) {
            System.err.println("⚠️ AIService not available for transcription");
            return null;
        }
        
        System.out.println("📥 Downloading YouTube audio: " + videoId);
        
        // Use yt-dlp to download audio
        // Note: yt-dlp must be installed on the system
        // Install: pip install yt-dlp  OR  download binary from GitHub
        
        try {
            // Create temp directory for downloads
            java.nio.file.Path tempDir = java.nio.file.Files.createTempDirectory("youtube_audio_");
            String outputPath = tempDir.toString() + "/" + videoId + ".mp3";
            
            // Build yt-dlp command
            // Downloads best audio quality and converts to MP3
            ProcessBuilder processBuilder = new ProcessBuilder(
                "yt-dlp",
                "-x",  // Extract audio only
                "--audio-format", "mp3",  // Convert to MP3
                "--audio-quality", "0",  // Best quality
                "-o", outputPath,  // Output path
                "--no-playlist",  // Don't download playlists
                "--max-filesize", "100M",  // Limit file size
                url
            );
            
            processBuilder.redirectErrorStream(true);
            Process process = processBuilder.start();
            
            // Read output
            java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(process.getInputStream())
            );
            
            StringBuilder output = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
                System.out.println("yt-dlp: " + line);
            }
            
            int exitCode = process.waitFor();
            
            if (exitCode == 0) {
                // Audio downloaded successfully
                java.io.File audioFile = new java.io.File(outputPath);
                
                if (audioFile.exists()) {
                    System.out.println("✅ Audio downloaded: " + audioFile.length() + " bytes");
                    
                    // Create MultipartFile from the downloaded file
                    byte[] audioBytes = java.nio.file.Files.readAllBytes(audioFile.toPath());
                    
                    // Create a temporary MultipartFile
                    org.springframework.web.multipart.MultipartFile multipartFile = 
                        new org.springframework.mock.web.MockMultipartFile(
                            "file",
                            videoId + ".mp3",
                            "audio/mpeg",
                            audioBytes
                        );
                    
                    // Transcribe with Whisper
                    System.out.println("🎤 Transcribing audio with Whisper...");
                    String transcript = aiService.transcribeAudio(multipartFile);
                    
                    // Cleanup
                    audioFile.delete();
                    tempDir.toFile().delete();
                    
                    return transcript;
                } else {
                    System.err.println("❌ Audio file not found after download");
                }
            } else {
                System.err.println("❌ yt-dlp failed with exit code: " + exitCode);
                System.err.println("Output: " + output.toString());
            }
            
        } catch (java.io.IOException e) {
            // yt-dlp not installed or not in PATH
            System.err.println("⚠️ yt-dlp not available. To enable YouTube audio download:");
            System.err.println("   Install yt-dlp: pip install yt-dlp");
            System.err.println("   Or download from: https://github.com/yt-dlp/yt-dlp");
            throw e;
        }
        
        return null;
    }
    
    /**
     * Fetch YouTube transcript using YouTube's API or web scraping
     */
    private String fetchYouTubeTranscript(String videoId) throws IOException {
        // Try multiple methods to get transcripts
        
        // Method 1: Try to get auto-generated English captions
        String[] captionFormats = {
            "https://www.youtube.com/api/timedtext?v=%s&lang=en&fmt=srv3",
            "https://www.youtube.com/api/timedtext?v=%s&lang=en&fmt=vtt",
            "https://www.youtube.com/api/timedtext?v=%s&lang=en&kind=asr&fmt=srv3",
            "https://www.youtube.com/api/timedtext?v=%s&lang=en-US&fmt=srv3"
        };
        
        for (String urlFormat : captionFormats) {
            try {
                String transcriptUrl = String.format(urlFormat, videoId);
                
                Request request = new Request.Builder()
                    .url(transcriptUrl)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    .build();
                
                try (Response response = httpClient.newCall(request).execute()) {
                    if (response.isSuccessful() && response.body() != null) {
                        String content = response.body().string();
                        
                        if (content.length() > 50) { // Check if we got actual content
                            // Parse XML/VTT to extract text
                            Document doc = Jsoup.parse(content, "", org.jsoup.parser.Parser.xmlParser());
                            String transcript = doc.select("text").stream()
                                .map(element -> element.text())
                                .reduce("", (a, b) -> a + " " + b);
                            
                            if (!transcript.trim().isEmpty()) {
                                System.out.println("✅ YouTube transcript extracted via: " + urlFormat);
                                return transcript;
                            }
                        }
                    }
                }
            } catch (Exception e) {
                // Try next method
                continue;
            }
        }
        
        System.err.println("⚠️ All transcript extraction methods failed for video: " + videoId);
        return null;
    }
    
    /**
     * Fetch YouTube video metadata as fallback
     */
    private String fetchYouTubeMetadata(String videoId, String originalUrl) throws IOException {
        System.out.println("⚠️ Using fallback: YouTube metadata extraction");
        
        try {
            // Fetch the YouTube page
            Request request = new Request.Builder()
                .url("https://www.youtube.com/watch?v=" + videoId)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .header("Accept-Language", "en-US,en;q=0.9")
                .build();
            
            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful() && response.body() != null) {
                    String html = response.body().string();
                    Document doc = Jsoup.parse(html);
                    
                    // Extract multiple metadata fields
                    String title = doc.select("meta[name=title]").attr("content");
                    if (title.isEmpty()) {
                        title = doc.select("meta[property=og:title]").attr("content");
                    }
                    
                    String description = doc.select("meta[name=description]").attr("content");
                    if (description.isEmpty()) {
                        description = doc.select("meta[property=og:description]").attr("content");
                    }
                    
                    // Try to extract keywords
                    String keywords = doc.select("meta[name=keywords]").attr("content");
                    
                    // Try to extract channel/author
                    String channel = doc.select("link[itemprop=name]").attr("content");
                    if (channel.isEmpty()) {
                        channel = doc.select("meta[name=author]").attr("content");
                    }
                    
                    if (!title.isEmpty() || !description.isEmpty()) {
                        StringBuilder content = new StringBuilder();
                        content.append("YouTube Video Content Analysis\n\n");
                        content.append(String.format("🎥 Video: %s\n", originalUrl));
                        content.append(String.format("📹 Video ID: %s\n\n", videoId));
                        
                        if (!title.isEmpty()) {
                            content.append(String.format("📌 Title: %s\n\n", title));
                        }
                        
                        if (!channel.isEmpty()) {
                            content.append(String.format("👤 Channel: %s\n\n", channel));
                        }
                        
                        if (!description.isEmpty()) {
                            content.append("📄 Description:\n");
                            content.append(description);
                            content.append("\n\n");
                        }
                        
                        if (!keywords.isEmpty()) {
                            content.append("🏷️ Tags/Keywords:\n");
                            content.append(keywords);
                            content.append("\n\n");
                        }
                        
                        content.append("⚠️ Note: This analysis is based on video metadata only.\n");
                        content.append("The video transcript/captions were not accessible.\n");
                        content.append("For more accurate training content generation, consider:\n");
                        content.append("- Enabling captions/subtitles on the video\n");
                        content.append("- Providing a manual transcript\n");
                        content.append("- Using videos with auto-generated captions\n");
                        
                        return content.toString();
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("⚠️ Metadata extraction failed: " + e.getMessage());
            e.printStackTrace();
        }
        
        // Ultimate fallback
        return String.format("""
            YouTube Video
            
            Video ID: %s
            URL: %s
            
            ⚠️ Unable to extract transcript or detailed metadata from this video.
            
            This may be because:
            - The video does not have captions/subtitles enabled
            - The video has region restrictions
            - The video is private or age-restricted
            
            To generate training content from this video, please:
            1. Ensure the video has captions enabled
            2. Or manually provide the video transcript
            3. Or upload the video/audio file directly for transcription
            """, videoId, originalUrl);
    }
    
    /**
     * Extract text content from HTML page
     */
    private String extractHtmlContent(String url) throws IOException {
        System.out.println("🌐 Extracting content from webpage: " + url);
        
        Request request = new Request.Builder()
            .url(url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .build();
        
        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("Failed to fetch URL: " + response.code());
            }
            
            if (response.body() == null) {
                throw new IOException("Empty response body");
            }
            
            String html = response.body().string();
            Document doc = Jsoup.parse(html);
            
            // Remove script and style elements
            doc.select("script, style, nav, header, footer, aside").remove();
            
            // Extract title
            String title = doc.title();
            
            // Extract main content
            String content = doc.body().text();
            
            // Clean up whitespace
            content = content.replaceAll("\\s+", " ").trim();
            
            System.out.println("✅ Webpage content extracted: " + content.length() + " characters");
            
            return String.format("""
                Web Page Content
                
                URL: %s
                Title: %s
                
                Content:
                %s
                """, url, title, content);
        }
    }
}

