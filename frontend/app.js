const API_URL = "https://acarson-ddl-orchestrator.fly.dev/api";

const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");
const authForm = document.getElementById("auth-form");
const apiKeyInput = document.getElementById("api-key");
const authStatus = document.getElementById("auth-status");
const logoutBtn = document.getElementById("logout-btn");
const unlockBtn = document.getElementById("unlock-btn");
const unlockText = document.getElementById("unlock-text");
const unlockSpinner = document.getElementById("unlock-spinner");

// Navigation
const navSearch = document.getElementById("nav-search");
const navTasks = document.getElementById("nav-tasks");
const viewSearch = document.getElementById("view-search");
const viewTasks = document.getElementById("view-tasks");

// Search View
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const resultsGrid = document.getElementById("results-grid");
const loading = document.getElementById("loading");

// Tasks View
const tasksGrid = document.getElementById("tasks-grid");
const tasksLoading = document.getElementById("tasks-loading");

// Modal
const requestModal = document.getElementById("request-modal");
const cancelModal = document.getElementById("cancel-modal");
const submitRequest = document.getElementById("submit-request");
const submitText = document.getElementById("submit-text");
const submitSpinner = document.getElementById("submit-spinner");
const testExtractionBtn = document.getElementById("test-extraction");
const testText = document.getElementById("test-text");
const testSpinner = document.getElementById("test-spinner");
const providerUrlInput = document.getElementById("provider-url");
const providerSelect = document.getElementById("provider-select");
const modalAnimeName = document.getElementById("modal-anime-name");
const modalStatus = document.getElementById("modal-status");

let token = localStorage.getItem("orchestrator_token");
let selectedAnime = null;
let providersLoaded = false;
let tasksPollingInterval = null;

// Image Cache: LocalStorage acts as our DB to avoid spamming Jikan
const imageCache = JSON.parse(localStorage.getItem("anime_images") || "{}");

if (token) {
    verifyAndLoadApp();
}

async function verifyAndLoadApp() {
    // Show a clean loading state on the auth screen while verifying
    setBtnState(unlockBtn, unlockText, unlockSpinner, true, "Verifying session...");
    apiKeyInput.disabled = true;
    
    try {
        await loadProviders();
        showApp();
    } catch (e) {
        forceLogout();
    } finally {
        setBtnState(unlockBtn, unlockText, unlockSpinner, false, "Unlock");
        apiKeyInput.disabled = false;
    }
}

authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = apiKeyInput.value.trim();
    if (!key) return;

    token = key;
    setBtnState(unlockBtn, unlockText, unlockSpinner, true, "Waking server...");
    authStatus.classList.add("hidden");

    try {
        await loadProviders();
        localStorage.setItem("orchestrator_token", token);
        showApp();
    } catch (e) {
        token = null;
        showAuthStatus(e.message === "Unauthorized" ? "Invalid access key." : `Error: ${e.message}`, "error");
    } finally {
        setBtnState(unlockBtn, unlockText, unlockSpinner, false, "Unlock");
    }
});

logoutBtn.addEventListener("click", forceLogout);

function forceLogout() {
    token = null;
    stopPollingTasks();
    localStorage.removeItem("orchestrator_token");
    authScreen.classList.remove("hidden");
    authScreen.classList.add("active");
    appScreen.classList.add("hidden");
    appScreen.classList.remove("active");
    apiKeyInput.value = "";
}

function showApp() {
    authScreen.classList.add("hidden");
    authScreen.classList.remove("active");
    appScreen.classList.remove("hidden");
    appScreen.classList.add("active");
    authStatus.classList.add("hidden");
}

function showAuthStatus(msg, type) {
    authStatus.textContent = msg;
    authStatus.className = `status-text ${type === "error" ? "error-text" : "success-text"}`;
    authStatus.classList.remove("hidden");
}

function setBtnState(btn, textEl, spinnerEl, isLoading, text) {
    btn.disabled = isLoading;
    textEl.textContent = text;
    if (isLoading) {
        spinnerEl.classList.remove("hidden");
    } else {
        spinnerEl.classList.add("hidden");
    }
}

async function apiFetch(endpoint, options = {}) {
    const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            ...(options.headers || {})
        }
    });

    if (res.status === 401) {
        forceLogout();
        throw new Error("Unauthorized");
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Request failed");
    }

    return res.json();
}

async function loadProviders() {
    const code = localStorage.getItem("SECRET_PROVIDER_CODE");
    const url = code ? `/providers?code=${encodeURIComponent(code)}` : `/providers`;
    const providers = await apiFetch(url);
    providerSelect.innerHTML = "";
    
    let hasHealthy = false;
    providers.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.name} ${p.healthy ? '(Active)' : '(Down)'}`;
        if (!p.healthy) opt.disabled = true;
        else hasHealthy = true;
        providerSelect.appendChild(opt);
    });

    submitRequest.disabled = !hasHealthy;
    providersLoaded = true;
}

const refreshProvidersBtn = document.getElementById("refresh-providers-btn");
if (refreshProvidersBtn) {
    refreshProvidersBtn.addEventListener("click", async () => {
        refreshProvidersBtn.style.opacity = "0.5";
        refreshProvidersBtn.style.pointerEvents = "none";
        
        // Add a simple rotation animation to the inner SVG
        const svg = refreshProvidersBtn.querySelector("svg");
        if (svg) svg.style.animation = "spin 1s linear infinite";
        
        try {
            await loadProviders();
        } catch (e) {
            console.error("Failed to refresh providers:", e);
        } finally {
            refreshProvidersBtn.style.opacity = "1";
            refreshProvidersBtn.style.pointerEvents = "auto";
            if (svg) svg.style.animation = "";
        }
    });
}

// ------------------------------------
// Tab Navigation
// ------------------------------------
const navCustomLink = document.getElementById("nav-custom-link");
const viewCustomLink = document.getElementById("view-custom-link");

navSearch.addEventListener("click", () => {
    navSearch.classList.add("active");
    navTasks.classList.remove("active");
    if(navCustomLink) navCustomLink.classList.remove("active");
    viewSearch.classList.add("active");
    viewSearch.classList.remove("hidden");
    viewTasks.classList.remove("active");
    viewTasks.classList.add("hidden");
    if(viewCustomLink) { viewCustomLink.classList.remove("active"); viewCustomLink.classList.add("hidden"); }
    stopPollingTasks();
});

if(navCustomLink) {
    navCustomLink.addEventListener("click", () => {
        navCustomLink.classList.add("active");
        navSearch.classList.remove("active");
        navTasks.classList.remove("active");
        viewCustomLink.classList.add("active");
        viewCustomLink.classList.remove("hidden");
        viewSearch.classList.remove("active");
        viewSearch.classList.add("hidden");
        viewTasks.classList.remove("active");
        viewTasks.classList.add("hidden");
        stopPollingTasks();
    });
}

navTasks.addEventListener("click", () => {
    navTasks.classList.add("active");
    navSearch.classList.remove("active");
    if(navCustomLink) navCustomLink.classList.remove("active");
    viewTasks.classList.add("active");
    viewTasks.classList.remove("hidden");
    viewSearch.classList.remove("active");
    viewSearch.classList.add("hidden");
    if(viewCustomLink) { viewCustomLink.classList.remove("active"); viewCustomLink.classList.add("hidden"); }
    startPollingTasks();
});

// ------------------------------------
// Search View
// ------------------------------------
searchBtn.addEventListener("click", async () => {
    const q = searchInput.value.trim();
    if (!q) return;

    resultsGrid.innerHTML = "";
    loading.classList.remove("hidden");

    try {
        const code = localStorage.getItem("SECRET_PROVIDER_CODE");
        const url = code ? `/search?q=${encodeURIComponent(q)}&code=${encodeURIComponent(code)}` : `/search?q=${encodeURIComponent(q)}`;
        const data = await apiFetch(url);
        renderResults(data.data || []);
    } catch (e) {
        if (e.message !== "Unauthorized") {
            resultsGrid.innerHTML = `<p class="error-text" style="text-align: center; width: 100%;">Failed to fetch results: ${e.message}</p>`;
        }
    } finally {
        loading.classList.add("hidden");
    }
});

function renderResults(animeList) {
    if (animeList.length === 0) {
        resultsGrid.innerHTML = `<p style="color:var(--text-muted); text-align: center; width: 100%;">No results found.</p>`;
        return;
    }

    animeList.forEach(anime => {
        const card = document.createElement("div");
        card.className = "anime-card";
        
        const img = anime.images.jpg.image_url;
        const title = anime.title;
        const year = anime.year || "N/A";

        // Cache image immediately for tasks view later
        imageCache[title] = img;
        localStorage.setItem("anime_images", JSON.stringify(imageCache));

        card.innerHTML = `
            <img src="${img}" alt="${title}">
            <div class="anime-info">
                <div class="anime-title" title="${title}">${title}</div>
                <div class="anime-year">${year}</div>
            </div>
        `;

        card.addEventListener("click", () => openModal(title));
        resultsGrid.appendChild(card);
    });
}

function openModal(title) {
    selectedAnime = title;
    modalAnimeName.textContent = title;
    modalStatus.className = "status-text hidden";
    
    // Reset steps
    document.getElementById("modal-step-1").classList.remove("hidden");
    document.getElementById("modal-step-2").classList.add("hidden");
    document.getElementById("modal-step-3").classList.add("hidden");
    
    // Reset inputs & states
    document.getElementById("find-matches-btn").disabled = false;
    document.getElementById("matches-list").innerHTML = "";
    document.getElementById("dry-run-results").classList.add("hidden");
    submitRequest.disabled = false;
    testExtractionBtn.disabled = false;
    
    requestModal.classList.remove("hidden");
}

cancelModal.addEventListener("click", () => {
    requestModal.classList.add("hidden");
});

document.getElementById("back-to-step-1").addEventListener("click", () => {
    document.getElementById("modal-step-2").classList.add("hidden");
    document.getElementById("modal-step-1").classList.remove("hidden");
});

document.getElementById("back-to-step-2").addEventListener("click", () => {
    document.getElementById("modal-step-3").classList.add("hidden");
    document.getElementById("modal-step-2").classList.remove("hidden");
    document.getElementById("dry-run-results").classList.add("hidden");
});

// Step 1: Find Matches
const findMatchesBtn = document.getElementById("find-matches-btn");
const findText = document.getElementById("find-text");
const findSpinner = document.getElementById("find-spinner");

findMatchesBtn.addEventListener("click", async () => {
    const pid = providerSelect.value;
    const mediaType = document.getElementById("media-type-select").value;
    
    if (!pid) {
        showModalStatus("Please select a provider.", "error");
        return;
    }

    showModalStatus("", "");
    setBtnState(findMatchesBtn, findText, findSpinner, true, "Searching...");

    try {
        const res = await apiFetch("/search_provider", {
            method: "POST",
            body: JSON.stringify({
                provider_id: pid,
                query: selectedAnime,
                media_type: mediaType
            })
        });
        
        const matchesList = document.getElementById("matches-list");
        matchesList.innerHTML = "";
        
        if (!res.results || res.results.length === 0) {
            matchesList.innerHTML = `<div class="no-matches">No matches found on this provider.</div>`;
        } else {
            res.results.forEach(match => {
                const item = document.createElement("div");
                item.className = "match-item";
                
                const contentDiv = document.createElement("div");
                contentDiv.className = "match-item-content";
                
                const titleSpan = document.createElement("span");
                titleSpan.className = "match-title";
                titleSpan.textContent = match.title;
                
                const urlSpan = document.createElement("span");
                urlSpan.className = "match-url";
                urlSpan.textContent = match.url.replace(/^https?:\/\//, '');
                
                contentDiv.appendChild(titleSpan);
                contentDiv.appendChild(urlSpan);
                
                const link = document.createElement("a");
                link.className = "match-link";
                link.href = match.url;
                link.target = "_blank";
                link.innerHTML = "&#128279;";
                link.title = "Open in new tab to verify";
                
                // Prevent row click when clicking the link
                link.addEventListener("click", (e) => e.stopPropagation());
                
                item.appendChild(contentDiv);
                item.appendChild(link);
                
                // Select match
                item.addEventListener("click", () => {
                    selectedProviderUrl = match.url;
                    document.getElementById("selected-match-display").textContent = match.title;
                    document.getElementById("modal-step-2").classList.add("hidden");
                    document.getElementById("modal-step-3").classList.remove("hidden");
                    showModalStatus("", "");
                });
                
                matchesList.appendChild(item);
            });
        }
        
        document.getElementById("modal-step-1").classList.add("hidden");
        document.getElementById("modal-step-2").classList.remove("hidden");
        
    } catch (e) {
        showModalStatus(e.message, "error");
    } finally {
        setBtnState(findMatchesBtn, findText, findSpinner, false, "Find Matches");
    }
});

let selectedProviderUrl = "";
const dryRunResults = document.getElementById("dry-run-results");
const dryRunList = document.getElementById("dry-run-list");

testExtractionBtn.addEventListener("click", async () => {
    const pid = providerSelect.value;
    const mediaType = document.getElementById("media-type-select").value;
    
    showModalStatus("", "");
    setBtnState(testExtractionBtn, testText, testSpinner, true, "Testing...");
    submitRequest.disabled = true;

    try {
        const res = await apiFetch("/request", {
            method: "POST",
            body: JSON.stringify({
                provider_id: pid,
                anime_name: selectedAnime,
                anime_url: selectedProviderUrl,
                media_type: mediaType,
                dry_run: true
            })
        });
        
        dryRunList.innerHTML = "";
        if (res.links && res.links.length > 0) {
            res.links.forEach(link => {
                const li = document.createElement("li");
                try {
                    li.textContent = decodeURIComponent(link.split('/').pop() || link);
                } catch (e) {
                    li.textContent = link.split('/').pop() || link;
                }
                li.style.marginBottom = "4px";
                dryRunList.appendChild(li);
            });
            dryRunResults.classList.remove("hidden");
            showModalStatus(`Dry run complete: Found ${res.links.length} links.`, "success");
        } else {
            dryRunResults.classList.add("hidden");
            showModalStatus("Dry run complete: No valid links found.", "error");
        }
    } catch (e) {
        showModalStatus(e.message, "error");
        dryRunResults.classList.add("hidden");
    } finally {
        setBtnState(testExtractionBtn, testText, testSpinner, false, "Dry Run");
        submitRequest.disabled = false;
    }
});

submitRequest.addEventListener("click", async () => {
    const pid = providerSelect.value;
    const mediaType = document.getElementById("media-type-select").value;

    showModalStatus("", "");
    setBtnState(submitRequest, submitText, submitSpinner, true, "Scraping...");
    testExtractionBtn.disabled = true;

    try {
        const res = await apiFetch("/request", {
            method: "POST",
            body: JSON.stringify({
                provider_id: pid,
                anime_name: selectedAnime,
                anime_url: selectedProviderUrl,
                media_type: mediaType,
                dry_run: false
            })
        });
        showModalStatus(res.message || "Successfully sent to JDownloader!", "success");
        setTimeout(() => {
            requestModal.classList.add("hidden");
            navTasks.click();
        }, 2000);
    } catch (e) {
        showModalStatus(e.message, "error");
    } finally {
        setBtnState(submitRequest, submitText, submitSpinner, false, "Send to JDownloader");
        testExtractionBtn.disabled = false;
    }
});

function showModalStatus(msg, type) {
    if (!msg) {
        modalStatus.classList.add("hidden");
        return;
    }
    modalStatus.textContent = msg;
    modalStatus.className = `status-text ${type === "error" ? "error-text" : "success-text"}`;
    modalStatus.classList.remove("hidden");
}

// ------------------------------------
// Idle & Visibility Detection (Scale-to-zero optimization)
// ------------------------------------
let inactivityTimer;
let isIdle = false;
const INACTIVITY_LIMIT = 60000; // 1 minute

function resetInactivity() {
    isIdle = false;
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        isIdle = true;
        stopPollingTasks();
    }, INACTIVITY_LIMIT);

    // If we are on the tasks tab and it was paused, resume it
    if (navTasks.classList.contains("active") && document.visibilityState === "visible") {
        if (!tasksPollingInterval) {
            startPollingTasks();
        }
    }
}

// Track user activity
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => 
    window.addEventListener(evt, resetInactivity, { passive: true })
);

// Track tab visibility and window focus
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        isIdle = true;
        stopPollingTasks();
    } else {
        resetInactivity();
    }
});

window.addEventListener("blur", () => {
    isIdle = true;
    stopPollingTasks();
});

window.addEventListener("focus", () => {
    resetInactivity();
});

resetInactivity();

// ------------------------------------
// Tasks View
// ------------------------------------
function startPollingTasks() {
    if (isIdle || document.visibilityState === "hidden" || !document.hasFocus()) return;
    loadTasks();
    if (!tasksPollingInterval) {
        tasksPollingInterval = setInterval(loadTasks, 5000);
    }
}

function stopPollingTasks() {
    if (tasksPollingInterval) {
        clearInterval(tasksPollingInterval);
        tasksPollingInterval = null;
    }
}

async function loadTasks() {
    if (isIdle || document.visibilityState === "hidden" || !document.hasFocus()) {
        stopPollingTasks();
        return;
    }

    if (tasksGrid.innerHTML === "") tasksLoading.classList.remove("hidden");

    try {
        const data = await apiFetch("/downloads");
        renderTasks(data);
    } catch (e) {
        if (e.message !== "Unauthorized") {
            tasksGrid.innerHTML = `<p class="error-text">Failed to sync with JDownloader.</p>`;
        }
    } finally {
        tasksLoading.classList.add("hidden");
    }
}

async function renderTasks(data) {
    const grabberPackages = (data.linkgrabber || []).map(p => ({ ...p, isLinkgrabber: true }));
    const downloadPackages = (data.downloads || []).map(p => ({ ...p, isLinkgrabber: false }));
    const packages = [...grabberPackages, ...downloadPackages];
    
    if (packages.length === 0) {
        tasksGrid.innerHTML = `<p class="text-muted">No active or recent tasks found.</p>`;
        return;
    }

    tasksGrid.innerHTML = "";

    for (const pkg of packages) {
        const title = pkg.name;
        const total = pkg.bytesTotal || 0;
        const loaded = pkg.bytesLoaded || 0;
        const percent = total > 0 ? ((loaded / total) * 100).toFixed(1) : 0;
        
        let statusText = pkg.status;
        let statusClass = "status-downloading";
        
        if (pkg.finished) {
            statusText = statusText || "Finished";
            statusClass = "status-finished";
        } else if (pkg.isLinkgrabber) {
            statusText = statusText || "Pending Analysis";
            statusClass = "status-extracting";
        } else if (total === 0 || pkg.status === "Extracting") {
            statusText = statusText || "Starting...";
            statusClass = "status-extracting";
        } else {
            statusText = statusText || "Downloading";
        }

        const sizeMB = total > 0 ? (total / 1048576).toFixed(1) + " MB" : "Unknown Size";
        const childCount = pkg.childCount !== undefined ? pkg.childCount : "Various";

        // Fetch image logic if not in cache
        if (!imageCache[title]) {
            try {
                // Strip the [MOVIE] or [TV] tag so IMDB autocomplete doesn't break
                const cleanQuery = title.replace(/\[(MOVIE|TV|ANIME)\]\s*/ig, '');
                const sd = await apiFetch(`/search?q=${encodeURIComponent(cleanQuery)}`);
                if (sd.data && sd.data.length > 0) {
                    imageCache[title] = sd.data[0].images.jpg.image_url;
                    localStorage.setItem("anime_images", JSON.stringify(imageCache));
                } else {
                    imageCache[title] = "https://via.placeholder.com/60x80/222222/888888?text=N/A";
                }
            } catch (e) {
                imageCache[title] = "https://via.placeholder.com/60x80/222222/888888?text=N/A";
            }
        }
        const imgSrc = imageCache[title];

        const card = document.createElement("div");
        card.className = "task-card";
        card.innerHTML = `
            <img src="${imgSrc}" alt="${title}" class="task-img">
            <div class="task-details">
                <div class="task-title" title="${title}">${title}</div>
                <div class="task-meta">
                    ${childCount} file(s) • ${sizeMB}
                </div>
                <div class="task-status ${statusClass}">${statusText}</div>
                ${!pkg.finished && !pkg.isLinkgrabber && total > 0 ? `
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${percent}%"></div>
                    </div>
                ` : ""}
            </div>
        `;
        tasksGrid.appendChild(card);
    }
}

// ------------------------------------
// Custom Link Logic
// ------------------------------------
const customUrlInput = document.getElementById("custom-url");
const customNameInput = document.getElementById("custom-name");
const customTypeSelect = document.getElementById("custom-type");
const customLinkForm = document.getElementById("custom-link-form");
const customLinkStatus = document.getElementById("custom-link-status");
const customSubmitBtn = document.getElementById("custom-submit-btn");
const customSubmitText = document.getElementById("custom-submit-text");
const customSubmitSpinner = document.getElementById("custom-submit-spinner");

if (customUrlInput) {
    customUrlInput.addEventListener("input", () => {
        const urlStr = customUrlInput.value.trim();
        if (!urlStr) return;
        try {
            const url = new URL(urlStr);
            let path = url.pathname.replace(/\/$/, ''); // Remove trailing slash
            let slug = path.split('/').pop();
            
            // Remove file extensions
            slug = slug.replace(/\.(mp4|mkv|avi|mov|zip|rar)$/i, '');
            
            // Decode URI
            slug = decodeURIComponent(slug);
            
            // Replace hyphens, dots, underscores with spaces
            slug = slug.replace(/[-._]/g, ' ');
            
            // Capitalize words
            slug = slug.replace(/\b\w/g, char => char.toUpperCase());
            
            customNameInput.value = slug;

            // Intelligently derive type
            const lowerSlug = slug.toLowerCase();
            const isTv = /(s\d{1,2}e\d{1,2}|season|episode)/i.test(lowerSlug);
            const isAnime = /anime/i.test(lowerSlug) || url.hostname.includes("anime");
            
            if (isTv) customTypeSelect.value = "tv";
            else if (isAnime) customTypeSelect.value = "anime";
            else customTypeSelect.value = "movie";
            
        } catch (e) {
            // Invalid URL, do nothing
        }
    });
}

if (customLinkForm) {
    customLinkForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const url = customUrlInput.value.trim();
        let name = customNameInput.value.trim();
        const type = customTypeSelect.value;
        
        if (!url || !name) return;
        
        const prefix = type === "tv" ? "[TV] " : (type === "anime" ? "[ANIME] " : "[MOVIE] ");
        if (!name.startsWith("[")) {
            name = prefix + name;
        }

        setBtnState(customSubmitBtn, customSubmitText, customSubmitSpinner, true, "Sending...");
        customLinkStatus.classList.add("hidden");
        
        try {
            const payload = { url, name, media_type: type };
            const resp = await apiFetch("/custom_link", "POST", payload);
            customLinkStatus.textContent = "Successfully sent to JDownloader!";
            customLinkStatus.className = "status-text success";
            customUrlInput.value = "";
            customNameInput.value = "";
        } catch (err) {
            customLinkStatus.textContent = `Error: ${err.message}`;
            customLinkStatus.className = "status-text error";
        } finally {
            customLinkStatus.classList.remove("hidden");
            setBtnState(customSubmitBtn, customSubmitText, customSubmitSpinner, false, "Send to JDownloader");
        }
    });
}

// ------------------------------------
// Command Palette (Cmd+X)
// ------------------------------------
const commandPaletteOverlay = document.getElementById("command-palette-overlay");
const commandPaletteInput = document.getElementById("command-palette-input");
const commandPaletteStatus = document.getElementById("command-palette-status");
const commandPaletteModal = document.getElementById("command-palette-modal");

if (commandPaletteOverlay) {
    document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "x") {
            e.preventDefault();
            if (commandPaletteOverlay.classList.contains("hidden")) {
                commandPaletteOverlay.classList.remove("hidden");
                commandPaletteStatus.classList.add("hidden");
                commandPaletteInput.value = "";
                // small delay to allow display to toggle before focusing
                setTimeout(() => {
                    commandPaletteOverlay.style.opacity = "1";
                    commandPaletteOverlay.style.pointerEvents = "auto";
                    commandPaletteModal.style.transform = "translateY(0)";
                    commandPaletteInput.focus();
                }, 10);
            } else {
                closeCommandPalette();
            }
        }
        
        if (e.key === "Escape" && !commandPaletteOverlay.classList.contains("hidden")) {
            closeCommandPalette();
        }
    });

    // Close on click outside
    commandPaletteOverlay.addEventListener("click", (e) => {
        if (e.target === commandPaletteOverlay) {
            closeCommandPalette();
        }
    });

    commandPaletteInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const code = commandPaletteInput.value.trim();
            if (!code) return;
            
            commandPaletteInput.disabled = true;
            try {
                // Test the code
                const providers = await apiFetch(`/providers?code=${encodeURIComponent(code)}`);
                const fullx = providers.find(p => p.id === "fullxcinema");
                
                if (fullx || providers.length > 0) {
                    localStorage.setItem("SECRET_PROVIDER_CODE", code);
                    await loadProviders();
                    commandPaletteStatus.classList.remove("hidden");
                    commandPaletteStatus.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>Hidden providers activated.</span>`;
                    setTimeout(closeCommandPalette, 1500);
                } else {
                    commandPaletteStatus.classList.remove("hidden");
                    commandPaletteStatus.style.color = "var(--error-color)";
                    commandPaletteStatus.style.background = "rgba(255, 68, 68, 0.1)";
                    commandPaletteStatus.style.borderTop = "1px solid rgba(255, 68, 68, 0.2)";
                    commandPaletteStatus.innerHTML = `<span>Invalid code.</span>`;
                }
            } catch (err) {
                console.error(err);
            } finally {
                commandPaletteInput.disabled = false;
                commandPaletteInput.focus();
            }
        }
    });

    function closeCommandPalette() {
        commandPaletteOverlay.style.opacity = "0";
        commandPaletteOverlay.style.pointerEvents = "none";
        commandPaletteModal.style.transform = "translateY(-20px)";
        setTimeout(() => {
            commandPaletteOverlay.classList.add("hidden");
        }, 200);
    }
}
