// i18n — app language layer. en / lv / ru.
import { useSyncExternalStore } from 'react'
export const LOCALE_CODE: Record<Locale, string> = {en:'en-GB', lv:'lv-LV', ru:'ru-RU'}
export const LOCALE_LABEL: Record<Locale, string> = {en:'English', lv:'Latviešu', ru:'Русский'}

export type Locale = 'en' | 'lv' | 'ru'
export const LOCALES: Locale[] = ['en', 'lv', 'ru']

type Strings = Record<string, string>

const EN: Strings = {
  // --- shell / navigation ---
  'nav.challenges': 'Challenges',
  'nav.home': 'Home',
  'nav.play': 'Play',
  'nav.leaderboard': 'Leaderboard',
  'nav.profile': 'Profile',
  'nav.admin': 'Admin',
  'sign.signIn': 'Sign in with Telegram',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.saving': 'Saving…',
  'placeholder.coming': 'Coming in {card}',

  // --- error boundary ---
  'error.title': 'Something went wrong',
  'error.text': 'The game hit an unexpected error and had to stop.',
  'error.reload': 'Reload',

  // --- home ---
  'home.hello': 'Hello, {name}!',
  'home.play': '▶ Play',
  'home.openBot': 'Open Telegram Bot',
  'home.devLogin': 'DEV login: Telegram id {id} via the Functions emulator',
  'home.settings': 'Settings',
  'home.music': 'Music: {state}',
  'home.sfx': 'Sound effects: {state}',
  'home.language': 'Language: {name}',
  'home.info': 'Info',
  'state.on': 'On',
  'state.off': 'Off',

  // --- game ---
  'game.guard': 'Playing needs a Telegram session. Sign in from the Home screen (inside Telegram, or with the dev login).',
  'game.checking': 'Checking your player profile…',
  'game.profileError': 'Could not load your player profile: {message}',
  'game.beforeYouPlay': 'Before you play',
  'game.consent': 'Is it okay to use your Telegram data for the game — your name on the leaderboard and your scores in your profile?',
  'game.consentFineprint': 'We store your Telegram id and username only to identify your scores. Nothing is shared publicly except the name you see on the leaderboard.',
  'game.agree': 'Agree and play',
  'game.decline': 'No thanks',

  // --- canvas (game over panel) ---
  'canvas.tapToFlap': 'Tap to flap',
  'canvas.gameOver': 'Game Over',
  'canvas.newBest': 'NEW BEST! ({best})',
  'canvas.best': 'BEST: {best}',
  'canvas.challengeDone': 'CHALLENGE DONE!',
  'canvas.playAgain': 'TAP TO PLAY AGAIN',

  // --- pause / countdown / share / offline queue ---
  'pause.open': 'Pause',
  'pause.title': 'Paused',
  'pause.score': 'Score {score}',
  'pause.resume': 'Resume',
  'pause.playAgain': 'Play again',
  'pause.hint': 'Esc resumes too',
  'pause.countdown': 'Starting in {n}',
  'sound.turnOn': 'Turn sounds on',
  'sound.turnOff': 'Turn sounds off',
  'share.button': 'Share score',
  'share.copied': 'Link copied!',
  'share.failed': 'Could not share',
  'share.title': 'Bird Energy',
  'share.text': 'I scored {score} in Bird Energy. Beat that!',
  'queue.pending.one': '1 run waiting to sync',
  'queue.pending.other': '{n} runs waiting to sync',
  'home.haptics': 'Vibration: {state}',

  // --- tutorial ---
  'tutorial.title': 'How to play',
  'tutorial.text': 'Tap to jump. Don’t touch the obstacles.',
  'tutorial.gif': 'Tutorial GIF',

  // --- leaderboard ---
  'leaderboard.period': 'Leaderboard period',
  'leaderboard.daily': 'Daily',
  'leaderboard.weekly': 'Weekly',
  'leaderboard.all': 'All Time',
  'leaderboard.guard': 'Sign in with Telegram to see the leaderboard and record your runs.',
  'leaderboard.error': 'Could not load the leaderboard.',
  'leaderboard.empty': 'No scores yet for this period — go set one!',
  'leaderboard.yourBest': 'Your best: {name} — {score}',

  // --- challenges screen ---
  'challenges.guard': 'Sign in with Telegram to see challenges and your progress.',
  'challenges.error': 'Could not load challenges.',
  'challenges.progressUnavailable': 'Progress is unavailable right now — showing the challenges without it.',
  'challenges.search': 'Search challenges…',
  'challenges.searchAria': 'Search challenges by title',
  'challenges.clearSearch': 'Clear search',
  'challenges.filterAria': 'Challenge status filter',
  'filter.all': 'All',
  'filter.active': 'Active',
  'filter.finished': 'Finished',
  'status.upcoming': 'Upcoming',
  'status.active': 'Active',
  'status.finished': 'Finished',
  'challenges.shown': '{shown} of {total} shown',
  'challenges.count.one': '{n} challenge',
  'challenges.count.other': '{n} challenges',
  'challenges.noMatch': 'No challenges match your search.',
  'challenges.clearFilters': 'Clear filters',
  'challenges.none': 'No challenges yet — check back soon!',
  'challenges.progressMissing': 'Progress: —',
  'challenges.progressAria': '{title} progress',

  // --- challenge helpers (challenges.ts) ---
  'target.label': 'Target: {n} {unit}',
  'target.points': 'points',
  'target.games': 'games',

  // --- profile ---
  'profile.guard': 'Sign in with Telegram to see your profile and stats.',
  'profile.loading': 'Loading your profile…',
  'profile.error': 'Could not load your profile.',
  'profile.none': 'No player profile yet. Open the Game screen and accept data processing to create it.',
  'profile.role': 'admin',
  'profile.best': 'Best score',
  'profile.totalGames': 'Total games',
  'profile.totalScore': 'Total score',
  'profile.inGameName': 'In-game name',
  'profile.chars': '{min}–{max} chars',
  'profile.save': 'Save',
  'profile.nameSaved': 'Saved — the leaderboard now shows this name.',
  'profile.nameHint': 'Shown on the leaderboard instead of your Telegram @username. 3–20 characters: letters, digits, underscore.',
  'profile.nameRule': 'Must be {min}–{max} characters: letters, digits, underscore.',
  'profile.appearance': 'Appearance',
  'profile.tabs.skins': 'Skins',
  'profile.tabs.backgrounds': 'Backgrounds',
  'profile.tabs.grounds': 'Grounds',
  'profile.tabsAria': 'Appearance category',
  'profile.opt.skin': 'Skin',
  'profile.opt.background': 'Background',
  'profile.opt.ground': 'Ground',
  'profile.selected': ' (selected)',
  'profile.prefError': 'Saved on this device only — {message}',
  'profile.appearanceHint': 'The game and Home use these right away; your choice is also saved to your profile for other devices.',
  'profile.avatar': '{name} avatar',
  'profile.player': 'Player',
  'sign.inProgress': 'Signing in…',
  'sign.signedIn': 'Signed in: role={role} id={id} name={name}',
  'sign.failed': 'Failed: {message}',
  'sign.emulatorHint': '— are the local emulators running? Start them with "npx firebase-tools emulators:start --only auth,firestore,functions --project birdenergy-f1405", or open the app via @{bot}.',
  // --- admin panel (challenge form + list) ---
  'admin.newTitle': 'New challenge',
  'admin.editTitle': 'Edit challenge',
  'admin.updated': 'Updated “{title}”.',
  'admin.created': 'Created “{title}”.',
  'admin.existing': 'Existing challenges',
  'admin.edit': 'Edit',
  'admin.editAria': 'Edit {title}',
  'admin.delete': 'Delete',
  'admin.deleteAria': 'Delete {title}',
  'admin.deleted': 'Deleted “{title}”.',
  'admin.confirmTitle': 'Delete this challenge?',
  'admin.confirmMessage': '“{title}” will be removed for every player and cannot be brought back. Progress already earned stays in the players’ game results.',
  'admin.confirmDelete': 'Delete',
  'admin.deleting': 'Deleting…',
  'admin.empty': 'No challenges yet — the form above creates the first one.',
  'admin.deleteNote': 'Deleting is permanent for every player, so it always asks for confirmation first.',

  // --- challenge form labels ---
  'form.title': 'Title',
  'form.description': 'Description',
  'form.type': 'Type',
  'form.target': 'Target',
  'form.startDate': 'Start date',
  'form.endDate': 'End date',
  'form.range': '{min}–{max} characters',
  'form.typePlaceholder': 'Choose a type…',
  'form.typeScore': 'Best single-game score',
  'form.typeGames': 'Games played',
  'form.targetPlaceholder': 'e.g. 100',
  'form.hintGames': 'Completed runs inside the window.',
  'form.hintScore': 'Best single-run score inside the window.',
  'form.hintPickType': 'Pick a type first — points or games.',
  'form.blocked.one': 'Nothing was saved — 1 field needs fixing.',
  'form.blocked.other': 'Nothing was saved — {n} fields need fixing.',
  'form.saved': 'Saved.',
  'form.create': 'Create challenge',
  'form.saveChanges': 'Save changes',
  'form.cancel': 'Cancel',
  'form.rules': 'Title {titleMin}–{titleMax}, description {descMin}–{descMax}, whole-number target 1–{targetMax}, end date on or after the start date.',

  // --- challenge form validation (keys produced by challengeValidation.ts) ---
  'validate.titleRequired': 'Title is required.',
  'validate.descRequired': 'Description is required.',
  'validate.targetRequired': 'Target is required.',
  'validate.min': 'Use at least {min} characters ({count} so far).',
  'validate.max': 'Use at most {max} characters ({count}).',
  'validate.number': 'Enter a number.',
  'validate.whole': 'Use a whole number — no decimals.',
  'validate.positive': 'Target must be greater than 0.',
  'validate.maxTarget': 'Target must be at most {max}.',
  'validate.type': 'Choose a challenge type.',
  'validate.startRequired': 'Start date is required.',
  'validate.startInvalid': 'Enter a valid start date.',
  'validate.endRequired': 'End date is required.',
  'validate.endInvalid': 'Enter a valid end date.',
  'validate.endOrder': 'End date must be on or after the start date.',

}
const LV: Strings = {
  'nav.challenges': 'Izaicinājumi',
  'nav.home': 'Sākums',
  'nav.play': 'Spēlēt',
  'nav.leaderboard': 'Reitings',
  'nav.profile': 'Profils',
  'nav.admin': 'Administrators',
  'sign.signIn': 'Pierakstīties ar Telegram',
  'common.loading': 'Ielādējas…',
  'common.retry': 'Mēģināt vēlreiz',
  'common.saving': 'Saglabā…',
  'placeholder.coming': 'Pienāks ar {card}',

  'error.title': 'Kaut kas nogāja greizi',
  'error.text': 'Spēle saskārās ar neparedzētu kļūdu un ir apturēta.',
  'error.reload': 'Pārlādēt',

  'home.hello': 'Sveicinies, {name}!',
  'home.play': '▶ Spēlēt',
  'home.openBot': 'Atvērt Telegram botu',
  'home.devLogin': 'DEV pieslēgums: Telegram id {id} caur Functions emulatoru',
  'home.settings': 'Iestatījumi',
  'home.music': 'Mūzika: {state}',
  'home.sfx': 'Skaņas efekti: {state}',
  'home.language': 'Valoda: {name}',
  'home.info': 'Info',
  'state.on': 'Ieslēgts',
  'state.off': 'Izslēgts',

  'game.guard': 'Spēlēšanai nepieciešama Telegram sesija. Pieraksties sākuma ekrānā (Telegram iekšā vai ar dev pieslēgumu).',
  'game.checking': 'Pārbauda tavu spēlētāja profilu…',
  'game.profileError': 'Neizdevās ielādēt tavu spēlētāja profilu: {message}',
  'game.beforeYouPlay': 'Pirms sāc spēlēt',
  'game.consent': 'Vai drīkstam izmantot tavus Telegram datus spēlei — tavu vārdu reitingā un rezultātus profilā?',
  'game.consentFineprint': 'Glabājam tavu Telegram id un lietotājvārdu tikai, lai atpazītu rezultātus. Publiski redzams ir tikai tas vārds, ko tu redzi reitingā.',
  'game.agree': 'Piekrītu un spēlēju',
  'game.decline': 'Nē, paldies',

  'canvas.tapToFlap': 'Piesit, lai paceltos',
  'canvas.gameOver': 'Spēle beigusies',
  'canvas.newBest': 'JAUNS REKORDS! ({best})',
  'canvas.best': 'REKORDS: {best}',
  'canvas.challengeDone': 'IZAICINĀJUMS IZPILDĪTS!',
  'canvas.playAgain': 'PIESIT, LAI SPĒLĒTU VĒLREIZ',

  'pause.open': 'Pauze',
  'pause.title': 'Pauzēts',
  'pause.score': 'Rezultāts {score}',
  'pause.resume': 'Turpināt',
  'pause.playAgain': 'Spēlēt no jauna',
  'pause.hint': 'Esc arī turpina',
  'pause.countdown': 'Sāksies pēc {n}',
  'sound.turnOn': 'Ieslēgt skaņu',
  'sound.turnOff': 'Izslēgt skaņu',
  'share.button': 'Dalīties ar rezultātu',
  'share.copied': 'Saite nokopēta!',
  'share.failed': 'Neizdevās dalīties',
  'share.title': 'Bird Energy',
  'share.text': 'Es sakrāju {score} punktus spēlē Bird Energy. Pārspēj mani!',
  'queue.pending.one': '1 rezultāts gaida sinhronizāciju',
  'queue.pending.other': '{n} rezultāti gaida sinhronizāciju',
  'home.haptics': 'Vibrācija: {state}',

  'tutorial.title': 'Kā spēlēt',
  'tutorial.text': 'Piesit, lai paceltos. Nepieskaries šķēršļiem.',
  'tutorial.gif': 'Mācību GIF',

  'leaderboard.period': 'Reitinga periods',
  'leaderboard.daily': 'Dienas',
  'leaderboard.weekly': 'Nedēļas',
  'leaderboard.all': 'Visu laiku',
  'leaderboard.guard': 'Pieraksties ar Telegram, lai redzētu reitingu un saglabātu savus rezultātus.',
  'leaderboard.error': 'Neizdevās ielādēt reitingu.',
  'leaderboard.empty': 'Šajā periodā vēl nav rezultātu — radi pirmo!',
  'leaderboard.yourBest': 'Tavs labākais: {name} — {score}',

  'challenges.guard': 'Pieraksties ar Telegram, lai redzētu izaicinājumus un savu progresu.',
  'challenges.error': 'Neizdevās ielādēt izaicinājumus.',
  'challenges.progressUnavailable': 'Progress šobrīd nav pieejams — rādām izaicinājumus bez tā.',
  'challenges.search': 'Meklēt izaicinājumus…',
  'challenges.searchAria': 'Meklēt izaicinājumus pēc nosaukuma',
  'challenges.clearSearch': 'Notīrīt meklēšanu',
  'challenges.filterAria': 'Izaicinājuma statusa filtrs',
  'filter.all': 'Visi',
  'filter.active': 'Aktīvie',
  'filter.finished': 'Pabeigtie',
  'status.upcoming': 'Gaidāms',
  'status.active': 'Aktīvs',
  'status.finished': 'Pabeigts',
  'challenges.shown': 'Parādīti {shown} no {total}',
  'challenges.count.one': '{n} izaicinājums',
  'challenges.count.other': '{n} izaicinājumi',
  'challenges.noMatch': 'Neviens izaicinājums neatbilst meklējumam.',
  'challenges.clearFilters': 'Notīrīt filtrus',
  'challenges.none': 'Vēl nav izaicinājumu — nāc vēlāk!',
  'challenges.progressMissing': 'Progress: —',
  'challenges.progressAria': '{title} progress',

  'target.label': 'Mērķis: {n} {unit}',
  'target.points': 'punkti',
  'target.games': 'spēles',

  'profile.guard': 'Pieraksties ar Telegram, lai redzētu savu profilu un statistiku.',
  'profile.loading': 'Ielādē tavu profilu…',
  'profile.error': 'Neizdevās ielādēt tavu profilu.',
  'profile.none': 'Vēl nav spēlētāja profila. Atver Spēles ekrānu un piekrīti datu apstrādei, lai to izveidotu.',
  'profile.role': 'admins',
  'profile.best': 'Labākais rezultāts',
  'profile.totalGames': 'Kopā spēļu',
  'profile.totalScore': 'Kopā punktu',
  'profile.inGameName': 'Vārds spēlē',
  'profile.chars': '{min}–{max} zīmes',
  'profile.save': 'Saglabāt',
  'profile.nameSaved': 'Saglabāts — reitingā tagad rādīs šo vārdu.',
  'profile.nameHint': 'Redzams reitingā tavā Telegram @vietā. 3–20 zīmes: burti, cipari, pasvītra.',
  'profile.nameRule': 'Jābūt {min}–{max} zīmēm: burti, cipari, pasvītra.',
  'profile.appearance': 'Izskats',
  'profile.tabs.skins': 'Ādas',
  'profile.tabs.backgrounds': 'Foni',
  'profile.tabs.grounds': 'Zeme',
  'profile.tabsAria': 'Izskata kategorija',
  'profile.opt.skin': 'Āda',
  'profile.opt.background': 'Fons',
  'profile.opt.ground': 'Zeme',
  'profile.selected': ' (izvēlēts)',
  'profile.prefError': 'Saglabāts tikai šajā ierīcē — {message}',
  'profile.appearanceHint': 'Spēle un Sākums izmanto to uzreiz; izvēle tiek saglabāta arī profilā citām ierīcēm.',
  'profile.avatar': '{name} profila bilde',
  'profile.player': 'Spēlētājs',
  'sign.inProgress': 'Pierakstās…',
  'sign.signedIn': 'Pierakstīts: loma={role} id={id} vārds={name}',
  'sign.failed': 'Neizdevās: {message}',
  'sign.emulatorHint': '— vai darbojas lokālie emulatori? Palaid tos ar "npx firebase-tools emulators:start --only auth,firestore,functions --project birdenergy-f1405" vai atver lietotni caur @{bot}.',
  // --- admin panel (challenge form + list) ---
  'admin.newTitle': 'Jauns izaicinājums',
  'admin.editTitle': 'Rediģēt izaicinājumu',
  'admin.updated': 'Atjaunināts “{title}”.',
  'admin.created': 'Izveidots “{title}”.',
  'admin.existing': 'Esošie izaicinājumi',
  'admin.edit': 'Rediģēt',
  'admin.editAria': 'Rediģēt {title}',
  'admin.delete': 'Dzēst',
  'admin.deleteAria': 'Dzēst {title}',
  'admin.deleted': 'Dzēsts “{title}”.',
  'admin.confirmTitle': 'Dzēst šo izaicinājumu?',
  'admin.confirmMessage': '“{title}” tiks noņemts visiem spēlētājiem, un to nevarēs atgriezt. Jau iegūtais progress paliek spēlētāju rezultātos.',
  'admin.confirmDelete': 'Dzēst',
  'admin.deleting': 'Dzēš…',
  'admin.empty': 'Vēl nav neviena izaicinājuma — augšējā formā izveido pirmo.',
  'admin.deleteNote': 'Dzēšana ir neatgriezeniska visiem spēlētājiem, tāpēc vienmēr vispirms prasa apstiprinājumu.',

  // --- challenge form labels ---
  'form.title': 'Nosaukums',
  'form.description': 'Apraksts',
  'form.type': 'Veids',
  'form.target': 'Mērķis',
  'form.startDate': 'Sākuma datums',
  'form.endDate': 'Beigu datums',
  'form.range': '{min}–{max} rakstzīmes',
  'form.typePlaceholder': 'Izvēlieties veidu…',
  'form.typeScore': 'Labākais rezultāts vienā spēlē',
  'form.typeGames': 'Aizvadītās spēles',
  'form.targetPlaceholder': 'piem., 100',
  'form.hintGames': 'Pabeigtas spēles izvēlētajā periodā.',
  'form.hintScore': 'Labākais rezultāts vienas spēles laikā izvēlētajā periodā.',
  'form.hintPickType': 'Vispirms izvēlieties veidu — punkti vai spēles.',
  'form.blocked.one': 'Neviens lauks netika saglabāts — jālabo 1 lauks.',
  'form.blocked.other': 'Neviens lauks netika saglabāts — jālabo {n} lauki.',
  'form.saved': 'Saglabāts.',
  'form.create': 'Izveidot izaicinājumu',
  'form.saveChanges': 'Saglabāt izmaiņas',
  'form.cancel': 'Atcelt',
  'form.rules': 'Nosaukums {titleMin}–{titleMax} rakstzīmes, apraksts {descMin}–{descMax}, vesels skaitlis 1–{targetMax}, beigu datums nav agrāks par sākuma datumu.',

  // --- challenge form validation (keys produced by challengeValidation.ts) ---
  'validate.titleRequired': 'Nosaukums ir obligāts.',
  'validate.descRequired': 'Apraksts ir obligāts.',
  'validate.targetRequired': 'Mērķis ir obligāts.',
  'validate.min': 'Jāizmanto vismaz {min} rakstzīmes (pagaidām {count}).',
  'validate.max': 'Ne vairāk kā {max} rakstzīmes ({count}).',
  'validate.number': 'Ievadiet skaitli.',
  'validate.whole': 'Jāizmanto vesels skaitlis — bez decimāldaļām.',
  'validate.positive': 'Mērķim jābūt lielākam par 0.',
  'validate.maxTarget': 'Mērķis nedrīkst pārsniegt {max}.',
  'validate.type': 'Izvēlieties izaicinājuma veidu.',
  'validate.startRequired': 'Sākuma datums ir obligāts.',
  'validate.startInvalid': 'Ievadiet derīgu sākuma datumu.',
  'validate.endRequired': 'Beigu datums ir obligāts.',
  'validate.endInvalid': 'Ievadiet derīgu beigu datumu.',
  'validate.endOrder': 'Beigu datums nedrīkst būt agrāks par sākuma datumu.',

}
const RU: Strings = {
  'nav.challenges': 'Испытания',
  'nav.home': 'Главная',
  'nav.play': 'Играть',
  'nav.leaderboard': 'Рейтинг',
  'nav.profile': 'Профиль',
  'nav.admin': 'Админ',
  'sign.signIn': 'Войти через Telegram',
  'common.loading': 'Загрузка…',
  'common.retry': 'Повторить',
  'common.saving': 'Сохранение…',
  'placeholder.coming': 'Появится в {card}',

  'error.title': 'Что-то пошло не так',
  'error.text': 'Игра столкнулась с непредвиденной ошибкой и остановилась.',
  'error.reload': 'Перезагрузить',

  'home.hello': 'Привет, {name}!',
  'home.play': '▶ Играть',
  'home.openBot': 'Открыть Telegram-бота',
  'home.devLogin': 'DEV вход: Telegram id {id} через эмулятор Functions',
  'home.settings': 'Настройки',
  'home.music': 'Музыка: {state}',
  'home.sfx': 'Звуковые эффекты: {state}',
  'home.language': 'Язык: {name}',
  'home.info': 'Инфо',
  'state.on': 'Вкл',
  'state.off': 'Выкл',

  'game.guard': 'Для игры нужна сессия Telegram. Войдите на главном экране (в Telegram или через dev вход).',
  'game.checking': 'Проверяем ваш игровой профиль…',
  'game.profileError': 'Не удалось загрузить ваш игровой профиль: {message}',
  'game.beforeYouPlay': 'Перед началом игры',
  'game.consent': 'Можно ли использовать ваши данные Telegram для игры — ваше имя в рейтинге и результаты в профиле?',
  'game.consentFineprint': 'Мы храним ваш Telegram id и имя пользователя только для определения результатов. Публично видно лишь имя, которое вы видите в рейтинге.',
  'game.agree': 'Согласен и играю',
  'game.decline': 'Нет, спасибо',

  'canvas.tapToFlap': 'Нажми, чтобы взлететь',
  'canvas.gameOver': 'Игра окончена',
  'canvas.newBest': 'НОВЫЙ РЕКОРД! ({best})',
  'canvas.best': 'РЕКОРД: {best}',
  'canvas.challengeDone': 'ИСПЫТАНИЕ ВЫПОЛНЕНО!',
  'canvas.playAgain': 'НАЖМИ, ЧТОБЫ СЫГРАТЬ СНОВА',

  'pause.open': 'Пауза',
  'pause.title': 'Пауза',
  'pause.score': 'Счёт {score}',
  'pause.resume': 'Продолжить',
  'pause.playAgain': 'Играть заново',
  'pause.hint': 'Esc тоже продолжает',
  'pause.countdown': 'Старт через {n}',
  'sound.turnOn': 'Включить звук',
  'sound.turnOff': 'Выключить звук',
  'share.button': 'Поделиться результатом',
  'share.copied': 'Ссылка скопирована!',
  'share.failed': 'Не удалось поделиться',
  'share.title': 'Bird Energy',
  'share.text': 'Я набрал {score} очков в Bird Energy. Побей мой рекорд!',
  'queue.pending.one': '1 результат ждёт синхронизации',
  'queue.pending.few': '{n} результата ждут синхронизации',
  'queue.pending.many': '{n} результатов ждут синхронизации',
  'home.haptics': 'Вибрация: {state}',

  'tutorial.title': 'Как играть',
  'tutorial.text': 'Нажимай, чтобы взлетать. Не касайся препятствий.',
  'tutorial.gif': 'Обучающий GIF',

  'leaderboard.period': 'Период рейтинга',
  'leaderboard.daily': 'День',
  'leaderboard.weekly': 'Неделя',
  'leaderboard.all': 'За всё время',
  'leaderboard.guard': 'Войдите через Telegram, чтобы увидеть рейтинг и сохранять результаты.',
  'leaderboard.error': 'Не удалось загрузить рейтинг.',
  'leaderboard.empty': 'За этот период пока нет результатов — установите первый!',
  'leaderboard.yourBest': 'Ваш лучший: {name} — {score}',

  'challenges.guard': 'Войдите через Telegram, чтобы увидеть испытания и свой прогресс.',
  'challenges.error': 'Не удалось загрузить испытания.',
  'challenges.progressUnavailable': 'Прогресс сейчас недоступен — показываем испытания без него.',
  'challenges.search': 'Поиск испытаний…',
  'challenges.searchAria': 'Искать испытания по названию',
  'challenges.clearSearch': 'Очистить поиск',
  'challenges.filterAria': 'Фильтр статуса испытания',
  'filter.all': 'Все',
  'filter.active': 'Активные',
  'filter.finished': 'Завершённые',
  'status.upcoming': 'Предстоящее',
  'status.active': 'Активно',
  'status.finished': 'Завершено',
  'challenges.shown': 'Показано {shown} из {total}',
  'challenges.count.one': '{n} испытание',
  'challenges.count.few': '{n} испытания',
  'challenges.count.many': '{n} испытаний',
  'challenges.noMatch': 'Ни одно испытание не соответствует поиску.',
  'challenges.clearFilters': 'Сбросить фильтры',
  'challenges.none': 'Пока нет испытаний — загляните позже!',
  'challenges.progressMissing': 'Прогресс: —',
  'challenges.progressAria': 'Прогресс: {title}',

  'target.label': 'Цель: {n} {unit}',
  'target.points': 'очки',
  'target.games': 'игр',

  'profile.guard': 'Войдите через Telegram, чтобы увидеть профиль и статистику.',
  'profile.loading': 'Загружаем ваш профиль…',
  'profile.error': 'Не удалось загрузить ваш профиль.',
  'profile.none': 'Игрового профиля пока нет. Откройте экран игры и примите обработку данных, чтобы создать его.',
  'profile.role': 'админ',
  'profile.best': 'Лучший результат',
  'profile.totalGames': 'Всего игр',
  'profile.totalScore': 'Всего очков',
  'profile.inGameName': 'Имя в игре',
  'profile.chars': '{min}–{max} симв.',
  'profile.save': 'Сохранить',
  'profile.nameSaved': 'Сохранено — теперь в рейтинге будет это имя.',
  'profile.nameHint': 'Показывается в рейтинге вместо вашего Telegram @username. 3–20 символов: буквы, цифры, подчёркивание.',
  'profile.nameRule': 'Должно быть {min}–{max} символов: буквы, цифры, подчёркивание.',
  'profile.appearance': 'Внешний вид',
  'profile.tabs.skins': 'Скины',
  'profile.tabs.backgrounds': 'Фоны',
  'profile.tabs.grounds': 'Земля',
  'profile.tabsAria': 'Категория внешнего вида',
  'profile.opt.skin': 'Скин',
  'profile.opt.background': 'Фон',
  'profile.opt.ground': 'Земля',
  'profile.selected': ' (выбрано)',
  'profile.prefError': 'Сохранено только на этом устройстве — {message}',
  'profile.appearanceHint': 'Игра и главный экран используют это сразу; выбор также сохраняется в профиле для других устройств.',
  'profile.avatar': 'Аватар {name}',
  'profile.player': 'Игрок',
  'sign.inProgress': 'Входим…',
  'sign.signedIn': 'Вход выполнен: роль={role} id={id} имя={name}',
  'sign.failed': 'Ошибка: {message}',
  'sign.emulatorHint': '— запущены ли локальные эмуляторы? Запустите их командой "npx firebase-tools emulators:start --only auth,firestore,functions --project birdenergy-f1405" или откройте приложение через @{bot}.',

  // --- challenges list ---
  'challenges.count.other': '{n} испытаний',

  // --- admin panel (challenge form + list) ---
  'admin.newTitle': 'Новое испытание',
  'admin.editTitle': 'Редактировать испытание',
  'admin.updated': 'Обновлено «{title}».',
  'admin.created': 'Создано «{title}».',
  'admin.existing': 'Существующие испытания',
  'admin.edit': 'Редактировать',
  'admin.editAria': 'Редактировать {title}',
  'admin.delete': 'Удалить',
  'admin.deleteAria': 'Удалить {title}',
  'admin.deleted': 'Удалено «{title}».',
  'admin.confirmTitle': 'Удалить это испытание?',
  'admin.confirmMessage': '«{title}» будет удалено для всех игроков без возможности восстановления. Уже полученный прогресс останется в результатах игроков.',
  'admin.confirmDelete': 'Удалить',
  'admin.deleting': 'Удаление…',
  'admin.empty': 'Испытаний пока нет — форма выше создаёт первое.',
  'admin.deleteNote': 'Удаление необратимо для всех игроков, поэтому всегда требует подтверждения.',

  // --- challenge form labels ---
  'form.title': 'Название',
  'form.description': 'Описание',
  'form.type': 'Тип',
  'form.target': 'Цель',
  'form.startDate': 'Дата начала',
  'form.endDate': 'Дата окончания',
  'form.range': '{min}–{max} знаков',
  'form.typePlaceholder': 'Выберите тип…',
  'form.typeScore': 'Лучший счёт за одну игру',
  'form.typeGames': 'Сыгранные игры',
  'form.targetPlaceholder': 'например 100',
  'form.hintGames': 'Сыгранные игры в пределах периода.',
  'form.hintScore': 'Лучший результат одной игры в пределах периода.',
  'form.hintPickType': 'Сначала выберите тип — очки или игры.',
  'form.blocked.one': 'Ничего не сохранено — нужно исправить 1 поле.',
  'form.blocked.other': 'Ничего не сохранено — нужно исправить {n} полей.',
  'form.saved': 'Сохранено.',
  'form.create': 'Создать испытание',
  'form.saveChanges': 'Сохранить изменения',
  'form.cancel': 'Отмена',
  'form.rules': 'Название {titleMin}–{titleMax}, описание {descMin}–{descMax}, цель целым числом 1–{targetMax}, дата окончания не раньше даты начала.',

  // --- challenge validation messages ---
  'validate.titleRequired': 'Введите название.',
  'validate.descRequired': 'Введите описание.',
  'validate.targetRequired': 'Введите цель.',
  'validate.min': 'Не менее {min} знаков (сейчас {count}).',
  'validate.max': 'Не более {max} знаков ({count}).',
  'validate.number': 'Введите число.',
  'validate.whole': 'Введите целое число — без десятичных.',
  'validate.positive': 'Цель должна быть больше 0.',
  'validate.maxTarget': 'Цель не более {max}.',
  'validate.type': 'Выберите тип испытания.',
  'validate.startRequired': 'Выберите дату начала.',
  'validate.startInvalid': 'Введите корректную дату начала.',
  'validate.endRequired': 'Выберите дату окончания.',
  'validate.endInvalid': 'Введите корректную дату окончания.',
  'validate.endOrder': 'Дата окончания не может быть раньше даты начала.',
}
const DICT: Record<Locale, Strings> = {en: EN, lv: LV, ru: RU}

const STORAGE_KEY = 'birdenergy.locale'

const listeners = new Set<() => void>()

function readStored(): Locale | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'en' || raw === 'lv' || raw === 'ru' ? raw : null
  } catch {
    return null
  }
}

let locale: Locale = readStored() ?? 'en'

export function getLocale(): Locale {
  return locale
}

export function setLocale(next: Locale): void {
  if (next === locale) return
  locale = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch (_e) {
    void _e
  }
  for (const listener of listeners) listener()
}

// subscribe is used indirectly via useSyncExternalStore
  function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function applyTelegramLanguage(languageCode: string | null): void {
  if (!languageCode) return
  const pick = LOCALES.includes(languageCode as Locale) ? (languageCode as Locale) : 'en'
  if (pick !== locale) setLocale(pick)
}

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICT[locale]
  const template = dict?.[key]
  if (typeof template !== 'string') return key
  return Object.entries(params ?? {}).reduce(
    (str, [k, v]) => str.replace(new RegExp('{' + k + '}', 'g'), String(v)),
    template,
  )
}

export function tn(base: string, n: number, params?: Record<string, string | number>): string {
  const form =
    locale === 'ru'
      ? (n === 1 ? 'one' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 > 14) ? 'few' : 'many')
      : n === 1
        ? 'one'
        : 'other'
  return t(base + '.' + form, {...params, n})
}

export function useT(): {t: typeof t; tn: typeof tn; locale: Locale} {
  const active = useSyncExternalStore(subscribe, getLocale)
  return {t, tn, locale: active}
}

