// ═══════════════════════════════════════════════════════════════
//  PHANTOM SCALP BRIDGE SERVER v1.0
//  Bridge: TradingView Webhook → MT5 EA + Telegram Notif
//  Deploy ke Railway
// ═══════════════════════════════════════════════════════════════

const express = require("express");
const app     = express();
app.use(express.json());

// ── CONFIG ────────────────────────────────────────────────────
const PORT           = process.env.PORT           || 3000;
const TV_SECRET      = process.env.TV_SECRET      || "phantom_scalp_secret_2024";
const MT5_SECRET     = process.env.MT5_SECRET     || "phantom_mt5_secret_2024";
const BOT_TOKEN      = process.env.BOT_TOKEN      || "8690927197:AAFz77UHUlOZJO3GqI9afYt6I112jj_YQmc";   
const CHAT_ID        = process.env.CHAT_ID        || "7572944409";   
const SIGNAL_TTL_MS  = 60 * 1000; // signal expired setelah 60 detik

// ── STATE ─────────────────────────────────────────────────────
let pendingSignal = null;  // signal terbaru menunggu diambil EA
let signalHistory = [];    // log 50 signal terakhir
let signalIdCounter = 1;

// ── TELEGRAM HELPER ───────────────────────────────────────────
async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN) {
    console.log("[TELEGRAM] BOT_TOKEN belum diset. Skip notif.");
    return;
  }
  const targetChat = chatId || CHAT_ID;
  if (!targetChat) {
    console.log("[TELEGRAM] CHAT_ID belum diset. Skip notif.");
    return;
  }

  try {
    const url  = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const body = JSON.stringify({
      chat_id:    targetChat,
      text:       text,
      parse_mode: "HTML",
    });

    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const data = await res.json();
    if (!data.ok) console.error("[TELEGRAM] Error:", data.description);
    else          console.log("[TELEGRAM] Notif terkirim ke", targetChat);
  } catch (err) {
    console.error("[TELEGRAM] Fetch error:", err.message);
  }
}

function buildSignalMessage(payload) {
  const emoji = payload.type === "BUY"  ? "🟢" :
                payload.type === "SELL" ? "🔴" :
                payload.type === "TP_HIT" ? "✅" :
                payload.type === "SL_HIT" ? "❌" : "👻";

  if (payload.type === "TP_HIT") {
    return (
      `${emoji} <b>PHANTOM SCALP — TP HIT</b>\n` +
      `────────────────────\n` +
      `📊 Symbol   : <b>${payload.ticker}</b>\n` +
      `⏱ Interval : ${payload.interval}\n` +
      `💰 Harga    : <b>${payload.price}</b>\n` +
      `────────────────────\n` +
      `🎉 Take Profit tercapai!`
    );
  }

  if (payload.type === "SL_HIT") {
    return (
      `${emoji} <b>PHANTOM SCALP — SL HIT</b>\n` +
      `────────────────────\n` +
      `📊 Symbol   : <b>${payload.ticker}</b>\n` +
      `⏱ Interval : ${payload.interval}\n` +
      `💰 Harga    : <b>${payload.price}</b>\n` +
      `────────────────────\n` +
      `⚠️ Stop Loss kena. Disiplin!`
    );
  }

  return (
    `${emoji} <b>PHANTOM SCALP — ${payload.type}</b>\n` +
    `────────────────────\n` +
    `📊 Symbol   : <b>${payload.ticker}</b>\n` +
    `⏱ Interval : ${payload.interval}\n` +
    `💵 Entry    : <b>${payload.price}</b>\n` +
    `🎯 TP       : <b>${payload.tp}</b>\n` +
    `🛡 SL       : <b>${payload.sl}</b>\n` +
    `⭐ Score    : ${payload.score}/6\n` +
    `────────────────────\n` +
    `👻 <i>Phantom Signal Bot</i>`
  );
}

// ── ROUTES ────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => {
  res.json({
    status:  "online",
    service: "Phantom Scalp Bridge v1.0",
    signal:  pendingSignal ? "pending" : "none",
    uptime:  Math.floor(process.uptime()) + "s",
  });
});

// ── WEBHOOK DARI TRADINGVIEW ──────────────────────────────────
// POST /webhook
app.post("/webhook", async (req, res) => {
  const payload = req.body;
  console.log("[WEBHOOK] Diterima:", JSON.stringify(payload));

  // Validasi secret
  if (!payload.secret || payload.secret !== TV_SECRET) {
    console.warn("[WEBHOOK] Secret tidak valid:", payload.secret);
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Validasi field wajib
  if (!payload.type || !payload.ticker) {
    return res.status(400).json({ error: "Field tidak lengkap" });
  }

  const type = payload.type.toUpperCase();

  // Kirim notif Telegram dulu untuk semua tipe
  const msg = buildSignalMessage({ ...payload, type });
  await sendTelegram(payload.chat_id || CHAT_ID, msg);

  // Hanya BUY/SELL yang masuk queue MT5
  if (type === "BUY" || type === "SELL") {
    const signal = {
      id:        signalIdCounter++,
      type,
      ticker:    payload.ticker,
      interval:  payload.interval  || "—",
      price:     payload.price     || "0",
      tp:        payload.tp        || "0",
      sl:        payload.sl        || "0",
      score:     payload.score     || "0",
      createdAt: Date.now(),
    };

    pendingSignal = signal;

    // Simpan ke history (max 50)
    signalHistory.unshift({ ...signal, confirmed: false });
    if (signalHistory.length > 50) signalHistory.pop();

    console.log("[WEBHOOK] Signal pending:", JSON.stringify(signal));
    return res.json({ ok: true, signal });
  }

  // TP_HIT / SL_HIT — tidak masuk queue MT5, hanya notif
  res.json({ ok: true, type, message: "Notif terkirim, tidak masuk queue MT5" });
});

// ── ENDPOINT UNTUK MT5 EA — GET SIGNAL ───────────────────────
// GET /mt5/signal?secret=...&symbol=...
app.get("/mt5/signal", (req, res) => {
  const secret = req.query.secret || req.headers["x-mt5-secret"];
  const symbol = (req.query.symbol || "").toUpperCase();

  if (secret !== MT5_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Cek apakah ada signal pending
  if (!pendingSignal) {
    return res.json({ signal: null, message: "Tidak ada signal pending" });
  }

  // Cek expired
  const age = Date.now() - pendingSignal.createdAt;
  if (age > SIGNAL_TTL_MS) {
    console.log("[MT5] Signal expired:", age + "ms");
    pendingSignal = null;
    return res.json({ signal: null, message: "Signal expired" });
  }

  // Filter by symbol kalau ada
  if (symbol && pendingSignal.ticker &&
      !pendingSignal.ticker.toUpperCase().startsWith(symbol)) {
    return res.json({ signal: null, message: "Symbol tidak cocok" });
  }

  console.log("[MT5] Signal dikirim ke EA:", JSON.stringify(pendingSignal));
  res.json({ signal: pendingSignal });
});

// ── ENDPOINT UNTUK MT5 EA — KONFIRMASI ───────────────────────
// POST /mt5/confirm
app.post("/mt5/confirm", async (req, res) => {
  const secret = req.body.secret || req.headers["x-mt5-secret"];
  if (secret !== MT5_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id, ticker, price, tp, sl, orderType, ticket, lot, skipped, reason } = req.body;
  console.log("[CONFIRM] ID=", id, "Skipped=", skipped, "Reason=", reason);

  // Update history
  const hist = signalHistory.find(s => s.id == id);
  if (hist) {
    hist.confirmed  = true;
    hist.skipped    = skipped;
    hist.reason     = reason;
    hist.ticket     = ticket;
    hist.confirmedAt = Date.now();
  }

  // Hapus dari pending jika ID cocok
  if (pendingSignal && pendingSignal.id == id) {
    pendingSignal = null;
  }

  // Notif Telegram
  let notifMsg;
  if (skipped) {
    notifMsg =
      `⚠️ <b>PHANTOM EA — Signal Dilewati</b>\n` +
      `────────────────────\n` +
      `📊 Symbol  : <b>${ticker || "—"}</b>\n` +
      `🔖 Tipe    : ${orderType || "—"}\n` +
      `💵 Price   : ${price || "—"}\n` +
      `📋 Alasan  : <i>${reason || "—"}</i>\n` +
      `👻 <i>Phantom Signal Bot</i>`;
  } else {
    notifMsg =
      `✅ <b>PHANTOM EA — Order Masuk</b>\n` +
      `────────────────────\n` +
      `📊 Symbol  : <b>${ticker || "—"}</b>\n` +
      `🔖 Tipe    : <b>${orderType || "—"}</b>\n` +
      `💵 Entry   : <b>${price || "—"}</b>\n` +
      `🎯 TP      : <b>${tp || "—"}</b>\n` +
      `🛡 SL      : <b>${sl || "—"}</b>\n` +
      `🎫 Ticket  : ${ticket || "—"}\n` +
      `📦 Lot     : ${lot || "—"}\n` +
      `👻 <i>Phantom Signal Bot</i>`;
  }

  await sendTelegram(CHAT_ID, notifMsg);
  res.json({ ok: true });
});

// ── HISTORY (OPSIONAL — untuk monitoring) ────────────────────
app.get("/history", (req, res) => {
  const secret = req.query.secret || req.headers["x-mt5-secret"];
  if (secret !== MT5_SECRET && secret !== TV_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({ count: signalHistory.length, signals: signalHistory.slice(0, 20) });
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  PHANTOM SCALP BRIDGE SERVER v1.0        ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(` Port     : ${PORT}`);
  console.log(` TV Secret: ${TV_SECRET}`);
  console.log(` MT5 Sec  : ${MT5_SECRET}`);
  console.log(` Bot Token: ${BOT_TOKEN ? "✅ Set" : "❌ Belum diset"}`);
  console.log(` Chat ID  : ${CHAT_ID  ? "✅ Set" : "❌ Belum diset"}`);
});
