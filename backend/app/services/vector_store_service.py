"""
Unified vector store interface.
- local:   pgvector in PostgreSQL (needs db session)
- vertexai: Vertex AI Vector Search (stateless HTTP)
"""
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, delete

from app.core.config import settings


class VectorStoreService:
    # ── Local / pgvector ──────────────────────────────────────────────────────

    async def _pg_upsert(self, db: AsyncSession, vectors: list[tuple[str, list[float]]]):
        from app.models.document import DocumentChunk
        from sqlalchemy import select
        for chunk_id, emb in vectors:
            result = await db.execute(
                select(DocumentChunk).where(DocumentChunk.id == chunk_id)
            )
            chunk = result.scalar_one_or_none()
            if chunk:
                chunk.embedding = emb
        await db.commit()

    async def _pg_query(
        self, db: AsyncSession, embedding: list[float], top_k: int
    ) -> list[str]:
        rows = await db.execute(
            text("""
                SELECT id
                FROM document_chunks
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> CAST(:emb AS vector)
                LIMIT :k
            """),
            {"emb": json.dumps(embedding), "k": top_k},
        )
        return [str(row.id) for row in rows]

    async def _pg_remove(self, db: AsyncSession, chunk_ids: list[str]):
        from app.models.document import DocumentChunk
        await db.execute(
            delete(DocumentChunk).where(DocumentChunk.id.in_(chunk_ids))
        )
        await db.commit()

    # ── Vertex AI Vector Search ───────────────────────────────────────────────

    def _vertex_client(self):
        from google.cloud.aiplatform_v1 import IndexServiceClient, MatchServiceClient
        ep = f"{settings.VERTEX_AI_LOCATION}-aiplatform.googleapis.com"
        return (
            IndexServiceClient(client_options={"api_endpoint": ep}),
            MatchServiceClient(client_options={"api_endpoint": ep}),
        )

    def _vertex_upsert(self, vectors: list[tuple[str, list[float]]]):
        from google.cloud.aiplatform_v1.types import IndexDatapoint, UpsertDatapointsRequest
        idx_client, _ = self._vertex_client()
        idx_client.upsert_datapoints(
            request=UpsertDatapointsRequest(
                index=settings.VECTOR_SEARCH_INDEX_ID,
                datapoints=[
                    IndexDatapoint(datapoint_id=cid, feature_vector=emb)
                    for cid, emb in vectors
                ],
            )
        )

    def _vertex_query(self, embedding: list[float], top_k: int) -> list[str]:
        from google.cloud.aiplatform_v1.types import IndexDatapoint, FindNeighborsRequest
        _, match_client = self._vertex_client()
        response = match_client.find_neighbors(
            request=FindNeighborsRequest(
                index_endpoint=settings.VECTOR_SEARCH_ENDPOINT_ID,
                deployed_index_id=settings.VECTOR_SEARCH_DEPLOYED_INDEX_ID,
                queries=[
                    FindNeighborsRequest.Query(
                        datapoint=IndexDatapoint(feature_vector=embedding),
                        neighbor_count=top_k,
                    )
                ],
            )
        )
        neighbors = response.nearest_neighbors[0].neighbors if response.nearest_neighbors else []
        return [n.datapoint.datapoint_id for n in neighbors]

    def _vertex_remove(self, chunk_ids: list[str]):
        idx_client, _ = self._vertex_client()
        idx_client.remove_datapoints(
            index=settings.VECTOR_SEARCH_INDEX_ID,
            datapoint_ids=chunk_ids,
        )

    # ── Public interface ──────────────────────────────────────────────────────

    async def upsert(self, db: AsyncSession, vectors: list[tuple[str, list[float]]]):
        if settings.VECTOR_STORE == "local":
            await self._pg_upsert(db, vectors)
        else:
            self._vertex_upsert(vectors)

    async def query(
        self, db: AsyncSession, embedding: list[float], top_k: int = 5
    ) -> list[str]:
        if settings.VECTOR_STORE == "local":
            return await self._pg_query(db, embedding, top_k)
        return self._vertex_query(embedding, top_k)

    async def remove(self, db: AsyncSession, chunk_ids: list[str]):
        if settings.VECTOR_STORE == "local":
            await self._pg_remove(db, chunk_ids)
        else:
            self._vertex_remove(chunk_ids)


vector_store_service = VectorStoreService()
