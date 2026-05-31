# RAG — Guide complet

Système de questions-réponses sur tes documents, avec interface client et interface admin.  
Fonctionne **100 % en local** (Ollama + pgvector), **sur GCP** (Vertex AI + Cloud Run) ou **sur AWS** (Bedrock + App Runner).

> Guide détaillé AWS → [README-AWS.md](./README-AWS.md)

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
10. [Déploiement sur AWS](#10-déploiement-sur-aws)
11. [Architecture](#11-architecture)

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

| Mode | LLM | Embeddings | Vecteurs | Stockage |
|------|-----|-----------|---------|---------|
| **Local** | Ollama (llama3.2, mistral…) | Ollama (nomic-embed-text) | PostgreSQL + pgvector | Filesystem |
| **GCP** | Vertex AI Gemini | Vertex AI text-embedding-004 | Vertex AI Vector Search | Cloud Storage |
| **AWS** | Bedrock (Claude, Llama…) | Titan Embed v2 (via KB) | Bedrock Knowledge Base | S3 |

Chaque composant est **indépendant** — tu peux mixer les providers via les variables d'env.

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

### Mode AWS

- Un compte AWS avec accès **Bedrock** activé (voir [README-AWS.md §1](./README-AWS.md))
- `aws` CLI installé et configuré (`aws configure`)
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

**Mode local / GCP** — traitement synchrone :
```
Fichier uploadé
    ↓
Découpage en chunks (~1000 caractères, overlap 200)
    ↓
Chaque chunk → embedding (Ollama ou Vertex AI)
    ↓
Vecteurs stockés dans pgvector ou Vertex AI Vector Search
    ↓
Statut → "ready"
```

**Mode AWS (Bedrock Knowledge Base)** — traitement asynchrone :
```
Fichier uploadé
    ↓
Upload vers S3
    ↓
StartIngestionJob déclenché → Bedrock gère chunking + embedding (Titan)
    ↓
Statut → "processing" (1-5 minutes)
    ↓
Bedrock indexe dans OpenSearch Serverless
```

---

## 5. Interface client

1. Va sur http://localhost:3000
2. Crée un compte (Register) ou connecte-toi
3. Pose une question dans la barre de saisie
4. La réponse s'affiche avec les sources utilisées

**Sélecteur de modèle** — En haut à droite, tu peux choisir le modèle pour chaque conversation :
- **Local** : llama3.2, mistral, gemma2, etc. (modèles Ollama téléchargés)
- **GCP** : gemini-1.5-pro, gemini-2.0-flash, etc.
- **AWS** : claude-3-5-sonnet, claude-3-haiku, llama-3-1-70b, mistral-large, etc.

---

## 6. Interface admin

URL : http://localhost:3001

### Onglet Documents
- **Upload** : glisser-déposer ou cliquer pour choisir un fichier
- **Statuts** : `pending` → `processing` → `ready` (ou `error`)
- **Supprimer** : l'icône poubelle supprime le document ET ses vecteurs (ou déclenche une resynchronisation KB en mode AWS)

### Onglet Users
- Liste de tous les utilisateurs inscrits
- **Active / Disabled** : clic sur le badge pour activer ou désactiver un compte

### Onglet Models
- Vue des modèles disponibles selon le provider actif et le modèle par défaut

### Stats en haut
- Nombre de documents indexés
- Nombre de chunks dans la base vectorielle
- Nombre d'utilisateurs inscrits

---

## 7. Configuration

Copie `.env.example` en `.env` dans le dossier `backend/` :

```bash
cp backend/.env.example backend/.env
```

### Variables clés

```env
# ── Providers ──────────────────────────────────────────
LLM_PROVIDER=local        # local | vertexai | bedrock
VECTOR_STORE=local        # local | vertexai | bedrock
STORAGE_PROVIDER=local    # local | gcs | s3

# ── Sécurité ───────────────────────────────────────────
SECRET_KEY=change-me      # clé JWT — change en prod
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=adminpassword

# ── Mode local ─────────────────────────────────────────
OLLAMA_LLM_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# ── Mode GCP ───────────────────────────────────────────
# GCP_PROJECT_ID=ton-project
# DEFAULT_LLM_MODEL=gemini-1.5-pro
# ...

# ── Mode AWS ───────────────────────────────────────────
# AWS_REGION=us-east-1
# BEDROCK_LLM_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0
# BEDROCK_KNOWLEDGE_BASE_ID=XXXXXXXXXX
# S3_BUCKET_NAME=ton-bucket
# ...
```

> En mode Docker Compose, les variables sont déjà définies dans `docker-compose.yml`. Le fichier `.env` sert pour un lancement direct du backend sans Docker.

### Changer le modèle LLM par défaut (local)

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

### Modèles par provider

**Local (Ollama)**
```bash
docker compose exec ollama ollama pull qwen2.5   # ajouter un nouveau modèle
docker compose exec ollama ollama list           # voir les modèles disponibles
```

**GCP (Vertex AI)**

| ID | Modèle |
|----|--------|
| `gemini-1.5-pro` | gemini-1.5-pro-002 |
| `gemini-1.5-flash` | gemini-1.5-flash-002 |
| `gemini-2.0-flash` | gemini-2.0-flash-001 |

**AWS (Bedrock)** — nécessite activation dans la console Bedrock

| ID | Modèle |
|----|--------|
| `claude-3-5-sonnet` | anthropic.claude-3-5-sonnet-20241022-v2:0 |
| `claude-3-haiku` | anthropic.claude-3-haiku-20240307-v1:0 |
| `llama-3-1-70b` | meta.llama3-1-70b-instruct-v1:0 |
| `mistral-large` | mistral.mistral-large-2402-v1:0 |
| `titan-text` | amazon.titan-text-premier-v1:0 |

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

```
backend_url                     = "https://dev-rag-backend-xxx.run.app"
client_url                      = "https://dev-rag-client-xxx.run.app"
admin_url                       = "https://dev-rag-admin-xxx.run.app"
vector_search_index_id          = "projects/.../indexes/..."
vector_search_endpoint_id       = "projects/.../indexEndpoints/..."
vector_search_deployed_index_id = "dev_rag_deployed"
artifact_registry               = "us-central1-docker.pkg.dev/PROJECT/rag"
```

### Étape 2 — Builder et pusher les images

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev

REGISTRY="us-central1-docker.pkg.dev/TON_PROJECT_ID/rag"

docker build -t $REGISTRY/backend:latest         ./backend
docker build -t $REGISTRY/frontend-client:latest ./frontend-client
docker build -t $REGISTRY/frontend-admin:latest  ./frontend-admin

docker push $REGISTRY/backend:latest
docker push $REGISTRY/frontend-client:latest
docker push $REGISTRY/frontend-admin:latest
```

### Étape 3 — Déployer sur Cloud Run

```bash
gcloud run deploy dev-rag-backend \
  --image $REGISTRY/backend:latest --region us-central1

gcloud run deploy dev-rag-client \
  --image $REGISTRY/frontend-client:latest --region us-central1

gcloud run deploy dev-rag-admin \
  --image $REGISTRY/frontend-admin:latest --region us-central1
```

### Étape 4 — CI/CD automatique avec Cloud Build

Connecte Cloud Build à ton repo GitHub dans la console GCP — chaque push déclenche un build automatique via `cloudbuild.yaml`.

### Basculer du local vers GCP

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

## 10. Déploiement sur AWS

> Guide complet : **[README-AWS.md](./README-AWS.md)**

### Résumé rapide

```bash
# 1. Activer les modèles dans la console Bedrock (Claude + Titan Embed)

# 2. Infrastructure
cd terraform-aws
cp terraform.tfvars.example terraform.tfvars
terraform init && terraform apply

# 3. Build + push vers ECR
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ECR="$ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/dev-rag"
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

docker build -t $ECR/backend:latest         ./backend  && docker push $ECR/backend:latest
docker build -t $ECR/frontend-client:latest ./frontend-client && docker push $ECR/frontend-client:latest
docker build -t $ECR/frontend-admin:latest  ./frontend-admin  && docker push $ECR/frontend-admin:latest

# 4. Déployer sur App Runner (voir README-AWS.md §3)
```

### Basculer du local vers AWS

```env
LLM_PROVIDER=bedrock
VECTOR_STORE=bedrock
STORAGE_PROVIDER=s3

AWS_REGION=us-east-1
S3_BUCKET_NAME=ton-bucket-rag
BEDROCK_KNOWLEDGE_BASE_ID=XXXXXXXXXX
BEDROCK_DATA_SOURCE_ID=YYYYYYYYYY
BEDROCK_LLM_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0
```

---

## 11. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Navigateur                             │
│  ┌───────────────────────┐    ┌─────────────────────────────┐   │
│  │   frontend-client     │    │   frontend-admin            │   │
│  │   Next.js :3000       │    │   Next.js :3001             │   │
│  │   • Login / Register  │    │   • Upload documents        │   │
│  │   • Chat              │    │   • Gestion utilisateurs    │   │
│  │   • Sélecteur LLM     │    │   • Stats / Modèles         │   │
│  └───────────┬───────────┘    └─────────────┬───────────────┘   │
└──────────────┼─────────────────────────────-┼───────────────────┘
               │ HTTP/REST                    │ HTTP/REST
               ▼                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    backend FastAPI :8080                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                      Services                              │  │
│  │  LLMService       → Ollama | Vertex AI Gemini | Bedrock    │  │
│  │  EmbeddingService → Ollama | Vertex AI                     │  │
│  │  VectorStore      → pgvector | Vertex AI VS | Bedrock KB   │  │
│  │  StorageService   → filesystem | GCS | S3                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────┬─────────────────────┬──────────────┘
       │                      │                     │
       ▼                      ▼                     ▼
  ┌─────────┐          ┌────────────┐      ┌────────────────┐
  │  Mode   │          │    BDD     │      │    Fichiers    │
  │  local  │          │            │      │                │
  │  Ollama │          │ PostgreSQL │      │ filesystem     │
  │  :11434 │          │  (RDS en   │      │ GCS            │
  │         │          │   cloud)   │      │ S3             │
  └─────────┘          └────────────┘      └────────────────┘

  Vecteurs selon le provider :
  ┌──────────────────────────────────────────────────────────┐
  │  local   → colonne pgvector dans PostgreSQL              │
  │  vertexai → Vertex AI Vector Search (Matching Engine)    │
  │  bedrock  → Bedrock Knowledge Base + OpenSearch Serverless│
  └──────────────────────────────────────────────────────────┘
```

### Flux d'une question

```
POST /chat  { question, model? }
       ↓
Mode local/GCP :                    Mode AWS (Bedrock) :
  embed_query(question)               bedrock-agent-runtime.retrieve()
       ↓                              → Bedrock gère embedding + recherche
  vector_store.query()                       ↓
       ↓                              passages pertinents
  SELECT chunks WHERE id IN ...              ↓
       ↓                         LLM(contexte + question) → réponse
  LLM(contexte + question)
       ↓
{ answer, sources, model }
```

---

## Commandes utiles

```bash
# ── Local ──────────────────────────────────────────────────────────
docker compose logs -f backend          # logs en temps réel
docker compose restart backend          # relancer le backend
docker compose exec ollama ollama list  # modèles Ollama disponibles
docker compose exec ollama ollama pull gemma2  # télécharger un modèle
docker compose down                     # arrêter (données conservées)
docker compose down -v                  # arrêter + effacer les données

# ── PostgreSQL ─────────────────────────────────────────────────────
docker compose exec postgres psql -U rag -d rag
  \dt                                   # lister les tables
  SELECT name, status FROM documents;
  SELECT COUNT(*) FROM document_chunks;

# ── AWS ────────────────────────────────────────────────────────────
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id KB_ID --data-source-id DS_ID
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id KB_ID --data-source-id DS_ID
aws s3 ls s3://TON_BUCKET/documents/ --recursive
aws logs tail /aws/apprunner/dev-rag-backend/.../application --follow
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
docker compose exec ollama ollama list  # vérifier que le modèle est téléchargé
```

**"No relevant documents found" (local)**
- Le document a-t-il le statut `ready` dans l'admin ?
- `nomic-embed-text` est-il bien téléchargé ?
- Les PDF scannés sans OCR ne fonctionnent pas

**"No relevant documents found" (AWS)**
- L'ingestion Bedrock est asynchrone — attends 2-5 min
- Vérifie le statut : `aws bedrock-agent list-ingestion-jobs ...`

**AccessDeniedException Bedrock**
- Le modèle n'est pas activé dans la console Bedrock
- Vérifie les permissions IAM du rôle App Runner

**Qualité des réponses insuffisante**
- Utilise un modèle plus grand (`llama3.1:8b`, `mistral`, `claude-3-5-sonnet`)
- `gemma2` et `mistral-large` fonctionnent très bien en français
- Vérifie que tes documents sont dans la même langue que tes questions
