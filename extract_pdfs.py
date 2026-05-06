import os
import re
import fitz  # PyMuPDF
from pathlib import Path

def clean_text(text):
    text = re.sub(r'\s+', ' ', text)
    text = text.replace('. ', '.\n\n')
    return text.strip()

def main():
    source_dir = Path("data-source")
    target_file = Path("ai-service/data/knowledge.txt")
    
    if not source_dir.exists():
        print(f"Directory {source_dir} not found.")
        return

    extracted_content = []
    
    for pdf_file in source_dir.glob("*.pdf"):
        print(f"Processing {pdf_file.name} using PyMuPDF...")
        try:
            doc = fitz.open(pdf_file)
            file_text = []
            for page in doc:
                text = page.get_text()
                if text:
                    file_text.append(text)
            
            full_text = " ".join(file_text)
            if full_text.strip():
                extracted_content.append(clean_text(full_text))
            doc.close()
        except Exception as e:
            print(f"Error processing {pdf_file.name}: {e}")

    if extracted_content:
        # Append to knowledge.txt
        with open(target_file, "a", encoding="utf-8") as f:
            f.write("\n\n" + "\n\n".join(extracted_content) + "\n\n")
        print(f"Successfully appended {len(extracted_content)} blocks to {target_file}")
        
        # Delete existing index to force a rebuild on next startup
        index_file = Path("ai-service/data/faiss.index")
        chunks_file = Path("ai-service/data/chunks.json")
        if index_file.exists():
            index_file.unlink()
            print("Deleted faiss.index to force rebuild.")
        if chunks_file.exists():
            chunks_file.unlink()
            print("Deleted chunks.json to force rebuild.")
    else:
        print("No text extracted from PDFs. They might be scanned images without OCR.")

if __name__ == "__main__":
    main()
