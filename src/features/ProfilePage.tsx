// UI-04 — Profile screen: Telegram identity (photo + name fallbacks), role,
// and the score aggregates from the users/{uid} doc — plus the in-game
// username editor and the appearance switchers (bird skin, sky background,
// ground strip) moved over from Home.
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
import { useBirdSkinIndex } from './birdSkin'
import { useGroundIndex } from './groundTile'
import { useBackgroundIndex } from './homeBackground'
import { backgrounds, groundUrls } from '../sprites'
import { PlaceholderPage } from './PlaceholderPage'

/** First frame of the default bird sheet — the avatar fallback (16x16 crop). */
const birdAvatarUrl = birdSkinUrls[0]

/** Display name: in-game name → @username → first name → "Player". */
function profileDisplayName(profile: UserProfile): string {
  const inGame = profile.inGameName?.trim()
  if (inGame) return inGame
  const username = profile.username?.trim()
  if (username) return `@${username}`
  const first = profile.firstName?.trim()
  if (first) return first
  return 'Player'
}

export function ProfilePage({
  signedInUid,
  onSignIn,
}: {
  signedInUid: string | null
  onSignIn: () => void
}) {
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

  // Appearance switchers (UI-04): shared localStorage index + a best-effort
  // mirror into users/{uid} (a failed save keeps the local choice working).
  const [skinIndex, cycleSkin] = useBirdSkinIndex()
  const [backgroundIndex, cycleBackground] = useBackgroundIndex(
    backgrounds.length,
  )
  const [groundIndex, cycleGround] = useGroundIndex()
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
            Sign in with Telegram to see your profile and stats.
          </p>
          <button type="button" className="btn" onClick={onSignIn}>
            Sign in with Telegram
          </button>
        </div>
      </PlaceholderPage>
    )
  }

  if (signedInUid !== loadedUid) {
    return (
      <PlaceholderPage card="UI-04">
        <p className="guard-text">Loading your profile…</p>
      </PlaceholderPage>
    )
  }

  if (error) {
    return (
      <PlaceholderPage card="UI-04">
        <div className="guard">
          <p className="guard-text">Could not load your profile.</p>
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
            No player profile yet. Open the Game screen and accept data
            processing to create it.
          </p>
        </div>
      </PlaceholderPage>
    )
  }

  const displayName = profileDisplayName(profile)
  const nameTouched = nameDraft.trim() !== (profile.inGameName ?? '')

  /** Cycles one switcher locally, then mirrors it into users/{uid}. */
  const changePref = (
    cycle: () => void,
    field: 'preferredBird' | 'preferredBackground' | 'preferredGround',
    next: number,
  ) => {
    cycle()
    setPrefError(null)
    const patch: UpdateProfileInput = { [field]: next }
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
        `Must be ${IN_GAME_NAME_MIN}–${IN_GAME_NAME_MAX} characters: letters, digits, underscore.`,
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
              alt={`${displayName} avatar`}
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
              <span className="profile-role">admin</span>
            )}
          </div>
        </div>

        <ul className="profile-stats">
          <li className="lrow">
            <span className="lrow-name">Best score</span>
            <span className="lrow-score">{profile.bestScore ?? 0}</span>
          </li>
          <li className="lrow">
            <span className="lrow-name">Total games</span>
            <span className="lrow-score">{profile.totalGames ?? 0}</span>
          </li>
          <li className="lrow">
            <span className="lrow-name">Total score</span>
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
          In-game name
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
            placeholder={`${IN_GAME_NAME_MIN}–${IN_GAME_NAME_MAX} chars`}
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
            {nameBusy ? 'Saving…' : 'Save'}
          </button>
        </div>
        {nameError && (
          <p className="profile-name-error" role="alert">
            {nameError}
          </p>
        )}
        {nameSaved && (
          <p className="profile-name-saved" role="status">
            Saved — the leaderboard now shows this name.
          </p>
        )}
        <p className="placeholder-note">
          Shown on the leaderboard instead of your Telegram @username. 3–20
          characters: letters, digits, underscore.
        </p>
      </form>

      <section className="profile-appearance">
        <p className="profile-name-label">Appearance</p>
        <div className="profile-choices">
          <button
            type="button"
            className="btn btn-small profile-choice"
            onClick={() =>
              changePref(
                cycleSkin,
                'preferredBird',
                (skinIndex + 1) % birdSkinUrls.length,
              )
            }
            aria-label={`Change bird skin (${skinIndex + 1} of ${birdSkinUrls.length})`}
          >
            <img
              className="profile-choice-thumb"
              src={birdSkinUrls[skinIndex]}
              alt=""
              aria-hidden="true"
            />
            Skin {skinIndex + 1}/{birdSkinUrls.length}
          </button>

          <button
            type="button"
            className="btn btn-small profile-choice"
            onClick={() =>
              changePref(
                cycleBackground,
                'preferredBackground',
                (backgroundIndex + 1) % backgrounds.length,
              )
            }
            aria-label={`Change background (${backgroundIndex + 1} of ${backgrounds.length})`}
          >
            <img
              className="profile-choice-thumb"
              src={backgrounds[backgroundIndex]}
              alt=""
              aria-hidden="true"
            />
            Background {backgroundIndex + 1}/{backgrounds.length}
          </button>

          <button
            type="button"
            className="btn btn-small profile-choice"
            onClick={() =>
              changePref(
                cycleGround,
                'preferredGround',
                (groundIndex + 1) % groundUrls.length,
              )
            }
            aria-label={`Change ground (${groundIndex + 1} of ${groundUrls.length})`}
          >
            <img
              className="profile-choice-thumb"
              src={groundUrls[groundIndex]}
              alt=""
              aria-hidden="true"
            />
            Ground {groundIndex + 1}/{groundUrls.length}
          </button>
        </div>
        {prefError && (
          <p className="profile-name-error" role="alert">
            Saved on this device only — {prefError}
          </p>
        )}
        <p className="placeholder-note">
          The game and Home use these right away; your choice is also saved to
          your profile for other devices.
        </p>
      </section>
    </div>
  )
}
