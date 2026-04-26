from typing import List

from sentence_transformers import SentenceTransformer


class EmbeddingService:
	"""Loads and serves the sentence-transformer model once for all requests."""

	def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
		self.model_name = model_name
		self.model = SentenceTransformer(model_name)

	def encode(self, texts: List[str]) -> "list[list[float]]":
		"""
		Convert text chunks into dense vectors.
		normalize_embeddings=True gives cosine-style similarity behavior with IndexFlatIP.
		"""
		if not texts:
			return []

		vectors = self.model.encode(
			texts,
			convert_to_numpy=True,
			normalize_embeddings=True,
			show_progress_bar=False,
		)
		return vectors.astype("float32")
