import { useState, useEffect, useRef } from "react";
import { useSocket } from "../hooks/useSocket";
import { useToast } from "../context/ToastContext";
import ChatPanel from "./ChatPanel";
import FilesPanel from "./FilesPanel";

export default function HostPanel() {
  const { emit, on } = useSocket();
  const showToast = useToast();

  const [sessionId, setSessionId] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | waiting | connected | capturing
  const [controlMode, setControlMode] = useState("control");
  const [isCapturing, setIsCapturing] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef(new Map()); // Map<clientId, RTCPeerConnection>
  const dataChannelsRef = useRef(new Map()); // Map<clientId, RTCDataChannel>

  // ── Auto-attach stream to video tag to prevent black screen on re-renders ──
  useEffect(() => {
    let timeout;
    const attach = () => {
      if (isCapturing && videoRef.current && streamRef.current) {
        if (videoRef.current.srcObject !== streamRef.current) {
          console.log("[Host] Attaching local stream to video tag...");
          videoRef.current.srcObject = streamRef.current;
        }
      }
    };
    
    attach();
    // Double check after a small delay because React might be mounting the video tag
    timeout = setTimeout(attach, 100);
    return () => clearTimeout(timeout);
  }, [isCapturing, status]); // Run when capturing state or status changes

  // ── Socket events ─────────────────────────────────────────
  useEffect(() => {
    const offCreated = on("host:session-created", ({ sessionId }) => {
      setSessionId(sessionId);
      setStatus("waiting");
      showToast("Session created! Share your code.", "success");
    });

    const offJoined = on("host:client-joined", async ({ sessionId, clientId }) => {
      // If we are waiting, move to connected status
      setStatus("connected");
      setChatMessages(prev => [...prev, { sender: "System", text: `User ${clientId.substring(0,4)} joined the session`, time: Date.now() }]);
      showToast(`Client ${clientId.substring(0, 4)} connected!`, "success");
      await startOffer(sessionId, clientId);
    });

    const offAnswer = on("signal:answer", async ({ answer, clientId }) => {
      const pc = peersRef.current.get(clientId);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    const offIce = on("signal:ice", async ({ candidate, clientId }) => {
      const pc = peersRef.current.get(clientId);
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    const offLeft = on("host:client-left", ({ clientId }) => {
      const pc = peersRef.current.get(clientId);
      if (pc) pc.close();
      peersRef.current.delete(clientId);
      dataChannelsRef.current.delete(clientId);
      setChatMessages(prev => [...prev, { sender: "System", text: `User ${clientId.substring(0,4)} left the session`, time: Date.now() }]);
      showToast(`Client ${clientId.substring(0, 4)} left`, "info");
      
      // If no more clients, go back to waiting (but keep stream active)
      if (peersRef.current.size === 0) setStatus("waiting");
    });

    const offControl = on("control:event", ({ event }) => {
      handleRemoteControl(event);
    });

    const offChat = on("chat:message", ({ text, sender, time }) => {
      setChatMessages((prev) => [...prev, { text, sender, time }]);
    });

    const offFile = on("file:share", (fileObj) => {
      setSharedFiles((prev) => [...prev, fileObj]);
    });

    const offEnded = on("session:ended", ({ reason }) => {
      showToast(reason, "error");
      endSession();
    });

    const offError = on("error", ({ message }) => {
      showToast(message, "error");
    });

    return () => {
      [offCreated, offJoined, offAnswer, offIce, offLeft, offControl, offChat, offFile, offEnded, offError].forEach(
        (fn) => typeof fn === "function" && fn()
      );
    };
  }, [on]);

  // ── Create session ────────────────────────────────────────
  const createSession = () => {
    emit("host:create", { mode: controlMode });
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

      // CRITICAL: if clients are already connected, add the stream now
      for (const [clientId, pc] of peersRef.current) {
        if (pc.iceConnectionState !== "closed") {
          console.log(`[Host] Adding tracks to peer ${clientId}...`);
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          
          // Renegotiate
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          emit("signal:offer", { sessionId, offer, targetClientId: clientId });
        }
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

  const switchScreen = async () => {
    try {
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: "always" },
        audio: false,
      });

      // Stop old tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      streamRef.current = newStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      // Replace tracks for all connected peers
      for (const [clientId, pc] of peersRef.current) {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === "video");
        
        if (videoSender) {
          console.log(`[Host] Replacing video track for client ${clientId}...`);
          await videoSender.replaceTrack(newVideoTrack);
        } else {
          // If for some reason there was no sender (e.g. capture was stopped), re-add
          newStream.getTracks().forEach(track => pc.addTrack(track, newStream));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          emit("signal:offer", { sessionId, offer, targetClientId: clientId });
        }
      }

      // Notify all clients that the stream has been updated (helps with black screen issues)
      emit("host:stream-updated", { sessionId });

      showToast("Screen switched successfully", "success");

      newVideoTrack.addEventListener("ended", () => {
        setIsCapturing(false);
        showToast("Screen sharing stopped", "info");
      });

    } catch (err) {
      showToast("Switch screen failed: " + err.message, "error");
    }
  };

  const startOffer = async (sid, clientId) => {
    // Manually create PeerConnection because useWebRTC handles only 1
    const pc = new RTCPeerConnection({
       iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
       bundlePolicy: "max-bundle",
       rtcpMuxPolicy: "require",
       sdpSemantics: "unified-plan"
    });

    peersRef.current.set(clientId, pc);

    // Data channel for control events (optional usage here)
    const dc = pc.createDataChannel("control");
    dataChannelsRef.current.set(clientId, dc);

    // Add stream if already capturing
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => pc.addTrack(track, streamRef.current));
    }

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        emit("signal:ice", { sessionId: sid, candidate: e.candidate, from: "host", target: clientId });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    emit("signal:offer", { sessionId: sid, offer, targetClientId: clientId });
  };

  // ── Remote control handler ────────────────────────────────
  const handleRemoteControl = async (event) => {
    // Quality adjustment request from client
    if (event.type === "quality" && streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        try {
          if (event.value === "high") {
            await videoTrack.applyConstraints({ frameRate: { max: 60 }, width: { max: 1920 }, height: { max: 1080 } });
            showToast("Client requested HIGH quality", "info");
          } else if (event.value === "low") {
            await videoTrack.applyConstraints({ frameRate: { max: 15 }, width: { max: 854 }, height: { max: 480 } });
            showToast("Client requested LOW quality", "info");
          } else {
            await videoTrack.applyConstraints({ frameRate: { max: 30 }, width: { max: 1280 }, height: { max: 720 } });
            showToast("Client requested MEDIUM quality", "info");
          }
        } catch (e) {
          console.error("Failed to apply constraints:", e);
        }
      }
    }
  };

  // ── End session ───────────────────────────────────────────
  const endSession = () => {
    // Close all peers
    for (const [clientId, pc] of peersRef.current.entries()) {
        pc.close();
    }
    peersRef.current.clear();
    dataChannelsRef.current.clear();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setSessionId(null);
    setStatus("idle");
    setIsCapturing(false);
    setChatMessages([]);
    setSharedFiles([]);
  };

  const sendChat = (text) => {
    if (!sessionId) return;
    emit("chat:message", { sessionId, text, sender: "Host" });
  };

  const handleFileUpload = (fileObj) => {
    if (!sessionId) return;
    emit("file:share", { sessionId, ...fileObj });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(sessionId);
    showToast("Code copied to clipboard!", "success");
  };

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════
  return (
    <div className="animate-fadeIn" style={{ display: "flex", gap: "24px", maxWidth: "1400px", margin: "0 auto", alignItems: "stretch", minHeight: "75vh", width: "100%" }}>
      
      {/* Sidebar Area - Fixed Width for PC */}
      <div className="card" style={{ flex: "0 0 380px", display: "flex", flexDirection: "column", overflowY: "auto", maxHeight: "80vh" }}>
        {status === "idle" ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div className="card-icon purple">🖥️</div>
              <h2 className="card-title">Host Controls</h2>
              <p className="card-desc">Welcome to Team V Desktop Agent.<br/>Select session type and start hosting your machine.</p>
            
              <div className="input-group" style={{ marginTop: "auto", marginBottom: "20px" }}>
                <label className="input-label">Session Mode</label>
                <select className="input" style={{ cursor: "pointer" }} value={controlMode} onChange={(e) => setControlMode(e.target.value)}>
                  <option value="control">🎮 Full Control</option>
                  <option value="view">👁️ View Only</option>
                </select>
              </div>
              <button className="btn btn-primary btn-full" onClick={createSession} id="btn-create-session">
                <span>⚡</span> Create Session
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 className="card-title" style={{ margin: 0, fontSize: "16px" }}>
                Details
                {controlMode === "view" && <span style={{ fontSize: "11px", background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: "12px", marginLeft: "8px", verticalAlign: "middle" }}>👁️ View Only</span>}
              </h2>
              <span className={`status-badge ${status === "connected" ? "connected" : "waiting"}`}>
                <span className="dot" />
                {status === "connected" ? `${peersRef.current.size} Clients` : "Waiting"}
              </span>
            </div>

            <div className="session-code-box" style={{ padding: "16px", marginBottom: "16px" }}>
              <div className="session-code-label">Session Code</div>
              <div className="session-code" style={{ fontSize: "32px", letterSpacing: "6px" }}>{sessionId}</div>
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
                <button className="btn btn-primary" style={{ flex: 1, background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }} onClick={switchScreen} id="btn-switch-screen">
                  🔄 Switch Screen
                </button>
              )}
            </div>

            <button className="btn btn-danger btn-full" onClick={endSession} id="btn-end-session" style={{ marginBottom: status === "connected" ? 20 : 0 }}>
              🔴 End Session
            </button>

            {status === "connected" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
                <ChatPanel messages={chatMessages} onSend={sendChat} myName="Host" allowFiles={false} />
                <FilesPanel files={sharedFiles} onUpload={handleFileUpload} allowUpload={true} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Area - Big screen for desktop focus */}
      <div className="card" style={{ flex: "1", padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.2)" }}>
          <h2 className="card-title" style={{ margin: 0, fontSize: "16px" }}>
            {status === "idle" ? "System View" : "Live Preview"}
          </h2>
        </div>
        <div style={{ padding: "20px", background: "var(--bg-primary)", flex: 1, display: "flex", position: "relative" }}>
          {status === "idle" ? (
             <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg-secondary)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
               <div style={{ fontSize: "64px", marginBottom: "24px", opacity: 0.3 }}>🖥️</div>
               <p style={{ color: "var(--text-muted)", fontSize: "18px", fontWeight: "500" }}>System is Ready.</p>
               <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "8px" }}>Configure your session from the side panel to proceed.</p>
             </div>
          ) : (
            <div className="screen-container" style={{ width: "100%", height: "100%", borderRadius: "8px", overflow: "hidden", display: isCapturing ? "block" : "none" }}>
              <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
            </div>
          )}
          
          {status !== "idle" && !isCapturing && (
            <div className="screen-container" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#06090e", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <div style={{ textAlign: "center" }}>
                 <div style={{ fontSize: "40px", marginBottom: "16px", opacity: 0.5 }}>⏸️</div>
                 <p style={{ color: "var(--text-muted)", fontSize: "16px" }}>Screen recording stopped.</p>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
