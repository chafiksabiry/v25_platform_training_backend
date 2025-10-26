# 🎓 Formation Consolidée - Backend API

## 🎯 Problème Résolu

**Avant** : Upload de 5 fichiers → 30+ modules désorganisés ❌  
**Maintenant** : Upload de 5 fichiers → 5-8 modules consolidés + Export PPT ✅

---

## ⚡ Quick Start

### 1️⃣ Lancer le Backend

```bash
cd v25_platform_training_backend

# Avec Docker (recommandé)
docker-compose up --build

# OU avec Maven
mvn spring-boot:run
```

Le backend sera accessible sur **http://localhost:5010**

### 2️⃣ Tester l'API

```bash
# Installer les dépendances Python
pip install requests

# Tester avec vos fichiers
python test_api.py document1.pdf document2.docx document3.pdf Insurance
```

---

## 📚 Documentation

- **[GUIDE_UTILISATION.md](GUIDE_UTILISATION.md)** - Guide complet d'utilisation
- **[API_EXAMPLES.md](API_EXAMPLES.md)** - Exemples avec cURL, Python, JavaScript, Postman
- **[test_api.py](test_api.py)** - Script Python de test

---

## 🚀 Nouveaux Endpoints

### 1. Upload Multiple et Consolidation

```http
POST /ai/analyze-multiple-documents
Content-Type: multipart/form-data

files: [file1.pdf, file2.docx, ...]
industry: "Insurance"
```

**Résultat** : Une formation consolidée avec 5-8 modules organisés

### 2. Export PowerPoint

```http
POST /ai/export-powerpoint
Content-Type: application/json

{
  "curriculum": { ... }
}
```

**Résultat** : Fichier PowerPoint (.pptx) avec slides animées

---

## 📊 Exemple Complet

### Avec cURL

```bash
# 1. Upload multiple
curl -X POST http://localhost:5010/ai/analyze-multiple-documents \
  -F "files=@doc1.pdf" \
  -F "files=@doc2.docx" \
  -F "files=@doc3.pdf" \
  -F "industry=Insurance" \
  > result.json

# 2. Extraire le curriculum
cat result.json | jq '.analysis.curriculum' > curriculum.json

# 3. Générer le PowerPoint
curl -X POST http://localhost:5010/ai/export-powerpoint \
  -H "Content-Type: application/json" \
  -d @curriculum.json \
  --output Formation.pptx
```

### Avec Python

```python
import requests

# 1. Upload et analyse
files = [
    ('files', open('doc1.pdf', 'rb')),
    ('files', open('doc2.docx', 'rb')),
    ('files', open('doc3.pdf', 'rb'))
]

response = requests.post(
    'http://localhost:5010/ai/analyze-multiple-documents',
    files=files,
    data={'industry': 'Insurance'}
)

curriculum = response.json()['analysis']['curriculum']
print(f"✅ {len(curriculum['modules'])} modules générés")

# 2. Export PowerPoint
ppt_response = requests.post(
    'http://localhost:5010/ai/export-powerpoint',
    json={'curriculum': curriculum}
)

with open('Formation.pptx', 'wb') as f:
    f.write(ppt_response.content)

print("✅ PowerPoint généré!")
```

### Avec JavaScript

```javascript
// 1. Upload et analyse
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2);
formData.append('files', file3);
formData.append('industry', 'Insurance');

const response = await fetch('/ai/analyze-multiple-documents', {
  method: 'POST',
  body: formData
});

const result = await response.json();
const curriculum = result.analysis.curriculum;

console.log(`✅ ${curriculum.modules.length} modules générés`);

// 2. Export PowerPoint
const pptResponse = await fetch('/ai/export-powerpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ curriculum })
});

const blob = await pptResponse.blob();

// Télécharger
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = 'Formation.pptx';
link.click();
```

---

## 🎨 Contenu du PowerPoint

Le PowerPoint généré contient :

- 🎯 **Slide de Titre** - Design moderne avec dégradé
- 📋 **Vue d'Ensemble** - Liste des modules avec durées
- 📚 **Slides par Module** :
  - Introduction colorée
  - Objectifs d'apprentissage
  - Contenu principal avec icônes
- 🎉 **Slide de Conclusion** - Message de félicitations

**Design Features** :
- ✅ Couleurs modernes et professionnelles
- ✅ Icônes visuels (🎥 📚 ✅ 💪)
- ✅ Hiérarchie claire et lisible
- ✅ Information de durée et niveau

---

## 🛠️ Architecture

```
Backend (Spring Boot)
├── AIController
│   ├── /ai/analyze-multiple-documents  → Upload & Consolidation
│   └── /ai/export-powerpoint           → Export PPT
├── AIService
│   └── analyzeConsolidatedDocuments()  → Analyse intelligente
├── DocumentParserService
│   └── extractText()                   → Extraction PDF/DOCX
└── PPTExportService
    └── generatePowerPoint()            → Génération PPT
```

---

## 📦 Technologies

- **Java 17** avec Spring Boot 3.2.1
- **Apache POI 5.2.5** - Génération PowerPoint
- **OpenAI GPT-4** - Analyse intelligente
- **Apache PDFBox** - Extraction PDF
- **MongoDB** - Stockage des formations

---

## 🔧 Configuration

### Variables d'Environnement

```yaml
# application.yml
app:
  ai:
    openai:
      api-key: your_openai_api_key
      model: gpt-4
```

Ou via Docker :

```yaml
# docker-compose.yml
environment:
  MONGODB_URI: mongodb://...
  JWT_SECRET: your_jwt_secret
  CORS_ORIGIN: https://your-domain.com
```

---

## 🧪 Tests

### Test de Santé

```bash
curl http://localhost:5010/health
```

### Test Complet

```bash
python test_api.py doc1.pdf doc2.docx doc3.pdf Insurance
```

### Logs Docker

```bash
docker-compose logs -f api
```

---

## 📈 Comparaison AVANT / APRÈS

| Critère | Avant ❌ | Maintenant ✅ |
|---------|---------|---------------|
| Fichiers uploadés | 5 fichiers | 5 fichiers |
| Modules générés | **30 modules** (6 par fichier) | **5-8 modules** consolidés |
| Organisation | Désorganisé | Logique: Intro → Core → Advanced → Practice |
| Redondances | Beaucoup | Éliminées |
| Export | Aucun | PowerPoint professionnel |
| Temps de formation | ~15 heures | ~8 heures |

---

## 🎯 Workflow Recommandé

1. **Collecte** - Rassemblez tous vos documents de formation
2. **Upload** - Utilisez `/ai/analyze-multiple-documents`
3. **Révision** - Consultez les modules générés
4. **Export** - Générez le PowerPoint avec `/ai/export-powerpoint`
5. **Formation** - Utilisez le PPT pour former vos équipes

---

## 🐛 Troubleshooting

### L'API ne répond pas

```bash
# Vérifier que le backend est lancé
docker-compose ps

# Redémarrer
docker-compose restart api

# Vérifier les logs
docker-compose logs api
```

### Erreur OpenAI

```bash
# Vérifier la clé API dans application.yml
cat src/main/resources/application.yml | grep api-key

# Tester avec un fichier simple
echo "Test" > test.txt
curl -F "files=@test.txt" http://localhost:5010/ai/analyze-multiple-documents
```

### PowerPoint vide ou corrompu

- Vérifier que Apache POI est bien dans `pom.xml`
- Relancer avec `mvn clean install`
- Vérifier les logs pour les erreurs

---

## 📞 Support

Pour toute question :
1. Consultez [GUIDE_UTILISATION.md](GUIDE_UTILISATION.md)
2. Consultez [API_EXAMPLES.md](API_EXAMPLES.md)
3. Vérifiez les logs : `docker-compose logs api`

---

## 📄 Fichiers Importants

```
v25_platform_training_backend/
├── README_FORMATION_CONSOLIDEE.md   ← Vous êtes ici
├── GUIDE_UTILISATION.md             ← Guide détaillé
├── API_EXAMPLES.md                  ← Exemples d'utilisation
├── test_api.py                      ← Script de test Python
├── docker-compose.yml               ← Configuration Docker
├── pom.xml                          ← Dépendances Maven
└── src/
    └── main/
        └── java/
            └── com/trainingplatform/
                ├── presentation/controllers/
                │   └── AIController.java         ← Nouveaux endpoints
                ├── application/services/
                │   ├── AIService.java            ← Analyse consolidée
                │   └── PPTExportService.java     ← Génération PPT
                └── ...
```

---

## ✨ Nouveautés

### Version 2.0 - Formation Consolidée

- ✅ Upload multiple de fichiers en une seule requête
- ✅ Analyse consolidée (5-8 modules au lieu de 30+)
- ✅ Élimination automatique des redondances
- ✅ Organisation logique du contenu
- ✅ Export PowerPoint professionnel
- ✅ Slides avec design moderne et icônes
- ✅ Support PDF, DOCX, TXT

---

## 🚀 Prochaines Étapes

Maintenant vous pouvez :

1. **Tester l'API** avec vos propres fichiers
2. **Intégrer** dans votre frontend (React/Vue/Angular)
3. **Personnaliser** les prompts AI dans `AIService.java`
4. **Améliorer** le design PPT dans `PPTExportService.java`

---

**Happy Training! 🎓**

*Créé le : 26 octobre 2025*  
*Version : 2.0 - Formation Consolidée*

