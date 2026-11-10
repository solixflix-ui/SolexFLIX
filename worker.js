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
  return String(input).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}
async function getMovies() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}/documents/movies?pageSize=1000&key=${API_KEY}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Firestore returned " + response.status);
  const data = await response.json();
  return (data.documents || []).map((doc) => {
    const fields = doc.fields || {};
    return {
      id: doc.name.split("/").pop(),
      title: value(fields.title) || "Movie",
      description: value(fields.description) || "Explore this title on SolexFLIX.",
      year: value(fields.year),
      poster: value(fields.poster) || value(fields.posterUrl),
      updatedAt: fields.updatedAt?.timestampValue || fields.createdAt?.timestampValue || ""
    };
  });
}
function xmlResponse(body, status = 200) {
  return new Response(body, { status, headers: {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff"
  }});
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/sitemap.xml") {
      try {
        const movies = await getMovies();
        const entries = [
          `<url><loc>${SITE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
          ...movies.map(movie => `<url><loc>${SITE}/?movie=${encodeURIComponent(movie.id)}</loc><changefreq>monthly</changefreq><priority>0.8</priority>${movie.updatedAt ? `<lastmod>${escapeXml(movie.updatedAt)}</lastmod>` : ""}</url>`)
        ];
        return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`);
      } catch (error) {
        return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><error>Sitemap temporarily unavailable</error>`, 503);
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
      const movies = await getMovies();
      const movie = movies.find(item => item.id === movieId);
      if (!movie) return assetResponse;
      const title = `${movie.title} (${movie.year || "Movie"}) | SolexFLIX`;
      const description = movie.description.slice(0, 300);
      let html = await assetResponse.text();
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
      html = html.replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(description)}">`);
      html = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${SITE}/?movie=${encodeURIComponent(movie.id)}">`);
      html = html.replace(/<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeHtml(title)}">`);
      html = html.replace(/<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeHtml(description)}">`);
      html = html.replace(/<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${SITE}/?movie=${encodeURIComponent(movie.id)}">`);
      if (movie.poster) html = html.replace("</head>", `<meta property="og:image" content="${escapeHtml(movie.poster)}"></head>`);
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