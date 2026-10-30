import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Speaking } from "./pages/Speaking";
import { Writing } from "./pages/Writing";
import { Reading } from "./pages/Reading";
import { Listening } from "./pages/Listening";
import { Progress } from "./pages/Progress";
import { api } from "./lib/api";

function KeyBanner() {
  const [state, setState] = useState<"loading" | "ok" | "nokey" | "down">("loading");
  useEffect(() => {
    api
      .health()
      .then((h) => setState(h.keyConfigured ? "ok" : "nokey"))
      .catch(() => setState("down"));
  }, []);

  if (state === "ok" || state === "loading") return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
      {state === "nokey"
        ? "⚠ No ANTHROPIC_API_KEY on the server. Copy ielts-app/.env.example to .env, add your key, and restart."
        : "⚠ Can’t reach the backend. Make sure it’s running (npm run dev)."}
    </div>
  );
}

export default function App() {
  return (
    <>
      <KeyBanner />
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/speaking" element={<Speaking />} />
          <Route path="/writing" element={<Writing />} />
          <Route path="/reading" element={<Reading />} />
          <Route path="/listening" element={<Listening />} />
          <Route path="/progress" element={<Progress />} />
        </Routes>
      </Layout>
    </>
  );
}
