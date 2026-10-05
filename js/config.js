// Frontend + API are served from the SAME origin in production: the Django app
// serves both the HTML pages and the /api on one domain (VPS deploy), so no
// override is needed — getApiBase() falls through to window.location.origin +
// "/api" automatically. On localhost the override also stays unset, so data.js
// auto-detects the backend on port 4000.
//
// To split the API onto a different host instead (e.g. frontend on one domain,
// API on another), set the override below to that URL, e.g.:
//   if (location.hostname !== "localhost") window.MT_API_BASE_OVERRIDE = "https://api.example.com/api";
(function () {
  // same-origin by default — nothing to force.
})();
