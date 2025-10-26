# ⚡ Démarrage Rapide - 3 Minutes Chrono

## 🎯 Ce qui a changé

**AVANT** : 5 fichiers → 30 modules ❌  
**MAINTENANT** : 5 fichiers → 5-8 modules + PowerPoint ✅

---

## 🚀 Étape 1 : Lancer le Backend (30 secondes)

```bash
cd v25_platform_training_backend
docker-compose up --build
```

✅ Backend accessible sur **http://localhost:5010**

---

## 🧪 Étape 2 : Tester (2 minutes)

### Option A : Avec le Script Python (FACILE)

```bash
# Installer requests si nécessaire
pip install requests

# Tester avec vos fichiers
python test_api.py document1.pdf document2.docx document3.pdf
```

Le script va :
1. ✅ Uploader tous les fichiers
2. ✅ Afficher les modules générés
3. ✅ Proposer de générer le PowerPoint
4. ✅ Créer `curriculum.json` et `Formation.pptx`

### Option B : Avec cURL (RAPIDE)

```bash
# Upload et génération
curl -X POST http://localhost:5010/ai/analyze-multiple-documents \
  -F "files=@doc1.pdf" \
  -F "files=@doc2.docx" \
  -F "files=@doc3.pdf" \
  -F "industry=Insurance" \
  > result.json

# Export PowerPoint
curl -X POST http://localhost:5010/ai/export-powerpoint \
  -H "Content-Type: application/json" \
  -d "$(cat result.json | jq '{curriculum: .analysis.curriculum}')" \
  --output Formation.pptx
```

---

## 📊 Résultat

Vous obtenez :

1. **`curriculum.json`** - Données de la formation
   - 5-8 modules consolidés
   - Objectifs d'apprentissage
   - Durées et niveaux

2. **`Formation.pptx`** - PowerPoint professionnel
   - Slide de titre
   - Vue d'ensemble
   - 3 slides par module
   - Slide de conclusion
   - Design moderne avec couleurs et icônes

---

## 🎨 Exemple de Résultat

```json
{
  "success": true,
  "filesCount": 5,
  "analysis": {
    "curriculum": {
      "title": "Formation Complète en Assurance",
      "description": "Programme de formation consolidé",
      "totalDuration": 480,
      "modules": [
        {
          "title": "Introduction aux Concepts",
          "duration": 90,
          "difficulty": "beginner"
        },
        {
          "title": "Techniques Avancées",
          "duration": 120,
          "difficulty": "advanced"
        }
        // ... 3-6 autres modules
      ]
    }
  }
}
```

---

## 📚 Documentation Complète

Pour en savoir plus :

- **[README_FORMATION_CONSOLIDEE.md](README_FORMATION_CONSOLIDEE.md)** - Vue d'ensemble
- **[GUIDE_UTILISATION.md](GUIDE_UTILISATION.md)** - Guide détaillé
- **[API_EXAMPLES.md](API_EXAMPLES.md)** - Exemples de code
- **[RESUME_CHANGEMENTS.md](RESUME_CHANGEMENTS.md)** - Tous les changements

---

## 🆘 Problème ?

### L'API ne répond pas

```bash
# Vérifier le statut
curl http://localhost:5010/health

# Voir les logs
docker-compose logs api

# Redémarrer
docker-compose restart api
```

### Erreur Python

```bash
# Installer les dépendances
pip install requests

# Vérifier la version Python
python --version  # Doit être 3.7+
```

---

## ✅ C'est Tout !

Vous avez maintenant :
- ✅ Un système qui consolide intelligemment vos formations
- ✅ Export PowerPoint professionnel
- ✅ 5-8 modules au lieu de 30+

**Temps total : 3 minutes** ⚡

---

## 🎯 Commandes Essentielles

```bash
# Lancer le backend
docker-compose up --build

# Tester l'API
python test_api.py doc1.pdf doc2.docx doc3.pdf

# Voir les logs
docker-compose logs -f api

# Arrêter
docker-compose down
```

---

**Prêt à créer des formations professionnelles ! 🎓**

