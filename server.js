const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const PRESENTER_KEY = process.env.PRESENTER_KEY;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', clientTracking: true });

app.use(express.static(path.join(__dirname)));

const presenterSockets = new Set();
let activePresenter = null;
const viewerSockets = new Set();
let currentSlide = 0;
let chatId = 0;
const chatLog = [];

// Load chat history from file
const CHAT_FILE = path.join(__dirname, 'chat.json');
try {
  const saved = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
  if (Array.isArray(saved)) { saved.forEach(m => chatLog.push(m)); }
  if (chatLog.length) chatId = chatLog[chatLog.length - 1].id;
} catch {}

function saveChat() {
  fs.writeFileSync(CHAT_FILE, JSON.stringify(chatLog, null, 2));
}

const HEARTBEAT = 60000;

function heartbeat() {
  this._alive = true;
}

function broadcastViewers(message) {
  const data = JSON.stringify(message);
  viewerSockets.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
}

function broadcastPresenters(message, exclude) {
  const data = JSON.stringify(message);
  presenterSockets.forEach(ws => {
    if (ws.readyState === 1 && ws !== exclude) ws.send(data);
  });
}

function broadcastAll(message) {
  const data = JSON.stringify(message);
  presenterSockets.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
  viewerSockets.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
}

wss.on('connection', (ws) => {
  ws._id = Math.random().toString(36).slice(2, 10);
  ws._alive = true;
  ws.on('pong', heartbeat);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      if (msg.role === 'presenter') {
        if (!msg.key || msg.key !== PRESENTER_KEY) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid presenter key. Connected as viewer.' }));
          msg.role = 'viewer';
        } else {
          presenterSockets.add(ws);
          ws._role = 'presenter';
          const isFirst = !activePresenter || activePresenter.readyState !== 1;
          ws.send(JSON.stringify({ type: 'role_confirm', role: 'presenter', isActive: isFirst }));
          if (isFirst) {
            activePresenter = ws;
          }
          ws.send(JSON.stringify({ type: 'sync', index: currentSlide }));
          chatLog.forEach(m => ws.send(JSON.stringify({ type: 'chat_history', messages: [m] })));
          broadcastAll({ type: 'viewer_count', count: viewerSockets.size });
          broadcastPresenters({ type: 'presenter_status', activeId: activePresenter._id });
          return;
        }
      }

      if (msg.role === 'viewer') {
        viewerSockets.add(ws);
        ws._role = 'viewer';
        ws.send(JSON.stringify({ type: 'role_confirm', role: 'viewer' }));
        ws.send(JSON.stringify({ type: 'sync', index: currentSlide }));
        chatLog.forEach(m => ws.send(JSON.stringify({ type: 'chat_history', messages: [m] })));
        broadcastAll({ type: 'viewer_count', count: viewerSockets.size });
      }
    }

    if (msg.type === 'claim_presenter' && ws._role === 'presenter') {
      activePresenter = ws;
      ws.send(JSON.stringify({ type: 'presenter_promoted' }));
      broadcastPresenters({ type: 'presenter_demoted' }, ws);
      broadcastPresenters({ type: 'presenter_status', activeId: ws._id }, ws);
      broadcastViewers({ type: 'sync', index: currentSlide });
    }

    if (msg.type === 'slide_change' && ws === activePresenter) {
      const index = Math.max(0, Math.min(msg.index | 0, 23));
      currentSlide = index;
      broadcastViewers({ type: 'sync', index });
    }

    if (msg.type === 'video_action' && ws === activePresenter) {
      broadcastViewers(msg);
    }

    if (msg.type === 'chat' && ws === activePresenter) {
      const id = ++chatId;
      const chatMsg = { type: 'chat', text: String(msg.text).slice(0, 5000), format: msg.format === 'code' ? 'code' : 'text', id };
      chatLog.push(chatMsg);
      saveChat();
      broadcastAll(chatMsg);
    }
  });

  ws.on('close', () => {
    if (presenterSockets.has(ws)) {
      presenterSockets.delete(ws);
      if (ws === activePresenter) {
        activePresenter = null;
        if (presenterSockets.size > 0) {
          const next = presenterSockets.values().next().value;
          activePresenter = next;
          next.send(JSON.stringify({ type: 'presenter_promoted' }));
          broadcastPresenters({ type: 'presenter_status', activeId: next._id });
          broadcastViewers({ type: 'sync', index: currentSlide });
        } else {
          broadcastViewers({ type: 'presenter_offline' });
        }
      } else {
        broadcastPresenters({ type: 'presenter_status', activeId: activePresenter ? activePresenter._id : null });
      }
      broadcastAll({ type: 'viewer_count', count: viewerSockets.size });
    }
    if (viewerSockets.has(ws)) {
      viewerSockets.delete(ws);
      broadcastAll({ type: 'viewer_count', count: viewerSockets.size });
    }
  });
});

const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws._alive) return ws.terminate();
    ws._alive = false;
    ws.ping();
  });
}, HEARTBEAT);

wss.on('close', () => clearInterval(pingInterval));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Antigravity 2.0 presentation running at http://localhost:${PORT}`);
  console.log(`Presenter: http://localhost:${PORT}/?presenter`);
});
