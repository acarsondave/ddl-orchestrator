import urllib.request
import re
import concurrent.futures
import time
from difflib import SequenceMatcher
from urllib.parse import urljoin, urlparse, unquote

_SEARCH_CACHE = {}
_CACHE_TTL = 3600

class Provider:
    id: str
    name: str

    def health_check(self) -> bool:
        raise NotImplementedError

    def search_provider(self, query: str, media_type: str = "auto") -> list[dict]:
        raise NotImplementedError

    def get_episodes(self, anime_url: str, anime_name: str = "", media_type: str = "auto") -> list[str]:
        raise NotImplementedError

    def get_links(self, episode_url: str) -> list[str]:
        raise NotImplementedError

class TokyoInsiderProvider(Provider):
    id = "tokyoinsider"
    name = "Tokyo Insider"

    def fetch_html(self, url: str) -> str:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.read().decode('utf-8', errors='ignore')
        except Exception:
            return ""

    def health_check(self) -> bool:
        html = self.fetch_html("https://www.tokyoinsider.com")
        return bool(html and "Tokyo Insider" in html)

    def search_provider(self, query: str, media_type: str = "auto") -> list[dict]:
        global _SEARCH_CACHE
        
        clean_query = re.sub(r'^\[.*?\]\s*', '', query)
        
        cache_key = "ti_master_index"
        if cache_key not in _SEARCH_CACHE or time.time() - _SEARCH_CACHE[cache_key]['time'] > _CACHE_TTL:
            html = self.fetch_html("https://www.tokyoinsider.com/anime/list")
            _SEARCH_CACHE[cache_key] = {'time': time.time(), 'html': html}
            
        html = _SEARCH_CACHE[cache_key]['html']
        
        # Extract all <a href="/anime/...">Name</a>
        matches = re.findall(r'<a href="/anime/([^"]+)">([^<]+)</a>', html)
        
        results = []
        query_lower = clean_query.lower()
        query_words = set(re.findall(r'\w+', query_lower))
        
        for path, title in matches:
            if path in ["/anime/list", "/anime/search"]: continue
            title_lower = title.lower()
            
            ratio = SequenceMatcher(None, query_lower, title_lower).ratio()
            title_words = set(re.findall(r'\w+', title_lower))
            if query_words.issubset(title_words):
                ratio += 1.0
                
            if ratio > 0.4 or query_lower in title_lower:
                results.append({
                    "title": title,
                    "url": "https://www.tokyoinsider.com" + path,
                    "score": ratio
                })
                
        results.sort(key=lambda x: x['score'], reverse=True)
        return [{"title": r["title"], "url": r["url"]} for r in results[:20]]

    def get_episodes(self, anime_url: str, anime_name: str = "", media_type: str = "auto") -> list[str]:
        html = self.fetch_html(anime_url)
        if not html: return []
        
        parsed = urlparse(anime_url)
        path = parsed.path.rstrip('/')
        pattern = re.compile(r'href=[\'\"](' + re.escape(path) + r'/episode/\d+)[\'\"]')
        
        ep_urls = set(urljoin(anime_url, m) for m in pattern.findall(html))
        
        def get_ep_num(url):
            try: return int(url.split('/')[-1])
            except ValueError: return 0
                
        return sorted(list(ep_urls), key=get_ep_num)

    def get_links(self, episode_url: str) -> list[str]:
        html = self.fetch_html(episode_url)
        if not html: return []
        pattern = re.compile(r'href=[\'\"](https?://media\.tokyoinsider\.com[^\'\"]+)[\'\"]')
        return list(set(pattern.findall(html)))

class Universal111477Provider(Provider):
    id = "111477"
    name = "111477.xyz Universal"

    def fetch_html(self, url: str) -> str:
        from urllib.parse import quote, urlparse, unquote
        import urllib.error
        import time
        
        if not url.endswith('/') and not url.endswith('.mkv') and not url.endswith('.mp4'):
            url += '/'
            
        parsed = urlparse(url)
        safe_path = quote(unquote(parsed.path))
        safe_url = f"{parsed.scheme}://{parsed.netloc}{safe_path}"
        if parsed.query:
            safe_url += f"?{quote(unquote(parsed.query))}"
            
        req = urllib.request.Request(
            safe_url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=10) as response:
                    return response.read().decode('utf-8', errors='ignore')
            except urllib.error.HTTPError as e:
                if e.code in [429, 500, 502, 503, 504]:
                    print(f"fetch_html attempt {attempt+1} got {e.code} for {safe_url}. Retrying...")
                    time.sleep(2 ** attempt)
                    continue
                else:
                    print(f"fetch_html failed for {safe_url}: {e}")
                    return ""
            except Exception as e:
                print(f"fetch_html failed for {safe_url}: {e}")
                return ""
        return ""

    def health_check(self) -> bool:
        html = self.fetch_html("https://a.111477.xyz/")
        return "Index of" in html or bool(html)

    def search_provider(self, query: str, media_type: str = "auto") -> list[dict]:
        global _SEARCH_CACHE
        
        dirs_to_fetch = ["/movies/", "/tvs/", "/kdrama/", "/asiandrama/", "/misc/anime/"]
        
        if media_type == "movie":
            dirs_to_fetch = ["/movies/"]
        elif media_type == "tv":
            dirs_to_fetch = ["/tvs/", "/kdrama/", "/asiandrama/", "/misc/anime/"]
            
        all_matches = []
        
        def fetch_dir(d):
            cache_key = f"111477_{d}"
            if cache_key not in _SEARCH_CACHE or time.time() - _SEARCH_CACHE[cache_key]['time'] > _CACHE_TTL:
                html = self.fetch_html(f"https://a.111477.xyz{d}")
                if html:
                    _SEARCH_CACHE[cache_key] = {'time': time.time(), 'html': html}
                else:
                    return d, ""
            return d, _SEARCH_CACHE[cache_key]['html']
            
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(fetch_dir, d) for d in dirs_to_fetch]
            html_fetched = False
            for future in concurrent.futures.as_completed(futures):
                d, html = future.result()
                if html:
                    html_fetched = True
                    matches = re.findall(r'data-name="([^"]+)".*?data-url="([^"]+)"', html)
                    for name, url_path in matches:
                        # Ignore system folders and hidden .parts files
                        if name.lower() not in ["asiandrama", "kdrama", "misc", "movies", "tvs"] and not name.startswith('.'):
                            all_matches.append((name, url_path, d.strip('/')))

        if not html_fetched:
            raise Exception("Provider is currently rate-limiting or blocking requests. Please try again in a few minutes.")

        results = []
        clean_query = re.sub(r'^\[.*?\]\s*', '', query)
        query_lower = clean_query.lower()
        query_words = set(re.findall(r'\w+', query_lower))
        
        for name, url_path, category in all_matches:
            name_clean = name.replace(".", " ").replace("_", " ").lower()
            ratio = SequenceMatcher(None, query_lower, name_clean).ratio()
            
            name_words = set(re.findall(r'\w+', name_clean))
            if query_words.issubset(name_words):
                ratio += 1.0
                
            if ratio > 0.4 or query_lower in name_clean:
                results.append({
                    "title": f"{name} [{category}]",
                    "url": "https://a.111477.xyz" + url_path,
                    "score": ratio
                })
                
        results.sort(key=lambda x: x['score'], reverse=True)
        return [{"title": r["title"], "url": r["url"]} for r in results[:20]]

    def get_episodes(self, anime_url: str, anime_name: str = "", media_type: str = "auto") -> list[str]:
        html = self.fetch_html(anime_url)
        if not html: return []
        
        matches = re.findall(r'data-name="([^"]+)".*?data-url="([^"]+)"(?:.*?data-sort="([^"]+)")?', html)
        
        all_links = []
        directories_to_crawl = []
        MAX_BYTES = 10 * 1024**3 # 10GB limit
        
        for name, url_path, size_str in matches:
            name_lower = name.lower()
            if name_lower.endswith('.mkv') or name_lower.endswith('.mp4'):
                # Enforce file size limit natively if size is available
                if size_str and size_str.isdigit() and int(size_str) > MAX_BYTES:
                    continue
                    
                full_url = urljoin("https://a.111477.xyz", url_path)
                all_links.append((name, full_url))
            elif url_path.endswith('/') and name_lower not in ["asiandrama", "kdrama", "misc", "movies", "tvs"]:
                full_url = urljoin("https://a.111477.xyz", url_path)
                directories_to_crawl.append(full_url)
                
        if media_type == "movie":
            is_movie, is_tv = True, False
        elif media_type == "tv":
            is_movie, is_tv = False, True
        else:
            is_tv = "[TV]" in anime_name or "Season" in anime_url or "Episode" in anime_url
            is_movie = "[MOVIE]" in anime_name
            
        # If it's a TV show and directories exist, crawl exactly 1 level deep to find season episodes
        if is_tv and directories_to_crawl:
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = {executor.submit(self.fetch_html, d_url): d_url for d_url in directories_to_crawl}
                for future in concurrent.futures.as_completed(futures):
                    sub_html = future.result()
                    if sub_html:
                        sub_matches = re.findall(r'data-name="([^"]+)".*?data-url="([^"]+)"(?:.*?data-sort="([^"]+)")?', sub_html)
                        for sub_name, sub_url_path, sub_size_str in sub_matches:
                            sub_name_lower = sub_name.lower()
                            if sub_name_lower.endswith('.mkv') or sub_name_lower.endswith('.mp4'):
                                if sub_size_str and sub_size_str.isdigit() and int(sub_size_str) > MAX_BYTES:
                                    continue
                                sub_full = urljoin("https://a.111477.xyz", sub_url_path)
                                all_links.append((sub_name, sub_full))
        
        if is_movie and not is_tv:
            best = self._pick_best(all_links)
            return [best] if best else []
        else:
            groups = {}
            for name, full_url in all_links:
                # Find Season
                s_match = re.search(r'S(\d{1,2})', name, re.IGNORECASE)
                if not s_match:
                    s_match = re.search(r'Season\s*(\d{1,2})', name, re.IGNORECASE)
                if not s_match:
                    s_match = re.search(r'Season\s*(\d{1,2})', unquote(full_url), re.IGNORECASE)

                season = int(s_match.group(1)) if s_match else 1
                
                # Find Episode
                ep_match = re.search(r'(?:S\d+E|E|Ep\s*|Episode\s*|-\s*)(\d{1,4})', name, re.IGNORECASE)
                if ep_match:
                    ep_num = int(ep_match.group(1))
                    group_key = f"S{season:02d}E{ep_num:02d}"
                    if group_key not in groups:
                        groups[group_key] = []
                    groups[group_key].append((name, full_url))
                else:
                    if "misc" not in groups: groups["misc"] = []
                    groups["misc"].append((name, full_url))
            
            final_links = []
            # Sort keys so episodes are returned in S01E01 order
            for ep in sorted(groups.keys()):
                best = self._pick_best(groups[ep])
                if best: final_links.append(best)
            return final_links

    def _pick_best(self, links_tuples):
        if not links_tuples: return None
        sorted_links = sorted(links_tuples, key=lambda x: score_link(x[0]), reverse=True)
        return sorted_links[0][1]

    def get_links(self, episode_url: str) -> list[str]:
        import urllib.request
        from urllib.error import HTTPError
        import time
        
        # Use a realistic browser User-Agent to bypass Cloudflare 403s on HEAD requests
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        req = urllib.request.Request(episode_url, headers=headers, method='HEAD')
        max_retries = 3
        
        # We just crawled the index page, so let's breathe for 1 second to avoid instant 429s from the proxy
        time.sleep(1)
        
        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return [resp.url]
            except HTTPError as e:
                if e.code in (429, 500, 502, 503, 504):
                    print(f"Redirect resolution rate-limited ({e.code}). Retrying {attempt+1}/{max_retries} for {episode_url}")
                    time.sleep(2 ** attempt)
                    continue
                print(f"Failed to resolve redirect for {episode_url} (HTTP {e.code})")
                break
            except Exception as e:
                print(f"Failed to resolve redirect for {episode_url}: {e}")
                break
                
        # If all retries fail, return the original URL and pray JDownloader handles it
        return [episode_url]

class ProviderRegistry:
    def __init__(self):
        self.providers: dict[str, Provider] = {}

    def register(self, provider: Provider):
        self.providers[provider.id] = provider

    def get(self, provider_id: str) -> Provider | None:
        return self.providers.get(provider_id)

    def list_all(self):
        return list(self.providers.values())

registry = ProviderRegistry()
registry.register(TokyoInsiderProvider())
registry.register(Universal111477Provider())

def score_link(link: str) -> int:
    score = 0
    link_lower = link.lower()
    
    # Normalize codecs (e.g. h.264 -> h264)
    normalized_link = link_lower.replace('h.264', 'h264').replace('h.265', 'h265')
    
    # Resolution (1080p is the sweet spot for VPS streaming without transcoding)
    if '1080p' in normalized_link:
        score += 1000
    elif '720p' in normalized_link:
        score += 500
    elif any(k in normalized_link for k in ['2160p', '4k', 'uhd']):
        score -= 500 # 4K almost always transcodes unless the client is perfect
        
    # Video Codec (H.264 is the undisputed king of Direct Play compatibility)
    if any(k in normalized_link for k in ['h264', 'x264', 'avc']):
        score += 5000
    elif any(k in normalized_link for k in ['hevc', 'x265', 'h265']):
        score -= 500
        
    # Source (WEB-DLs are pre-optimized for streaming. BluRays have exotic codecs that force transcodes)
    if 'web-dl' in normalized_link or 'webrip' in normalized_link:
        score += 2000
    if 'bluray' in normalized_link or 'bdrip' in normalized_link or 'remux' in normalized_link:
        score -= 1000
        
    # Audio Codec (AAC is universal. DTS/TrueHD force audio transcoding)
    if 'aac' in normalized_link:
        score += 1000
    if 'ddp' in normalized_link or 'eac3' in normalized_link or 'ac3' in normalized_link:
        score += 500
    if 'dts' in normalized_link or 'truehd' in normalized_link:
        score -= 1000
        
    # Container
    if normalized_link.endswith('.mp4'):
        score += 15000
    elif normalized_link.endswith('.mkv'):
        score += 10000
        
    return score

def get_best_link(links: list[str]) -> str | None:
    if not links: return None
    return sorted(links, key=score_link, reverse=True)[0]

def scrape_best_links(provider_id: str, anime_url: str, anime_name: str = "", media_type: str = "auto", max_workers: int = 5) -> list[str]:
    provider = registry.get(provider_id)
    if not provider:
        raise ValueError("Invalid provider ID")

    episodes = provider.get_episodes(anime_url, anime_name, media_type)
    best_links = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_ep = {executor.submit(provider.get_links, ep): ep for ep in episodes}
        for future in concurrent.futures.as_completed(future_to_ep):
            links = future.result()
            best_link = get_best_link(links)
            if best_link:
                best_links.append(best_link)
                
    return best_links
