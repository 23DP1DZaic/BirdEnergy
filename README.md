# Bird Energy

## Projekta apraksts

Bird Energy ir Telegram Mini App ar vienkāršu Flappy Bird stila spēli. Lietotājs atver lietotni Telegram vidē, vada putnu, izvairās no caurulēm un iegūst punktus. Kad spēle beidzas, rezultāts tiek saglabāts datubāzē.

Lietotnē lietotāji var apskatīt leaderboard tabulu, aktīvos challenge uzdevumus un savu profila statistiku. Administratoram ir pieejams atsevišķs administratora panelis, kurā var pievienot, apskatīt, rediģēt un dzēst challenge uzdevumus.

Projektā ir trīs lietotāju lomas:

- Guest - lietotājs, kurš nav veiksmīgi identificēts ar Telegram datiem; var apskatīt sākuma informāciju.
- User - identificēts Telegram lietotājs; var spēlēt, saglabāt rezultātus, apskatīt leaderboard, challenge un profilu.
- Administrator - identificēts lietotājs ar administratora tiesībām; papildus var pārvaldīt challenge uzdevumus.

Galvenās funkcijas:

- Flappy Bird stila spēle ar HTML5 Canvas
- Spēles rezultātu saglabāšana datubāzē
- Leaderboard ar Daily, Weekly un All Time periodiem
- Lietotāja profils ar labāko rezultātu un spēļu statistiku
- Challenge uzdevumi, piemēram, sasniegt noteiktu punktu skaitu vienā spēlē vai nospēlēt noteiktu spēļu skaitu
- Administratora Challenge CRUD funkcionalitāte
- Challenge meklēšana un filtrēšana
- Formu validācija un dzēšanas apstiprinājums

## Izmantotās tehnoloģijas

### Frontend

- React
- TypeScript
- Vite
- HTML5 Canvas
- Tailwind CSS vai CSS
- React Router

### Firebase un datubāze

- Firebase Hosting
- Cloud Firestore
- Firebase Cloud Functions
- Firebase Authentication ar custom token
- Firestore Security Rules

### Telegram

- Telegram Mini Apps API
- Telegram WebApp initData

### Izstrādes un organizēšanas rīki

- GitHub - versiju kontrole un komandas kopīgais repozitorijs
- Trello - Kanban metodes uzdevumu plānošana
- Figma - lietotnes ekrānu skices un dizains(https://www.figma.com/design/xwMlw2tNlUCefyzVseyBTm/Bird-Energy?node-id=0-1&t=PrC2u6jPggu5nt5c-1)
- draw.io - sistēmas arhitektūras, ER un use case diagrammas(https://drive.google.com/file/d/1zYUmfxyr0Mf_M9AZopcbhHjV6l6wG1Kn/view?usp=sharing)

## Projekta struktūra

```text
bird-energy/
├── src/
│   ├── components/       # Kopīgie UI komponenti
│   ├── features/         # Game, auth, leaderboard, challenges un profile funkcijas
│   ├── firebase/         # Firebase klienta konfigurācija un servisi
│   ├── pages/            # Lietotnes ekrāni
│   ├── types/            # TypeScript tipi
│   ├── utils/            # Palīgfunkcijas
│   └── App.tsx
├── functions/
│   └── src/              # Firebase Cloud Functions
├── public/               # Statiskie resursi
├── tests/                # Automatizētie testi
├── firestore.rules       # Firestore drošības noteikumi
├── firestore.indexes.json
├── firebase.json
├── .env.example
└── README.md
```

## Komandas dalībnieki un lomas

### Dalībnieks 1 (Deniss) - Spēle un Frontend

Atbild par Flappy Bird spēles mehāniku, Canvas implementāciju, Game ekrānu, rezultātu ekrānu, spēles lietotāja saskarni, responsīvu Canvas darbību un spēles loģikas testiem.

### Dalībnieks 2 (Dmitrijs) - Firebase un datu slānis

Atbild par Firebase konfigurāciju, Cloud Firestore datubāzi, Firebase Hosting, Firebase custom token autentifikāciju, spēles rezultātu saglabāšanu, Firestore Security Rules un leaderboard datu servisiem.

### Dalībnieks 3 (Alberts) - Telegramm bots, mini app pārvalde

Atbild par Telegramm botu tā komandām, izskatu un Telegram initData verifikāciju. Mini app pārvalde.

### Dalībnieks 4 (Rodions) - Challenges, administrators un kvalitāte

Atbild par Challenges ekrānu, administratora paneli, Challenge CRUD funkcionalitāti, formu validāciju, dzēšanas apstiprinājumu, meklēšanu un filtrēšanu, integrācijas testēšanu, manuālo testu plānu, dokumentāciju un demo sagatavošanu.

Visi komandas dalībnieki piedalās GitHub repozitorija uzturēšanā, Trello uzdevumu plānošanā, code review, kļūdu labošanā, dokumentācijas sagatavošanā un projekta prezentācijā.

## Projekta ierobežojumi

Lai projekts būtu reāli pabeidzams noteiktajā laikā, tajā netiks īstenotas šādas funkcijas:

- Multiplayer režīms
- WebSocket savienojumi
- Matchmaking un spēļu istabas
- Čats vai draugu sistēma
- Maksājumi un virtuālā ekonomika
- Sarežģīta sasniegumu sistēma
- Papildu spēles režīmi
- Atsevišķa mobilā lietotne
- Mikroservisi
- Sarežģīta stāvokļa pārvaldība

Galvenais princips ir izveidot pēc iespējas vienkāršāku sistēmu, kas pilnībā atbilst projekta prasībām.

## Testi

Cloud Functions un validācijas testi atrodas `functions/test/`. Tie neprasa
emulatoru vai Firebase akreditāciju — Firestore un Auth tiek aizstāti ar
vienkāršiem in-memory dubultniekiem, tāpēc testus var palaist lokāli bez
papildu iestatīšanas:

```bash
cd functions
npm test
```

Testi pārklāj gan derīgus, gan nederīgus ievaddatus: Telegram `initData`
pārbaudi (AUTH-02), lomu noteikšanu (AUTH-03), challenge formas un spēlētāja
vārda noteikumus, kā arī katras Cloud Function uzņemšanos ar tiesībām un bez
tām. `adminChallengeMutation` testi pierāda, ka lietotājs bez administratora
lomas tiek noraidīts (`permission-denied`) un ka create/update izmaiņas nonāk
datubāzē.

Spēles loģikas testi atrodas `src/features/game/engine.test.ts`. `engine.ts`
apzināti nesatur DOM kodu, tāpēc visu spēles gaitu var vadīt kadru pa kadram no
Node — bez pārlūka, emulatora un papildu atkarībām (iebūvētais `node:test`;
nepieciešams Node 22.18+):

```bash
cd birdenergy
npm test
```

`npm test` vispirms pārbauda testu tipus (`tsc -p tsconfig.test.json`, jo
`tsconfig.app.json` ir pārlūka konfigurācija bez Node tipiem) un pēc tam palaiž
testus. Tie pārklāj gravitāciju un kritiena ātruma ierobežojumu, lēciena
impulsu, sadursmes ar zemi, griestiem un caurulēm, punktu skaitīšanu, nāves
animāciju un Play Again atiestatīšanu, kā arī `runResult` datus, ko nosūta
`submitGameResult`.

### Firestore drošības noteikumu testi (SEC-01)

`firestore.rules` tiek pārbaudīti pret īsto Firestore emulatoru ar
`@firebase/rules-unit-testing`. Testi atrodas `test/firestore.rules.test.ts`
un palaiž noteikumus trīs klienta stāvokļos: **viesis** (bez sesijas),
**spēlētājs** (`role: 'user'`) un **administrators** (`role: 'admin'`).

```bash
npm run test:rules
```

Skripts pats palaiž un aptur emulatoru
(`firebase emulators:exec --only firestore`). Nepieciešama **Java 17+**
(Firestore emulators ir Java lietotne) un pieejams `firebase-tools` — skripts
izmanto `npx firebase-tools`, tāpēc atsevišķa instalācija nav vajadzīga.
`npm test` pārbauda arī šo testu tipus (`tsc -p tsconfig.test.json`).

Ja datorā nav Java, to var uzstādīt projekta iekšienē (`.tools/`, gitignored):

```bash
npm run setup:test-tools   # Temurin JRE 21 priekš šīs OS/arhitektūras
```

`npm run test:rules` vispirms meklē `.tools/jre`, tad `JAVA_HOME`, tad `java`
uz `PATH`, tāpēc pēc šīs komandas nekas cits nav jākonfigurē. Skripti ir
krustplatformu Node skripti (`scripts/*.mjs`), tāpēc strādā arī uz Windows:
`setup:test-tools` izvēlas arhīva formātu pēc OS (Adoptium Windows vidē
piegādā ZIP, citur `.tar.gz`) un izmanto sistēmas `tar` (`%SystemRoot%`
`\System32\tar.exe` mēdz būt bsdtar, kas prot arī ZIP; rezerves variants ir
PowerShell `Expand-Archive`).

Testi pierāda, ka:

* neviens no trim stāvokļiem nevar tieši rakstīt `users`, `gameResults` vai
  `challenges` kolekcijās — arī ne paša profila īpašnieks, ne administrators
  (rakstīšana notiek tikai Cloud Functions ar Admin SDK, kas šos noteikumus
  apiet pēc konstrukcijas);
* viesim nav lasīšanas tiesību nekur;
* spēlētājs lasa tikai savu `users/{uid}` profilu un tikai savus
  `gameResults` ierakstus — vaicājumam jābūt ierobežotam ar `uid`, un
  nefiltrēti, cita lietotāja, diapazona (`>=`) un `in` vaicājumi tiek noraidīti;
* `users` saraksts nav lasāms (līderu tabulu apkalpo `getLeaderboard`), bet
  `challenges` sarakstu var lasīt jebkurš pierakstīts lietotājs;
* jebkurš cits ceļš, arī apakškolekcijas, ir aizliegts.

### Kļūdu testēšanas protokols

Negatīvo scenāriju (nederīga ievade, nepilnvarota piekļuve, servisa kļūdas)
rezultāti apkopoti `docs/kludu-testesana/`. Dokumentu ģenerē
`python docs/kludu-testesana/build.py` (vajadzīgs `python-docx`), tāpēc tas
vienmēr atbilst palaistajiem testiem, nevis manuāli pārrakstītiem skaitļiem.
Rodas divi dokumenti ar vienu un to pašu datu avotu:

* `Kludu_testesanas_protokols.docx` — pilnais protokols (vide, klasifikācija,
  kopsavilkums, visi testu protokoli, manuālie testi, secinājumi);
* `Programmatura_lietojamibas_testsana.docx` — tā pati pārbaude studiju
  programmas parauga formātā kā 7. nodaļa ar tabulām 7.1 (testēšanas dati),
  7.2 (detalizētie kļūdu testa gadījumi) un 7.3 (identificēto kļūdu
  novēršana un atkārtota testēšana).

Abiem blakus tiek rakstīts tas pats saturs kā Markdown (`*.md`).

### Noteikumu izvietošana

`firestore.rules` ir izvietoti projektā `birdenergy-f1405`, tāpēc emulatora
testi un produkcija izmanto vienu un to pašu failu:

```bash
npx firebase-tools login                                  # vienreiz, ar pārlūku
npx firebase-tools deploy --only firestore:rules --project birdenergy-f1405
```

Izvietotais ruleset (`releases/cloud.firestore`) pēc izvietošanas tika
nolasīts atpakaļ no Firebase Rules API un salīdzināts ar `firestore.rules` —
69 rindas, saturs sakrīt 1:1. Bez pārlūka (piem., CI) login var veikt
neinteraktīvi: `firebase login --non-interactive` izdrukā saiti un saglabā
sesiju, bet `firebase login <kods>` to pabeidz.

## Veiktspēja mobilajās ierīcēs

Spēles ekrāns no jauna zīmē visu ainu katrā `requestAnimationFrame` kadru, tāpēc
vidējas klases Android ierīcēs dominē aizpildīto pikseļu skaits. Lai uz tādām
ieturētu 60 fps, `src/features/game/GameCanvas.tsx` lieto adaptīvu
izšķirtspējas kāpni:

- sākuma mērogs ir `min(devicePixelRatio, 2)` (3× telefonam tas ir 55% mazāk
  pikseļu nekā pilna izšķirtspēja);
- ja pēdējo 60 kadru logā vismaz 8 kadri pārsniedz 25 ms, mērogs pazeminās
  (2× → 1,5× → 1×) un aina tiek pārzīmēta tajā pašā taktē;
- mērogs atkal paceļas tikai pēc 240 tīriem kadriem un tikai ārpus spēles
  gaitas, lai ierīce uz robežas nešūpotos starp diviem mērogiem.

Fizika, punkti un paliek loģiskajās koordinātās (480 × viewH), tāpēc mērogs
maina tikai attēla asumu, nevis spēli. Papildus spēles HUD teksts (`Tap to
flap`, punktu skaitītājs) tiek reizrasterizēts nelielā kešotā slānī un katrā
kadrā tikai `drawImage` vietā `strokeText` + `fillText`, un, ja panels ir
ātrāks par 60 Hz, zīmēšana ir ierobežota līdz ~60 kadriem sekundē (loģika
joprojām soļo katrā kadrā).

Izstrādes režīmā (`npm run dev`) ekrāna augšējā kreisajā stūrī ir redzama
veiktspējas pārklājuma informācija (fps, kadra laiks, zīmēšanas laiks,
aktīvais mērogs). Tie paši skaitļi pieejami konsolē kā `window.__birdPerf`;
`window.__birdSetScaleStep(0|1|2)` piespiedu kāpj pa mēroga skalām manuālai
pārbaudei. Produkcijas būvējumā (`npm run build`) šī koda nav.

## Local development without Telegram (dev login)

Normally the app can only sign in inside Telegram, because `authenticateTelegram`
requires signed `initData`. For local browser work you can sign in as any
Telegram id through the **Functions emulator**:

1. Add your own Telegram id to `birdenergy/.env` (gitignored). You can see it
   via @userinfobot in Telegram:

   ```env
   VITE_TELEGRAM_ID=123456789
   VITE_USE_EMULATORS=true
   ```

2. Start the emulator suite (Auth + Firestore + Functions). `functions/.env`
   already holds the real bot token, so initData validation still works there:

   ```bash
   cd functions && npm run build && cd ..
   npx firebase-tools emulators:start --only auth,firestore,functions --project birdenergy-f1405
   ```

3. In a second terminal: `npm run dev` → http://localhost:5173

The app signs in automatically as `VITE_TELEGRAM_ID` and keeps the session like
a real login (the emulator UI opens on http://localhost:4000). Add that id to
`ADMIN_TELEGRAM_IDS` in `functions/.env` to get the admin role locally too.

### Opening the app in a browser (no dev login)

Without `VITE_TELEGRAM_ID` a browser visitor cannot sign in at all (no signed
`initData`), so the page shows an **Open @BirdEnergy_testbot** link instead,
pointing at the Mini App deep link `t.me/BirdEnergy_testbot/birdenergygame` —
Telegram opens the app, where sign-in does work. The bot and short name come
from `VITE_TELEGRAM_BOT_USERNAME` / `VITE_TELEGRAM_APP_NAME` in `.env`
(defaults match the values above; see `src/telegram.ts`). The sign-in button
only appears in a browser while `VITE_USE_EMULATORS=true`, because the dev
bypass exists in the emulator only.

Why it is safe: the bypass lives in `resolveDevTelegramUser()`
(`functions/src/telegramAuth.ts`) and only returns a user when
`FUNCTIONS_EMULATOR=true`, so deployed functions reject a client-supplied
`devTelegramId` and fall back to strict initData validation. On the client,
`src/devAuth.ts` is gated on `import.meta.env.DEV`, so the whole path is
dropped from `npm run build` output. Role resolution is untouched — it always
comes from the server-side whitelist.













---


# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).


