const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 50 * 1024 * 1024, // 50MB limit for file sharing
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// { sessionId: { hostSocketId, clientSocketId | null, createdAt } }
const sessions = new Map();

// Generate a nice 6-char code
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// REST: get active session count
app.get("/api/stats", (req, res) => {
  res.json({ activeSessions: sessions.size });
});

io.on("connection", (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // ── HOST: create a session ──────────────────────────────────────────
  socket.on("host:create", ({ mode = "control" } = {}) => {
    const sessionId = generateCode();
    sessions.set(sessionId, {
      hostSocketId: socket.id,
      clientSocketIds: new Set(),
      sharedFiles: [], // Store file history for late joiners
      mode: mode,
      createdAt: Date.now(),
    });
    socket.join(sessionId);
    socket.emit("host:session-created", { sessionId });
    console.log(`[Session] Created: ${sessionId} by ${socket.id}`);
  });

  // ── CLIENT: join a session ──────────────────────────────────────────
  socket.on("client:join", ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (!session) {
      socket.emit("error", { message: "Session not found or expired." });
      return;
    }
    if (session.clientSocketIds.has(socket.id)) {
      socket.emit("error", { message: "Already joined." });
      return;
    }
    session.clientSocketIds.add(socket.id);
    socket.join(sessionId);
    // Notify host with the clientId so it can create a separate PeerConnection for them
    io.to(session.hostSocketId).emit("host:client-joined", { sessionId, clientId: socket.id });
    socket.emit("client:joined", { sessionId, clientId: socket.id });
    
    // Sync existing files to the new client
    if (session.sharedFiles.length > 0) {
      session.sharedFiles.forEach(file => {
        socket.emit("file:share", file);
      });
    }

    console.log(`[Session] Client joined: ${sessionId} | ID: ${socket.id}`);
  });

  // ── WebRTC Signaling relay ──────────────────────────────────────────
  socket.on("signal:offer", ({ sessionId, offer, targetClientId }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    io.to(targetClientId).emit("signal:offer", { offer });
  });

  socket.on("signal:answer", ({ sessionId, answer }) => {
    // Senders are always clients, send back to host with sender's ID
    const session = sessions.get(sessionId);
    if (!session) return;
    io.to(session.hostSocketId).emit("signal:answer", { answer, clientId: socket.id });
  });

  socket.on("signal:ice", ({ sessionId, candidate, from, target }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    const dest = from === "host" ? target : session.hostSocketId;
    io.to(dest).emit("signal:ice", { candidate, clientId: socket.id });
  });

  // ── Native OS remote control via nut-js ─────────────────────────────
  socket.on("control:event", async ({ sessionId, event }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    
    // Block system controls if session is view-only (allow quality changes)
    if (session.mode === "view" && event.type !== "quality") {
      return; 
    }

    // Also notify host UI if needed (host UI needs to know about 'quality' event)
    io.to(session.hostSocketId).emit("control:event", { event });

    // Try executing native controls (Since this server runs on the Host machine)
    try {
      const { mouse, keyboard, Point, Button, Key } = require("@nut-tree-fork/nut-js");
      const screenWidth = await require("@nut-tree-fork/nut-js").screen.width();
      const screenHeight = await require("@nut-tree-fork/nut-js").screen.height();

      if (event.type === "mousemove") {
        // x and y are fractions (0.0 to 1.0)
        const targetX = Math.floor(event.x * screenWidth);
        const targetY = Math.floor(event.y * screenHeight);
        await mouse.setPosition(new Point(targetX, targetY));
      } 
      else if (event.type === "click") {
        if (event.button === 0) await mouse.leftClick();
        if (event.button === 2) await mouse.rightClick();
      } 
      else if (event.type === "keydown") {
        // Basic keyboard mapping example (can be expanded)
        if (event.key === "Enter") await keyboard.type(Key.Enter);
        else if (event.key === "Backspace") await keyboard.type(Key.Backspace);
        else if (event.key.length === 1) await keyboard.type(event.key); // letter/number
      }
    } catch (err) {
       // Ignore if not running natively or error occurs
       console.log("Nut.js error:", err.message);
    }
  });

  // ── Chat messages ───────────────────────────────────────────────────
  socket.on("chat:message", ({ sessionId, text, sender }) => {
    io.to(sessionId).emit("chat:message", { text, sender, time: Date.now() });
  });

  // ── File Sharing ────────────────────────────────────────────────────
  socket.on("file:share", ({ sessionId, fileData, fileName, fileType }) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    const fileObj = { fileData, fileName, fileType, time: Date.now() };
    session.sharedFiles.push(fileObj); // Save to session history
    io.to(sessionId).emit("file:share", fileObj);
  });

  // ── Disconnect ──────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    // Handle client disconnect directly
    for (const [sid, session] of sessions.entries()) {
      if (session.hostSocketId === socket.id) {
        io.to(sid).emit("session:ended", { reason: "Host disconnected" });
        sessions.delete(sid);
        console.log(`[Session] Ended: ${sid} (Host left)`);
        break;
      } else if (session.clientSocketIds.has(socket.id)) {
        session.clientSocketIds.delete(socket.id);
        io.to(session.hostSocketId).emit("host:client-left", { clientId: socket.id });
        console.log(`[Session] Client left: ${sid} | ID: ${socket.id}`);
        // We do not end the session, just notify host that one client left
      }
    }
  });
});

// Cleanup stale sessions every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions.entries()) {
    if (now - session.createdAt > 60 * 60 * 1000) {
      // 1 hour
      sessions.delete(sid);
    }
  }
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 TeamVConnect Signaling Server running on port ${PORT}\n`);
});
