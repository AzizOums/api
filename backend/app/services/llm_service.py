from langchain_core.language_models import BaseChatModel
from app.core.config import settings, VERTEXAI_MODELS


class LLMService:
    def get(self, model_id: str | None = None) -> BaseChatModel:
        if settings.LLM_PROVIDER == "local":
            from langchain_ollama import ChatOllama
            model = model_id or settings.OLLAMA_LLM_MODEL
            return ChatOllama(base_url=settings.OLLAMA_BASE_URL, model=model, temperature=0.1)

        # Vertex AI
        from langchain_google_vertexai import ChatVertexAI
        key = model_id or settings.DEFAULT_LLM_MODEL
        if key not in VERTEXAI_MODELS:
            raise ValueError(f"Unknown model '{key}'. Choose from: {list(VERTEXAI_MODELS)}")
        return ChatVertexAI(
            model_name=VERTEXAI_MODELS[key],
            project=settings.GCP_PROJECT_ID,
            location=settings.VERTEX_AI_LOCATION,
            temperature=0.1,
        )

    def list_models(self) -> list[dict]:
        if settings.LLM_PROVIDER == "local":
            current = settings.OLLAMA_LLM_MODEL
            # Common Ollama models — user can pull any model they want
            models = ["llama3.2", "llama3.1", "mistral", "gemma2", "qwen2.5", "phi3"]
            return [{"id": m, "provider": "ollama", "default": m == current} for m in models]

        return [
            {"id": k, "provider": "vertexai", "vertex_name": v, "default": k == settings.DEFAULT_LLM_MODEL}
            for k, v in VERTEXAI_MODELS.items()
        ]


llm_service = LLMService()
