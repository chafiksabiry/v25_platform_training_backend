# 🧪 Exemples d'Utilisation de l'API

## 📋 Table des Matières
1. [Upload Multiple de Documents](#1-upload-multiple-de-documents)
2. [Export PowerPoint](#2-export-powerpoint)
3. [Tests avec Postman](#3-tests-avec-postman)
4. [Tests avec JavaScript/Fetch](#4-tests-avec-javascriptfetch)

---

## 1️⃣ Upload Multiple de Documents

### Avec cURL (Terminal)

```bash
# Upload de 5 fichiers PDF/DOCX
curl -X POST http://localhost:5010/ai/analyze-multiple-documents \
  -F "files=@/path/to/document1.pdf" \
  -F "files=@/path/to/document2.docx" \
  -F "files=@/path/to/document3.pdf" \
  -F "files=@/path/to/document4.pdf" \
  -F "files=@/path/to/document5.pdf" \
  -F "industry=Insurance"
```

### Avec PowerShell (Windows)

```powershell
$files = @(
    "C:\Documents\doc1.pdf",
    "C:\Documents\doc2.docx",
    "C:\Documents\doc3.pdf"
)

$formData = New-Object System.Net.Http.MultipartFormDataContent

foreach ($file in $files) {
    $fileStream = [System.IO.File]::OpenRead($file)
    $fileName = [System.IO.Path]::GetFileName($file)
    $fileContent = New-Object System.Net.Http.StreamContent($fileStream)
    $formData.Add($fileContent, "files", $fileName)
}

$industryContent = [System.Net.Http.StringContent]::new("Insurance")
$formData.Add($industryContent, "industry")

$response = Invoke-RestMethod -Uri "http://localhost:5010/ai/analyze-multiple-documents" `
    -Method Post -Body $formData

$response | ConvertTo-Json -Depth 10
```

### Avec Python (requests)

```python
import requests

# Préparer les fichiers
files = [
    ('files', open('document1.pdf', 'rb')),
    ('files', open('document2.docx', 'rb')),
    ('files', open('document3.pdf', 'rb')),
    ('files', open('document4.pdf', 'rb')),
    ('files', open('document5.pdf', 'rb'))
]

data = {
    'industry': 'Insurance'
}

# Envoyer la requête
response = requests.post(
    'http://localhost:5010/ai/analyze-multiple-documents',
    files=files,
    data=data
)

result = response.json()

print(f"Nombre de fichiers: {result['filesCount']}")
print(f"Nombre de modules: {len(result['analysis']['curriculum']['modules'])}")
print(f"Titre: {result['analysis']['curriculum']['title']}")

# Sauvegarder le curriculum pour l'export PPT
import json
with open('curriculum.json', 'w', encoding='utf-8') as f:
    json.dump(result['analysis']['curriculum'], f, indent=2, ensure_ascii=False)

print("Curriculum sauvegardé dans curriculum.json")
```

---

## 2️⃣ Export PowerPoint

### Avec cURL (Terminal)

```bash
# Méthode 1 : Depuis un fichier JSON
curl -X POST http://localhost:5010/ai/export-powerpoint \
  -H "Content-Type: application/json" \
  -d @curriculum.json \
  --output formation.pptx

echo "PowerPoint généré : formation.pptx"
```

### Avec PowerShell (Windows)

```powershell
# Charger le curriculum depuis JSON
$curriculum = Get-Content "curriculum.json" | ConvertFrom-Json

# Créer le body
$body = @{
    curriculum = $curriculum
} | ConvertTo-Json -Depth 10

# Envoyer la requête
$response = Invoke-WebRequest `
    -Uri "http://localhost:5010/ai/export-powerpoint" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body

# Sauvegarder le fichier
[System.IO.File]::WriteAllBytes("Formation.pptx", $response.Content)

Write-Host "PowerPoint généré : Formation.pptx"
```

### Avec Python (requests)

```python
import requests
import json

# Charger le curriculum
with open('curriculum.json', 'r', encoding='utf-8') as f:
    curriculum = json.load(f)

# Envoyer la requête
response = requests.post(
    'http://localhost:5010/ai/export-powerpoint',
    json={'curriculum': curriculum}
)

# Sauvegarder le PowerPoint
if response.status_code == 200:
    with open('Formation.pptx', 'wb') as f:
        f.write(response.content)
    print("✅ PowerPoint généré : Formation.pptx")
else:
    print(f"❌ Erreur: {response.text}")
```

---

## 3️⃣ Tests avec Postman

### Collection Postman

Créez une nouvelle collection avec ces requêtes :

#### **Request 1 : Upload Multiple Documents**

```
POST http://localhost:5010/ai/analyze-multiple-documents
```

**Headers :**
- Aucun (Postman ajoute automatiquement `multipart/form-data`)

**Body (form-data) :**
| Key      | Type  | Value                    |
|----------|-------|--------------------------|
| files    | File  | document1.pdf            |
| files    | File  | document2.docx           |
| files    | File  | document3.pdf            |
| industry | Text  | Insurance                |

**Tests (JavaScript) :**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has curriculum", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.eql(true);
    pm.expect(jsonData.analysis.curriculum).to.exist;
});

// Sauvegarder le curriculum pour la prochaine requête
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set("curriculum", JSON.stringify(jsonData.analysis.curriculum));
    
    console.log("Nombre de fichiers:", jsonData.filesCount);
    console.log("Nombre de modules:", jsonData.analysis.curriculum.modules.length);
}
```

#### **Request 2 : Export PowerPoint**

```
POST http://localhost:5010/ai/export-powerpoint
```

**Headers :**
- `Content-Type: application/json`

**Body (raw JSON) :**
```json
{
  "curriculum": {{curriculum}}
}
```

**Tests (JavaScript) :**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response is PowerPoint file", function () {
    pm.expect(pm.response.headers.get("Content-Type"))
      .to.include("application/vnd.openxmlformats-officedocument.presentationml.presentation");
});

console.log("PowerPoint généré, taille:", pm.response.size().body, "bytes");
```

**Pour télécharger le fichier dans Postman :**
1. Cliquez sur "Send and Download"
2. Sauvegardez le fichier avec l'extension `.pptx`

---

## 4️⃣ Tests avec JavaScript/Fetch

### Frontend React/Vue/Angular

```javascript
// === COMPOSANT COMPLET ===

class TrainingUploader {
  
  constructor(apiBaseUrl = 'http://localhost:5010') {
    this.apiBaseUrl = apiBaseUrl;
  }
  
  /**
   * Upload multiple de fichiers et génération de formation
   */
  async uploadAndGenerateTraining(files, industry = 'General') {
    try {
      console.log(`📤 Upload de ${files.length} fichiers...`);
      
      const formData = new FormData();
      
      // Ajouter tous les fichiers
      for (const file of files) {
        formData.append('files', file);
      }
      formData.append('industry', industry);
      
      const response = await fetch(`${this.apiBaseUrl}/ai/analyze-multiple-documents`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      console.log(`✅ Formation générée avec ${result.analysis.curriculum.modules.length} modules`);
      console.log(`📚 Titre: ${result.analysis.curriculum.title}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Erreur lors de l\'upload:', error);
      throw error;
    }
  }
  
  /**
   * Export en PowerPoint
   */
  async exportToPowerPoint(curriculum) {
    try {
      console.log('📊 Génération du PowerPoint...');
      
      const response = await fetch(`${this.apiBaseUrl}/ai/export-powerpoint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ curriculum })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Télécharger le fichier
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Formation_${Date.now()}.pptx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('✅ PowerPoint téléchargé');
      
    } catch (error) {
      console.error('❌ Erreur lors de l\'export:', error);
      throw error;
    }
  }
  
  /**
   * Workflow complet : Upload + Export
   */
  async processCompleteWorkflow(files, industry = 'General') {
    try {
      // Étape 1 : Upload et génération
      const result = await this.uploadAndGenerateTraining(files, industry);
      
      // Étape 2 : Export PowerPoint
      await this.exportToPowerPoint(result.analysis.curriculum);
      
      console.log('✅ Workflow terminé avec succès !');
      
      return result;
      
    } catch (error) {
      console.error('❌ Erreur dans le workflow:', error);
      throw error;
    }
  }
}

// === UTILISATION ===

// Initialiser
const uploader = new TrainingUploader('http://localhost:5010');

// HTML : <input type="file" id="fileInput" multiple accept=".pdf,.docx,.txt">

document.getElementById('fileInput').addEventListener('change', async (event) => {
  const files = Array.from(event.target.files);
  
  if (files.length === 0) {
    alert('Veuillez sélectionner au moins un fichier');
    return;
  }
  
  try {
    // Workflow complet
    const result = await uploader.processCompleteWorkflow(files, 'Insurance');
    
    // Afficher les informations
    console.log('Formation générée:');
    console.log('- Titre:', result.analysis.curriculum.title);
    console.log('- Modules:', result.analysis.curriculum.modules.length);
    console.log('- Durée totale:', result.analysis.curriculum.totalDuration, 'minutes');
    
    alert('Formation créée et PowerPoint téléchargé !');
    
  } catch (error) {
    alert('Erreur: ' + error.message);
  }
});
```

### Exemple avec React Hook

```jsx
import { useState } from 'react';

function TrainingUploader() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  const handleUpload = async (files) => {
    setLoading(true);
    
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      formData.append('industry', 'Insurance');
      
      const response = await fetch('http://localhost:5010/ai/analyze-multiple-documents', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      setResult(data);
      
      // Export automatique en PPT
      await exportToPPT(data.analysis.curriculum);
      
    } catch (error) {
      console.error(error);
      alert('Erreur: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const exportToPPT = async (curriculum) => {
    const response = await fetch('http://localhost:5010/ai/export-powerpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curriculum })
    });
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Formation.pptx';
    link.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div>
      <input
        type="file"
        multiple
        accept=".pdf,.docx,.txt"
        onChange={(e) => handleUpload(Array.from(e.target.files))}
        disabled={loading}
      />
      
      {loading && <p>Génération en cours...</p>}
      
      {result && (
        <div>
          <h3>{result.analysis.curriculum.title}</h3>
          <p>Modules: {result.analysis.curriculum.modules.length}</p>
          <p>Durée: {result.analysis.curriculum.totalDuration} min</p>
        </div>
      )}
    </div>
  );
}
```

---

## 🎯 Résumé des Endpoints

| Endpoint | Méthode | Description | Input | Output |
|----------|---------|-------------|-------|--------|
| `/ai/analyze-multiple-documents` | POST | Upload multiple + consolidation | FormData (files, industry) | JSON (curriculum) |
| `/ai/export-powerpoint` | POST | Export en PowerPoint | JSON (curriculum) | File (.pptx) |

---

## 🐛 Debugging

### Vérifier que l'API fonctionne

```bash
curl http://localhost:5010/health
```

### Logs Docker

```bash
docker-compose logs -f api
```

### Tester avec un fichier simple

```bash
echo "Ceci est un document de test pour la formation." > test.txt

curl -X POST http://localhost:5010/ai/analyze-multiple-documents \
  -F "files=@test.txt" \
  -F "industry=Test"
```

---

**Happy Training! 🎓**

