const PROJECT_ID = "solexflix";
const DATABASE_ID = "default";
const FIREBASE_API_KEY = "AIzaSyAgMHEBvkCJwmFKN1NMjeswON3njJozRLI";
const SITE_NAME = "SolexFLIX";

function decodeValue(value = {}) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}
function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}
async function getMovies() {
  const all = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/movies`);
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("key", FIREBASE_API_KEY);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Firestore returned ${response.status}`);
    const data = await response.json();
    for (const doc of data.documents || []) {
      const id = doc.name.split("/").pop();
      all.push({ id, ...decodeFields(doc.fields || {}) });
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return all;
}
function slugify(value = "") {
  return String(value).toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 80) || "movie";
}
function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function absolute(value, base) {
  try { const u = new URL(value, base); return /^https?:$/.test(u.protocol) ? u.href : ""; }
  catch { return ""; }
}
function replaceMeta(html, movie, canonical) {
  const title = `${movie.title || "Movie"} (${movie.year || ""}) | SolexFLIX`.replace(/\s+\|/g, " |");
  const description = String(movie.description || `Explore ${movie.title || "this movie"} on SolexFLIX.`).replace(/\s+/g, " ").slice(0, 300);
  const poster = absolute(movie.poster || movie.posterUrl || "", canonical);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title || "Movie",
    description,
    dateCreated: movie.year ? String(movie.year) : undefined,
    image: poster || undefined,
    url: canonical
  };
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:type" content="video.movie">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    poster ? `<meta property="og:image" content="${esc(poster)}">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
  ].filter(Boolean).join("\n");
  let result = html.replace(/<title>[\s\S]*?<\/title>/i, "");
  result = result.replace(/<link[^>]+rel=["']canonical["'][^>]*>/i, "");
  result = result.replace(/<meta[^>]+name=["']description["'][^>]*>/i, "");
  result = result.replace(/<meta[^>]+property=["']og:[^"']+["'][^>]*>/gi, "");
  result = result.replace(/<meta[^>]+name=["']twitter:[^"']+["'][^>]*>/gi, "");
  result = result.replace(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i, "");
  result = result.replace("</head>", tags + "\n</head>");
  const article = `<article id="server-movie-content" style="max-width:1100px;margin:24px auto;padding:20px;color:#fff;background:#111;border-radius:10px">
    ${poster ? `<img src="${esc(poster)}" alt="${esc(movie.title || "Movie poster")}" style="max-width:220px;width:42%;height:auto;float:left;margin:0 20px 14px 0;border-radius:8px">` : ""}
    <h1>${esc(movie.title || "Movie")}</h1>
    <p>${esc([movie.year, movie.category, movie.rating ? "Rating " + movie.rating : ""].filter(Boolean).join(" • "))}</p>
    <p>${esc(description)}</p><div style="clear:both"></div></article>`;
  result = result.replace('<main id="website-section">', '<main id="website-section">' + article);
  return result;
}
async function htmlResponse(request, env, movie) {
  const assetUrl = new URL("/index.html", request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (!asset.ok) return asset;
  const html = await asset.text();
  const slug = slugify(movie.title);
  const canonical = new URL(`/movie/${encodeURIComponent(movie.id)}/${slug}`, request.url).href;
  return new Response(replaceMeta(html, movie, canonical), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" }
  });
}
async function sitemapResponse(request) {
  const movies = await getMovies();
  const origin = new URL(request.url).origin;
  const urls = [`<url><loc>${origin}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`];
  for (const movie of movies) {
    urls.push(`<url><loc>${origin}/movie/${encodeURIComponent(movie.id)}/${slugify(movie.title)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
  }
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" }
  });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    try {
      if (url.pathname === "/sitemap.xml") return await sitemapResponse(request);
      const match = url.pathname.match(/^\/movie\/([^/]+)\/([^/]+)\/?$/);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const movies = await getMovies();
        const movie = movies.find(item => item.id === id);
        if (!movie) return new Response("Movie not found", { status: 404 });
        return await htmlResponse(request, env, movie);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("SolexFLIX SEO Worker error:", error);
      if (url.pathname === "/sitemap.xml") {
        return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }
  }
};
