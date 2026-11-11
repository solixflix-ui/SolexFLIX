
/* =========================================
   SOLEXFLIX - COMPLETE JAVASCRIPT
   Firebase + Cloudinary + Admin Dashboard
========================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
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
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  increment,
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
const storage = getStorage(app);

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
let socialAuthMode = "login";
let activeChatUnsubscribe = null;
let activeConversationUser = null;
let socialProfile = null;
let viewedProfile = null;
let activeCommentReelId = null;


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
  return movie.poster || movie.posterUrl || "";
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

  const trending = [...movies].slice(0, 8);

  trendingList.innerHTML = trending.length
    ? trending.map(movieCard).join("")
    : "<p>No trending movies yet.</p>";
}

function renderRecent() {
  if (!recentList) return;

  const recent = [...movies]
    .sort((a, b) => getMovieDate(b) - getMovieDate(a))
    .slice(0, 8);

  recentList.innerHTML = recent.length
    ? recent.map(movieCard).join("")
    : "<p>No recent movies yet.</p>";
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

  const totalPages = Math.max(1, Math.ceil(currentMovieList.length / MOVIES_PER_PAGE));
  currentMoviePage = Math.min(Math.max(1, currentMoviePage), totalPages);
  const start = (currentMoviePage - 1) * MOVIES_PER_PAGE;
  const pageMovies = currentMovieList.slice(start, start + MOVIES_PER_PAGE);

  if (pageMovies.length) {
    movieGrid.innerHTML = pageMovies.map(movieCard).join("");
  } else {
    movieGrid.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🎬</div>
        <h3>No Movies Found</h3>
        <p>Sorry! We couldn't find what you're looking for.</p>
        <span>Try another movie title or category.</span>
      </div>
    `;
  }

  renderMoviePagination(totalPages);
}

function renderMoviePagination(totalPages) {
  const pagination = $("movie-pagination");
  if (!pagination) return;
  // Keep the pagination area visible even when only one page exists.
  // Additional page numbers appear automatically as the catalogue grows.
  pagination.hidden = false;
  let pages = [];
  if (totalPages <= 7) {
    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    pages = [1, 2, 3, "...", totalPages];
  }

  pagination.innerHTML = `
    <button type="button" data-page="${currentMoviePage - 1}" ${currentMoviePage === 1 ? "disabled" : ""}>‹ Prev</button>
    ${pages.map(page => page === "..."
      ? `<span class="pagination-dots">…</span>`
      : `<button type="button" data-page="${page}" class="${page === currentMoviePage ? "active" : ""}" aria-current="${page === currentMoviePage ? "page" : "false"}">${page}</button>`
    ).join("")}
    <button type="button" data-page="${currentMoviePage + 1}" ${currentMoviePage === totalPages ? "disabled" : ""}>Next ›</button>
  `;
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
  const movie = movies[0];

  if (!movie) return;

  if ($("featured-title")) {
    $("featured-title").textContent = movie.title || "";
  }

  if ($("featured-description")) {
    $("featured-description").textContent =
      movie.description || "";
  }

  const watchButton = $("featured-watch");
  const detailsButton = $("featured-details");

  if (watchButton) {
    watchButton.dataset.movieId = movie.id;
  }

  if (detailsButton) {
    detailsButton.dataset.movieId = movie.id;
  }
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

if (searchInput) {
  searchInput.addEventListener("input", (event) => {
    activeMovieSearch = String(event.target.value || "").trim().toLowerCase();
    applyMovieFilters();
    setSearchSectionsHidden(activeMovieSearch.length > 0);
  });
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
    const requestedPage = Number(button.dataset.page);
    if (!Number.isInteger(requestedPage)) return;

    const totalPages = Math.max(1, Math.ceil(currentMovieList.length / MOVIES_PER_PAGE));
    if (requestedPage < 1 || requestedPage > totalPages) return;
    currentMoviePage = requestedPage;
    renderCurrentMoviePage();
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
  // Use the browser history when this details view created a history entry.
  if (window.history.state && window.history.state.solexflixDetails) {
    window.history.back();
    return;
  }
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

  if (isAdmin) {
    showAdminDashboard();
  } else {
    hideSection(adminPanel);
    hideSection(loginSection);
    hideSection(detailsSection);
    showSection(websiteSection);
  }
  updateAccountControls();
  if (user && !isAdmin) {
    await loadSocialProfile(user);
    subscribeStories();
  } else {
    socialProfile = null;
    renderProfilePage();
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
    const trailerUrl = $("movie-trailer-url")?.value.trim();
    const download480Url = $("movie-download-480")?.value.trim();
    const download720Url = $("movie-download-720")?.value.trim();
    const download1080Url = $("movie-download-1080")?.value.trim();
    const screenshots = String($("movie-screenshots-input")?.value || "")
      .split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    const posterFile = posterInput?.files[0];

    if (!title || !description || !year || !category) {
      showMessage(movieMessage, "Please fill all required fields.");
      return;
    }

    const existingMovie = editingMovieId
      ? movies.find((movie) => movie.id === editingMovieId)
      : null;

    if (!posterFile && !existingMovie) {
      showMessage(movieMessage, "Please select a movie poster.");
      return;
    }

    const saveButton = $("save-movie-btn");

    try {
      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Please wait...";
      }

      let poster = existingMovie ? getPoster(existingMovie) : "";

      if (posterFile) {
        showMessage(movieMessage, "Uploading poster...", true);
        poster = await uploadPoster(posterFile);
      }

      const allExternalUrls = [download480Url, download720Url, download1080Url, ...screenshots].filter(Boolean);
      if (allExternalUrls.some((url) => !isSafeHttpUrl(url))) {
        throw new Error("Please enter valid http:// or https:// links only.");
      }

      const movieData = {
        title,
        description,
        year: Number(year),
        category,
        rating: rating || "",
        trailerUrl,
        download480Url,
        download720Url,
        download1080Url,
        screenshots,
        poster
      };

      if (editingMovieId) {
        await updateDoc(doc(db, "movies", editingMovieId), {
          ...movieData,
          updatedAt: serverTimestamp()
        });

        showMessage(movieMessage, "Movie updated successfully!", true);

      } else {
        await addDoc(moviesRef, {
          ...movieData,
          createdAt: serverTimestamp()
        });

        showMessage(movieMessage, "Movie added successfully!", true);
      }

      movieForm.reset();

      editingMovieId = null;

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

function editMovie(id) {
  if (!isAdmin) return;

  const movie = movies.find((item) => item.id === id);

  if (!movie) return;

  editingMovieId = id;

  $("movie-title").value = movie.title || "";
  $("movie-description").value = movie.description || "";
  $("movie-year").value = movie.year || "";
  $("movie-category").value = movie.category || "";
  $("movie-rating").value = movie.rating || "";
  $("movie-trailer-url").value = movie.trailerUrl || "";
  $("movie-download-480").value = movie.download480Url || "";
  $("movie-download-720").value = movie.download720Url || "";
  $("movie-download-1080").value = movie.download1080Url || "";
  $("movie-screenshots-input").value = Array.isArray(movie.screenshots) ? movie.screenshots.join("\n") : "";

  if (posterPreview) {
    posterPreview.src = getPoster(movie);
    posterPreview.hidden = !getPoster(movie);
  }

  if ($("form-heading")) {
    $("form-heading").textContent = "Edit Movie";
  }

  if ($("save-movie-btn")) {
    $("save-movie-btn").textContent = "Update Movie";
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




// =========================================
// SOLEXFLIX REELS FEED
// Reels are read from Firestore collection "videos".
// Video files must be hosted at an authorized direct URL.
const videosRef = collection(db, "videos");
let reels = [];
let activeReelFilter = "all";
let likedReelIds = new Set();
let reelsObserver = null;
// Keep the existing Adsterra homepage slot and mount it inside the Reels feed.
const homepageAdSlot = $("website-section")?.querySelector(".ad-slot-home") || document.querySelector(".ad-slot-home");

function safeVideoUrl(value = "") {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function getLikedReels() {
  try {
    return Array.from(likedReelIds);
  } catch {
    return [];
  }
}

function reelMarkup(reel) {
  const src = safeVideoUrl(reel.videoUrl || reel.video || reel.url || "");
  if (!src) return "";
  const id = escapeHTML(reel.id);
  const caption = escapeHTML(reel.caption || reel.description || "A little laugh for your day");
  const creator = escapeHTML(reel.creator || reel.username || "SolexFLIX");
  const liked = likedReelIds.has(reel.id);
  const likes = Math.max(0, Number(reel.likes || 0));
  return `
    <article class="reel-card" data-reel-id="${id}">
      <video class="reel-video" src="${escapeHTML(src)}" playsinline loop muted preload="metadata"></video>
      <div class="reel-shade"></div>
      <button class="reel-sound" type="button" data-reel-action="sound" aria-label="Toggle sound">🔇</button>
      <div class="reel-details">
        <div class="reel-creator">@${creator.replace(/^@/,"")}</div>
        <p>${caption}</p>
        <span class="reel-audio">♫ Original audio · SolexFLIX</span>
      </div>
      <div class="reel-actions">
        <button type="button" data-reel-action="like" class="${liked ? "is-liked" : ""}"><span>♥</span><small>${likes}</small></button>
        <button type="button" data-reel-action="comment"><span>●</span><small>Comment</small></button>
        <button type="button" data-reel-action="share"><span>↗</span><small>Share</small></button>
      </div>
      <button class="reel-play-toggle" type="button" data-reel-action="play" aria-label="Play or pause">▶</button>
    </article>`;
}

function setupReelPlayback() {
  if (reelsObserver) reelsObserver.disconnect();
  const cards = document.querySelectorAll(".reel-card");
  cards.forEach(card => {
    const video = card.querySelector("video");
    if (video && !video.dataset.reelStateBound) {
      video.dataset.reelStateBound = "1";
      video.addEventListener("play", () => card.classList.remove("is-paused"));
      video.addEventListener("pause", () => card.classList.add("is-paused"));
    }
  });
  if (!("IntersectionObserver" in window)) {
    cards.forEach((card, index) => {
      const video = card.querySelector("video");
      if (!video) return;
      if (index === 0) video.play().catch(() => {});
      else video.pause();
    });
    return;
  }
  reelsObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const video = entry.target.querySelector("video");
      if (!video) return;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
        document.querySelectorAll(".reel-video").forEach(other => {
          if (other !== video) { other.pause(); other.muted = true; }
        });
        video.play().catch(()=>{});
      } else {
        video.pause();
      }
    });
  }, { threshold: [0, 0.7, 1] });
  cards.forEach(card => reelsObserver.observe(card));
}

async function loadReels() {
  const container = $("reels-container");
  if (!container) return;
  try {
    const snap = await getDocs(videosRef);
    likedReelIds = new Set();
    if(currentUser&&!isAdmin){
      const likesSnap=await getDocs(query(collection(db,"reelLikes"),where("uid","==",currentUser.uid),limit(500)));
      likesSnap.docs.forEach(d=>{const id=d.data().reelId;if(id)likedReelIds.add(id);});
    }
    reels = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      .filter(r => safeVideoUrl(r.videoUrl || r.video || r.url))
      .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    let visibleReels=reels;
    if(activeReelFilter==="friends" && currentUser && !isAdmin){
      const followingSnap=await getDocs(query(followsRef,where("followerUid","==",currentUser.uid),limit(500)));
      const followed=new Set(followingSnap.docs.map(d=>d.data().followingUid));
      visibleReels=reels.filter(r=>followed.has(r.creatorUid));
    }
    // Detach the existing ad before replacing feed markup, then place it after reel 3.
    if (homepageAdSlot) homepageAdSlot.remove();
    container.innerHTML = visibleReels.length
      ? visibleReels.map(reelMarkup).join("")
      : '<div class="reels-empty"><strong>No reels yet</strong><p>Admin dashboard se pehla funny video publish karo.</p></div>';
    if (homepageAdSlot) {
      const adCard = document.createElement("div");
      adCard.className = "reel-ad-card";
      adCard.setAttribute("aria-label", "Advertisement");
      adCard.appendChild(homepageAdSlot);
      const thirdReel = container.querySelectorAll(".reel-card")[2];
      if (thirdReel) thirdReel.after(adCard);
      else container.appendChild(adCard);
    }
    setupReelPlayback();
  } catch (error) {
    console.error("Reels load error:", error);
    container.innerHTML = '<div class="reels-empty"><strong>Reels load nahi ho paaye</strong><p>Firestore "videos" collection permissions check karein.</p></div>';
  }
}

$("reels-container")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-reel-action]");
  if (!button) return;
  const card = button.closest(".reel-card");
  const video = card?.querySelector("video");
  const action = button.dataset.reelAction;
  const id = card?.dataset.reelId;
  const reel = reels.find(r => r.id === id);
  if (action === "play" && video) {
    if (video.paused) video.play().catch(()=>{}); else video.pause();
  }
  if (action === "sound" && video) {
    video.muted = !video.muted;
    button.textContent = video.muted ? "🔇" : "🔊";
    if (!video.paused) video.play().catch(()=>{});
  }
  if (action === "like" && id) {
    if(!currentUser||isAdmin){openSocialAuth("login");return;}
    const likeRef=doc(db,"reelLikes",id+"_"+currentUser.uid);
    try{
      const existing=await getDoc(likeRef);
      if(existing.exists()){
        await deleteDoc(likeRef);
        await updateDoc(doc(db,"videos",id),{likes:increment(-1)});
        likedReelIds.delete(id);
        button.classList.remove("is-liked");
      }else{
        await setDoc(likeRef,{uid:currentUser.uid,reelId:id,createdAt:serverTimestamp()});
        await updateDoc(doc(db,"videos",id),{likes:increment(1)});
        likedReelIds.add(id);
        button.classList.add("is-liked");
      }
      const updated=await getDoc(doc(db,"videos",id));
      const n=Math.max(0,Number(updated.data()?.likes||0));
      button.querySelector("small").textContent=n;
      reel.likes=n;
    }catch(err){alert("Like could not be saved: "+err.message);}
  }
  if (action === "comment") {
    if(!currentUser||isAdmin){openSocialAuth("login");return;}
    activeCommentReelId=id;
    $("comments-modal").hidden=false;
    loadReelComments(id);
  }
  if (action === "share" && reel) {
    const shareData = { title:"SolexFLIX Reel", text:reel.caption || "Watch this funny reel", url:location.href };
    if (navigator.share) { try { await navigator.share(shareData); } catch {} }
    else if (navigator.clipboard) { await navigator.clipboard.writeText(shareData.url); alert("Link copied!"); }
  }
});

$("reel-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const message = $("reel-message");
  if (!isAdmin) { showMessage(message, "Admin login required."); return; }
  const videoUrl = safeVideoUrl($("reel-video-url")?.value.trim());
  const caption = $("reel-caption")?.value.trim();
  const creator = $("reel-creator")?.value.trim() || "SolexFLIX";
  if (!videoUrl || !caption) { showMessage(message, "Valid video URL and caption required."); return; }
  try {
    const submit = $("reel-form").querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = "Publishing…";
    await addDoc(videosRef, { videoUrl, caption, creator, likes:0, createdAt:serverTimestamp(), status:"published" });
    $("reel-form").reset();
    showMessage(message, "Reel published successfully!", true);
    await loadReels();
  } catch (error) {
    console.error("Reel publish error:", error);
    showMessage(message, "Publish failed: " + error.message);
  } finally {
    const submit = $("reel-form")?.querySelector('button[type="submit"]');
    if (submit) { submit.disabled = false; submit.textContent = "Publish Reel"; }
  }
});

/* =========================================
   26. START WEBSITE
========================================= */


/* =========================================
   APP BOTTOM NAVIGATION
========================================= */
function setActiveAppView(viewId) {
  const allowed = ["home-view", "search-view", "reels-feed", "messages-view", "profile-view"];
  if (!allowed.includes(viewId)) return;
  document.body.dataset.activeView = viewId;
  document.querySelectorAll(".bottom-nav-btn").forEach((button) => {
    const active = button.dataset.view === viewId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  if (viewId === "reels-feed") {
    loadReels();
  }
  if (viewId === "search-view") renderSocialSearch();
  if (viewId === "profile-view") {
    if(!viewedProfile)renderProfilePage();
    const count = document.querySelectorAll("#reels-container .reel-card").length;
    const countNode = $("profile-reel-count");
    if (countNode) countNode.textContent = String(count);
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}
document.querySelectorAll(".bottom-nav-btn").forEach((button) => {
  button.addEventListener("click", () => { if(button.dataset.view==="profile-view")viewedProfile=null; setActiveAppView(button.dataset.view); });
});
$("brand-home")?.addEventListener("click", (event) => {
  event.preventDefault();
  setActiveAppView("home-view");
});
setActiveAppView("home-view");


loadMovies();
loadReels();


/* =========================================
   SOLEXFLIX SOCIAL APP INTERACTIONS
========================================= */
const socialSearchInput = $("social-search-input");
let socialSearchKind = "all";
function renderSocialSearch() {
  const q=(socialSearchInput?.value||"").trim().toLowerCase(),host=$("social-search-results");
  if(!host)return;
  const reelItems=reels.filter(r=>!q||[r.caption,r.creator,r.username].some(v=>String(v||"").toLowerCase().includes(q)));
  const movieItems=movies.filter(m=>!q||[m.title,m.category,m.description].some(v=>String(v||"").toLowerCase().includes(q)));
  const parts=[];
  if(socialSearchKind==="all"||socialSearchKind==="accounts")parts.push('<div class="result-section"><h3>Creators</h3><div class="creator-result"><span class="mini-avatar">S</span><div><b>SolexFLIX</b><small>@solexflix · Official</small></div><span class="verified-mark">✓</span></div></div>');
  if((socialSearchKind==="all"||socialSearchKind==="reels")&&reelItems.length)parts.push('<div class="result-section"><h3>Reels</h3><div class="search-reel-list">'+reelItems.slice(0,12).map(r=>'<button class="search-reel-item" type="button" data-open-reels="1"><span>▶</span><b>'+escapeHTML(r.caption||"Reel")+'</b><small>@'+escapeHTML(r.creator||r.username||"creator")+'</small></button>').join("")+'</div></div>');
  if((socialSearchKind==="all"||socialSearchKind==="tags")&&movieItems.length)parts.push('<div class="result-section"><h3>Movies & topics</h3><div class="search-reel-list">'+movieItems.slice(0,12).map(m=>'<div class="search-reel-item"><span>▣</span><b>'+escapeHTML(m.title||"Movie")+'</b><small>'+escapeHTML(m.category||"")+'</small></div>').join("")+'</div></div>');
  host.innerHTML=parts.join("")||'<div class="empty-state">No results found. Try another name or keyword.</div>';
}
socialSearchInput?.addEventListener("input",()=>{
  const term=socialSearchInput.value.trim();
  if(socialSearchKind==="all"||socialSearchKind==="accounts")searchAccounts(term);
  else renderSocialSearch();
});
document.querySelectorAll(".search-tab").forEach(btn=>btn.addEventListener("click",()=>{
  socialSearchKind=btn.dataset.searchKind||"all";
  document.querySelectorAll(".search-tab").forEach(b=>b.classList.toggle("active",b===btn));
  if(socialSearchKind==="all"||socialSearchKind==="accounts")searchAccounts(socialSearchInput?.value||"");
  else renderSocialSearch();
}));
$("social-search-results")?.addEventListener("click",e=>{
  if(e.target.closest("[data-open-reels]"))setActiveAppView("reels-feed");
});
document.querySelectorAll("[data-reel-feed]").forEach(btn=>btn.addEventListener("click",async()=>{
  activeReelFilter=btn.dataset.reelFeed||"all";
  document.querySelectorAll("[data-reel-feed]").forEach(b=>b.classList.toggle("active",b===btn));
  if(activeReelFilter==="friends"&&(!currentUser||isAdmin)){activeReelFilter="all";openSocialAuth("login");return;}
  await loadReels();
}));
$("search-toggle")?.addEventListener("click",()=>setActiveAppView("search-view"));
$("reels-create-btn")?.addEventListener("click",()=>{
  if(!currentUser||isAdmin){openSocialAuth("signup");return;}
  setActiveAppView("profile-view");
  $("user-reel-form")?.scrollIntoView({behavior:"smooth",block:"center"});
});
$("bottom-create-btn")?.addEventListener("click",()=>{
  if(currentUser&&!isAdmin){setActiveAppView("profile-view");$("user-reel-form")?.scrollIntoView({behavior:"smooth",block:"center"});}
  else if(isAdmin){showAdminDashboard();$("reel-form")?.scrollIntoView({behavior:"smooth"});}
  else openSocialAuth("signup");
});
$("admin-shortcut-btn")?.addEventListener("click",()=> $("admin-open")?.click());
$("profile-settings-btn")?.addEventListener("click",()=>alert("Account settings: edit your profile or sign out from this page."));

/* =========================================
   AUTHENTICATED SOLEXFLIX SOCIAL FEATURES
   Firestore collections: users, follows, stories,
   messages, comments, videos.
========================================= */
const usersRef = collection(db,"users");
const followsRef = collection(db,"follows");
const storiesRef = collection(db,"stories");
const messagesRef = collection(db,"messages");
const commentsRef = collection(db,"comments");
let storyUnsubscribe = null;
let userSearchResults = [];

function updateAccountControls(){
  const signed=!!currentUser && !isAdmin;
  const button=$("account-open");
  if(button)button.textContent=signed ? (socialProfile?.username ? "@"+socialProfile.username : "Account") : "Sign in";
  if($("profile-signout-btn"))$("profile-signout-btn").hidden=!signed;
  if($("profile-display-name") && signed && socialProfile?.displayName)$("profile-display-name").textContent=socialProfile.displayName;
}
function openSocialAuth(mode="login"){
  socialAuthMode=mode;
  $("social-auth-modal").hidden=false;
  document.querySelectorAll(".auth-mode").forEach(b=>b.classList.toggle("active",b.dataset.authMode===mode));
  $("social-auth-title").textContent=mode==="signup"?"Create your SolexFLIX account":"Welcome back";
  $("social-auth-name").hidden=mode!=="signup";
  $("social-auth-username").hidden=mode!=="signup";
  $("social-auth-submit").textContent=mode==="signup"?"Create account":"Log in";
  $("social-auth-password").autocomplete=mode==="signup"?"new-password":"current-password";
  showMessage($("social-auth-message"),"");
}
$("account-open")?.addEventListener("click",()=>currentUser&&!isAdmin?setActiveAppView("profile-view"):openSocialAuth("login"));
$("close-social-auth")?.addEventListener("click",()=>$("social-auth-modal").hidden=true);
document.querySelectorAll(".auth-mode").forEach(b=>b.addEventListener("click",()=>openSocialAuth(b.dataset.authMode)));
$("social-auth-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const email=$("social-auth-email").value.trim().toLowerCase();
  const password=$("social-auth-password").value;
  const username=$("social-auth-username").value.trim().toLowerCase().replace(/^@/,"");
  const name=$("social-auth-name").value.trim();
  const submit=$("social-auth-submit");
  if(socialAuthMode==="signup" && !/^[a-z0-9._]{3,24}$/.test(username)){
    showMessage($("social-auth-message"),"Username: 3–24 letters, numbers, dot or underscore.");return;
  }
  submit.disabled=true;
  try{
    if(socialAuthMode==="signup"){
      const existing=await getDocs(query(usersRef,where("username","==",username),limit(1)));
      if(!existing.empty)throw new Error("This username is already taken.");
      const credential=await createUserWithEmailAndPassword(auth,email,password);
      await updateProfile(credential.user,{displayName:name||username});
      const profile={uid:credential.user.uid,username,displayName:name||username,bio:"New to SolexFLIX.",photoURL:"",createdAt:serverTimestamp()};
      await setDoc(doc(db,"users",credential.user.uid),profile);
      socialProfile=profile;
    }else{
      await signInWithEmailAndPassword(auth,email,password);
    }
    $("social-auth-modal").hidden=true;
    $("social-auth-form").reset();
    setActiveAppView("profile-view");
  }catch(error){
    console.error("Social authentication:",error);
    showMessage($("social-auth-message"),error.message||"Could not sign in.");
  }finally{submit.disabled=false;}
});
async function loadSocialProfile(user){
  try{
    const snap=await getDoc(doc(db,"users",user.uid));
    if(snap.exists())socialProfile={uid:user.uid,...snap.data()};
    else{
      const fallback={uid:user.uid,username:(user.displayName||("creator_"+user.uid.slice(0,6))).toLowerCase().replace(/[^a-z0-9._]/g,"").slice(0,24),displayName:user.displayName||"Creator",bio:"New to SolexFLIX.",photoURL:"",createdAt:serverTimestamp()};
      socialProfile=fallback;
      await setDoc(doc(db,"users",user.uid),fallback,{merge:true});
    }
  }catch(error){console.warn("Profile load failed",error);socialProfile={uid:user.uid,username:user.displayName||"creator",displayName:user.displayName||"Creator",bio:""};}
  updateAccountControls();renderProfilePage();renderSocialSearch();loadInbox();loadOwnReels();
}

async function loadOwnReels(){
  if(!currentUser||isAdmin)return;
  try{
    const snap=await getDocs(query(videosRef,where("creatorUid","==",currentUser.uid),limit(60)));
    const own=snap.docs.map(d=>({id:d.id,...d.data()}));
    const grid=$("profile-content-grid");
    if(grid)grid.innerHTML=own.length?own.map(r=>'<button class="profile-reel-tile" type="button" data-open-reels="1"><span>▶</span><small>'+escapeHTML(r.caption||"Reel")+'</small></button>').join(""):'<div class="empty-state">Your published Reels will appear here.</div>';
    if($("profile-post-count"))$("profile-post-count").textContent=String(own.length);
  }catch(err){console.warn("Own Reels:",err);}
}
function renderProfilePage(){
  const p=viewedProfile||socialProfile;
  const own=!!currentUser&&p?.uid===currentUser.uid;
  if($("edit-profile-btn"))$("edit-profile-btn").hidden=!own;
  if($("profile-message-btn"))$("profile-message-btn").hidden=own||!p?.uid;
  if($("profile-follow-btn"))$("profile-follow-btn").hidden=own||!p?.uid||!currentUser||isAdmin;
  if(p?.uid&&!own&&currentUser)refreshProfileFollowState(p.uid);
  if($("profile-avatar"))$("profile-avatar").textContent=(p?.displayName||p?.username||"S").charAt(0).toUpperCase();
  if($("profile-display-name"))$("profile-display-name").textContent=p?.displayName||"SolexFLIX Creator";
  if($("profile-handle"))$("profile-handle").textContent="@"+(p?.username||"solexflix");
  if($("profile-bio"))$("profile-bio").textContent=p?.bio||"Movies, moments and people.";
  if($("profile-follower-count"))$("profile-follower-count").textContent="…";
  if($("profile-following-count"))$("profile-following-count").textContent="…";
  if(p?.uid){
    Promise.all([
      getDocs(query(followsRef,where("followingUid","==",p.uid))),
      getDocs(query(followsRef,where("followerUid","==",p.uid)))
    ]).then(([followers,following])=>{
      $("profile-follower-count").textContent=followers.size;
      $("profile-following-count").textContent=following.size;
    }).catch(()=>{});
  }else{
    if($("profile-follower-count"))$("profile-follower-count").textContent="0";
    if($("profile-following-count"))$("profile-following-count").textContent="0";
  }
}

async function refreshProfileFollowState(targetUid){
  if(!currentUser||!targetUid||targetUid===currentUser.uid)return;
  const btn=$("profile-follow-btn");if(!btn)return;
  try{
    const snap=await getDoc(doc(db,"follows",currentUser.uid+"_"+targetUid));
    btn.textContent=snap.exists()?"Following":"Follow";
    btn.classList.toggle("is-following",snap.exists());
  }catch(err){console.warn(err);}
}
$("profile-follow-btn")?.addEventListener("click",async()=>{
  if(!currentUser||!viewedProfile?.uid)return;
  const targetUid=viewedProfile.uid,ref=doc(db,"follows",currentUser.uid+"_"+targetUid),btn=$("profile-follow-btn");
  try{
    const snap=await getDoc(ref);
    if(snap.exists()){await deleteDoc(ref);btn.textContent="Follow";btn.classList.remove("is-following");}
    else{await setDoc(ref,{followerUid:currentUser.uid,followingUid:targetUid,createdAt:serverTimestamp()});btn.textContent="Following";btn.classList.add("is-following");}
    renderProfilePage();
  }catch(err){alert("Follow update failed: "+err.message);}
});
document.querySelector(".profile-numbers")?.addEventListener("click",async e=>{
  const button=e.target.closest("[data-profile-relation]");if(!button)return;
  const p=viewedProfile||socialProfile;if(!p?.uid)return;
  const kind=button.dataset.profileRelation;
  $("relations-title").textContent=kind==="followers"?"Followers":"Following";
  const host=$("relations-list");host.innerHTML='<div class="empty-state">Loading…</div>';
  $("relations-modal").hidden=false;
  try{
    const snap=await getDocs(query(followsRef,where(kind==="followers"?"followingUid":"followerUid","==",p.uid),limit(200)));
    const ids=snap.docs.map(d=>kind==="followers"?d.data().followerUid:d.data().followingUid).filter(uid=>uid!==p.uid);
    const profiles=await Promise.all(ids.map(async uid=>{const u=await getDoc(doc(db,"users",uid));return u.exists()?{uid,...u.data()}:null;}));
    const valid=profiles.filter(Boolean);
    host.innerHTML=valid.map(u=>'<div class="creator-result"><span class="mini-avatar">'+escapeHTML((u.displayName||u.username||"S").charAt(0).toUpperCase())+'</span><div><b>'+escapeHTML(u.displayName||u.username)+'</b><small>@'+escapeHTML(u.username||"creator")+'</small></div><button type="button" class="profile-view-action" data-profile-uid="'+escapeHTML(u.uid)+'">View</button></div>').join("")||'<div class="empty-state">No accounts here yet.</div>';
  }catch(err){host.innerHTML='<div class="empty-state">Could not load this list.</div>';}
});
$("relations-list")?.addEventListener("click",e=>{
  const btn=e.target.closest("[data-profile-uid]");if(!btn)return;
  $("relations-modal").hidden=true;openPublicProfile(btn.dataset.profileUid);
});
async function openPublicProfile(uid){
  try{
    const snap=await getDoc(doc(db,"users",uid));
    if(!snap.exists())return;
    viewedProfile={uid,...snap.data()};
    setActiveAppView("profile-view");
    renderProfilePage();
    const [posts]=await Promise.all([getDocs(query(videosRef,where("creatorUid","==",uid),limit(60)))]);
    if($("profile-post-count"))$("profile-post-count").textContent=posts.size;
    const grid=$("profile-content-grid");
    if(grid)grid.innerHTML=posts.size?posts.docs.map(d=>'<button class="profile-reel-tile" type="button" data-open-reels="1"><span>▶</span><small>'+escapeHTML(d.data().caption||"Reel")+'</small></button>').join(""):'<div class="empty-state">No public Reels yet.</div>';
  }catch(err){console.warn("Public profile:",err);}
}
$("profile-message-btn")?.addEventListener("click",()=>{if(viewedProfile?.username)openDirectMessage(viewedProfile.username);});
$("profile-signout-btn")?.addEventListener("click",async()=>{if(activeChatUnsubscribe)activeChatUnsubscribe();await signOut(auth);setActiveAppView("home-view");});
$("edit-profile-btn")?.addEventListener("click",async()=>{
  if(!currentUser||isAdmin){openSocialAuth("login");return;}
  const displayName=prompt("Display name",socialProfile?.displayName||"");
  if(displayName===null)return;
  const bio=prompt("Profile bio",socialProfile?.bio||"");
  if(bio===null)return;
  const username=prompt("Username (3–24 characters)",socialProfile?.username||"");
  if(username===null)return;
  const clean=username.trim().toLowerCase().replace(/^@/,"");
  if(!/^[a-z0-9._]{3,24}$/.test(clean)){alert("Invalid username.");return;}
  try{
    const found=await getDocs(query(usersRef,where("username","==",clean),limit(2)));
    if(found.docs.some(d=>d.id!==currentUser.uid)){alert("Username already taken.");return;}
    await setDoc(doc(db,"users",currentUser.uid),{username:clean,displayName:displayName.trim().slice(0,40),bio:bio.trim().slice(0,160)},{merge:true});
    await updateProfile(currentUser,{displayName:displayName.trim().slice(0,40)});
    await loadSocialProfile(currentUser);
  }catch(err){alert("Profile update failed: "+err.message);}
});
async function subscribeStories(){
  if(storyUnsubscribe)storyUnsubscribe();
  try{
    const q=query(storiesRef,orderBy("createdAt","desc"),limit(30));
    storyUnsubscribe=onSnapshot(q,snap=>{
      const host=$("stories-list");if(!host)return;
      const active=snap.docs.filter(d=>{const t=d.data().createdAt?.toMillis?.()||0;return !t||Date.now()-t<86400000;});
      host.innerHTML=active.map(d=>{
        const x=d.data();return '<button class="story-item" type="button" data-story-url="'+escapeHTML(x.mediaUrl||"")+'" data-story-user="'+escapeHTML(x.username||"creator")+'"><span class="story-ring"><span class="mini-avatar">'+escapeHTML((x.username||"S").charAt(0).toUpperCase())+'</span></span><small>'+escapeHTML(x.username||"creator")+'</small></button>';
      }).join("")||'<div class="stories-loading">No stories yet — be the first to share.</div>';
    },err=>console.warn("Stories feed:",err));
  }catch(err){console.warn(err);}
}
async function uploadSocialMedia(file,folder,maxBytes){
  if(!file)throw new Error("Choose a file first.");
  if(file.size>maxBytes)throw new Error("File is too large. Maximum "+Math.round(maxBytes/1024/1024)+" MB.");
  if(!["image/","video/"].some(type=>file.type.startsWith(type)))throw new Error("Only image or video files are allowed.");
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=folder+"/"+currentUser.uid+"/"+Date.now()+"_"+safeName;
  const target=storageRef(storage,path);
  await uploadBytes(target,file,{contentType:file.type});
  return await getDownloadURL(target);
}
$("story-add-btn")?.addEventListener("click",()=>{
  if(!currentUser||isAdmin){openSocialAuth("signup");return;}
  $("story-file-input")?.click();
});
$("story-file-input")?.addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  const button=$("story-add-btn");button.disabled=true;
  try{
    const mediaUrl=await uploadSocialMedia(file,"stories",25*1024*1024);
    await addDoc(storiesRef,{uid:currentUser.uid,username:socialProfile?.username||"creator",mediaUrl,mediaType:file.type,createdAt:serverTimestamp()});
    e.target.value="";
  }catch(err){alert("Story upload failed: "+err.message);}
  finally{button.disabled=false;}
});
$("stories-list")?.addEventListener("click",e=>{
  const item=e.target.closest("[data-story-url]");if(!item)return;
  const url=item.dataset.storyUrl,host=$("story-viewer");
  $("story-viewer-user").textContent="@"+(item.dataset.storyUser||"creator");
  const cleanUrl=url.split("?")[0].toLowerCase();
  const isVideo=[".mp4",".webm",".mov"].some(ext=>cleanUrl.endsWith(ext));
  $("story-viewer-video").hidden=!isVideo;
  $("story-viewer-image").hidden=isVideo;
  if(isVideo){$("story-viewer-image").src="";$("story-viewer-video").src=url;$("story-viewer-video").play().catch(()=>{});}
  else{$("story-viewer-video").pause();$("story-viewer-video").src="";$("story-viewer-image").src=url;}
  host.hidden=false;
});
$("user-reel-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!currentUser||isAdmin){openSocialAuth("signup");return;}
  const submit=$("user-reel-form").querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="Uploading…";
  try{
    const file=$("user-reel-file")?.files?.[0];
    let videoUrl=$("user-reel-url").value.trim();
    if(file)videoUrl=await uploadSocialMedia(file,"reels",150*1024*1024);
    if(!videoUrl)throw new Error("Choose a video or paste its direct URL.");
    const u=new URL(videoUrl);
    if(!["http:","https:"].includes(u.protocol))throw new Error("Invalid video URL.");
    await addDoc(videosRef,{videoUrl:u.href,caption:$("user-reel-caption").value.trim(),creator:socialProfile?.username||"creator",creatorUid:currentUser.uid,likes:0,createdAt:serverTimestamp(),status:"published"});
    $("user-reel-form").reset();await loadReels();await loadOwnReels();renderProfilePage();alert("Your Reel is published.");
  }catch(err){alert("Reel publish failed: "+err.message);}
  finally{submit.disabled=false;submit.textContent="Publish Reel";}
});
document.querySelectorAll("[data-close-viewer]").forEach(btn=>btn.addEventListener("click",()=>{
  const id=btn.dataset.closeViewer;const el=$(id);if(el)el.hidden=true;
  if(id==="story-viewer"){$("story-viewer-video").pause();$("story-viewer-video").src="";}
}));
async function loadReelComments(reelId){
  const host=$("reel-comments-list");if(!host)return;
  host.innerHTML='<div class="empty-state">Loading comments…</div>';
  try{
    const snap=await getDocs(query(commentsRef,where("reelId","==",reelId),limit(100)));
    const rows=snap.docs.map(d=>d.data()).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
    host.innerHTML=rows.map(c=>'<div class="comment-row"><b>@'+escapeHTML(c.username||"creator")+'</b><span>'+escapeHTML(c.text||"")+'</span></div>').join("")||'<div class="empty-state">Be the first to comment.</div>';
  }catch(err){host.innerHTML='<div class="empty-state">Comments could not load.</div>';console.warn(err);}
}
$("reel-comment-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!currentUser||!activeCommentReelId)return;
  const input=$("reel-comment-input"),textValue=input.value.trim();if(!textValue)return;
  const submit=e.submitter; if(submit)submit.disabled=true;
  try{
    await addDoc(commentsRef,{reelId:activeCommentReelId,uid:currentUser.uid,username:socialProfile?.username||"creator",text:textValue.slice(0,500),createdAt:serverTimestamp()});
    input.value="";await loadReelComments(activeCommentReelId);
  }catch(err){alert("Comment failed: "+err.message);}
  finally{if(submit)submit.disabled=false;}
});
$("profile-content-grid")?.addEventListener("click",e=>{
  if(e.target.closest("[data-open-reels]"))setActiveAppView("reels-feed");
});
document.querySelectorAll(".profile-content-tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".profile-content-tab").forEach(b=>b.classList.toggle("active",b===btn));
  const grid=$("profile-content-grid");
  if(btn.dataset.profileTab==="reels")loadOwnReels();
  else if(grid)grid.innerHTML='<div class="empty-state">No '+escapeHTML(btn.dataset.profileTab)+' posts yet.</div>';
}));
$("start-chat-btn")?.addEventListener("click",()=>{const who=prompt("Enter SolexFLIX username:");if(who)openDirectMessage(who);});
$("share-profile-btn")?.addEventListener("click",async()=>{
  const p=viewedProfile||socialProfile,username=p?.username||"solexflix";
  const url=location.origin+location.pathname+"?user="+encodeURIComponent(username);
  try{if(navigator.share)await navigator.share({title:"SolexFLIX",text:"Follow @"+username,url});else{await navigator.clipboard.writeText(url);alert("Profile link copied.");}}catch{}
});
$("profile-content-grid")?.addEventListener("click",e=>{
  const tile=e.target.closest(".profile-reel-tile");if(tile)setActiveAppView("reels-feed");
});
async function searchAccounts(term){
  const host=$("social-search-results");if(!host)return;
  try{
    const q=query(usersRef,orderBy("username"),limit(100));
    const snap=await getDocs(q);
    userSearchResults=snap.docs.map(d=>({uid:d.id,...d.data()})).filter(p=>!term||(p.username||"").toLowerCase().includes(term.toLowerCase())||(p.displayName||"").toLowerCase().includes(term.toLowerCase()));
    host.innerHTML=userSearchResults.map(p=>'<div class="creator-result"><span class="mini-avatar">'+escapeHTML((p.displayName||p.username||"S").charAt(0).toUpperCase())+'</span><div><b>'+escapeHTML(p.displayName||p.username)+'</b><small>@'+escapeHTML(p.username||"creator")+'</small></div><button class="profile-view-action" data-profile-uid="'+escapeHTML(p.uid)+'">View</button><button class="profile-view-action" data-message-username="'+escapeHTML(p.username||"creator")+'">Message</button><button class="follow-action" data-follow-uid="'+escapeHTML(p.uid)+'" data-follow-name="'+escapeHTML(p.username||"creator")+'">Follow</button></div>').join("")||'<div class="empty-state">No accounts found.</div>';
  }catch(err){host.innerHTML='<div class="empty-state">Account search needs Firestore user read permissions.</div>';console.warn(err);}
}
socialSearchInput?.addEventListener("input",()=>{
  const term=socialSearchInput.value.trim();
  if(socialSearchKind==="accounts"||socialSearchKind==="all")searchAccounts(term);
  else renderSocialSearch();
});
$("social-search-results")?.addEventListener("click",async e=>{
  const messageBtn=e.target.closest("[data-message-username]");if(messageBtn){openDirectMessage(messageBtn.dataset.messageUsername);return;}
  const view=e.target.closest("[data-profile-uid]");if(view){openPublicProfile(view.dataset.profileUid);return;}
  const btn=e.target.closest("[data-follow-uid]");if(!btn)return;
  if(!currentUser||isAdmin){openSocialAuth("login");return;}
  const target=btn.dataset.followUid;if(target===currentUser.uid)return;
  const followId=currentUser.uid+"_"+target;
  try{
    const ref=doc(db,"follows",followId),snap=await getDoc(ref);
    if(snap.exists()){await deleteDoc(ref);btn.textContent="Follow";}
    else{await setDoc(ref,{followerUid:currentUser.uid,followingUid:target,createdAt:serverTimestamp()});btn.textContent="Following";}
  }catch(err){alert("Follow update failed: "+err.message);}
});

async function loadInbox(){
  if(!currentUser||isAdmin)return;
  try{
    const inboxSnap=await getDocs(query(messagesRef,where("participants","array-contains",currentUser.uid),limit(120)));
    const latest=new Map();
    inboxSnap.docs.forEach(d=>{
      const m=d.data(),other=m.senderUid===currentUser.uid?m.recipientUid:m.senderUid;
      const name=m.senderUid===currentUser.uid?m.recipientUsername:m.senderUsername;
      const previous=latest.get(other);
      if(!previous||(m.createdAt?.seconds||0)>(previous.createdAt?.seconds||0))latest.set(other,{uid:other,username:name||"creator",text:m.text||"",createdAt:m.createdAt});
    });
    const host=$("conversation-list");if(!host)return;
    host.innerHTML=[...latest.values()].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).map(c=>'<button class="conversation-item" type="button" data-chat-user="'+escapeHTML(c.username)+'"><span class="mini-avatar">'+escapeHTML(c.username.charAt(0).toUpperCase())+'</span><span><b>@'+escapeHTML(c.username)+'</b><small>'+escapeHTML(c.text)+'</small></span></button>').join("")||'<div class="empty-state">No messages yet. Search for a creator to start chatting.</div>';
  }catch(err){console.warn("Inbox load:",err);}
}
$("conversation-list")?.addEventListener("click",e=>{
  const item=e.target.closest("[data-chat-user]");if(item)openDirectMessage(item.dataset.chatUser);
});
async function openDirectMessage(username){
  if(!currentUser||isAdmin){openSocialAuth("login");return;}
  const clean=username.trim().replace(/^@/,"").toLowerCase();
  try{
    const snap=await getDocs(query(usersRef,where("username","==",clean),limit(1)));
    if(snap.empty){alert("Account not found.");return;}
    const target={uid:snap.docs[0].id,...snap.docs[0].data()};
    if(target.uid===currentUser.uid){alert("This is your own account.");return;}
    activeConversationUser=target;
    setActiveAppView("messages-view");
    $("chat-panel").innerHTML='<div class="chat-header"><span class="mini-avatar">'+escapeHTML((target.username||"S").charAt(0).toUpperCase())+'</span><b>@'+escapeHTML(target.username)+'</b></div><div class="chat-messages" id="chat-messages"></div><form class="chat-compose" id="chat-compose"><input id="chat-message-input" maxlength="2000" placeholder="Write a message..." autocomplete="off"><button type="submit">➤</button></form>';
    const participants=[currentUser.uid,target.uid].sort();
    const threadId=participants.join("_");
    if(activeChatUnsubscribe)activeChatUnsubscribe();
    activeChatUnsubscribe=onSnapshot(query(messagesRef,where("participants","array-contains",currentUser.uid),limit(100)),snap=>{
      const box=$("chat-messages");if(!box)return;
      box.innerHTML=snap.docs.map(d=>{const m=d.data();return '<div class="chat-bubble '+(m.senderUid===currentUser.uid?"own":"")+'">'+escapeHTML(m.text||"")+'</div>';}).join("");
      box.scrollTop=box.scrollHeight;
    },err=>console.warn("Message listener",err));
    $("chat-compose").addEventListener("submit",async ev=>{
      ev.preventDefault();const input=$("chat-message-input"),value=input.value.trim();if(!value)return;
      input.disabled=true;
      try{await addDoc(messagesRef,{threadId,participants:[currentUser.uid,target.uid],senderUid:currentUser.uid,recipientUid:target.uid,senderUsername:socialProfile?.username||"creator",recipientUsername:target.username||"creator",text:value,createdAt:serverTimestamp()});input.value="";}
      catch(err){alert("Message failed: "+err.message);}finally{input.disabled=false;input.focus();}
    });
  }catch(err){alert("Could not open chat: "+err.message);}
}
$("new-message-btn")?.addEventListener("click",()=>{const who=prompt("Enter username to message:");if(who)openDirectMessage(who);});
$("social-search-results")?.addEventListener("dblclick",e=>{
  const row=e.target.closest(".creator-result");const name=row?.querySelector("small")?.textContent?.replace("@","");
  if(name)openDirectMessage(name);
});

async function openProfileFromUrl(){
  const username=new URLSearchParams(location.search).get("user");
  if(!username)return;
  try{
    const snap=await getDocs(query(usersRef,where("username","==",username.toLowerCase()),limit(1)));
    if(!snap.empty)await openPublicProfile(snap.docs[0].id);
  }catch(err){console.warn("Shared profile link:",err);}
}
openProfileFromUrl();
