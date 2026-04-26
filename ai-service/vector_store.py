from typing import List

import faiss
import numpy as np


class VectorStore:
	"""In-memory FAISS store for paragraph chunks."""

	def __init__(self) -> None:
		self.index = None
		self.chunks: List[str] = []

	def build(self, embeddings: np.ndarray, chunks: List[str]) -> None:
		"""
		Build FAISS index from precomputed embeddings.
		Uses inner product because embeddings are normalized.
		"""
		if embeddings.size == 0:
			raise ValueError("Cannot build FAISS index with empty embeddings.")

		if len(chunks) != embeddings.shape[0]:
			raise ValueError("Chunks count and embeddings count do not match.")

		dimension = embeddings.shape[1]
		self.index = faiss.IndexFlatIP(dimension)
		self.index.add(embeddings)
		self.chunks = chunks

	def search(self, query_embedding: np.ndarray, top_k: int = 3) -> List[str]:
		"""
		Search for the most similar chunks to the query embedding.
		Returns the original chunk texts.
		"""
		if self.index is None:
			raise RuntimeError("FAISS index is not built yet.")

		if query_embedding.ndim == 1:
			query_embedding = np.expand_dims(query_embedding, axis=0)

		query_embedding = query_embedding.astype("float32")

		# Guard in case dataset has fewer chunks than requested top_k.
		safe_k = min(top_k, len(self.chunks))
		_, indices = self.index.search(query_embedding, safe_k)

		return [self.chunks[i] for i in indices[0] if i != -1]
