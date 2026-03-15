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
  socket.on("host:create", () => {
    const sessionId = generateCode();
    sessions.set(sessionId, {
      hostSocketId: socket.id,
      clientSocketId: null,
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
    if (session.clientSocketId) {
      socket.emit("error", { message: "Session already has a client." });
      return;
    }
    session.clientSocketId = socket.id;
    socket.join(sessionId);
    // Notify host
    io.to(session.hostSocketId).emit("host:client-joined", { sessionId });
    socket.emit("client:joined", { sessionId });
    console.log(`[Session] Client joined: ${sessionId}`);
  });

  // ── WebRTC Signaling relay ──────────────────────────────────────────
  socket.on("signal:offer", ({ sessionId, offer }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    io.to(session.clientSocketId).emit("signal:offer", { offer });
  });

  socket.on("signal:answer", ({ sessionId, answer }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    io.to(session.hostSocketId).emit("signal:answer", { answer });
  });

  socket.on("signal:ice", ({ sessionId, candidate, from }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    const target =
      from === "host" ? session.clientSocketId : session.hostSocketId;
    io.to(target).emit("signal:ice", { candidate });
  });

  // ── Native OS remote control via nut-js ─────────────────────────────
  socket.on("control:event", async ({ sessionId, event }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    
    // Also notify host UI if needed
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

  // ── Disconnect ──────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    for (const [sid, session] of sessions.entries()) {
      if (
        session.hostSocketId === socket.id ||
        session.clientSocketId === socket.id
      ) {
        io.to(sid).emit("session:ended", {
          reason:
            session.hostSocketId === socket.id
              ? "Host disconnected"
              : "Client disconnected",
        });
        sessions.delete(sid);
        console.log(`[Session] Ended: ${sid}`);
        break;
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
