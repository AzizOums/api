from google.cloud import aiplatform
from google.cloud.aiplatform_v1 import IndexServiceClient, MatchServiceClient
from google.cloud.aiplatform_v1.types import (
    IndexDatapoint,
    UpsertDatapointsRequest,
    FindNeighborsRequest,
)

from app.core.config import settings


class VectorSearchService:
    def __init__(self):
        aiplatform.init(
            project=settings.GCP_PROJECT_ID,
            location=settings.VERTEX_AI_LOCATION,
        )
        api_endpoint = f"{settings.VERTEX_AI_LOCATION}-aiplatform.googleapis.com"

        self._index_client = IndexServiceClient(
            client_options={"api_endpoint": api_endpoint}
        )
        self._match_client = MatchServiceClient(
            client_options={"api_endpoint": api_endpoint}
        )

    def upsert(self, vectors: list[tuple[str, list[float]]]):
        """Push chunk embeddings to the streaming-update index."""
        datapoints = [
            IndexDatapoint(datapoint_id=chunk_id, feature_vector=emb)
            for chunk_id, emb in vectors
        ]
        self._index_client.upsert_datapoints(
            request=UpsertDatapointsRequest(
                index=settings.VECTOR_SEARCH_INDEX_ID,
                datapoints=datapoints,
            )
        )

    def query(self, embedding: list[float], top_k: int = 5) -> list[str]:
        """Return ordered list of chunk UUIDs closest to the query embedding."""
        response = self._match_client.find_neighbors(
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

    def remove(self, chunk_ids: list[str]):
        self._index_client.remove_datapoints(
            index=settings.VECTOR_SEARCH_INDEX_ID,
            datapoint_ids=chunk_ids,
        )


vector_search_service = VectorSearchService()
