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
import { useEffect, useRef, useState } from 'react'
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
import {
  cosmeticIdAt,
  cosmeticPrice,
  ownsCosmeticIndex,
  type CosmeticKind,
} from './economy'
import { purchaseCosmetic } from './cosmetics'
import { ConfirmDialog } from './ConfirmDialog'
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
import { PixelIcon } from './ui/PixelIcon'

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
  const { t, tn } = useT()
  // The profile/error + the uid it was loaded for. `loading` is derived:
  // anything the current uid hasn't loaded yet shows the loading state (this
  // also covers sign-out → sign-in back to the same account).
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadedUid, setLoadedUid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // In-game name editor state. The field is read-only until Edit is pressed —
  // tapping Edit turns the SAME field editable and the button into Save, with
  // no dialog and no section opening (UI-04 rev).
  const [nameDraft, setNameDraft] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Appearance picker (UI-04 rev): one shared index per kind, live in
  // localStorage; the three tabs switch which grid is shown below them.
  const [skinIndex] = useBirdSkinIndex()
  const [backgroundIndex] = useBackgroundIndex(backgrounds.length)
  const [groundIndex] = useGroundIndex()
  const [appearanceTab, setAppearanceTab] = useState<AppearanceTab>('skin')
  const [prefError, setPrefError] = useState<string | null>(null)
  // The one collapsible section on this screen: the wardrobe pickers stay
  // closed until the player asks for them.
  const [showAppearance, setShowAppearance] = useState(false)

  // SHOP-01 — the purchase dialog. The server is the only source of prices,
  // balance and ownership; this state just drives the confirmation UI.
  const [purchaseTarget, setPurchaseTarget] = useState<{
    kind: CosmeticKind
    index: number
    itemId: string
    price: number
  } | null>(null)
  const [purchaseBusy, setPurchaseBusy] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [wardrobeNote, setWardrobeNote] = useState<{
    tone: 'ok' | 'error'
    text: string
  } | null>(null)
  /** Synchronous guard: a double click cannot start two purchase requests. */
  const purchaseInFlight = useRef(false)

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

  // ECON-01 balance on the profile doc; absent on a legacy profile = 0.
  const balance =
    typeof profile.coins === 'number' && Number.isFinite(profile.coins)
      ? profile.coins
      : 0

  /** Catalog id, server price and lock state for one tile (grounds are free). */
  const tileInfo = (kind: AppearanceTab, index: number) => {
    if (kind === 'ground') return { itemId: null, price: 0, locked: false }
    const itemId = cosmeticIdAt(kind, index)
    return {
      itemId,
      price: cosmeticPrice(kind, itemId) ?? 0,
      locked: !ownsCosmeticIndex(profile, kind, index),
    }
  }

  /**
   * Taps an OWNED tile: applies the shared index locally, then mirrors it.
   * Locked tiles never reach here (they open the purchase dialog instead), and
   * the guard keeps that true even if a disabled state is bypassed.
   */
  const selectPref = (kind: AppearanceTab, i: number) => {
    const option = appearanceOptions[kind]
    if (i === option.index) return // already selected — nothing to save
    if (kind !== 'ground' && !ownsCosmeticIndex(profile, kind, i)) return
    option.apply(i)
    setWardrobeNote(null)
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

  /** Locked tile tap → confirmation, or an immediate insufficient-coin note. */
  const openPurchase = (kind: CosmeticKind, index: number) => {
    const itemId = cosmeticIdAt(kind, index)
    const price = cosmeticPrice(kind, itemId)
    if (itemId === null || price === null) return
    setPrefError(null)
    setWardrobeNote(null)
    setPurchaseError(null)
    if (balance < price) {
      setWardrobeNote({
        tone: 'error',
        text: t('profile.insufficient', { price, balance }),
      })
      return
    }
    setPurchaseTarget({ kind, index, itemId, price })
  }

  const confirmPurchase = async () => {
    if (!purchaseTarget || purchaseInFlight.current) return
    const target = purchaseTarget
    purchaseInFlight.current = true
    setPurchaseBusy(true)
    setPurchaseError(null)
    try {
      const result = await purchaseCosmetic(target.kind, target.itemId)
      setProfile((current) =>
        current
          ? {
              ...current,
              coins: result.coins,
              ownedSkinIds: result.ownedSkinIds,
              ownedBackgroundIds: result.ownedBackgroundIds,
            }
          : current,
      )
      setPurchaseTarget(null)
      setWardrobeNote({
        tone: 'ok',
        text: t(result.alreadyOwned ? 'profile.alreadyOwned' : 'profile.purchased'),
      })
    } catch (err) {
      // Keep the dialog open: the server's reason is the useful next step.
      setPurchaseError(err instanceof Error ? err.message : String(err))
    } finally {
      purchaseInFlight.current = false
      setPurchaseBusy(false)
    }
  }

  const purchaseName = purchaseTarget
    ? `${t(
        purchaseTarget.kind === 'skin'
          ? 'profile.opt.skin'
          : 'profile.opt.background',
      )} ${purchaseTarget.index + 1}`
    : ''

  const nameRule = t('profile.nameRule', {
    min: IN_GAME_NAME_MIN,
    max: IN_GAME_NAME_MAX,
  })
  const nameValid = isValidInGameName(nameDraft)
  const nameChanged = nameDraft.trim() !== (profile.inGameName ?? '')

  /** Edit → the same field becomes editable, focused, and the button is Save. */
  const startEditingName = () => {
    setNameError(null)
    setNameSaved(false)
    setEditingName(true)
    // Focus after the readOnly flip lands, so mobile keyboards open at once.
    requestAnimationFrame(() => nameInputRef.current?.focus())
  }

  const saveName = async () => {
    const candidate = nameDraft.trim()
    setNameSaved(false)
    setNameError(null)
    // Nothing changed → just close edit mode.
    if (candidate === (profile.inGameName ?? '')) {
      setEditingName(false)
      return
    }
    // Validation lives in one place (shared with the server's rules); the
    // button is disabled while the draft is invalid, so this is the belt to
    // that brace.
    if (!isValidInGameName(candidate)) {
      setNameError(nameRule)
      return
    }
    setNameBusy(true)
    try {
      const result = await updateProfile({ username: candidate })
      setProfile((p) => (p ? { ...p, inGameName: result.inGameName } : p))
      setNameDraft(result.inGameName)
      setNameSaved(true)
      setEditingName(false)
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
              ref={nameInputRef}
              id="in-game-name"
              className={`profile-name-input${
                editingName ? ' profile-name-input-editing' : ''
              }`}
              type="text"
              value={nameDraft}
              maxLength={IN_GAME_NAME_MAX}
              readOnly={!editingName}
              aria-readonly={!editingName}
              onChange={(e) => {
                setNameDraft(e.target.value)
                setNameSaved(false)
                setNameError(null)
              }}
              onKeyDown={(e) => {
                // Escape leaves edit mode without saving; the value rolls back.
                if (e.key === 'Escape' && editingName) {
                  setNameDraft(profile.inGameName ?? '')
                  setNameError(null)
                  setEditingName(false)
                }
              }}
              placeholder={t('profile.chars', {
                min: IN_GAME_NAME_MIN,
                max: IN_GAME_NAME_MAX,
              })}
              autoComplete="off"
              spellCheck={false}
            />
            {editingName ? (
              <button
                key="save-name"
                type="submit"
                className="btn btn-small profile-name-action"
                disabled={nameBusy || (nameChanged && !nameValid)}
              >
                <PixelIcon name="check" size={20} />
                {nameBusy ? t('common.saving') : t('profile.save')}
              </button>
            ) : (
              <button
                key="edit-name"
                type="button"
                className="btn btn-small profile-name-action"
                onClick={startEditingName}
              >
                <PixelIcon name="settings" size={20} />
                {t('profile.edit')}
              </button>
            )}
          </div>
          {/* Live rule check while typing: an invalid draft says why before the
              player presses Save (the button is disabled meanwhile). */}
          {editingName && nameDraft.length > 0 && !nameValid && (
            <p className="profile-name-error" role="alert">
              {nameRule}
            </p>
          )}
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

        {/* Last-used look, right under the scores: the three picks in the
            order they are chosen, then the way into the wardrobe. */}
        <div className="profile-look">
          <div className="profile-look-thumbs">
            <span
              className="look-thumb look-thumb-skin"
              style={{ backgroundImage: `url(${birdSkinUrls[skinIndex]})` }}
              title={t('profile.opt.skin')}
              aria-label={t('profile.opt.skin')}
              role="img"
            />
            <span
              className="look-thumb look-thumb-background"
              style={{ backgroundImage: `url(${backgrounds[backgroundIndex]})` }}
              title={t('profile.opt.background')}
              aria-label={t('profile.opt.background')}
              role="img"
            />
            <span
              className="look-thumb look-thumb-ground"
              style={{ backgroundImage: `url(${groundUrls[groundIndex]})` }}
              title={t('profile.opt.ground')}
              aria-label={t('profile.opt.ground')}
              role="img"
            />
          </div>
          <button
            type="button"
            className="btn btn-small profile-wardrobe"
            aria-expanded={showAppearance}
            aria-controls="profile-appearance"
            onClick={() => setShowAppearance((open) => !open)}
          >
            {t('profile.wardrobe')}
            <PixelIcon name="hanger" size={20} pressed={showAppearance} />
          </button>
        </div>
      </div>


      {/* The one collapsible section: closed until the wardrobe button (or the
          chevron in this header) asks for it. */}
      {showAppearance && (
      <section className="profile-appearance" id="profile-appearance">
        {/* No second collapse control here: the wardrobe button above already
            shows the section's state and closes it. */}
        <div className="appearance-top">
          <p className="profile-name-label">{t('profile.appearance')}</p>
          <span className="appearance-balance" aria-live="polite">
            {tn('profile.coins', balance)}
          </span>
        </div>
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
            const info = tileInfo(appearanceTab, i)
            const tabKind = appearanceTab
            const name = `${t(activeOptions.labelKey)} ${i + 1}`
            return (
              <div key={`${tabKind}-${i}`} className="appearance-item">
                <button
                  type="button"
                  className="appearance-tile"
                  aria-label={`${name}${
                    selected
                      ? t('profile.selected')
                      : info.locked
                        ? ` — ${tn('profile.lockedAria', info.price)}`
                        : ''
                  }`}
                  aria-pressed={selected}
                  disabled={purchaseBusy}
                  onClick={() => {
                    if (info.locked) {
                      if (tabKind !== 'ground') openPurchase(tabKind, i)
                      return
                    }
                    selectPref(tabKind, i)
                  }}
                >
                  <span className="appearance-thumb-wrap">
                    <span
                      className="appearance-thumb"
                      style={{ backgroundImage: `url(${url})` }}
                      aria-hidden="true"
                    />
                    {info.locked && (
                      <span className="appearance-lock" aria-hidden="true">
                        <PixelIcon name="locked" size={20} />
                      </span>
                    )}
                  </span>
                </button>
                {info.locked && (
                  <button
                    type="button"
                    className="btn btn-small appearance-buy"
                    disabled={purchaseBusy}
                    aria-label={tn('profile.buyAria', info.price, { item: name })}
                    onClick={() => {
                      if (tabKind !== 'ground') openPurchase(tabKind, i)
                    }}
                  >
                    {t('profile.buy')}
                    <span className="appearance-buy-price">{info.price}</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {wardrobeNote && (
          <p
            className={
              wardrobeNote.tone === 'error'
                ? 'profile-name-error'
                : 'profile-name-saved'
            }
            role={wardrobeNote.tone === 'error' ? 'alert' : 'status'}
          >
            {wardrobeNote.text}
          </p>
        )}
        {prefError && (
          <p className="profile-name-error" role="alert">
            {t('profile.prefError', { message: prefError })}
          </p>
        )}
      </section>
      )}

      {/* SHOP-01 — the purchase confirmation shares the ADM-02 dialog, with a
          gold confirm button and the server's failure reason kept inside it. */}
      {purchaseTarget && (
        <ConfirmDialog
          title={t('profile.buyTitle')}
          message={tn('profile.buyMessage', purchaseTarget.price, {
            item: purchaseName,
            balance: Math.max(0, balance - purchaseTarget.price),
          })}
          confirmLabel={t('profile.buy')}
          busyLabel={t('profile.buying')}
          busy={purchaseBusy}
          error={purchaseError}
          confirmIcon="unlocked"
          confirmTone="primary"
          cancelLabel={t('common.cancel')}
          onConfirm={() => void confirmPurchase()}
          onCancel={() => {
            if (purchaseBusy) return
            setPurchaseTarget(null)
            setPurchaseError(null)
          }}
        />
      )}
    </div>
  )
}
