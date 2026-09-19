// ============================================================
//  🔒🌍 LINC SERVER — jobs in one little program:
//    1) 🌍 GLOBAL LEADERBOARD (no API key needed!)
//    2) 🟢 ACTIVE USERS counter
//    3) 🧠 (optional) AI brain via Gemini (needs a key)
// ============================================================

const http = require('http');
const fs   = require('fs');
const path = require('path');

const KEY  = process.env.GEMINI_API_KEY;               // optional — only for the AI brain
const PORT = process.env.PORT || 3000;
const BOARD_FILE = path.join(__dirname, 'lincboard.json');

// ---- tiny "database": today's fastest scores, saved to a file ----
function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
function loadBoard(){
  try{ const b=JSON.parse(fs.readFileSync(BOARD_FILE,'utf8'));
       if(b.date!==todayStr()) return {date:todayStr(), scores:[]};   // new day → fresh race
       return b;
  }catch(e){ return {date:todayStr(), scores:[]}; }
}
function saveBoard(b){ try{ fs.writeFileSync(BOARD_FILE, JSON.stringify(b)); }catch(e){} }

// ---- 🆔 name registry: each name is owned by ONE person (identified by a secret device token) ----
const USERS_FILE = path.join(__dirname, 'lincusers.json');
function loadUsers(){ try{ return JSON.parse(fs.readFileSync(USERS_FILE,'utf8')); }catch(e){ return {}; } }
function saveUsers(u){ try{ fs.writeFileSync(USERS_FILE, JSON.stringify(u)); }catch(e){} }

// ---- 🟢 who's online right now: token -> last time we heard from them ----
const ACTIVE = {};
function activeCount(){ const now = Date.now(); for (const k in ACTIVE) { if (now - ACTIVE[k] > 60000) delete ACTIVE[k]; } return Object.keys(ACTIVE).length; }

function sendJSON(res, code, data){
  res.writeHead(code, { 'Content-Type':'application/json' });
  res.end(JSON.stringify(data));
}

http.createServer((req, res) => {
  // let the Linc webpage talk to this server from anywhere
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');

  // ---- 🆔 claim a unique name (POST {name, token}) — no two people can share a name ----
  if (url.pathname === '/claim' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1000) req.destroy(); });
    req.on('end', () => {
      try {
        const s = JSON.parse(body || '{}');
        const name = String(s.name || '').replace(/[<>]/g, '').slice(0, 20).trim();
        const token = String(s.token || '').slice(0, 80);
        if (!name || !token) return sendJSON(res, 400, { error: 'bad request' });
        const users = loadUsers();
        const key = name.toLowerCase();
        if (!users[key]) { users[key] = token; saveUsers(users); return sendJSON(res, 200, { ok: true }); }   // free → claim it
        if (users[key] === token) return sendJSON(res, 200, { ok: true });                                    // it's you → welcome back
        return sendJSON(res, 200, { ok: false, taken: true });                                                // someone else has it
      } catch (e) { sendJSON(res, 400, { error: 'bad request' }); }
    });
    return;
  }

  // ---- 🌍 GET the global leaderboard ----
  if (url.pathname === '/leaderboard' && req.method === 'GET') {
    const b = loadBoard();
    const top = b.scores.sort((a,c)=>a.ms-c.ms).slice(0, 12);
    return sendJSON(res, 200, top);
  }

  // ---- 🌍 POST a new score {name, ms, wins} ----
  if (url.pathname === '/score' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2000) req.destroy(); });   // stop giant payloads
    req.on('end', () => {
      try {
        const s = JSON.parse(body || '{}');
        let name = String(s.name || 'Player').replace(/[<>]/g, '').slice(0, 20);   // keep names safe & short
        const ms = Math.round(Number(s.ms));
        const wins = Math.max(0, Math.round(Number(s.wins) || 0));
        if (!name || !isFinite(ms) || ms < 120 || ms > 60000) return sendJSON(res, 400, { error: 'bad score' });  // 🚫 blocks autoclicker times too
        const b = loadBoard();
        const ex = b.scores.find(e => e.name.toLowerCase() === name.toLowerCase());
        if (ex) { if (ms < ex.ms) ex.ms = ms; if (wins > (ex.wins || 0)) ex.wins = wins; }
        else b.scores.push({ name, ms, wins });
        saveBoard(b);
        sendJSON(res, 200, { ok: true });
      } catch (e) { sendJSON(res, 400, { error: 'bad request' }); }
    });
    return;
  }

  // ---- 🟢 heartbeat: a visitor checks in, we reply with how many are online now ----
  if (url.pathname === '/active' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 500) req.destroy(); });
    req.on('end', () => {
      try { const s = JSON.parse(body || '{}'); const t = String(s.token || '').slice(0, 80);
        if (t) ACTIVE[t] = Date.now();
        sendJSON(res, 200, { count: activeCount() });
      } catch (e) { sendJSON(res, 200, { count: activeCount() }); }
    });
    return;
  }

  // ---- 🧠 the hidden AI brain (Gemini) — needs GEMINI_API_KEY set on the server ----
  if (url.pathname === '/ask') {
    const question = (url.searchParams.get('q') || '').slice(0, 2000);
    if (!KEY) return sendJSON(res, 500, { error: "No AI key set — see README-FOR-PARENT.md. (Everything else works without a key!)" });
    const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';   // grown-up can change this if Google renames it
    // 🧒 Linc's personality: kind, simple, safe for kids
    const persona = "You are Linc, a friendly AI chatbot made by a young coder named Aadit, and you talk to kids. " +
      "Answer in a warm, simple way a 9-year-old can understand. Keep it short — 1 to 3 sentences — and add a couple of fun emojis. " +
      "Never share anything scary, adult, or unsafe; if a question isn't right for kids, gently say you can't help with that. " +
      "Here is the kid's message: " + question;
    fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + KEY,
      { method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ contents:[{ parts:[{ text: persona }] }], generationConfig:{ maxOutputTokens: 300, temperature: 0.8 } }) })
      .then(r => r.json())
      .then(data => {
        const answer = (data.candidates && data.candidates[0] && data.candidates[0].content
                        && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
                        && data.candidates[0].content.parts[0].text) || "Hmm, I couldn't think of an answer to that one. 🤔";
        sendJSON(res, 200, { answer });
      })
      .catch(() => sendJSON(res, 500, { error: "Something went wrong reaching the AI." }));
    return;
  }

  res.writeHead(200, { 'Content-Type':'text/plain' });
  res.end("✅ Linc server is running! Global leaderboard is live at /leaderboard 🌍");
}).listen(PORT, () => console.log("🌍 Linc server running on http://localhost:" + PORT));
