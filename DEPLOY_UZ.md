# Marketing Akademiyasi — deploy yo‘riqnomasi (o‘zbekcha)

## 1. GitHub’ga to‘g‘ri yuklash

ZIP ichidagi fayllarni oching. `marketing-akademiyasi` repository’ning **eng yuqori darajasida** `server.js`, `package.json`, `render.yaml` va `public` papkasi ko‘rinishi kerak. ZIP’ning o‘zini GitHub’ga yuklash yetarli emas — avval ZIP’ni ochib, ichidagi fayllarni yuklang.

Tuzilma shunday bo‘lsin:

```text
marketing-akademiyasi/
├── public/
│   └── index.html
├── .env.example
├── .gitignore
├── DEPLOY_UZ.md
├── package.json
├── README.md
├── render.yaml
└── server.js
```

`.env` fayli, parollar va API kalitlarini GitHub’ga yuklamang.

## 2. Render’da xizmat yaratish

1. Render dashboard’da **New → Blueprint** ni tanlang (agar Blueprint ko‘rinmasa, New → Web Service orqali repository’ni ulang, lekin database’ni alohida yaratish kerak bo‘ladi).
2. `marketing-akademiyasi` GitHub repository’ni tanlang.
3. `render.yaml` topilgach, Blueprint konfiguratsiyasini ko‘rib chiqing va yaratishni tasdiqlang.
4. `ADMIN_EMAIL` uchun administrator emailingizni kiriting.
5. `ADMIN_PASSWORD` uchun kamida 12 belgili kuchli parol kiriting.
6. `OPENAI_API_KEY` maydoniga OpenAI Platform’dan olingan API kalitni kiriting. Bu kalit ChatGPT parolingiz emas; API ishlatish xarajat talab qilishi mumkin.
7. Deploy tugashini kuting. Xizmat URL’i `https://...onrender.com` ko‘rinishida bo‘ladi.

## 3. AI Mentor’ni tekshirish

1. Saytni ochib, akkaunt yarating.
2. AI mentor bo‘limiga o‘ting va savolga kamida 5 belgili javob yozing.
3. `AI bahosi`, `feedback` va `namunaviy javob` chiqishini tekshiring.
4. Agar AI ishlamasa, Render → Web Service → Environment bo‘limida `OPENAI_API_KEY` borligini tekshiring; keyin Manual Deploy → Deploy latest commit qiling.
5. `https://SIZNING-SAYTINGIZ/api/health` manzili `{"ok":true,...}` qaytarishi kerak.

## Muhim cheklovlar

- `OPENAI_API_KEY` bo‘lmasa AI Mentor haqiqiy AI orqali baholay olmaydi.
- `render.yaml` bepul PostgreSQL yaratishni so‘raydi. Render’ning bepul PostgreSQL bazasi 30 kundan keyin tugaydi; davomiy ishlatish uchun muddat tugashidan oldin bazani ko‘chirish yoki tarifni yangilash kerak.
- Render Free Web Service bo‘sh turganda uxlab qolishi mumkin; birinchi ochilish sekinroq bo‘lishi mumkin.
- `JWT_SECRET` avtomatik yaratiladi. Uni foydalanuvchilarga ko‘rsatmang.

## Agar Render Web Service allaqachon yaratilgan bo‘lsa

Agar Render’da `marketing-akademiyasi` nomli Web Service oldindan yaratilgan bo‘lsa, fayllar GitHub’ga tushgach:

1. Render dashboard’da **New → PostgreSQL** orqali database yarating (Free reja mavjud bo‘lsa tanlashingiz mumkin; 30 kunlik cheklovga e’tibor bering).
2. Database sahifasidan **Internal Database URL** ni nusxalang.
3. Web Service → **Environment** bo‘limida quyidagilarni kiriting:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = database Internal URL
   - `JWT_SECRET` = kamida 32 belgili tasodifiy maxfiy matn
   - `ADMIN_EMAIL` = sizning emailingiz
   - `ADMIN_PASSWORD` = kamida 12 belgili kuchli parol
   - `OPENAI_API_KEY` = OpenAI API kalitingiz
   - `OPENAI_MODEL` = `gpt-4o-mini`
4. Saqlab, **Manual Deploy → Deploy latest commit** ni bosing.
