const { Client, GatewayIntentBits } = require('discord.js');
const { WebSocketServer } = require('ws');
const express = require('express');
const http = require('http');

// Cargamos variables de entorno (para local)
require('dotenv').config();

const TARGET_BOT_ID = '1490862148308566247';
const ALLOWED_CHANNELS = new Set([
  '1490860769645039749',
  '1493042166656929994',
  '1493042607503183965'
]);

const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --- CONFIGURACIÓN DEL SERVIDOR WEB Y WEBSOCKET PARA RENDER ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Página web básica para que Render (y UptimeRobot) sepan que el bot está vivo
app.get('/', (req, res) => {
  res.send('Servidor de Discord y WebSocket funcionando correctamente! 🚀');
});

let robloxConnection = null;

wss.on('connection', (ws) => {
  console.log('✅ Roblox se ha conectado al WebSocket');
  robloxConnection = ws;

  ws.on('close', () => {
    console.log('❌ Roblox se desconectó');
    robloxConnection = null;
  });

  ws.on('error', (err) => {
    console.error('⚠️ Error en conexión Roblox:', err.message);
  });
});

// Render asignará su propio puerto automáticamente aquí
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🌐 Servidor Web y WebSocket escuchando en el puerto ${PORT}`);
});
// -----------------------------------------------------------------

function getJobId(message) {
  const joinButton = message.components
    ?.flatMap(row => row.components ??[])
    .find(btn => btn.label === 'Join Server' && btn.url);

  if (!joinButton) return null;

  try {
    const url = new URL(joinButton.url);
    return url.searchParams.get('gameInstanceId');
  } catch {
    const match = joinButton.url.match(/[?&]gameInstanceId=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

function parseBrainrots(embed, jobId) {
  const lines = (embed.description ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const results =[];
  let currentName = null;

  for (const line of lines) {
    const nameMatch = line.match(/^\*\*(.+?)\*\*$/);
    if (nameMatch) {
      currentName = nameMatch[1];
      continue;
    }

    const priceMatch = line.match(/\*\*\$([^*]+)\*\*/);
    if (priceMatch && currentName) {
      results.push({
        name: currentName,
        price: `$${priceMatch[1].trim()}`,
        jobId
      });
      currentName = null;
    }
  }

  return results;
}

client.on('messageCreate', (message) => {
  if (message.author.id !== TARGET_BOT_ID) return;
  if (!ALLOWED_CHANNELS.has(message.channel.id)) return;
  if (!message.embeds?.length) return;

  const jobId = getJobId(message);

  for (const embed of message.embeds) {
    if (!embed.title?.toLowerCase().includes('brainrot found')) continue;

    const brainrots = parseBrainrots(embed, jobId);
    for (const b of brainrots) {
      const dataString = JSON.stringify(b);
      console.log('📤 Enviando a Roblox:', dataString);

      if (robloxConnection && robloxConnection.readyState === 1) {
        robloxConnection.send(dataString);
      } else {
        console.log('⏳ Roblox no está conectado, mensaje ignorado.');
      }
    }
  }
});

client.once('ready', () => {
  console.log(`🤖 Conectado a Discord como ${client.user.tag}`);
});

client.login(process.env.TOKEN);
