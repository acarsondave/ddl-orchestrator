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
    try {
        await loadProviders();
        showApp();
    } catch (e) {
        forceLogout();
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
    const providers = await apiFetch("/providers");
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

// ------------------------------------
// Tab Navigation
// ------------------------------------
navSearch.addEventListener("click", () => {
    navSearch.classList.add("active");
    navTasks.classList.remove("active");
    viewSearch.classList.add("active");
    viewSearch.classList.remove("hidden");
    viewTasks.classList.remove("active");
    viewTasks.classList.add("hidden");
    stopPollingTasks();
});

navTasks.addEventListener("click", () => {
    navTasks.classList.add("active");
    navSearch.classList.remove("active");
    viewTasks.classList.add("active");
    viewTasks.classList.remove("hidden");
    viewSearch.classList.remove("active");
    viewSearch.classList.add("hidden");
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
        const data = await apiFetch(`/search?q=${encodeURIComponent(q)}`);
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
    providerUrlInput.value = "";
    modalStatus.className = "status-text hidden";
    requestModal.classList.remove("hidden");
}

cancelModal.addEventListener("click", () => {
    requestModal.classList.add("hidden");
});

submitRequest.addEventListener("click", async () => {
    const url = providerUrlInput.value.trim();
    const pid = providerSelect.value;
    
    if (!url || !url.startsWith("http")) {
        showModalStatus("Please enter a valid URL.", "error");
        return;
    }
    if (!pid) {
        showModalStatus("Please select a provider.", "error");
        return;
    }

    showModalStatus("", "");
    setBtnState(submitRequest, submitText, submitSpinner, true, "Scraping...");

    try {
        const res = await apiFetch("/request", {
            method: "POST",
            body: JSON.stringify({
                provider_id: pid,
                anime_name: selectedAnime,
                anime_url: url
            })
        });
        showModalStatus(res.message || "Successfully sent to JDownloader!", "success");
        setTimeout(() => {
            requestModal.classList.add("hidden");
            navTasks.click(); // Auto-switch to tasks
        }, 2000);
    } catch (e) {
        showModalStatus(e.message, "error");
    } finally {
        setBtnState(submitRequest, submitText, submitSpinner, false, "Send to JDownloader");
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
// Tasks View
// ------------------------------------
function startPollingTasks() {
    loadTasks();
    tasksPollingInterval = setInterval(loadTasks, 5000);
}

function stopPollingTasks() {
    if (tasksPollingInterval) {
        clearInterval(tasksPollingInterval);
        tasksPollingInterval = null;
    }
}

async function loadTasks() {
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

        // Fetch image logic
        if (!imageCache[title]) {
            try {
                const sd = await apiFetch(`/search?q=${encodeURIComponent(title)}`);
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
