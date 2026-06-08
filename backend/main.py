from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
import httpx
import os
import hmac
from dotenv import load_dotenv
from scraper import scrape_best_links, registry
from jdownloader import push_to_jdownloader

load_dotenv()

app = FastAPI()

import time
from starlette.requests import Request
from starlette.responses import JSONResponse

# Simple in-memory rate limiting (30 requests per minute per IP)
rate_limits = {}

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host
    now = time.time()
    
    if client_ip not in rate_limits:
        rate_limits[client_ip] = []
        
    # Remove old requests
    rate_limits[client_ip] = [t for t in rate_limits[client_ip] if now - t < 60]
    
    if len(rate_limits[client_ip]) >= 30:
        return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down."})
        
    rate_limits[client_ip].append(now)
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ddl-orchestrator.minirecc.com", "http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.environ.get("API_KEY", "changeme").encode('utf-8')

def verify_token(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    token = authorization.split(" ")[1].encode('utf-8')
    
    if len(token) != len(API_KEY) or not hmac.compare_digest(token, API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")

class SearchProviderPayload(BaseModel):
    provider_id: str
    query: str
    media_type: str = "auto"

class RequestAnimePayload(BaseModel):
    provider_id: str
    anime_name: str
    anime_url: HttpUrl
    media_type: str = "auto"
    dry_run: bool = False

@app.post("/api/search_provider")
def search_provider(payload: SearchProviderPayload, _=Depends(verify_token)):
    provider = registry.get(payload.provider_id)
    if not provider:
        raise HTTPException(status_code=400, detail="Invalid provider")
        
    try:
        results = provider.search_provider(payload.query, payload.media_type)
        return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/providers")
def list_providers(_=Depends(verify_token)):
    providers = []
    for p in registry.list_all():
        providers.append({
            "id": p.id,
            "name": p.name,
            "healthy": p.health_check()
        })
    return providers

import urllib.request
import urllib.parse
import re
import asyncio

import json

def search_imdb(query: str):
    if not query: return []
    # IMDB autocomplete requires the first letter in the path
    first_char = urllib.parse.quote(query[0].lower())
    url = f"https://v3.sg.media-imdb.com/suggestion/{first_char}/{urllib.parse.quote(query)}.json"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        resp = urllib.request.urlopen(req, timeout=5).read().decode('utf-8')
        data = json.loads(resp)
        results = []
        seen = set()
        for item in data.get('d', []):
            if item.get('qid') not in ["movie", "tvSeries", "tvMiniSeries"]:
                continue
            
            mt = "MOVIE" if item['qid'] == "movie" else "TV"
            title = item.get('l', '')
            year = item.get('y', '')
            if not year and item.get('yr'):
                year = str(item.get('yr')).split('-')[0]
                
            sig = f"{mt}-{title}-{year}"
            if sig in seen:
                continue
            seen.add(sig)
                
            img = item.get('i', {}).get('imageUrl', f"https://via.placeholder.com/200x300/121212/ffffff?text={urllib.parse.quote(title)}")
            
            results.append({
                "title": f"[{mt}] {title}",
                "year": str(year),
                "images": {"jpg": {"image_url": img}}
            })
        return results
    except Exception as e:
        print("IMDB Error:", e)
        return []

@app.get("/api/search")
async def search_anime(q: str, _=Depends(verify_token)):
    imdb_results = await asyncio.to_thread(search_imdb, q)
    
    jikan_results = []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"https://api.jikan.moe/v4/anime?q={q}&limit=5", timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                for item in data.get("data", []):
                    item["title"] = f"[ANIME] {item['title']}"
                    jikan_results.append(item)
    except Exception:
        pass
        
    return {"data": imdb_results[:8] + jikan_results[:5]}

@app.post("/api/request")
def request_anime(payload: RequestAnimePayload, _=Depends(verify_token)):
    try:
        best_links = scrape_best_links(payload.provider_id, str(payload.anime_url), payload.anime_name, payload.media_type)
        if not best_links:
            raise HTTPException(status_code=404, detail="No valid download links found.")
        
        if payload.dry_run:
            return {"status": "success", "links": best_links}
            
        push_to_jdownloader(payload.anime_name, best_links)
        return {"status": "success", "message": f"Pushed {len(best_links)} links to JDownloader."}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/downloads")
def get_downloads(_=Depends(verify_token)):
    try:
        from jdownloader import get_downloads_status
        return get_downloads_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
