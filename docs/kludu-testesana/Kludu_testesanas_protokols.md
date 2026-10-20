# Kļūdu testēšanas protokols

**Bird Energy — Telegram Mini App spēle**

Negatīvo scenāriju pārbaude: ievade, tiesības, servisa kļūdas

| Lauks | Vērtība |
|---|---|
| Dokuments | Kļūdu testēšanas protokols |
| Projekts | Bird Energy — Telegram Mini App spēle |
| Repozitorijs | github.com/23DP1DZaic/BirdEnergy, atzars master |
| Darba autors | Dmitrijs Zaicevs |
| Datums | 2026. gada 20. oktobris |
| Testēšanas vide | Node.js 22.21.0 · Windows 11 x64 · Java 21 (Temurin JRE) · Firestore emulators (firebase-tools 15.29.0) |
| Metode | Automatizēti kļūdu ceļa testi (iebūvētais node:test) un Firestore drošības noteikumu testi pret īsto emulatoru |
| Rezultāts | 212 testi · 212 izgājuši · 0 krituši |

## 1. Testēšanas mērķis un tvērums

Protokola mērķis ir pārbaudīt, kā sistēma uzvedas kļūdainas ievades, nepilnvarotas piekļuves un servisa kļūmju gadījumos — nevis tikai to, vai lietotne strādā ar pareiziem datiem.

Pārbaudes tvērums:

• administrācijas izaicinājuma formas validācija (CH-03) un datumu apstrāde;

• admina darbību kļūdu ziņojumi (ADM-01, ADM-02);

• Firestore drošības noteikumi pret tiešu klienta rakstīšanu (SEC-01);

• Cloud Functions noraidījumi: autentifikācija, tiesības, ievades validācija (AUTH-02, DATA-01, ADM-01, UI-03);

• spēles loģikas robežgadījumi (gravitācija, sadursmes, punkti).

Ārpus tvēruma: slodzes testi, drošības uzlaušanas testi (pentest) un pārbaudes ar īstu Telegram klientu — tās prasa citu vidi.

## 2. Vide, rīki un metode

Visi testi tiek palaisti lokāli un neprasa Firebase akreditāciju. Cloud Functions testi aizstāj Firestore un Auth ar in-memory dubultniekiem, savukārt drošības noteikumi tiek palaisti pret īsto Firestore emulatoru.

Firestore emulators ir Java lietotne; Java 21 tiek uzstādīta projekta iekšienē ar `npm run setup:test-tools` (.tools/, gitignored), tāpēc vide ir atkārtojama arī pēc repozitorija jaunas klonēšanas.

| Statuss | Nozīme |
|---|---|
| Izgāja | Tests palaists; faktiskais rezultāts sakrīt ar sagaidāmo |
| Krita | Tests palaists; faktiskais rezultāts neatbilst sagaidāmajam |
| Jāveic manuāli | Nevar palaist šajā vidē (vajadzīgs pārlūks/Telegram klients) |

## 3. Rezultātu kopsavilkums

| Testu kopa | Testi | Izgāja | Krituši | Statuss |
|---|---|---|---|---|
| Spēles loģika (src/features/game/engine.test.ts) | 51 | 51 | 0 | Izgāja |
| Formas validācija — kļūdu ceļš (challengeValidation.test.ts) | 26 | 26 | 0 | Izgāja |
| Admina kļūdu ziņojumi (adminErrors.test.ts) | 12 | 12 | 0 | Izgāja |
| Cloud Functions (functions/test) | 103 | 103 | 0 | Izgāja |
| Firestore drošības noteikumi (test/firestore.rules.test.ts) | 20 | 20 | 0 | Izgāja |
| Kopā | 212 | 212 | 0 | Izgāja |


## 4. Testu protokoli

### 5.1. Formas validācija (CH-03) — kļūda lietotāja ievadē

Testu kopa: src/features/challengeValidation.test.ts (npm test). Pārbauda administrācijas paneļa izaicinājuma formas validāciju. Kļūdas tiek pieteiktas pa laukiem, un tās bloķē saglabāšanu.

| ID | Scenārijs / ievade | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|---|
| KT-V-01 | Tukša forma — saglabāšana | Kļūda visos sešos laukos; fokuss uz pirmo lauku (nosaukums) | 6 kļūdas: title, description, type, targetValue, startDate, endDate; firstInvalidField = title | Izgāja |
| KT-V-02 | Nosaukums tikai no atstarpēm | validate.titleRequired | validate.titleRequired | Izgāja |
| KT-V-03 | Nosaukums 2 rakstzīmes | Minimālā garuma kļūda ar {min: 3, count: 2} | validate.min {min: 3, count: 2} | Izgāja |
| KT-V-04 | Nosaukums 81 rakstzīme | Maksimālā garuma kļūda | validate.max {max: 80, count: 81} | Izgāja |
| KT-V-05 | Nosaukums "  Spring  " (atstarpes malās) | Pieņemts, atstarpes apgrieztas | Kļūdas nav | Izgāja |
| KT-V-06 | Apraksts 5 rakstzīmes | Minimālā garuma kļūda (10) | validate.min {min: 10, count: 5} | Izgāja |
| KT-V-07 | Apraksts 501 rakstzīme | Maksimālā garuma kļūda (500) | validate.max {max: 500, count: 501} | Izgāja |
| KT-V-08 | Izaicinājuma tips nav izvēlēts vai "bogus" | validate.type | validate.type | Izgāja |
| KT-V-09 | Mērķis tukšs | validate.targetRequired | validate.targetRequired | Izgāja |
| KT-V-10 | Mērķis "abc", "12abc", "NaN", "Infinity" | validate.number | validate.number (visiem 4 variantiem) | Izgāja |
| KT-V-11 | Mērķis "1.5" (daļskaitlis) | validate.whole | validate.whole | Izgāja |
| KT-V-12 | Mērķis "0", "-1", "-1000" | validate.positive | validate.positive (visiem 3 variantiem) | Izgāja |
| KT-V-13 | Mērķis 1 000 001 un 1 000 000 | Virs robežas — kļūda; tieši uz robežas — pieņemts | validate.maxTarget / bez kļūdas | Izgāja |
| KT-V-14 | Sākuma datums tukšs | validate.startRequired | validate.startRequired | Izgāja |
| KT-V-15 | Sākuma datums "2026-02-31", "2026-13-01", "2026-00-10", "01.03.2026" | validate.startInvalid (datums netiek pārritināts uz citu dienu) | validate.startInvalid (visiem 4 variantiem) | Izgāja |
| KT-V-16 | Beigu datums pirms sākuma datuma (10.03 → 09.03) | validate.endOrder | validate.endOrder | Izgāja |
| KT-V-17 | Sākuma un beigu datums ir viena un tā pati diena | Pieņemts | Kļūdu nav | Izgāja |
| KT-V-18 | Kļūdains tikai mērķis (0) | Kļūda tikai mērķa laukā; fokuss uz to | 1 kļūda: targetValue; firstInvalidField = targetValue | Izgāja |
| KT-V-19 | Jebkurš nederīgs lauks → payload veidošana | toChallengeInput atgriež null (nevar nosūtīt nederīgus datus) | null visos 6 scenārijos | Izgāja |
| KT-V-20 | Derīgi dati → payload | Beigu datums aizpilda visu dienu līdz 23:59:59.999 | 23:59:59.999; sākums 00:00 | Izgāja |
| KT-V-21 | Rediģēšanas režīms (challenge → forma) | Formas vērtības sakrīt ar saglabātajām (round-trip) | Visas 6 vērtības sakrīt | Izgāja |
| KT-V-22 | Visi 15 validācijas ziņojumi valodās en/lv/ru | Neviena neiztulkota atslēga, neviens neaizvietots {parametrs} | 15 ziņojumi × 3 valodas — visi tulkoti | Izgāja |
| KT-V-23 | Vai ziņojumi atšķiras starp valodām | 3 atšķirīgi teksti (nevis viena angļu teksta kopija) | 3 dažādi teksti | Izgāja |

### 5.2. Datumu apstrāde — nederīgi datumi

Testu kopa: challengeValidation.test.ts. JavaScript Date pārritina neeksistējošu dienu (31.02 → 3.03), tāpēc tiek pārbaudīts apgrieztais pārveidojums.

| ID | Scenārijs / ievade | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|---|
| KT-D-01 | 29. februāris garajā un īsajā gadā | 2024-02-29 derīgs, 2026-02-29 nederīgs | date / null | Izgāja |
| KT-D-02 | 31.02.2026 un 31.04.2026 | null — diena netiek pārbīdīta uz nākamo mēnesi | null / null | Izgāja |
| KT-D-03 | Formāts "2026-3-1", " 2026-03-01 ", "", "2026-03" | Tikai YYYY-MM-DD (ar atstarpēm malās) ir derīgs | null / derīgs / null / null | Izgāja |

### 5.3. Admina darbību kļūdu ziņojumi (ADM-01/ADM-02)

Testu kopa: src/features/adminErrors.test.ts (npm test). Pārbauda, ko administrators redz, kad izaicinājuma izveide, labošana vai dzēšana neizdodas. Nepareizs kartējums nav crashes, bet maldina lietotāju, tāpēc katrs kods ir piefiksēts.

| ID | Scenārijs / ievade | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|---|
| KT-A-01 | functions/permission-denied, "Admin only. [403]" | "Only administrators may change challenges — Admin only." bez [403] | Atbilst; statusa numurs noņemts | Izgāja |
| KT-A-02 | functions/unauthenticated | Aicina pierakstīties vēlreiz | Satur "Sign in again" | Izgāja |
| KT-A-03 | functions/not-found, "Challenge not found. [404]" | Paskaidro, ka izaicinājums vairs neeksistē | Satur "no longer exists"; [404] noņemts | Izgāja |
| KT-A-04 | functions/unavailable | Serviss nepieejams, nekas nav mainīts | "unreachable … nothing was changed" | Izgāja |
| KT-A-05 | functions/invalid-argument, "Title must be 3-80 characters. [400]" | Servera teksts bez statusa numura | "Title must be 3-80 characters." | Izgāja |
| KT-A-06 | functions/unimplemented (funkcija nav izvietota) | Paziņojums, ka funkcija nav sasniedzama un nekas nav mainīts | "could not be reached … nothing was changed" | Izgāja |
| KT-A-07 | functions/not-found ar tekstu "NOT_FOUND" (tukšs maršruts) | Atpazīts kā nesasniedzama funkcija, nevis "izaicinājums dzēsts" | "could not be reached" | Izgāja |
| KT-A-08 | functions/internal "internal [500]" un cita internal kļūda | Pirmā — nesasniedzama funkcija; otrā — teksta ziņojums | "could not be reached" / "Database write failed." | Izgāja |
| KT-A-09 | Nezināms kods ar tekstu | Teksts tiek parādīts lietotājam | "Boom." | Izgāja |
| KT-A-10 | null, undefined vai tukšs ziņojums | Vispārīgs ziņojums, nevis "null" vai tukša rinda | "Something went wrong and nothing was changed." | Izgāja |

### 5.4. Firestore drošības noteikumi (SEC-01) — nepilnvarota piekļuve

Testu kopa: test/firestore.rules.test.ts pret īsto Firestore emulatoru (npm run test:rules). Tiek izmantoti tie paši noteikumi, ko Firebase izvieto (firestore.rules).

| ID | Scenārijs / ievade | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|---|
| KT-R-01 | Viesis (bez sesijas) lasa users/{uid} pēc precīza id | PERMISSION_DENIED | Liegts | Izgāja |
| KT-R-02 | Viesis lasa challenges sarakstu un dokumentu pēc id | PERMISSION_DENIED | Liegts (abos gadījumos) | Izgāja |
| KT-R-03 | Viesis lasa un vaicā gameResults | PERMISSION_DENIED | Liegts | Izgāja |
| KT-R-04 | Viesis raksta users, gameResults un challenges | PERMISSION_DENIED | Liegts (visās kolekcijās) | Izgāja |
| KT-R-05 | Spēlētājs (role: user) lasa savu profilu | Atļauts, atgriež inGameName | "Player One" | Izgāja |
| KT-R-06 | Spēlētājs lasa cita spēlētāja profilu vai visu users sarakstu | PERMISSION_DENIED | Liegts | Izgāja |
| KT-R-07 | Spēlētājs raksta savu profilu: set, update (bestScore), delete, add, role: "admin" | PERMISSION_DENIED visiem | Liegts (arī paaugstināšana par adminu) | Izgāja |
| KT-R-08 | Spēlētājs lasa challenges, bet mēģina rakstīt | Lasīt atļauts, rakstīt liegts | 1 dokuments lasīts; set/update/delete/add liegti | Izgāja |
| KT-R-09 | Spēlētājs vaicā savus gameResults ar where uid == savs id | Atļauts, atgriež tikai savu rezultātu | 1 ieraksts, score 42 | Izgāja |
| KT-R-10 | Cita spēlētāja uid, vaicājums bez filtra, dokumenta lasīšana pēc id, ieraksta rakstīšana/dzēšana | PERMISSION_DENIED | Liegts visiem | Izgāja |
| KT-R-11 | Diapazona (>=) un in (divi uid) vaicājumi gameResults | PERMISSION_DENIED — nevar apiet uid ierobežojumu | Liegti abi | Izgāja |
| KT-R-12 | Administrators (role: admin): lasīšana un rakstīšana | Lasa savu profilu un challenges; cita profilu un rakstīšanu — liegts | Tāpat kā spēlētājam, bez papildu tiesībām | Izgāja |
| KT-R-13 | Nezināmi ceļi (secrets) un apakškolekcija users/{uid}/private | PERMISSION_DENIED viesim, spēlētājam un administratoram | Liegts visiem trim | Izgāja |

### 5.5. Cloud Functions (AUTH-02, DATA-01, ADM-01, UI-03) — servera kļūdas

Testu kopa: functions/test (103 testi, npm test mapē functions). Serveris ir vienīgā rakstīšanas vieta, tāpēc tā noraidījumi ir drošības robeža: katrs scenārijs pārbauda konkrēto kļūdas kodu.

| ID | Scenārijs / ievade | Sagaidāmais rezultāts | Faktiskais rezultāts | Statuss |
|---|---|---|---|---|
| KT-F-01 | authenticateTelegram bez initData / ar initData, kas nav virkne | invalid-argument | invalid-argument (abos) | Izgāja |
| KT-F-02 | initData ar viltotu hash | unauthenticated | unauthenticated | Izgāja |
| KT-F-03 | Klienta piegādāts devTelegramId ārpus emulatora | invalid-argument — lokālās pieslēgšanās apiešana ir slēgta | invalid-argument | Izgāja |
| KT-F-04 | Serverim nav konfigurēts TELEGRAM_BOT_TOKEN | failed-precondition (nevis klusa piekrišana) | failed-precondition | Izgāja |
| KT-F-05 | submitGameResult bez sesijas | unauthenticated | unauthenticated | Izgāja |
| KT-F-06 | submitGameResult ar score -1, 1.5, 10001, "10", null | invalid-argument | invalid-argument (visiem 5) | Izgāja |
| KT-F-07 | submitGameResult ar durationMs -1, 1.5, 21 600 001, "1000" | invalid-argument | invalid-argument (visiem 4) | Izgāja |
| KT-F-08 | submitGameResult ar jumpCount -1, 10001, 2.5 | invalid-argument | invalid-argument (visiem 3) | Izgāja |
| KT-F-09 | Rezultāts spēlētājam bez profila | failed-precondition — vispirms jāpiekrīt datu apstrādei | failed-precondition | Izgāja |
| KT-F-10 | Atkārtots izsaukums ar to pašu runId (bezsaistes rinda) | Rezultāts netiek skaitīts divreiz; paliek viens dokuments | totalGames 1 → 1; viens ieraksts | Izgāja |
| KT-F-11 | Nederīgs runId ("../../oops") | Apstrādāts kā nav norādīts; kļūda netiek izmesta | Rezultāts saglabāts, 1 ieraksts | Izgāja |
| KT-F-12 | adminChallengeMutation bez sesijas / ar user lomu / bez role claim | unauthenticated vai permission-denied; datubāzē nekas netiek ierakstīts | Atbilst; challenges kolekcija paliek tukša | Izgāja |
| KT-F-13 | adminChallengeMutation: nezināma operācija, nederīgs payload (targetValue -1), update bez challengeId vai ar tukšu id | invalid-argument | invalid-argument (visiem 4) | Izgāja |
| KT-F-14 | adminChallengeMutation update neesošam izaicinājumam | not-found | not-found | Izgāja |
| KT-F-15 | updateProfile: tukšs patch; vārdi "ab", 21 zīme, "has space", "dash-name", ""; preferredX -1 un 1.5 | invalid-argument | invalid-argument (visiem variantiem) | Izgāja |
| KT-F-16 | getLeaderboard bez sesijas; period "yearly", {}, 3 | unauthenticated; invalid-argument | Atbilst | Izgāja |

## 5. Atrastās kļūdas un labojumi

| ID | Defekts | Ietekme | Statuss |
|---|---|---|---|
| KT-B-01 | tsconfig.test.json neietvēra vite/client tipus | Tiklīdz tests importēja aplikācijas moduli (challengeValidation → i18n), npm test tipa pārbaude krita ar TS2339 (import.meta.env). Kļūdu testus nevarēja palaist vispār. | Labots: pievienots "vite/client" tipu sarakstam |
| KT-B-02 | challengeValidation.ts imports bez .ts paplašinājuma | node --test nevarēja ielādēt moduli (ERR_MODULE_NOT_FOUND), jo Node ESM neatrisina bezpaplašinājuma ceļus. | Labots: imports ar .ts paplašinājumu (Vite to atbalsta) |
| KT-B-03 | describeMutationError(null) atgrieza tekstu "null" | Ja kļūdas vietā nonāk null/undefined, administrators redzēja "null" vai "[object Object]" kā kļūdas ziņojumu. | Labots: tagad vispārīgs ziņojums; pārklāts ar KT-A-10 |

## 6. Manuāli veicamie testi

| ID | Scenārijs | Sagaidāmais rezultāts | Statuss |
|---|---|---|---|
| KT-M-01 | Kļūdas ekrāns (ErrorBoundary): komponentes render kļūda pārlūkā | Redzams "Something went wrong" ar Pārlādēt pogu, nevis tukšs ekrāns | Jāveic manuāli |
| KT-M-02 | Bezsaistes rinda: atslēgt tīklu pirms rezultāta nosūtīšanas, pēc tam atjaunot | Rezultāts paliek localStorage un tiek nosūtīts vienreiz (bez dubultošanas) | Jāveic manuāli |
| KT-M-03 | Piekrišanas kļūda: apturēt Functions emulatoru un apstiprināt piekrišanu | Dialogs parāda kļūdas tekstu, spēle netiek bloķēta | Jāveic manuāli |
| KT-M-04 | Audio faila trūkums: izņemt mp3 no src/assets/Sound/sfx | Klusa nospēle bez kļūdas konsolē, spēle darbojas | Jāveic manuāli |
| KT-M-05 | Admina paziņojums, kad funkcija nav izvietota (UI līmenis) | Administrators redz KT-A-06 tekstu, forma paliek ar ievadītajiem datiem | Jāveic manuāli |

## 7. Secinājumi

No 212 automatizētajiem testiem visi 212 izgāja; kritisku defektu nav. Kļūdu ceļš ir pārklāts trijos līmeņos: klienta validācija neļauj nosūtīt nederīgus datus, serveris tos pārbauda vēlreiz (klienta pārbaude nav uzticamības robeža), un drošības noteikumi liedz tiešu klienta rakstīšanu jebkurā no trim aizsargātajām kolekcijām.

Testēšanas gaitā atrasti un laboti trīs defekti (KT-B-01…03): divi testēšanas infrastruktūrā, kas neļāva kļūdu testus palaist, un viens lietotājam redzams — "null" kā kļūdas teksts admina panelī.

Pieci UI līmeņa scenāriji (KT-M-01…05) prasa pārlūku vai Telegram klientu, tāpēc šajā vidē tie nav izpildīti un to statuss ir "Jāveic manuāli", nevis "Izgāja".

## 8. Pielikums — kā atkārtot pārbaudes

```bash
npm test                                  # 89 testi (spēle + validācija + admina ziņojumi)
npm run test:rules                        # 20 noteikumu testi pret Firestore emulatoru
npm run setup:test-tools                  # Java 21 uzstādīšana .tools/ (ja nav Java)
cd functions && npm test                  # 103 Cloud Functions testi
python3 docs/kludu-testesana/build.py     # šī dokumenta pārlāde (DOCX + MD)

# Noteikumu izvietošana un pārbaude, ka dzīvais ruleset sakrīt ar failu:
npx firebase-tools deploy --only firestore:rules --project birdenergy-f1405
#   → released rules firestore.rules to cloud.firestore (release cloud.firestore)
#   Dzīvais ruleset (69 rindas) tika nolasīts atpakaļ no Firebase Rules API
#   un salīdzināts ar firestore.rules — saturs sakrīt 1:1.
```
