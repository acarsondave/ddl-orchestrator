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

class RequestAnimePayload(BaseModel):
    provider_id: str
    anime_name: str
    anime_url: HttpUrl
    media_type: str = "auto"
    dry_run: bool = False

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

def search_tmdb(query: str):
    url = f"https://www.themoviedb.org/search?query={urllib.parse.quote(query)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
    try:
        html = urllib.request.urlopen(req, timeout=5).read().decode('utf-8')
    except Exception:
        return []

    results = []
    cards_html = re.findall(r'class="comp:media-card(.*?)</p></div></div></div></div>', html, re.DOTALL)
    
    for card_html in cards_html:
        media_type = re.search(r'data-media-type="([^"]+)"', card_html)
        title = re.search(r'<h2[^>]*><span>([^<]+)</span></h2>', card_html)
        date = re.search(r'<span class="release_date[^>]*>([^<]+)</span>', card_html)
        img = re.search(r'src="(https://media\.themoviedb\.org/t/p/[^"]+)"', card_html)
        
        if not media_type or not title: continue
        mt = media_type.group(1)
        if mt not in ["movie", "tv"]: continue
        
        t = title.group(1).replace('&#39;', "'")
        d = date.group(1).split(',')[-1].strip() if date else ""
        i = img.group(1) if img else f"https://via.placeholder.com/200x300/121212/ffffff?text={urllib.parse.quote(t)}"
        
        results.append({
            "title": f"[{mt.upper()}] {t}",
            "year": d,
            "images": {"jpg": {"image_url": i}}
        })
    return results

@app.get("/api/search")
async def search_anime(q: str, _=Depends(verify_token)):
    tmdb_results = await asyncio.to_thread(search_tmdb, q)
    
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
        
    return {"data": tmdb_results[:8] + jikan_results[:5]}

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
