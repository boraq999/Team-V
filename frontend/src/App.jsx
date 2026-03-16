import { useState } from "react";
import { ToastProvider } from "./context/ToastContext";
import Navbar from "./components/Navbar";
import HostPanel from "./components/HostPanel";
import ClientPanel from "./components/ClientPanel";
import "./index.css";

const FEATURES = [
  { icon: "🔒", label: "End-to-End Encrypted" },
  { icon: "⚡", label: "Low Latency WebRTC" },
  { icon: "☁️", label: "Cloudflare Tunnel" },
  { icon: "🖱️", label: "Remote Control" },
  { icon: "💬", label: "Live Chat" },
  { icon: "🌐", label: "No Port Forwarding" },
];

function AppContent() {
  const [mode, setMode] = useState(null); // null | 'host' | 'client'

  const goBack = () => setMode(null);

  return (
    <div className="app">
      <Navbar serverOnline={true} />

      <main style={{ flex: 1 }}>
        {mode === null && (
          <>
            {/* Hero */}
            <section className="hero">
              <div className="hero-tag">
                <span>☁️</span> Powered by Cloudflare Tunnel
              </div>
              <h1 className="hero-title animate-fadeInUp">
                Remote Access,{" "}
                <span className="gradient-text">Reinvented</span>
              </h1>
              <p className="hero-subtitle animate-fadeInUp delay-1">
                Share your screen and control remote desktops securely — no VPN, no port forwarding, just a 6-character code.
              </p>

              {/* Mode Selection */}
              <div className="cards-grid animate-fadeInUp delay-2">
                <div
                  className="card"
                  id="card-host"
                  style={{ cursor: "pointer" }}
                  onClick={() => setMode("host")}
                >
                  <div className="card-icon purple">🖥️</div>
                  <h2 className="card-title">Host — Share Screen</h2>
                  <p className="card-desc">
                    Let someone else view and control your screen. A secure session code is generated instantly.
                  </p>
                  <button className="btn btn-primary btn-full" id="btn-mode-host">
                    <span>⚡</span> Start Hosting
                  </button>
                </div>

                <div
                  className="card"
                  id="card-client"
                  style={{ cursor: "pointer" }}
                  onClick={() => setMode("client")}
                >
                  <div className="card-icon green">🔗</div>
                  <h2 className="card-title">Client — Control Remote</h2>
                  <p className="card-desc">
                    Enter a session code to view and interact with a remote desktop in real time.
                  </p>
                  <button className="btn btn-success btn-full" id="btn-mode-client">
                    <span>🔗</span> Connect Now
                  </button>
                </div>
              </div>

              {/* Features Row */}
              <div className="features-row animate-fadeInUp delay-3">
                {FEATURES.map((f) => (
                  <div className="feature-item" key={f.label}>
                    <div className="feature-icon-wrap">{f.icon}</div>
                    <span className="feature-label">{f.label}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {mode === "host" && (
          <div style={{ maxWidth: 1400, margin: "48px auto", padding: "0 24px", width: "100%" }}>
            <button className="btn btn-ghost mb-2" onClick={goBack} id="btn-back-host" style={{ marginBottom: "16px" }}>
              ← Back
            </button>
            <HostPanel />
          </div>
        )}

        {mode === "client" && (
          <div style={{ maxWidth: 900, margin: "48px auto", padding: "0 24px" }}>
            <button className="btn btn-ghost mb-2" onClick={goBack} id="btn-back-client">
              ← Back
            </button>
            <ClientPanel />
          </div>
        )}
      </main>

      <footer className="footer">
        TeamVConnect — Secure remote access via Cloudflare Tunnel & WebRTC ·{" "}
        <span style={{ color: "var(--accent)" }}>Open Source</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
