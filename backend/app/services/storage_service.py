import uuid
from google.cloud import storage
from app.core.config import settings


class StorageService:
    def __init__(self):
        self._client = storage.Client(project=settings.GCP_PROJECT_ID)
        self._bucket = self._client.bucket(settings.GCS_BUCKET_NAME)

    def upload(self, content: bytes, filename: str, content_type: str) -> str:
        path = f"documents/{uuid.uuid4()}/{filename}"
        blob = self._bucket.blob(path)
        blob.upload_from_string(content, content_type=content_type)
        return path

    def delete(self, path: str):
        blob = self._bucket.blob(path)
        if blob.exists():
            blob.delete()


storage_service = StorageService()
