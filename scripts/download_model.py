import os
import requests
import sys

# Define model path
MODEL_DIR = "src/data/models"
MODEL_FILE = os.path.join(MODEL_DIR, "word2vec.bin")

# This is a sample URL. In a real scenario, you'd use a stable link to a pre-trained Chinese vector model.
# For example, Tencent AI Lab embedding (small version) or a fastText model.
# Since we can't guarantee a specific public URL stability here, I'll provide instructions.
DOWNLOAD_URL = "https://github.com/Embedding/Chinese-Word-Vectors/releases/download/v0.1/sgns.target.word-word.dynwin5.thr10.neg5.dim300.iter5.bz2" 
# NOTE: The above is a placeholder. Users should download their preferred model.

def ensure_dir(directory):
    if not os.path.exists(directory):
        os.makedirs(directory)
        print(f"Created directory: {directory}")

def main():
    print("="*50)
    print("      Smart Keyword Extraction System      ")
    print("      Word2Vec Model Downloader Helper     ")
    print("="*50)
    
    ensure_dir(MODEL_DIR)
    
    if os.path.exists(MODEL_FILE):
        print(f"Model already exists at: {MODEL_FILE}")
        choice = input("Do you want to re-download? (y/n): ")
        if choice.lower() != 'y':
            return
            
    print("\nInstructions:")
    print("1. Download a pre-trained Word2Vec model (e.g., .bin or .vec format).")
    print("   Recommendation: https://github.com/Embedding/Chinese-Word-Vectors")
    print(f"2. Rename the file to: word2vec.bin")
    print(f"3. Place it in: {os.path.abspath(MODEL_DIR)}")
    print("\nNote: The system supports both binary (.bin) and text (.vec/.txt) formats.")
    print("If using text format, ensure the file extension matches the content or update the loader code.")

if __name__ == "__main__":
    main()
