const API_URL = "http://localhost:8080/api";

const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");
const authForm = document.getElementById("auth-form");
const apiKeyInput = document.getElementById("api-key");
const authError = document.getElementById("auth-error");
const logoutBtn = document.getElementById("logout-btn");

const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const resultsGrid = document.getElementById("results-grid");
const loading = document.getElementById("loading");

const requestModal = document.getElementById("request-modal");
const cancelModal = document.getElementById("cancel-modal");
const submitRequest = document.getElementById("submit-request");
const providerUrlInput = document.getElementById("provider-url");
const providerSelect = document.getElementById("provider-select");
const modalAnimeName = document.getElementById("modal-anime-name");
const modalStatus = document.getElementById("modal-status");

let token = localStorage.getItem("orchestrator_token");
let selectedAnime = null;
let providersLoaded = false;

if (token) {
    showApp();
}

authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const key = apiKeyInput.value.trim();
    if (key) {
        token = key;
        localStorage.setItem("orchestrator_token", token);
        showApp();
    }
});

logoutBtn.addEventListener("click", () => {
    token = null;
    localStorage.removeItem("orchestrator_token");
    authScreen.classList.remove("hidden");
    authScreen.classList.add("active");
    appScreen.classList.add("hidden");
    appScreen.classList.remove("active");
});

function showApp() {
    authScreen.classList.add("hidden");
    authScreen.classList.remove("active");
    appScreen.classList.remove("hidden");
    appScreen.classList.add("active");
    authError.classList.add("hidden");
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
        logoutBtn.click();
        authError.classList.remove("hidden");
        throw new Error("Unauthorized");
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Request failed");
    }

    return res.json();
}

async function loadProviders() {
    try {
        const providers = await apiFetch("/providers");
        providerSelect.innerHTML = "";
        
        let hasHealthy = false;
        providers.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = `${p.name} ${p.healthy ? '(🟢 Active)' : '(🔴 Down)'}`;
            if (!p.healthy) opt.disabled = true;
            else hasHealthy = true;
            providerSelect.appendChild(opt);
        });

        submitRequest.disabled = !hasHealthy;
        providersLoaded = true;
    } catch (e) {
        providerSelect.innerHTML = `<option value="">Failed to load providers</option>`;
        submitRequest.disabled = true;
    }
}

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
            resultsGrid.innerHTML = `<p class="error-text">Failed to fetch results: ${e.message}</p>`;
        }
    } finally {
        loading.classList.add("hidden");
    }
});

function renderResults(animeList) {
    if (animeList.length === 0) {
        resultsGrid.innerHTML = `<p style="color:var(--text-muted)">No results found.</p>`;
        return;
    }

    animeList.forEach(anime => {
        const card = document.createElement("div");
        card.className = "anime-card glass-card";
        
        const img = anime.images.jpg.image_url;
        const title = anime.title;
        const year = anime.year || "Unknown";

        card.innerHTML = `
            <img src="${img}" alt="${title}">
            <div class="anime-info">
                <div class="anime-title">${title}</div>
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
    
    if (!providersLoaded) {
        loadProviders();
    }
}

cancelModal.addEventListener("click", () => {
    requestModal.classList.add("hidden");
});

submitRequest.addEventListener("click", async () => {
    const url = providerUrlInput.value.trim();
    const pid = providerSelect.value;
    
    if (!url || !url.startsWith("http")) {
        showStatus("Please enter a valid URL.", "error");
        return;
    }
    if (!pid) {
        showStatus("Please select a provider.", "error");
        return;
    }

    showStatus("Sending to Orchestrator (Scraping)...", "");
    submitRequest.disabled = true;

    try {
        const res = await apiFetch("/request", {
            method: "POST",
            body: JSON.stringify({
                provider_id: pid,
                anime_name: selectedAnime,
                anime_url: url
            })
        });
        showStatus(res.message || "Successfully sent to JDownloader!", "success");
        setTimeout(() => requestModal.classList.add("hidden"), 3000);
    } catch (e) {
        showStatus(e.message, "error");
    } finally {
        submitRequest.disabled = false;
    }
});

function showStatus(msg, type) {
    modalStatus.textContent = msg;
    modalStatus.className = `status-text ${type === "error" ? "error-text" : type === "success" ? "success-text" : ""}`;
    modalStatus.classList.remove("hidden");
}
