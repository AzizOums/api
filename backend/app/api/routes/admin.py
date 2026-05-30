from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import create_access_token
from app.core.config import settings
from app.api.deps import get_current_admin
from app.models.document import Document, DocumentChunk
from app.models.user import User
from app.services.llm_service import llm_service

router = APIRouter()


class AdminLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def admin_login(req: AdminLoginRequest):
    if req.email != settings.ADMIN_EMAIL or req.password != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token({"sub": req.email, "is_admin": True})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    doc_count   = (await db.execute(select(func.count(Document.id)))).scalar()
    chunk_count = (await db.execute(select(func.count(DocumentChunk.id)))).scalar()
    user_count  = (await db.execute(select(func.count(User.id)))).scalar()
    return {"total_documents": doc_count, "total_chunks": chunk_count, "total_users": user_count}


@router.get("/models")
async def list_models(_=Depends(get_current_admin)):
    return llm_service.list_models()


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return [
        {"id": str(u.id), "email": u.email, "is_active": u.is_active, "created_at": u.created_at.isoformat()}
        for u in result.scalars().all()
    ]


@router.patch("/users/{user_id}/toggle")
async def toggle_user(user_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    await db.commit()
    return {"id": str(user.id), "is_active": user.is_active}
