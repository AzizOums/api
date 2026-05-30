from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.document import DocumentChunk
from app.services.embedding_service import embedding_service
from app.services.vector_search_service import vector_search_service
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

        db_chunks = []
        vectors = []
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            c = DocumentChunk(document_id=document_id, content=chunk, chunk_index=i)
            db_chunks.append(c)
            db.add(c)

        await db.flush()  # get UUIDs assigned

        for c, emb in zip(db_chunks, embeddings):
            vectors.append((str(c.id), emb))

        vector_search_service.upsert(vectors)
        await db.commit()

    async def delete_document_chunks(self, db: AsyncSession, document_id: str):
        result = await db.execute(
            select(DocumentChunk.id).where(DocumentChunk.document_id == document_id)
        )
        chunk_ids = [str(row.id) for row in result]
        if chunk_ids:
            vector_search_service.remove(chunk_ids)
        await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
        await db.commit()

    async def query(self, db: AsyncSession, question: str, model_id: str | None = None) -> dict:
        query_emb = embedding_service.embed_query(question)
        chunk_ids = vector_search_service.query(query_emb)

        if not chunk_ids:
            return {"answer": "No relevant documents found.", "sources": [], "model": model_id or "default"}

        result = await db.execute(
            select(DocumentChunk).where(DocumentChunk.id.in_(chunk_ids))
        )
        chunks = {str(c.id): c for c in result.scalars().all()}
        ordered = [chunks[cid] for cid in chunk_ids if cid in chunks]

        context = "\n\n".join(c.content for c in ordered)
        llm = llm_service.get(model_id)
        chain = RAG_PROMPT | llm | StrOutputParser()
        answer = await chain.ainvoke({"context": context, "question": question})

        sources = [
            {"id": str(c.id), "content": c.content[:200], "document_id": str(c.document_id)}
            for c in ordered
        ]
        return {"answer": answer, "sources": sources, "model": model_id or "default"}


rag_service = RAGService()
