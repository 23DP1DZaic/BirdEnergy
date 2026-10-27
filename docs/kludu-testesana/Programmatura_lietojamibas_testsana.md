## 7. PROGRAMMATŪRAS LIETOJAMĪBAS TESTĒŠANA

*Testēšanas vide: Windows 11 x64 · Node.js 22.21.0 · Java 21 (Temurin JRE, .tools/jre) · Firestore emulators (firebase-tools 15.29.0) · 2026. gada 20. oktobris*

Testēšanas mērķis ir pārbaudīt, vai lietotājs var veiksmīgi izmantot sistēmu — pierakstīties, saglabāt spēles rezultātu, apskatīt līderu tabulu un pārvaldīt izaicinājumus, — un vai sistēma korekti apstrādā kļūdainus datus. Tiek testēts ievades validācijas modulis, piekļuves tiesības un servera kļūdu apstrāde, izmantojot funkcionālo testēšanu.

Izveidoti testa gadījumi veiksmīgai darbībai, darbībai ar nederīgiem ievaddatiem un darbībai bez nepieciešamajām tiesībām. Pārbaudes veic automatizēti testi: spēles loģika un formu validācija (89 testi), Cloud Functions (103 testi) un Firestore drošības noteikumi pret īsto emulatoru (20 testi) — kopā 212 testi, no kuriem visi izgāja.

Testēšanas apraksts, gadījumi un rezultāti tiek parādīti 7.1. tabulā, detalizētie kļūdu testa gadījumi — 7.2. tabulā, bet identificētās kļūdas, to cēloņi un atkārtotās testēšanas rezultāti — 7.3. tabulā.

**7.1. Tabula — Programmatūras lietojamības testēšanas dati**

* Lietotāja loma: Viesis (nereģistrēts lietotājs), spēlētājs (role: user) un administrators (role: admin)
* Prasības identifikators: SEC-01 (drošības noteikumi), CH-03 (formu validācija), ADM-01 un ADM-02 (administrācija), AUTH-02, DATA-01, UI-03
* Prasības apraksts: Sistēma nedrīkst saglabāt nederīgus datus un nedrīkst pieļaut piekļuvi vai datu maiņu lietotājam bez attiecīgajām tiesībām. Jebkurā kļūdas gadījumā lietotājam jāparāda saprotams paziņojums, un dati nedrīkst tikt daļēji mainīti.

| Ievaddatu/situācijas apraksts | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|
| Viesis atver lietotni ārpus Telegram un mēģina pierakstīties | Sesija netiek izveidota; tiek piedāvāts atvērt lietotni Telegram | Sesija netiek izveidota; parādīta saite uz botu | Pareizi |
| Spēlētājs mēģina ierakstīt spēles rezultātu tieši datubāzē | Rakstīšana tiek liegta; rezultātu saglabā tikai serveris | Rakstīšana liegta (PERMISSION_DENIED) | Pareizi |
| Administrators ievada izaicinājuma formā nepilnīgus datus | Saglabāšana tiek bloķēta un kļūdainie lauki tiek atzīmēti | Saglabāšana bloķēta; norādīti visi seši kļūdainie lauki | Pareizi |
| Lietotājs bez administratora tiesībām mēģina mainīt izaicinājumu | Darbība tiek noraidīta ar paskaidrojumu | Noraidīts; parādīts administratora tiesību paziņojums | Pareizi |
| Cloud Functions serviss nav pieejams | Lietotājs saņem paziņojumu un dati netiek mainīti | Parādīts paziņojums, ka nekas nav mainīts | Pareizi |


**7.2. Tabula — Kļūdu testēšanas detalizētie dati**

Lai detalizēti pārbaudītu sistēmas uzvedību kļūdainas ievades, nepilnvarotas piekļuves un servisa kļūdu gadījumos, tika izpildīti robežvērtību un kļūdu testa gadījumi. Katrā gadījumā tika salīdzināts sagaidāmais rezultāts ar faktiski iegūto rezultātu. Testa gadījumu rezultāti apkopoti 7.2. tabulā; katrs gadījums norāda arī tā identifikatoru automatizēto testu kopā.

### 7.2.1. Ievades validācija (CH-03)

Testu kopa: src/features/challengeValidation.test.ts (npm test). Kļūdas tiek norādītas pa laukiem, un tās bloķē saglabāšanu.

| Nr. | ID | Testa gadījums | Ievaddati / darbība | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|---|---|---|
| 1 | KT-V-01 | Tukšas formas saglabāšana | Visi seši lauki tukši | Kļūda visos laukos; fokuss uz pirmo lauku | 6 kļūdas (title, description, type, targetValue, startDate, endDate); firstInvalidField = title | Pareizi |
| 2 | KT-V-02 | Nosaukums tikai no atstarpēm | title = "   " | validate.titleRequired | validate.titleRequired | Pareizi |
| 3 | KT-V-03 | Nosaukuma minimālais garums | title = 2 rakstzīmes | Kļūda ar {min: 3, count: 2} | validate.min {min: 3, count: 2} | Pareizi |
| 4 | KT-V-04 | Nosaukuma maksimālais garums | title = 81 rakstzīme | Kļūda ar {max: 80, count: 81} | validate.max {max: 80, count: 81} | Pareizi |
| 5 | KT-V-05 | Atstarpes nosaukuma malās | title = "  Spring  " | Pieņemts, atstarpes apgrieztas | Kļūdas nav | Pareizi |
| 6 | KT-V-06 | Apraksta minimālais garums | description = 5 rakstzīmes | Kļūda ar {min: 10, count: 5} | validate.min {min: 10, count: 5} | Pareizi |
| 7 | KT-V-07 | Apraksta maksimālais garums | description = 501 rakstzīme | Kļūda ar {max: 500, count: 501} | validate.max {max: 500, count: 501} | Pareizi |
| 8 | KT-V-08 | Izaicinājuma tips | Tips nav izvēlēts vai "bogus" | validate.type | validate.type | Pareizi |
| 9 | KT-V-09 | Tukšs mērķis | targetValue = "" | validate.targetRequired | validate.targetRequired | Pareizi |
| 10 | KT-V-10 | Mērķis nav skaitlis | targetValue = "abc", "12abc", "NaN", "Infinity" | validate.number | validate.number (visiem 4 variantiem) | Pareizi |
| 11 | KT-V-11 | Mērķis ar daļskaitli | targetValue = "1.5" | validate.whole | validate.whole | Pareizi |
| 12 | KT-V-12 | Nulle vai negatīvs mērķis | targetValue = "0", "-1", "-1000" | validate.positive | validate.positive (visiem 3 variantiem) | Pareizi |
| 13 | KT-V-13 | Mērķa robežvērtība | targetValue = 1 000 001 un 1 000 000 | Virs robežas — kļūda; tieši uz robežas — pieņemts | validate.maxTarget / bez kļūdas | Pareizi |
| 14 | KT-V-14 | Tukšs sākuma datums | startDate = "" | validate.startRequired | validate.startRequired | Pareizi |
| 15 | KT-V-15 | Neeksistējošs sākuma datums | startDate = "2026-02-31", "2026-13-01", "2026-00-10", "01.03.2026" | validate.startInvalid (datums netiek pārbīdīts uz citu dienu) | validate.startInvalid (visiem 4 variantiem) | Pareizi |
| 16 | KT-V-16 | Beigu datums pirms sākuma datuma | 10.03. → 09.03. | validate.endOrder | validate.endOrder | Pareizi |
| 17 | KT-V-17 | Sākuma un beigu datums vienā dienā | Sākums = beigas | Pieņemts | Kļūdu nav | Pareizi |
| 18 | KT-V-18 | Fokuss uz kļūdaino lauku | Kļūdains tikai mērķis (0) | Kļūda tikai mērķa laukā; fokuss uz to | 1 kļūda: targetValue; firstInvalidField = targetValue | Pareizi |
| 19 | KT-V-19 | Nederīgi dati netiek nosūtīti | Jebkurš nederīgs lauks | toChallengeInput atgriež null | null visos 6 scenārijos | Pareizi |
| 20 | KT-V-20 | Derīgu datu sagatavošana | Visi lauki aizpildīti pareizi | Beigu datums aizpilda visu dienu līdz 23:59:59.999 | 23:59:59.999; sākums 00:00 | Pareizi |
| 21 | KT-V-21 | Rediģēšanas režīms | Saglabāts izaicinājums → forma | Formas vērtības sakrīt ar saglabātajām | Visas 6 vērtības sakrīt | Pareizi |
| 22 | KT-V-22 | Validācijas ziņojumu tulkojumi | Visi 15 ziņojumi valodās en/lv/ru | Neviena neiztulkota atslēga, neviens neaizvietots {parametrs} | 15 ziņojumi × 3 valodas — visi tulkoti | Pareizi |
| 23 | KT-V-23 | Ziņojumi atšķiras starp valodām | Salīdzina en/lv/ru tekstus | 3 atšķirīgi teksti (nevis viena angļu teksta kopija) | 3 dažādi teksti | Pareizi |

### 7.2.2. Datumu apstrāde

Testu kopa: challengeValidation.test.ts. JavaScript Date pārbīda neeksistējošu dienu (31.02 → 3.03), tāpēc tiek pārbaudīts apgrieztais pārveidojums.

| Nr. | ID | Testa gadījums | Ievaddati / darbība | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|---|---|---|
| 24 | KT-D-01 | Garais un īsais gads | 2024-02-29 un 2026-02-29 | Pirmais derīgs, otrais nederīgs | date / null | Pareizi |
| 25 | KT-D-02 | Neeksistējoša mēneša diena | 31.02.2026 un 31.04.2026 | null — diena netiek pārbīdīta uz nākamo mēnesi | null / null | Pareizi |
| 26 | KT-D-03 | Datuma formāta stingrība | "2026-3-1", " 2026-03-01 ", "", "2026-03" | Tikai YYYY-MM-DD (ar atstarpēm malās) ir derīgs | null / derīgs / null / null | Pareizi |

### 7.2.3. Administratora darbību kļūdu paziņojumi (ADM-01, ADM-02)

Testu kopa: src/features/adminErrors.test.ts (npm test). Pārbauda, ko administrators redz, kad izaicinājuma izveide, labošana vai dzēšana neizdodas.

| Nr. | ID | Testa gadījums | Ievaddati / darbība | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|---|---|---|
| 27 | KT-A-01 | Nav administratora tiesību | functions/permission-denied, "Admin only. [403]" | Paskaidro, ka mainīt drīkst tikai administrators, bez statusa numura | Atbilst; [403] noņemts | Pareizi |
| 28 | KT-A-02 | Sesija nav derīga | functions/unauthenticated | Aicina pierakstīties vēlreiz | Satur "Sign in again" | Pareizi |
| 29 | KT-A-03 | Izaicinājums vairs neeksistē | functions/not-found, "Challenge not found. [404]" | Paskaidro, ka ieraksts vairs neeksistē | Satur "no longer exists"; [404] noņemts | Pareizi |
| 30 | KT-A-04 | Serviss nav pieejams | functions/unavailable | Paziņojums, ka nekas nav mainīts | "unreachable … nothing was changed" | Pareizi |
| 31 | KT-A-05 | Servera validācijas kļūda | functions/invalid-argument, "Title must be 3-80 characters. [400]" | Servera teksts bez statusa numura | "Title must be 3-80 characters." | Pareizi |
| 32 | KT-A-06 | Funkcija nav izvietota | functions/unimplemented | Paziņojums, ka funkcija nav sasniedzama un nekas nav mainīts | "could not be reached … nothing was changed" | Pareizi |
| 33 | KT-A-07 | Tukšs funkcijas maršruts | functions/not-found ar tekstu "NOT_FOUND" | Atpazīts kā nesasniedzama funkcija, nevis dzēsts izaicinājums | "could not be reached" | Pareizi |
| 34 | KT-A-08 | Servera iekšējā kļūda | functions/internal "internal [500]" un cita internal kļūda | Pirmā — nesasniedzama funkcija; otrā — teksta paziņojums | "could not be reached" / "Database write failed." | Pareizi |
| 35 | KT-A-09 | Nezināms kļūdas kods | Kods ar teksta ziņojumu | Teksts tiek parādīts lietotājam | "Boom." | Pareizi |
| 36 | KT-A-10 | Tukša kļūdas vērtība | null, undefined vai tukšs ziņojums | Vispārīgs paziņojums, nevis "null" vai tukša rinda | "Something went wrong and nothing was changed." | Pareizi |

### 7.2.4. Firestore drošības noteikumi (SEC-01) — nepilnvarota piekļuve

Testu kopa: test/firestore.rules.test.ts pret īsto Firestore emulatoru (npm run test:rules). Tiek izmantoti tie paši noteikumi, ko izvieto Firebase (firestore.rules).

| Nr. | ID | Testa gadījums | Ievaddati / darbība | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|---|---|---|
| 37 | KT-R-01 | Viesis lasa profilu pēc id | Bez sesijas, users/{uid} | PERMISSION_DENIED | Liegts | Pareizi |
| 38 | KT-R-02 | Viesis lasa izaicinājumus | Bez sesijas, challenges saraksts un dokuments | PERMISSION_DENIED | Liegts (abos gadījumos) | Pareizi |
| 39 | KT-R-03 | Viesis lasa spēles rezultātus | Bez sesijas, gameResults | PERMISSION_DENIED | Liegts | Pareizi |
| 40 | KT-R-04 | Viesis mēģina rakstīt | users, gameResults un challenges | PERMISSION_DENIED | Liegts (visās kolekcijās) | Pareizi |
| 41 | KT-R-05 | Spēlētājs lasa savu profilu | role: user, savs uid | Atļauts, atgriež inGameName | "Player One" | Pareizi |
| 42 | KT-R-06 | Spēlētājs lasa cita profilu | Cita lietotāja uid un viss users saraksts | PERMISSION_DENIED | Liegts | Pareizi |
| 43 | KT-R-07 | Spēlētājs raksta savu profilu | set, update (bestScore), delete, add, role: "admin" | PERMISSION_DENIED visiem | Liegts (arī paaugstināšana par administratoru) | Pareizi |
| 44 | KT-R-08 | Spēlētājs maina izaicinājumus | challenges: set, update, delete, add | Lasīt atļauts, rakstīt liegts | 1 dokuments lasīts; rakstīšana liegta | Pareizi |
| 45 | KT-R-09 | Spēlētājs vaicā savus rezultātus | where uid == savs id | Atļauts, atgriež tikai savu rezultātu | 1 ieraksts, score 42 | Pareizi |
| 46 | KT-R-10 | Piekļuve cita spēlētāja rezultātiem | Cita uid, vaicājums bez filtra, lasīšana pēc id, rakstīšana | PERMISSION_DENIED | Liegts visiem | Pareizi |
| 47 | KT-R-11 | Diapazona un in vaicājumi | where uid >= … un where uid in [a, b] | PERMISSION_DENIED — nevar apiet uid ierobežojumu | Liegti abi | Pareizi |
| 48 | KT-R-12 | Administratora lasīšanas un rakstīšanas tiesības | role: admin, lasīšana un rakstīšana | Lasa savu profilu un izaicinājumus; rakstīšana liegta | Tāpat kā spēlētājam, bez papildu tiesībām | Pareizi |
| 49 | KT-R-13 | Nezināmi un apakšceļi | secrets un users/{uid}/private | PERMISSION_DENIED viesim, spēlētājam un administratoram | Liegts visiem trim | Pareizi |

### 7.2.5. Cloud Functions (AUTH-02, DATA-01, ADM-01, UI-03) — servera kļūdas

Testu kopa: functions/test (103 testi). Serveris ir vienīgā rakstīšanas vieta, tāpēc tā noraidījumi ir drošības robeža: katrs scenārijs pārbauda konkrēto kļūdas kodu.

| Nr. | ID | Testa gadījums | Ievaddati / darbība | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|---|---|---|
| 50 | KT-F-01 | Autentifikācija bez initData | authenticateTelegram bez initData vai ar initData, kas nav virkne | invalid-argument | invalid-argument (abos) | Pareizi |
| 51 | KT-F-02 | Viltots initData hash | initData ar nepareizu hash | unauthenticated | unauthenticated | Pareizi |
| 52 | KT-F-03 | Klienta norādīts Telegram id | devTelegramId ārpus emulatora | invalid-argument — lokālās pieslēgšanās apiešana ir slēgta | invalid-argument | Pareizi |
| 53 | KT-F-04 | Trūkst bota tokena | Serverim nav konfigurēts TELEGRAM_BOT_TOKEN | failed-precondition (nevis klusa piekrišana) | failed-precondition | Pareizi |
| 54 | KT-F-05 | Rezultāta iesniegšana bez sesijas | submitGameResult bez sesijas | unauthenticated | unauthenticated | Pareizi |
| 55 | KT-F-06 | Nederīgs punktu skaits | score = -1, 1.5, 10001, "10", null | invalid-argument | invalid-argument (visiem 5) | Pareizi |
| 56 | KT-F-07 | Nederīgs spēles ilgums | durationMs = -1, 1.5, 21 600 001, "1000" | invalid-argument | invalid-argument (visiem 4) | Pareizi |
| 57 | KT-F-08 | Nederīgs lēcienu skaits | jumpCount = -1, 10001, 2.5 | invalid-argument | invalid-argument (visiem 3) | Pareizi |
| 58 | KT-F-09 | Rezultāts spēlētājam bez profila | Lietotājam nav izveidots profils | failed-precondition — vispirms jāpiekrīt datu apstrādei | failed-precondition | Pareizi |
| 59 | KT-F-10 | Atkārtots viens un tas pats rezultāts | runId nosūtīts divreiz (bezsaistes rinda) | Rezultāts netiek skaitīts divreiz | totalGames 1 → 1; paliek viens ieraksts | Pareizi |
| 60 | KT-F-11 | Nederīgs runId | runId = "../../oops" | Apstrādāts kā nav norādīts; kļūda netiek izmesta | Rezultāts saglabāts, 1 ieraksts | Pareizi |
| 61 | KT-F-12 | Izaicinājuma maiņa bez tiesībām | adminChallengeMutation bez sesijas, ar user lomu vai bez role claim | unauthenticated vai permission-denied; datubāzē nekas netiek ierakstīts | Atbilst; challenges kolekcija paliek tukša | Pareizi |
| 62 | KT-F-13 | Nederīga izaicinājuma darbība | Nezināma operācija, targetValue -1, update bez challengeId | invalid-argument | invalid-argument (visiem 4) | Pareizi |
| 63 | KT-F-14 | Neesošs izaicinājums | update neesošam challengeId | not-found | not-found | Pareizi |
| 64 | KT-F-15 | Profila atjaunināšana ar nederīgiem datiem | Tukšs patch; vārdi "ab", 21 zīme, "has space", "dash-name", ""; preferredX -1 un 1.5 | invalid-argument | invalid-argument (visiem variantiem) | Pareizi |
| 65 | KT-F-16 | Līderu tabulas parametri | getLeaderboard bez sesijas; period "yearly", {}, 3 | unauthenticated; invalid-argument | Atbilst | Pareizi |


**7.3. Tabula — Identificēto kļūdu novēršana un atkārtots testēšanas rezultāti**

Veicot programmatūras testēšanu, tika identificētas piecas kļūdas, kas ietekmēja sistēmas vai tās testu darbību. Katrai identificētajai kļūdai tika noteikts cēlonis un veikti nepieciešamie labojumi. Pēc kļūdu novēršanas tika veikta atkārtota testēšana, lai pārliecinātos par veikto labojumu korektumu. Identificētās kļūdas, to cēloņi, veiktie labojumi un atkārtotās testēšanas rezultāti apkopoti 7.3. tabulā.

| Nr. | Identificētā kļūda | Kļūdas cēlonis | Veiktā labošana | Atkārtots testēšanas rezultāts | Statuss |
|---|---|---|---|---|---|
| 1 | Testu tipu pārbaude krita ar TS2339 (import.meta.env), tāpēc kļūdu testus nevarēja palaist vispār | tsconfig.test.json tika veidots atsevišķi no aplikācijas konfigurācijas, un tajā trūka Vite klienta tipu | tsconfig.test.json tipu sarakstam pievienots "vite/client" | npm test tipu pārbaude iziet; palaižas 89 testi | Novērsta |
| 2 | node --test nevarēja ielādēt challengeValidation moduli (ERR_MODULE_NOT_FOUND) | Node ESM neatrisina importa ceļus bez faila paplašinājuma; Vite to pieļauj, tāpēc kļūda parādījās tikai testos | Importa ceļiem pievienots .ts paplašinājums | 26 formas validācijas testi iziet | Novērsta |
| 3 | Administrators kā kļūdas paziņojumu redzēja tekstu "null" | describeMutationError apstrādāja tikai Error objektus, bet ne null, undefined vai tukšu ziņojumu | Pievienota vispārīga atbilde "Something went wrong and nothing was changed." | KT-A-10 iziet; administratora panelī vairs nav "null" | Novērsta |
| 4 | npm run setup:test-tools neizdevās Windows vidē (tar: Cannot connect to C: resolve failed; gzip: more than one entry) | Skripts pieņēma, ka visās OS ir .tar.gz no absolūta ceļa, bet Adoptium Windows vidē piegādā ZIP, un GNU tar absolūto ceļu uztver kā tālvadības resursu | Ielādes formāts tiek izvēlēts pēc OS (ZIP Windows vidē); ekstrakcija notiek ar relatīviem ceļiem, izmantojot Windows bsdtar (rezerves variants — PowerShell Expand-Archive) | npm run setup:test-tools uzstāda Java 21 .tools/jre; npm run test:rules iziet (20 testi) | Novērsta |
| 5 | npm run test:rules krita ar "unknown option '--test'" | Windows vidē komanda tiek palaista ar shell, kas argumentu sarakstu sadala pa vārdiem, tāpēc testu komandas karodziņš --test nonāca firebase-tools opciju analizatorā | Testu komanda tiek ietverta pēdiņās tur, kur tiek izmantots shell | npm run test:rules iziet; 20 noteikumu testi pret emulatoru | Novērsta |


Pieci scenāriji — kļūdas ekrāns (ErrorBoundary) pārlūkā, bezsaistes rezultātu rinda, piekrišanas dialoga kļūda, trūkstošs audio fails un administratora paziņojums, kad funkcija nav izvietota — prasa pārlūku, tīkla pārtraukumu vai Telegram klientu. Tie nav izpildīti automatizēti, tāpēc to statuss ir "Jāveic manuāli", nevis "Pareizi".
