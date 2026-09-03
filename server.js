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

  // ---- 🔒 (optional) ask the hidden AI brain ----
  if (url.pathname === '/ask') {
    const question = url.searchParams.get('q') || '';
    if (!KEY) return sendJSON(res, 500, { error: "No AI key set — see README-FOR-PARENT.md. (The leaderboard works without a key!)" });
    fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + KEY,
      { method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ contents:[{ parts:[{ text: question }] }] }) })
      .then(r => r.json())
      .then(data => {
        const answer = (data.candidates && data.candidates[0] && data.candidates[0].content
                        && data.candidates[0].content.parts[0].text) || "Hmm, I couldn't think of an answer.";
        sendJSON(res, 200, { answer });
      })
      .catch(() => sendJSON(res, 500, { error: "Something went wrong reaching the AI." }));
    return;
  }

  res.writeHead(200, { 'Content-Type':'text/plain' });
  res.end("✅ Linc server is running! Global leaderboard is live at /leaderboard 🌍");
}).listen(PORT, () => console.log("🌍 Linc server running on http://localhost:" + PORT + "  (leaderboard needs NO key!)"));
