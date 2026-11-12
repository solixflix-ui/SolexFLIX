
/* =========================================
   SOLEXFLIX - COMPLETE JAVASCRIPT
   Firebase + Cloudinary + Admin Dashboard
========================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =========================================
   1. FIREBASE CONFIGURATION
========================================= */

const firebaseConfig = {
  apiKey: "AIzaSyAgMHEBvkCJwmFKN1NMjeswON3njJozRLI",
  authDomain: "solexflix.firebaseapp.com",
  projectId: "solexflix",
  storageBucket: "solexflix.firebasestorage.app",
  messagingSenderId: "918605876011",
  appId: "1:918605876011:web:dddb6fb423f77d16e7536e"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app, "default");

const moviesRef = collection(db, "movies");


/* =========================================
   2. CLOUDINARY CONFIGURATION
========================================= */

const CLOUDINARY_CLOUD_NAME = "itlwx2ct";
const CLOUDINARY_UPLOAD_PRESET = "solexflix_posters";

const CLOUDINARY_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;


/* =========================================
   3. ADMIN CONFIGURATION
========================================= */

const ADMIN_EMAIL = "salikqamar25@gmail.com";

let currentUser = null;
let isAdmin = false;
let movies = [];
let editingMovieId = null;
let editingMovieOriginal = null;
let pendingTraktItem = null;
let linkOnlyEditMode = false;

function setLinkOnlyEditMode(enabled) {
  linkOnlyEditMode = !!enabled;
  ["movie-title", "movie-description", "movie-year", "movie-category", "movie-rating", "movie-poster-url", "movie-poster"].forEach(id => {
    const field = $(id);
    if (field) field.disabled = linkOnlyEditMode;
  });
}


/* =========================================
   4. HTML ELEMENTS
========================================= */

const $ = (id) => document.getElementById(id);

const websiteSection = $("website-section");
const loginSection = $("login-section");
const adminPanel = $("admin-panel");
const detailsSection = $("details-section");

const loginForm = $("login-form");
const loginEmail = $("login-email");
const loginPassword = $("login-password");
const loginMessage = $("login-message");

const movieForm = $("movie-form");
const movieMessage = $("movie-message");

const posterInput = $("movie-poster");
const posterPreview = $("poster-preview");

const searchInput = $("search-input");
const searchBox = $("search-box");

const movieGrid = $("movie-grid");
const trendingList = $("trending-list");
const recentList = $("recent-list");
const continueWatchingSection = $("continue-watching-section");
const continueWatchingList = $("continue-watching-list");
const watchHistorySection = $("watch-history-section");
const watchHistoryList = $("watch-history-list");
const clearWatchHistoryButton = $("clear-watch-history");
const categoryList = $("category-list");
const adminMovieList = $("admin-movie-list");
let activeScreenshots = [];
let activeScreenshotIndex = 0;


// Remove ChatGPT's optional tracking tag from the visible address bar while
// preserving the movie ID and any other legitimate query parameters.
(function removeChatGPTTrackingParameter() {
  try {
    const cleanUrl = new URL(window.location.href);
    if (cleanUrl.searchParams.get("utm_source") === "chatgpt.com") {
      cleanUrl.searchParams.delete("utm_source");
      window.history.replaceState(
        window.history.state,
        "",
        cleanUrl.pathname + cleanUrl.search + cleanUrl.hash
      );
    }
  } catch (error) {
    console.warn("Could not clean optional tracking parameter:", error);
  }
})();

/* =========================================
   5. HELPER FUNCTIONS
========================================= */

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showMessage(element, message, success = false) {
  if (!element) return;

  element.textContent = message;
  element.style.color = success ? "#35d07f" : "#ff5555";
}

function showSection(element) {
  if (element) element.hidden = false;
}

function hideSection(element) {
  if (element) element.hidden = true;
}

function getPoster(movie) {
  return movie.poster || movie.posterUrl || movie.videoPoster || movie.thumbnail || movie.backdrop || "";
}

function getMovieDate(movie) {
  const timestamp = movie.createdAt?.seconds || 0;
  return timestamp;
}


/* =========================================
   6. LOAD MOVIES FROM FIRESTORE
========================================= */

async function loadMovies() {
  try {
    const snapshot = await getDocs(moviesRef);

    movies = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    renderAll();

    // Open a movie directly when Google or a visitor lands on /?movie=ID.
    const requestedMovieId = new URLSearchParams(window.location.search).get("movie");
    if (requestedMovieId && movies.some((movie) => movie.id === requestedMovieId)) {
      openMovieDetails(requestedMovieId, false);
    }

  } catch (error) {
    console.error("Movie loading error:", error);

    if (movieGrid) {
      movieGrid.innerHTML =
        "<p>Movies load nahi ho paayi. Firebase settings check karein.</p>";
    }
  }
}


/* =========================================
   7. MOVIE CARD
========================================= */


function movieCard(movie) {
  const poster = getPoster(movie);

  return `
    <article class="movie-card" data-movie-id="${escapeHTML(movie.id)}">

      <div class="movie-poster">

        <img
          src="${escapeHTML(poster)}"
          alt="${escapeHTML(movie.title)}"
          loading="lazy"
        >

        <div class="card-overlay">
          <span class="card-watch">▶ View Details</span>
        </div>

        ${movie.rating ? `
          <span class="movie-rating">
            ★ ${escapeHTML(movie.rating)}
          </span>
        ` : ""}

      </div>

      <div class="movie-info">

        <h3>${escapeHTML(movie.title || "Untitled")}</h3>

        <p>
          ${escapeHTML(movie.year || "")}
          ${movie.category ? " • " + escapeHTML(movie.category) : ""}
        </p>

      </div>

    </article>
  `;
}



/* =========================================
   8. RENDER MOVIES
========================================= */

function renderAll() {
  renderTrending();
  renderRecent();
  renderContinueWatching();
  renderWatchHistory();
  if (continueWatchingSection) continueWatchingSection.hidden = true;
  if (watchHistorySection) watchHistorySection.hidden = true;
  if (categoryList?.closest(".movie-section")) categoryList.closest(".movie-section").hidden = true;
  activeMovieCategory = "all";
  activeMovieSearch = "";
  if (searchInput) searchInput.value = "";
  renderMovieGrid(movies);
  renderCategories();
  updateFeatured();

  if (isAdmin) {
    renderAdminMovies();
  }
}

function renderTrending() {
  if (!trendingList) return;

  const trending = traktVisibleItems.slice(0, 8);
  trendingList.innerHTML = trending.length ? trending.map((item, index) => traktMovieCard(item, index)).join("") : '<p class="trakt-status">Loading movies...</p>';
}

function renderRecent() {
  if (!recentList) return;

  const recent = traktVisibleItems.slice(0, 8);
  recentList.innerHTML = recent.length ? recent.map((item, index) => traktMovieCard(item, index)).join("") : '<p class="trakt-status">Loading movies...</p>';
}
/* CONTINUE WATCHING SYSTEM */

function renderContinueWatching() {
  if (!continueWatchingList || !continueWatchingSection) return;

  let watchedIds = [];

  try {
    watchedIds = JSON.parse(
      localStorage.getItem("solexflix_continue_watching") || "[]"
    );
  } catch (error) {
    watchedIds = [];
  }

  const watchedMovies = watchedIds
    .map((id) => movies.find((movie) => movie.id === id))
    .filter(Boolean);

  continueWatchingSection.hidden = watchedMovies.length === 0;

  continueWatchingList.innerHTML = watchedMovies
    .map(movieCard)
    .join("");
}
/* WATCH HISTORY SYSTEM */

function renderWatchHistory() {
  if (!watchHistoryList || !watchHistorySection) return;

  let watchedIds = [];

  try {
    watchedIds = JSON.parse(
      localStorage.getItem("solexflix_watch_history") || "[]"
    );
  } catch (error) {
    watchedIds = [];
  }

  const historyMovies = watchedIds
    .map((id) => movies.find((movie) => movie.id === id))
    .filter(Boolean);

  watchHistorySection.hidden = historyMovies.length === 0;

  watchHistoryList.innerHTML = historyMovies
    .map(movieCard)
    .join("");
}
const MOVIE_CATEGORIES = [
  "Bollywood", "Hollywood", "South Indian", "Hindi Dubbed",
  "Punjabi", "Bengali", "Tamil", "Telugu", "Malayalam",
  "Kannada", "Marathi", "Web Series", "Anime",
  "Korean Drama", "Animation", "Documentary"
];

const MOVIES_PER_PAGE = 6;
let currentMovieList = [...movies];
let currentMoviePage = 1;
let activeMovieCategory = "all";
let activeMovieSearch = "";

function renderMovieGrid(list = movies) {
  if (!movieGrid) return;
  currentMovieList = [...list];
  currentMoviePage = 1;
  renderCurrentMoviePage();
}

function renderCurrentMoviePage() {
  if (!movieGrid) return;
  const traktCards = (traktVisibleItems || []).map((item, index) => traktMovieCard(item, index)).join("");
  const knownTitles = new Set((traktVisibleItems || []).map(item =>
    String(item.title || "").trim().toLowerCase() + "|" + String(item.year || "")
  ));
  const localItems = (movies || []).filter(movie => {
    const key = String(movie.title || "").trim().toLowerCase() + "|" + String(movie.year || "");
    return !knownTitles.has(key);
  });
  const localCards = localItems.map(movieCard).join("");
  const cards = localCards + traktCards;
  if (cards) {
    movieGrid.innerHTML = cards;
  } else if (traktLoading) {
    movieGrid.innerHTML = '<div class="trakt-status" role="status">Loading movies and web series...</div>';
  } else {
    movieGrid.innerHTML = '<div class="no-results"><div class="no-results-icon">🎬</div><h3>No titles found</h3><p>Try again in a moment.</p></div>';
  }
  renderMoviePagination();
}
function renderMoviePagination() {
  const pagination = $("movie-pagination");
  if (!pagination) return;
  pagination.hidden = false;

  // Trakt does not provide a total page count, so show a useful numbered
  // window and keep Next available whenever the API confirms another page.
  const visiblePageCount = traktCurrentPage + (traktHasMore ? 1 : 0);
  const pages = [];
  for (let page = 1; page <= visiblePageCount; page++) pages.push(page);

  const pageButtons = pages.map(page =>
    `<button type="button" data-page="${page}" class="${page === traktCurrentPage ? "active" : ""}" ${traktLoading ? "disabled" : ""} aria-current="${page === traktCurrentPage ? "page" : "false"}">${page}</button>`
  ).join("");

  pagination.innerHTML =
    `<button type="button" data-page="${Math.max(1, traktCurrentPage - 1)}" ${traktCurrentPage <= 1 || traktLoading ? "disabled" : ""} aria-label="Previous page">‹</button>` +
    pageButtons +
    (traktHasMore ? '<span class="pagination-dots" aria-hidden="true">…</span>' : "") +
    `<button type="button" data-page="${traktCurrentPage + 1}" ${!traktHasMore || traktLoading ? "disabled" : ""} aria-label="Next page">Next ›</button>`;
}

function applyMovieFilters() {
  const query = activeMovieSearch;
  const category = activeMovieCategory.toLowerCase();

  const filtered = movies.filter(movie => {
    const movieCategory = String(movie.category || movie.genre || "").trim().toLocaleLowerCase();
    const matchesCategory = category === "all" || movieCategory === category;

    // Search across common movie fields so titles, years, genres and descriptions
    // remain discoverable even when older records use alternate field names.
    const searchable = [
      movie.title, movie.movieTitle, movie.movieName, movie.name,
      movie.category, movie.genre, movie.description, movie.year,
      movie.language, movie.cast, movie.director, movie.tags
    ].flat(Infinity).filter(value => value !== null && value !== undefined)
      .join(" ").normalize("NFKD").toLocaleLowerCase();
    const normalizedQuery = query.normalize("NFKD").trim();
    return matchesCategory && searchable.includes(normalizedQuery);
  });

  renderMovieGrid(filtered);
}

function renderCategories() {
  if (!categoryList) return;

  const legacyCategories = [...new Set(movies
    .map(movie => String(movie.category || "").trim())
    .filter(category => category && !MOVIE_CATEGORIES.some(item => item.toLowerCase() === category.toLowerCase()))
  )];
  const categoriesToShow = [...MOVIE_CATEGORIES, ...legacyCategories];

  categoryList.innerHTML = `
    <button class="category-btn ${activeMovieCategory === "all" ? "active" : ""}" data-category="all" type="button">All</button>
    ${categoriesToShow.map(category => `
      <button class="category-btn ${activeMovieCategory.toLowerCase() === category.toLowerCase() ? "active" : ""}"
        data-category="${escapeHTML(category)}" type="button">${escapeHTML(category)}</button>
    `).join("")}
  `;
}

function updateFeatured() {
  const item = traktVisibleItems[0];
  if ($("featured-title")) $("featured-title").textContent = item?.title || "Explore Movies & Web Series";
  if ($("featured-description")) $("featured-description").textContent = item?.overview || "Discover movies and web series on SolexFLIX.";
  ["featured-watch", "featured-details"].forEach(id => {
    const button = $(id);
    if (button) {
      if (item) button.dataset.traktIndex = "0";
      else delete button.dataset.traktIndex;
      delete button.dataset.movieId;
    }
  });
}


function setSearchSectionsHidden(hidden) {
  // While searching, show only the matching results in Explore Movies.
  // Hide homepage content that could otherwise look like an unrelated result.
  const sectionsToToggle = [
    $("home"),
    trendingList?.closest(".movie-section"),
    recentList?.closest(".movie-section"),
    categoryList?.closest(".movie-section"),
    continueWatchingSection,
    watchHistorySection
  ];

  sectionsToToggle.forEach((section) => {
    if (section) section.hidden = hidden;
  });
}
/* SOLEXFLIX SEARCH SYSTEM */

let unifiedSearchTimer = null;
function runUnifiedSearch(rawQuery) {
  const query = String(rawQuery || "").trim();
  activeMovieSearch = query.toLowerCase();
  applyMovieFilters();
  setSearchSectionsHidden(query.length > 0);
  if (unifiedSearchTimer) clearTimeout(unifiedSearchTimer);
  if (query.length >= 2) {
    unifiedSearchTimer = setTimeout(() => loadTraktDiscovery(query), 350);
  } else {
    traktRequestSequence++;
    traktVisibleItems = [];
    renderCurrentMoviePage();
  }
}

if (searchInput) {
  searchInput.addEventListener("input", (event) => runUnifiedSearch(event.target.value));
}

const searchToggle = $("search-toggle");

if (searchToggle) {
  searchToggle.addEventListener("click", () => {
    if (!searchBox) return;

    searchBox.hidden = !searchBox.hidden;

    if (searchBox.hidden) {
      if (searchInput) searchInput.value = "";
      activeMovieSearch = "";
      applyMovieFilters();
      setSearchSectionsHidden(false);
    } else {
      searchInput?.focus();
    }
  });
}



/* =========================================
   10. CATEGORY FILTER
========================================= */

if (categoryList) {
  categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;

    activeMovieCategory = button.dataset.category || "all";
    categoryList.querySelectorAll("button").forEach(item => {
      item.classList.toggle("active", item === button);
    });
    applyMovieFilters();
  });
}

const moviePagination = $("movie-pagination");
if (moviePagination) {
  moviePagination.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (!button || button.disabled) return;
    const targetPage = Number(button.dataset.page);
    if (Number.isInteger(targetPage) && targetPage >= 1 && targetPage !== traktCurrentPage) {
      if (targetPage < traktCurrentPage || (targetPage === traktCurrentPage + 1 && traktHasMore)) {
        loadTraktDiscovery(traktCurrentQuery, targetPage);
      }
    }
    movieGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}


/* =========================================
   11. YOUTUBE TRAILER URL
========================================= */

function getYouTubeEmbedUrl(url) {
  if (!url) return "";

  try {
    const videoUrl = new URL(url);
    let videoId = "";

    if (videoUrl.hostname.includes("youtu.be")) {
      videoId = videoUrl.pathname.slice(1);
    } else {
      videoId = videoUrl.searchParams.get("v") || "";

      if (!videoId) {
        const match = videoUrl.pathname.match(
          /\/(embed|shorts|live)\/([^/?]+)/
        );

        if (match) videoId = match[2];
      }
    }

    if (!videoId) return "";

    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;

  } catch {
    return "";
  }
}


function getMovieVideoConfig(value) {
  const raw = String(value || "").trim();
  if (!isSafeHttpUrl(raw)) return null;
  try {
    const url = new URL(raw);
    if (/\.(mp4|webm|ogg|m4v)(?:$|[?#])/i.test(url.pathname + url.search)) {
      return { type: "file", src: raw };
    }
    if (url.hostname === "youtu.be" || /(^|\.)youtube\.com$/i.test(url.hostname)) {
      const embed = getYouTubeEmbedUrl(raw);
      return embed ? { type: "embed", src: embed } : null;
    }
    if (/(^|\.)vimeo\.com$/i.test(url.hostname)) {
      const match = url.pathname.match(/\/(?:video\/)?(\d+)/);
      return match ? { type: "embed", src: "https://player.vimeo.com/video/" + match[1] } : null;
    }
    return null;
  } catch { return null; }
}

function renderMovieVideo(value) {
  const container = $("movie-video-container");
  const player = $("movie-video-player");
  const embed = $("movie-video-embed");
  if (!container || !player || !embed) return;
  player.pause();
  player.removeAttribute("src");
  player.load();
  embed.src = "";
  embed.hidden = true;
  player.hidden = true;
  const config = getMovieVideoConfig(value);
  container.hidden = !config;
  if (!config) return;
  if (config.type === "file") {
    player.src = config.src;
    player.hidden = false;
  } else {
    embed.src = config.src;
    embed.hidden = false;
  }
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function addToLocalMovieList(key, id, limit) {
  let ids = [];
  try { ids = JSON.parse(localStorage.getItem(key) || "[]"); } catch { ids = []; }
  ids = ids.filter((item) => item !== id);
  ids.unshift(id);
  localStorage.setItem(key, JSON.stringify(ids.slice(0, limit)));
}

/* =========================================
   12. MOVIE DETAILS
========================================= */
let currentMovieId = null;
let watchMoreTimer = null;
function loadMonetagWatchMoreAd() {
  const slot = $("monetag-ad-slot");
  if (!slot || slot.dataset.loaded === "true") return;
  slot.dataset.loaded = "true";

  const monetagScript = document.createElement("script");
  monetagScript.src = "https://quge5.com/88/tag.min.js";
  monetagScript.dataset.zone = "308513";
  monetagScript.async = true;
  monetagScript.setAttribute("data-cfasync", "false");
  monetagScript.onerror = () => {
    console.error("Monetag Watch More ad script failed to load.");
    slot.dataset.loaded = "false";
  };
  slot.appendChild(monetagScript);
}

function loadMovieDetailsAd() {
  const slot = $("movie-details-ad");
  if (!slot || slot.dataset.loaded === "true") return;
  slot.dataset.loaded = "true";

  const optionsScript = document.createElement("script");
  optionsScript.textContent = `atOptions = {
    'key' : 'd9afb589b40b16f7d4885622f35b13df',
    'format' : 'iframe',
    'height' : 50,
    'width' : 320,
    'params' : {}
  };`;
  slot.appendChild(optionsScript);

  const adScript = document.createElement("script");
  adScript.src = "https://bancadeltempoidea.org/22/d9afb589b40b16f7d4885622f35b13df";
  adScript.async = true;
  slot.appendChild(adScript);
}

function openMovieDetails(id, addHistoryEntry = true) {
  const movie = movies.find((item) => item.id === id);

  if (!movie) return;
currentMovieId = id;

  // Keep movie details in browser history so Android/browser Back works.
  if (addHistoryEntry) {
    const currentState = window.history.state || {};
    if (!(currentState.solexflixDetails && currentState.movieId === id)) {
      window.history.pushState(
        { ...currentState, solexflixDetails: true, movieId: id },
        "",
        (() => {
          const detailUrl = new URL(window.location.href);
          detailUrl.searchParams.set("movie", id);
          return detailUrl.pathname + detailUrl.search + detailUrl.hash;
        })()
      );
    }
  }

  hideSection(websiteSection);
  hideSection(adminPanel);
  hideSection(loginSection);
  showSection(detailsSection);
  loadMovieDetailsAd();

  if ($("details-poster")) {
    $("details-poster").src = getPoster(movie);
  }

  if ($("details-title")) {
    $("details-title").textContent = movie.title || "";
  }

  if ($("details-year")) {
    $("details-year").textContent = movie.year || "";
  }

  if ($("details-category")) {
    $("details-category").textContent = movie.category || "";
  }

  if ($("details-rating")) {
    $("details-rating").textContent = movie.rating || "";
  }

  if ($("details-description")) {
    $("details-description").textContent =
      movie.description || "";
  }

  renderMovieVideo(movie.videoUrl || movie.video || movie.movieUrl || movie.streamUrl || "");

  const trailer = getYouTubeEmbedUrl(movie.trailerUrl || "");

  if ($("movie-trailer")) {
    $("movie-trailer").src = trailer;
  }

  if ($("trailer-container")) {
    $("trailer-container").hidden = !trailer;
  }

  // Track opened titles for Continue Watching and Watch History.
  addToLocalMovieList("solexflix_continue_watching", id, 10);
  addToLocalMovieList("solexflix_watch_history", id, 50);
  renderContinueWatching();
  renderWatchHistory();

  // Keep the ad area below movie details; reveal links silently after 20 seconds.
  if (watchMoreTimer) {
    clearTimeout(watchMoreTimer);
    watchMoreTimer = null;
  }
  const watchMoreArea = $("watch-more-area");
  const downloadArea = $("download-area");
  const downloadButtons = $("download-buttons");
  const downloadOptions = [
    ["480p", movie.download480Url],
    ["720p", movie.download720Url],
    ["1080p", movie.download1080Url]
  ].filter(([, url]) => isSafeHttpUrl(url));

  if (downloadButtons && downloadArea && watchMoreArea) {
    downloadButtons.innerHTML = downloadOptions.map(([quality, url]) =>
      `<a class="primary-btn download-quality-btn" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${quality} Download</a>`
    ).join("");
    downloadArea.hidden = true;
    watchMoreArea.hidden = downloadOptions.length === 0;

    if (downloadOptions.length > 0) {
      loadMonetagWatchMoreAd();
      watchMoreTimer = setTimeout(() => {
        watchMoreTimer = null;
        if (currentMovieId !== id || !detailsSection || detailsSection.hidden) return;
        downloadArea.hidden = false;
      }, 20000);
    }
  }

  // Screenshots gallery.
  activeScreenshots = Array.isArray(movie.screenshots)
    ? movie.screenshots.filter(isSafeHttpUrl)
    : [];
  const screenshotsSection = $("screenshots-section");
  const screenshotsGrid = $("movie-screenshots");
  if (screenshotsSection && screenshotsGrid) {
    screenshotsSection.hidden = activeScreenshots.length === 0;
    screenshotsGrid.innerHTML = activeScreenshots.map((url, index) =>
      `<button class="screenshot-thumb" type="button" data-screenshot-index="${index}" aria-label="View screenshot ${index + 1}"><img src="${escapeHTML(url)}" alt="${escapeHTML(movie.title || "Movie")} screenshot ${index + 1}" loading="lazy"></button>`
    ).join("");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function hideMovieDetailsView() {
  if (watchMoreTimer) {
    clearTimeout(watchMoreTimer);
    watchMoreTimer = null;
  }
  if ($("movie-trailer")) {
    $("movie-trailer").src = "";
  }
  if (typeof solexPlayer !== "undefined" && solexPlayer) {
    solexPlayer.src = "";
  }
  if (typeof playerContainer !== "undefined" && playerContainer) {
    playerContainer.hidden = true;
  }
  hideSection(detailsSection);
  showSection(websiteSection);
  currentMovieId = null;

  // Remove a direct movie query after closing its detail view.
  const cleanUrl = new URL(window.location.href);
  if (cleanUrl.searchParams.has("movie")) {
    cleanUrl.searchParams.delete("movie");
    window.history.replaceState(window.history.state, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  }
}

function closeMovieDetails() {
  // Close the details screen immediately; do not rely on asynchronous popstate.
  // Preserve the current catalogue route while clearing the details-only state.
  const currentState = { ...(window.history.state || {}) };
  delete currentState.solexflixDetails;
  delete currentState.traktDetails;
  delete currentState.movieId;

  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("movie");
  window.history.replaceState(
    currentState,
    "",
    cleanUrl.pathname + cleanUrl.search + cleanUrl.hash
  );

  hideMovieDetailsView();
}

window.addEventListener("popstate", (event) => {
  if (event.state && event.state.solexflixDetails && event.state.movieId) {
    openMovieDetails(event.state.movieId, false);
  } else if (detailsSection && !detailsSection.hidden) {
    hideMovieDetailsView();
  }
});

if ($("close-details")) {
  $("close-details").addEventListener("click", closeMovieDetails);
}
/* CLEAR WATCH HISTORY */

if (clearWatchHistoryButton) {
  clearWatchHistoryButton.addEventListener("click", () => {
    const confirmed = confirm("Are you sure you want to clear Watch History?");

    if (!confirmed) return;

    localStorage.removeItem("solexflix_watch_history");

    renderWatchHistory();
  });
}
/* SCREENSHOT FULLSCREEN VIEWER */
function openScreenshotViewer(index) {
  if (!activeScreenshots.length) return;
  activeScreenshotIndex = (index + activeScreenshots.length) % activeScreenshots.length;
  const viewer = $("screenshot-viewer");
  const image = $("fullscreen-screenshot");
  if (!viewer || !image) return;
  image.src = activeScreenshots[activeScreenshotIndex];
  viewer.hidden = false;
  document.body.classList.add("viewer-open");
}

function closeScreenshotViewer() {
  const viewer = $("screenshot-viewer");
  const image = $("fullscreen-screenshot");
  if (viewer) viewer.hidden = true;
  if (image) image.src = "";
  document.body.classList.remove("viewer-open");
}

$("movie-screenshots")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-screenshot-index]");
  if (button) openScreenshotViewer(Number(button.dataset.screenshotIndex));
});
$("close-screenshot-viewer")?.addEventListener("click", closeScreenshotViewer);
$("previous-screenshot")?.addEventListener("click", () => openScreenshotViewer(activeScreenshotIndex - 1));
$("next-screenshot")?.addEventListener("click", () => openScreenshotViewer(activeScreenshotIndex + 1));
$("screenshot-viewer")?.addEventListener("click", (event) => {
  if (event.target.id === "screenshot-viewer") closeScreenshotViewer();
});
document.addEventListener("keydown", (event) => {
  if ($("screenshot-viewer")?.hidden) return;
  if (event.key === "Escape") closeScreenshotViewer();
  if (event.key === "ArrowLeft") openScreenshotViewer(activeScreenshotIndex - 1);
  if (event.key === "ArrowRight") openScreenshotViewer(activeScreenshotIndex + 1);
});

/* =========================================
   13. MOVIE CARD CLICK
========================================= */

document.addEventListener("click", (event) => {
  const movieElement = event.target.closest("[data-movie-id]");

  if (!movieElement) return;

  const id = movieElement.dataset.movieId;

  if (id && !movieElement.dataset.action) {
    openMovieDetails(id);
  }
});


/* =========================================
   14. ADMIN LOGIN OPEN
========================================= */

function openAdminLogin() {
  hideSection(websiteSection);
  hideSection(detailsSection);

  if (isAdmin) {
    showAdminDashboard();
    if (pendingTraktItem) prefillTraktItemInAdmin(pendingTraktItem);
  } else {
    showSection(loginSection);
    hideSection(adminPanel);
  }
}


/* ADMIN LOGIN BUTTON FIX */

document.addEventListener("click", (event) => {
  const button = event.target.closest(
    "#admin-login-btn, #open-admin, #admin-open, [data-open-admin]"
  );

  if (!button) return;

  event.preventDefault();

  openAdminLogin();
});


if ($("close-admin-login")) {
  $("close-admin-login").addEventListener("click", () => {
    hideSection(loginSection);
    showSection(websiteSection);
  });
}


/* =========================================
   15. ADMIN LOGIN
========================================= */

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = loginEmail.value.trim().toLowerCase();
    const password = loginPassword.value;

    if (email !== ADMIN_EMAIL) {
      showMessage(loginMessage, "Admin email incorrect!");
      return;
    }

    try {
      showMessage(loginMessage, "Logging in...", true);

      await signInWithEmailAndPassword(auth, email, password);

    } catch (error) {
      console.error("Login error:", error);

      showMessage(
        loginMessage,
        error.code === "auth/invalid-credential"
          ? "Email ya password galat hai."
          : error.message
      );
    }
  });
}


/* =========================================
   16. AUTH STATE
========================================= */

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  isAdmin = !!user &&
    user.email?.toLowerCase() === ADMIN_EMAIL;

  if (user && !isAdmin) {
    await signOut(auth);
    return;
  }

  if (isAdmin) {
    showAdminDashboard();
    if (pendingTraktItem) prefillTraktItemInAdmin(pendingTraktItem);
  } else {
    hideSection(adminPanel);
    hideSection(loginSection);
    hideSection(detailsSection);
    showSection(websiteSection);
  }
});

function showAdminDashboard() {
  hideSection(websiteSection);
  hideSection(loginSection);
  hideSection(detailsSection);
  showSection(adminPanel);

  renderAdminMovies();
}


/* =========================================
   17. CLOUDINARY POSTER UPLOAD
========================================= */

async function uploadPoster(file) {
  if (!file) return "";

  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Image must be smaller than 10 MB.");
  }

  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(CLOUDINARY_URL, {
    method: "POST",
    body: formData
  });

  const result = await response.json();

  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || "Poster upload failed.");
  }

  return result.secure_url;
}


/* =========================================
   18. POSTER PREVIEW
========================================= */

if (posterInput) {
  posterInput.addEventListener("change", () => {
    const file = posterInput.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showMessage(movieMessage, "Please select an image.");
      posterInput.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showMessage(movieMessage, "Image must be smaller than 10 MB.");
      posterInput.value = "";
      return;
    }

    if (posterPreview) {
      posterPreview.src = URL.createObjectURL(file);
      posterPreview.hidden = false;
    }
  });
}


/* =========================================
   19. ADD / EDIT MOVIE
========================================= */

if (movieForm) {
  movieForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isAdmin) {
      showMessage(movieMessage, "Admin login required.");
      return;
    }

    const title = $("movie-title")?.value.trim();
    const description = $("movie-description")?.value.trim();
    const year = $("movie-year")?.value;
    const category = $("movie-category")?.value;
    const rating = $("movie-rating")?.value;
    const videoUrl = $("movie-video-url")?.value.trim();
    const trailerUrl = $("movie-trailer-url")?.value.trim();
    const download480Url = $("movie-download-480")?.value.trim();
    const download720Url = $("movie-download-720")?.value.trim();
    const download1080Url = $("movie-download-1080")?.value.trim();
    const screenshots = String($("movie-screenshots-input")?.value || "")
      .split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    const posterFile = posterInput?.files[0];
    const posterUrlInput = String($("movie-poster-url")?.value || "").trim();

    if (!title || !description || !year || !category) {
      showMessage(movieMessage, "Please fill all required fields.");
      return;
    }

    const existingMovie = editingMovieId
      ? movies.find((movie) => movie.id === editingMovieId)
      : null;

    if (!posterFile && !existingMovie && !isSafeHttpUrl(posterUrlInput)) {
      showMessage(movieMessage, "Please upload a poster or enter a valid poster URL.");
      return;
    }

    const saveButton = $("save-movie-btn");

    try {
      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Please wait...";
      }

      let poster = existingMovie ? getPoster(existingMovie) : posterUrlInput;

      if (posterFile) {
        showMessage(movieMessage, "Uploading poster...", true);
        poster = await uploadPoster(posterFile);
      }

      const allExternalUrls = [videoUrl, trailerUrl, download480Url, download720Url, download1080Url, ...screenshots].filter(Boolean);
      if (allExternalUrls.some((url) => !isSafeHttpUrl(url))) {
        throw new Error("Please enter valid http:// or https:// links only.");
      }

      const movieData = {
        title,
        description,
        year: Number(year),
        category,
        rating: rating || "",
        videoUrl,
        trailerUrl,
        download480Url,
        download720Url,
        download1080Url,
        screenshots,
        poster
      };

      if (editingMovieId) {
        // Save only fields the admin actually changed. This prevents adding a
        // download/video link from overwriting Trakt metadata or other fields.
        const original = editingMovieOriginal || existingMovie || {};
        const changedFields = {};
        const fieldsToCompare = linkOnlyEditMode
          ? { videoUrl, trailerUrl, download480Url, download720Url, download1080Url, screenshots }
          : {
              title, description, year: Number(year), category, rating: rating || "",
              videoUrl, trailerUrl, download480Url, download720Url, download1080Url, screenshots
            };

        for (const [field, value] of Object.entries(fieldsToCompare)) {
          const previousValue = field === "videoUrl"
            ? (original.videoUrl || original.video || original.movieUrl || original.streamUrl || "")
            : original[field];
          const sameValue = Array.isArray(value)
            ? JSON.stringify(value) === JSON.stringify(previousValue || [])
            : String(value ?? "") === String(previousValue ?? "");
          if (!sameValue) changedFields[field] = value;
        }

        if (!linkOnlyEditMode) {
          const originalPoster = getPoster(original);
          if (posterFile || poster !== originalPoster) changedFields.poster = poster;
        }

        if (Object.keys(changedFields).length === 0) {
          showMessage(movieMessage, "Koi naya change nahi hai. Sirf badli hui field save hogi.", true);
          return;
        }

        await updateDoc(doc(db, "movies", editingMovieId), {
          ...changedFields,
          updatedAt: serverTimestamp()
        });

        showMessage(movieMessage, "Sirf edited fields update hui hain!", true);

      } else {
        await addDoc(moviesRef, {
          ...movieData,
          createdAt: serverTimestamp()
        });

        showMessage(movieMessage, "Movie added successfully!", true);
      }

      movieForm.reset();

      editingMovieId = null;
      editingMovieOriginal = null;
      pendingTraktItem = null;
      setLinkOnlyEditMode(false);

      if ($("form-heading")) {
        $("form-heading").textContent = "Add New Movie";
      }

      if (saveButton) {
        saveButton.textContent = "Add Movie";
      }

      if (posterPreview) {
        posterPreview.src = "";
        posterPreview.hidden = true;
      }

      if ($("cancel-edit-btn")) {
        $("cancel-edit-btn").hidden = true;
      }

      await loadMovies();
loadTraktDiscovery();

    } catch (error) {
      console.error("Save movie error:", error);

      showMessage(movieMessage, error.message || "Movie save failed.");

    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = editingMovieId
          ? "Update Movie"
          : "Add Movie";
      }
    }
  });
}


/* =========================================
   20. ADMIN MOVIE LIST
========================================= */

function renderAdminMovies() {
  if (!adminMovieList) return;

  if (!movies.length) {
    adminMovieList.innerHTML = "<p>No movies added yet.</p>";
    return;
  }

  adminMovieList.innerHTML = movies.map((movie) => `
    <div class="admin-movie-item">
      <img
        src="${escapeHTML(getPoster(movie))}"
        alt="${escapeHTML(movie.title)}"
      >

      <div class="admin-movie-info">
        <h3>${escapeHTML(movie.title || "")}</h3>
        <p>${escapeHTML(movie.year || "")}</p>
      </div>

      <button
        type="button"
        data-action="edit"
        data-id="${escapeHTML(movie.id)}"
      >
        Edit
      </button>

      <button
        type="button"
        data-action="delete"
        data-id="${escapeHTML(movie.id)}"
      >
        Delete
      </button>
    </div>
  `).join("");
}


/* =========================================
   21. EDIT MOVIE
========================================= */

function editMovie(id, options = {}) {
  if (!isAdmin) return;
  setLinkOnlyEditMode(!!options.linkOnly);

  const movie = movies.find((item) => item.id === id);

  if (!movie) return;

  editingMovieId = id;
  editingMovieOriginal = {
    ...movie,
    screenshots: Array.isArray(movie.screenshots) ? [...movie.screenshots] : movie.screenshots
  };

  $("movie-title").value = movie.title || "";
  $("movie-description").value = movie.description || "";
  $("movie-year").value = movie.year || "";
  $("movie-category").value = movie.category || "";
  $("movie-rating").value = movie.rating || "";
  $("movie-video-url").value = movie.videoUrl || movie.video || movie.movieUrl || movie.streamUrl || "";
  $("movie-trailer-url").value = movie.trailerUrl || "";
  $("movie-poster-url").value = getPoster(movie);
  $("movie-download-480").value = movie.download480Url || "";
  $("movie-download-720").value = movie.download720Url || "";
  $("movie-download-1080").value = movie.download1080Url || "";
  $("movie-screenshots-input").value = Array.isArray(movie.screenshots) ? movie.screenshots.join("\n") : "";

  if (posterPreview) {
    posterPreview.src = getPoster(movie);
    posterPreview.hidden = !getPoster(movie);
  }

  if ($("form-heading")) {
    $("form-heading").textContent = linkOnlyEditMode ? "Edit Movie Links Only" : "Edit Movie";
  }

  if ($("save-movie-btn")) {
    $("save-movie-btn").textContent = linkOnlyEditMode ? "Save Changed Links" : "Update Movie";
  }

  if ($("cancel-edit-btn")) {
    $("cancel-edit-btn").hidden = false;
  }

  movieForm.scrollIntoView({ behavior: "smooth" });
}


/* =========================================
   22. DELETE MOVIE
========================================= */

async function deleteMovie(id) {
  if (!isAdmin) return;

  const movie = movies.find((item) => item.id === id);

  if (!movie) return;

  const confirmed = confirm(
    `Are you sure you want to delete "${movie.title}"?`
  );

  if (!confirmed) return;

  try {

    await deleteDoc(doc(db, "movies", id));

    alert("Movie deleted successfully!");

    await loadMovies();

  } catch (error) {
    console.error("Delete error:", error);
    alert("Delete failed: " + error.message);
  }
}


/* =========================================
   23. ADMIN LIST BUTTONS
========================================= */

if (adminMovieList) {
  adminMovieList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "edit") {
      editMovie(id);
    }

    if (action === "delete") {
      deleteMovie(id);
    }
  });
}


/* =========================================
   24. CANCEL EDIT
========================================= */

if ($("cancel-edit-btn")) {
  $("cancel-edit-btn").addEventListener("click", () => {
    editingMovieId = null;
    editingMovieOriginal = null;
    pendingTraktItem = null;
    setLinkOnlyEditMode(false);
    movieForm.reset();

    $("form-heading").textContent = "Add New Movie";
    $("save-movie-btn").textContent = "Add Movie";
    $("cancel-edit-btn").hidden = true;

    if (posterPreview) {
      posterPreview.src = "";
      posterPreview.hidden = true;
    }

    showMessage(movieMessage, "");
  });
}


/* =========================================
   25. ADMIN LOGOUT
========================================= */

if ($("logout-btn")) {
  $("logout-btn").addEventListener("click", async () => {
    try {
      await signOut(auth);
      alert("Logged out successfully!");
    } catch (error) {
      alert(error.message);
    }
  });
}



/* =========================================
   TRAKT ON-DEMAND DISCOVERY
   Results are fetched for visitor searches and
   trending views; no bulk catalogue mirroring.
========================================= */
const traktResults = $("movie-grid");
const traktStatus = $("trakt-status");
const traktSearchForm = $("trakt-search-form");
const traktSearchInput = $("trakt-search-input");
let traktType = "movies";
let traktRequestSequence = 0;
let traktCurrentPage = 1, traktHasMore = false, traktCurrentQuery = "", traktLoading = true;

function traktSourceImageUrl(rawUrl) {
  if (!rawUrl) return "";
  const raw = String(rawUrl).trim();
  return raw.startsWith("//") ? "https:" + raw
    : (/^https?:\/\//i.test(raw) ? raw : "https://" + raw.replace(/^\/+/, ""));
}

function traktImageUrl(rawUrl) {
  const source = traktSourceImageUrl(rawUrl);
  return source ? "/api/trakt/image?url=" + encodeURIComponent(source) : "";
}

let traktVisibleItems = [];
let activeCatalogFeed = "trending";

function traktMovieCard(item, index) {
  const title = item.title || "Untitled";
  const localMatch = movies.find(movie =>
    String(movie.title || "").trim().toLowerCase() === String(title).trim().toLowerCase() &&
    (!item.year || !movie.year || String(movie.year) === String(item.year))
  );
  const directPoster = traktSourceImageUrl(item.poster);
  const proxyPoster = traktImageUrl(item.poster);
  const poster = directPoster || (localMatch ? getPoster(localMatch) : "");
  const year = item.year || "";
  const rating = Number(item.rating || 0);
  const kind = item.type === "show" ? "Web Series" : "Movie";
  return `
    <article class="movie-card trakt-card" data-trakt-index="${index}" role="button" tabindex="0" aria-label="View details for ${escapeHTML(title)}">
      <div class="movie-poster">
        ${poster ? `<img src="${escapeHTML(poster)}" data-proxy-src="${escapeHTML(proxyPoster)}" alt="${escapeHTML(title)}" loading="lazy" onerror="if(this.dataset.proxySrc && this.src!==this.dataset.proxySrc){this.src=this.dataset.proxySrc;this.dataset.proxySrc='';}else{this.closest('.movie-poster').classList.add('poster-unavailable');this.remove();}">` : '<div class="poster-unavailable"></div>'}
        <span class="trakt-kind">${kind}</span>
        ${rating ? `<span class="movie-rating">★ ${rating.toFixed(1)}</span>` : ""}
      </div>
      <div class="movie-info">
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(year)} · View Details</p>
      </div>
    </article>`;
}

function renderTraktResults(items, hasMore = false) {
  traktVisibleItems = Array.isArray(items) ? items : [];
  traktHasMore = !!hasMore;
  renderCurrentMoviePage();
  renderTraktHomeSections();
}
function renderTraktHomeSections() {
  const cards = traktVisibleItems.map((item, index) => traktMovieCard(item, index)).join("");
  if (trendingList) trendingList.innerHTML = cards || '<p class="trakt-status">Loading movies...</p>';
  if (recentList) recentList.innerHTML = cards || '<p class="trakt-status">Loading movies...</p>';
  const first = traktVisibleItems[0];
  if (first) {
    if ($("featured-title")) $("featured-title").textContent = first.title || "Explore movies";
    if ($("featured-description")) $("featured-description").textContent = first.overview || "Discover movies and web series on SolexFLIX.";
    ["featured-watch", "featured-details"].forEach(id => {
      const button = $(id);
      if (button) { button.dataset.traktIndex = "0"; delete button.dataset.movieId; }
    });
  }
}
function prefillTraktItemInAdmin(item) {
  if (!item || !isAdmin) return;
  pendingTraktItem = item;
  editingMovieId = null;
  editingMovieOriginal = null;
  movieForm.reset();
  $("movie-title").value = item.title || "";
  $("movie-description").value = item.overview || "Description to be added by admin.";
  $("movie-year").value = item.year || "";
  $("movie-category").value = item.type === "show" ? "Web Series" : "Other";
  $("movie-rating").value = item.rating || "";
  $("movie-poster-url").value = traktImageUrl(item.poster);
  $("movie-video-url").value = "";
  $("movie-trailer-url").value = "";
  $("movie-download-480").value = "";
  $("movie-download-720").value = "";
  $("movie-download-1080").value = "";
  $("movie-screenshots-input").value = "";
  if (posterPreview) {
    posterPreview.src = traktImageUrl(item.poster);
    posterPreview.hidden = !item.poster;
  }
  $("form-heading").textContent = "Add Title & Links";
  $("save-movie-btn").textContent = "Save Title & Links";
  $("cancel-edit-btn").hidden = false;
  movieForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openTraktDetails(item) {
  if (!item || !detailsSection) return;
  pendingTraktItem = item;
  currentMovieId = null;
  if (watchMoreTimer) { clearTimeout(watchMoreTimer); watchMoreTimer = null; }
  const localMatch = movies.find(movie =>
    String(movie.title || "").trim().toLowerCase() === String(item.title || "").trim().toLowerCase() &&
    (!item.year || !movie.year || String(movie.year) === String(item.year))
  );
  const poster = traktSourceImageUrl(item.poster) || (localMatch ? getPoster(localMatch) : "");
  const proxyPoster = traktImageUrl(item.poster);
  const detailPoster = $("details-poster");
  const adminAddButton = $("trakt-admin-add");
  const adminEditLinksButton = $("trakt-admin-edit-links");
  if (adminAddButton) adminAddButton.hidden = !!localMatch;
  if (adminEditLinksButton) adminEditLinksButton.hidden = !localMatch;
  if (detailPoster) {
    detailPoster.onerror = () => {
      if (proxyPoster && detailPoster.src !== proxyPoster) detailPoster.src = proxyPoster;
      else { detailPoster.removeAttribute("src"); detailPoster.alt = "Poster unavailable"; detailPoster.classList.add("poster-unavailable"); }
    };
    detailPoster.classList.remove("poster-unavailable");
    if (poster) detailPoster.src = poster;
    else { detailPoster.removeAttribute("src"); detailPoster.alt = "Poster unavailable"; detailPoster.classList.add("poster-unavailable"); }
    detailPoster.alt = (item.title || "Title") + " poster";
  }
  $("details-title").textContent = item.title || "";
  $("details-year").textContent = item.year || "";
  $("details-category").textContent = item.type === "show" ? "Web Series" : "Movie";
  $("details-rating").textContent = item.rating ? "★ " + Number(item.rating).toFixed(1) + " / 10" : "";
  $("details-description").textContent = item.overview || "Description is not available for this title yet.";
  renderMovieVideo(localMatch?.videoUrl || localMatch?.video || localMatch?.movieUrl || localMatch?.streamUrl || "");
  $("movie-trailer").src = "";
  $("trailer-container").hidden = true;
  $("screenshots-section").hidden = true;

  const watchMoreArea = $("watch-more-area");
  const downloadArea = $("download-area");
  const downloadButtons = $("download-buttons");
  const downloadOptions = localMatch ? [
    ["480p", localMatch.download480Url],
    ["720p", localMatch.download720Url],
    ["1080p", localMatch.download1080Url]
  ].filter(([, url]) => isSafeHttpUrl(url)) : [];

  downloadButtons.innerHTML = downloadOptions.map(([quality, url]) =>
    `<a class="primary-btn download-quality-btn" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${quality} Download</a>`
  ).join("");
  downloadArea.hidden = downloadOptions.length > 0;
  watchMoreArea.hidden = false;
  if (!downloadOptions.length) {
    downloadButtons.innerHTML = '<p class="trakt-no-links">No download links have been added for this title yet.</p>';
  }

  if (downloadOptions.length) {
    loadMonetagWatchMoreAd();
    watchMoreTimer = setTimeout(() => {
      watchMoreTimer = null;
      if (currentMovieId !== null || !detailsSection || detailsSection.hidden) return;
      downloadArea.hidden = false;
    }, 20000);
  }

  activeScreenshots = [];
  hideSection(websiteSection);
  hideSection(adminPanel);
  hideSection(loginSection);
  showSection(detailsSection);
  loadMovieDetailsAd();

  const currentState = window.history.state || {};
  window.history.pushState(
    { ...currentState, solexflixDetails: true, traktDetails: true },
    "",
    window.location.pathname + window.location.hash
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("trakt-admin-add")?.addEventListener("click", () => {
  if (!pendingTraktItem) return;
  const item = pendingTraktItem;
  hideSection(detailsSection);
  if (isAdmin) {
    showAdminDashboard();
    prefillTraktItemInAdmin(item);
  } else {
    openAdminLogin();
    pendingTraktItem = item;
  }
});

$("trakt-admin-edit-links")?.addEventListener("click", () => {
  if (!pendingTraktItem || !isAdmin) return;
  const item = pendingTraktItem;
  const match = movies.find(movie =>
    String(movie.title || "").trim().toLowerCase() === String(item.title || "").trim().toLowerCase() &&
    (!item.year || !movie.year || String(movie.year) === String(item.year))
  );
  if (!match) return;
  hideSection(detailsSection);
  showAdminDashboard();
  editMovie(match.id, { linkOnly: true });
});

if (traktResults) {
  document.addEventListener("click", (event) => {
    const card = event.target.closest("[data-trakt-index]");
    if (!card) return;
    const index = Number(card.dataset.traktIndex);
    if (Number.isInteger(index) && traktVisibleItems[index]) openTraktDetails(traktVisibleItems[index]);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-trakt-index]");
    if (!card) return;
    const index = Number(card.dataset.traktIndex);
    if (!Number.isInteger(index) || !traktVisibleItems[index]) return;
    event.preventDefault();
    openTraktDetails(traktVisibleItems[index]);
  });
}

async function loadTraktDiscovery(query = "", page = 1, feed = activeCatalogFeed) {
  if (!traktResults || !traktStatus) return;
  const requestId = ++traktRequestSequence;
  traktCurrentQuery = String(query || "").trim();
  activeCatalogFeed = feed === "recent" ? "recent" : "trending";
  traktCurrentPage = Math.max(1, Number(page) || 1);
  traktLoading = true;
  renderMoviePagination();
  traktStatus.textContent = query ? "Searching catalogue..." : "Loading movies and web series...";
  try {
    const params = new URLSearchParams({ type: traktType, page: String(traktCurrentPage), feed: activeCatalogFeed });
    const endpoint = query ? (params.set("q", query), "/api/trakt/search?" + params.toString()) : "/api/trakt/discover?" + params.toString();
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (requestId !== traktRequestSequence) return;
    if (!response.ok) throw new Error(data.error || "Catalogue request failed.");
    renderTraktResults(data.results || [], !!data.hasMore);
    traktStatus.textContent = query ? `Search results for “${query}” · Page ${traktCurrentPage}` : `${activeCatalogFeed === "recent" ? "Recent" : "Trending"} ${traktType === "shows" ? "web series" : "movies"} · Page ${traktCurrentPage}`;
  } catch (error) {
    if (requestId !== traktRequestSequence) return;
    // Keep existing Trakt results and Firebase titles visible during API outages.
    renderCurrentMoviePage();
    traktStatus.textContent = error.message || "Unable to load catalogue.";
  } finally {
    if (requestId === traktRequestSequence) {
      traktLoading = false;
      renderCurrentMoviePage();
      renderMoviePagination();
    }
  }
}

document.querySelectorAll("[data-trakt-type]").forEach((button) => {
  button.addEventListener("click", () => {
    traktType = button.dataset.traktType === "shows" ? "shows" : "movies";
    document.querySelectorAll("[data-trakt-type]").forEach((item) => item.classList.toggle("active", item === button));
    if (traktSearchInput) traktSearchInput.value = "";
    loadTraktDiscovery("", 1);
  });
});

if (traktSearchForm) {
  traktSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = String(traktSearchInput?.value || "").trim();
    if (query.length < 2) {
      traktStatus.textContent = "Please enter at least 2 characters.";
      return;
    }
    loadTraktDiscovery(query);
  });
}

// Navbar catalogue tabs behave like separate pages while keeping the shared catalogue layout.
function showCatalogPage(view) {
  const nextView = ["home", "discover", "trending", "recent"].includes(view) ? view : "home";
  const heading = document.querySelector("#discover .section-title");
  const subtitle = document.querySelector("#discover .trakt-subtitle");
  if (heading) heading.textContent = nextView === "trending" ? "Trending Now" : nextView === "recent" ? "Recently Watched" : "Explore Movies & Web Series";
  if (subtitle) subtitle.textContent = nextView === "trending" ? "Popular movies and web series right now." : nextView === "recent" ? "Recently watched movies and web series." : "Your SolexFLIX movies and trending catalogue in one place.";
  if (searchBox) searchBox.hidden = true;
  if (searchInput) searchInput.value = "";
  activeMovieSearch = "";
  setSearchSectionsHidden(false);
  // Keep the legacy homepage rows hidden; the selected page uses the single main catalogue grid.
  [ $("home"), trendingList?.closest(".movie-section"), recentList?.closest(".movie-section"),
    categoryList?.closest(".movie-section"), continueWatchingSection, watchHistorySection
  ].forEach(section => { if (section) section.hidden = true; });
  activeCatalogFeed = nextView === "recent" ? "recent" : "trending";
  if (nextView === "trending" || nextView === "recent" || nextView === "home" || nextView === "discover") {
    loadTraktDiscovery("", 1, activeCatalogFeed);
  }
  document.querySelectorAll("[data-catalog-view]").forEach(link => {
    link.classList.toggle("active", link.dataset.catalogView === nextView);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll("[data-catalog-view]").forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();
    const view = link.dataset.catalogView;
    history.pushState({ catalogView: view }, "", "#" + view);
    showCatalogPage(view);
  });
});
window.addEventListener("popstate", () => showCatalogPage(location.hash.slice(1) || "home"));

/* =========================================
   26. START WEBSITE
========================================= */

loadMovies();
loadTraktDiscovery();
loadMonetagWatchMoreAd();
