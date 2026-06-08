import urllib.request
import re
import concurrent.futures
from urllib.parse import urljoin, urlparse

class Provider:
    id: str
    name: str

    def health_check(self) -> bool:
        raise NotImplementedError

    def get_episodes(self, anime_url: str) -> list[str]:
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

    def get_episodes(self, anime_url: str) -> list[str]:
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
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.read().decode('utf-8', errors='ignore')
        except Exception:
            return ""

    def health_check(self) -> bool:
        html = self.fetch_html("https://a.111477.xyz/")
        return "Index of" in html or bool(html)

    def get_episodes(self, anime_url: str) -> list[str]:
        html = self.fetch_html(anime_url)
        if not html: return []
        
        matches = re.findall(r'data-name="([^"]+)".*?data-url="([^"]+)"', html)
        
        ep_urls = []
        for name, url_path in matches:
            name_lower = name.lower()
            if name_lower.endswith('.mkv') or name_lower.endswith('.mp4'):
                # Ensure the url_path is absolute or join it properly
                full_url = urljoin("https://a.111477.xyz", url_path)
                ep_urls.append(full_url)
                
        return ep_urls

    def get_links(self, episode_url: str) -> list[str]:
        # For this provider, the episode_url is already the direct download link
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
    
    if any(k in link_lower for k in ['h264', 'x264', 'avc']):
        score += 50
        
    if re.search(r's\d+e\d+', link_lower):
        score += 50
        
    if any(k in link_lower for k in ['hevc', 'x265', 'h265']):
        score -= 100
        
    if ".mkv" in link_lower:
        score += 5
        
    return score

def get_best_link(links: list[str]) -> str | None:
    if not links: return None
    return sorted(links, key=score_link, reverse=True)[0]

def scrape_best_links(provider_id: str, anime_url: str, max_workers: int = 5) -> list[str]:
    provider = registry.get(provider_id)
    if not provider:
        raise ValueError("Invalid provider ID")

    episodes = provider.get_episodes(anime_url)
    best_links = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_ep = {executor.submit(provider.get_links, ep): ep for ep in episodes}
        for future in concurrent.futures.as_completed(future_to_ep):
            links = future.result()
            best_link = get_best_link(links)
            if best_link:
                best_links.append(best_link)
                
    return best_links
