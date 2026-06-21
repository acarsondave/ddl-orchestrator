import os
import requests
import urllib.parse
from typing import List, Dict, Optional

class SubtitleProvider:
    @property
    def name(self) -> str:
        return "Generic Provider"
        
    def search(self, query: str) -> List[Dict[str, str]]:
        return []
        
    def get_download_link(self, file_id: str) -> Optional[str]:
        return None

registry = {}

class OpenSubtitlesProvider(SubtitleProvider):
    @property
    def name(self) -> str:
        return "OpenSubtitles"
        
    def search(self, query: str) -> List[Dict[str, str]]:
        api_key = os.environ.get("OPEN_SUBTITLES_API_KEY")
        if not api_key:
            return []
            
        headers = {
            "Api-Key": api_key,
            "User-Agent": "AcarsonDDLOrchestrator v1"
        }
        
        # Clean query, sometimes queries with '[TV]' break search
        clean_query = query.replace("[TV]", "").replace("[ANIME]", "").strip()
        
        try:
            resp = requests.get(
                "https://api.opensubtitles.com/api/v1/subtitles",
                headers=headers,
                params={"query": clean_query, "languages": "en"}
            )
            if resp.status_code != 200:
                return []
            
            data = resp.json()
            results = []
            for item in data.get("data", []):
                attrs = item.get("attributes", {})
                files = attrs.get("files", [])
                if not files: continue
                
                file_info = files[0]
                release_name = attrs.get("release", "Unknown")
                # Sometimes release is empty, fallback to movie name
                if not release_name or release_name == "Unknown":
                    release_name = file_info.get("file_name", "Unknown")
                    
                results.append({
                    "id": str(file_info.get("file_id")),
                    "provider": "opensubtitles",
                    "filename": release_name,
                    "language": attrs.get("language", "en"),
                    "downloads": attrs.get("download_count", 0)
                })
            # Return top 20
            return sorted(results, key=lambda x: x["downloads"], reverse=True)[:20]
        except Exception as e:
            print(f"OS API Error: {e}")
            return []
            
    def get_download_link(self, file_id: str) -> Optional[str]:
        api_key = os.environ.get("OPEN_SUBTITLES_API_KEY")
        if not api_key: return None
        headers = {
            "Api-Key": api_key,
            "User-Agent": "AcarsonDDLOrchestrator v1",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        payload = {"file_id": int(file_id)}
        try:
            resp = requests.post("https://api.opensubtitles.com/api/v1/download", headers=headers, json=payload)
            if resp.status_code == 200:
                return resp.json().get("link")
            return None
        except:
            return None

class SubDLProvider(SubtitleProvider):
    @property
    def name(self) -> str:
        return "SubDL"
        
    def search(self, query: str) -> List[Dict[str, str]]:
        api_key = os.environ.get("SUBDL_API_KEY")
        if not api_key:
            return []
            
        clean_query = query.replace("[TV]", "").replace("[ANIME]", "").strip()
        
        try:
            resp = requests.get(
                "https://api.subdl.com/api/v1/subtitles",
                params={"api_key": api_key, "film_name": clean_query, "languages": "EN"}
            )
            if resp.status_code != 200:
                return []
                
            data = resp.json()
            results = []
            for item in data.get("subtitles", []):
                # SubDL often returns zip files, we need the link to the zip.
                # JDownloader can extract zips!
                link = item.get("url")
                if link:
                    results.append({
                        "id": "https://dl.subdl.com" + link, # SubDL API directly gives download path
                        "provider": "subdl",
                        "filename": item.get("release_name", "Unknown"),
                        "language": "EN",
                        "downloads": 0
                    })
            return results[:20]
        except Exception as e:
            print(f"SubDL API Error: {e}")
            return []
            
    def get_download_link(self, file_id: str) -> Optional[str]:
        # file_id here is directly the URL for subdl
        return file_id

registry["opensubtitles"] = OpenSubtitlesProvider()
registry["subdl"] = SubDLProvider()

def search_subtitles(query: str) -> List[Dict[str, str]]:
    all_results = []
    for pid, provider in registry.items():
        all_results.extend(provider.search(query))
    return all_results
    
def get_subtitle_download_link(provider_id: str, file_id: str) -> Optional[str]:
    provider = registry.get(provider_id)
    if provider:
        return provider.get_download_link(file_id)
    return None
