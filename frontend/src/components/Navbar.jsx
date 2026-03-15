export default function Navbar({ serverOnline }) {
  return (
    <nav className="navbar">
      <a className="navbar-brand" href="/">
        <div className="navbar-logo">🖥️</div>
        <span className="navbar-title">TeamVConnect</span>
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span className="navbar-badge">
          {serverOnline ? "🟢 Cloudflare Ready" : "⚡ Local Mode"}
        </span>
        <div className="status-dot" />
      </div>
    </nav>
  );
}
