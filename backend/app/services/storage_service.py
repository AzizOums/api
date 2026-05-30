import uuid
from pathlib import Path
from app.core.config import settings


class StorageService:
    def upload(self, content: bytes, filename: str, content_type: str) -> str:
        if settings.STORAGE_PROVIDER == "local":
            return self._local_upload(content, filename)
        if settings.STORAGE_PROVIDER == "s3":
            return self._s3_upload(content, filename, content_type)
        return self._gcs_upload(content, filename, content_type)

    def delete(self, path: str):
        if settings.STORAGE_PROVIDER == "local":
            self._local_delete(path)
        elif settings.STORAGE_PROVIDER == "s3":
            self._s3_delete(path)
        else:
            self._gcs_delete(path)

    # ── Local ─────────────────────────────────────────────────────────────────

    def _local_upload(self, content: bytes, filename: str) -> str:
        base = Path(settings.LOCAL_STORAGE_PATH)
        dest = base / str(uuid.uuid4()) / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        return str(dest)

    def _local_delete(self, path: str):
        p = Path(path)
        if p.exists():
            p.unlink()
            try:
                p.parent.rmdir()
            except OSError:
                pass

    # ── Amazon S3 ─────────────────────────────────────────────────────────────

    def _s3_client(self):
        import boto3
        return boto3.client("s3", region_name=settings.AWS_REGION)

    def _s3_upload(self, content: bytes, filename: str, content_type: str) -> str:
        key = f"documents/{uuid.uuid4()}/{filename}"
        self._s3_client().put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Body=content,
            ContentType=content_type,
        )
        return key

    def _s3_delete(self, key: str):
        self._s3_client().delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)

    # ── Google Cloud Storage ──────────────────────────────────────────────────

    def _gcs_bucket(self):
        from google.cloud import storage
        return storage.Client(project=settings.GCP_PROJECT_ID).bucket(settings.GCS_BUCKET_NAME)

    def _gcs_upload(self, content: bytes, filename: str, content_type: str) -> str:
        path = f"documents/{uuid.uuid4()}/{filename}"
        blob = self._gcs_bucket().blob(path)
        blob.upload_from_string(content, content_type=content_type)
        return path

    def _gcs_delete(self, path: str):
        blob = self._gcs_bucket().blob(path)
        if blob.exists():
            blob.delete()


storage_service = StorageService()
