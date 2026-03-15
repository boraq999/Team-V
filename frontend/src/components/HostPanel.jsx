import { useState, useEffect, useRef } from "react";
import { useSocket } from "../hooks/useSocket";
import { useWebRTC } from "../hooks/useWebRTC";
import { useToast } from "../context/ToastContext";
import ChatPanel from "./ChatPanel";

export default function HostPanel() {
  const { emit, on } = useSocket();
  const showToast = useToast();

  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | waiting | connected | capturing
  const [isCapturing, setIsCapturing] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const dataChannelRef = useRef(null);

  const { createPeer, addStream, createOffer, setAnswer, addIceCandidate, close: closePeer, pc } =
    useWebRTC({ onStream: null });

  // ── Socket events ─────────────────────────────────────────
  useEffect(() => {
    const offCreated = on("host:session-created", ({ sessionId }) => {
      setSessionId(sessionId);
      setStatus("waiting");
      showToast("Session created! Share your code.", "success");
    });

    const offJoined = on("host:client-joined", async ({ sessionId }) => {
      setStatus("connected");
      showToast("Client connected! Starting stream...", "success");
      await startOffer(sessionId);
    });

    const offAnswer = on("signal:answer", async ({ answer }) => {
      await setAnswer(answer);
    });

    const offIce = on("signal:ice", async ({ candidate }) => {
      await addIceCandidate(candidate);
    });

    const offControl = on("control:event", ({ event }) => {
      handleRemoteControl(event);
    });

    const offChat = on("chat:message", ({ text, sender, time }) => {
      setChatMessages((prev) => [...prev, { text, sender, time }]);
    });

    const offEnded = on("session:ended", ({ reason }) => {
      showToast(reason, "error");
      endSession();
    });

    const offError = on("error", ({ message }) => {
      showToast(message, "error");
    });

    return () => {
      [offCreated, offJoined, offAnswer, offIce, offControl, offChat, offEnded, offError].forEach(
        (fn) => typeof fn === "function" && fn()
      );
    };
  }, [on]);

  // ── Create session ────────────────────────────────────────
  const createSession = () => {
    emit("host:create");
  };

  // ── Start screen share & WebRTC offer ────────────────────
  const startCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: "always" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCapturing(true);

      // CRITICAL: if a client is already connected, add the stream now
      if (pc.current && pc.current.iceConnectionState !== "closed") {
        console.log("[Host] Adding tracks to existing peer...");
        stream.getTracks().forEach((track) => pc.current.addTrack(track, stream));
        
        // Renegotiate
        const offer = await createOffer();
        emit("signal:offer", { sessionId, offer });
      }

      showToast("Screen capture started", "info");

      stream.getVideoTracks()[0].addEventListener("ended", () => {
        setIsCapturing(false);
        showToast("Screen sharing stopped", "info");
      });
    } catch (err) {
      showToast("Screen capture failed: " + err.message, "error");
    }
  };

  const startOffer = async (sid) => {
    const peerConn = createPeer();

    // Data channel for control events
    const dc = peerConn.createDataChannel("control");
    dataChannelRef.current = dc;

    // Add stream if already capturing
    if (streamRef.current) addStream(streamRef.current);

    // ICE candidates
    peerConn.onicecandidate = (e) => {
      if (e.candidate) {
        emit("signal:ice", { sessionId: sid, candidate: e.candidate, from: "host" });
      }
    };

    const offer = await createOffer();
    emit("signal:offer", { sessionId: sid, offer });
  };

  // ── Remote control handler ────────────────────────────────
  const handleRemoteControl = (event) => {
    // In Electron/desktop agent this would trigger real mouse/keyboard
    console.log("[Remote Control]", event);
  };

  // ── End session ───────────────────────────────────────────
  const endSession = () => {
    closePeer();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setSessionId(null);
    setStatus("idle");
    setIsCapturing(false);
    setChatMessages([]);
  };

  const sendChat = (text) => {
    if (!sessionId) return;
    emit("chat:message", { sessionId, text, sender: "Host" });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(sessionId);
    showToast("Code copied to clipboard!", "success");
  };

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════
  if (status === "idle") {
    return (
      <div className="card animate-fadeInUp">
        <div className="card-icon purple">🖥️</div>
        <h2 className="card-title">Share Your Screen</h2>
        <p className="card-desc">
          Create a session and share the code with whoever needs to connect to your device remotely.
        </p>
        <button className="btn btn-primary btn-full" onClick={createSession} id="btn-create-session">
          <span>⚡</span> Create Session
        </button>
      </div>
    );
  }

  return (
    <div className="card animate-fadeIn">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 className="card-title" style={{ margin: 0 }}>Your Session</h2>
        <span className={`status-badge ${status === "connected" ? "connected" : "waiting"}`}>
          <span className="dot" />
          {status === "connected" ? "Client Connected" : "Waiting for client…"}
        </span>
      </div>

      <div className="session-code-box">
        <div className="session-code-label">Your Session Code</div>
        <div className="session-code">{sessionId}</div>
        <div className="session-code-hint">Share this code with the remote user</div>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: 16 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={copyCode} id="btn-copy-code">
          📋 Copy Code
        </button>
        {!isCapturing ? (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={startCapture} id="btn-start-capture">
            🎬 Share Screen
          </button>
        ) : (
          <span className="status-badge connected" style={{ flex: 1, justifyContent: "center" }}>
            <span className="dot" /> Streaming
          </span>
        )}
      </div>

      {/* Local preview */}
      {isCapturing && (
        <div className="screen-container" style={{ marginBottom: 16 }}>
          <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%" }} />
        </div>
      )}

      <button className="btn btn-danger btn-full" onClick={endSession} id="btn-end-session">
        🔴 End Session
      </button>

      {status === "connected" && (
        <ChatPanel messages={chatMessages} onSend={sendChat} myName="Host" />
      )}
    </div>
  );
}
