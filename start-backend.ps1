# Script de démarrage du Backend avec chargement des variables d'environnement

Write-Host @"

╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║        🚀 DÉMARRAGE DU BACKEND AVEC VARIABLES ENV                ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Charger les variables d'environnement depuis .env
$envFile = Join-Path $PSScriptRoot ".env"

if (Test-Path $envFile) {
    Write-Host "📋 Chargement des variables depuis .env..." -ForegroundColor Yellow
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.+)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $value
            Write-Host "  ✅ $name chargé" -ForegroundColor Green
        }
    }
    Write-Host ""
} else {
    Write-Host "❌ Fichier .env introuvable : $envFile" -ForegroundColor Red
    Write-Host "   Le backend démarrera avec les valeurs par défaut" -ForegroundColor Yellow
    Write-Host ""
}

# Afficher les clés API (masquées)
Write-Host "🔑 Variables AI chargées:" -ForegroundColor Cyan
Write-Host "   OPENAI_API_KEY: $($env:OPENAI_API_KEY.Substring(0, 10))..." -ForegroundColor Gray
Write-Host "   ELEVENLABS_API_KEY: $($env:ELEVENLABS_API_KEY.Substring(0, 10))..." -ForegroundColor Gray
Write-Host ""

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "🚀 Démarrage de Spring Boot..." -ForegroundColor Green
Write-Host ""

# Démarrer le backend avec Maven
mvn spring-boot:run

