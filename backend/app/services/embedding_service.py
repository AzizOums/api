from langchain_core.embeddings import Embeddings
from app.core.config import settings


def _build_embeddings() -> Embeddings:
    if settings.VECTOR_STORE == "local":
        from langchain_ollama import OllamaEmbeddings
        return OllamaEmbeddings(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_EMBEDDING_MODEL,
        )
    from langchain_google_vertexai import VertexAIEmbeddings
    return VertexAIEmbeddings(
        model_name=settings.EMBEDDING_MODEL,
        project=settings.GCP_PROJECT_ID,
        location=settings.VERTEX_AI_LOCATION,
    )


class EmbeddingService:
    def __init__(self):
        self._model = _build_embeddings()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._model.embed_documents(texts)

    def embed_query(self, query: str) -> list[float]:
        return self._model.embed_query(query)


embedding_service = EmbeddingService()
