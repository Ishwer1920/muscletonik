/* ===========================================================
   MUSCLE TONIK — static front-end server

   Hostinger runs this site as an Express web app whose root directory is
   muscle_tonik_2/server, so something has to live here. That used to be the
   full Node backend; the API moved to Django on the VPS
   (api.muscletonik.com) and this is all that remains: serve the pages.

   Deliberately has no database, no API routes and no secrets. The storefront
   talks to the Django API directly — see js/config.js.
   =========================================================== */
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Hostinger deploys ONLY the configured root directory (muscle_tonik_2/server)
// and discards everything above it, so the site files are shipped inside that
// folder and sit one level up from this file.
const ROOT = path.resolve(__dirname, "..");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

// Never let the deployment bundle hand out server-side files.
app.use((req, res, next) => {
  if (/^\/(server|server_django|\.git|\.env)/i.test(req.path)) {
    return res.status(404).send("Not found");
  }
  next();
});

app.use(express.static(ROOT, {
  extensions: ["html"],
  // Hashed assets change name; HTML must revalidate so an edit shows up.
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
  }
}));

// Any unknown path falls back to the homepage rather than a bare 404.
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, "index.html")));

app.listen(PORT, () => console.log(`Muscle Tonik front-end listening on ${PORT}`));
