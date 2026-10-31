import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { birthdayConfig } from './config/birthday';
import { motion as MOTION } from './config/motion';
import { beginScene, endScene, hurryUp, sceneWait } from './lib/pace';
import { giftMark, publishGiftMark } from './lib/giftMark';
import { carrier } from './lib/carrier';
import { LightTextLayer } from './components/ui/LightText';
import { gifts } from './data/gifts';
import type { FinalePhase, Stage, Veil } from './types';
import type { DustMode, DustPhase } from './components/3d/TransitionDust';
import { loadProgress, saveProgress, clearProgress } from './lib/storage';
import { hasWebGL, initialTier, type Tier } from './lib/quality';
import { sound } from './lib/audio';
import { resetReady, waitReady } from './lib/ready';
import { assetUrl } from './lib/text';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useViewport } from './hooks/useViewport';
import { IntroOverlay } from './components/experience/IntroOverlay';
import { PasswordGate } from './components/experience/PasswordGate';
import { Welcome } from './components/experience/Welcome';
import { RoomUI } from './components/experience/RoomUI';
import { FallbackScene } from './components/experience/FallbackScene';
import { MusicToggle } from './components/ui/MusicToggle';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { CursorLayer } from './components/ui/CursorLayer';
import { story } from './lib/story';

/**
 * Heavy pieces load only when needed. If the site was redeployed while the page
 * was open, old chunk files are gone — reload once (progress is saved) instead of breaking.
 */
function lazyOrReload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((err) => {
      try {
        if (!sessionStorage.getItem('chunk-reload')) {
          sessionStorage.setItem('chunk-reload', '1');
          location.reload();
          return new Promise<never>(() => {});
        }
      } catch {
        /* storage unavailable — fall through */
      }
      throw err;
    }),
  );
}
const Scene3D = lazyOrReload(() => import('./components/3d/Scene3D'));
const MemoryView = lazyOrReload(() => import('./components/experience/MemoryView'));
const LoveLetter = lazyOrReload(() => import('./components/experience/LoveLetter'));
const FinalReveal = lazyOrReload(() => import('./components/experience/FinalReveal'));

const TAPS_NEEDED = 3;
/** The heart of light starts as scattered light; the first touch gathers it. */
const lightHeart = birthdayConfig.heart.style === 'particles';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * The colour the star dust of a change of world carries — the light of the world she is
 * going to, so the next room is already glowing inside the dust before she gets there.
 */
const DUST = { room: '#f2cdb0', final: '#f7dcc6' };

export default function App() {
  const saved = useMemo(loadProgress, []);
  const reducedMotion = useReducedMotion();
  const { portrait } = useViewport();
  // the stylesheet's calmer animations apply only when the site honours the setting
  useEffect(() => {
    document.documentElement.toggleAttribute('data-reduce', reducedMotion);
  }, [reducedMotion]);

  const [stage, setStage] = useState<Stage>(saved.unlocked ? 'room' : 'intro');
  // coming back later: the room opens out of its orb, as it does on the way in
  const [veil, setVeil] = useState<Veil>(saved.unlocked ? 'iris' : 'none');
  /** The world on screen is diving into its hero light (see `transition`). */
  const [leaving, setLeaving] = useState(false);
  /** The night beyond the room's window, under the finale's first frames (storyboard D3.3). */
  const [night, setNight] = useState(false);
  /** The star dust a change of world travels through — see `TransitionDust`. */
  const [dust, setDust] = useState<{ phase: DustPhase; color: string; mode: DustMode }>({ phase: 'none', color: DUST.room, mode: 'dust' });
  /**
   * Who draws the dark over a change of world. In the 3D scene it is drawn inside the world,
   * under the star dust (so the dust is what she watches). The CSS layer is kept for the
   * two cases the canvas cannot cover: no WebGL at all, and the first moment of a reload
   * that resumes in the room, before the canvas has drawn anything.
   */
  const [domCover, setDomCover] = useState(saved.unlocked);
  const [taps, setTaps] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);
  const [opened, setOpened] = useState<string[]>(saved.opened.filter((id) => gifts.some((g) => g.id === id)));
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [finalePhase, setFinalePhase] = useState<FinalePhase>('gather');
  const [webgl, setWebgl] = useState(hasWebGL);
  const webglRef = useRef(webgl);
  webglRef.current = webgl;
  const [tier, setTier] = useState<Tier>(initialTier);
  const busy = useRef(false);
  /** The light sprite is still touring the room she was just led into (storyboard D2). */
  const touringRef = useRef(false);

  const allOpened = opened.length >= gifts.length;
  const activeGift = gifts.find((g) => g.id === activeId) ?? null;

  useEffect(() => {
    document.title = birthdayConfig.pageTitle;
    try {
      sessionStorage.removeItem('chunk-reload');
    } catch {
      /* ignore */
    }
  }, []);

  // Coming back later: lift the dark veil over the room once it is ready.
  useEffect(() => {
    if (!saved.unlocked) return;
    let alive = true;
    void Promise.all([wait(300), waitReady('room-ready', 5000)]).then(() => {
      if (!alive) return;
      // hand the cover over to the world: the room opens out of its own star dust
      setDust({ phase: 'open', color: DUST.room, mode: 'dust' });
      setDomCover(false);
      setVeil('none');
      setTimeout(() => alive && setDust({ phase: 'none', color: DUST.room, mode: 'dust' }), 1800);
    });
    return () => {
      alive = false;
    };
  }, [saved.unlocked]);

  // A touch or any key while a scene plays hurries it — smoothly, never a cut (lib/pace.ts)
  useEffect(() => {
    const on = () => void hurryUp();
    window.addEventListener('pointerdown', on);
    window.addEventListener('keydown', on);
    return () => {
      window.removeEventListener('pointerdown', on);
      window.removeEventListener('keydown', on);
    };
  }, []);

  // a hidden moment in the room (cake / sign): the room's edges dim, the UI steps back
  const [moment, setMoment] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setMoment(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener('room-moment', on);
    return () => window.removeEventListener('room-moment', on);
  }, []);

  // First visit: a quiet loading veil while the 3D scene does its one-off setup
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    let alive = true;
    void waitReady('scene-warm', 7000).then(() => alive && setBooted(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const save = () => saveProgress({ unlocked: stage !== 'intro' && stage !== 'gate', opened, finaleSeen: saved.finaleSeen });
    save();
    // refresh the timestamp whenever she steps away, so a long read never counts as "old"
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
    };
  }, [stage, opened, saved.finaleSeen]);

  /**
   * One change of world, always told the same way (like a product that never leaves the
   * frame while the set changes around it): the camera of the world on screen dives into
   * its hero light (the heart, the orb of memories) while the screen closes in from the edges
   * onto that light; the next world mounts behind it and compiles; then its camera pulls
   * back out of ITS hero light while the screen opens from the centre. Same place on
   * screen, same colour, same light on both sides of the cut — no flash, no blank page.
   */
  const transition = useCallback(
    async (next: Stage) => {
      if (busy.current) return;
      busy.current = true;
      const quick = reducedMotion;
      const scene = next === 'room' ? (stage === 'welcome' ? 'enter-room' : 'back-to-room') : `to-${next}`;
      beginScene(scene, quick);
      const color = next === 'final' ? DUST.final : DUST.room;
      // Storyboard D: the light sprite leads the way into the room (a corridor of its own
      // flock — only the dark at the edges is kept from the dust) and out of it through the
      // window into the finale (no dust at all: the flock becomes the finale's stars).
      // Coming back from the finale: the quieter holding field, as before.
      const led = !quick && webglRef.current && (next === 'room' ? stage === 'welcome' : next === 'final');
      if (led && next === 'final') {
        setLeaving(true);
        // RoomWorld flies the sprite to the arched window; the finale is swapped in when the
        // camera, following it, reaches the glass
        await Promise.race([story.wait('window'), sceneWait(5500)]);
        // the night she flew into is the first sky of the finale: it washes into the
        // finale's own colour (reference video 5: a colour wash as the change of scene)
        setNight(true);
        setStage(next);
        setLeaving(false);
        setTimeout(() => setNight(false), 120);
        await sceneWait(1200);
        endScene(scene);
        busy.current = false;
        return;
      }
      // into the room she has never seen: the light flies past her (storyboard B), or the
      // light sprite leads her down its corridor (D). Between worlds she knows: the holding field.
      // (warp only on the first way in: back from the finale she returns to a room she knows,
      //  and a warp there armed the room to be built by a flight that never came — J1)
      const mode: DustMode = led ? 'veil' : next === 'room' && stage === 'welcome' && !quick ? 'warp' : 'dust';
      // the dust is seeded first, with the camera's little step back: the change announces
      // itself at one point of light before anything moves (reference video 6, 3.50 s)
      setDust({ phase: 'close', color, mode });
      setLeaving(true);
      await sceneWait(quick ? 0 : 180);
      setVeil('iris');
      await sceneWait(quick ? 450 : mode === 'veil' ? MOTION.sprite.room.leave * 1000 - 180 : mode === 'warp' ? MOTION.enterRoom.streak * 1000 - 180 : 1050);
      if (next === 'room') resetReady('room-ready');
      setStage(next);
      setLeaving(false);
      await sceneWait(quick ? 120 : 260);
      // the room compiles its shaders behind the iris; open it once it can be shown smoothly
      if (next === 'room' && webglRef.current) await waitReady('room-ready', 4000);
      setVeil('none');
      // the motes clear from the centre outward, so the new hero is seen first
      setDust({ phase: 'open', color, mode });
      // the way in tells its story inside the room (the light lands on it), so she may
      // touch things as soon as she can see them — the lock is only for a second change
      // of world, not for her hand
      await sceneWait(quick ? 450 : mode === 'warp' ? 900 : 1600);
      setDust({ phase: 'none', color, mode });
      busy.current = false;
      // (a led entry ends when the tour is home; every other change of world ends here)
      if (mode === 'veil') void story.wait('room-home').then(() => endScene(scene));
      else endScene(scene);
      // led in: the tour of the room is still flying — choosing a gift now ends it first
      if (mode === 'veil') {
        touringRef.current = true;
        void story.wait('room-home').then(() => (touringRef.current = false));
      }
    },
    [reducedMotion, stage],
  );

  /* ── Intro ─────────────────────────────────────────────────────────── */
  const tapHeart = useCallback(() => {
    if (stage === 'room') {
      if (allOpened && !openingId && !activeId) {
        sound.flourish();
        void transition('final');
      }
      return;
    }
    if (stage !== 'intro') return;
    setTaps((t) => {
      if (t >= TAPS_NEEDED) return t;
      const next = t + 1;
      if (next === 1 && lightHeart) {
        // the scattered light gathers into a heart
        sound.gather(reducedMotion ? 1 : 3.2);
      } else {
        sound.chime(next * 2 - 2);
        setTimeout(() => sound.thump(0.6 + next * 0.2), 110);
      }
      if (next === TAPS_NEEDED) {
        sound.flourish();
        // the heart opens, its light comes home, and the card condenses under it — or, with the
        // light sprite (storyboard D3.1), the card is mounted as the heart settles so the
        // sprite can leave the heart and draw its frame before the writing condenses
        const U = MOTION.unlock;
        const at = reducedMotion ? U.quick.gateAt : webglRef.current ? U.anticipate + U.release : U.gateAt;
        // a scene: shorter the second time, hurried by a touch (src/lib/pace.ts)
        beginScene('unlock', reducedMotion);
        void sceneWait(at * 1000).then(() => setStage('gate'));
        void story.wait('gate-home').then(() => endScene('unlock'));
      }
      return next;
    });
    setPulseKey((k) => k + 1);
  }, [stage, allOpened, openingId, activeId, transition, reducedMotion]);

  /* ── Gate ──────────────────────────────────────────────────────────── */
  // The gate and the welcome share one world: no cover at all. The card thanks her and
  // dissolves (CSS gate-out) while the heart beats once and drifts up; the welcome rises.
  const unlock = useCallback(async () => {
    // the heart rings once and the card's light is drawn up into it (storyboard B, 0-0.5 s)
    setPulseKey((k) => k + 1);
    sound.flourish();
    endScene('unlock');
    beginScene('welcome-in', reducedMotion);
    await sceneWait(reducedMotion ? 500 : 1500);
    endScene('welcome-in');
    setStage((s) => (s === 'gate' ? 'welcome' : s));
  }, [reducedMotion]);

  /* ── Room ──────────────────────────────────────────────────────────── */
  const selectGift = useCallback(
    (id: string) => {
      if (openingId || activeId || busy.current) return;
      // (her choice ends the light's tour: it goes home and the camera turns to the gift)
      if (touringRef.current) {
        touringRef.current = false;
        story.signal('skip-tour');
      }
      setFocusId(null);
      // (the place the page opens out of is this gift's, never the last one's)
      publishGiftMark(null);
      beginScene(`gift:${id}`, reducedMotion);
      // (the page's code is fetched now, while the gift opens: the sheet must never stand
      //  waiting in front of her for a download — K)
      void import('./components/experience/MemoryView');
      void import('./components/experience/LoveLetter');
      setOpeningId(id);
      sound.chime(gifts.findIndex((g) => g.id === id) + 2);
    },
    [openingId, activeId],
  );

  const revealing = useRef<string | null>(null);
  const giftOpened = useCallback(
    async (id: string) => {
      if (revealing.current === id) return; // the 3D scene and the safety net may both call this
      revealing.current = id;
      endScene(`gift:${id}`);
      sound.chime(5, 0.06);
      // the gift has had its product shot; the memory settles over it (sheet-in), the room
      // stays there behind, out of focus — no cover in between
      // (K: the sheet is holding still in front of her — the page takes it over at once)
      await wait(reducedMotion ? 60 : 30);
      setActiveId(id);
    },
    [reducedMotion],
  );

  // Safety net: if the 3D opening stalls (very slow device, context loss), open the memory anyway.
  useEffect(() => {
    if (!openingId || activeId) return;
    if ((window as unknown as { __shotHold?: number }).__shotHold !== undefined) return; // QA: a held product shot
    // …after the gift's OWN opening, not a fixed 3.5 s: every one takes its own time now
    // (storyboard I), and a net that fires early would open the memory mid-performance
    const shape = gifts.find((g) => g.id === openingId)?.shape ?? 'box';
    const secs = reducedMotion ? MOTION.gift.quick : (MOTION.gift.open as Record<string, number>)[shape] ?? 5.2;
    // (V: and the sheet's flight to her, which overlaps the opening)
    const letter = reducedMotion ? 0 : MOTION.flight.dur + 1;
    const id = setTimeout(() => void giftOpened(openingId), (secs + letter) * 1000 + 1200);
    return () => clearTimeout(id);
  }, [openingId, activeId, giftOpened, reducedMotion]);

  /**
   * Closing a memory runs the opening backwards (storyboard I): the page folds back into the
   * thing it came out of, the room is live again behind it, and then the gift closes itself
   * along the same curve it opened on (Gift3D runs its clock down).
   */
  const [closingSheet, setClosingSheet] = useState(false);
  const closeGift = useCallback(() => {
    const id = activeId;
    if (!id || closingSheet) return;
    const finish = () => {
      setClosingSheet(false);
      revealing.current = null;
      setActiveId(null);
      setOpeningId(null);
      setOpened((o) => (o.includes(id) ? o : [...o, id]));
      setPulseKey((k) => k + 1);
    };
    if (reducedMotion || (!giftMark.at && !carrier.live)) return finish();
    setClosingSheet(true);
    sound.paper(1);
    setTimeout(finish, MOTION.gift.closeMs);
  }, [activeId, closingSheet, reducedMotion]);

  const goFinal = useCallback(() => {
    sound.flourish();
    setFinalePhase('gather');
    void transition('final');
  }, [transition]);

  /* ── Finale ────────────────────────────────────────────────────────── */
  const finaleFormed = useCallback(() => {
    sound.flourish();
    setFinalePhase((p) => (p === 'gather' ? 'formed' : p));
    saveProgress({ unlocked: true, opened, finaleSeen: true });
  }, [opened]);

  // Safety net: on a very slow device the 3D clock may crawl — never keep her waiting.
  useEffect(() => {
    if (stage !== 'final' || finalePhase !== 'gather') return;
    const id = setTimeout(finaleFormed, 11000);
    return () => clearTimeout(id);
  }, [stage, finalePhase, finaleFormed]);

  const oneMore = useCallback(() => {
    sound.flourish();
    setFinalePhase('secret');
  }, []);

  /* ── The final surprise: a small state machine that only moves forward ── */
  const surpriseSeen = useRef(false);
  const advanceSurprise = useCallback((next: FinalePhase) => {
    setFinalePhase((cur) => {
      const allowed: Partial<Record<FinalePhase, FinalePhase[]>> = {
        secret: ['quiet'],
        quiet: ['question'],
        question: ['sure', 'reveal'],
        sure: ['reveal'],
        reveal: ['waiting'],
      };
      return allowed[cur]?.includes(next) ? next : cur;
    });
  }, []);
  // the timed steps (the choices are hers): secret → quiet → question, reveal → waiting
  useEffect(() => {
    if (stage !== 'final') return;
    const s = birthdayConfig.surprise;
    const fast = reducedMotion;
    let id: ReturnType<typeof setTimeout> | undefined;
    if (finalePhase === 'secret' && !surpriseSeen.current) {
      // the last words finish rising (≈ 7.5 s), then a little calm — then the world changes
      const lines = birthdayConfig.final.secretMessage.length;
      id = setTimeout(() => {
        surpriseSeen.current = true;
        sound.duck(0.6);
        advanceSurprise('quiet');
      }, (1.8 + lines * 1.6 + 1.2 + s.delay) * 1000);
    } else if (finalePhase === 'quiet') {
      id = setTimeout(() => advanceSurprise('question'), fast ? 900 : 3000);
    } else if (finalePhase === 'reveal') {
      id = setTimeout(() => advanceSurprise('waiting'), fast ? 5200 : 10500);
    }
    return () => clearTimeout(id);
  }, [stage, finalePhase, reducedMotion, advanceSurprise]);
  const chooseDone = useCallback(() => {
    sound.chime(2, 0.05);
    advanceSurprise('sure');
  }, [advanceSurprise]);
  const chooseMore = useCallback(() => {
    sound.flourish();
    sound.duck(0.75);
    advanceSurprise('reveal');
  }, [advanceSurprise]);

  const backToRoom = useCallback(() => {
    sound.duck(0);
    void transition('room');
  }, [transition]);

  const replay = useCallback(() => {
    clearProgress();
    location.replace(location.pathname);
  }, []);

  const finalePhotos = useMemo(
    () => gifts.flatMap((g) => (g.coverImage ? [assetUrl(g.coverImage.src)] : [])).slice(0, 6),
    [],
  );

  // (while the page folds back into the gift the room is live again behind it)
  const overlayOpen = !!activeGift && !closingSheet;
  const sceneProps = {
    stage,
    gifts,
    opened,
    openingId,
    allOpened,
    pulseKey,
    onGiftSelect: selectGift,
    onGiftOpened: giftOpened,
    finalePhase,
    onFinaleFormed: finaleFormed,
    reducedMotion,
  };

  return (
    <>
      <div className="backdrop" data-stage={stage} data-awake={stage !== 'intro' || taps >= 1} aria-hidden="true" />
      <div className="night-wash" data-on={night} aria-hidden="true" />

      <div className="scene-holder" aria-hidden="true" inert={overlayOpen}>
        {webgl ? (
          <ErrorBoundary onError={() => setWebgl(false)}>
            <Suspense fallback={null}>
              <Scene3D
                {...sceneProps}
                taps={taps}
                tapsNeeded={TAPS_NEEDED}
                onHeartTap={tapHeart}
                focusId={focusId}
                finalePhotos={finalePhotos}
                paused={overlayOpen}
                tier={tier}
                onTierChange={setTier}
                portrait={portrait}
                leaving={leaving}
                dust={dust.phase}
                dustColor={dust.color}
                dustMode={dust.mode}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <FallbackScene {...sceneProps} />
        )}
      </div>

      <CursorLayer reducedMotion={reducedMotion} />
      <LightTextLayer />

      <main className="stage" data-stage={stage} data-veil={veil} data-leaving={leaving} data-opening={openingId ?? ""} inert={overlayOpen}>
        {stage === 'intro' && (
          <IntroOverlay taps={taps} tapsNeeded={TAPS_NEEDED} onTap={tapHeart} fallback={!webgl} />
        )}
        {stage === 'gate' && <PasswordGate onSuccess={unlock} onFail={() => sound.chime(0, 0.03)} draw={webgl && !reducedMotion} />}
        {stage === 'welcome' && (
          <Welcome
            leaving={leaving}
            onEnter={() => {
              sound.gather(reducedMotion ? 0.8 : 1.6);
              void transition('room');
            }}
          />
        )}
        {stage === 'room' && (
          <RoomUI
            gifts={gifts}
            opened={opened}
            busy={!!openingId || overlayOpen || veil !== 'none' || leaving || moment}
            onSelect={selectGift}
            onFocusGift={setFocusId}
            onFinal={goFinal}
          />
        )}
        {stage === 'final' && (
          <Suspense fallback={null}>
            <FinalReveal phase={finalePhase} surpriseAhead={!surpriseSeen.current} onOneMore={oneMore} onBackToRoom={backToRoom} onReplay={replay} onChooseDone={chooseDone} onChooseMore={chooseMore} />
          </Suspense>
        )}
      </main>

      <Suspense fallback={null}>
        {activeGift?.kind === 'memory' && (
          <MemoryView gift={activeGift} index={gifts.indexOf(activeGift)} onClose={closeGift} closing={closingSheet} reducedMotion={reducedMotion} />
        )}
        {activeGift?.kind === 'letter' && <LoveLetter onClose={closeGift} reducedMotion={reducedMotion} closing={closingSheet} />}
      </Suspense>

      <MusicToggle />
      {/* the light at the middle of a change of world, kept alive by the compositor while
          the next world draws its first frame (see .dust-core) */}
      <div className="dust-core" data-on={webgl && dust.phase !== 'none' ? dust.phase : 'off'} aria-hidden="true" />
      <div className="iris" data-on={veil === 'iris' && (!webgl || domCover)} aria-hidden="true">
        <span className="iris__core" />
      </div>
      <div className="boot" data-on={webgl && !booted && !saved.unlocked} aria-hidden="true">
        <span className="boot__light" />
        <span className="boot__mote" style={{ left: '46%', animationDelay: '0s' }} />
        <span className="boot__mote" style={{ left: '53%', animationDelay: '1.3s' }} />
        <span className="boot__mote" style={{ left: '50%', animationDelay: '2.4s' }} />
        <span className="boot__word">for you</span>
      </div>
    </>
  );
}
