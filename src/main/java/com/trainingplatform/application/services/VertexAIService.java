package com.trainingplatform.application.services;

import com.google.cloud.vertexai.VertexAI;
import com.google.cloud.vertexai.generativeai.GenerativeModel;
import com.google.cloud.vertexai.api.GenerateContentResponse;
import com.google.cloud.vertexai.generativeai.ResponseHandler;
import com.google.cloud.texttospeech.v1.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class VertexAIService {
    
    private final GCPStorageService gcpStorageService;

    @Value("${app.gcp.project-id}")
    private String projectId;

    @Value("${app.gcp.location}")
    private String location;

    @Value("${app.gcp.vertex-ai.model:gemini-1.5-flash}")
    private String modelName;

    @Value("${app.gcp.vertex-ai.video-model:veo-001}")
    private String videoModelName;

    @Value("${app.gcp.vertex-ai.podcast-model:gemini-1.5-pro}")
    private String podcastModelName;

    private VertexAI vertexAI;
    private GenerativeModel generativeModel;
    private GenerativeModel podcastModel;

    @PostConstruct
    public void init() {
        try {
            this.vertexAI = new VertexAI(projectId, location);
            this.generativeModel = new GenerativeModel(modelName, vertexAI);
            this.podcastModel = new GenerativeModel(podcastModelName, vertexAI);
            log.info("✅ Vertex AI Service initialized with project {} and location {}", projectId, location);
        } catch (Exception e) {
            log.error("❌ Failed to initialize Vertex AI Service: {}", e.getMessage());
        }
    }

    /**
     * Génère un podcast audio à partir de ressources textuelles
     */
    public String generatePodcast(String title, String contentSummary) throws Exception {
        log.info("🎙️ Generating AI Podcast for: {}", title);

        if (podcastModel == null) {
            throw new IllegalStateException("Vertex AI Podcast model is not initialized. Check GCP credentials and project configuration.");
        }

        // 1. Générer le script du podcast avec Gemini
        String scriptPrompt = "Tu es un producteur de podcasts expert. À partir du contenu suivant, génère un script de podcast court (2-3 minutes) entre deux hôtes, Alex et Sam. " +
                "Le ton doit être dynamique, informatif et engageant. Alex pose des questions et Sam est l'expert qui explique. " +
                "Contenu de la ressource : \n" + contentSummary + "\n\n" +
                "Format du script :\n" +
                "ALEX: [Texte]\n" +
                "SAM: [Texte]\n" +
                "ALEX: [Texte]\n" +
                "...";

        GenerateContentResponse response = podcastModel.generateContent(scriptPrompt);
        String script = ResponseHandler.getText(response);

        // 2. Convertir le script en audio via Vertex TTS
        return synthesizeSpeech(script, title);
    }

    /**
     * Génère une vidéo avec Veo à partir d'un prompt
     */
    public String generateVeoVideo(String title, String context) throws Exception {
        log.info("🎬 Generating Veo Video for: {}", title);

        if (generativeModel == null) {
            throw new IllegalStateException("Vertex AI generative model is not initialized. Check GCP credentials.");
        }

        // 1. Générer un prompt vidéo optimisé pour Veo
        String promptGenRequest = "Basé sur le contenu suivant, génère un prompt visuel détaillé et cinématique pour l'IA Veo de Google. " +
                "Le prompt doit décrire une scène de formation professionnelle de haute qualité. " +
                "Contexte : " + context + "\n" +
                "Retourne uniquement le prompt en anglais.";

        GenerateContentResponse response = generativeModel.generateContent(promptGenRequest);
        String videoPrompt = ResponseHandler.getText(response);

        // 2. Simuler l'appel Veo (Mock car Veo est en accès limité)
        log.info("🚀 Calling Veo API with prompt: {}", videoPrompt);

        // Simuler un délai de génération avec gestion correcte de l'interruption
        try {
            Thread.sleep(2000);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Video generation interrupted", ie);
        }

        // Mapper le résultat à une vidéo stockée sur GCS (Mock URL pour le moment)
        return "https://storage.googleapis.com/harx-training-media/mocks/veo_training_sample.mp4";
    }

    private String synthesizeSpeech(String text, String title) throws IOException {
        try (TextToSpeechClient textToSpeechClient = TextToSpeechClient.create()) {
            SynthesisInput input = SynthesisInput.newBuilder().setText(text).build();

            // Configurer la voix Journey pour un aspect podcast premium
            VoiceSelectionParams voice = VoiceSelectionParams.newBuilder()
                    .setLanguageCode("fr-FR")
                    .setName("fr-FR-Journey-F")
                    .build();

            AudioConfig audioConfig = AudioConfig.newBuilder()
                    .setAudioEncoding(AudioEncoding.MP3)
                    .build();

            SynthesizeSpeechResponse response = textToSpeechClient.synthesizeSpeech(input, voice, audioConfig);

            byte[] audioBytes = response.getAudioContent().toByteArray();
            String fileName = "podcasts/podcast_" + UUID.randomUUID().toString() + ".mp3";
            
            // Utiliser GCPStorageService pour l'upload
            return gcpStorageService.uploadBytes(audioBytes, fileName, "audio/mpeg");
        }
    }
}
