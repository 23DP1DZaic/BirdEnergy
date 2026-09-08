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

Atbild par Firebase konfigurāciju, Cloud Firestore datubāzi, Firebase Hosting, Telegram initData verifikāciju, Firebase custom token autentifikāciju, spēles rezultātu saglabāšanu, Firestore Security Rules un leaderboard datu servisiem.

### Dalībnieks 3 (Alberts) - Challenges, administrators un kvalitāte

Atbild par Challenges ekrānu, administratora paneli, Challenge CRUD funkcionalitāti, formu validāciju, dzēšanas apstiprinājumu, meklēšanu un filtrēšanu, integrācijas testēšanu, manuālo testu plānu, dokumentāciju un demo sagatavošanu.

### Dalībnieks 4 (Rodions) - 

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
