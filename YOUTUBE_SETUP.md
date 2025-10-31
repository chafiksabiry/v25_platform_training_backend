# 📥 Installation de yt-dlp pour l'analyse complète YouTube

## 🎯 Fonctionnalité

Avec `yt-dlp` installé, le système peut :
- ✅ Télécharger automatiquement l'audio des vidéos YouTube
- ✅ Transcrire le contenu avec OpenAI Whisper
- ✅ Générer des formations basées sur le **contenu réel audio** des vidéos

## 📦 Installation de yt-dlp

### Option 1 : Via pip (Recommandé)

```bash
pip install yt-dlp
```

### Option 2 : Via winget (Windows)

```bash
winget install yt-dlp
```

### Option 3 : Via scoop (Windows)

```bash
scoop install yt-dlp
```

### Option 4 : Téléchargement manuel

1. Télécharger depuis : https://github.com/yt-dlp/yt-dlp/releases
2. Télécharger `yt-dlp.exe` (Windows) ou `yt-dlp` (Linux/Mac)
3. Placer le fichier dans un dossier dans votre PATH

## ✅ Vérification de l'installation

```bash
yt-dlp --version
```

Vous devriez voir la version de yt-dlp s'afficher.

## 🚀 Utilisation

Une fois `yt-dlp` installé, le système l'utilisera automatiquement :

1. **Tentative 1** : Extraction des sous-titres existants (rapide)
2. **Tentative 2** : Téléchargement audio + transcription Whisper (si pas de sous-titres)
3. **Fallback** : Métadonnées uniquement

## 📝 Exemple

```
URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ

Processus:
1. Vérifie les sous-titres → Pas disponible
2. Télécharge l'audio (MP3) → ✅
3. Transcrit avec Whisper → ✅
4. Analyse avec GPT-4 → ✅
5. Génère le curriculum → ✅
```

## ⚠️ Notes

- **Fichiers temporaires** : Les fichiers audio sont supprimés automatiquement après transcription
- **Limite de taille** : 100 MB par vidéo (configurable)
- **Format** : MP3 à la meilleure qualité
- **Temps** : 2-5 minutes pour une vidéo de 30 minutes

## 🔧 Dépendances système

`yt-dlp` nécessite `ffmpeg` pour la conversion audio :

### Windows
```bash
winget install ffmpeg
# ou
scoop install ffmpeg
```

### Linux
```bash
sudo apt install ffmpeg
```

### macOS
```bash
brew install ffmpeg
```

## 🎯 Résultat

Avec tout installé, vous obtiendrez :
- ✅ Transcription complète du contenu audio
- ✅ 6 modules de formation détaillés
- ✅ Contenu basé sur ce qui est **réellement dit** dans la vidéo
- ✅ Même pour les vidéos sans sous-titres !

