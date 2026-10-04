import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { birthdayConfig } from './config/birthday';
import { gifts } from './data/gifts';
import type { FinalePhase, Stage, Veil } from './types';
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

export default function App() {
  const saved = useMemo(loadProgress, []);
  const reducedMotion = useReducedMotion();
  const { portrait } = useViewport();
  // the stylesheet's calmer animations apply only when the site honours the setting
  useEffect(() => {
    document.documentElement.toggleAttribute('data-reduce', reducedMotion);
  }, [reducedMotion]);

  const [stage, setStage] = useState<Stage>(saved.unlocked ? 'room' : 'intro');
  const [veil, setVeil] = useState<Veil>(saved.unlocked ? 'dark' : 'none');
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
  // remember the last colour so the veil fades out in the same colour it faded in
  const lastVeil = useRef<Exclude<Veil, 'none'>>('dark');
  if (veil !== 'none') lastVeil.current = veil;
  const veilKind = lastVeil.current;

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
    void Promise.all([wait(300), waitReady('room-ready', 5000)]).then(() => alive && setVeil('none'));
    return () => {
      alive = false;
    };
  }, [saved.unlocked]);

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

  /** Fade out → swap stage → (wait for the room to be ready) → fade in. */
  const transition = useCallback(async (next: Stage, kind: Exclude<Veil, 'none'> = 'dark', hold = 250) => {
    if (busy.current) return;
    busy.current = true;
    setVeil(kind);
    await wait(750);
    if (next === 'room') resetReady('room-ready');
    setStage(next);
    await wait(hold);
    // the room compiles its shaders behind the veil; lift it once it can be shown smoothly
    if (next === 'room' && webglRef.current) await waitReady('room-ready', 4000);
    setVeil('none');
    await wait(700);
    busy.current = false;
  }, []);

  /* ── Intro ─────────────────────────────────────────────────────────── */
  const tapHeart = useCallback(() => {
    if (stage === 'room') {
      if (allOpened && !openingId && !activeId) {
        sound.flourish();
        void transition('final', 'light', 400);
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
        setTimeout(() => setStage('gate'), reducedMotion ? 1200 : 2600);
      }
      return next;
    });
    setPulseKey((k) => k + 1);
  }, [stage, allOpened, openingId, activeId, transition, reducedMotion]);

  /* ── Gate ──────────────────────────────────────────────────────────── */
  const unlock = useCallback(async () => {
    setPulseKey((k) => k + 1);
    sound.flourish();
    await wait(reducedMotion ? 300 : 1100);
    void transition('welcome', 'light', 500);
  }, [transition, reducedMotion]);

  /* ── Room ──────────────────────────────────────────────────────────── */
  const selectGift = useCallback(
    (id: string) => {
      if (openingId || activeId || busy.current) return;
      setFocusId(null);
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
      sound.chime(5, 0.06);
      setVeil('light');
      await wait(reducedMotion ? 150 : 520);
      setActiveId(id);
      setVeil('none');
    },
    [reducedMotion],
  );

  // Safety net: if the 3D opening stalls (very slow device, context loss), open the memory anyway.
  useEffect(() => {
    if (!openingId || activeId) return;
    const id = setTimeout(() => void giftOpened(openingId), reducedMotion ? 2500 : 3500);
    return () => clearTimeout(id);
  }, [openingId, activeId, giftOpened, reducedMotion]);

  const closeGift = useCallback(() => {
    const id = activeId;
    revealing.current = null;
    setActiveId(null);
    setOpeningId(null);
    if (id) {
      setOpened((o) => (o.includes(id) ? o : [...o, id]));
      setPulseKey((k) => k + 1);
    }
  }, [activeId]);

  const goFinal = useCallback(() => {
    sound.flourish();
    setFinalePhase('gather');
    void transition('final', 'light', 400);
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

  const backToRoom = useCallback(() => void transition('room', 'dark'), [transition]);

  const replay = useCallback(() => {
    clearProgress();
    location.replace(location.pathname);
  }, []);

  const finalePhotos = useMemo(
    () => gifts.flatMap((g) => (g.coverImage ? [assetUrl(g.coverImage.src)] : [])).slice(0, 6),
    [],
  );

  const overlayOpen = !!activeGift;
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
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <FallbackScene {...sceneProps} />
        )}
      </div>

      <CursorLayer reducedMotion={reducedMotion} />

      <main className="stage" data-stage={stage} inert={overlayOpen}>
        {stage === 'intro' && (
          <IntroOverlay taps={taps} tapsNeeded={TAPS_NEEDED} onTap={tapHeart} fallback={!webgl} />
        )}
        {stage === 'gate' && <PasswordGate onSuccess={unlock} onFail={() => sound.chime(0, 0.03)} />}
        {stage === 'welcome' && <Welcome onEnter={() => void transition('room', 'dark', 300)} />}
        {stage === 'room' && (
          <RoomUI
            gifts={gifts}
            opened={opened}
            busy={!!openingId || overlayOpen || veil !== 'none'}
            onSelect={selectGift}
            onFocusGift={setFocusId}
            onFinal={goFinal}
          />
        )}
        {stage === 'final' && (
          <Suspense fallback={null}>
            <FinalReveal phase={finalePhase} onOneMore={oneMore} onBackToRoom={backToRoom} onReplay={replay} />
          </Suspense>
        )}
      </main>

      <Suspense fallback={null}>
        {activeGift?.kind === 'memory' && (
          <MemoryView gift={activeGift} index={gifts.indexOf(activeGift)} onClose={closeGift} />
        )}
        {activeGift?.kind === 'letter' && <LoveLetter onClose={closeGift} reducedMotion={reducedMotion} />}
      </Suspense>

      <MusicToggle />
      <div className="veil" data-kind={veilKind} data-on={veil !== 'none'} aria-hidden="true">
        <span className="veil__light" />
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
