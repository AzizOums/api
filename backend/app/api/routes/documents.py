import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.deps import get_current_admin
from app.models.document import Document
from app.services.storage_service import storage_service
from app.services.rag_service import rag_service

router = APIRouter()


@router.get("/")
async def list_documents(db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    result = await db.execute(select(Document).order_by(Document.created_at.desc()))
    return [
        {
            "id": str(d.id),
            "name": d.name,
            "status": d.status,
            "created_at": d.created_at.isoformat(),
        }
        for d in result.scalars().all()
    ]


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_admin),
):
    content = await file.read()
    gcs_path = storage_service.upload(
        content, file.filename, file.content_type or "application/octet-stream"
    )

    doc = Document(id=uuid.uuid4(), name=file.filename, gcs_path=gcs_path, status="processing")
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    try:
        text_content = content.decode("utf-8", errors="ignore")
        await rag_service.ingest(db, str(doc.id), text_content)
        doc.status = "ready"
    except Exception:
        doc.status = "error"
        raise
    finally:
        await db.commit()

    return {"id": str(doc.id), "name": doc.name, "status": doc.status}


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_admin),
):
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.gcs_path:
        storage_service.delete(doc.gcs_path)

    await rag_service.delete_document_chunks(db, document_id)
    await db.delete(doc)
    await db.commit()
    return {"message": "Deleted"}
