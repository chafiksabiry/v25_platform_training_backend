package com.trainingplatform.application.services;

import com.google.cloud.vertexai.VertexAI;
import com.google.cloud.vertexai.generativeai.GenerativeModel;
import com.google.cloud.vertexai.api.GenerateContentResponse;
import com.google.cloud.vertexai.generativeai.ResponseHandler;
import com.google.cloud.texttospeech.v1.*;
import com.google.protobuf.ByteString;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class VertexAIService {

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
        // Pour simplifier dans cette version, on va générer un seul fichier audio
        // Dans une version avancée, on alternerait les voix pour Alex et Sam
        return synthesizeSpeech(script, title);
    }

    /**
     * Génère une vidéo avec Veo à partir d'un prompt
     */
    public String generateVeoVideo(String title, String context) throws Exception {
        log.info("🎬 Generating Veo Video for: {}", title);

        // 1. Générer un prompt vidéo optimisé pour Veo
        String promptGenRequest = "Basé sur le contenu suivant, génère un prompt visuel détaillé et cinématique pour l'IA Veo de Google. " +
                "Le prompt doit décrire une scène de formation professionnelle de haute qualité. " +
                "Contexte : " + context + "\n" +
                "Retourne uniquement le prompt en anglais.";

        GenerateContentResponse response = generativeModel.generateContent(promptGenRequest);
        String videoPrompt = ResponseHandler.getText(response);

        log.info("📹 Veo Prompt generated: {}", videoPrompt);

        // 2. Appeler Veo (Simulé car Veo nécessite souvent une configuration de endpoint spécifique ou SDK dédié)
        // Dans une implémentation réelle, on utiliserait le client Vertex AI pour les modèles de génération vidéo
        log.info("🚀 Calling Veo model: {}", videoModelName);
        
        // Placeholder pour l'appel Veo réel
        // String videoUri = callVeoApi(videoPrompt);
        
        // Mock URL pour la démo
        return "https://storage.googleapis.com/harx-public-assets/demo-veo-video.mp4";
    }

    /**
     * Synthèse vocale de haute qualité
     */
    private String synthesizeSpeech(String text, String title) throws IOException {
        try (TextToSpeechClient textToSpeechClient = TextToSpeechClient.create()) {
            // Configurer le texte d'entrée
            SynthesisInput input = SynthesisInput.newBuilder().setText(text).build();

            // Configurer la voix (Voix Journey pour un aspect podcast premium)
            VoiceSelectionParams voice = VoiceSelectionParams.newBuilder()
                    .setLanguageCode("fr-FR")
                    .setName("fr-FR-Journey-F") // Voix Journey Premium
                    .build();

            // Configurer les paramètres audio
            AudioConfig audioConfig = AudioConfig.newBuilder()
                    .setAudioEncoding(AudioEncoding.MP3)
                    .build();

            // Effectuer la requête
            SynthesizeSpeechResponse response = textToSpeechClient.synthesizeSpeech(input, voice, audioConfig);

            // Enregistrer temporairement (ou uploader vers GCS/Cloudinary)
            ByteString audioContents = response.getAudioContent();
            String fileName = "podcast_" + UUID.randomUUID().toString() + ".mp3";
            
            // Note: Normalement on uploaderait vers Cloudinary ici
            log.info("✅ Audio synthesized successfully: {}", fileName);
            
            // Simuler une URL publique
            return "https://storage.googleapis.com/harx-training-media/" + fileName;
        }
    }
}
