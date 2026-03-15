# TeamVConnect - Remote Desktop via Cloudflare Tunnel

## Architecture
- **host-agent/**: Node.js agent runs on the machine to be controlled
- **client-app/**: React frontend for the controller
- **signaling-server/**: Node.js WebSocket signaling server
- **public/**: Static landing page

## Tech Stack
- Cloudflare Tunnel (cloudflared) for connectivity
- WebRTC for peer-to-peer streaming
- Socket.io for signaling
- React + Vite for frontend
- Node.js for backend/agent
