# 🚀 Script de démarrage du backend
# Ce script démarre MongoDB puis le backend Spring Boot

Write-Host @"

╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║       🚀 DÉMARRAGE AUTOMATIQUE DU BACKEND                       ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

# Étape 1 : Démarrer MongoDB
Write-Host "1️⃣  Démarrage de MongoDB..." -ForegroundColor Cyan
docker-compose up mongodb -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur : Docker Desktop n'est pas démarré !" -ForegroundColor Red
    Write-Host "   → Lancez Docker Desktop et relancez ce script" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Appuyez sur Entrée pour quitter"
    exit 1
}

Write-Host "✅ MongoDB démarré" -ForegroundColor Green
Write-Host ""

# Étape 2 : Attendre que MongoDB soit prêt
Write-Host "2️⃣  Attente de l'initialisation de MongoDB (10 secondes)..." -ForegroundColor Cyan
Start-Sleep -Seconds 10
Write-Host "✅ MongoDB prêt" -ForegroundColor Green
Write-Host ""

# Étape 3 : Démarrer le backend
Write-Host "3️⃣  Démarrage du Backend Spring Boot..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "⏳ Cela peut prendre 30-60 secondes..." -ForegroundColor Yellow
Write-Host "📋 Attendez le message 'Started TrainingPlatformApplication'" -ForegroundColor Yellow
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

# Démarrer Maven
mvn spring-boot:run

# Si Maven se termine
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "⚠️  Le backend s'est arrêté" -ForegroundColor Yellow
Write-Host ""
Write-Host "Causes possibles :" -ForegroundColor Cyan
Write-Host "  • Une erreur s'est produite (regardez les logs ci-dessus)" -ForegroundColor White
Write-Host "  • Le port 8080 est déjà utilisé" -ForegroundColor White
Write-Host "  • MongoDB ne répond pas" -ForegroundColor White
Write-Host ""
Read-Host "Appuyez sur Entrée pour fermer"

