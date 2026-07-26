import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("strictQuery", true);

export async function connectDatabase() {
  if (!env.mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (mongoose.connection.readyState === 1) return mongoose.connection;

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 5000
  });

  return mongoose.connection;
}

// Mongoose only auto-reconnects after a first successful connection. If the
// very first connect fails (typically: mongod not up yet), nothing retries and
// the process stays up forever with every query buffering until it times out —
// a server that answers requests but can never read or write. Retry until the
// database appears so a late-starting mongod heals itself.
export function connectDatabaseWithRetry({ onConnected, onError } = {}) {
  let attempt = 0;

  const tryConnect = async () => {
    attempt += 1;
    try {
      await connectDatabase();
      attempt = 0;
      if (onConnected) await onConnected();
    } catch (err) {
      // Back off 2s, 4s, 8s … capped at 30s.
      const delay = Math.min(2000 * 2 ** (attempt - 1), 30000);
      if (onError) onError(err, attempt, delay);
      setTimeout(tryConnect, delay).unref?.();
    }
  };

  return tryConnect();
}
