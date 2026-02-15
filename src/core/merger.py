import logging
import os
import numpy as np
from collections import defaultdict

# Try importing gensim, handle if not installed
try:
    from gensim.models import KeyedVectors
    GENSIM_AVAILABLE = True
except ImportError:
    GENSIM_AVAILABLE = False
    logging.warning("Gensim not found. Semantic merging will be disabled.")

class SynonymMerger:
    def __init__(self, model_path=None, similarity_threshold=0.85):
        self.model = None
        self.similarity_threshold = similarity_threshold
        if GENSIM_AVAILABLE and model_path and os.path.exists(model_path):
            logging.info(f"Loading Word2Vec model from {model_path}...")
            # Detect binary vs text format
            binary = model_path.endswith('.bin')
            try:
                self.model = KeyedVectors.load_word2vec_format(model_path, binary=binary)
                logging.info("Model loaded successfully.")
            except Exception as e:
                logging.error(f"Failed to load model: {e}")
        else:
            if model_path:
                logging.warning(f"Model path {model_path} not found.")

    def get_similarity(self, word1, word2):
        # Fallback B: Edit Distance (Levenshtein-like) via Difflib for robustness without model
        import difflib
        # Ratio > 0.8 means very similar spelling. 
        # e.g., "Word2Vec" vs "Word2vec"
        string_sim = difflib.SequenceMatcher(None, word1.lower(), word2.lower()).ratio()
        
        if not self.model:
            return string_sim
        
        # Check if words are in vocabulary
        if word1 not in self.model or word2 not in self.model:
            return string_sim # Fallback to string similarity if OOV
            
        semantic_sim = self.model.similarity(word1, word2)
        # Average or Max? Max is likely better if one signal is strong.
        return max(string_sim, semantic_sim)

    def merge_keywords(self, keywords_with_weights):
        """
        Merge likely synonymous keywords.
        Uses Word2Vec if available, otherwise falls back to basic string similarity.
        
        Args:
            keywords_with_weights (list): List of dicts [{'word': 'A', 'weight': 1.0}, ...]
            
        Returns:
            list: New list of merged keywords.
            dict: Mapping from old word to new representative word {'old': 'new'}
        """
        logging.info("Starting keyword merging...")
        
        # Sort by weight desc (preserve high importance words as representatives)
        sorted_kws = sorted(keywords_with_weights, key=lambda x: x['weight'], reverse=True)
        # Limit comparison scope for performance (O(N^2))
        # If N=2000, 4M comparisons is too much for Python loop.
        # Let's limit to top 200 for merging candidates if no model (heuristic)
        # Or just run it. 2000*2000 is 4M, might take a few seconds.
        # Given "1-10MB text", processing time is acceptable.
        
        merged_map = {} # removed -> kept
        final_keywords = []
        
        skip_set = set()
        
        # Optimization: Only compare top N words against others to save time
        # Or compare all if list is small (<500)
        limit = 500 if len(sorted_kws) > 500 else len(sorted_kws)
        
        for i in range(len(sorted_kws)):
            kw_i = sorted_kws[i]
            word_i = kw_i['word']
            
            if word_i in skip_set:
                continue
            
            # This word is kept as a representative
            final_keywords.append(kw_i)
            
            # Only look at subsequent words to merge into this one
            # If i > limit, we stop merging into it (heuristic for speed)
            if i >= limit:
                continue

            for j in range(i + 1, len(sorted_kws)):
                kw_j = sorted_kws[j]
                word_j = kw_j['word']
                
                if word_j in skip_set:
                    continue
                
                try:
                    sim = self.get_similarity(word_i, word_j)
                    
                    if sim >= self.similarity_threshold:
                        # Merge J into I
                        # Specifically, word_i is the representative (higher weight), so j maps to i.
                        merged_map[word_j] = word_i 
                        skip_set.add(word_j)
                        # logging.info(f"Merging '{word_j}' into '{word_i}' (Score: {sim:.2f})")
                        
                except Exception as e:
                    continue

        # Filter out skipped keywords
        final_keywords = [k for k in sorted_kws if k['word'] not in skip_set]
        
        logging.info(f"Merged {len(skip_set)} keywords into representatives.")
        return final_keywords, merged_map
