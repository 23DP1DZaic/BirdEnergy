// UI-04 — Profile screen: Telegram identity (photo + name fallbacks), role,
// and the score aggregates from the users/{uid} doc — plus the in-game
// username editor and the appearance picker (three tabs — Skins, Backgrounds,
// Grounds — each showing a grid of options you tap to pick; moved over from
// Home).
//
// Name fallback chain (same as the server's leaderboardName): in-game name →
// @username → first name → "Player" (the DoD's "korekts fallback"). The
// avatar is the Telegram photo (signed initData photo_url) or, when Telegram
// gives none, the in-app bird sprite — no custom upload exists.
//
// Appearance: the live index lives in localStorage (shared with Home/the game
// canvas via window events) and is mirrored into the profile document through
// the updateProfile callable (Firestore rules keep users/ write=server-only,
// SEC-01), so the choice follows the player to another device.
//
// Guest → sign-in prompt (same pattern as Game/Leaderboard). The no-profile
// case points at the Game screen, where the consent dialog lives. Load state
// is derived (uid vs loadedUid) so the effect only sets state in async
// callbacks — no cascading synchronous renders.
import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import {
  IN_GAME_NAME_MAX,
  IN_GAME_NAME_MIN,
  isValidInGameName,
  updateProfile,
  type UpdateProfileInput,
  type UserProfile,
} from './userProfile'
import { birdSkinUrls } from './game/sprites'
import { applyStoredBirdSkinIndex, useBirdSkinIndex } from './birdSkin'
import { applyStoredGroundIndex, useGroundIndex } from './groundTile'
import {
  applyStoredBackgroundIndex,
  useBackgroundIndex,
} from './homeBackground'
import { backgrounds, groundUrls } from '../sprites'
import { useT, type t as TFn } from '../i18n'
import { PlaceholderPage } from './PlaceholderPage'

/** First frame of the default bird sheet — the avatar fallback (16x16 crop). */
const birdAvatarUrl = birdSkinUrls[0]

/** The Profile appearance pickers — each tab shows one grid of options. */
type AppearanceTab = 'skin' | 'background' | 'ground'

const APPEARANCE_TABS: { kind: AppearanceTab; labelKey: string }[] = [
  { kind: 'skin', labelKey: 'profile.tabs.skins' },
  { kind: 'background', labelKey: 'profile.tabs.backgrounds' },
  { kind: 'ground', labelKey: 'profile.tabs.grounds' },
]

/**
 * Display name: in-game name → @username → first name → "Player".
 * `t` comes from the caller so the fallback follows the active language.
 */
function profileDisplayName(profile: UserProfile, t: typeof TFn): string {
  const inGame = profile.inGameName?.trim()
  if (inGame) return inGame
  const username = profile.username?.trim()
  if (username) return `@${username}`
  const first = profile.firstName?.trim()
  if (first) return first
  return t('profile.player')
}

export function ProfilePage({
  signedInUid,
  onSignIn,
}: {
  signedInUid: string | null
  onSignIn: () => void
}) {
  const { t } = useT()
  // The profile/error + the uid it was loaded for. `loading` is derived:
  // anything the current uid hasn't loaded yet shows the loading state (this
  // also covers sign-out → sign-in back to the same account).
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadedUid, setLoadedUid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // In-game name editor state.
  const [nameDraft, setNameDraft] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)

  // Appearance picker (UI-04 rev): one shared index per kind, live in
  // localStorage; the three tabs switch which grid is shown below them.
  const [skinIndex] = useBirdSkinIndex()
  const [backgroundIndex] = useBackgroundIndex(backgrounds.length)
  const [groundIndex] = useGroundIndex()
  const [appearanceTab, setAppearanceTab] = useState<AppearanceTab>('skin')
  const [prefError, setPrefError] = useState<string | null>(null)

  useEffect(() => {
    if (!signedInUid) return
    let cancelled = false
    getDoc(doc(db, 'users', signedInUid))
      .then((snap) => {
        if (cancelled) return
        const data = snap.exists() ? (snap.data() as UserProfile) : null
        setProfile(data)
        setLoadedUid(signedInUid)
        setError(null)
        setNameDraft(data?.inGameName ?? '')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadedUid(signedInUid)
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [signedInUid])

  if (!signedInUid) {
    return (
      <PlaceholderPage card="UI-04">
        <div className="guard">
          <p className="guard-text">
            {t('profile.guard')}
          </p>
          <button type="button" className="btn" onClick={onSignIn}>
            {t('sign.signIn')}
          </button>
        </div>
      </PlaceholderPage>
    )
  }

  if (signedInUid !== loadedUid) {
    return (
      <PlaceholderPage card="UI-04">
        <p className="guard-text">{t('profile.loading')}</p>
      </PlaceholderPage>
    )
  }

  if (error) {
    return (
      <PlaceholderPage card="UI-04">
        <div className="guard">
          <p className="guard-text">{t('profile.error')}</p>
          <p className="placeholder-note">{error}</p>
        </div>
      </PlaceholderPage>
    )
  }

  if (!profile) {
    // Signed in but no users doc yet — consent (Game screen) creates it.
    return (
      <PlaceholderPage card="UI-04">
        <div className="guard">
          <p className="guard-text">
            {t('profile.none')}
          </p>
        </div>
      </PlaceholderPage>
    )
  }

  const displayName = profileDisplayName(profile, t)
  const nameTouched = nameDraft.trim() !== (profile.inGameName ?? '')

  // The active grid's data: preview urls, the current pick, and the shared
  // setter (applyStored* validates, stores and broadcasts via window event).
  const appearanceOptions: Record<
    AppearanceTab,
    {
      urls: readonly string[]
      index: number
      apply: (n: number) => void
      labelKey: string
    }
  > = {
    skin: {
      urls: birdSkinUrls,
      index: skinIndex,
      apply: applyStoredBirdSkinIndex,
      labelKey: 'profile.opt.skin',
    },
    background: {
      urls: backgrounds,
      index: backgroundIndex,
      apply: applyStoredBackgroundIndex,
      labelKey: 'profile.opt.background',
    },
    ground: {
      urls: groundUrls,
      index: groundIndex,
      apply: applyStoredGroundIndex,
      labelKey: 'profile.opt.ground',
    },
  }
  const activeOptions = appearanceOptions[appearanceTab]

  /** Taps a grid tile: applies the shared index locally, then mirrors it. */
  const selectPref = (kind: AppearanceTab, i: number) => {
    const option = appearanceOptions[kind]
    if (i === option.index) return // already selected — nothing to save
    option.apply(i)
    setPrefError(null)
    const patch: UpdateProfileInput =
      kind === 'skin'
        ? { preferredBird: i }
        : kind === 'background'
          ? { preferredBackground: i }
          : { preferredGround: i }
    updateProfile(patch).catch((err: unknown) => {
      // Keep the local choice — only the cross-device save failed.
      setPrefError(err instanceof Error ? err.message : String(err))
    })
  }

  const saveName = async () => {
    const candidate = nameDraft.trim()
    setNameError(null)
    setNameSaved(false)
    if (!isValidInGameName(candidate)) {
      setNameError(
        t('profile.nameRule', {
          min: IN_GAME_NAME_MIN,
          max: IN_GAME_NAME_MAX,
        }),
      )
      return
    }
    if (candidate === (profile.inGameName ?? '')) return
    setNameBusy(true)
    try {
      const result = await updateProfile({ username: candidate })
      setProfile((p) => (p ? { ...p, inGameName: result.inGameName } : p))
      setNameDraft(result.inGameName)
      setNameSaved(true)
    } catch (err) {
      setNameError(err instanceof Error ? err.message : String(err))
    } finally {
      setNameBusy(false)
    }
  }

  return (
    <div className="profile-screen">
      <div className="profile-card">
        <div className="profile-head">
          {profile.photoUrl ? (
            <img
              className="profile-avatar"
              src={profile.photoUrl}
              alt={t('profile.avatar', { name: displayName })}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span
              className="profile-avatar profile-avatar-fallback"
              aria-hidden="true"
            >
              <img src={birdAvatarUrl} alt="" />
            </span>
          )}
          <div className="profile-id">
            <h2 className="profile-name">{displayName}</h2>
            {profile.username && (
              <p className="profile-username">@{profile.username}</p>
            )}
            {profile.role === 'admin' && (
              <span className="profile-role">{t('profile.role')}</span>
            )}
          </div>
        </div>

        <ul className="profile-stats">
          <li className="lrow">
            <span className="lrow-name">{t('profile.best')}</span>
            <span className="lrow-score">{profile.bestScore ?? 0}</span>
          </li>
          <li className="lrow">
            <span className="lrow-name">{t('profile.totalGames')}</span>
            <span className="lrow-score">{profile.totalGames ?? 0}</span>
          </li>
          <li className="lrow">
            <span className="lrow-name">{t('profile.totalScore')}</span>
            <span className="lrow-score">{profile.totalScore ?? 0}</span>
          </li>
        </ul>
      </div>

      <form
        className="profile-name-editor"
        onSubmit={(e) => {
          e.preventDefault()
          void saveName()
        }}
      >
        <label className="profile-name-label" htmlFor="in-game-name">
          {t('profile.inGameName')}
        </label>
        <div className="profile-name-row">
          <input
            id="in-game-name"
            className="profile-name-input"
            type="text"
            value={nameDraft}
            maxLength={IN_GAME_NAME_MAX}
            onChange={(e) => {
              setNameDraft(e.target.value)
              setNameSaved(false)
              setNameError(null)
            }}
            placeholder={t('profile.chars', {
              min: IN_GAME_NAME_MIN,
              max: IN_GAME_NAME_MAX,
            })}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="btn btn-small"
            disabled={
              nameBusy ||
              !nameTouched ||
              nameDraft.trim() === (profile.inGameName ?? '')
            }
          >
            {nameBusy ? t('common.saving') : t('profile.save')}
          </button>
        </div>
        {nameError && (
          <p className="profile-name-error" role="alert">
            {nameError}
          </p>
        )}
        {nameSaved && (
          <p className="profile-name-saved" role="status">
            {t('profile.nameSaved')}
          </p>
        )}
        <p className="placeholder-note">
          {t('profile.nameHint')}
        </p>
      </form>

      <section className="profile-appearance">
        <p className="profile-name-label">{t('profile.appearance')}</p>
        <div
          className="appearance-tabs"
          role="tablist"
          aria-label={t('profile.tabsAria')}
        >
          {APPEARANCE_TABS.map((tab) => (
            <button
              key={tab.kind}
              type="button"
              role="tab"
              className={`btn btn-small appearance-tab${
                appearanceTab === tab.kind ? ' btn-active' : ''
              }`}
              aria-selected={appearanceTab === tab.kind}
              onClick={() => setAppearanceTab(tab.kind)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <div
          className={`appearance-grid appearance-grid-${appearanceTab}s`}
          role="tabpanel"
          aria-label={t(activeOptions.labelKey)}
        >
          {activeOptions.urls.map((url, i) => {
            const selected = activeOptions.index === i
            return (
              <button
                key={`${appearanceTab}-${i}`}
                type="button"
                className="appearance-tile"
                aria-label={`${t(activeOptions.labelKey)} ${i + 1}${
                  selected ? t('profile.selected') : ''
                }`}
                aria-pressed={selected}
                onClick={() => selectPref(appearanceTab, i)}
              >
                <span
                  className="appearance-thumb"
                  style={{ backgroundImage: `url(${url})` }}
                  aria-hidden="true"
                />
              </button>
            )
          })}
        </div>
        {prefError && (
          <p className="profile-name-error" role="alert">
            {t('profile.prefError', { message: prefError })}
          </p>
        )}
        <p className="placeholder-note">
          {t('profile.appearanceHint')}
        </p>
      </section>
    </div>
  )
}
