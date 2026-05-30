from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str
    DEBUG: bool = False
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]

    DATABASE_URL: str

    GCP_PROJECT_ID: str
    GCP_REGION: str = "us-central1"
    GCS_BUCKET_NAME: str

    VERTEX_AI_LOCATION: str = "us-central1"
    EMBEDDING_MODEL: str = "text-embedding-004"
    DEFAULT_LLM_MODEL: str = "gemini-1.5-pro"

    VECTOR_SEARCH_INDEX_ID: str
    VECTOR_SEARCH_ENDPOINT_ID: str
    VECTOR_SEARCH_DEPLOYED_INDEX_ID: str

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str

    class Config:
        env_file = ".env"


settings = Settings()

SUPPORTED_MODELS: dict[str, str] = {
    "gemini-1.5-pro":   "gemini-1.5-pro-002",
    "gemini-1.5-flash": "gemini-1.5-flash-002",
    "gemini-2.0-flash": "gemini-2.0-flash-001",
    "gemini-1.0-pro":   "gemini-1.0-pro",
}
