import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector

from app.core.database import Base
from app.core.config import settings


class Document(Base):
    __tablename__ = "documents"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name       = Column(String(255), nullable=False)
    gcs_path   = Column(String(512))          # GCS path (cloud) or local path
    status     = Column(String(50), default="pending")
    metadata_  = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    content     = Column(Text, nullable=False)
    chunk_index = Column(Integer)
    created_at  = Column(DateTime, default=datetime.utcnow)

    # Populated in local mode (pgvector); NULL in Vertex AI mode
    embedding = Column(Vector(settings.EMBEDDING_DIMENSIONS), nullable=True)
