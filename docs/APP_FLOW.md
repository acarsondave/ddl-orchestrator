# App Flow
1. User hits Cloudflare Pages URL.
2. Prompts for Password.
3. Authenticates with Fly.io Backend (wakes up instance).
4. Search -> Requests Jikan API -> Renders Anime Grid.
5. Select Anime -> Backend Scrapes & Pushes to JDownloader -> Show Success.
