# 🌍 Linc Server — Note for a Parent/Guardian

Hi! Your kid built a chatbot + game called **Linc**. This little server does two things:

1. **🌍 Global Leaderboard** for the Reaction Race — so friends on **different computers** all share ONE scoreboard. **This needs NO API key and NO account to try locally!**
2. **🔒 (Optional) real AI "brain"** — needs a free Google key (see the bottom). You can skip this.

---

## 🌍 Part 1 — Turn on the GLOBAL leaderboard

**Step 1 — Install Node.js** (free, once): https://nodejs.org (version 18+).

**Step 2 — Run the server.** In a terminal, from this `linc-server` folder:
```bash
node server.js
```
You should see: `🌍 Linc server running on http://localhost:3000`

**Step 3 — Tell Linc where the server is.** Open **`Linc AI File.html`** in a text editor, find this near the top of the `<script>`:
```js
const GLOBAL_LB_URL = "";
```
…and put the server address between the quotes:
```js
const GLOBAL_LB_URL = "http://localhost:3000";
```
Save, refresh Linc, and the leaderboard now says **🌍 GLOBAL board**! 🎉

### To make it TRULY global (friends far away)
`http://localhost:3000` only works on **this one computer**. For friends on other computers/networks to share the board, the server needs to be **hosted online**. Free options with generous free tiers:
- **Render.com**, **Railway.app**, or **Cloudflare Workers/Fly.io** (each needs a free account — a grown-up step).
- Upload this `linc-server` folder, run `node server.js`, and they'll give you a public web address like `https://linc-xxxx.onrender.com`.
- Put THAT address in `GLOBAL_LB_URL`. Now everyone shares one global board! 🌍

Scores are saved in `lincboard.json` (created automatically). The board resets each day. Names are length-limited and stripped of `<`/`>`, and impossible "autoclicker" times (under 120ms) are rejected.

---

## 🔒 Part 2 (Optional) — a real AI brain

Only if you want Linc to answer *anything* like a big AI:
1. Get a FREE Google Gemini key at **https://aistudio.google.com/app/apikey** (sign in, accept terms, "Create API key").
2. Run the server WITH the key:
   ```bash
   GEMINI_API_KEY="paste-the-key-here" node server.js
   ```
The key stays **only** on your computer (never in the webpage). Skip this part and the leaderboard still works fine.

---

Thanks for helping — your kid is doing real engineering! 🚀
