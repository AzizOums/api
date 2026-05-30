from langchain_google_vertexai import VertexAIEmbeddings
from app.core.config import settings


class EmbeddingService:
    def __init__(self):
        self._model = VertexAIEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            project=settings.GCP_PROJECT_ID,
            location=settings.VERTEX_AI_LOCATION,
        )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._model.embed_documents(texts)

    def embed_query(self, query: str) -> list[float]:
        return self._model.embed_query(query)


embedding_service = EmbeddingService()
