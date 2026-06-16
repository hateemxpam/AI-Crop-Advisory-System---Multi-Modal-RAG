from pathlib import Path
import re
import io
from typing import List

import torch
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from PIL import Image
from transformers import MobileNetV2ImageProcessor, MobileNetV2ForImageClassification

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

# HuggingFace plant disease classifier — loaded once, runs fully locally.
# Using AutoImageProcessor + AutoModelForImageClassification directly
# because this model's preprocessor_config.json lacks the standard
# `image_processor_type` key that transformers pipeline() requires.
image_processor = None
image_model = None
image_id2label: dict = {}
IMAGE_MODEL_NAME  = "linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification"
# Store model inside the project at ai-service/models/ — not in system cache.
MODEL_CACHE_DIR   = Path(__file__).resolve().parent / "models"


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
	1) Load HuggingFace image classifier locally
	2) Load sentence embedding model
	3) Load text dataset
	4) Encode chunks
	5) Build FAISS index once (or load from disk cache)
	"""
	global embedding_service, vector_store, image_processor, image_model, image_id2label

	# ── Image Classifier ──────────────────────────────────────────────────
	# Downloads model weights on first run (~25 MB) then caches locally.
	# All subsequent runs load from MODEL_CACHE_DIR — fully offline.
	# Uses AutoImageProcessor + AutoModelForImageClassification directly
	# to bypass the missing image_processor_type in preprocessor_config.json.
	print(f"[Startup] Loading image classifier: {IMAGE_MODEL_NAME}")
	try:
		MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
		image_processor = MobileNetV2ImageProcessor.from_pretrained(
			IMAGE_MODEL_NAME, cache_dir=str(MODEL_CACHE_DIR)
		)
		image_model = MobileNetV2ForImageClassification.from_pretrained(
			IMAGE_MODEL_NAME, cache_dir=str(MODEL_CACHE_DIR)
		)
		image_model.eval()  # Set to inference mode
		image_id2label = image_model.config.id2label
		print(f"[Startup] Image classifier ready. Classes: {len(image_id2label)}")
		print(f"[Startup] Model cached at: {MODEL_CACHE_DIR}")
	except Exception as exc:
		print(f"[Startup] WARNING: Could not load image classifier: {exc}")
		image_processor = None
		image_model = None

	# ── FAISS + Embeddings ────────────────────────────────────────────────
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
	return {
		"status": "ok",
		"image_classifier": "ready" if image_model is not None else "unavailable",
	}


@app.post("/analyze-image")
async def analyze_image(request: Request) -> dict:
	"""
	Accepts raw image bytes (JPEG / PNG / WebP) in the request body.
	Runs the HuggingFace plant-disease MobileNetV2 model LOCALLY.
	Returns the top prediction label and confidence score.

	Expected response:
	  { "label": "Tomato___Early_blight", "score": 0.9821 }
	"""
	if image_model is None or image_processor is None:
		raise HTTPException(
			status_code=503,
			detail="Image classifier is not available. Check server logs.",
		)

	image_bytes = await request.body()
	if not image_bytes:
		raise HTTPException(status_code=400, detail="Request body is empty. Send raw image bytes.")

	try:
		image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
	except Exception:
		raise HTTPException(status_code=400, detail="Could not decode image. Ensure it is a valid JPEG, PNG, or WebP file.")

	try:
		inputs = image_processor(images=image, return_tensors="pt")
		with torch.no_grad():
			logits = image_model(**inputs).logits
		scores = torch.softmax(logits, dim=-1)[0]
		top_idx = int(scores.argmax())
		top_label = image_id2label[top_idx]
		top_score = float(scores[top_idx])
	except Exception as exc:
		raise HTTPException(status_code=500, detail=f"Inference failed: {exc}")

	print(f"[ImageClassifier] Top prediction: {top_label} ({top_score*100:.1f}%)")

	return {
		"label": top_label,
		"score": round(top_score, 4),
	}


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
