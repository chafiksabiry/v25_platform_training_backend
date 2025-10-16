package com.trainingplatform.application.services;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class DocumentParserService {
    
    /**
     * Extrait le texte d'un fichier (PDF, Word, etc.)
     */
    public String extractText(MultipartFile file) throws IOException {
        String fileName = file.getOriginalFilename();
        
        if (fileName == null) {
            throw new IllegalArgumentException("File name cannot be null");
        }
        
        if (fileName.endsWith(".pdf")) {
            return extractPdfText(file.getInputStream());
        } else if (fileName.endsWith(".docx")) {
            return extractWordText(file.getInputStream());
        } else if (fileName.endsWith(".txt")) {
            return new String(file.getBytes());
        } else {
            throw new IllegalArgumentException("Unsupported file type: " + fileName);
        }
    }
    
    private String extractPdfText(InputStream inputStream) throws IOException {
        try (PDDocument document = PDDocument.load(inputStream)) {
            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(document);
        }
    }
    
    private String extractWordText(InputStream inputStream) throws IOException {
        try (XWPFDocument document = new XWPFDocument(inputStream)) {
            List<XWPFParagraph> paragraphs = document.getParagraphs();
            return paragraphs.stream()
                .map(XWPFParagraph::getText)
                .collect(Collectors.joining("\n"));
        }
    }
}

