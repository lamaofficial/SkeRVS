import re
import os

def read_large_file(file_path, chunk_size=1024*1024):
    """
    Generator to read a large file chunk by chunk.
    
    Args:
        file_path (str): Path to the file.
        chunk_size (int): Size of chunks to read. Defaults to 1MB.
        
    Yields:
        str: Text chunk.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            yield chunk

def read_file_as_lines_generator(file_path):
    """
    Generator to read a large file line by line.
    Useful when the file is naturally line-based.
    
    Args:
        file_path (str): Path to the file.
        
    Yields:
        str: Line of text.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            yield line

def clean_paragraph(text):
    """
    Clean text by removing noise like page numbers, copyright info, etc.
    
    Args:
        text (str): Input text chunk or paragraph.
        
    Returns:
        str: Cleaned text.
    """
    if not text:
        return ""

    # Common noise patterns
    # Remove potential page numbers (e.g., "- 1 -", "Page 1")
    text = re.sub(r'^\s*[-_]?\s*page\s*\d+\s*[-_]?\s*$', '', text, flags=re.IGNORECASE | re.MULTILINE)
    text = re.sub(r'^\s*[-_]?\s*\d+\s*[-_]?\s*$', '', text, flags=re.MULTILINE)
    
    # Remove copyright symbols and common boilerplate (simple example)
    text = re.sub(r'©.*?(\n|$)', '', text)
    
    # Normalize whitespace (replace multiple spaces/newlines with single)
    # But we might want to keep paragraph structure. 
    # For now, let's just strip leading/trailing whitespace per line if iterating by lines.
    
    return text.strip()

def split_sentences(text):
    """
    Split text into sentences logic.
    
    Args:
        text (str): Input text.
        
    Returns:
        list: List of sentences.
    """
    # Simple split by punctuation for Chinese and English
    # ? ! ; 。 ！？
    # Using regex split which keeps the delimiter if wrapped in ()
    
    # Pattern: Split by [.!?。！？] optionally followed by quote marks ["”'’]
    pattern = r'([.!?。！？]["”\'’]?)'
    
    # split returns [part1, sep1, part2, sep2, ...]
    parts = re.split(pattern, text)
    
    sentences = []
    current_sent = ""
    
    for part in parts:
        current_sent += part
        # If the part looks like a separator (or ends with one), consider it a sentence end
        if re.search(pattern, part):
            if current_sent.strip():
                sentences.append(current_sent.strip())
            current_sent = ""
            
    if current_sent.strip():
        sentences.append(current_sent.strip())
        
    return sentences
