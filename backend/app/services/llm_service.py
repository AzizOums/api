from langchain_google_vertexai import ChatVertexAI
from langchain_core.language_models import BaseChatModel

from app.core.config import settings, SUPPORTED_MODELS


class LLMService:
    def get(self, model_id: str | None = None) -> BaseChatModel:
        key = model_id or settings.DEFAULT_LLM_MODEL
        if key not in SUPPORTED_MODELS:
            raise ValueError(f"Unsupported model '{key}'. Choose from: {list(SUPPORTED_MODELS)}")
        return ChatVertexAI(
            model_name=SUPPORTED_MODELS[key],
            project=settings.GCP_PROJECT_ID,
            location=settings.VERTEX_AI_LOCATION,
            temperature=0.1,
        )

    def list_models(self) -> list[dict]:
        return [
            {"id": k, "vertex_name": v, "default": k == settings.DEFAULT_LLM_MODEL}
            for k, v in SUPPORTED_MODELS.items()
        ]


llm_service = LLMService()
