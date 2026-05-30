# RAG — Guide AWS

Déploiement du système RAG sur Amazon Web Services.  
Exactement les mêmes interfaces client et admin, avec le backend AWS à la place de GCP.

> Pour le mode local (Ollama + pgvector), voir [README.md](./README.md).

---

## Équivalences GCP → AWS

| Composant | GCP | AWS |
|-----------|-----|-----|
| LLM | Vertex AI Gemini | **Bedrock** (Claude, Llama, Mistral…) |
| Embeddings | Vertex AI text-embedding-004 | **Bedrock Titan Embed v2** (via KB) |
| Vector store | Vertex AI Vector Search | **Bedrock Knowledge Base** + OpenSearch Serverless |
| Base de données | Cloud SQL PostgreSQL | **RDS PostgreSQL** |
| Stockage fichiers | Cloud Storage | **S3** |
| Hébergement apps | Cloud Run | **App Runner** |
| Registry images | Artifact Registry | **ECR** |
| Secrets | Secret Manager | **Secrets Manager** |
| CI/CD | Cloud Build | **CodeBuild** |
| Réseau | VPC + Serverless Connector | **VPC + NAT Gateway + App Runner VPC Connector** |

---

## Sommaire

1. [Prérequis](#1-prérequis)
2. [Démarrage en local avec providers AWS](#2-démarrage-en-local-avec-providers-aws)
3. [Déploiement sur AWS](#3-déploiement-sur-aws)
4. [Ajouter des documents](#4-ajouter-des-documents)
5. [Changer de modèle LLM](#5-changer-de-modèle-llm)
6. [CI/CD avec CodeBuild](#6-cicd-avec-codebuild)
7. [Architecture AWS](#7-architecture-aws)
8. [Commandes utiles](#8-commandes-utiles)
9. [Résolution de problèmes](#9-résolution-de-problèmes)

---

## 1. Prérequis

- Un compte AWS avec accès à **Bedrock** (demande d'accès aux modèles requise)
- `aws` CLI installé et configuré (`aws configure`)
- `terraform` >= 1.5
- `docker` installé

### Activer les modèles Bedrock

Les modèles Bedrock ne sont pas activés par défaut. Il faut les activer manuellement :

1. Va sur la [console Bedrock](https://console.aws.amazon.com/bedrock)
2. Menu gauche → **Model access**
3. Clique **Manage model access**
4. Active au minimum :
   - `Amazon Titan Text Embeddings V2` (pour la KB)
   - `Anthropic Claude 3.5 Sonnet` (LLM par défaut)
5. Clique **Save changes** — l'accès est accordé en quelques minutes

---

## 2. Démarrage en local avec providers AWS

Tu peux tester le code localement en pointant vers des services AWS réels, sans déployer les apps.

```bash
cd backend
cp .env.example .env
```

Édite `.env` :
```env
LLM_PROVIDER=bedrock
VECTOR_STORE=bedrock
STORAGE_PROVIDER=s3

AWS_REGION=us-east-1
S3_BUCKET_NAME=ton-bucket-rag
BEDROCK_KNOWLEDGE_BASE_ID=XXXXXXXXXX
BEDROCK_DATA_SOURCE_ID=XXXXXXXXXX

DATABASE_URL=postgresql://rag:ragpassword@localhost:5432/rag
SECRET_KEY=dev-secret-key
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=adminpassword
```

Lance juste PostgreSQL en local :
```bash
docker run -d -p 5432:5432 \
  -e POSTGRES_DB=rag \
  -e POSTGRES_USER=rag \
  -e POSTGRES_PASSWORD=ragpassword \
  postgres:16

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

Les credentials AWS sont récupérés automatiquement via `~/.aws/credentials` ou les variables d'env `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

---

## 3. Déploiement sur AWS

### Étape 1 — Infrastructure Terraform

```bash
cd terraform-aws

cp terraform.tfvars.example terraform.tfvars
# → édite terraform.tfvars
```

```hcl
region         = "us-east-1"
environment    = "dev"
db_password    = "un-mot-de-passe-fort"
secret_key     = "un-secret-jwt-de-32-caracteres-minimum"
admin_email    = "admin@exemple.com"
admin_password = "un-mot-de-passe-fort"
```

```bash
terraform init
terraform apply
```

> L'apply crée ~30 ressources et prend **5-10 minutes**.  
> La création de la Bedrock Knowledge Base peut prendre quelques minutes supplémentaires.

Récupère les outputs :
```bash
terraform output
```

```
backend_url        = "https://xxxxxxxx.us-east-1.awsapprunner.com"
client_url         = "https://yyyyyyyy.us-east-1.awsapprunner.com"
admin_url          = "https://zzzzzzzz.us-east-1.awsapprunner.com"
ecr_registry       = "123456789.dkr.ecr.us-east-1.amazonaws.com/dev-rag"
s3_bucket          = "123456789-dev-rag-docs"
knowledge_base_id  = "XXXXXXXXXX"
data_source_id     = "YYYYYYYYYY"
```

### Étape 2 — Builder et pusher les images Docker

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
ECR="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/dev-rag"

# Authentification ECR
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Build
docker build -t $ECR/backend:latest         ./backend
docker build -t $ECR/frontend-client:latest ./frontend-client
docker build -t $ECR/frontend-admin:latest  ./frontend-admin

# Push
docker push $ECR/backend:latest
docker push $ECR/frontend-client:latest
docker push $ECR/frontend-admin:latest
```

### Étape 3 — Déployer sur App Runner

```bash
BACKEND_ARN=$(aws apprunner list-services \
  --query "ServiceSummaryList[?ServiceName=='dev-rag-backend'].ServiceArn" \
  --output text)

aws apprunner update-service \
  --service-arn $BACKEND_ARN \
  --source-configuration '{"imageRepository":{"imageIdentifier":"'$ECR/backend:latest'","imageRepositoryType":"ECR"}}'

# Répète pour client et admin
```

### Accès

| Interface | URL |
|-----------|-----|
| **Client** | `client_url` (output terraform) |
| **Admin** | `admin_url` |
| **API docs** | `backend_url/docs` |

---

## 4. Ajouter des documents

### Via l'interface admin

Même interface qu'en local :
1. Va sur l'URL admin
2. Login avec email/password admin
3. Onglet **Documents** → glisse-dépose ou clique

### Ce qui se passe en coulisse (mode AWS)

```
Fichier uploadé par l'admin
    ↓
Upload vers S3 (documents/{uuid}/fichier.pdf)
    ↓
Appel StartIngestionJob → Bedrock KB traite de façon asynchrone :
  • Découpage en chunks (300 tokens, overlap 20%)
  • Embedding via Amazon Titan Embed v2
  • Stockage dans OpenSearch Serverless
    ↓
Statut → "processing" (quelques minutes)
    ↓
Prochains uploads déclencheront une resynchronisation automatique
```

> **Important :** Contrairement au mode local, l'ingestion Bedrock est **asynchrone**. Le document passe en `processing` et peut prendre 1-5 minutes avant d'être interrogeable. Clique sur la corbeille puis ré-upload pour forcer une re-synchronisation.

### Forcer une re-synchronisation manuelle

```bash
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id XXXXXXXXXX \
  --data-source-id YYYYYYYYYY
```

---

## 5. Changer de modèle LLM

### Modèles disponibles

| ID | Modèle AWS Bedrock | Remarque |
|----|-------------------|---------|
| `claude-3-5-sonnet` | `anthropic.claude-3-5-sonnet-20241022-v2:0` | Meilleure qualité (défaut) |
| `claude-3-haiku` | `anthropic.claude-3-haiku-20240307-v1:0` | Rapide et économique |
| `llama-3-1-70b` | `meta.llama3-1-70b-instruct-v1:0` | Open source |
| `mistral-large` | `mistral.mistral-large-2402-v1:0` | Bon en français |
| `titan-text` | `amazon.titan-text-premier-v1:0` | Natif AWS |

### Par requête (API)

```bash
curl -X POST https://TON_BACKEND/api/v1/chat/ \
  -H "Authorization: Bearer TON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "Résume ce document", "model": "claude-3-haiku"}'
```

### Via le sélecteur dans l'interface client

Même sélecteur que pour Ollama — disponible en haut à droite du chat.

### Changer le modèle par défaut

Dans `terraform-aws/main.tf`, modifie la variable `BEDROCK_LLM_MODEL` dans la section App Runner backend, puis `terraform apply`.

---

## 6. CI/CD avec CodeBuild

### Créer le projet CodeBuild

```bash
# Crée un projet CodeBuild pointant vers ton repo GitHub
aws codebuild create-project \
  --name dev-rag-build \
  --source '{"type":"GITHUB","location":"https://github.com/AzizOums/rag"}' \
  --artifacts '{"type":"NO_ARTIFACTS"}' \
  --environment '{
    "type":"LINUX_CONTAINER",
    "image":"aws/codebuild/standard:7.0",
    "computeType":"BUILD_GENERAL1_SMALL",
    "privilegedMode":true
  }' \
  --service-role arn:aws:iam::ACCOUNT_ID:role/codebuild-role
```

### Stocker les ARNs App Runner dans Parameter Store

```bash
aws ssm put-parameter --name /rag/apprunner/backend-arn \
  --value "arn:aws:apprunner:..." --type String

aws ssm put-parameter --name /rag/apprunner/client-arn \
  --value "arn:aws:apprunner:..." --type String

aws ssm put-parameter --name /rag/apprunner/admin-arn \
  --value "arn:aws:apprunner:..." --type String
```

Chaque push sur `main` déclenche un build → push ECR → déploiement App Runner.

---

## 7. Architecture AWS

```
┌─────────────────────────────────────────────────────────────────┐
│                          Navigateur                             │
│                                                                 │
│  ┌──────────────────────┐      ┌────────────────────────────┐   │
│  │   App Runner Client  │      │   App Runner Admin         │   │
│  │   Next.js            │      │   Next.js                  │   │
│  └──────────┬───────────┘      └────────────┬───────────────┘   │
└─────────────┼────────────────────────────── ┼───────────────────┘
              │ HTTPS                         │ HTTPS
              ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              App Runner Backend (FastAPI)                        │
│              VPC Connector → private subnets                    │
│                                                                 │
│  POST /api/v1/chat/          → Bedrock KB retrieve + Bedrock LLM│
│  POST /api/v1/documents/upload → S3 upload + KB sync           │
│  GET  /api/v1/admin/...                                         │
└────┬──────────────┬──────────────────────┬──────────────────────┘
     │              │                      │
     ▼              ▼                      ▼
┌─────────┐  ┌────────────┐   ┌────────────────────────────────┐
│   RDS   │  │     S3     │   │     Bedrock Knowledge Base      │
│Postgres │  │ Documents  │   │                                 │
│Private  │  │ (fichiers) │   │  Titan Embed v2  (embeddings)  │
│subnets  │  └─────┬──────┘   │  OpenSearch Serverless (index) │
└─────────┘        │          │                                 │
                   └──────────► StartIngestionJob               │
                   sync        └────────────────────────────────┘
                                           │
                               ┌───────────▼────────────┐
                               │  Bedrock LLM            │
                               │  Claude 3.5 Sonnet      │
                               │  (ou Llama / Mistral)   │
                               └─────────────────────────┘
```

### Flux d'une question (mode AWS)

```
1. POST /chat  { question, model? }
       ↓
2. bedrock-agent-runtime.retrieve(knowledgeBaseId, question)
   → Bedrock gère l'embedding + la recherche vectorielle
   → retourne les passages les plus pertinents
       ↓
3. Passages + question → Bedrock LLM (Claude / Llama / Mistral)
       ↓
4. { answer, sources, model }
```

---

## 8. Commandes utiles

```bash
# Voir les logs App Runner backend
aws apprunner describe-service --service-arn ARN
aws logs tail /aws/apprunner/dev-rag-backend/SERVICE_ID/application --follow

# État d'un job d'ingestion Knowledge Base
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id XXXXXXXXXX \
  --data-source-id YYYYYYYYYY

# Lancer une sync manuelle
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id XXXXXXXXXX \
  --data-source-id YYYYYYYYYY

# Voir les objets dans S3
aws s3 ls s3://TON_BUCKET/documents/ --recursive

# Accéder à RDS via SSM Session Manager (sans ouvrir de port public)
aws rds-data execute-statement \
  --resource-arn ARN \
  --secret-arn SECRET_ARN \
  --database rag \
  --sql "SELECT name, status FROM documents;"

# Coût estimé AWS
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-02-01 \
  --granularity MONTHLY \
  --metrics BlendedCost
```

---

## 9. Résolution de problèmes

**`AccessDeniedException` sur Bedrock**
```
→ Le modèle n'est pas activé dans la console Bedrock
→ L'IAM role App Runner n'a pas la permission bedrock:InvokeModel
→ Vérifie que tu es dans la bonne région (Bedrock n'est pas disponible partout)
```

**La Knowledge Base ne trouve rien**
```
→ L'ingestion est asynchrone — attends 2-5 min après l'upload
→ Vérifie le statut du job : aws bedrock-agent list-ingestion-jobs ...
→ Le fichier est-il bien dans S3 ? aws s3 ls s3://BUCKET/documents/
```

**App Runner ne démarre pas**
```
→ L'image ECR n'existe pas encore → pousse d'abord les images
→ Vérifie les variables d'env dans la console App Runner
→ Logs : aws logs tail /aws/apprunner/...
```

**RDS non accessible depuis App Runner**
```
→ Vérifie que le VPC connector est dans les mêmes subnets privés que RDS
→ Vérifie le security group RDS (port 5432 ouvert pour le SG App Runner)
```

**Bedrock Knowledge Base : région non supportée**

Bedrock Knowledge Base n'est disponible que dans certaines régions :
- `us-east-1` (N. Virginia) — recommandé
- `us-west-2` (Oregon)
- `eu-west-1` (Ireland)
- `ap-southeast-1` (Singapore)
- `ap-northeast-1` (Tokyo)

Change `region` dans `terraform.tfvars` si nécessaire.
