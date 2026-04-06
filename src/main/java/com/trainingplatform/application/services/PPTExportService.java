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
    
    public byte[] generatePowerPoint(Map<String, Object> presentation) throws IOException {
        XMLSlideShow ppt = new XMLSlideShow();
        
        // Ensure slides exist
        List<Map<String, Object>> slides = (List<Map<String, Object>>) presentation.get("slides");
        if (slides == null || slides.isEmpty()) {
            throw new IllegalArgumentException("La présentation ne contient aucune diapositive.");
        }
        
        String title = (String) presentation.getOrDefault("title", "Présentation");
        
        for (int i = 0; i < slides.size(); i++) {
            Map<String, Object> slideData = slides.get(i);
            String type = (String) slideData.getOrDefault("type", "content");
            
            switch (type.toLowerCase()) {
                case "cover":
                    createCoverSlide(ppt, slideData, title);
                    break;
                case "agenda":
                case "conclusion":
                    createSpecialSlide(ppt, slideData, type);
                    break;
                default:
                    createRichContentSlide(ppt, slideData);
                    break;
            }
            
            // Add speaker notes if they exist
            String note = (String) slideData.get("note");
            if (note != null && !note.isEmpty() && ppt.getSlides().size() > 0) {
                XSLFSlide currentSlide = ppt.getSlides().get(ppt.getSlides().size() - 1);
                XSLFNotes notesSlide = ppt.getNotesSlide(currentSlide);
                for (XSLFTextShape shape : notesSlide.getPlaceholders()) {
                    if (shape.getPlaceholder() == org.apache.poi.sl.usermodel.Placeholder.BODY) {
                        shape.setText(note);
                        break;
                    }
                }
            }
        }
        
        // Convert to bytes
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ppt.write(out);
        ppt.close();
        
        return out.toByteArray();
    }
    
    private void createCoverSlide(XMLSlideShow ppt, Map<String, Object> slideData, String globalTitle) {
        XSLFSlide slide = ppt.createSlide();
        slide.getBackground().setFillColor(new Color(30, 41, 59)); // Bleu foncé
        
        // Titre
        XSLFTextBox titleBox = slide.createTextBox();
        titleBox.setAnchor(new Rectangle(50, 150, 600, 100));
        XSLFTextParagraph titlePara = titleBox.addNewTextParagraph();
        titlePara.setTextAlign(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.CENTER);
        
        XSLFTextRun titleRun = titlePara.addNewTextRun();
        String title = (String) slideData.getOrDefault("title", globalTitle);
        titleRun.setText(title);
        titleRun.setFontSize(44.0);
        titleRun.setFontColor(Color.WHITE);
        titleRun.setBold(true);
        titleRun.setFontFamily("Arial");
        
        // Sous-titre ou Highlight
        String subtitle = (String) slideData.get("subtitle");
        String highlight = (String) slideData.get("highlight");
        if (subtitle != null || highlight != null) {
            XSLFTextBox descBox = slide.createTextBox();
            descBox.setAnchor(new Rectangle(100, 280, 500, 80));
            XSLFTextParagraph descPara = descBox.addNewTextParagraph();
            descPara.setTextAlign(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.CENTER);
            
            XSLFTextRun descRun = descPara.addNewTextRun();
            descRun.setText(subtitle != null ? subtitle : highlight);
            descRun.setFontSize(22.0);
            descRun.setFontColor(new Color(226, 232, 240));
            descRun.setFontFamily("Arial");
        }
    }
    
    private void createSpecialSlide(XMLSlideShow ppt, Map<String, Object> slideData, String type) {
        XSLFSlide slide = ppt.createSlide();
        if ("conclusion".equalsIgnoreCase(type)) {
            slide.getBackground().setFillColor(new Color(16, 185, 129)); // Vert
        } else {
            slide.getBackground().setFillColor(new Color(241, 245, 249)); // Gris très clair
        }
        
        // Titre
        XSLFTextBox titleBox = slide.createTextBox();
        titleBox.setAnchor(new Rectangle(50, 50, 600, 80));
        XSLFTextParagraph titlePara = titleBox.addNewTextParagraph();
        XSLFTextRun titleRun = titlePara.addNewTextRun();
        titleRun.setText((slideData.get("icon") != null ? slideData.get("icon") + " " : "") + slideData.getOrDefault("title", ""));
        titleRun.setFontSize(36.0);
        titleRun.setBold(true);
        titleRun.setFontColor("conclusion".equalsIgnoreCase(type) ? Color.WHITE : new Color(30, 41, 59));
        titleRun.setFontFamily("Arial");
        
        // Contenu
        String content = (String) slideData.get("content");
        if (content != null) {
            XSLFTextBox contentBox = slide.createTextBox();
            contentBox.setAnchor(new Rectangle(50, 150, 600, 100));
            XSLFTextParagraph contentPara = contentBox.addNewTextParagraph();
            XSLFTextRun contentRun = contentPara.addNewTextRun();
            contentRun.setText(content);
            contentRun.setFontSize(20.0);
            contentRun.setFontColor("conclusion".equalsIgnoreCase(type) ? Color.WHITE : new Color(71, 85, 105));
            contentRun.setFontFamily("Arial");
        }
        
        // Bullets
        List<String> bullets = (List<String>) slideData.get("bullets");
        if (bullets != null && !bullets.isEmpty()) {
            XSLFTextBox bulletsBox = slide.createTextBox();
            bulletsBox.setAnchor(new Rectangle(50, 270, 600, 250));
            for (String b : bullets) {
                XSLFTextParagraph bp = bulletsBox.addNewTextParagraph();
                bp.setIndent(20.0);
                bp.setBullet(true);
                bp.setSpaceBefore(10.0);
                XSLFTextRun br = bp.addNewTextRun();
                br.setText(b);
                br.setFontSize(18.0);
                br.setFontColor("conclusion".equalsIgnoreCase(type) ? Color.WHITE : new Color(51, 65, 85));
                br.setFontFamily("Arial");
            }
        }
    }
    
    private void createRichContentSlide(XMLSlideShow ppt, Map<String, Object> slideData) {
        XSLFSlide slide = ppt.createSlide();
        
        // Titre
        XSLFTextBox titleBox = slide.createTextBox();
        titleBox.setAnchor(new Rectangle(50, 30, 600, 60));
        XSLFTextParagraph titlePara = titleBox.addNewTextParagraph();
        XSLFTextRun titleRun = titlePara.addNewTextRun();
        titleRun.setText((slideData.get("icon") != null ? slideData.get("icon") + " " : "") + slideData.getOrDefault("title", "Contenu"));
        titleRun.setFontSize(32.0);
        titleRun.setBold(true);
        titleRun.setFontColor(new Color(30, 41, 59));
        titleRun.setFontFamily("Arial");
        
        // Content Paragraph
        String content = (String) slideData.get("content");
        int yOffset = 110;
        if (content != null && !content.isEmpty()) {
            XSLFTextBox contentBox = slide.createTextBox();
            contentBox.setAnchor(new Rectangle(50, yOffset, 600, 100));
            XSLFTextParagraph contentPara = contentBox.addNewTextParagraph();
            XSLFTextRun contentRun = contentPara.addNewTextRun();
            contentRun.setText(content);
            contentRun.setFontSize(18.0);
            contentRun.setFontColor(new Color(51, 65, 85));
            contentRun.setFontFamily("Arial");
            yOffset += 120;
        }
        
        // Highlight Box (if any)
        String highlight = (String) slideData.get("highlight");
        if (highlight != null && !highlight.isEmpty()) {
            XSLFTextBox hlBox = slide.createTextBox();
            hlBox.setAnchor(new Rectangle(450, 30, 200, 60));
            XSLFTextParagraph hlPara = hlBox.addNewTextParagraph();
            hlPara.setTextAlign(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.RIGHT);
            XSLFTextRun hlRun = hlPara.addNewTextRun();
            hlRun.setText("💡 " + highlight);
            hlRun.setFontSize(16.0);
            hlRun.setBold(true);
            hlRun.setFontColor(new Color(234, 179, 8)); // Jaune/Or
            hlRun.setFontFamily("Arial");
        }
        
        // Bullets
        List<String> bullets = (List<String>) slideData.get("bullets");
        if (bullets != null && !bullets.isEmpty()) {
            XSLFTextBox bulletsBox = slide.createTextBox();
            bulletsBox.setAnchor(new Rectangle(50, yOffset, 600, 250));
            for (String b : bullets) {
                XSLFTextParagraph bp = bulletsBox.addNewTextParagraph();
                bp.setIndent(20.0);
                bp.setBullet(true);
                bp.setSpaceBefore(10.0);
                XSLFTextRun br = bp.addNewTextRun();
                br.setText(b);
                br.setFontSize(16.0);
                br.setFontColor(new Color(71, 85, 105));
                br.setFontFamily("Arial");
            }
        }
    }
}

