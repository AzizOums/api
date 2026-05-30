# RAG — Guide complet

Système de questions-réponses sur tes documents, avec interface client et interface admin.  
Fonctionne **100 % en local** (Ollama + pgvector) ou **sur GCP** (Vertex AI + Cloud Run).

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Prérequis](#2-prérequis)
3. [Démarrage en local](#3-démarrage-en-local)
4. [Ajouter des documents](#4-ajouter-des-documents)
5. [Interface client](#5-interface-client)
6. [Interface admin](#6-interface-admin)
7. [Configuration](#7-configuration)
8. [Changer de modèle LLM](#8-changer-de-modèle-llm)
9. [Déploiement sur GCP](#9-déploiement-sur-gcp)
10. [Architecture](#10-architecture)

---

## 1. Vue d'ensemble

```
Tu poses une question
       ↓
Le texte est transformé en vecteur (embedding)
       ↓
On cherche les passages les plus proches dans tes documents
       ↓
Ces passages + ta question sont envoyés au LLM
       ↓
Le LLM génère une réponse basée sur tes documents
```

**Stack locale :** Ollama (LLM + embeddings) · PostgreSQL + pgvector · stockage fichiers local  
**Stack GCP :** Vertex AI Gemini · Vertex AI Vector Search · Cloud SQL · Cloud Storage · Cloud Run

---

## 2. Prérequis

### Mode local

| Outil | Version minimale | Installation |
|-------|-----------------|--------------|
| Docker | 24+ | https://docs.docker.com/get-docker/ |
| Docker Compose | 2.20+ | inclus avec Docker Desktop |

C'est tout. Ollama tourne dans un conteneur, pas besoin de l'installer sur ta machine.

> **GPU (optionnel)** — Si tu as une carte NVIDIA, décommente la section `deploy` du service `ollama` dans `docker-compose.yml` pour accélérer l'inférence x5-x10.

### Mode GCP

- Un projet GCP avec facturation activée
- `gcloud` CLI installé et authentifié
- `terraform` >= 1.5

---

## 3. Démarrage en local

### Étape 1 — Lancer les services

```bash
docker compose up -d
```

Cela démarre :
- **PostgreSQL + pgvector** (base de données + stockage des vecteurs)
- **Ollama** (LLM local)
- **Backend** FastAPI sur le port 8080
- **Frontend client** sur le port 3000
- **Frontend admin** sur le port 3001

### Étape 2 — Télécharger les modèles Ollama

À faire **une seule fois**. Les modèles sont ensuite sauvegardés dans un volume Docker.

```bash
# Modèle d'embeddings (obligatoire)
docker compose exec ollama ollama pull nomic-embed-text

# Modèle LLM — choisir selon ta RAM disponible
docker compose exec ollama ollama pull llama3.2        # 2 GB  — recommandé pour commencer
docker compose exec ollama ollama pull mistral         # 4 GB  — bon équilibre qualité/vitesse
docker compose exec ollama ollama pull llama3.1:8b     # 5 GB  — meilleure qualité
docker compose exec ollama ollama pull gemma2          # 5 GB  — très bon en français
```

> Le premier `pull` peut prendre quelques minutes selon ta connexion.

### Étape 3 — Vérifier que tout fonctionne

```bash
# Santé du backend
curl http://localhost:8080/health
# → {"status":"healthy"}

# Vérifier qu'Ollama répond
curl http://localhost:11434/api/tags
# → liste des modèles téléchargés
```

### Accès

| Interface | URL | Identifiants |
|-----------|-----|-------------|
| **Client** (utilisateurs) | http://localhost:3000 | Créer un compte via "Register" |
| **Admin** | http://localhost:3001 | `admin@example.com` / `adminpassword` |
| **API docs** | http://localhost:8080/docs | — |

---

## 4. Ajouter des documents

### Via l'interface admin (recommandé)

1. Va sur http://localhost:3001
2. Connecte-toi avec les identifiants admin
3. Dans l'onglet **Documents**, glisse-dépose un fichier ou clique **Choose file**
4. Le document passe par `processing` puis `ready` — c'est prêt

**Formats supportés :** `.txt` · `.pdf` · `.docx` · `.md`

### Via l'API

```bash
curl -X POST http://localhost:8080/api/v1/documents/upload \
  -H "Authorization: Bearer TON_TOKEN_ADMIN" \
  -F "file=@/chemin/vers/document.pdf"
```

Pour obtenir le token admin :
```bash
curl -X POST http://localhost:8080/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"adminpassword"}'
```

### Ce qui se passe en coulisse

```
Fichier uploadé
    ↓
Découpage en chunks de ~1000 caractères (overlap 200)
    ↓
Chaque chunk → embedding via Ollama (nomic-embed-text)
    ↓
Vecteurs stockés dans pgvector (colonne embedding de document_chunks)
    ↓
Statut → "ready"
```

---

## 5. Interface client

1. Va sur http://localhost:3000
2. Crée un compte (Register) ou connecte-toi
3. Pose une question dans la barre de saisie
4. La réponse s'affiche avec les sources utilisées

**Sélecteur de modèle** — En haut à droite, tu peux choisir quel modèle Ollama utiliser pour chaque conversation (llama3.2, mistral, etc.). Seuls les modèles que tu as téléchargés fonctionneront.

---

## 6. Interface admin

URL : http://localhost:3001

### Onglet Documents
- **Upload** : glisser-déposer ou cliquer pour choisir un fichier
- **Statuts** : `pending` → `processing` → `ready` (ou `error`)
- **Supprimer** : l'icône poubelle supprime le document ET ses vecteurs

### Onglet Users
- Liste de tous les utilisateurs inscrits
- **Active / Disabled** : clic sur le badge pour activer ou désactiver un compte

### Onglet Models
- Vue des modèles disponibles et du modèle par défaut

### Stats en haut
- Nombre de documents indexés
- Nombre de chunks (passages) dans la base vectorielle
- Nombre d'utilisateurs inscrits

---

## 7. Configuration

Copie `.env.example` en `.env` dans le dossier `backend/` :

```bash
cp backend/.env.example backend/.env
```

### Variables principales

```env
# Quel provider utiliser pour chaque composant
LLM_PROVIDER=local        # local | vertexai
VECTOR_STORE=local        # local | vertexai
STORAGE_PROVIDER=local    # local | gcs

# Sécurité
SECRET_KEY=change-me      # clé JWT — change en prod
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=adminpassword

# Modèles Ollama (mode local)
OLLAMA_LLM_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

> En mode Docker Compose, les variables sont déjà définies dans `docker-compose.yml`. Le fichier `.env` sert pour un lancement direct du backend sans Docker.

### Changer le modèle LLM par défaut

```env
OLLAMA_LLM_MODEL=mistral   # ou llama3.1:8b, gemma2, qwen2.5...
```

Puis relancer le backend :
```bash
docker compose restart backend
```

---

## 8. Changer de modèle LLM

### À la volée (par requête)

L'interface client propose un sélecteur de modèle. Tu peux aussi le spécifier dans l'API :

```bash
curl -X POST http://localhost:8080/api/v1/chat/ \
  -H "Authorization: Bearer TON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "Résume ce document", "model": "mistral"}'
```

### Voir les modèles disponibles

```bash
curl http://localhost:8080/api/v1/chat/models \
  -H "Authorization: Bearer TON_TOKEN"
```

### Ajouter un nouveau modèle Ollama

```bash
# Télécharger
docker compose exec ollama ollama pull qwen2.5

# Vérifier
docker compose exec ollama ollama list
```

Il est immédiatement disponible dans le sélecteur.

---

## 9. Déploiement sur GCP

### Prérequis

```bash
gcloud auth login
gcloud auth application-default login
```

### Étape 1 — Infrastructure Terraform

```bash
cd terraform

# Copier et remplir les variables
cp terraform.tfvars.example terraform.tfvars
# → édite terraform.tfvars avec ton project_id, region, mots de passe, etc.

terraform init
terraform apply
```

> L'index Vertex AI Vector Search prend **20-40 minutes** à créer, c'est normal.

Après l'apply, récupère les outputs :

```bash
terraform output
```

Tu obtiendras :
```
backend_url                   = "https://dev-rag-backend-xxx.run.app"
client_url                    = "https://dev-rag-client-xxx.run.app"
admin_url                     = "https://dev-rag-admin-xxx.run.app"
vector_search_index_id        = "projects/.../indexes/..."
vector_search_endpoint_id     = "projects/.../indexEndpoints/..."
vector_search_deployed_index_id = "dev_rag_deployed"
artifact_registry             = "us-central1-docker.pkg.dev/PROJECT/rag"
```

### Étape 2 — Builder et pusher les images

```bash
# Configurer Docker pour Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

REGISTRY="us-central1-docker.pkg.dev/TON_PROJECT_ID/rag"

docker build -t $REGISTRY/backend:latest ./backend
docker build -t $REGISTRY/frontend-client:latest ./frontend-client
docker build -t $REGISTRY/frontend-admin:latest ./frontend-admin

docker push $REGISTRY/backend:latest
docker push $REGISTRY/frontend-client:latest
docker push $REGISTRY/frontend-admin:latest
```

### Étape 3 — Déployer sur Cloud Run

```bash
gcloud run deploy dev-rag-backend \
  --image $REGISTRY/backend:latest \
  --region us-central1

gcloud run deploy dev-rag-client \
  --image $REGISTRY/frontend-client:latest \
  --region us-central1

gcloud run deploy dev-rag-admin \
  --image $REGISTRY/frontend-admin:latest \
  --region us-central1
```

### Étape 4 — CI/CD automatique avec Cloud Build

Connecte Cloud Build à ton repo GitHub dans la console GCP, puis chaque push déclenche un build automatique via `cloudbuild.yaml`.

### Basculer du local vers GCP

Il suffit de changer les variables d'environnement du backend :

```env
LLM_PROVIDER=vertexai
VECTOR_STORE=vertexai
STORAGE_PROVIDER=gcs

GCP_PROJECT_ID=ton-project-id
GCS_BUCKET_NAME=ton-project-id-dev-rag-docs
VERTEX_SEARCH_INDEX_ID=projects/.../indexes/...
VECTOR_SEARCH_ENDPOINT_ID=projects/.../indexEndpoints/...
VECTOR_SEARCH_DEPLOYED_INDEX_ID=dev_rag_deployed
DEFAULT_LLM_MODEL=gemini-1.5-pro
```

---

## 10. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Navigateur                           │
│                                                             │
│  ┌──────────────────┐        ┌──────────────────────────┐  │
│  │  frontend-client │        │    frontend-admin        │  │
│  │  Next.js :3000   │        │    Next.js :3001         │  │
│  │                  │        │                          │  │
│  │  • Login/Register│        │  • Upload documents      │  │
│  │  • Chat          │        │  • Gérer utilisateurs    │  │
│  │  • Sélecteur LLM │        │  • Stats                 │  │
│  └────────┬─────────┘        └────────────┬─────────────┘  │
└───────────┼──────────────────────────────┼─────────────────┘
            │ HTTP/REST                    │ HTTP/REST
            ▼                             ▼
┌───────────────────────────────────────────────────────────┐
│                   backend FastAPI :8080                   │
│                                                           │
│  POST /api/v1/auth/login|register                         │
│  POST /api/v1/chat/          → pipeline RAG               │
│  POST /api/v1/documents/upload → ingestion                │
│  GET  /api/v1/admin/stats|users|models                    │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Services internes                      │  │
│  │  EmbeddingService  → Ollama | Vertex AI             │  │
│  │  LLMService        → Ollama | Vertex AI Gemini      │  │
│  │  VectorStoreService→ pgvector | Vertex AI VS        │  │
│  │  StorageService    → filesystem | GCS               │  │
│  └─────────────────────────────────────────────────────┘  │
└────┬──────────────────────┬─────────────────────┬─────────┘
     │                      │                     │
     ▼                      ▼                     ▼
┌─────────┐          ┌────────────┐        ┌──────────────┐
│ Ollama  │          │ PostgreSQL │        │  Fichiers    │
│  :11434 │          │ + pgvector │        │  /uploads    │
│         │          │   :5432    │        │  ou GCS      │
│ • LLM   │          │           │        └──────────────┘
│ • Embed │          │ • users    │
└─────────┘          │ • documents│
  (local)            │ • chunks   │
                     │ • vectors  │
                     └────────────┘
```

### Flux d'une question

```
1. POST /chat  { question, model? }
       ↓
2. embed_query(question)          → vecteur 768 dims
       ↓
3. vector_store.query(vecteur)    → top-5 chunk_ids
       ↓
4. SELECT content WHERE id IN ... → textes des chunks
       ↓
5. LLM(contexte + question)       → réponse
       ↓
6. { answer, sources, model }
```

### Flux d'ingestion d'un document

```
1. POST /documents/upload  (fichier)
       ↓
2. Sauvegarde fichier (local ou GCS)
       ↓
3. Découpage en chunks (1000 chars, overlap 200)
       ↓
4. embed_documents(chunks)        → liste de vecteurs
       ↓
5. INSERT document_chunks + upsert vecteurs dans pgvector
       ↓
6. status = "ready"
```

---

## Commandes utiles

```bash
# Logs en temps réel
docker compose logs -f backend

# Redémarrer un service
docker compose restart backend

# Voir les modèles Ollama téléchargés
docker compose exec ollama ollama list

# Supprimer un modèle Ollama
docker compose exec ollama ollama rm mistral

# Accéder à la base PostgreSQL
docker compose exec postgres psql -U rag -d rag

# Voir les documents indexés
docker compose exec postgres psql -U rag -d rag -c "SELECT name, status FROM documents;"

# Voir le nombre de chunks par document
docker compose exec postgres psql -U rag -d rag \
  -c "SELECT d.name, COUNT(c.id) as chunks FROM documents d JOIN document_chunks c ON c.document_id = d.id GROUP BY d.name;"

# Tout arrêter (données conservées)
docker compose down

# Tout effacer y compris les données
docker compose down -v
```

---

## Résolution de problèmes

**Le backend ne démarre pas**
```bash
docker compose logs backend
# Souvent : DATABASE_URL incorrecte ou postgres pas encore prêt
```

**Ollama ne répond pas / timeout**
```bash
docker compose logs ollama
# Vérifier que le modèle est bien téléchargé :
docker compose exec ollama ollama list
```

**"No relevant documents found"**
- Vérifie que le document a le statut `ready` dans l'admin
- Vérifie que `nomic-embed-text` est bien téléchargé
- Le document est-il en texte lisible ? (les PDF scannés sans OCR ne fonctionnent pas)

**Qualité des réponses insuffisante**
- Essaie un modèle plus grand (`llama3.1:8b`, `mistral`)
- Tes documents sont-ils dans la même langue que tes questions ?
- `gemma2` fonctionne très bien en français
