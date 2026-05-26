const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
require('dotenv').config();

const PRESENTER_KEY = process.env.PRESENTER_KEY;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.static(path.join(__dirname)));

let presenterSocket = null;
const viewerSockets = new Set();
let currentSlide = 0;

function broadcastViewers(message) {
  const data = JSON.stringify(message);
  viewerSockets.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
}

function broadcastAll(message) {
  const data = JSON.stringify(message);
  if (presenterSocket && presenterSocket.readyState === 1) presenterSocket.send(data);
  viewerSockets.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      if (msg.role === 'presenter') {
        if (!msg.key || msg.key !== PRESENTER_KEY) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid presenter key. Connected as viewer.' }));
          msg.role = 'viewer';
        } else if (presenterSocket && presenterSocket.readyState === 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'A presenter is already connected. Connecting as viewer.' }));
          msg.role = 'viewer';
        } else {
          presenterSocket = ws;
          ws._role = 'presenter';
          ws.send(JSON.stringify({ type: 'role_confirm', role: 'presenter' }));
          ws.send(JSON.stringify({ type: 'sync', index: currentSlide }));
          broadcastAll({ type: 'viewer_count', count: viewerSockets.size });
          return;
        }
      }

      if (msg.role === 'viewer') {
        viewerSockets.add(ws);
        ws._role = 'viewer';
        ws.send(JSON.stringify({ type: 'role_confirm', role: 'viewer' }));
        ws.send(JSON.stringify({ type: 'sync', index: currentSlide }));
        broadcastAll({ type: 'viewer_count', count: viewerSockets.size });
      }
    }

    if (msg.type === 'slide_change' && ws === presenterSocket) {
      const index = Math.max(0, Math.min(msg.index | 0, 23));
      currentSlide = index;
      broadcastViewers({ type: 'sync', index });
    }

    if (msg.type === 'video_action' && ws === presenterSocket) {
      broadcastViewers(msg);
    }
  });

  ws.on('close', () => {
    if (ws === presenterSocket) {
      presenterSocket = null;
      broadcastAll({ type: 'presenter_offline' });
    }
    if (viewerSockets.has(ws)) {
      viewerSockets.delete(ws);
      broadcastAll({ type: 'viewer_count', count: viewerSockets.size });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Antigravity 2.0 presentation running at http://localhost:${PORT}`);
  console.log(`Presenter: http://localhost:${PORT}/?presenter`);
});
