import { birthdayConfig } from '../../config/birthday';
import type { Gift } from '../../data/gifts';

interface Props {
  gifts: Gift[];
  opened: string[];
  busy: boolean;
  onSelect: (id: string) => void;
  onFocusGift: (id: string | null) => void;
  onFinal: () => void;
}

/** The quiet 2D layer over the gift room: title, hint, and keyboard/touch-friendly gift buttons. */
export function RoomUI({ gifts, opened, busy, onSelect, onFocusGift, onFinal }: Props) {
  const cfg = birthdayConfig.room;
  const all = opened.length >= gifts.length;

  return (
    <div className={`layer room-ui${busy ? ' is-busy' : ''}`}>
      {/* opening a memory: the room around it softens into the dark */}
      <div className={`room-focus${busy ? ' is-on' : ''}`} aria-hidden="true" />
      <header className="room-ui__head fade" style={{ animationDelay: '0.8s' }}>
        <p className="eyebrow">
          {opened.length} / {gifts.length}
        </p>
        <h1 className="room-ui__title">{cfg.title}</h1>
      </header>

      <div className="room-ui__foot">
        {all ? (
          <div className="room-ui__final rise" key="final">
            <p className="whisper room-ui__note">{cfg.allOpenedHint}</p>
            <button type="button" className="btn btn--solid room-ui__cta" onClick={onFinal}>
              {cfg.finalButton}
            </button>
          </div>
        ) : (
          <p className="room-ui__hint eyebrow fade" style={{ animationDelay: '1.6s' }}>
            {cfg.hint}
          </p>
        )}

        <nav className="gift-nav fade" style={{ animationDelay: '1.2s' }} aria-label="Gifts">
          {gifts.map((g, i) => {
            const isOpen = opened.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                className={`gift-nav__btn${isOpen ? ' is-opened' : ''}`}
                onClick={() => onSelect(g.id)}
                onFocus={() => onFocusGift(g.id)}
                onBlur={() => onFocusGift(null)}
                onMouseEnter={() => onFocusGift(g.id)}
                onMouseLeave={() => onFocusGift(null)}
                disabled={busy}
                aria-label={`${String(i + 1).padStart(2, '0')} — ${g.title}${isOpen ? ' (opened)' : ''}`}
              >
                <span aria-hidden="true">{isOpen ? '✓' : String(i + 1).padStart(2, '0')}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
