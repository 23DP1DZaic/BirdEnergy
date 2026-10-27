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

## Lietošanas instrukcija

### Bota atrašana un palaišana

1. Atver Telegram (telefonā vai datorā), ieraksti meklēšanā
   `@BirdEnergy_testbot` vai atver saiti
   [t.me/BirdEnergy_testbot](https://t.me/BirdEnergy_testbot).
2. Nospied pogu **Start** (komanda `/start`). Bots atbild ar sveicienu un
   pogām **Spēlēt Bird Energy**, **Profils**, **Reitings** un **Kā spēlēt**.
3. Nospied **Spēlēt Bird Energy** - spēle atveras Telegram iekšienē kā Mini
   App. Nekas nav jāinstalē: tā darbojas gan telefonā, gan datorā.

### Pieteikšanās

Atsevišķa reģistrācija, e-pasts vai parole nav vajadzīga. Atverot spēli no
bota, Telegram nodod lietotnei parakstītus lietotāja datus (`initData`), un
serveris tos pārbauda ar HMAC-SHA256. Ja paraksts neder, lietotne paliek viesa
režīmā: var apskatīt sākuma informāciju, bet nevar spēlēt un saglabāt
rezultātus. Pirmajā pieteikšanās reizē tiek izveidots profils, un spēle
pajautā atļauju izmantot Telegram datus.

### Kā spēlēt

1. Nospied **Spēlēt** - spēle sākas ar pirmo pieskārienu ekrānam.
2. Pieskarties ekrānam (datorā var arī `Space`), lai putns palēktos.
3. Lido starp caurulēm: katra pārvarētā caurule dod vienu punktu, bet
   sadursme ar cauruli vai zemi beidz spēli.
4. Pēc spēles beigām rezultāts tiek saglabāts profilā, un par to tiek
   piešķirtas monētas.
5. Spēles laikā augšējā labajā stūrī ir poga **Pauze**. Pauzes izvēlnē var
   turpināt spēli, sākt to no jauna un noregulēt mūziku, skaņas efektus un to
   skaļumu.
6. Poga **Dalīties ar rezultātu** pēc spēles beigām nosūta rezultātu draugam
   Telegram čatā.

### Punkti, monētas un izskats

Punkti ir spēles rezultāts, bet monētas - iekšējā valūta. Monētas tiek
piešķirtas par katru nospēlēto spēli, un tās var iztērēt **Profilā**, kur
pieejami putna skini, debesis un zeme. Iegādātais izskats paliek profilā, un to
var mainīt jebkurā laikā: izvēlētie skini, debesis un zeme uzreiz redzami gan
sākumlapā, gan spēlē.

### Reitings un izaicinājumi

- **Reitings** rāda labākos rezultātus par dienu, nedēļu un visu laiku. Tabulā
  redzams spēlē ievadītais vārds, nevis Telegram lietotājvārds; vārdu var
  mainīt Profilā.
- **Izaicinājumi** ir dienas uzdevumi, piemēram, sakrāt noteiktu punktu skaitu
  vai nospēlēt noteiktu spēļu skaitu. Izpildīta uzdevuma atlīdzība jāsaņem ar
  pogu **Saņemt**, un tā jāpaņem tajā pašā dienā (pēc Rīgas laika).
- Administratoram papildus pieejams administratora panelis izaicinājumu
  pievienošanai, labošanai un dzēšanai.

### Bota komandas

| Komanda | Ko dara |
| --- | --- |
| `/start` | Sveiciens un galvenā izvēlne |
| `/top`, `/leaderboard` | Labāko spēlētāju desmitnieks |
| `/me`, `/profile` | Tavs profils un izvēlētais izskats |
| `/howtoplay` | Īsa pamācība ar animāciju |

## Izmantotās tehnoloģijas

### Frontend

- React 19
- TypeScript
- Vite 8 (izstrādes serveris un produkcijas būvējums)
- HTML5 Canvas 2D - visa spēle tiek zīmēta manuāli (`src/features/game/`), bez spēļu dzinēja
- Parasts CSS (`src/App.css`, `src/index.css`)
- Pašrakstīta navigācija (`src/navigation.ts`)
- Pašrakstīts i18n slānis ar trim valodām (en / lv / ru), pēc noklusējuma latviešu valoda, izvēle saglabājas ierīcē (`src/i18n.ts`)
- Pārlūka API: Web Audio, Vibration API, `navigator.share`, `localStorage`

### Firebase un datubāze

- Firebase Hosting (projekts `birdenergy-f1405`)
- Cloud Firestore (kolekcijas + apakškolekcijas; viens saliktais indekss)
- Firebase Cloud Functions v2 (Node.js 24, reģions `europe-north1`, 9 izsaucamās funkcijas + 1 HTTP webhook)
- Firebase Authentication ar custom token
- Firestore Security Rules (+ testi pret Firestore emulatoru)

### Telegram

- Telegram Mini Apps API (`telegram-web-app.js`)
- Telegram WebApp `initData` ar servera puses HMAC-SHA256 pārbaudi
- Telegraf 4 - bota komandas un interaktīvā izvēlne caur webhook

### Testēšana

- Node iebūvētais `node:test`
- `@firebase/rules-unit-testing` pret īstu Firestore emulatoru (nepieciešama Java 21, `npm run setup:test-tools`)
- In-memory Firestore/Auth dubultnieki Cloud Functions testiem (nav vajadzīgs emulators vai Firebase akreditācija)

### Izstrādes un organizēšanas rīki

- GitHub - versiju kontrole un komandas kopīgais repozitorijs
- Trello - Kanban metodes uzdevumu plānošana
- Figma - lietotnes ekrānu skices un dizains
- draw.io - sistēmas arhitektūras, ER un use case diagrammas

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
├── test/                 # Automatizētie testi
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

### Dalībnieks 3 (Alberts) - Telegram bots, Mini App pārvalde

Atbild par Telegram botu, tā komandām, izskatu un Telegram initData verifikāciju. Mini App pārvalde.

### Dalībnieks 4 (Rodions) - Challenges, administrators un kvalitāte

Atbild par Challenges ekrānu, administratora paneli, Challenge CRUD funkcionalitāti, formu validāciju, dzēšanas apstiprinājumu, meklēšanu un filtrēšanu, integrācijas testēšanu, manuālo testu plānu, dokumentāciju un demo sagatavošanu.

Visi komandas dalībnieki piedalās GitHub repozitorija uzturēšanā, Trello uzdevumu plānošanā, koda pārskatīšanā, kļūdu labošanā, dokumentācijas sagatavošanā un projekta prezentācijā.

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
emulatoru vai Firebase akreditāciju - Firestore un Auth tiek aizstāti ar
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
Node - bez pārlūka, emulatora un papildu atkarībām (iebūvētais `node:test`;
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
(Firestore emulators ir Java lietotne) un pieejams `firebase-tools` - skripts
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
  `challenges` kolekcijās - arī ne paša profila īpašnieks, ne administrators
  (rakstīšana notiek tikai Cloud Functions ar Admin SDK, kas šos noteikumus
  apiet pēc konstrukcijas);
* viesim nav lasīšanas tiesību nekur;
* spēlētājs lasa tikai savu `users/{uid}` profilu un tikai savus
  `gameResults` ierakstus - vaicājumam jābūt ierobežotam ar `uid`, un
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

* `Kludu_testesanas_protokols.docx` - pilnais protokols (vide, klasifikācija,
  kopsavilkums, visi testu protokoli, manuālie testi, secinājumi);
* `Programmatura_lietojamibas_testsana.docx` - tā pati pārbaude studiju
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
nolasīts atpakaļ no Firebase Rules API un salīdzināts ar `firestore.rules` -
69 rindas, saturs sakrīt 1:1. Bez pārlūka (piem., CI) login var veikt
neinteraktīvi: `firebase login --non-interactive` izdrukā saiti un saglabā
sesiju, bet `firebase login <kods>` to pabeidz.

## Lokālā izstrāde bez Telegram (izstrādes pieteikšanās)

Parasti lietotnē var pieteikties tikai Telegram iekšienē, jo
`authenticateTelegram` pieprasa parakstītu `initData`. Lai strādātu pārlūkā,
vari pieteikties ar jebkuru Telegram id, izmantojot **Functions emulatoru**:

1. Pievieno savu Telegram id failam `birdenergy/.env` (tas ir gitignored). Savu
   id var uzzināt, rakstot @userinfobot Telegram:

   ```env
   VITE_TELEGRAM_ID=123456789
   VITE_USE_EMULATORS=true
   ```

2. Palaid emulatorus (Auth + Firestore + Functions). Failā `functions/.env` jau
   ir īstais bota tokens, tāpēc arī `initData` pārbaude tur strādā:

   ```bash
   cd functions && npm run build && cd ..
   npx firebase-tools emulators:start --only auth,firestore,functions --project birdenergy-f1405
   ```

3. Otrā terminālī: `npm run dev` → http://localhost:5173

Lietotne automātiski pieteiksies kā `VITE_TELEGRAM_ID` un saglabās sesiju tāpat
kā īstā pieteikšanās reizē (emulatora panelis atveras
http://localhost:4000). Pievieno šo id `ADMIN_TELEGRAM_IDS` sarakstam failā
`functions/.env`, lai lokāli iegūtu arī administratora lomu.

### Lietotnes atvēršana pārlūkā (bez izstrādes pieteikšanās iespējas)

Bez `VITE_TELEGRAM_ID` pārlūka apmeklētājs nevar pieteikties (nav parakstīta
`initData`), tāpēc lapa rāda saiti **Atvērt Telegram botu**, kas ved uz Mini App
deep link `t.me/BirdEnergy_testbot/birdenergygame` - Telegram atver lietotni,
kur pieteikšanās strādā. Bota vārds un īsais nosaukums nāk no
`VITE_TELEGRAM_BOT_USERNAME` / `VITE_TELEGRAM_APP_NAME` (noklusējuma vērtības
sakrīt ar iepriekš minētajām; sk. `src/telegram.ts`). Pieteikšanās poga pārlūkā
parādās tikai tad, ja `VITE_USE_EMULATORS=true`, jo izstrādes apiešana pastāv
tikai emulatorā.

Kāpēc tas ir droši: apiešana dzīvo `resolveDevTelegramUser()`
(`functions/src/telegramAuth.ts`) un atgriež lietotāju tikai tad, ja
`FUNCTIONS_EMULATOR=true`, tāpēc izvietotās funkcijas noraida klienta norādīto
`devTelegramId` un pārbauda `initData` stingri. Klientā `src/devAuth.ts` ir
aizsargāts ar `import.meta.env.DEV`, tāpēc šis ceļš pazūd no `npm run build`
izvades. Lomu noteikšana netiek mainīta - tā vienmēr nāk no servera puses
saraksta.
