import { useState, useEffect, useRef, useCallback } from "react";
import { useSocket } from "../hooks/useSocket";
import { useWebRTC } from "../hooks/useWebRTC";
import { useToast } from "../context/ToastContext";
import ChatPanel from "./ChatPanel";

export default function ClientPanel() {
  const { emit, on } = useSocket();
  const showToast = useToast();

  const [code, setCode] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | joining | connected
  const [chatMessages, setChatMessages] = useState([]);
  const [remoteStream, setRemoteStream] = useState(null);

  const videoRef = useRef(null);
  const containerRef = useRef(null);

  // Attach the stream whenever the video element mounts or stream changes
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, status]);

  const handleStream = useCallback((stream) => {
    setRemoteStream(stream);
    setStatus("connected");
    showToast("Connected! Remote screen is streaming.", "success");
  }, []);

  const { createPeer, createAnswer, setAnswer, addIceCandidate, close: closePeer, pc } = useWebRTC({
    onStream: handleStream,
  });

  // ── Socket events ─────────────────────────────────────────
  useEffect(() => {
    const offJoined = on("client:joined", ({ sessionId }) => {
      setSessionId(sessionId);
      setStatus("joining");
      showToast("Joined session! Waiting for host stream…", "info");
    });

    const offOffer = on("signal:offer", async ({ offer }) => {
      // If we already have a peer connection, just answer the new offer (renegotiation)
      let peer = pc.current;
      if (!peer) {
        peer = createPeer();
        peer.onicecandidate = (e) => {
          if (e.candidate && sessionId) {
            emit("signal:ice", { sessionId, candidate: e.candidate, from: "client" });
          }
        };
      }

      const answer = await createAnswer(offer);
      emit("signal:answer", { sessionId, answer });
    });

    const offIce = on("signal:ice", async ({ candidate }) => {
      await addIceCandidate(candidate);
    });

    const offChat = on("chat:message", ({ text, sender, time }) => {
      setChatMessages((prev) => [...prev, { text, sender, time }]);
    });

    const offEnded = on("session:ended", ({ reason }) => {
      showToast(reason, "error");
      disconnect();
    });

    const offError = on("error", ({ message }) => {
      showToast(message, "error");
      setStatus("idle");
    });

    return () => {
      [offJoined, offOffer, offIce, offChat, offEnded, offError].forEach(
        (fn) => typeof fn === "function" && fn()
      );
    };
  }, [on, sessionId]);

  // ── Join session ──────────────────────────────────────────
  const joinSession = () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      showToast("Please enter a valid session code.", "error");
      return;
    }
    emit("client:join", { sessionId: trimmed });
  };

  // ── Remote control ────────────────────────────────────────
  const sendControl = useCallback(
    (event) => {
      if (sessionId) emit("control:event", { sessionId, event });
    },
    [emit, sessionId]
  );

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    sendControl({ type: "mousemove", x, y });
  };

  const handleClick = (e) => {
    sendControl({ type: "click", button: e.button });
  };

  const handleKeyDown = (e) => {
    sendControl({ type: "keydown", key: e.key, code: e.code });
  };

  // ── Disconnect ────────────────────────────────────────────
  const disconnect = () => {
    closePeer();
    if (videoRef.current) videoRef.current.srcObject = null;
    setSessionId(null);
    setStatus("idle");
    setCode("");
    setRemoteStream(null);
    setChatMessages([]);
  };

  const sendChat = (text) => {
    if (!sessionId) return;
    emit("chat:message", { sessionId, text, sender: "Client" });
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {
        showToast("Fullscreen request failed", "error");
      });
    } else {
      document.exitFullscreen?.();
    }
  };

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════
  if (status === "idle") {
    return (
      <div className="card animate-fadeInUp delay-1">
        <div className="card-icon green">🔗</div>
        <h2 className="card-title">Connect to Remote</h2>
        <p className="card-desc">
          Enter the session code shared by the host to view and control their screen remotely.
        </p>
        <div className="input-group">
          <label className="input-label">Session Code</label>
          <input
            id="input-session-code"
            className="input"
            placeholder="e.g. A3BK9Z"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && joinSession()}
            maxLength={6}
            style={{ textAlign: "center", letterSpacing: "6px", fontSize: "22px", fontFamily: "'JetBrains Mono', monospace" }}
          />
        </div>
        <button
          id="btn-connect"
          className="btn btn-success btn-full"
          onClick={joinSession}
          disabled={code.length < 4}
        >
          <span>🔗</span> Connect
        </button>
      </div>
    );
  }

  if (status === "joining") {
    return (
      <div className="card animate-fadeIn">
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div className="spinner" style={{ margin: "0 auto 20px", width: 40, height: 40 }} />
          <h3 style={{ marginBottom: 8 }}>Connecting…</h3>
          <p className="text-muted text-sm">Waiting for host to start streaming</p>
        </div>
        <button className="btn btn-ghost btn-full" onClick={disconnect}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="session-header">
        <div className="session-info">
          <span className="status-badge connected">
            <span className="dot" /> Live — {sessionId}
          </span>
        </div>
        <div className="session-controls">
          <button className="btn btn-primary" onClick={toggleFullScreen}>
            📺 Fullscreen
          </button>
          <button className="btn btn-danger" onClick={disconnect} id="btn-disconnect">
            🔴 Disconnect
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="screen-container"
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        style={{ cursor: "crosshair" }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ width: "100%", height: "100%", background: "#000" }}
        />
      </div>

      <ChatPanel messages={chatMessages} onSend={sendChat} myName="Client" />
    </div>
  );
}
