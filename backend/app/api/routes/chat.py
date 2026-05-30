from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.services.rag_service import rag_service
from app.services.llm_service import llm_service

router = APIRouter()


class ChatRequest(BaseModel):
    question: str
    model: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    model: str


@router.post("/", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    result = await rag_service.query(db, req.question, req.model)
    return ChatResponse(**result)


@router.get("/models")
async def list_models(_=Depends(get_current_user)):
    return llm_service.list_models()
