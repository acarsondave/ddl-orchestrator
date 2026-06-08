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

@app.get("/api/search")
async def search_anime(q: str, _=Depends(verify_token)):
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"https://api.jikan.moe/v4/anime?q={q}&limit=5")
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Search provider failed")
        return resp.json()

@app.post("/api/request")
def request_anime(payload: RequestAnimePayload, _=Depends(verify_token)):
    try:
        best_links = scrape_best_links(payload.provider_id, str(payload.anime_url))
        if not best_links:
            raise HTTPException(status_code=404, detail="No valid download links found.")
        
        push_to_jdownloader(payload.anime_name, best_links)
        return {"status": "success", "message": f"Pushed {len(best_links)} links to JDownloader."}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
