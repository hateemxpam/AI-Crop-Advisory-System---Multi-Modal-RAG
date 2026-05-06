from pathlib import Path
import re
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from embedding import EmbeddingService
from vector_store import VectorStore


class SearchRequest(BaseModel):
	query: str = Field(..., min_length=1, description="User search query")


class SearchResponse(BaseModel):
	results: List[str]


class EmbedRequest(BaseModel):
	text: str = Field(..., min_length=1, description="Text to convert into an embedding")


class EmbedResponse(BaseModel):
	dimension: int
	embedding: List[float]


app = FastAPI(title="AI Crop Advisory Retrieval Service", version="1.0.0")

# Services are initialized at startup and reused for all requests.
embedding_service: EmbeddingService | None = None
vector_store: VectorStore | None = None


def load_paragraph_chunks(file_path: Path) -> List[str]:
	"""
	Each paragraph (separated by blank lines) is treated as one chunk.
	"""
	if not file_path.exists():
		raise FileNotFoundError(f"Dataset not found: {file_path}")

	raw_text = file_path.read_text(encoding="utf-8")
	normalized_text = raw_text.replace("\r\n", "\n")
	chunks = [chunk.strip() for chunk in re.split(r"\n\s*\n", normalized_text) if chunk.strip()]

	if not chunks:
		raise ValueError("Dataset file is empty or has no valid paragraphs.")

	return chunks


@app.on_event("startup")
def startup_event() -> None:
	"""
	Startup flow:
	1) Load model once
	2) Load text dataset
	3) Encode chunks
	4) Build FAISS index once
	"""
	global embedding_service, vector_store

	dataset_path = Path(__file__).resolve().parent / "data" / "knowledge.txt"
	index_path = Path(__file__).resolve().parent / "data" / "faiss.index"
	chunks_path = Path(__file__).resolve().parent / "data" / "chunks.json"
	
	embedding_service = EmbeddingService(model_name="all-MiniLM-L6-v2")
	vector_store = VectorStore()

	if index_path.exists() and chunks_path.exists():
		print("[Startup] Loading existing FAISS index from disk...")
		vector_store.load(str(index_path), str(chunks_path))
	else:
		print("[Startup] No existing index found. Building from knowledge.txt...")
		chunks = load_paragraph_chunks(dataset_path)
		chunk_embeddings = embedding_service.encode(chunks)
		vector_store.build(chunk_embeddings, chunks)
		vector_store.save(str(index_path), str(chunks_path))
		print("[Startup] FAISS index built and saved to disk.")


@app.post("/search", response_model=SearchResponse)
def search(request: SearchRequest) -> SearchResponse:
	"""
	Request flow:
	- Convert query to embedding
	- Search FAISS index for top 3 nearest chunks
	- Return those chunks
	"""
	if embedding_service is None or vector_store is None:
		raise HTTPException(status_code=503, detail="Service is still initializing.")

	query = request.query.strip()
	if not query:
		raise HTTPException(status_code=400, detail="Query cannot be empty.")

	query_embedding = embedding_service.encode([query])
	top_chunks = vector_store.search(query_embedding, top_k=3)
	return SearchResponse(results=top_chunks)


@app.get("/health")
def health() -> dict:
	"""Simple health route to verify the service is up."""
	return {"status": "ok"}


@app.post("/embed", response_model=EmbedResponse)
def embed(request: EmbedRequest) -> EmbedResponse:
	"""Return raw embedding vector for a single input text."""
	if embedding_service is None:
		raise HTTPException(status_code=503, detail="Service is still initializing.")

	text = request.text.strip()
	if not text:
		raise HTTPException(status_code=400, detail="Text cannot be empty.")

	vector = embedding_service.encode([text])[0]
	return EmbedResponse(dimension=int(vector.shape[0]), embedding=vector.tolist())
