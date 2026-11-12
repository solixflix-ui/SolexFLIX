const SITE = "https://tight-salad-0c51.solixflix-2a3.workers.dev";
const PROJECT = "solexflix";
const DATABASE = "default";
const API_KEY = "AIzaSyAgMHEbvkCJwmFKN1NMjeswON3njJozRLI";

function value(field) {
  if (!field) return "";
  return field.stringValue ?? field.integerValue ?? field.doubleValue ?? field.booleanValue ?? "";
}
function escapeXml(input) {
  return String(input).replace(/[<>&'"\u0000-\u001f]/g, (c) => ({
    "<":"&lt;", ">":"&gt;", "&":"&amp;", "'":"&apos;", '"':"&quot;"
  }[c] || ""));
}
function escapeHtml(input) {
  return String(input).replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}


let cachedAccessToken = "";
let tokenExpiresAt = 0;

function base64url(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(env) {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) return cachedAccessToken;
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new Error("Missing Cloudflare secret FIREBASE_SERVICE_ACCOUNT");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claim;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + "." + base64url(new Uint8Array(signature));
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error("Google OAuth token error: " + (result.error_description || result.error || response.status));
  }
  cachedAccessToken = result.access_token;
  tokenExpiresAt = Date.now() + (Number(result.expires_in || 3600) * 1000);
  return cachedAccessToken;
}

async function getMovies(env) {
  const documents = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) params.set("pageToken", pageToken);
    const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents/movies?${params.toString()}`;
    const accessToken = await getAccessToken(env);
    const response = await fetch(endpoint, { headers: { Accept: "application/json", Authorization: "Bearer " + accessToken } });
    if (!response.ok) {
      let detail = "";
      try {
        const errorData = await response.json();
        detail = errorData.error?.message || JSON.stringify(errorData);
      } catch {
        detail = await response.text().catch(() => "");
      }
      throw new Error("Firestore HTTP " + response.status + (detail ? ": " + detail : ""));
    }
    const data = await response.json();
    documents.push(...(data.documents || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return documents.map((doc) => {
    const fields = doc.fields || {};
    return {
      id: doc.name.split("/").pop(),
      title: value(fields.title) || value(fields.movieTitle) || value(fields.movieName) || "Movie",
      description: value(fields.description) || "Explore this title on SolexFLIX.",
      year: value(fields.year),
      poster: value(fields.poster) || value(fields.posterUrl),
      category: value(fields.category) || value(fields.genre) || "",
      rating: value(fields.rating) || "",
      ratingCount: value(fields.ratingCount) || value(fields.reviewCount) || "",
      updatedAt: fields.updatedAt?.timestampValue || fields.createdAt?.timestampValue || ""
    };
  });
}

async function traktJson(path, env) {
  if (!env.TRAKT_CLIENT_ID) throw new Error("Trakt Client ID is not configured in the Worker.");
  const response = await fetch("https://api.trakt.tv" + path, {
    headers: {
      "trakt-api-version": "2",
      "trakt-api-key": env.TRAKT_CLIENT_ID,
      "Content-Type": "application/json",
      "User-Agent": "SolexFLIX/1.0"
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = body.error_description || body.message || body.error || response.statusText || "Unknown response";
    throw new Error("Trakt API HTTP " + response.status + ": " + String(details).slice(0, 220));
  }
  return body;
}
async function normalizeTraktItems(items, type, env) {
  const imageValue = (value) => {
    if (Array.isArray(value)) return value[0] || "";
    if (value && typeof value === "object") return value.full || value.medium || value.thumb || "";
    return typeof value === "string" ? value : "";
  };
  const normalizedItems = await Promise.all((Array.isArray(items) ? items : []).map(async (entry) => {
    const isShow = !!entry.show || type === "shows";
    let media = entry.movie || entry.show || entry;
    let images = media.images || {};
    // Trending/search list payloads can contain stale embedded media without artwork.
    // Hydrate only missing-poster items from their Trakt summary endpoint.
    if (!imageValue(images.poster) && media.ids?.trakt) {
      try {
        const fresh = await traktJson("/" + (isShow ? "shows/" : "movies/") + encodeURIComponent(media.ids.trakt) + "?extended=full", env);
        if (fresh && fresh.title) {
          media = fresh;
          images = media.images || {};
        }
      } catch (error) {
        // Keep the available metadata if artwork hydration is temporarily unavailable.
      }
    }
    return {
      type: isShow ? "show" : "movie",
      title: media.title || "",
      year: media.year || "",
      slug: media.ids?.slug || "",
      rating: media.rating || 0,
      overview: media.overview || "",
      poster: imageValue(images.poster) || imageValue(images.thumb) || imageValue(images.fanart),
      backdrop: imageValue(images.fanart)
    };
  }));
  return normalizedItems.filter((item) => item && item.title);
}
function jsonResponse(data, status = 200, cache = 60) {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=" + cache,
    "X-Content-Type-Options": "nosniff"
  }});
}

function xmlResponse(body, status = 200) {
  return new Response(body, { status, headers: {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=60",
    "X-Content-Type-Options": "nosniff"
  }});
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/trakt/discover" || url.pathname === "/api/trakt/search") {
      try {
        const type = url.searchParams.get("type") === "shows" ? "shows" : "movies";
        const query = String(url.searchParams.get("q") || "").trim().slice(0, 100);
        const page = Math.min(100, Math.max(1, Number(url.searchParams.get("page") || 1) || 1));
        const limit = url.pathname.endsWith("/search") ? 20 : 12;
        const pagination = new URLSearchParams({ page: String(page), limit: String(limit), extended: "full" });
        let path;
        if (url.pathname.endsWith("/search")) {
          if (query.length < 2) return jsonResponse({ error: "Enter at least 2 characters." }, 400, 0);
          pagination.set("query", query);
          path = "/search/" + (type === "shows" ? "show" : "movie") + "?" + pagination.toString();
        } else path = "/" + type + "/trending?" + pagination.toString();
        const data = await traktJson(path, env);
        const results = await normalizeTraktItems(data, type, env);
        return jsonResponse({ results, page, hasMore: Array.isArray(data) && data.length === limit }, 200, 60);
      } catch (error) {
        return jsonResponse({ error: error.message || "Trakt service unavailable." }, 502, 0);
      }
    }
    if (url.pathname === "/api/trakt/image") {
      const raw = url.searchParams.get("url") || "";
      try {
        const imageUrl = new URL(raw);
        if (imageUrl.protocol !== "https:" || !/(^|\.)trakt\.tv$/i.test(imageUrl.hostname)) {
          return new Response("Invalid image host", { status: 400 });
        }
        const cache = caches.default;
        const cacheKey = new Request(imageUrl.toString(), { method: "GET" });
        let imageResponse = await cache.match(cacheKey);
        if (!imageResponse) {
          const upstream = await fetch(imageUrl.toString(), { headers: { Accept: "image/webp,image/*" } });
          if (!upstream.ok) return new Response("Image unavailable", { status: upstream.status });
          const headers = new Headers(upstream.headers);
          headers.set("Cache-Control", "public, max-age=604800");
          headers.set("X-Content-Type-Options", "nosniff");
          imageResponse = new Response(upstream.body, { status: 200, headers });
          await cache.put(cacheKey, imageResponse.clone());
        }
        return imageResponse;
      } catch {
        return new Response("Invalid image URL", { status: 400 });
      }
    }
    if (url.pathname === "/sitemap.xml") {
      try {
        const movies = await getMovies(env);
        const entries = [
          `<url><loc>${SITE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
          ...movies.map(movie => `<url><loc>${SITE}/?movie=${encodeURIComponent(movie.id)}</loc><changefreq>monthly</changefreq><priority>0.8</priority>${movie.updatedAt ? `<lastmod>${escapeXml(movie.updatedAt)}</lastmod>` : ""}</url>`)
        ];
        return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown error";
        return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><error>${escapeXml("Sitemap unavailable: " + reason)}</error>`, 503);
      }
    }
    if (url.pathname === "/robots.txt") {
      return new Response(`User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" }
      });
    }
    const movieId = url.searchParams.get("movie");
    const assetResponse = await env.ASSETS.fetch(request);
    if (!movieId || url.pathname !== "/" || !assetResponse.ok) return assetResponse;
    try {
      const movies = await getMovies(env);
      const movie = movies.find(item => item.id === movieId);
      if (!movie) return assetResponse;
      const title = `${movie.title} (${movie.year || "Movie"}) | SolexFLIX`;
      const description = movie.description.slice(0, 300);
      const canonicalUrl = `${SITE}/?movie=${encodeURIComponent(movie.id)}`;
      const movieSchema = {
        "@context": "https://schema.org",
        "@type": "Movie",
        "name": movie.title,
        "description": description,
        "url": canonicalUrl,
        ...(movie.year ? { "dateCreated": String(movie.year) } : {}),
        ...(movie.poster ? { "image": movie.poster } : {}),
        ...(movie.category ? { "genre": movie.category } : {}),
        ...(movie.rating !== "" && Number(movie.ratingCount) > 0 ? { "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": String(movie.rating),
          "ratingCount": String(movie.ratingCount),
          "bestRating": "10"
        }} : {})
      };
      let html = await assetResponse.text();
      html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + escapeHtml(title) + "</title>");
      html = html.replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(description)}">`);
      html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${canonicalUrl}">`);
      html = html.replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeHtml(title)}">`);
      html = html.replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeHtml(description)}">`);
      html = html.replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${canonicalUrl}">`);
      if (movie.poster) html = html.replace("</head>", `<meta property="og:image" content="${escapeHtml(movie.poster)}"></head>`);
      html = html.replace("</head>", `<meta name="twitter:image" content="${escapeHtml(movie.poster || "")}"><script type="application/ld+json">${JSON.stringify(movieSchema).replace(/</g, "\\u003c")}</script></head>`);
      return new Response(html, { status: 200, headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=120",
        "X-Robots-Tag": "index, follow"
      }});
    } catch {
      return assetResponse;
    }
  }
};