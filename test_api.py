#!/usr/bin/env python3
"""
Script de test pour l'API de formation consolidée
Usage: python test_api.py document1.pdf document2.docx document3.pdf
"""

import sys
import requests
import json
from pathlib import Path

API_BASE_URL = "http://localhost:5010"

def print_header(text):
    """Affiche un header stylisé"""
    print("\n" + "="*60)
    print(f"  {text}")
    print("="*60 + "\n")

def test_health():
    """Teste si l'API est accessible"""
    print_header("🏥 Test de Santé de l'API")
    
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✅ API est accessible et fonctionne !")
            return True
        else:
            print(f"⚠️  API répond avec le code: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Impossible de joindre l'API: {e}")
        print("\n💡 Assurez-vous que le backend est lancé:")
        print("   docker-compose up --build")
        print("   ou")
        print("   mvn spring-boot:run")
        return False

def upload_multiple_documents(file_paths, industry="General"):
    """Upload plusieurs documents et génère la formation"""
    print_header(f"📤 Upload de {len(file_paths)} fichiers")
    
    # Vérifier que les fichiers existent
    files_to_upload = []
    for file_path in file_paths:
        path = Path(file_path)
        if not path.exists():
            print(f"❌ Fichier introuvable: {file_path}")
            continue
        print(f"📄 {path.name} ({path.stat().st_size / 1024:.2f} KB)")
        files_to_upload.append(path)
    
    if not files_to_upload:
        print("\n❌ Aucun fichier valide à uploader")
        return None
    
    # Préparer les fichiers pour l'upload
    files = [
        ('files', (file.name, open(file, 'rb'), 'application/octet-stream'))
        for file in files_to_upload
    ]
    
    data = {'industry': industry}
    
    print(f"\n🚀 Envoi vers l'API...")
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/ai/analyze-multiple-documents",
            files=files,
            data=data,
            timeout=120  # 2 minutes timeout pour l'analyse
        )
        
        # Fermer les fichiers
        for _, (_, file_obj, _) in files:
            file_obj.close()
        
        if response.status_code == 200:
            result = response.json()
            print("\n✅ Analyse complétée avec succès !")
            return result
        else:
            print(f"\n❌ Erreur HTTP {response.status_code}")
            print(response.text)
            return None
            
    except requests.exceptions.Timeout:
        print("\n⏱️  Timeout - L'analyse prend trop de temps")
        return None
    except requests.exceptions.RequestException as e:
        print(f"\n❌ Erreur lors de l'upload: {e}")
        return None

def display_result(result):
    """Affiche les résultats de l'analyse"""
    print_header("📊 Résultats de l'Analyse")
    
    analysis = result.get('analysis', {})
    curriculum = analysis.get('curriculum', {})
    
    print(f"📝 Nombre de fichiers traités: {result.get('filesCount', 0)}")
    print(f"📁 Fichiers: {', '.join(result.get('fileNames', []))}")
    print(f"💾 Taille totale: {result.get('totalSize', 0) / 1024:.2f} KB")
    
    print(f"\n📚 Titre de la formation: {curriculum.get('title', 'N/A')}")
    print(f"📖 Description: {curriculum.get('description', 'N/A')}")
    print(f"⏱️  Durée totale: {curriculum.get('totalDuration', 0)} minutes ({curriculum.get('totalDuration', 0) / 60:.1f} heures)")
    print(f"🎯 Méthodologie: {curriculum.get('methodology', 'N/A')}")
    
    modules = curriculum.get('modules', [])
    print(f"\n📦 Nombre de modules: {len(modules)}")
    
    if modules:
        print("\n📋 Liste des Modules:")
        for i, module in enumerate(modules, 1):
            print(f"\n  Module {i}: {module.get('title', 'N/A')}")
            print(f"  - Description: {module.get('description', 'N/A')}")
            print(f"  - Durée: {module.get('duration', 0)} minutes")
            print(f"  - Niveau: {module.get('difficulty', 'N/A')}")
            print(f"  - Éléments: {', '.join(module.get('enhancedElements', []))}")
    
    key_topics = analysis.get('keyTopics', [])
    if key_topics:
        print(f"\n🔑 Sujets clés: {', '.join(key_topics)}")
    
    learning_objectives = analysis.get('learningObjectives', [])
    if learning_objectives:
        print(f"\n🎯 Objectifs d'apprentissage:")
        for obj in learning_objectives:
            print(f"  ✓ {obj}")

def export_to_powerpoint(curriculum, output_file="Formation.pptx"):
    """Exporte le curriculum en PowerPoint"""
    print_header("📊 Export PowerPoint")
    
    print(f"🎨 Génération du PowerPoint...")
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/ai/export-powerpoint",
            json={'curriculum': curriculum},
            timeout=60
        )
        
        if response.status_code == 200:
            with open(output_file, 'wb') as f:
                f.write(response.content)
            
            file_size = Path(output_file).stat().st_size / 1024
            print(f"\n✅ PowerPoint généré avec succès !")
            print(f"📁 Fichier: {output_file}")
            print(f"💾 Taille: {file_size:.2f} KB")
            
            return True
        else:
            print(f"\n❌ Erreur HTTP {response.status_code}")
            print(response.text)
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"\n❌ Erreur lors de l'export: {e}")
        return False

def save_curriculum_json(curriculum, output_file="curriculum.json"):
    """Sauvegarde le curriculum en JSON"""
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(curriculum, f, indent=2, ensure_ascii=False)
    print(f"\n💾 Curriculum sauvegardé: {output_file}")

def main():
    """Fonction principale"""
    print_header("🚀 Test API Formation Consolidée")
    
    # Vérifier les arguments
    if len(sys.argv) < 2:
        print("❌ Usage: python test_api.py <fichier1> <fichier2> ... [industry]")
        print("\nExemples:")
        print("  python test_api.py doc1.pdf doc2.docx doc3.pdf")
        print("  python test_api.py doc1.pdf doc2.docx Insurance")
        print("\nIndustries supportées: General, Insurance, Healthcare, Technology, etc.")
        sys.exit(1)
    
    # Parser les arguments
    file_paths = []
    industry = "General"
    
    for arg in sys.argv[1:]:
        path = Path(arg)
        if path.suffix.lower() in ['.pdf', '.docx', '.txt', '.doc']:
            file_paths.append(arg)
        else:
            industry = arg
    
    if not file_paths:
        print("❌ Aucun fichier spécifié")
        sys.exit(1)
    
    # Test 1 : Health check
    if not test_health():
        sys.exit(1)
    
    # Test 2 : Upload et analyse
    result = upload_multiple_documents(file_paths, industry)
    
    if not result:
        sys.exit(1)
    
    # Afficher les résultats
    display_result(result)
    
    # Sauvegarder le curriculum
    curriculum = result['analysis']['curriculum']
    save_curriculum_json(curriculum)
    
    # Test 3 : Export PowerPoint
    export_choice = input("\n💡 Voulez-vous générer le PowerPoint maintenant ? (o/n): ")
    
    if export_choice.lower() in ['o', 'oui', 'y', 'yes']:
        export_to_powerpoint(curriculum)
    
    print_header("✅ Tests Terminés")
    print("📁 Fichiers générés:")
    print("  - curriculum.json (données JSON)")
    if export_choice.lower() in ['o', 'oui', 'y', 'yes']:
        print("  - Formation.pptx (présentation PowerPoint)")
    
    print("\n💡 Vous pouvez maintenant:")
    print("  - Ouvrir Formation.pptx dans PowerPoint")
    print("  - Modifier curriculum.json et régénérer le PPT")
    print("  - Utiliser les données dans votre frontend")

if __name__ == "__main__":
    main()

