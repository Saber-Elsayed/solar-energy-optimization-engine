"""Local RAG over Sola Home Markdown knowledge. In-memory vectors; no extra DB server."""

from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.vectorstores import InMemoryVectorStore

from ...config import load_environment

logger = logging.getLogger(__name__)

RAG_TOOL_NAME = "rag"

KNOWLEDGE_DIR = Path(__file__).resolve().parents[2] / "knowledge"

CHUNK_SIZE = 700
CHUNK_OVERLAP = 120


@dataclass(frozen=True)
class RetrievedChunk:
    source: str
    content: str


class CharNgramEmbeddings(Embeddings):
    """Local fallback embeddings so the index can be built without OpenAI credits."""

    def __init__(self, dim: int = 256) -> None:
        self.dim = dim

    def _embed(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        normalized = f" {text.lower()} "
        for size in (3, 4):
            for index in range(len(normalized) - size + 1):
                gram = normalized[index : index + size]
                digest = hashlib.md5(gram.encode("utf-8")).hexdigest()
                slot = int(digest, 16) % self.dim
                vec[slot] += 1.0
        norm = sum(value * value for value in vec) ** 0.5
        if norm == 0:
            return vec
        return [value / norm for value in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


def knowledge_dir() -> Path:
    return KNOWLEDGE_DIR


def load_knowledge_documents() -> list[Document]:
    if not KNOWLEDGE_DIR.is_dir():
        raise FileNotFoundError(f"Knowledge directory missing: {KNOWLEDGE_DIR}")
    documents: list[Document] = []
    for path in sorted(KNOWLEDGE_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            continue
        documents.append(Document(page_content=text, metadata={"source": path.name}))
    if not documents:
        raise FileNotFoundError(f"No Markdown knowledge files in {KNOWLEDGE_DIR}")
    return documents


def _split_text(text: str) -> list[str]:
    paragraphs = [part.strip() for part in text.split("\n\n") if part.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for paragraph in paragraphs:
        extra = len(paragraph) + (2 if current else 0)
        if current and current_len + extra > CHUNK_SIZE:
            chunks.append("\n\n".join(current))
            current = [paragraph]
            current_len = len(paragraph)
        else:
            current.append(paragraph)
            current_len += extra
    if current:
        chunks.append("\n\n".join(current))
    if not chunks:
        return [text]
    overlapped: list[str] = []
    for index, chunk in enumerate(chunks):
        if index == 0 or CHUNK_OVERLAP <= 0:
            overlapped.append(chunk)
            continue
        prefix = chunks[index - 1][-CHUNK_OVERLAP:]
        overlapped.append(f"{prefix}\n\n{chunk}")
    return overlapped


def _chunk_documents(documents: list[Document]) -> list[Document]:
    chunked: list[Document] = []
    for document in documents:
        source = str(document.metadata.get("source") or "unknown.md")
        for chunk in _split_text(document.page_content):
            chunked.append(Document(page_content=chunk, metadata={"source": source}))
    return chunked


def _openai_embeddings():
    from langchain_openai import OpenAIEmbeddings

    load_environment()
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip() or "text-embedding-3-small"
    kwargs: dict = {"model": model, "api_key": api_key}
    base_url = os.getenv("OPENAI_BASE_URL", "").strip()
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAIEmbeddings(**kwargs)


def build_embeddings() -> tuple[Embeddings, str]:
    load_environment()
    requested = os.getenv("SOLA_RAG_EMBEDDINGS", "auto").strip().lower()
    if requested in {"openai", "auto"}:
        try:
            embeddings = _openai_embeddings()
            if embeddings is not None:
                embeddings.embed_query("sola-home-rag-probe")
                return embeddings, "openai"
        except Exception as exc:
            logger.warning("OpenAI embeddings unavailable (%s); using local n-gram embeddings.", exc)
            if requested == "openai":
                raise
    return CharNgramEmbeddings(), "ngram"


@lru_cache(maxsize=1)
def _vectorstore() -> InMemoryVectorStore:
    embeddings, _provider = build_embeddings()
    chunks = _chunk_documents(load_knowledge_documents())
    return InMemoryVectorStore.from_documents(chunks, embedding=embeddings)


def reset_rag_index() -> None:
    _vectorstore.cache_clear()


def _lexical_score(query: str, text: str) -> int:
    tokens = {token for token in query.lower().replace("?", " ").replace("/", " ").split() if len(token) > 1}
    haystack = text.lower()
    return sum(1 for token in tokens if token in haystack)


def retrieve_knowledge(query: str, *, k: int = 4) -> list[RetrievedChunk]:
    """Return the most relevant knowledge chunks with source file names."""
    question = (query or "").strip()
    if not question:
        return []

    vector_hits = _vectorstore().similarity_search(question, k=max(k, 4))
    lexical_hits = sorted(
        _chunk_documents(load_knowledge_documents()),
        key=lambda doc: _lexical_score(question, doc.page_content),
        reverse=True,
    )

    merged: list[RetrievedChunk] = []
    seen: set[tuple[str, str]] = set()
    for document in [*vector_hits, *lexical_hits]:
        source = str(document.metadata.get("source") or "unknown.md")
        content = document.page_content.strip()
        key = (source, content[:160])
        if not content or key in seen:
            continue
        seen.add(key)
        merged.append(RetrievedChunk(source=source, content=content))
        if len(merged) >= k:
            break
    return merged


def format_retrieval_result(query: str, chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return json.dumps(
            {
                "query": query,
                "sources": [],
                "chunks": [],
                "note": "No Sola Home knowledge documents matched this query. Tell the user this is not documented.",
            }
        )
    payload = {
        "query": query,
        "sources": list(dict.fromkeys(chunk.source for chunk in chunks)),
        "chunks": [{"source": chunk.source, "content": chunk.content} for chunk in chunks],
    }
    return json.dumps(payload, ensure_ascii=True)


def retrieve_sola_knowledge(query: str) -> str:
    chunks = retrieve_knowledge(query, k=4)
    return format_retrieval_result(query, chunks)
