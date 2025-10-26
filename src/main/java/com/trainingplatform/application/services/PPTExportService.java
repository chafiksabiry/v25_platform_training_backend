package com.trainingplatform.application.services;

import org.apache.poi.sl.usermodel.PictureData;
import org.apache.poi.xslf.usermodel.*;
import org.springframework.stereotype.Service;

import java.awt.*;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.List;
import java.util.Map;

@Service
public class PPTExportService {
    
    /**
     * Génère un PowerPoint à partir d'un curriculum de formation
     */
    public byte[] generatePowerPoint(Map<String, Object> curriculum) throws IOException {
        XMLSlideShow ppt = new XMLSlideShow();
        
        // 1. SLIDE DE TITRE
        createTitleSlide(ppt, curriculum);
        
        // 2. SLIDE OVERVIEW
        createOverviewSlide(ppt, curriculum);
        
        // 3. SLIDES DES MODULES
        List<Map<String, Object>> modules = (List<Map<String, Object>>) curriculum.getOrDefault("modules", List.of());
        for (int i = 0; i < modules.size(); i++) {
            Map<String, Object> module = modules.get(i);
            
            // Slide d'introduction du module
            createModuleIntroSlide(ppt, module, i + 1);
            
            // Slide des objectifs d'apprentissage
            createLearningObjectivesSlide(ppt, module);
            
            // Slide du contenu principal
            createContentSlide(ppt, module);
        }
        
        // 4. SLIDE DE CONCLUSION
        createConclusionSlide(ppt, curriculum);
        
        // Convertir en bytes
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ppt.write(out);
        ppt.close();
        
        return out.toByteArray();
    }
    
    /**
     * Crée la slide de titre avec design moderne
     */
    private void createTitleSlide(XMLSlideShow ppt, Map<String, Object> curriculum) {
        XSLFSlide slide = ppt.createSlide();
        
        // Arrière-plan dégradé
        slide.getBackground().setFillColor(new Color(30, 41, 59)); // Bleu foncé moderne
        
        // Titre principal
        XSLFTextBox titleBox = slide.createTextBox();
        titleBox.setAnchor(new Rectangle(50, 150, 600, 100));
        XSLFTextParagraph titlePara = titleBox.addNewTextParagraph();
        titlePara.setTextAlign(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.CENTER);
        
        XSLFTextRun titleRun = titlePara.addNewTextRun();
        String title = (String) curriculum.getOrDefault("title", "Formation Professionnelle");
        titleRun.setText(title);
        titleRun.setFontSize(44.0);
        titleRun.setFontColor(Color.WHITE);
        titleRun.setBold(true);
        titleRun.setFontFamily("Arial");
        
        // Description
        XSLFTextBox descBox = slide.createTextBox();
        descBox.setAnchor(new Rectangle(100, 280, 500, 80));
        XSLFTextParagraph descPara = descBox.addNewTextParagraph();
        descPara.setTextAlign(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.CENTER);
        
        XSLFTextRun descRun = descPara.addNewTextRun();
        String description = (String) curriculum.getOrDefault("description", "Programme de formation complet");
        descRun.setText(description);
        descRun.setFontSize(18.0);
        descRun.setFontColor(new Color(226, 232, 240)); // Gris clair
        descRun.setFontFamily("Arial");
        
        // Méthodologie
        XSLFTextBox methodBox = slide.createTextBox();
        methodBox.setAnchor(new Rectangle(200, 400, 300, 40));
        XSLFTextParagraph methodPara = methodBox.addNewTextParagraph();
        methodPara.setTextAlign(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.CENTER);
        
        XSLFTextRun methodRun = methodPara.addNewTextRun();
        String methodology = (String) curriculum.getOrDefault("methodology", "360° Methodology");
        methodRun.setText("📚 " + methodology);
        methodRun.setFontSize(16.0);
        methodRun.setFontColor(new Color(96, 165, 250)); // Bleu clair
        methodRun.setBold(true);
        methodRun.setFontFamily("Arial");
    }
    
    /**
     * Crée la slide de vue d'ensemble
     */
    private void createOverviewSlide(XMLSlideShow ppt, Map<String, Object> curriculum) {
        XSLFSlide slide = ppt.createSlide();
        
        // Titre
        XSLFTextBox titleBox = slide.createTextBox();
        titleBox.setAnchor(new Rectangle(50, 30, 600, 60));
        XSLFTextParagraph titlePara = titleBox.addNewTextParagraph();
        
        XSLFTextRun titleRun = titlePara.addNewTextRun();
        titleRun.setText("📋 Vue d'Ensemble de la Formation");
        titleRun.setFontSize(32.0);
        titleRun.setBold(true);
        titleRun.setFontColor(new Color(30, 41, 59));
        titleRun.setFontFamily("Arial");
        
        // Durée totale
        Object totalDurationObj = curriculum.get("totalDuration");
        int totalDuration = totalDurationObj instanceof Number ? ((Number) totalDurationObj).intValue() : 480;
        
        XSLFTextBox durationBox = slide.createTextBox();
        durationBox.setAnchor(new Rectangle(50, 110, 300, 40));
        XSLFTextParagraph durationPara = durationBox.addNewTextParagraph();
        
        XSLFTextRun durationRun = durationPara.addNewTextRun();
        durationRun.setText("⏱️ Durée totale: " + (totalDuration / 60) + " heures");
        durationRun.setFontSize(20.0);
        durationRun.setFontColor(new Color(71, 85, 105));
        durationRun.setFontFamily("Arial");
        
        // Liste des modules
        List<Map<String, Object>> modules = (List<Map<String, Object>>) curriculum.getOrDefault("modules", List.of());
        
        XSLFTextBox modulesBox = slide.createTextBox();
        modulesBox.setAnchor(new Rectangle(50, 170, 600, 300));
        
        XSLFTextParagraph modulesPara = modulesBox.addNewTextParagraph();
        XSLFTextRun modulesHeaderRun = modulesPara.addNewTextRun();
        modulesHeaderRun.setText("Modules de la formation:\n\n");
        modulesHeaderRun.setFontSize(22.0);
        modulesHeaderRun.setBold(true);
        modulesHeaderRun.setFontColor(new Color(30, 41, 59));
        modulesHeaderRun.setFontFamily("Arial");
        
        for (int i = 0; i < modules.size(); i++) {
            Map<String, Object> module = modules.get(i);
            String moduleTitle = (String) module.getOrDefault("title", "Module " + (i + 1));
            
            Object durationObj = module.get("duration");
            int duration = durationObj instanceof Number ? ((Number) durationObj).intValue() : 60;
            
            XSLFTextParagraph modulePara = modulesBox.addNewTextParagraph();
            modulePara.setIndent(20.0);
            modulePara.setBullet(true);
            
            XSLFTextRun moduleRun = modulePara.addNewTextRun();
            moduleRun.setText((i + 1) + ". " + moduleTitle + " (" + duration + " min)");
            moduleRun.setFontSize(18.0);
            moduleRun.setFontColor(new Color(51, 65, 85));
            moduleRun.setFontFamily("Arial");
        }
    }
    
    /**
     * Crée la slide d'introduction d'un module
     */
    private void createModuleIntroSlide(XMLSlideShow ppt, Map<String, Object> module, int moduleNumber) {
        XSLFSlide slide = ppt.createSlide();
        
        // Arrière-plan coloré selon le module
        Color bgColor = getModuleColor(moduleNumber);
        slide.getBackground().setFillColor(bgColor);
        
        // Numéro du module (grand)
        XSLFTextBox numberBox = slide.createTextBox();
        numberBox.setAnchor(new Rectangle(50, 100, 200, 100));
        XSLFTextParagraph numberPara = numberBox.addNewTextParagraph();
        
        XSLFTextRun numberRun = numberPara.addNewTextRun();
        numberRun.setText("Module " + moduleNumber);
        numberRun.setFontSize(36.0);
        numberRun.setBold(true);
        numberRun.setFontColor(Color.WHITE);
        numberRun.setFontFamily("Arial");
        
        // Titre du module
        XSLFTextBox titleBox = slide.createTextBox();
        titleBox.setAnchor(new Rectangle(50, 220, 600, 100));
        XSLFTextParagraph titlePara = titleBox.addNewTextParagraph();
        
        XSLFTextRun titleRun = titlePara.addNewTextRun();
        String title = (String) module.getOrDefault("title", "Module de Formation");
        titleRun.setText(title);
        titleRun.setFontSize(40.0);
        titleRun.setBold(true);
        titleRun.setFontColor(Color.WHITE);
        titleRun.setFontFamily("Arial");
        
        // Description
        XSLFTextBox descBox = slide.createTextBox();
        descBox.setAnchor(new Rectangle(50, 340, 600, 100));
        XSLFTextParagraph descPara = descBox.addNewTextParagraph();
        
        XSLFTextRun descRun = descPara.addNewTextRun();
        String description = (String) module.getOrDefault("description", "Contenu pédagogique du module");
        descRun.setText(description);
        descRun.setFontSize(18.0);
        descRun.setFontColor(new Color(226, 232, 240));
        descRun.setFontFamily("Arial");
    }
    
    /**
     * Crée la slide des objectifs d'apprentissage
     */
    private void createLearningObjectivesSlide(XMLSlideShow ppt, Map<String, Object> module) {
        XSLFSlide slide = ppt.createSlide();
        
        // Titre
        XSLFTextBox titleBox = slide.createTextBox();
        titleBox.setAnchor(new Rectangle(50, 30, 600, 60));
        XSLFTextParagraph titlePara = titleBox.addNewTextParagraph();
        
        XSLFTextRun titleRun = titlePara.addNewTextRun();
        titleRun.setText("🎯 Objectifs d'Apprentissage");
        titleRun.setFontSize(32.0);
        titleRun.setBold(true);
        titleRun.setFontColor(new Color(30, 41, 59));
        titleRun.setFontFamily("Arial");
        
        // Objectifs
        List<String> objectives = (List<String>) module.getOrDefault("learningObjectives", 
            List.of("Comprendre les concepts clés", "Appliquer les connaissances", "Maîtriser les compétences"));
        
        XSLFTextBox objectivesBox = slide.createTextBox();
        objectivesBox.setAnchor(new Rectangle(50, 120, 600, 350));
        
        for (String objective : objectives) {
            XSLFTextParagraph objPara = objectivesBox.addNewTextParagraph();
            objPara.setIndent(20.0);
            objPara.setBullet(true);
            objPara.setSpaceBefore(15.0);
            
            XSLFTextRun objRun = objPara.addNewTextRun();
            objRun.setText("✅ " + objective);
            objRun.setFontSize(20.0);
            objRun.setFontColor(new Color(51, 65, 85));
            objRun.setFontFamily("Arial");
        }
    }
    
    /**
     * Crée la slide de contenu principal
     */
    private void createContentSlide(XMLSlideShow ppt, Map<String, Object> module) {
        XSLFSlide slide = ppt.createSlide();
        
        // Titre
        String moduleTitle = (String) module.getOrDefault("title", "Contenu du Module");
        XSLFTextBox titleBox = slide.createTextBox();
        titleBox.setAnchor(new Rectangle(50, 30, 600, 50));
        XSLFTextParagraph titlePara = titleBox.addNewTextParagraph();
        
        XSLFTextRun titleRun = titlePara.addNewTextRun();
        titleRun.setText("📚 " + moduleTitle);
        titleRun.setFontSize(28.0);
        titleRun.setBold(true);
        titleRun.setFontColor(new Color(30, 41, 59));
        titleRun.setFontFamily("Arial");
        
        // Éléments enrichis
        List<String> enhancedElements = (List<String>) module.getOrDefault("enhancedElements", 
            List.of("Contenu principal", "Exercices pratiques", "Évaluation"));
        
        XSLFTextBox contentBox = slide.createTextBox();
        contentBox.setAnchor(new Rectangle(50, 110, 600, 250));
        
        for (String element : enhancedElements) {
            XSLFTextParagraph elemPara = contentBox.addNewTextParagraph();
            elemPara.setIndent(20.0);
            elemPara.setBullet(true);
            elemPara.setSpaceBefore(12.0);
            
            XSLFTextRun elemRun = elemPara.addNewTextRun();
            elemRun.setText(getIconForElement(element) + " " + element);
            elemRun.setFontSize(18.0);
            elemRun.setFontColor(new Color(51, 65, 85));
            elemRun.setFontFamily("Arial");
        }
        
        // Info box en bas
        XSLFTextBox infoBox = slide.createTextBox();
        infoBox.setAnchor(new Rectangle(50, 400, 600, 80));
        
        XSLFTextParagraph infoPara = infoBox.addNewTextParagraph();
        infoPara.setTextAlign(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.CENTER);
        
        XSLFTextRun infoRun = infoPara.addNewTextRun();
        Object durationObj = module.get("duration");
        int duration = durationObj instanceof Number ? ((Number) durationObj).intValue() : 60;
        String difficulty = (String) module.getOrDefault("difficulty", "intermediate");
        
        infoRun.setText("⏱️ " + duration + " minutes | 📊 Niveau: " + getDifficultyLabel(difficulty));
        infoRun.setFontSize(16.0);
        infoRun.setFontColor(new Color(100, 116, 139));
        infoRun.setFontFamily("Arial");
    }
    
    /**
     * Crée la slide de conclusion
     */
    private void createConclusionSlide(XMLSlideShow ppt, Map<String, Object> curriculum) {
        XSLFSlide slide = ppt.createSlide();
        
        // Arrière-plan
        slide.getBackground().setFillColor(new Color(16, 185, 129)); // Vert
        
        // Titre
        XSLFTextBox titleBox = slide.createTextBox();
        titleBox.setAnchor(new Rectangle(100, 150, 500, 100));
        XSLFTextParagraph titlePara = titleBox.addNewTextParagraph();
        titlePara.setTextAlign(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.CENTER);
        
        XSLFTextRun titleRun = titlePara.addNewTextRun();
        titleRun.setText("🎉 Félicitations!");
        titleRun.setFontSize(48.0);
        titleRun.setBold(true);
        titleRun.setFontColor(Color.WHITE);
        titleRun.setFontFamily("Arial");
        
        // Message
        XSLFTextBox messageBox = slide.createTextBox();
        messageBox.setAnchor(new Rectangle(100, 280, 500, 100));
        XSLFTextParagraph messagePara = messageBox.addNewTextParagraph();
        messagePara.setTextAlign(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.CENTER);
        
        XSLFTextRun messageRun = messagePara.addNewTextRun();
        messageRun.setText("Vous avez complété la formation\nContinuez à apprendre et à progresser!");
        messageRun.setFontSize(24.0);
        messageRun.setFontColor(Color.WHITE);
        messageRun.setFontFamily("Arial");
    }
    
    // Helper methods
    
    private Color getModuleColor(int moduleNumber) {
        Color[] colors = {
            new Color(59, 130, 246),   // Bleu
            new Color(139, 92, 246),   // Violet
            new Color(236, 72, 153),   // Rose
            new Color(251, 146, 60),   // Orange
            new Color(34, 197, 94),    // Vert
            new Color(234, 179, 8),    // Jaune
            new Color(14, 165, 233),   // Cyan
            new Color(168, 85, 247)    // Pourpre
        };
        return colors[(moduleNumber - 1) % colors.length];
    }
    
    private String getIconForElement(String element) {
        String lowerElement = element.toLowerCase();
        if (lowerElement.contains("video") || lowerElement.contains("vidéo")) return "🎥";
        if (lowerElement.contains("quiz") || lowerElement.contains("assessment") || lowerElement.contains("évaluation")) return "✅";
        if (lowerElement.contains("exercise") || lowerElement.contains("exercice") || lowerElement.contains("practice")) return "💪";
        if (lowerElement.contains("interactive") || lowerElement.contains("interactif")) return "🔄";
        if (lowerElement.contains("scenario") || lowerElement.contains("scénario")) return "🎬";
        if (lowerElement.contains("infographic") || lowerElement.contains("infographie")) return "📊";
        if (lowerElement.contains("document") || lowerElement.contains("reading")) return "📄";
        return "📌";
    }
    
    private String getDifficultyLabel(String difficulty) {
        return switch (difficulty.toLowerCase()) {
            case "beginner" -> "Débutant";
            case "intermediate" -> "Intermédiaire";
            case "advanced" -> "Avancé";
            default -> "Intermédiaire";
        };
    }
}

