# Marketing Akademiyasi

Marketing Akademiyasi — o‘zbek tilidagi marketing o‘quv platformasi. Unda kurslar, testlar, topshiriqlar, foydalanuvchi akkauntlari, progressni PostgreSQL’da saqlash va OpenAI orqali AI Mentor baholashi mavjud.

## Deploy

Loyiha Render uchun `render.yaml` bilan sozlangan. GitHub repository ildizida quyidagi fayllar bo‘lishi kerak:

- `server.js`
- `package.json`
- `render.yaml`
- `public/index.html`
- `.gitignore`
- `DEPLOY_UZ.md`

Render’da **Blueprint** orqali repository’ni ulash eng qulay yo‘l: konfiguratsiya Web Service va PostgreSQL bazasini yaratishni so‘raydi. `ADMIN_EMAIL`, `ADMIN_PASSWORD` va `OPENAI_API_KEY` qiymatlarini Render Environment Variables so‘raganida kiriting.

**AI Mentor:** `OPENAI_API_KEY` bo‘lmasa, haqiqiy AI baholashi ishlamaydi. Kalitni faqat Render’dagi server Environment Variables ichiga kiriting, GitHub yoki HTML ichiga hech qachon qo‘ymang. OpenAI API ishlatish uchun API billing/credit talab qilinishi mumkin.

**Eslatma:** Render’ning bepul PostgreSQL bazasi 30 kundan keyin tugaydi. Uzoq muddatli, muhim ma’lumotlar uchun doimiy saqlash shartlarini tekshirib, mos bazani tanlang.
