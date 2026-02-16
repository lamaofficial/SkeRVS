from fastapi import FastAPI, UploadFile, File, HTTPException, Request, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import pydantic
import shutil
import os
import sys
import logging
import time
import uuid
import asyncio
from typing import Dict
from concurrent.futures import ThreadPoolExecutor

# Add src to path from "src/api" -> "src" -> root
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.utils.cleaner import read_large_file, clean_paragraph, split_sentences
from src.core.processor import TextProcessor
from src.core.merger import SynonymMerger
from src.core.copilot_namer import GroupNamer

app = FastAPI(title="Smart Keyword Extraction System")

# Mount static files
app.mount("/static", StaticFiles(directory="src/static"), name="static")

# Templates
templates = Jinja2Templates(directory="src/templates")

# Globals
UPLOAD_DIR = "data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
STOPWORDS_FILE = "data/stopwords.txt"
# Optional: Load Word2Vec model if exists
# Update path to match where user likely placed it (src/data/models)
WORD2VEC_MODEL = "src/data/models/word2vec.bin" 

# Task Management (In-Memory for Dev)
class TaskManager:
    def __init__(self):
        self.tasks: Dict[str, dict] = {}
        self.executor = None # Lazily initialized

    def create_task(self):
        task_id = str(uuid.uuid4())
        self.tasks[task_id] = {
            "status": "pending",
            "progress": 0,
            "message": "Queued", # Default message
            "result": None,
            "error": None
        }
        return task_id

    def update_task(self, task_id, status, progress, message=None, result=None, error=None):
        if task_id in self.tasks:
            self.tasks[task_id]["status"] = status
            self.tasks[task_id]["progress"] = int(progress) # Ensure int
            if message: self.tasks[task_id]["message"] = message
            if result: self.tasks[task_id]["result"] = result
            if error: self.tasks[task_id]["error"] = error
            
            # log updates
            # logging.info(f"Task {task_id}: {status} {progress}% {message}")

    def get_task(self, task_id):
        return self.tasks.get(task_id)

task_manager = TaskManager()

# Background Analysis Logic
def run_analysis_background(task_id: str, filename: str, use_ai_naming: bool = False):
    logging.info(f"Starting background task {task_id} for {filename} (AI Naming: {use_ai_naming})")
    try:
        task_manager.update_task(task_id, "processing", 10, "Reading file...")
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        if not os.path.exists(file_path):
            raise Exception("File not found")
        
        start_time = time.time()
        
        # 1. Read
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            raw_content = f.read()
            
        task_manager.update_task(task_id, "processing", 30, "Preprocessing text...")
        full_text = clean_paragraph(raw_content)
        sentences = split_sentences(full_text)
        
        # 2. Extract
        task_manager.update_task(task_id, "processing", 50, "Extracting keywords...")
        processor = TextProcessor(top_k=5000)
        if os.path.exists(STOPWORDS_FILE):
            processor.load_stopwords(STOPWORDS_FILE)
            
        processor.extract_keywords(full_text, allowPOS=('ns', 'n', 'vn', 'nr', 'nt', 'nz'))
        
        # 2.1 Merge Synonyms
        task_manager.update_task(task_id, "processing", 70, "Merging synonyms...")
        merger = SynonymMerger(model_path=WORD2VEC_MODEL)
        model_used = merger.model is not None
        if model_used:
            logging.info("Word2Vec model is active for this task.")
        else:
            logging.info("Word2Vec model NOT active (using string similarity fallback).")
        
        raw_keywords = processor.get_keywords_with_weights()
        merged_keywords, merge_map = merger.merge_keywords(raw_keywords)
        
        processor.keywords = [k['word'] for k in merged_keywords]
        processor.keyword_weights = {k['word']: k['weight'] for k in merged_keywords}
        
        # 3. Co-occurrence
        task_manager.update_task(task_id, "processing", 85, "Building graph...")
        edges = processor.build_cooccurrence_matrix(sentences, merge_map=merge_map)
        
        # 4. Community Detection
        task_manager.update_task(task_id, "processing", 90, "Detecting communities...")
        partition = processor.detect_communities(edges)
        
        # 5. Group Naming with AI
        group_names = {}
        if use_ai_naming:
            task_manager.update_task(task_id, "processing", 95, "Naming groups with AI...")
            
            # Group words by community ID
            # {group_id: [word1, word2, ...]} - Sort words by weight within group for better context
            grouped_keywords = {}
            weights = processor.keyword_weights
            
            # Ensure partition uses integer values for group IDs
            # Some python libs might produce numpy ints which are not JSON serializable directly
            # but usually fine if converted.
            
            for word, group_id in partition.items():
                gid = int(group_id) # Ensure int
                if gid not in grouped_keywords:
                    grouped_keywords[gid] = []
                grouped_keywords[gid].append((word, weights.get(word, 0)))
                
            # Sort and flatten
            final_groups_dict = {}
            for gid, kw_list in grouped_keywords.items():
                # Sort by weight desc
                sorted_kws = sorted(kw_list, key=lambda x: x[1], reverse=True)
                final_groups_dict[gid] = [x[0] for x in sorted_kws]

            namer = GroupNamer()
            group_names = namer.name_all_groups(final_groups_dict)
            logging.info(f"Generated group names: {list(group_names.items())[:5]}...") # Log sample
        else:
            task_manager.update_task(task_id, "processing", 95, "Skipping AI Naming...")
            # Fallback: Just return empty or numeric names if needed by frontend
            # The frontend logic seems to handle missing group_names map by using ID
            pass
        
        duration = time.time() - start_time
        
        result = {
            "meta": {
                "file": filename,
                "model_used": model_used,
                "duration": f"{duration:.2f}s",
                "stats": {
                    "chars": len(full_text),
                    "nodes": len(processor.keywords),
                    "links": len(edges),
                    "groups": len(group_names)
                }
            },
            "nodes": [{"id": k['word'], "weight": k['weight'], "group": int(partition.get(k['word'], 0)), "groupName": group_names.get(int(partition.get(k['word'], 0)), group_names.get(str(partition.get(k['word'], 0)), f"Group {partition.get(k['word'], 0)}"))} for k in processor.get_keywords_with_weights()],
            "links": edges,
            "groups": [{"id": gid, "name": name, "keywords": final_groups_dict.get(gid, []) if 'final_groups_dict' in locals() else []} for gid, name in group_names.items()],
            "group_names": {str(k): v for k, v in group_names.items()} # Convert keys to string explicitly to ensure JS compatibility
        }
        
        task_manager.update_task(task_id, "completed", 100, "Analysis complete!", result=result)
        logging.info(f"Task {task_id} completed successfully.")
        
    except Exception as e:
        import traceback
        logging.error(f"Task failed: {e}")
        logging.error(traceback.format_exc())
        task_manager.update_task(task_id, "failed", 0, str(e), error=str(e))

# Configure logging
logging.basicConfig(level=logging.INFO)

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="Only .txt files are supported")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"filename": file.filename, "message": "Upload successful"}

from typing import List, Union

class ContextRequest(pydantic.BaseModel):
    filename: str
    keyword: Union[str, List[str]]

@app.post("/context")
async def get_context(request: ContextRequest):
    file_path = os.path.join(UPLOAD_DIR, request.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        # Optimization: In a real app, we'd cache the sentences in Redis or memory
        # instead of re-reading file. For this demo, we read again.
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            raw_content = f.read()
        full_text = clean_paragraph(raw_content)
        sentences = split_sentences(full_text)
        
        matches = []
        limit = 10
        
        # Handle single keyword or list of keywords (intersection search)
        if isinstance(request.keyword, list):
            keywords = set(request.keyword)
            # Find sentences containing ALL keywords
            for sent in sentences:
                if all(k in sent for k in keywords):
                    matches.append(sent)
                    if len(matches) >= limit:
                        break
        else:
            processor = TextProcessor()
            matches = processor.get_context_sentences(sentences, request.keyword, limit=limit)
        
        return {"keyword": request.keyword, "sentences": matches}

        
    except Exception as e:
        logging.error(f"Error fetching context: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze")
async def start_analysis(filename: str, use_ai_naming: bool = False):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    task_id = task_manager.create_task()
    task_manager.update_task(task_id, "queued", 0, "Task queued...")
    
    # Run in background (non-blocking) using custom thread pool
    if not task_manager.executor:
        task_manager.executor = ThreadPoolExecutor(max_workers=3)
        
    loop = asyncio.get_event_loop()
    loop.run_in_executor(task_manager.executor, run_analysis_background, task_id, filename, use_ai_naming)
    
    return {"task_id": task_id, "status": "queued"}

@app.websocket("/ws/task/{task_id}")
async def websocket_task(websocket: WebSocket, task_id: str):
    await websocket.accept()
    try:
        logging.info(f"WebSocket connected for task: {task_id}")
        loop_count = 0
        while True:
            task = task_manager.get_task(task_id)
            if not task:
                logging.error(f"Task not found: {task_id}")
                await websocket.send_json({"status": "error", "message": "Task not found"})
                break
            
            # Send status update
            payload = {
                "status": task["status"],
                "progress": task["progress"],
                "message": task.get("message", "")
            }
            
            # If completed, include the result in the final frame
            if task["status"] == "completed":
                payload["result"] = task["result"]
                logging.info(f"Task {task_id} completed. Sending result.")

            await websocket.send_json(payload)
            
            if task["status"] in ["completed", "failed"]:
                logging.info(f"Task {task_id} {task['status']}, closing socket.")
                # Wait a bit to ensure client receives the message before closing?
                # Actually, sending and breaking implies server defaults to closing.
                # Let's keep it open for a second.
                await asyncio.sleep(1.0)
                break
                
            await asyncio.sleep(0.5) 
            loop_count += 1
            if loop_count % 10 == 0:
                logging.info(f"Task {task_id} progress: {task['progress']}%")
            
    except Exception as e:
        import traceback
        logging.error(f"WebSocket error: {e}") 
        logging.error(traceback.format_exc())
    finally:
        logging.info(f"WebSocket closed for task: {task_id}")

# @app.post("/analyze-sync-backup")
# async def analyze_file(filename: str):
# ... old implementation ...
