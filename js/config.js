// The deployed frontend talks to the production API on its own subdomain. Local
// dev must NOT: the prod API sends no Access-Control-Allow-Origin for a localhost
// page, so the browser blocks every response — hydrateCatalogFromApi() swallows
// the error and falls back to the 22-product seed list in data.js (no images, no
// auth). Leaving the override unset on localhost lets data.js auto-detect the
// backend on port 4000, which does send the right CORS headers.
(function () {
  var host = location.hostname;
  var isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  if (!isLocal) window.MT_API_BASE_OVERRIDE = "https://api.muscletonik.com/api";
})();
