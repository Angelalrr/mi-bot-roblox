const { Client, GatewayIntentBits } = require('discord.js');
const { WebSocketServer } = require('ws');
const express = require('express');
const http = require('http');

// Carga las variables de entorno (para PC local)
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

// =========================================================
// 1. CONFIGURACIÓN DEL SERVIDOR WEB Y WEBSOCKET (RENDER)
// =========================================================
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/', (req, res) => {
  res.send('✅ Servidor Web y WebSocket activos correctamente.');
});

let robloxConnection = null;

wss.on('connection', (ws) => {
  console.log('✅ [WEBSOCKET] Roblox se ha conectado!');
  robloxConnection = ws;

  ws.on('close', () => {
    console.log('❌ [WEBSOCKET] Roblox se desconectó.');
    robloxConnection = null;
  });

  ws.on('error', (err) => {
    console.error('⚠️ [WEBSOCKET] Error:', err.message);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🌐 [WEB] Escuchando en el puerto ${PORT}`);
});

// =========================================================
// 2. EVENTOS DE DEBUG EXTREMO PARA DISCORD
// (Esto nos dirá si Render está bloqueando a Discord)
// =========================================================
client.on('debug', (info) => {
  console.log(`[DEBUG DISCORD] ${info}`);
});

client.on('warn', (info) => {
  console.log(`[WARN DISCORD] ${info}`);
});

client.on('error', (error) => {
  console.error(`[ERROR FATAL DISCORD]`, error);
});

// =========================================================
// 3. LÓGICA DE EXTRACCIÓN DE DATOS
// =========================================================
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

// =========================================================
// 4. LECTURA DE MENSAJES CON COMENTARIOS EN CONSOLA
// =========================================================
client.once('ready', () => {
  console.log(`🤖 ¡ÉXITO! Conectado a Discord como ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  console.log(`📩[MENSAJE NUEVO] Autor: ${message.author.id} | Canal: ${message.channel.id}`);

  if (message.author.id !== TARGET_BOT_ID) {
    console.log(`🚫[IGNORADO] El mensaje no es del bot objetivo.`);
    return;
  }
  
  if (!ALLOWED_CHANNELS.has(message.channel.id)) {
    console.log(`🚫 [IGNORADO] Es el bot objetivo, pero escribió en un canal NO permitido.`);
    return;
  }
  
  if (!message.embeds?.length) {
    console.log(`🚫 [IGNORADO] El mensaje no tiene Embeds.`);
    return;
  }

  const jobId = getJobId(message);
  console.log(`🔍 [PROCESANDO] Embed detectado. JobId encontrado: ${jobId || 'Ninguno'}`);

  for (const embed of message.embeds) {
    if (!embed.title?.toLowerCase().includes('brainrot found')) {
      console.log(`🚫 [IGNORADO] El título del Embed no es 'Brainrot found'. Título real: ${embed.title}`);
      continue;
    }

    const brainrots = parseBrainrots(embed, jobId);
    
    if (brainrots.length === 0) {
      console.log(`⚠️[ADVERTENCIA] No se pudo leer el nombre ni el precio del Embed.`);
    }

    for (const b of brainrots) {
      const dataString = JSON.stringify(b);
      console.log(`📤 [PREPARANDO ENVÍO] Datos: ${dataString}`);

      if (robloxConnection && robloxConnection.readyState === 1) {
        robloxConnection.send(dataString);
        console.log(`✅ [ÉXITO] ¡Datos enviados a Roblox correctamente!`);
      } else {
        console.log(`⏳[FALLO] Roblox no está conectado al WebSocket en este momento. El mensaje se perdió.`);
      }
    }
  }
});

// =========================================================
// 5. INICIAR SESIÓN EN DISCORD
// =========================================================
console.log("⏳ [INICIANDO] Intentando conectar a Discord con el Token...");

if (!process.env.TOKEN) {
  console.error("❌ [ERROR] NO SE ENCONTRÓ EL TOKEN. Asegúrate de ponerlo en Render (Environment).");
}

client.login(process.env.TOKEN).catch((err) => {
  console.error('❌ [ERROR FATAL AL INICIAR SESIÓN EN DISCORD]:', err);
});
