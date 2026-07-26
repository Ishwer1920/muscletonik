import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabaseWithRetry } from "./config/db.js";
import { initProductCatalog } from "./services/seed.service.js";
import { seedAdminUser } from "./services/admin.seed.js";

const server = createServer(app);

// Seeding runs on every (re)connect, so a database that appears late still gets
// initialized. Both seeders are idempotent.
async function initializeData() {
  const catalog = await initProductCatalog();
  console.log(catalog.seeded ? `Seeded ${catalog.count} products` : `Products present (${catalog.count}); migrated ${catalog.migrated} legacy row(s)`);
  const admin = await seedAdminUser();
  console.log(admin.created ? `Admin account created: ${admin.email}` : `Admin account present: ${admin.email}`);
  console.log("MongoDB connected.");
}

connectDatabaseWithRetry({
  onConnected: initializeData,
  onError: (err, attempt, delay) => {
    console.error(
      `MongoDB connection failed (attempt ${attempt}): ${err.message}\n` +
      `  -> The API cannot read or write until this succeeds; requests will fail.\n` +
      `  -> Check that MongoDB is running and MONGODB_URI is correct (${env.mongoUri}).\n` +
      `  -> Retrying in ${Math.round(delay / 1000)}s.`
    );
  }
});

server.listen(env.port, () => {
  console.log(`Muscle Tonik API listening on http://localhost:${env.port}`);
});
