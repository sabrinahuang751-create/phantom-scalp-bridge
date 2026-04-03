# 👻 PHANTOM SCALP — Setup Guide

## File yang ada di sini:
| File | Keterangan |
|---|---|
| `PHANTOM_SCALP.pine` | Indicator TradingView (Pine Script v5) |
| `PhantomScalpEA.mq5` | Expert Advisor MT5 |
| `server.js` | Bridge Server untuk Railway |
| `package.json` | Dependencies Node.js |

---

## LANGKAH 1 — Buat Bot Telegram Baru

1. Buka Telegram → cari **@BotFather**
2. Ketik `/newbot`
3. Isi nama bot: `Phantom Scalp Bot`
4. Isi username: `phantom_scalp_bot` (harus unik, tambahkan angka kalau perlu)
5. **Simpan BOT_TOKEN** yang diberikan (format: `123456:ABC-DEF...`)
6. Untuk dapat CHAT_ID:
   - Tambahkan bot ke group atau DM bot
   - Buka: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
   - Cari nilai `"chat":{"id":...}` — itu CHAT_ID kamu

---

## LANGKAH 2 — Buat GitHub Baru

1. Buka [github.com](https://github.com) → New Repository
2. Nama repo: `phantom-scalp-bridge`
3. Visibility: **Private** (disarankan)
4. Upload file: `server.js` dan `package.json`
5. Commit & push

---

## LANGKAH 3 — Deploy ke Railway

1. Buka [railway.app](https://railway.app) → New Project
2. Pilih **Deploy from GitHub repo**
3. Pilih repo `phantom-scalp-bridge`
4. Setelah deploy, masuk ke tab **Variables** → tambahkan:

```
TV_SECRET   = phantom_scalp_secret_2024
MT5_SECRET  = phantom_mt5_secret_2024
BOT_TOKEN   = <isi BOT_TOKEN dari BotFather>
CHAT_ID     = <isi CHAT_ID kamu>
```

5. Railway akan otomatis beri URL seperti:
   `https://phantom-scalp-bridge-production.up.railway.app`
6. **Simpan URL ini** — akan dipakai di Pine Script dan EA

---

## LANGKAH 4 — Setup TradingView

1. Buka TradingView → Pine Script Editor
2. Paste isi `PHANTOM_SCALP.pine`
3. Di baris paling bawah (bagian ALERTS), ganti:
   - `GANTI_DENGAN_CHAT_ID_TELEGRAM_KAMU` → CHAT_ID Telegram kamu
4. Save & Add to Chart
5. Buat Alert baru:
   - Condition: `Phantom Scalp PRO v1.0`
   - Alert actions: **Webhook URL**
   - URL Webhook: `https://<URL-RAILWAY-KAMU>/webhook`
   - Message: *(kosongkan, Pine Script akan isi otomatis via alert())*
6. Aktifkan alert

---

## LANGKAH 5 — Setup EA di MT5

1. Copy `PhantomScalpEA.mq5` ke folder:
   `C:\Users\<user>\AppData\Roaming\MetaQuotes\Terminal\<id>\MQL5\Experts\`
2. Buka MetaEditor → Compile file tersebut (F7)
3. Kembali ke MT5 → Navigator → Expert Advisors → drag ke chart XAUUSD
4. Di input EA, isi:
   - `BridgeURL` = URL Railway kamu (tanpa `/` di akhir)
   - `MT5Secret` = `phantom_mt5_secret_2024`
5. **WAJIB**: Pergi ke `Tools → Options → Expert Advisors → Allow WebRequest`
   → Tambahkan URL Railway kamu di sana
6. Pastikan Auto Trading aktif (tombol hijau di toolbar)

---

## Alur Kerja Sistem

```
TradingView (Pine Script)
      ↓ Alert Webhook
Railway Bridge Server
      ↓ Notif Telegram (langsung)
      ↓ Signal disimpan di memory
MT5 EA (polling tiap 3 detik)
      ↓ Ambil signal dari Railway
      ↓ Eksekusi order BUY/SELL
      ↓ Kirim konfirmasi ke Railway
Railway Bridge Server
      ↓ Notif Telegram (konfirmasi order)
```

---

## Checklist Sebelum Live

- [ ] Bot Telegram aktif & BOT_TOKEN tersimpan
- [ ] Railway deploy sukses & URL sudah dapat
- [ ] Environment variables Railway sudah diisi semua
- [ ] Pine Script terpasang di chart & alert aktif
- [ ] EA MT5 sudah di-compile & dipasang di chart
- [ ] WebRequest URL sudah diizinkan di MT5
- [ ] Test webhook manual via Postman atau curl:

```bash
curl -X POST https://<URL-RAILWAY>/webhook \
  -H "Content-Type: application/json" \
  -d '{"secret":"phantom_scalp_secret_2024","chat_id":"<CHAT_ID>","type":"BUY","ticker":"XAUUSD","interval":"1","price":"2350.00","score":"5","tp":"2360.00","sl":"2345.00"}'
```

---

## Secret Keys (default — bisa diganti di Railway env)

| Key | Default Value |
|---|---|
| TV_SECRET | `phantom_scalp_secret_2024` |
| MT5_SECRET | `phantom_mt5_secret_2024` |

> ⚠️ Setelah live, ganti secret keys ini dengan yang lebih unik!
