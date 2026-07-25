# WhatsApp AI SaaS Sales Agent & Multi-Tenant Broker System 🚀

Jukwaa la kisasa, lenye uwezo mkubwa wa kukua (SaaS - Software as a Service) la **WhatsApp AI Sales Agent na Kariakoo Broker System**. Mfumo huu unawawezesha **wafanyabiashara wengi (merchants)** kujisajili, kuwa na dashboards zao binafsi za usimamizi, na kila mmoja kuunganisha namba yake ya WhatsApp kipekee.

---

## 🔥 Vipengele Vikuu vya Mfumo (Core SaaS Features)

### 1. 🐘 PostgreSQL Database & Supabase
- Mfumo sasa umejengwa juu ya **PostgreSQL (Supabase)**, na hivyo una uwezo wa kuhudumia maelfu ya wafanyabiashara na mamilioni ya jumbe bila kukwama.

### 2. 👑 Super Admin Dashboard
- **Usimamizi Mkuu:** Jopo maalum kwa ajili ya mmiliki wa mfumo (`/superadmin/`) linalompa uwezo wa kuona takwimu zote za mfumo (Jumla ya Maduka, Oda, Wateja, na Matumizi ya AI).
- **Udhibiti wa Maduka:** Uwezo wa kusimamisha (Suspend) akaunti zinazokiuka taratibu au zisizolipia, kufuta akaunti, na kubadilisha kikomo cha matumizi ya AI (AI Limit) kwa kila duka.

### 3. 🛡️ Usalama Madhubuti (Rate Limiting & JWT)
- **Rate Limiting:** Njia za kujisajili na kuingia (Auth API) zimewekewa vizuizi (Rate Limiters) ili kuzuia mashambulizi ya kimtandao (Brute-force) na kuzuia watu kutengeneza akaunti feki nyingi (Spam).
- **Ulinzi wa JWT (SaaS Isolation):** Hakuna mfanyabiashara anayeweza kuona au kuingilia data za mwingine.
- **Terms & Conditions UI:** Mfumo wa kisasa wa makubaliano ya Vigezo na Masharti ambao wateja husoma kwanza kabla ya kujiunga.

### 4. 🤖 AI Waterfall Strategy (AI Limit & Fallback)
- **Matumizi ya AI Limit:** Kila duka linapewa idadi maalum ya "AI Limits". Zikiisha, AI inasimama kujibu na mfumo unamjulisha mteja, na kumuachia mmiliki wa duka kuendelea na mazungumzo (Human routing).
- **Fallback System:** Iwapo AI Provider mmoja (Mfano: Gemini) atashindwa kufanya kazi (Downtime), mfumo unahamia kiotomatiki kwa Provider mwingine (Mfano: Groq au DeepSeek) bila kukata huduma kwa wateja.

### 5. 📱 WhatsApp Multi-Session Manager (Namba Nyingi kwa Wakati Mmoja)
- **Concurrent Connections:** Mfumo una uwezo wa kuwasha na kusimamia soketi (sockets) nyingi za WhatsApp kwa wakati mmoja kupitia **WhatsApp Session Manager**.
- **Scan QR Code:** Kila mfanyabiashara anapoingia kwenye dashboard yake, anapata QR Code maalum kwa ajili ya duka lake ili kuunganisha WhatsApp yake.
- **Auto-Reconnect & Nightly Backups:** Server ikizimika na kuwaka tena, sessions zote zinaunganishwa kiotomatiki. Pia, mfumo unafanya **Backup ya Sessions zote** kila siku saa 8 usiku kwa kutengeneza faili la `.zip`.

### 6. 🏬 Kariakoo Broker Model (Maombi Maalum & Kutafuta Bidhaa)
- Mteja akiulizia bidhaa ambayo haipo kwenye database ya duka, AI inakusanya ombi lake kama **Special Request** na kulisajili kwenye dashboard.
- Mfanyabiashara akishapata bidhaa hiyo sokoni, anaweka bei halisi na kumuongeza mteja arifa ya WhatsApp kiotomatiki kwa kubonyeza kitufe kimoja.

### 7. 🛡️ Data Privacy & Ethical AI (Faragha ya Wateja)
- **First-Contact Consent:** Mteja mpya anapotuma ujumbe kwa mara ya kwanza, AI husitisha mauzo na kumuuliza kwanza ikiwa anataka kuhudumiwa na AI au aongee na mmiliki wa duka. AI itamuudumia tu endapo atakubali.

### 8. 🛒 Abandoned Cart Automation (Nudging)
- Unapitia kila mfanyabiashara na kutafuta wateja walioonyesha nia ya kununua lakini hawakuweka oda (ndani ya masaa 12). AI inazalisha ujumbe mfupi wa kirafiki (sentensi 1) wa Kiswahili na kuwatumia kiotomatiki kuwarudisha wakamilishe ununuzi.

### 9. 🧠 Context Compaction (Kupunguza Token Cost)
- Mazungumzo yakizidi kiwango cha ujumbe 15, mfumo unafanya muhtasari (compaction) wa maelezo muhimu ya mteja kupitia AI, unafuta ujumbe wa zamani, na kubakiza ujumbe chache. Hii inapunguza sana gharama za tokens za AI.

### 10. 📊 AI Business Advisor & Insights
- **Potential Customers (Hot Leads):** Orodha ya wateja wenye nia kubwa ya kununua.
- **Ushauri wa Kibiashara (Advice):** Ushauri wa vitendo wa mambo ya kufanya wiki hiyo kuongeza mauzo.

---

## 🛠️ Hatua za Kuweka Mfumo (Quick Setup)

### 1. Sakinisha dependencies zote
```bash
npm install
```

### 2. Weka Hifadhidata (Environment Variables)
Tengeneza faili la `.env` kwenye root directory (soma `config.js` kuona format kamili). 
Hakikisha unaweka URL ya Supabase PostgreSQL:
```env
DATABASE_URL="postgresql://postgres.[YOUR-PROJECT]:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1"
```

### 3. Tengeneza Database (Prisma)
```bash
npx prisma generate
npx prisma db push
```

### 4. Washa Server
```bash
npm start
```
Au kwa mode ya uendelezaji (development):
```bash
npm run dev
```

### 5. Ingia kwenye Dashboards
- **Dashboard ya Wafanyabiashara:** Fungua `http://localhost:3000/` kwenye browser na uingie au ujisajili.
- **Dashboard ya Super Admin:** Fungua `http://localhost:3000/superadmin/` kwenye browser. (Unaweza kutengeneza Super Admin akaunti yako kupitia node script, angalia mwongozo).

---

## 🤝 Msaada na Maendeleo
Mfumo huu umejengwa kwa kutumia Node.js, Express, Prisma ORM, na Baileys (WhatsApp Web API). Unabadilikabadilika na unaruhusu kuongeza API za malipo (Payment Gateways) kama M-PESA au Tigo Pesa kwa urahisi baadaye.
