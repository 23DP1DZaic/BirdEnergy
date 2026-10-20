#!/usr/bin/env python3
"""Ģenerē kļūdu testēšanas protokolu (DOCX + Markdown) no viena datu avota.

    python3 docs/kludu-testesana/build.py

Prasa python-docx (pip install python-docx). Rezultāti dokumentā nav izdomāti:
tie atbilst testiem, kas palaisti ar `npm test`, `npm run test:rules` un
`cd functions && npm test` (skat. protokola 2. sadaļu).
"""
from __future__ import annotations

import datetime as dt
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT_DIR = Path(__file__).resolve().parent
DOCX_PATH = OUT_DIR / "Kludu_testesanas_protokols.docx"
MD_PATH = OUT_DIR / "Kludu_testesanas_protokols.md"

# The chapter in the study-programme sample format (narrative + 7.1/7.2/7.3
# tables), built from the results of the same runs as the protocol above.
SAMPLE_DOCX_PATH = OUT_DIR / "Programmatura_lietojamibas_testsana.docx"
SAMPLE_MD_PATH = OUT_DIR / "Programmatura_lietojamibas_testsana.md"

TODAY = "2026. gada 20. oktobris"

META = [
    ("Dokuments", "Kļūdu testēšanas protokols"),
    ("Projekts", "Bird Energy — Telegram Mini App spēle"),
    ("Repozitorijs", "github.com/23DP1DZaic/BirdEnergy, atzars master"),
    ("Darba autors", "Dmitrijs Zaicevs"),
    ("Datums", TODAY),
    ("Testēšanas vide", "Node.js 22.21.0 · Windows 11 x64 · Java 21 (Temurin JRE) · "
                        "Firestore emulators (firebase-tools 15.29.0)"),
    ("Metode", "Automatizēti kļūdu ceļa testi (iebūvētais node:test) un Firestore "
               "drošības noteikumu testi pret īsto emulatoru"),
    ("Rezultāts", "212 testi · 212 izgājuši · 0 krituši"),
]

SUMMARY = [
    ("Spēles loģika (src/features/game/engine.test.ts)", "51", "51", "0", "Izgāja"),
    ("Formas validācija — kļūdu ceļš (challengeValidation.test.ts)", "26", "26", "0", "Izgāja"),
    ("Admina kļūdu ziņojumi (adminErrors.test.ts)", "12", "12", "0", "Izgāja"),
    ("Cloud Functions (functions/test)", "103", "103", "0", "Izgāja"),
    ("Firestore drošības noteikumi (test/firestore.rules.test.ts)", "20", "20", "0", "Izgāja"),
    ("Kopā", "212", "212", "0", "Izgāja"),
]

GROUPS = [
    {
        "title": "5.1. Formas validācija (CH-03) — kļūda lietotāja ievadē",
        "note": "Testu kopa: src/features/challengeValidation.test.ts (npm test). "
                "Pārbauda administrācijas paneļa izaicinājuma formas validāciju. "
                "Kļūdas tiek pieteiktas pa laukiem, un tās bloķē saglabāšanu.",
        "rows": [
            ("KT-V-01", "Tukša forma — saglabāšana",
             "Kļūda visos sešos laukos; fokuss uz pirmo lauku (nosaukums)",
             "6 kļūdas: title, description, type, targetValue, startDate, endDate; "
             "firstInvalidField = title", "Izgāja"),
            ("KT-V-02", "Nosaukums tikai no atstarpēm",
             "validate.titleRequired", "validate.titleRequired", "Izgāja"),
            ("KT-V-03", "Nosaukums 2 rakstzīmes",
             "Minimālā garuma kļūda ar {min: 3, count: 2}",
             "validate.min {min: 3, count: 2}", "Izgāja"),
            ("KT-V-04", "Nosaukums 81 rakstzīme",
             "Maksimālā garuma kļūda", "validate.max {max: 80, count: 81}", "Izgāja"),
            ("KT-V-05", "Nosaukums \"  Spring  \" (atstarpes malās)",
             "Pieņemts, atstarpes apgrieztas", "Kļūdas nav", "Izgāja"),
            ("KT-V-06", "Apraksts 5 rakstzīmes",
             "Minimālā garuma kļūda (10)", "validate.min {min: 10, count: 5}", "Izgāja"),
            ("KT-V-07", "Apraksts 501 rakstzīme",
             "Maksimālā garuma kļūda (500)", "validate.max {max: 500, count: 501}", "Izgāja"),
            ("KT-V-08", "Izaicinājuma tips nav izvēlēts vai \"bogus\"",
             "validate.type", "validate.type", "Izgāja"),
            ("KT-V-09", "Mērķis tukšs",
             "validate.targetRequired", "validate.targetRequired", "Izgāja"),
            ("KT-V-10", "Mērķis \"abc\", \"12abc\", \"NaN\", \"Infinity\"",
             "validate.number", "validate.number (visiem 4 variantiem)", "Izgāja"),
            ("KT-V-11", "Mērķis \"1.5\" (daļskaitlis)",
             "validate.whole", "validate.whole", "Izgāja"),
            ("KT-V-12", "Mērķis \"0\", \"-1\", \"-1000\"",
             "validate.positive", "validate.positive (visiem 3 variantiem)", "Izgāja"),
            ("KT-V-13", "Mērķis 1 000 001 un 1 000 000",
             "Virs robežas — kļūda; tieši uz robežas — pieņemts",
             "validate.maxTarget / bez kļūdas", "Izgāja"),
            ("KT-V-14", "Sākuma datums tukšs",
             "validate.startRequired", "validate.startRequired", "Izgāja"),
            ("KT-V-15", "Sākuma datums \"2026-02-31\", \"2026-13-01\", "
                       "\"2026-00-10\", \"01.03.2026\"",
             "validate.startInvalid (datums netiek pārritināts uz citu dienu)",
             "validate.startInvalid (visiem 4 variantiem)", "Izgāja"),
            ("KT-V-16", "Beigu datums pirms sākuma datuma (10.03 → 09.03)",
             "validate.endOrder", "validate.endOrder", "Izgāja"),
            ("KT-V-17", "Sākuma un beigu datums ir viena un tā pati diena",
             "Pieņemts", "Kļūdu nav", "Izgāja"),
            ("KT-V-18", "Kļūdains tikai mērķis (0)",
             "Kļūda tikai mērķa laukā; fokuss uz to",
             "1 kļūda: targetValue; firstInvalidField = targetValue", "Izgāja"),
            ("KT-V-19", "Jebkurš nederīgs lauks → payload veidošana",
             "toChallengeInput atgriež null (nevar nosūtīt nederīgus datus)",
             "null visos 6 scenārijos", "Izgāja"),
            ("KT-V-20", "Derīgi dati → payload",
             "Beigu datums aizpilda visu dienu līdz 23:59:59.999",
             "23:59:59.999; sākums 00:00", "Izgāja"),
            ("KT-V-21", "Rediģēšanas režīms (challenge → forma)",
             "Formas vērtības sakrīt ar saglabātajām (round-trip)",
             "Visas 6 vērtības sakrīt", "Izgāja"),
            ("KT-V-22", "Visi 15 validācijas ziņojumi valodās en/lv/ru",
             "Neviena neiztulkota atslēga, neviens neaizvietots {parametrs}",
             "15 ziņojumi × 3 valodas — visi tulkoti", "Izgāja"),
            ("KT-V-23", "Vai ziņojumi atšķiras starp valodām",
             "3 atšķirīgi teksti (nevis viena angļu teksta kopija)",
             "3 dažādi teksti", "Izgāja"),
        ],
    },
    {
        "title": "5.2. Datumu apstrāde — nederīgi datumi",
        "note": "Testu kopa: challengeValidation.test.ts. JavaScript Date pārritina "
                "neeksistējošu dienu (31.02 → 3.03), tāpēc tiek pārbaudīts "
                "apgrieztais pārveidojums.",
        "rows": [
            ("KT-D-01", "29. februāris garajā un īsajā gadā",
             "2024-02-29 derīgs, 2026-02-29 nederīgs",
             "date / null", "Izgāja"),
            ("KT-D-02", "31.02.2026 un 31.04.2026",
             "null — diena netiek pārbīdīta uz nākamo mēnesi",
             "null / null", "Izgāja"),
            ("KT-D-03", "Formāts \"2026-3-1\", \" 2026-03-01 \", \"\", \"2026-03\"",
             "Tikai YYYY-MM-DD (ar atstarpēm malās) ir derīgs",
             "null / derīgs / null / null", "Izgāja"),
        ],
    },
    {
        "title": "5.3. Admina darbību kļūdu ziņojumi (ADM-01/ADM-02)",
        "note": "Testu kopa: src/features/adminErrors.test.ts (npm test). Pārbauda, "
                "ko administrators redz, kad izaicinājuma izveide, labošana vai "
                "dzēšana neizdodas. Nepareizs kartējums nav crashes, bet maldina "
                "lietotāju, tāpēc katrs kods ir piefiksēts.",
        "rows": [
            ("KT-A-01", "functions/permission-denied, \"Admin only. [403]\"",
             "\"Only administrators may change challenges — Admin only.\" bez [403]",
             "Atbilst; statusa numurs noņemts", "Izgāja"),
            ("KT-A-02", "functions/unauthenticated",
             "Aicina pierakstīties vēlreiz", "Satur \"Sign in again\"", "Izgāja"),
            ("KT-A-03", "functions/not-found, \"Challenge not found. [404]\"",
             "Paskaidro, ka izaicinājums vairs neeksistē",
             "Satur \"no longer exists\"; [404] noņemts", "Izgāja"),
            ("KT-A-04", "functions/unavailable",
             "Serviss nepieejams, nekas nav mainīts",
             "\"unreachable … nothing was changed\"", "Izgāja"),
            ("KT-A-05", "functions/invalid-argument, \"Title must be 3-80 characters. [400]\"",
             "Servera teksts bez statusa numura",
             "\"Title must be 3-80 characters.\"", "Izgāja"),
            ("KT-A-06", "functions/unimplemented (funkcija nav izvietota)",
             "Paziņojums, ka funkcija nav sasniedzama un nekas nav mainīts",
             "\"could not be reached … nothing was changed\"", "Izgāja"),
            ("KT-A-07", "functions/not-found ar tekstu \"NOT_FOUND\" (tukšs maršruts)",
             "Atpazīts kā nesasniedzama funkcija, nevis \"izaicinājums dzēsts\"",
             "\"could not be reached\"", "Izgāja"),
            ("KT-A-08", "functions/internal \"internal [500]\" un cita internal kļūda",
             "Pirmā — nesasniedzama funkcija; otrā — teksta ziņojums",
             "\"could not be reached\" / \"Database write failed.\"", "Izgāja"),
            ("KT-A-09", "Nezināms kods ar tekstu",
             "Teksts tiek parādīts lietotājam", "\"Boom.\"", "Izgāja"),
            ("KT-A-10", "null, undefined vai tukšs ziņojums",
             "Vispārīgs ziņojums, nevis \"null\" vai tukša rinda",
             "\"Something went wrong and nothing was changed.\"", "Izgāja"),
        ],
    },
    {
        "title": "5.4. Firestore drošības noteikumi (SEC-01) — nepilnvarota piekļuve",
        "note": "Testu kopa: test/firestore.rules.test.ts pret īsto Firestore "
                "emulatoru (npm run test:rules). Tiek izmantoti tie paši noteikumi, "
                "ko Firebase izvieto (firestore.rules).",
        "rows": [
            ("KT-R-01", "Viesis (bez sesijas) lasa users/{uid} pēc precīza id",
             "PERMISSION_DENIED", "Liegts", "Izgāja"),
            ("KT-R-02", "Viesis lasa challenges sarakstu un dokumentu pēc id",
             "PERMISSION_DENIED", "Liegts (abos gadījumos)", "Izgāja"),
            ("KT-R-03", "Viesis lasa un vaicā gameResults",
             "PERMISSION_DENIED", "Liegts", "Izgāja"),
            ("KT-R-04", "Viesis raksta users, gameResults un challenges",
             "PERMISSION_DENIED", "Liegts (visās kolekcijās)", "Izgāja"),
            ("KT-R-05", "Spēlētājs (role: user) lasa savu profilu",
             "Atļauts, atgriež inGameName", "\"Player One\"", "Izgāja"),
            ("KT-R-06", "Spēlētājs lasa cita spēlētāja profilu vai visu users sarakstu",
             "PERMISSION_DENIED", "Liegts", "Izgāja"),
            ("KT-R-07", "Spēlētājs raksta savu profilu: set, update (bestScore), "
                       "delete, add, role: \"admin\"",
             "PERMISSION_DENIED visiem", "Liegts (arī paaugstināšana par adminu)", "Izgāja"),
            ("KT-R-08", "Spēlētājs lasa challenges, bet mēģina rakstīt",
             "Lasīt atļauts, rakstīt liegts", "1 dokuments lasīts; set/update/delete/add liegti", "Izgāja"),
            ("KT-R-09", "Spēlētājs vaicā savus gameResults ar where uid == savs id",
             "Atļauts, atgriež tikai savu rezultātu",
             "1 ieraksts, score 42", "Izgāja"),
            ("KT-R-10", "Cita spēlētāja uid, vaicājums bez filtra, dokumenta lasīšana "
                       "pēc id, ieraksta rakstīšana/dzēšana",
             "PERMISSION_DENIED", "Liegts visiem", "Izgāja"),
            ("KT-R-11", "Diapazona (>=) un in (divi uid) vaicājumi gameResults",
             "PERMISSION_DENIED — nevar apiet uid ierobežojumu",
             "Liegti abi", "Izgāja"),
            ("KT-R-12", "Administrators (role: admin): lasīšana un rakstīšana",
             "Lasa savu profilu un challenges; cita profilu un rakstīšanu — liegts",
             "Tāpat kā spēlētājam, bez papildu tiesībām", "Izgāja"),
            ("KT-R-13", "Nezināmi ceļi (secrets) un apakškolekcija users/{uid}/private",
             "PERMISSION_DENIED viesim, spēlētājam un administratoram",
             "Liegts visiem trim", "Izgāja"),
        ],
    },
    {
        "title": "5.5. Cloud Functions (AUTH-02, DATA-01, ADM-01, UI-03) — servera kļūdas",
        "note": "Testu kopa: functions/test (103 testi, npm test mapē functions). "
                "Serveris ir vienīgā rakstīšanas vieta, tāpēc tā noraidījumi ir "
                "drošības robeža: katrs scenārijs pārbauda konkrēto kļūdas kodu.",
        "rows": [
            ("KT-F-01", "authenticateTelegram bez initData / ar initData, kas nav virkne",
             "invalid-argument", "invalid-argument (abos)", "Izgāja"),
            ("KT-F-02", "initData ar viltotu hash",
             "unauthenticated", "unauthenticated", "Izgāja"),
            ("KT-F-03", "Klienta piegādāts devTelegramId ārpus emulatora",
             "invalid-argument — lokālās pieslēgšanās apiešana ir slēgta",
             "invalid-argument", "Izgāja"),
            ("KT-F-04", "Serverim nav konfigurēts TELEGRAM_BOT_TOKEN",
             "failed-precondition (nevis klusa piekrišana)",
             "failed-precondition", "Izgāja"),
            ("KT-F-05", "submitGameResult bez sesijas",
             "unauthenticated", "unauthenticated", "Izgāja"),
            ("KT-F-06", "submitGameResult ar score -1, 1.5, 10001, \"10\", null",
             "invalid-argument", "invalid-argument (visiem 5)", "Izgāja"),
            ("KT-F-07", "submitGameResult ar durationMs -1, 1.5, 21 600 001, \"1000\"",
             "invalid-argument", "invalid-argument (visiem 4)", "Izgāja"),
            ("KT-F-08", "submitGameResult ar jumpCount -1, 10001, 2.5",
             "invalid-argument", "invalid-argument (visiem 3)", "Izgāja"),
            ("KT-F-09", "Rezultāts spēlētājam bez profila",
             "failed-precondition — vispirms jāpiekrīt datu apstrādei",
             "failed-precondition", "Izgāja"),
            ("KT-F-10", "Atkārtots izsaukums ar to pašu runId (bezsaistes rinda)",
             "Rezultāts netiek skaitīts divreiz; paliek viens dokuments",
             "totalGames 1 → 1; viens ieraksts", "Izgāja"),
            ("KT-F-11", "Nederīgs runId (\"../../oops\")",
             "Apstrādāts kā nav norādīts; kļūda netiek izmesta",
             "Rezultāts saglabāts, 1 ieraksts", "Izgāja"),
            ("KT-F-12", "adminChallengeMutation bez sesijas / ar user lomu / bez role claim",
             "unauthenticated vai permission-denied; datubāzē nekas netiek ierakstīts",
             "Atbilst; challenges kolekcija paliek tukša", "Izgāja"),
            ("KT-F-13", "adminChallengeMutation: nezināma operācija, nederīgs payload "
                       "(targetValue -1), update bez challengeId vai ar tukšu id",
             "invalid-argument", "invalid-argument (visiem 4)", "Izgāja"),
            ("KT-F-14", "adminChallengeMutation update neesošam izaicinājumam",
             "not-found", "not-found", "Izgāja"),
            ("KT-F-15", "updateProfile: tukšs patch; vārdi \"ab\", 21 zīme, "
                       "\"has space\", \"dash-name\", \"\"; preferredX -1 un 1.5",
             "invalid-argument", "invalid-argument (visiem variantiem)", "Izgāja"),
            ("KT-F-16", "getLeaderboard bez sesijas; period \"yearly\", {}, 3",
             "unauthenticated; invalid-argument", "Atbilst", "Izgāja"),
        ],
    },
]

DEFECTS = [
    ("KT-B-01", "tsconfig.test.json neietvēra vite/client tipus",
     "Tiklīdz tests importēja aplikācijas moduli (challengeValidation → i18n), "
     "npm test tipa pārbaude krita ar TS2339 (import.meta.env). Kļūdu testus "
     "nevarēja palaist vispār.",
     "Labots: pievienots \"vite/client\" tipu sarakstam"),
    ("KT-B-02", "challengeValidation.ts imports bez .ts paplašinājuma",
     "node --test nevarēja ielādēt moduli (ERR_MODULE_NOT_FOUND), jo Node ESM "
     "neatrisina bezpaplašinājuma ceļus.",
     "Labots: imports ar .ts paplašinājumu (Vite to atbalsta)"),
    ("KT-B-03", "describeMutationError(null) atgrieza tekstu \"null\"",
     "Ja kļūdas vietā nonāk null/undefined, administrators redzēja \"null\" "
     "vai \"[object Object]\" kā kļūdas ziņojumu.",
     "Labots: tagad vispārīgs ziņojums; pārklāts ar KT-A-10"),
]

MANUAL = [
    ("KT-M-01", "Kļūdas ekrāns (ErrorBoundary): komponentes render kļūda pārlūkā",
     "Redzams \"Something went wrong\" ar Pārlādēt pogu, nevis tukšs ekrāns",
     "Jāveic manuāli"),
    ("KT-M-02", "Bezsaistes rinda: atslēgt tīklu pirms rezultāta nosūtīšanas, "
                "pēc tam atjaunot",
     "Rezultāts paliek localStorage un tiek nosūtīts vienreiz (bez dubultošanas)",
     "Jāveic manuāli"),
    ("KT-M-03", "Piekrišanas kļūda: apturēt Functions emulatoru un apstiprināt piekrišanu",
     "Dialogs parāda kļūdas tekstu, spēle netiek bloķēta",
     "Jāveic manuāli"),
    ("KT-M-04", "Audio faila trūkums: izņemt mp3 no src/assets/Sound/sfx",
     "Klusa nospēle bez kļūdas konsolē, spēle darbojas",
     "Jāveic manuāli"),
    ("KT-M-05", "Admina paziņojums, kad funkcija nav izvietota (UI līmenis)",
     "Administrators redz KT-A-06 tekstu, forma paliek ar ievadītajiem datiem",
     "Jāveic manuāli"),
]

SECTIONS_TEXT = {
    "goal": [
        "Protokola mērķis ir pārbaudīt, kā sistēma uzvedas kļūdainas ievades, "
        "nepilnvarotas piekļuves un servisa kļūmju gadījumos — nevis tikai to, "
        "vai lietotne strādā ar pareiziem datiem.",
        "Pārbaudes tvērums:",
        "• administrācijas izaicinājuma formas validācija (CH-03) un datumu apstrāde;",
        "• admina darbību kļūdu ziņojumi (ADM-01, ADM-02);",
        "• Firestore drošības noteikumi pret tiešu klienta rakstīšanu (SEC-01);",
        "• Cloud Functions noraidījumi: autentifikācija, tiesības, ievades validācija "
        "(AUTH-02, DATA-01, ADM-01, UI-03);",
        "• spēles loģikas robežgadījumi (gravitācija, sadursmes, punkti).",
        "Ārpus tvēruma: slodzes testi, drošības uzlaušanas testi (pentest) un "
        "pārbaudes ar īstu Telegram klientu — tās prasa citu vidi.",
    ],
    "env": [
        "Visi testi tiek palaisti lokāli un neprasa Firebase akreditāciju. "
        "Cloud Functions testi aizstāj Firestore un Auth ar in-memory dubultniekiem, "
        "savukārt drošības noteikumi tiek palaisti pret īsto Firestore emulatoru.",
        "Firestore emulators ir Java lietotne; Java 21 tiek uzstādīta projekta "
        "iekšienē ar `npm run setup:test-tools` (.tools/, gitignored), tāpēc vide "
        "ir atkārtojama arī pēc repozitorija jaunas klonēšanas.",
    ],
    "conclusion": [
        "No 212 automatizētajiem testiem visi 212 izgāja; kritisku defektu nav. "
        "Kļūdu ceļš ir pārklāts trijos līmeņos: klienta validācija neļauj nosūtīt "
        "nederīgus datus, serveris tos pārbauda vēlreiz (klienta pārbaude nav "
        "uzticamības robeža), un drošības noteikumi liedz tiešu klienta rakstīšanu "
        "jebkurā no trim aizsargātajām kolekcijām.",
        "Testēšanas gaitā atrasti un laboti trīs defekti (KT-B-01…03): divi "
        "testēšanas infrastruktūrā, kas neļāva kļūdu testus palaist, un viens "
        "lietotājam redzams — \"null\" kā kļūdas teksts admina panelī.",
        "Pieci UI līmeņa scenāriji (KT-M-01…05) prasa pārlūku vai Telegram klientu, "
        "tāpēc šajā vidē tie nav izpildīti un to statuss ir \"Jāveic manuāli\", "
        "nevis \"Izgāja\".",
    ],
    "appendix": [
        "npm test                                  # 89 testi (spēle + validācija + admina ziņojumi)",
        "npm run test:rules                        # 20 noteikumu testi pret Firestore emulatoru",
        "npm run setup:test-tools                  # Java 21 uzstādīšana .tools/ (ja nav Java)",
        "cd functions && npm test                  # 103 Cloud Functions testi",
        "python3 docs/kludu-testesana/build.py     # šī dokumenta pārlāde (DOCX + MD)",
        "",
        "# Noteikumu izvietošana un pārbaude, ka dzīvais ruleset sakrīt ar failu:",
        "npx firebase-tools deploy --only firestore:rules --project birdenergy-f1405",
        "#   → released rules firestore.rules to cloud.firestore (release cloud.firestore)",
        "#   Dzīvais ruleset (69 rindas) tika nolasīts atpakaļ no Firebase Rules API",
        "#   un salīdzināts ar firestore.rules — saturs sakrīt 1:1.",
    ],
}


# --------------------------------------------------------------------------- #
# DOCX
# --------------------------------------------------------------------------- #
def shade(cell, hex_fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tc_pr.append(shd)


def cell_margins(table, top=None, bottom=None, left=None, right=None) -> None:
    """Nav nepieciešams: Table Grid noklusējuma atkāpes ir derīgas.

    Funkcija atstāta kā no-op, lai nejauktu tblPr elementu secību (tblCellMar
    jābūt pirms tblLook; manuāla pievienošana to pārkāpj)."""
    _ = table


def repeat_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    # Schema order: cantSplit comes before tblHeader.
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    tr_pr.append(header)


def set_widths(table, widths_cm: list[float]) -> None:
    table.autofit = False
    for row in table.rows:
        for index, width in enumerate(widths_cm):
            row.cells[index].width = Cm(width)
    for index, width in enumerate(widths_cm):
        table.columns[index].width = Cm(width)


def fill_table(doc, headers, rows, widths, font_size=8.5, status_column=None,
               total_row=False):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell_margins(table)

    header_cells = table.rows[0].cells
    for cell, text in zip(header_cells, headers):
        cell.text = ""
        paragraph = cell.paragraphs[0]
        run = paragraph.add_run(text)
        run.bold = True
        run.font.size = Pt(font_size)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        shade(cell, "1F3864")
    repeat_header(table.rows[0])

    for row_index, values in enumerate(rows):
        row = table.add_row()
        tr_pr = row._tr.get_or_add_trPr()
        tr_pr.append(OxmlElement("w:cantSplit"))
        cells = row.cells
        is_total = total_row and row_index == len(rows) - 1
        for column, (cell, value) in enumerate(zip(cells, values)):
            cell.text = ""
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(0)
            run = paragraph.add_run(str(value))
            run.font.size = Pt(font_size)
            if is_total:
                run.bold = True
                shade(cell, "EDEFF7")
            if status_column is not None and column == status_column:
                run.bold = True
                if value == "Izgāja":
                    run.font.color.rgb = RGBColor(0x0B, 0x6B, 0x33)
                elif value.startswith("Jāveic"):
                    run.font.color.rgb = RGBColor(0x9C, 0x5A, 0x00)
                elif value == "Labots":
                    run.font.color.rgb = RGBColor(0x0B, 0x6B, 0x33)

    set_widths(table, widths)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return table


def heading(doc, text, level=1):
    paragraph = doc.add_heading(text, level=level)
    for run in paragraph.runs:
        run.font.color.rgb = RGBColor(0x1F, 0x38, 0x64)
    return paragraph


def add_page_number_footer(section, label="Bird Energy — kļūdu testēšanas protokols"):
    paragraph = section.footer.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run(label + " · lpp. ")
    run.font.size = Pt(8)
    field_begin = OxmlElement("w:fldChar")
    field_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    field_end = OxmlElement("w:fldChar")
    field_end.set(qn("w:fldCharType"), "end")
    run._r.append(field_begin)
    run._r.append(instr)
    run._r.append(field_end)


def build_docx() -> None:
    doc = Document()

    section = doc.sections[0]
    section.page_height = Cm(29.7)
    section.page_width = Cm(21.0)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(1.8)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)
    add_page_number_footer(section)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.1

    # --- title block ---
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(60)
    run = paragraph.add_run("KĻŪDU TESTĒŠANAS PROTOKOLS")
    run.bold = True
    run.font.size = Pt(24)
    run.font.color.rgb = RGBColor(0x1F, 0x38, 0x64)

    paragraph = doc.add_paragraph()
    run = paragraph.add_run("Bird Energy — Telegram Mini App spēle")
    run.font.size = Pt(14)
    run.font.color.rgb = RGBColor(0x44, 0x44, 0x44)

    paragraph = doc.add_paragraph()
    run = paragraph.add_run("Negatīvo scenāriju pārbaude: ievade, tiesības, servisa kļūdas")
    run.italic = True
    run.font.size = Pt(11)

    doc.add_paragraph().paragraph_format.space_after = Pt(24)

    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    cell_margins(table, top=60, bottom=60, left=90, right=90)
    for name, value in META:
        cells = table.add_row().cells
        cells[0].text = ""
        run = cells[0].paragraphs[0].add_run(name)
        run.bold = True
        run.font.size = Pt(9.5)
        shade(cells[0], "EDEFF7")
        cells[1].text = ""
        cells[1].paragraphs[0].add_run(value).font.size = Pt(9.5)
    set_widths(table, [4.1, 12.9])

    doc.add_page_break()

    # --- 1 ---
    heading(doc, "1. Testēšanas mērķis un tvērums")
    for line in SECTIONS_TEXT["goal"]:
        doc.add_paragraph(line)

    # --- 2 ---
    heading(doc, "2. Vide, rīki un metode")
    for line in SECTIONS_TEXT["env"]:
        doc.add_paragraph(line)

    fill_table(
        doc,
        ["Komponente", "Vērtība"],
        [
            ("Operētājsistēma / arhitektūra", "Windows 11 x64"),
            ("Node.js", "22.21.0 (iebūvētais node:test, tipu pārbaude ar tsc)"),
            ("TypeScript", "6.0"),
            ("Java", "Temurin JRE 21 (.tools/jre, uzstādīta ar npm run setup:test-tools)"),
            ("Firebase", "firebase-tools 15.29.0 caur npx; Firestore emulators, projekts birdenergy-f1405"),
            ("Pārlūks", "Nav izmantots — UI testi atzīmēti kā manuāli (7. sadaļa)"),
        ],
        [5.2, 11.8],
        font_size=9,
    )

    # --- 3 ---
    heading(doc, "3. Kļūdu klasifikācija un statusi")
    doc.add_paragraph(
        "Katram testam ir viens statuss. Statuss \"Izgāja\" nozīmē, ka testa "
        "izpilde tika reāli palaista šajā vidē un tā apgalvojumi izpildījās."
    )
    fill_table(
        doc,
        ["Statuss", "Nozīme"],
        [
            ("Izgāja", "Tests palaists; faktiskais rezultāts sakrīt ar sagaidāmo"),
            ("Krita", "Tests palaists; faktiskais rezultāts neatbilst sagaidāmajam"),
            ("Jāveic manuāli", "Testu nevar palaist šajā vidē (vajadzīgs pārlūks/Telegram klients)"),
        ],
        [3.6, 13.4],
        font_size=9,
        status_column=0,
    )

    fill_table(
        doc,
        ["Smagums", "Piemērs projekta kontekstā"],
        [
            ("Blocker", "Lietotne neielādējas; nav iespējams pierakstīties"),
            ("Critical", "Drošības noteikumi ļauj klientam rakstīt aizsargātās kolekcijās"),
            ("Major", "Nederīgu datu saglabāšana; kļūda netiek parādīta lietotājam"),
            ("Minor", "Nepareizs kļūdas teksts, trūkst tulkojuma, kosmētisks defekts"),
        ],
        [3.6, 13.4],
        font_size=9,
    )

    # --- 4 ---
    heading(doc, "4. Rezultātu kopsavilkums")
    fill_table(
        doc,
        ["Testu kopa", "Testi", "Izgāja", "Krituši", "Statuss"],
        SUMMARY,
        [8.2, 1.9, 1.9, 1.9, 3.1],
        font_size=9,
        status_column=4,
        total_row=True,
    )
    doc.add_paragraph(
        "Kļūdu ceļam (nevis tikai derīgiem datiem) veltīti 26 formas validācijas "
        "testi, 12 admina ziņojumu testi, 20 drošības noteikumu testi un lielākā "
        "daļa no 103 Cloud Functions testiem — kopā vairāk nekā 60 negatīvo "
        "scenāriju."
    )

    # --- 5 ---
    heading(doc, "5. Testu protokoli")
    for group in GROUPS:
        heading(doc, group["title"], level=2)
        doc.add_paragraph(group["note"])
        fill_table(
            doc,
            ["ID", "Scenārijs / ievade", "Sagaidāmais rezultāts", "Faktiskais rezultāts", "Statuss"],
            group["rows"],
            [1.55, 5.55, 4.5, 3.4, 2.0],
            font_size=8,
            status_column=4,
        )

    # --- 6 ---
    heading(doc, "6. Atrastās kļūdas un labojumi")
    doc.add_paragraph(
        "Trīs defekti tika atrasti tieši kļūdu testu izstrādes laikā un laboti "
        "pirms protokola pabeigšanas."
    )
    fill_table(
        doc,
        ["ID", "Defekts", "Ietekme", "Statuss"],
        DEFECTS,
        [1.55, 4.2, 7.5, 3.75],
        font_size=8.5,
        status_column=3,
    )

    # --- 7 ---
    heading(doc, "7. Manuāli veicamie testi")
    doc.add_paragraph(
        "Šie scenāriji prasa pārlūku, tīkla pārtraukumu vai Telegram klientu. "
        "Tos var veikt tikai izstrādātāja datorā vai izvietotajā vidē, tāpēc "
        "statuss ir \"Jāveic manuāli\", nevis \"Izgāja\"."
    )
    fill_table(
        doc,
        ["ID", "Scenārijs", "Sagaidāmais rezultāts", "Statuss"],
        MANUAL,
        [1.55, 6.4, 6.0, 3.05],
        font_size=8.5,
        status_column=3,
    )

    # --- 8 ---
    heading(doc, "8. Secinājumi")
    for line in SECTIONS_TEXT["conclusion"]:
        doc.add_paragraph(line)

    # --- 9 ---
    heading(doc, "9. Pielikums — kā atkārtot pārbaudes")
    for line in SECTIONS_TEXT["appendix"]:
        paragraph = doc.add_paragraph()
        run = paragraph.add_run(line)
        run.font.name = "Consolas"
        run.font.size = Pt(8.5)
        paragraph.paragraph_format.space_after = Pt(2)

    doc.save(DOCX_PATH)


# --------------------------------------------------------------------------- #
# Markdown
# --------------------------------------------------------------------------- #
def md_table(headers, rows) -> str:
    def esc(value):
        return str(value).replace("|", "\\|")

    lines = ["| " + " | ".join(headers) + " |",
             "|" + "|".join(["---"] * len(headers)) + "|"]
    for row in rows:
        lines.append("| " + " | ".join(esc(v) for v in row) + " |")
    return "\n".join(lines) + "\n"


def build_markdown() -> None:
    out = ["# Kļūdu testēšanas protokols",
           "",
           "**Bird Energy — Telegram Mini App spēle**",
           "",
           "Negatīvo scenāriju pārbaude: ievade, tiesības, servisa kļūdas",
           "",
           md_table(["Lauks", "Vērtība"], META),
           "## 1. Testēšanas mērķis un tvērums",
           "",
           "\n\n".join(SECTIONS_TEXT["goal"]),
           "",
           "## 2. Vide, rīki un metode",
           "",
           "\n\n".join(SECTIONS_TEXT["env"]),
           "",
           md_table(["Statuss", "Nozīme"], [
               ("Izgāja", "Tests palaists; faktiskais rezultāts sakrīt ar sagaidāmo"),
               ("Krita", "Tests palaists; faktiskais rezultāts neatbilst sagaidāmajam"),
               ("Jāveic manuāli", "Nevar palaist šajā vidē (vajadzīgs pārlūks/Telegram klients)"),
           ]),
           "## 3. Rezultātu kopsavilkums",
           "",
           md_table(["Testu kopa", "Testi", "Izgāja", "Krituši", "Statuss"], SUMMARY),
           "",
           "## 4. Testu protokoli",
           ""]
    for group in GROUPS:
        out.append("### " + group["title"])
        out.append("")
        out.append(group["note"])
        out.append("")
        out.append(md_table(
            ["ID", "Scenārijs / ievade", "Sagaidāmais rezultāts",
             "Faktiskais rezultāts", "Statuss"],
            group["rows"],
        ))
    out += ["## 5. Atrastās kļūdas un labojumi", "",
            md_table(["ID", "Defekts", "Ietekme", "Statuss"], DEFECTS),
            "## 6. Manuāli veicamie testi", "",
            md_table(["ID", "Scenārijs", "Sagaidāmais rezultāts", "Statuss"], MANUAL),
            "## 7. Secinājumi", "",
            "\n\n".join(SECTIONS_TEXT["conclusion"]),
            "",
            "## 8. Pielikums — kā atkārtot pārbaudes", "",
            "```bash",
            *SECTIONS_TEXT["appendix"],
            "```",
            ""]
    MD_PATH.write_text("\n".join(out), encoding="utf-8")


# --------------------------------------------------------------------------- #
# Chapter in the study-programme sample format
# --------------------------------------------------------------------------- #
SAMPLE_TITLE = "7. PROGRAMMATŪRAS LIETOJAMĪBAS TESTĒŠANA"

SAMPLE_ENV = (
    "Testēšanas vide: Windows 11 x64 · Node.js 22.21.0 · Java 21 (Temurin JRE, "
    ".tools/jre) · Firestore emulators (firebase-tools 15.29.0) · "
    "2026. gada 20. oktobris"
)

SAMPLE_INTRO = [
    "Testēšanas mērķis ir pārbaudīt, vai lietotājs var veiksmīgi izmantot "
    "sistēmu — pierakstīties, saglabāt spēles rezultātu, apskatīt līderu tabulu "
    "un pārvaldīt izaicinājumus, — un vai sistēma korekti apstrādā kļūdainus "
    "datus. Tiek testēts ievades validācijas modulis, piekļuves tiesības un "
    "servera kļūdu apstrāde, izmantojot funkcionālo testēšanu.",
    "Izveidoti testa gadījumi veiksmīgai darbībai, darbībai ar nederīgiem "
    "ievaddatiem un darbībai bez nepieciešamajām tiesībām. Pārbaudes veic "
    "automatizēti testi: spēles loģika un formu validācija (89 testi), Cloud "
    "Functions (103 testi) un Firestore drošības noteikumi pret īsto emulatoru "
    "(20 testi) — kopā 212 testi, no kuriem visi izgāja.",
    "Testēšanas apraksts, gadījumi un rezultāti tiek parādīti 7.1. tabulā, "
    "detalizētie kļūdu testa gadījumi — 7.2. tabulā, bet identificētās kļūdas, "
    "to cēloņi un atkārtotās testēšanas rezultāti — 7.3. tabulā.",
]

SAMPLE_OVERVIEW_META = [
    ("Lietotāja loma:",
     "Viesis (nereģistrēts lietotājs), spēlētājs (role: user) un administrators "
     "(role: admin)"),
    ("Prasības identifikators:",
     "SEC-01 (drošības noteikumi), CH-03 (formu validācija), ADM-01 un ADM-02 "
     "(administrācija), AUTH-02, DATA-01, UI-03"),
    ("Prasības apraksts:",
     "Sistēma nedrīkst saglabāt nederīgus datus un nedrīkst pieļaut piekļuvi vai "
     "datu maiņu lietotājam bez attiecīgajām tiesībām. Jebkurā kļūdas gadījumā "
     "lietotājam jāparāda saprotams paziņojums, un dati nedrīkst tikt daļēji "
     "mainīti."),
]

SAMPLE_OVERVIEW_ROWS = [
    ("Viesis atver lietotni ārpus Telegram un mēģina pierakstīties",
     "Sesija netiek izveidota; tiek piedāvāts atvērt lietotni Telegram",
     "Sesija netiek izveidota; parādīta saite uz botu", "Pareizi"),
    ("Spēlētājs mēģina ierakstīt spēles rezultātu tieši datubāzē",
     "Rakstīšana tiek liegta; rezultātu saglabā tikai serveris",
     "Rakstīšana liegta (PERMISSION_DENIED)", "Pareizi"),
    ("Administrators ievada izaicinājuma formā nepilnīgus datus",
     "Saglabāšana tiek bloķēta un kļūdainie lauki tiek atzīmēti",
     "Saglabāšana bloķēta; norādīti visi seši kļūdainie lauki", "Pareizi"),
    ("Lietotājs bez administratora tiesībām mēģina mainīt izaicinājumu",
     "Darbība tiek noraidīta ar paskaidrojumu",
     "Noraidīts; parādīts administratora tiesību paziņojums", "Pareizi"),
    ("Cloud Functions serviss nav pieejams",
     "Lietotājs saņem paziņojumu un dati netiek mainīti",
     "Parādīts paziņojums, ka nekas nav mainīts", "Pareizi"),
]

SAMPLE_DETAIL_LEAD = (
    "Lai detalizēti pārbaudītu sistēmas uzvedību kļūdainas ievades, nepilnvarotas "
    "piekļuves un servisa kļūdu gadījumos, tika izpildīti robežvērtību un kļūdu "
    "testa gadījumi. Katrā gadījumā tika salīdzināts sagaidāmais rezultāts ar "
    "faktiski iegūto rezultātu. Testa gadījumu rezultāti apkopoti 7.2. tabulā; "
    "katrs gadījums norāda arī tā identifikatoru automatizēto testu kopā."
)

# (ID, testa gadījums, ievaddati / darbība, sagaidāmais, faktiskais, statuss)
SAMPLE_CASES = [
    {
        "title": "7.2.1. Ievades validācija (CH-03)",
        "note": "Testu kopa: src/features/challengeValidation.test.ts (npm test). "
                "Kļūdas tiek pieteiktas pa laukiem, un tās bloķē saglabāšanu.",
        "rows": [
            ("KT-V-01", "Tukšas formas saglabāšana", "Visi seši lauki tukši",
             "Kļūda visos laukos; fokuss uz pirmo lauku",
             "6 kļūdas (title, description, type, targetValue, startDate, "
             "endDate); firstInvalidField = title", "Pareizi"),
            ("KT-V-02", "Nosaukums tikai no atstarpēm", "title = \"   \"",
             "validate.titleRequired", "validate.titleRequired", "Pareizi"),
            ("KT-V-03", "Nosaukuma minimālais garums", "title = 2 rakstzīmes",
             "Kļūda ar {min: 3, count: 2}", "validate.min {min: 3, count: 2}",
             "Pareizi"),
            ("KT-V-04", "Nosaukuma maksimālais garums", "title = 81 rakstzīme",
             "Kļūda ar {max: 80, count: 81}",
             "validate.max {max: 80, count: 81}", "Pareizi"),
            ("KT-V-05", "Atstarpes nosaukuma malās", "title = \"  Spring  \"",
             "Pieņemts, atstarpes apgrieztas", "Kļūdas nav", "Pareizi"),
            ("KT-V-06", "Apraksta minimālais garums", "description = 5 rakstzīmes",
             "Kļūda ar {min: 10, count: 5}", "validate.min {min: 10, count: 5}",
             "Pareizi"),
            ("KT-V-07", "Apraksta maksimālais garums",
             "description = 501 rakstzīme", "Kļūda ar {max: 500, count: 501}",
             "validate.max {max: 500, count: 501}", "Pareizi"),
            ("KT-V-08", "Izaicinājuma tips",
             "Tips nav izvēlēts vai \"bogus\"", "validate.type",
             "validate.type", "Pareizi"),
            ("KT-V-09", "Tukšs mērķis", "targetValue = \"\"",
             "validate.targetRequired", "validate.targetRequired", "Pareizi"),
            ("KT-V-10", "Mērķis nav skaitlis",
             "targetValue = \"abc\", \"12abc\", \"NaN\", \"Infinity\"",
             "validate.number", "validate.number (visiem 4 variantiem)",
             "Pareizi"),
            ("KT-V-11", "Mērķis ar daļskaitli", "targetValue = \"1.5\"",
             "validate.whole", "validate.whole", "Pareizi"),
            ("KT-V-12", "Nulle vai negatīvs mērķis",
             "targetValue = \"0\", \"-1\", \"-1000\"", "validate.positive",
             "validate.positive (visiem 3 variantiem)", "Pareizi"),
            ("KT-V-13", "Mērķa robežvērtība",
             "targetValue = 1 000 001 un 1 000 000",
             "Virs robežas — kļūda; tieši uz robežas — pieņemts",
             "validate.maxTarget / bez kļūdas", "Pareizi"),
            ("KT-V-14", "Tukšs sākuma datums", "startDate = \"\"",
             "validate.startRequired", "validate.startRequired", "Pareizi"),
            ("KT-V-15", "Neeksistējošs sākuma datums",
             "startDate = \"2026-02-31\", \"2026-13-01\", \"2026-00-10\", "
             "\"01.03.2026\"",
             "validate.startInvalid (datums netiek pārritināts uz citu dienu)",
             "validate.startInvalid (visiem 4 variantiem)", "Pareizi"),
            ("KT-V-16", "Beigu datums pirms sākuma datuma", "10.03. → 09.03.",
             "validate.endOrder", "validate.endOrder", "Pareizi"),
            ("KT-V-17", "Sākuma un beigu datums vienā dienā",
             "Sākums = beigas", "Pieņemts", "Kļūdu nav", "Pareizi"),
            ("KT-V-18", "Fokuss uz kļūdaino lauku", "Kļūdains tikai mērķis (0)",
             "Kļūda tikai mērķa laukā; fokuss uz to",
             "1 kļūda: targetValue; firstInvalidField = targetValue", "Pareizi"),
            ("KT-V-19", "Nederīgi dati netiek nosūtīti", "Jebkurš nederīgs lauks",
             "toChallengeInput atgriež null", "null visos 6 scenārijos", "Pareizi"),
            ("KT-V-20", "Derīgu datu sagatavošana", "Visi lauki aizpildīti pareizi",
             "Beigu datums aizpilda visu dienu līdz 23:59:59.999",
             "23:59:59.999; sākums 00:00", "Pareizi"),
            ("KT-V-21", "Rediģēšanas režīms", "Saglabāts izaicinājums → forma",
             "Formas vērtības sakrīt ar saglabātajām",
             "Visas 6 vērtības sakrīt", "Pareizi"),
            ("KT-V-22", "Validācijas ziņojumu tulkojumi",
             "Visi 15 ziņojumi valodās en/lv/ru",
             "Neviena neiztulkota atslēga, neviens neaizvietots {parametrs}",
             "15 ziņojumi × 3 valodas — visi tulkoti", "Pareizi"),
            ("KT-V-23", "Ziņojumi atšķiras starp valodām",
             "Salīdzina en/lv/ru tekstus",
             "3 atšķirīgi teksti (nevis viena angļu teksta kopija)",
             "3 dažādi teksti", "Pareizi"),
        ],
    },
    {
        "title": "7.2.2. Datumu apstrāde",
        "note": "Testu kopa: challengeValidation.test.ts. JavaScript Date pārritina "
                "neeksistējošu dienu (31.02 → 3.03), tāpēc tiek pārbaudīts "
                "apgrieztais pārveidojums.",
        "rows": [
            ("KT-D-01", "Garais un īsais gads", "2024-02-29 un 2026-02-29",
             "Pirmais derīgs, otrais nederīgs", "date / null", "Pareizi"),
            ("KT-D-02", "Neeksistējoša mēneša diena", "31.02.2026 un 31.04.2026",
             "null — diena netiek pārbīdīta uz nākamo mēnesi", "null / null",
             "Pareizi"),
            ("KT-D-03", "Datuma formāta stingrība",
             "\"2026-3-1\", \" 2026-03-01 \", \"\", \"2026-03\"",
             "Tikai YYYY-MM-DD (ar atstarpēm malās) ir derīgs",
             "null / derīgs / null / null", "Pareizi"),
        ],
    },
    {
        "title": "7.2.3. Administratora darbību kļūdu paziņojumi (ADM-01, ADM-02)",
        "note": "Testu kopa: src/features/adminErrors.test.ts (npm test). Pārbauda, "
                "ko administrators redz, kad izaicinājuma izveide, labošana vai "
                "dzēšana neizdodas.",
        "rows": [
            ("KT-A-01", "Nav administratora tiesību",
             "functions/permission-denied, \"Admin only. [403]\"",
             "Paskaidro, ka mainīt drīkst tikai administrators, bez statusa numura",
             "Atbilst; [403] noņemts", "Pareizi"),
            ("KT-A-02", "Sesija nav derīga", "functions/unauthenticated",
             "Aicina pierakstīties vēlreiz", "Satur \"Sign in again\"", "Pareizi"),
            ("KT-A-03", "Izaicinājums vairs neeksistē",
             "functions/not-found, \"Challenge not found. [404]\"",
             "Paskaidro, ka ieraksts vairs neeksistē",
             "Satur \"no longer exists\"; [404] noņemts", "Pareizi"),
            ("KT-A-04", "Serviss nav pieejams", "functions/unavailable",
             "Paziņojums, ka nekas nav mainīts",
             "\"unreachable … nothing was changed\"", "Pareizi"),
            ("KT-A-05", "Servera validācijas kļūda",
             "functions/invalid-argument, \"Title must be 3-80 characters. [400]\"",
             "Servera teksts bez statusa numura",
             "\"Title must be 3-80 characters.\"", "Pareizi"),
            ("KT-A-06", "Funkcija nav izvietota", "functions/unimplemented",
             "Paziņojums, ka funkcija nav sasniedzama un nekas nav mainīts",
             "\"could not be reached … nothing was changed\"", "Pareizi"),
            ("KT-A-07", "Tukšs funkcijas maršruts",
             "functions/not-found ar tekstu \"NOT_FOUND\"",
             "Atpazīts kā nesasniedzama funkcija, nevis dzēsts izaicinājums",
             "\"could not be reached\"", "Pareizi"),
            ("KT-A-08", "Servera iekšējā kļūda",
             "functions/internal \"internal [500]\" un cita internal kļūda",
             "Pirmā — nesasniedzama funkcija; otrā — teksta paziņojums",
             "\"could not be reached\" / \"Database write failed.\"", "Pareizi"),
            ("KT-A-09", "Nezināms kļūdas kods", "Kods ar teksta ziņojumu",
             "Teksts tiek parādīts lietotājam", "\"Boom.\"", "Pareizi"),
            ("KT-A-10", "Tukša kļūdas vērtība",
             "null, undefined vai tukšs ziņojums",
             "Vispārīgs paziņojums, nevis \"null\" vai tukša rinda",
             "\"Something went wrong and nothing was changed.\"", "Pareizi"),
        ],
    },
    {
        "title": "7.2.4. Firestore drošības noteikumi (SEC-01) — nepilnvarota piekļuve",
        "note": "Testu kopa: test/firestore.rules.test.ts pret īsto Firestore "
                "emulatoru (npm run test:rules). Tiek izmantoti tie paši noteikumi, "
                "ko izvieto Firebase (firestore.rules).",
        "rows": [
            ("KT-R-01", "Viesis lasa profilu pēc id", "Bez sesijas, users/{uid}",
             "PERMISSION_DENIED", "Liegts", "Pareizi"),
            ("KT-R-02", "Viesis lasa izaicinājumus",
             "Bez sesijas, challenges saraksts un dokuments",
             "PERMISSION_DENIED", "Liegts (abos gadījumos)", "Pareizi"),
            ("KT-R-03", "Viesis lasa spēles rezultātus",
             "Bez sesijas, gameResults", "PERMISSION_DENIED", "Liegts",
             "Pareizi"),
            ("KT-R-04", "Viesis mēģina rakstīt",
             "users, gameResults un challenges", "PERMISSION_DENIED",
             "Liegts (visās kolekcijās)", "Pareizi"),
            ("KT-R-05", "Spēlētājs lasa savu profilu", "role: user, savs uid",
             "Atļauts, atgriež inGameName", "\"Player One\"", "Pareizi"),
            ("KT-R-06", "Spēlētājs lasa cita profilu",
             "Cita lietotāja uid un viss users saraksts", "PERMISSION_DENIED",
             "Liegts", "Pareizi"),
            ("KT-R-07", "Spēlētājs raksta savu profilu",
             "set, update (bestScore), delete, add, role: \"admin\"",
             "PERMISSION_DENIED visiem",
             "Liegts (arī paaugstināšana par administratoru)", "Pareizi"),
            ("KT-R-08", "Spēlētājs maina izaicinājumus",
             "challenges: set, update, delete, add",
             "Lasīt atļauts, rakstīt liegts",
             "1 dokuments lasīts; rakstīšana liegta", "Pareizi"),
            ("KT-R-09", "Spēlētājs vaicā savus rezultātus",
             "where uid == savs id", "Atļauts, atgriež tikai savu rezultātu",
             "1 ieraksts, score 42", "Pareizi"),
            ("KT-R-10", "Piekļuve cita spēlētāja rezultātiem",
             "Cita uid, vaicājums bez filtra, lasīšana pēc id, rakstīšana",
             "PERMISSION_DENIED", "Liegts visiem", "Pareizi"),
            ("KT-R-11", "Diapazona un in vaicājumi",
             "where uid >= … un where uid in [a, b]",
             "PERMISSION_DENIED — nevar apiet uid ierobežojumu", "Liegti abi",
             "Pareizi"),
            ("KT-R-12", "Administratora lasīšanas un rakstīšanas tiesības",
             "role: admin, lasīšana un rakstīšana",
             "Lasa savu profilu un izaicinājumus; rakstīšana liegta",
             "Tāpat kā spēlētājam, bez papildu tiesībām", "Pareizi"),
            ("KT-R-13", "Nezināmi un apakšceļi",
             "secrets un users/{uid}/private",
             "PERMISSION_DENIED viesim, spēlētājam un administratoram",
             "Liegts visiem trim", "Pareizi"),
        ],
    },
    {
        "title": "7.2.5. Cloud Functions (AUTH-02, DATA-01, ADM-01, UI-03) — servera kļūdas",
        "note": "Testu kopa: functions/test (103 testi). Serveris ir vienīgā "
                "rakstīšanas vieta, tāpēc tā noraidījumi ir drošības robeža: katrs "
                "scenārijs pārbauda konkrēto kļūdas kodu.",
        "rows": [
            ("KT-F-01", "Autentifikācija bez initData",
             "authenticateTelegram bez initData vai ar initData, kas nav virkne",
             "invalid-argument", "invalid-argument (abos)", "Pareizi"),
            ("KT-F-02", "Viltots initData hash", "initData ar nepareizu hash",
             "unauthenticated", "unauthenticated", "Pareizi"),
            ("KT-F-03", "Klienta norādīts Telegram id",
             "devTelegramId ārpus emulatora",
             "invalid-argument — lokālās pieslēgšanās apiešana ir slēgta",
             "invalid-argument", "Pareizi"),
            ("KT-F-04", "Trūkst bota tokena",
             "Serverim nav konfigurēts TELEGRAM_BOT_TOKEN",
             "failed-precondition (nevis klusa piekrišana)", "failed-precondition",
             "Pareizi"),
            ("KT-F-05", "Rezultāta iesniegšana bez sesijas",
             "submitGameResult bez sesijas", "unauthenticated", "unauthenticated",
             "Pareizi"),
            ("KT-F-06", "Nederīgs punktu skaits",
             "score = -1, 1.5, 10001, \"10\", null", "invalid-argument",
             "invalid-argument (visiem 5)", "Pareizi"),
            ("KT-F-07", "Nederīgs spēles ilgums",
             "durationMs = -1, 1.5, 21 600 001, \"1000\"", "invalid-argument",
             "invalid-argument (visiem 4)", "Pareizi"),
            ("KT-F-08", "Nederīgs lēcienu skaits",
             "jumpCount = -1, 10001, 2.5", "invalid-argument",
             "invalid-argument (visiem 3)", "Pareizi"),
            ("KT-F-09", "Rezultāts spēlētājam bez profila",
             "Lietotājam nav izveidots profils",
             "failed-precondition — vispirms jāpiekrīt datu apstrādei",
             "failed-precondition", "Pareizi"),
            ("KT-F-10", "Atkārtots viens un tas pats rezultāts",
             "runId nosūtīts divreiz (bezsaistes rinda)",
             "Rezultāts netiek skaitīts divreiz",
             "totalGames 1 → 1; paliek viens ieraksts", "Pareizi"),
            ("KT-F-11", "Nederīgs runId", "runId = \"../../oops\"",
             "Apstrādāts kā nav norādīts; kļūda netiek izmesta",
             "Rezultāts saglabāts, 1 ieraksts", "Pareizi"),
            ("KT-F-12", "Izaicinājuma maiņa bez tiesībām",
             "adminChallengeMutation bez sesijas, ar user lomu vai bez role claim",
             "unauthenticated vai permission-denied; datubāzē nekas netiek ierakstīts",
             "Atbilst; challenges kolekcija paliek tukša", "Pareizi"),
            ("KT-F-13", "Nederīga izaicinājuma darbība",
             "Nezināma operācija, targetValue -1, update bez challengeId",
             "invalid-argument", "invalid-argument (visiem 4)", "Pareizi"),
            ("KT-F-14", "Neesošs izaicinājums",
             "update neesošam challengeId", "not-found", "not-found", "Pareizi"),
            ("KT-F-15", "Profila atjaunināšana ar nederīgiem datiem",
             "Tukšs patch; vārdi \"ab\", 21 zīme, \"has space\", "
             "\"dash-name\", \"\"; preferredX -1 un 1.5", "invalid-argument",
             "invalid-argument (visiem variantiem)", "Pareizi"),
            ("KT-F-16", "Līderu tabulas parametri",
             "getLeaderboard bez sesijas; period \"yearly\", {}, 3",
             "unauthenticated; invalid-argument", "Atbilst", "Pareizi"),
        ],
    },
]

SAMPLE_DEFECT_LEAD = (
    "Veicot programmatūras testēšanu, tika identificētas piecas kļūdas, kas "
    "ietekmēja sistēmas vai tās testu darbību. Katrai identificētajai kļūdai "
    "tika noteikts cēlonis un veikti nepieciešamie labojumi. Pēc kļūdu "
    "novēršanas tika veikta atkārtota testēšana, lai pārliecinātos par veikto "
    "labojumu korektumu. Identificētās kļūdas, to cēloņi, veiktie labojumi un "
    "atkārtotās testēšanas rezultāti apkopoti 7.3. tabulā."
)

# (kļūda, cēlonis, labošana, atkārtots rezultāts, statuss)
SAMPLE_DEFECT_ROWS = [
    ("Testu tipu pārbaude krita ar TS2339 (import.meta.env), tāpēc kļūdu "
     "testus nevarēja palaist vispār",
     "tsconfig.test.json tika veidots atsevišķi no aplikācijas konfigurācijas, "
     "un tajā trūka Vite klienta tipu",
     "tsconfig.test.json tipu sarakstam pievienots \"vite/client\"",
     "npm test tipu pārbaude iziet; palaižas 89 testi", "Novērsta"),
    ("node --test nevarēja ielādēt challengeValidation moduli "
     "(ERR_MODULE_NOT_FOUND)",
     "Node ESM neatrisina importa ceļus bez faila paplašinājuma; Vite to "
     "pieļauj, tāpēc kļūda parādījās tikai testos",
     "Importa ceļiem pievienots .ts paplašinājums",
     "26 formas validācijas testi iziet", "Novērsta"),
    ("Administrators kā kļūdas paziņojumu redzēja tekstu \"null\"",
     "describeMutationError apstrādāja tikai Error objektus, bet ne null, "
     "undefined vai tukšu ziņojumu",
     "Pievienota vispārīga atbilde \"Something went wrong and nothing was "
     "changed.\"",
     "KT-A-10 iziet; admina panelī vairs nav \"null\"", "Novērsta"),
    ("npm run setup:test-tools neizdevās Windows vidē (tar: Cannot connect to "
     "C: resolve failed; gzip: more than one entry)",
     "Skripts pieņēma, ka visās OS ir .tar.gz no absolūta ceļa, bet Adoptium "
     "Windows vidē piegādā ZIP, un GNU tar absolūto ceļu uztver kā "
     "tālvadības resursu",
     "Ielādes formāts tiek izvēlēts pēc OS (ZIP Windows vidē); ekstrakcija "
     "notiek ar relatīviem ceļiem, izmantojot Windows bsdtar (rezerves "
     "variants — PowerShell Expand-Archive)",
     "npm run setup:test-tools uzstāda Java 21 .tools/jre; npm run test:rules "
     "iziet (20 testi)", "Novērsta"),
    ("npm run test:rules krita ar \"unknown option '--test'\"",
     "Windows vidē komanda tiek palaista ar shell, kas argumentu sarakstu "
     "sadala pa vārdiem, tāpēc testu komandas karodziņš --test nonāca "
     "firebase-tools opciju analizatorā",
     "Testu komanda tiek ietverta pēdiņās vietās, kur tiek izmantots shell",
     "npm run test:rules iziet; 20 noteikumu testi pret emulatoru", "Novērsta"),
]

SAMPLE_MANUAL_NOTE = (
    "Pieci scenāriji — kļūdas ekrāns (ErrorBoundary) pārlūkā, bezsaistes "
    "rezultātu rinda, piekrišanas dialoga kļūda, iztrūkstošs audio fails un "
    "administratora paziņojums, kad funkcija nav izvietota — prasa pārlūku, "
    "tīkla pārtraukumu vai Telegram klientu. Tie nav izpildīti automatizēti, "
    "tāpēc to statuss ir \"Jāveic manuāli\", nevis \"Pareizi\"."
)


def caption(doc, text):
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run(text)
    run.bold = True
    run.font.size = Pt(10)
    paragraph.paragraph_format.space_after = Pt(0)
    return paragraph


def table_title(doc, text):
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run(text)
    run.bold = True
    run.font.size = Pt(10.5)
    paragraph.paragraph_format.space_after = Pt(4)
    return paragraph


def set_table_widths(table, widths_cm) -> None:
    """Column widths that stay correct with merged cells (a merged cell is
    one tc, so it is measured once instead of once per grid slot)."""
    table.autofit = False
    for index, width in enumerate(widths_cm):
        table.columns[index].width = Cm(width)
    for row in table.rows:
        seen = set()
        for index, cell in enumerate(row.cells):
            key = id(cell._tc)
            if key in seen:
                continue
            seen.add(key)
            cell.width = Cm(widths_cm[index])


def sample_overview_table(doc) -> None:
    """7.1 — the sample's layout: three metadata rows whose value cell spans
    the table, then a header row and the scenario rows."""
    widths = [4.6, 4.4, 4.2, 2.8]
    headers = ["Ievaddatu/situācijas apraksts", "Sagaidāmais rezultāts",
               "Faktiskais rezultāts", "Statuss"]
    table = doc.add_table(rows=0, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    for label, value in SAMPLE_OVERVIEW_META:
        cells = table.add_row().cells
        label_cell = cells[0]
        label_cell.text = ""
        run = label_cell.paragraphs[0].add_run(label)
        run.bold = True
        run.font.size = Pt(9)
        shade(label_cell, "EDEFF7")
        value_cell = cells[1].merge(cells[len(headers) - 1])
        value_cell.text = ""
        value_cell.paragraphs[0].add_run(value).font.size = Pt(9)

    header_row = table.add_row()
    for cell, text in zip(header_row.cells, headers):
        cell.text = ""
        run = cell.paragraphs[0].add_run(text)
        run.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        shade(cell, "1F3864")
    repeat_header(header_row)

    for values in SAMPLE_OVERVIEW_ROWS:
        row = table.add_row()
        row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        for column, (cell, value) in enumerate(zip(row.cells, values)):
            cell.text = ""
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(0)
            run = paragraph.add_run(str(value))
            run.font.size = Pt(9)
            if column == len(headers) - 1:
                run.bold = True
                run.font.color.rgb = RGBColor(0x0B, 0x6B, 0x33)

    set_table_widths(table, widths)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def sample_build_docx() -> None:
    doc = Document()

    section = doc.sections[0]
    section.page_height = Cm(29.7)
    section.page_width = Cm(21.0)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(1.8)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)
    add_page_number_footer(section, "Bird Energy — programmatūras lietojamības testēšana")

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.1

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_after = Pt(2)
    run = title.add_run(SAMPLE_TITLE)
    run.bold = True
    run.font.size = Pt(15)
    run.font.color.rgb = RGBColor(0x1F, 0x38, 0x64)

    env = doc.add_paragraph()
    env.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = env.add_run(SAMPLE_ENV)
    run.italic = True
    run.font.size = Pt(9)
    env.paragraph_format.space_after = Pt(12)

    for line in SAMPLE_INTRO:
        doc.add_paragraph(line)

    caption(doc, "7.1. Tabula")
    table_title(doc, "Programmatūras lietojamības testēšanas dati")
    sample_overview_table(doc)

    caption(doc, "7.2. Tabula")
    table_title(doc, "Kļūdu testēšanas detalizētie dati")
    doc.add_paragraph(SAMPLE_DETAIL_LEAD)
    number = 0
    for group in SAMPLE_CASES:
        heading(doc, group["title"], level=3)
        doc.add_paragraph(group["note"])
        rows = []
        for row in group["rows"]:
            number += 1
            rows.append((number, *row))
        fill_table(
            doc,
            ["Nr.", "ID", "Testa gadījums", "Ievaddati / darbība",
             "Sagaidāmais rezultāts", "Faktiskais rezultāts", "Statuss"],
            rows,
            [1.0, 1.4, 3.0, 3.4, 3.4, 3.0, 1.8],
            font_size=7.5,
            status_column=6,
        )

    caption(doc, "7.3. Tabula")
    table_title(doc, "Identificēto kļūdu novēršana un atkārtots testēšanas rezultāti")
    doc.add_paragraph(SAMPLE_DEFECT_LEAD)
    fill_table(
        doc,
        ["Nr.", "Identificētā kļūda", "Kļūdas cēlonis", "Veiktā labošana",
         "Atkārtots testēšanas rezultāts", "Statuss"],
        [(number, *row) for number, row in enumerate(SAMPLE_DEFECT_ROWS, start=1)],
        [1.0, 3.6, 3.8, 3.8, 3.4, 1.8],
        font_size=7.5,
        status_column=5,
    )

    doc.add_paragraph(SAMPLE_MANUAL_NOTE)

    doc.save(SAMPLE_DOCX_PATH)


def sample_build_markdown() -> None:
    out = [f"## {SAMPLE_TITLE}", "", f"*{SAMPLE_ENV}*", ""]
    out += [line + "\n" for line in SAMPLE_INTRO]

    out += ["**7.1. Tabula — Programmatūras lietojamības testēšanas dati**", ""]
    for label, value in SAMPLE_OVERVIEW_META:
        out.append(f"* {label} {value}")
    out.append("")
    out.append(md_table(
        ["Ievaddatu/situācijas apraksts", "Sagaidāmais rezultāts",
         "Faktiskais rezultāts", "Statuss"],
        SAMPLE_OVERVIEW_ROWS,
    ))
    out.append("")

    out += ["**7.2. Tabula — Kļūdu testēšanas detalizētie dati**", "",
            SAMPLE_DETAIL_LEAD, ""]
    number = 0
    for group in SAMPLE_CASES:
        out.append("### " + group["title"])
        out.append("")
        out.append(group["note"])
        out.append("")
        rows = []
        for row in group["rows"]:
            number += 1
            rows.append((number, *row))
        out.append(md_table(
            ["Nr.", "ID", "Testa gadījums", "Ievaddati / darbība",
             "Sagaidāmais rezultāts", "Faktiskais rezultāts", "Statuss"],
            rows,
        ))
    out.append("")

    out += ["**7.3. Tabula — Identificēto kļūdu novēršana un atkārtots "
            "testēšanas rezultāti**", "", SAMPLE_DEFECT_LEAD, ""]
    out.append(md_table(
        ["Nr.", "Identificētā kļūda", "Kļūdas cēlonis", "Veiktā labošana",
         "Atkārtots testēšanas rezultāts", "Statuss"],
        [(number, *row) for number, row in enumerate(SAMPLE_DEFECT_ROWS, start=1)],
    ))
    out += ["", SAMPLE_MANUAL_NOTE, ""]

    SAMPLE_MD_PATH.write_text("\n".join(out), encoding="utf-8")


if __name__ == "__main__":
    # The Windows console defaults to cp1252 and cannot encode the Latvian
    # diacritics in the summary lines, which would abort the script after the
    # files are already written.
    try:
        import sys

        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    build_docx()
    build_markdown()
    sample_build_docx()
    sample_build_markdown()
    print(f"DOCX: {DOCX_PATH}")
    print(f"MD:   {MD_PATH}")
    print(f"DOCX: {SAMPLE_DOCX_PATH}")
    print(f"MD:   {SAMPLE_MD_PATH}")
    print(f"Ģenerēts: {dt.date.today().isoformat()}")
