// ============================================================
//  🔒🌍 LINC SERVER — two jobs in one little program:
//    1) 🌍 GLOBAL LEADERBOARD (no API key needed!) — so friends
//       on DIFFERENT computers all share ONE Reaction-Race board.
//    2) 🔒 (optional) secret AI key-server for a real AI brain.
//
//  A grown-up runs this, then pastes its web address into
//  GLOBAL_LB_URL inside "Linc AI File.html". See README-FOR-PARENT.md.
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
  res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8' });   // 🔤 serve UTF-8 so dashes/quotes never turn into ‚Äî
  res.end(JSON.stringify(data));
}

// ---- 🛡️ ABUSE PROTECTION: only let Linc's own website use the costly endpoints, and limit how fast anyone can hit them ----
// 🌐 which websites are allowed to use /ai and /search (add more here if you make new sites)
const ALLOWED_ORIGINS = ['https://linc-ai.netlify.app'];
function originOK(req){
  const o = req.headers['origin'] || '';
  if (!o) return true;                                   // non-browser tools have no Origin — the rate limit still guards them
  if (ALLOWED_ORIGINS.includes(o)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;   // local testing
  if (/^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(o)) return true;          // Netlify preview deploys
  return false;
}
// ⏱️ simple per-IP rate limit (in-memory): no more than MAX requests per WINDOW
const RATE = {};
function rateLimited(req, max, windowMs){
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const arr = (RATE[ip] || []).filter(t => now - t < windowMs);
  arr.push(now); RATE[ip] = arr;
  if (Object.keys(RATE).length > 5000) { for (const k in RATE) { if (!RATE[k].some(t => now - t < windowMs)) delete RATE[k]; } }   // tidy up
  return arr.length > max;
}
// 🚦 guard the costly endpoints (/ai, /search): returns true if the request was blocked (and already answered)
function guard(req, res){
  if (!originOK(req)) { sendJSON(res, 403, { error: 'not allowed' }); return true; }
  if (rateLimited(req, 40, 60000)) { sendJSON(res, 429, { error: 'too many requests — slow down a sec!' }); return true; }   // 40/min per person
  return false;
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

  // ---- 🔎 WHOLE-WEB SEARCH — the server searches the REAL web (no CORS limits here!) and
  //      returns short, KID-SAFE snippets. Uses Tavily (free: 1000 searches/month, NO credit card).
  //      A grown-up gets a free key at https://tavily.com → sets SEARCH_API_KEY on the server.
  //      No key set? → returns empty, and Linc falls back to Wikipedia automatically. ----
  if (url.pathname === '/search' && req.method === 'GET') {
    if (guard(req, res)) return;   // 🛡️ origin + rate-limit check
    const q = (url.searchParams.get('q') || '').slice(0, 300).trim();
    const SKEY = process.env.SEARCH_API_KEY;
    if (!q || !SKEY) return sendJSON(res, 200, { results: [] });
    // 🧒 kid-safe filter: drop any snippet with grown-up / scary words
    const BAD = /\b(nude|naked|nsfw|sex|sexual|sexy|porn|porno|xxx|boob|penis|vagina|nipple|kill|killing|murder|gore|gory|corpse|blood|suicide|drug|cocaine|heroin|meth|cigarette|vape|nazi|hitler|racist|terrorist|isis|fuck|fucking|shit|bitch|slut|whore|dick|damn|gambling|casino|betting)\b/i;
    const strip = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    fetch('https://api.tavily.com/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: SKEY, query: q, max_results: 5, search_depth: 'basic', include_answer: true })
    })
      .then(r => r.json())
      .then(d => {
        const snips = [];
        if (d && d.answer) { const a = strip(d.answer); if (a && !BAD.test(a)) snips.push(a.slice(0, 400)); }
        const items = (d && Array.isArray(d.results)) ? d.results : [];
        for (const it of items) {
          const text = strip((it.title ? it.title + ' — ' : '') + (it.content || ''));
          if (text && text.length > 25 && !BAD.test(text)) snips.push(text.slice(0, 320));
          if (snips.length >= 5) break;
        }
        sendJSON(res, 200, { results: snips });
      })
      .catch(() => sendJSON(res, 200, { results: [] }));   // any problem → empty (client falls back to Wikipedia)
    return;
  }

  // ---- 🚀🧠 LINC'S MAIN BRAIN (Groq — super fast & FREE, no credit card). A grown-up gets a free key at
  //      https://console.groq.com/keys → sets GROQ_API_KEY on the server. No key? → returns null, and Linc
  //      falls back to the keyless Pollinations brain automatically. Takes the whole chat so Linc REMEMBERS. ----
  if (url.pathname === '/ai' && req.method === 'POST') {
    if (guard(req, res)) return;   // 🛡️ origin + rate-limit check
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 24000) req.destroy(); });
    req.on('end', () => {
      const GK = process.env.GROQ_API_KEY;
      let msgs = [], wantModel = '', wantEffort = '';
      try { const s = JSON.parse(body || '{}'); if (Array.isArray(s.messages)) msgs = s.messages; if (typeof s.model === 'string') wantModel = s.model; if (typeof s.effort === 'string') wantEffort = s.effort; } catch (e) {}
      // 🧠 the named Linc brains the webpage can pick (Bolt/Flux/Vortex) — only these are allowed
      const ALLOWED_MODELS = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];
      const MODEL = ALLOWED_MODELS.includes(wantModel) ? wantModel : (process.env.GROQ_MODEL || 'openai/gpt-oss-120b');
      // 🧠 "think harder" level for the Pro brains (Bolt 2.0 / Vortex 4.5)
      const EFFORT = ['low', 'medium', 'high'].includes(wantEffort) ? wantEffort : 'low';
      // keep only clean, valid messages (last ~14 so memory works but stays small)
      msgs = msgs.filter(m => m && typeof m.content === 'string' && ['system','user','assistant'].includes(m.role))
                 .map(m => ({ role: m.role, content: m.content.slice(0, 4000) })).slice(-60);   // keep the whole recent chat as memory
      if (!GK || !msgs.length) return sendJSON(res, 200, { answer: null });   // no key → client uses its backup brain
      // 🧒 make sure there's a kid-safe personality up front
      if (!msgs.some(m => m.role === 'system')) msgs.unshift({ role: 'system', content:
        "You are Linc, a smart, friendly kids' AI made by a young coder named Aadit. Answer warmly and simply for a 9-year-old, 1-4 sentences, with a couple fun emojis. Be accurate and don't make things up. Never say anything scary, violent, adult, or unsafe. Never say you're ChatGPT, OpenAI, or Google — you're Linc, made by Aadit. 💚" });
      fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GK },
        body: JSON.stringify({ model: MODEL, messages: msgs, temperature: 0.7, max_tokens: 700, reasoning_effort: EFFORT })
      })
        .then(r => r.json())
        .then(d => {
          const a = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
          const tk = d && d.usage && d.usage.total_tokens;
          sendJSON(res, 200, { answer: (a && a.trim()) ? a : null, tokens: tk || null });
        })
        .catch(() => sendJSON(res, 200, { answer: null }));   // any problem → null (client falls back)
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
}).listen(PORT, () => console.log("🌍 Linc server running on http://localhost:" + PORT + "  (leaderboard needs NO key!)"));
