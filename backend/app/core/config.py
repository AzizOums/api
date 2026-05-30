from typing import List, Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str
    DEBUG: bool = False
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]

    # Providers — each switchable independently
    LLM_PROVIDER: str = "local"      # local | vertexai | bedrock
    VECTOR_STORE: str = "local"      # local | vertexai | bedrock
    STORAGE_PROVIDER: str = "local"  # local | gcs | s3

    # Database
    DATABASE_URL: str

    # Ollama (local mode)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_LLM_MODEL: str = "llama3.2"
    OLLAMA_EMBEDDING_MODEL: str = "nomic-embed-text"
    EMBEDDING_DIMENSIONS: int = 768

    # Local storage
    LOCAL_STORAGE_PATH: str = "./uploads"

    # AWS
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: Optional[str] = None
    BEDROCK_LLM_MODEL: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"
    BEDROCK_KNOWLEDGE_BASE_ID: Optional[str] = None
    BEDROCK_DATA_SOURCE_ID: Optional[str] = None

    # Google Cloud
    GCP_PROJECT_ID: Optional[str] = None
    GCP_REGION: str = "us-central1"
    GCS_BUCKET_NAME: Optional[str] = None
    VERTEX_AI_LOCATION: str = "us-central1"
    EMBEDDING_MODEL: str = "text-embedding-004"
    DEFAULT_LLM_MODEL: str = "gemini-1.5-pro"
    VECTOR_SEARCH_INDEX_ID: Optional[str] = None
    VECTOR_SEARCH_ENDPOINT_ID: Optional[str] = None
    VECTOR_SEARCH_DEPLOYED_INDEX_ID: Optional[str] = None

    # Auth
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str

    class Config:
        env_file = ".env"


settings = Settings()

VERTEXAI_MODELS: dict[str, str] = {
    "gemini-1.5-pro":   "gemini-1.5-pro-002",
    "gemini-1.5-flash": "gemini-1.5-flash-002",
    "gemini-2.0-flash": "gemini-2.0-flash-001",
    "gemini-1.0-pro":   "gemini-1.0-pro",
}

BEDROCK_MODELS: dict[str, str] = {
    "claude-3-5-sonnet": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "claude-3-haiku":    "anthropic.claude-3-haiku-20240307-v1:0",
    "llama-3-1-70b":     "meta.llama3-1-70b-instruct-v1:0",
    "mistral-large":     "mistral.mistral-large-2402-v1:0",
    "titan-text":        "amazon.titan-text-premier-v1:0",
}
