
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

  if (user && !isAdmin) {
    await signOut(auth);
    return;
  }

  if (isAdmin) {
    showAdminDashboard();
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


/* =========================================
   26. START WEBSITE
========================================= */

loadMovies();
