import jieba
import jieba.analyse
import networkx as nx
from collections import defaultdict
from itertools import combinations
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class TextProcessor:
    def __init__(self, top_k=500):
        self.top_k = top_k
        self.keywords = []
        self.stop_words = set()
        # You could load custom stop words here
        
    def load_stopwords(self, filepath):
        if filepath:
            jieba.analyse.set_stop_words(filepath)
            
    def extract_keywords(self, text, allowPOS=('ns', 'n', 'vn', 'v', 'nr', 'nt', 'nz')):
        """
        Extract top K keywords using Hybrid TF-IDF and TextRank fusion.
        Score = 0.6 * Norm(TF-IDF) + 0.4 * Norm(TextRank)
        """
        logging.info("Starting hybrid keyword extraction...")
        
        # Method 1: TF-IDF
        # Get more candidates first to ensure intersection overlap
        candidates_count = self.top_k * 2
        
        tfidf_results = jieba.analyse.extract_tags(text, topK=candidates_count, withWeight=True, allowPOS=allowPOS)
        tfidf_dict = {k: w for k, w in tfidf_results}
        
        # Method 2: TextRank
        textrank_results = jieba.analyse.textrank(text, topK=candidates_count, withWeight=True, allowPOS=allowPOS)
        textrank_dict = {k: w for k, w in textrank_results}
        
        # Normalize scores (Min-Max normalization to 0-1 range approx, relative to max score in set)
        def normalize(d):
            if not d: return {}
            max_val = max(d.values())
            return {k: v/max_val for k, v in d.items()}

        tfidf_norm = normalize(tfidf_dict)
        textrank_norm = normalize(textrank_dict)
        
        # Merge Words
        all_words = set(tfidf_norm.keys()) | set(textrank_norm.keys())
        merged_scores = {}
        
        for word in all_words:
            s1 = tfidf_norm.get(word, 0.0)
            s2 = textrank_norm.get(word, 0.0)
            # Mixed Score: 0.6 TFIDF + 0.4 TextRank
            # If a word is missing in one, it gets 0 for that part, reducing its score.
            # This favors words found by BOTH algorithms.
            merged_scores[word] = 0.6 * s1 + 0.4 * s2
            
        # Sort and take Top K
        sorted_keywords = sorted(merged_scores.items(), key=lambda x: x[1], reverse=True)[:self.top_k]
        
        self.keywords = [k for k, w in sorted_keywords]
        self.keyword_weights = {k: w for k, w in sorted_keywords}
        
        logging.info(f"Extracted {len(self.keywords)} hybrid keywords.")
        return self.keywords

    def get_context_sentences(self, sentences, keyword, limit=5):
        """
        Find sentences containing the keyword.
        """
        matches = []
        for sent in sentences:
            if keyword in sent:
                matches.append(sent)
                if len(matches) >= limit:
                    break
        return matches

    def detect_communities(self, edges):
        """
        Detect communities using NetworkX Louvain Algorithm.
        Returns a dict mapping {word: group_id}
        """
        if not edges:
            return {}
            
        logging.info("Detecting communities...")
        G = nx.Graph()
        for edge in edges:
            G.add_edge(edge['source'], edge['target'], weight=edge['weight'])
            
        try:
            # Use built-in louvain if available (NetworkX 2.7+)
            if hasattr(nx.community, 'louvain_communities'):
                communities = nx.community.louvain_communities(G, weight='weight')
            else:
                # Fallback to simple greedy modularity
                communities = nx.community.greedy_modularity_communities(G, weight='weight')
                
            # Convert list of sets to dict
            partition = {}
            for i, comm in enumerate(communities):
                for node in comm:
                    partition[node] = i
            
            logging.info(f"Detected {len(communities)} communities.")
            return partition
        except Exception as e:
            logging.error(f"Community detection failed: {e}")
            return {node: 0 for node in G.nodes()}

    def build_cooccurrence_matrix(self, sentences, window_size=1, merge_map=None):
        """
        Build co-occurrence graph based on sentences.
        
        Args:
            sentences (list): List of sentence strings.
            window_size (int): Windows size.
            merge_map (dict): Optional mapping { 'variant': 'canonical' }
        """
        if not self.keywords:
            logging.warning("No keywords found. Run extract_keywords first.")
            return []

        logging.info("Building co-occurrence matrix...")
        keyword_set = set(self.keywords)
        # If we have merged words, we also need to search for the hidden variants!
        # Because 'NLP' might be in text, but 'Natural Language Processing' is in keyword_set.
        
        search_terms = keyword_set.copy()
        if merge_map:
            search_terms.update(merge_map.keys())
            
        cooccur_counts = defaultdict(int)
        
        for sent in sentences:
            # Tokenize sentence
            words = jieba.lcut(sent)
            
            # Find relevant tokens in this sentence
            found_canonical = []
            for w in words:
                if w in search_terms:
                    # Resolve to canonical form if applicable
                    canonical = merge_map.get(w, w) if merge_map else w
                    if canonical in keyword_set:
                        found_canonical.append(canonical)
            
            unique_keywords = sorted(list(set(found_canonical)))
            
            if len(unique_keywords) < 2:
                continue
                
            # Generate pairs
            for u, v in combinations(unique_keywords, 2):
                cooccur_counts[(u, v)] += 1
                
        # Convert to list of dicts or edges
        edges = []
        for (u, v), count in cooccur_counts.items():
            # You might want to normalize weight here
            weight = count 
            edges.append({
                "source": u,
                "target": v,
                "weight": weight
            })
            
        # Sort by weight desc
        edges.sort(key=lambda x: x["weight"], reverse=True)
        
        logging.info(f"Found {len(edges)} associations.")
        return edges

    def get_keywords_with_weights(self):
        return [{"word": k, "weight": self.keyword_weights.get(k, 0)} for k in self.keywords]
