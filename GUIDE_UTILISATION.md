# 📚 Guide d'Utilisation - Formation Consolidée avec Export PPT

## 🎯 Problème Résolu

**AVANT** : Upload de 5 fichiers → 30+ modules (6 modules par fichier) ❌  
**MAINTENANT** : Upload de 5 fichiers → 5-8 modules consolidés ✅

---

## 🚀 Nouveaux Endpoints API

### 1️⃣ Upload Multiple de Fichiers (Consolidé)

**Endpoint** : `POST /ai/analyze-multiple-documents`

**Description** : Analyse PLUSIEURS fichiers en une seule fois et génère UNE formation consolidée bien organisée.

**Request** :
```http
POST http://localhost:5010/ai/analyze-multiple-documents
Content-Type: multipart/form-data

files: [fichier1.pdf, fichier2.docx, fichier3.pdf, ...]
industry: "Insurance" (optionnel, défaut: "General")
```

**Exemple avec cURL** :
```bash
curl -X POST http://localhost:5010/ai/analyze-multiple-documents \
  -F "files=@document1.pdf" \
  -F "files=@document2.docx" \
  -F "files=@document3.pdf" \
  -F "industry=Insurance"
```

**Response** :
```json
{
  "success": true,
  "filesCount": 5,
  "fileNames": ["doc1.pdf", "doc2.docx", "doc3.pdf", "doc4.pdf", "doc5.pdf"],
  "totalSize": 2456789,
  "analysis": {
    "keyTopics": ["Topic 1", "Topic 2", "Topic 3"],
    "difficulty": 6,
    "estimatedReadTime": 45,
    "learningObjectives": ["Objective 1", "Objective 2", ...],
    "prerequisites": ["Prerequisite 1", "Prerequisite 2"],
    "suggestedModules": ["Module 1", "Module 2", ...],
    "curriculum": {
      "title": "Formation Complète",
      "description": "Description de la formation",
      "totalDuration": 480,
      "methodology": "360° Methodology",
      "modules": [
        {
          "title": "Introduction aux Concepts",
          "description": "Module d'introduction",
          "duration": 90,
          "difficulty": "beginner",
          "contentItems": 5,
          "assessments": 1,
          "enhancedElements": ["Video Introduction", "Interactive Exercise"],
          "learningObjectives": ["Objectif 1", "Objectif 2"]
        }
        // ... 4-7 autres modules
      ]
    }
  }
}
```

---

### 2️⃣ Export PowerPoint

**Endpoint** : `POST /ai/export-powerpoint`

**Description** : Génère un PowerPoint (.pptx) avec slides animées et design moderne.

**Request** :
```http
POST http://localhost:5010/ai/export-powerpoint
Content-Type: application/json

{
  "curriculum": {
    "title": "Formation Complète",
    "description": "Description de la formation",
    "totalDuration": 480,
    "methodology": "360° Methodology",
    "modules": [...]
  }
}
```

**Exemple avec cURL** :
```bash
curl -X POST http://localhost:5010/ai/export-powerpoint \
  -H "Content-Type: application/json" \
  -d @curriculum.json \
  --output formation.pptx
```

**Response** : Fichier PowerPoint binaire (`.pptx`)

---

## 🎨 Contenu du PowerPoint Généré

Le PowerPoint contient :

1. **Slide de Titre** - Design moderne avec arrière-plan dégradé
2. **Vue d'Ensemble** - Liste de tous les modules avec durées
3. **Pour chaque module** :
   - Slide d'introduction avec couleur thématique
   - Slide des objectifs d'apprentissage (avec puces animées)
   - Slide du contenu principal avec icônes
4. **Slide de Conclusion** - Message de félicitations

### 🎨 Caractéristiques du Design :
- ✅ Couleurs modernes et professionnelles
- ✅ Icônes visuels (🎥 📚 ✅ 💪 etc.)
- ✅ Textes bien formatés avec hiérarchie claire
- ✅ Information de durée et niveau de difficulté
- ✅ Arrière-plans colorés par module

---

## 💻 Workflow Complet

### Étape 1 : Upload Multiple de Fichiers
```javascript
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2);
formData.append('files', file3);
formData.append('files', file4);
formData.append('files', file5);
formData.append('industry', 'Insurance');

const response = await fetch('http://localhost:5010/ai/analyze-multiple-documents', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Formation consolidée:', result.analysis.curriculum);
console.log('Nombre de modules:', result.analysis.curriculum.modules.length); // 5-8 modules
```

### Étape 2 : Export en PowerPoint
```javascript
const curriculum = result.analysis.curriculum;

const pptResponse = await fetch('http://localhost:5010/ai/export-powerpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ curriculum })
});

const pptBlob = await pptResponse.blob();

// Télécharger le fichier
const link = document.createElement('a');
link.href = URL.createObjectURL(pptBlob);
link.download = 'Formation_Complete.pptx';
link.click();
```

---

## 📊 Comparaison AVANT / APRÈS

### ⚠️ AVANT (Ancien Système)

```
5 fichiers uploadés
  ↓
Fichier 1 → 6 modules
Fichier 2 → 6 modules  
Fichier 3 → 6 modules
Fichier 4 → 6 modules
Fichier 5 → 6 modules
  ↓
TOTAL: 30 modules séparés ❌
Beaucoup de redondance ❌
Pas d'organisation logique ❌
```

### ✅ MAINTENANT (Nouveau Système)

```
5 fichiers uploadés
  ↓
Analyse consolidée de TOUS les fichiers
  ↓
Identification des thèmes communs
Élimination des redondances
Organisation logique : Intro → Core → Advanced → Practice → Conclusion
  ↓
TOTAL: 5-8 modules cohérents ✅
Formation bien structurée ✅
Export PPT professionnel ✅
```

---

## 🛠️ Configuration Requise

### Backend
- Java 17
- Spring Boot 3.2.1
- Apache POI 5.2.5 (déjà dans `pom.xml`)
- OpenAI API Key configurée

### Variables d'Environnement
Dans `application.yml` ou via Docker :
```yaml
app:
  ai:
    openai:
      api-key: votre_clé_openai
      model: gpt-4
```

---

## 🐳 Lancer le Backend

### Avec Docker (Recommandé)
```bash
cd v25_platform_training_backend
docker-compose up --build
```

### Avec Maven
```bash
mvn spring-boot:run
```

Le backend sera accessible sur **http://localhost:5010**

---

## 📝 Exemple d'Intégration Frontend

```typescript
// Service TypeScript pour le frontend
export class TrainingService {
  
  // Upload multiple de fichiers
  async uploadMultipleDocuments(files: File[], industry: string = 'General') {
    const formData = new FormData();
    
    files.forEach(file => {
      formData.append('files', file);
    });
    formData.append('industry', industry);
    
    const response = await fetch('/ai/analyze-multiple-documents', {
      method: 'POST',
      body: formData
    });
    
    return await response.json();
  }
  
  // Export PowerPoint
  async exportPowerPoint(curriculum: any) {
    const response = await fetch('/ai/export-powerpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curriculum })
    });
    
    const blob = await response.blob();
    this.downloadFile(blob, 'Formation.pptx');
  }
  
  private downloadFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
```

---

## 🎯 Résultat Final

Vous obtenez maintenant :
1. ✅ **Une formation consolidée** (5-8 modules au lieu de 30+)
2. ✅ **Bien organisée** avec progression logique
3. ✅ **Export PowerPoint professionnel** avec design moderne
4. ✅ **Slides animées** avec icônes et couleurs
5. ✅ **Prêt à présenter** aux apprenants

---

## 🆘 Support

En cas de problème :
- Vérifier les logs : `docker-compose logs api`
- Tester l'endpoint health : `http://localhost:5010/health`
- Vérifier la clé OpenAI dans `application.yml`

---

**Créé le** : 26 octobre 2025  
**Version** : 2.0 - Formation Consolidée avec Export PPT

