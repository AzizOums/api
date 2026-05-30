from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.document import DocumentChunk
from app.services.embedding_service import embedding_service
from app.services.vector_store_service import vector_store_service
from app.services.llm_service import llm_service


RAG_PROMPT = ChatPromptTemplate.from_template(
    "You are a helpful assistant. Answer using only the context below.\n"
    "If the answer is not in the context, say so clearly.\n\n"
    "Context:\n{context}\n\n"
    "Question: {question}\n\n"
    "Answer:"
)


class RAGService:
    def __init__(self):
        self._splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

    async def ingest(self, db: AsyncSession, document_id: str, text_content: str):
        chunks = self._splitter.split_text(text_content)
        embeddings = embedding_service.embed_documents(chunks)

        db_chunks: list[DocumentChunk] = []
        for i, chunk in enumerate(chunks):
            c = DocumentChunk(document_id=document_id, content=chunk, chunk_index=i)
            db.add(c)
            db_chunks.append(c)

        await db.flush()  # assign UUIDs

        vectors = [(str(c.id), emb) for c, emb in zip(db_chunks, embeddings)]
        await vector_store_service.upsert(db, vectors)
        await db.commit()

    async def delete_chunks(self, db: AsyncSession, document_id: str):
        result = await db.execute(
            select(DocumentChunk.id).where(DocumentChunk.document_id == document_id)
        )
        chunk_ids = [str(row.id) for row in result]
        if chunk_ids:
            await vector_store_service.remove(db, chunk_ids)

    async def query(
        self, db: AsyncSession, question: str, model_id: str | None = None
    ) -> dict:
        query_emb = embedding_service.embed_query(question)
        chunk_ids = await vector_store_service.query(db, query_emb)

        if not chunk_ids:
            return {"answer": "No relevant documents found.", "sources": [], "model": model_id or "default"}

        result = await db.execute(
            select(DocumentChunk).where(DocumentChunk.id.in_(chunk_ids))
        )
        by_id = {str(c.id): c for c in result.scalars().all()}
        ordered = [by_id[cid] for cid in chunk_ids if cid in by_id]

        context = "\n\n".join(c.content for c in ordered)
        chain = RAG_PROMPT | llm_service.get(model_id) | StrOutputParser()
        answer = await chain.ainvoke({"context": context, "question": question})

        return {
            "answer": answer,
            "sources": [
                {"id": str(c.id), "content": c.content[:200], "document_id": str(c.document_id)}
                for c in ordered
            ],
            "model": model_id or "default",
        }


rag_service = RAGService()
