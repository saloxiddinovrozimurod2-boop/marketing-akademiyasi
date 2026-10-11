require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be set to a random string of at least 32 characters.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (PostgreSQL connection string).");
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "40kb" }));
app.use(express.static("public", { index: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
function setTokenCookie(res, user) {
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("ma_session", token, cookieOptions);
}
function clearTokenCookie(res) {
  res.clearCookie("ma_session", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
}
async function auth(req, res, next) {
  const token = req.cookies?.ma_session;
  if (!token) return res.status(401).json({ error: "Avval akkauntingizga kiring." });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query("SELECT id, name, email, role FROM users WHERE id=$1", [decoded.sub]);
    if (!result.rowCount) return res.status(401).json({ error: "Akkaunt topilmadi." });
    req.user = result.rows[0];
    next();
  } catch {
    return res.status(401).json({ error: "Sessiya muddati tugagan. Qayta kiring." });
  }
}
app.use((req, res, next) => {
  // Parse only the platform's own session cookie without an extra dependency.
  const raw = req.headers.cookie || "";
  req.cookies = Object.fromEntries(raw.split(";").map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf("="); return [decodeURIComponent(v.slice(0, i)), decodeURIComponent(v.slice(i + 1))];
  }));
  next();
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'student',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS progress (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{"done":[],"custom":[],"history":[],"tutorHistory":[]}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tutor_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      score INTEGER NOT NULL,
      feedback TEXT NOT NULL,
      model_answer TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Optional first administrator is created only from server-side secrets, never from public signup.
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 12) {
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (!existing.rowCount) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
      await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'admin')",
        ["Administrator", email, hash]);
      console.log("Initial admin account created from ADMIN_EMAIL/ADMIN_PASSWORD.");
    }
  }
}
app.get("/api/health", (req, res) => res.json({ ok: true, service: "Marketing Akademiyasi" }));

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Ism kamida 2 ta belgidan iborat bo‘lsin." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Email manzili noto‘g‘ri." });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "Parol 8–128 ta belgidan iborat bo‘lishi kerak." });
    const passwordHash = await bcrypt.hash(password, 12);
    // Public registration always creates a student. Admin is bootstrapped separately from server secrets.
    const result = await pool.query(
      "INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'student') RETURNING id,name,email,role",
      [name, email, passwordHash]
    );
    const user = result.rows[0];
    await pool.query("INSERT INTO progress(user_id) VALUES($1) ON CONFLICT DO NOTHING", [user.id]);
    setTokenCookie(res, user);
    res.status(201).json({ user });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Bu email bilan akkaunt mavjud. Kirish bo‘limidan foydalaning." });
    console.error("register:", e.message);
    res.status(500).json({ error: "Ro‘yxatdan o‘tishda server xatoligi." });
  }
});
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const result = await pool.query("SELECT id,name,email,role,password_hash FROM users WHERE email=$1", [email]);
    if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) {
      return res.status(401).json({ error: "Email yoki parol noto‘g‘ri." });
    }
    const { password_hash, ...user } = result.rows[0];
    setTokenCookie(res, user);
    res.json({ user });
  } catch (e) {
    console.error("login:", e.message);
    res.status(500).json({ error: "Kirishda server xatoligi." });
  }
});
app.get("/api/auth/me", auth, (req, res) => res.json({ user: req.user }));
app.post("/api/auth/logout", (req, res) => { clearTokenCookie(res); res.json({ ok: true }); });

app.get("/api/progress", auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT data FROM progress WHERE user_id=$1", [req.user.id]);
    res.json(result.rows[0]?.data || { done: [], custom: [], history: [], tutorHistory: [] });
  } catch (e) { console.error("progress get:", e.message); res.status(500).json({ error: "Natijalarni olishda xatolik." }); }
});
app.put("/api/progress", auth, async (req, res) => {
  try {
    const data = {
      done: Array.isArray(req.body.done) ? req.body.done.slice(0, 500) : [],
      custom: Array.isArray(req.body.custom) ? req.body.custom.slice(0, 200) : [],
      history: Array.isArray(req.body.history) ? req.body.history.slice(0, 500) : [],
      tutorHistory: Array.isArray(req.body.tutorHistory) ? req.body.tutorHistory.slice(0, 500) : [],
    };
    await pool.query(
      "INSERT INTO progress(user_id,data,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",
      [req.user.id, JSON.stringify(data)]
    );
    res.json({ ok: true });
  } catch (e) { console.error("progress put:", e.message); res.status(500).json({ error: "Natijalarni saqlashda xatolik." }); }
});

app.post("/api/ai/grade", auth, aiLimiter, async (req, res) => {
  const question = String(req.body.question || "").trim().slice(0, 3000);
  const answer = String(req.body.answer || "").trim().slice(0, 8000);
  if (!question || answer.length < 5) return res.status(400).json({ error: "Savol va kamida 5 belgili javob yuboring." });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "AI xizmati hali sozlanmagan. Hosting sozlamalarida OPENAI_API_KEY qo‘shilishi kerak." });
  try {
    const prompt = `Siz Marketing Akademiyasi uchun o‘zbek tilida ishlaydigan adolatli marketing o‘qituvchisiz. Talabaning javobini savolga mosligi, tushunchalarning aniqligi, qo‘llash va izoh sifati bo‘yicha baholang. Imlo xatolari uchun ortiqcha jazolamang. Faqat JSON qaytaring: {"score":0-100 oralig‘idagi butun son,"feedback":"aniq, foydali izoh","modelAnswer":"qisqa namunaviy javob"}. Javob uzunligining o‘zi uchun ball bermang; mazmunni baholang. Agar javob mavzudan tashqari bo‘lsa, past baho bering.`;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: JSON.stringify({ question, studentAnswer: answer }) }
        ]
      })
    });
    const raw = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error("AI provider error:", raw.error?.message || aiResponse.status);
      return res.status(502).json({ error: "AI xizmatidan javob olinmadi. API kaliti, hisob holati va model sozlamasini tekshiring." });
    }
    const content = raw.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content);
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const feedback = String(parsed.feedback || "Javob baholandi.").slice(0, 4000);
    const modelAnswer = String(parsed.modelAnswer || "Namunaviy javob mavjud emas.").slice(0, 4000);
    await pool.query(
      "INSERT INTO tutor_sessions(user_id,question,answer,score,feedback,model_answer) VALUES($1,$2,$3,$4,$5,$6)",
      [req.user.id, question, answer, score, feedback, modelAnswer]
    );
    res.json({ score, feedback, modelAnswer });
  } catch (e) {
    console.error("AI grade:", e.message);
    res.status(500).json({ error: "AI javobini qayta ishlashda xatolik." });
  }
});

app.get("/api/admin/stats", auth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Faqat administrator uchun." });
  const result = await pool.query("SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM tutor_sessions) AS ai_answers");
  res.json(result.rows[0]);
});
app.get("*", (req, res) => res.sendFile(require("path").join(__dirname, "public", "index.html")));
initDb().then(() => app.listen(PORT, () => console.log(`Marketing Akademiyasi listening on ${PORT}`)))
  .catch(e => { console.error("Database initialization failed:", e); process.exit(1); });
