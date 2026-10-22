import { usePhotoUrl } from '../lib/photoStore';
import { WIcon } from './Icons';

/* ============================================================
   COLLAGE — uses real user-uploaded photos
============================================================ */
export function Collage({ outfit, feedback, onRatePiece }) {
  // Only show the pieces that are actually in the outfit: the main piece
  // (top or dress) fills the left, the rest stack beside it.
  const order = ['dress', 'top', 'outer', 'bottom', 'shoes', 'accessory'];
  const pieces = order.map(r => outfit[r]).filter(Boolean);
  const rows = Math.max(1, pieces.length - 1);
  return (
    <div className="collage" data-count={pieces.length} style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {pieces.map((item, i) => (
        <CollageCell key={item.id} item={item} feedback={feedback} onRate={onRatePiece}
          className={i === 0 ? 'cell-main' : 'cell-side'}
          style={i === 0 ? { gridRow: `1 / span ${rows}` } : undefined}/>
      ))}
    </div>
  );
}

export function CollageCell({ item, className, style, feedback, onRate }) {
  // Hook runs before the early return so the hook count never changes
  // when a cell switches between empty and filled.
  const photoUrl = usePhotoUrl(item);
  if (!item) return <div className={`collage-cell empty ${className}`}>—</div>;
  const fb = feedback?.pieces?.[item.id];
  return (
    <div className={`collage-cell ${className}`} style={style}>
      {photoUrl ? <img src={photoUrl} alt={item.name}/> : <div className="placeholder">—</div>}
      <div className="role-tag">{item.role}</div>
      <button className="like-btn" onClick={() => onRate?.(item.id, fb === 'love' ? null : 'love')} title="Love this piece">
        <WIcon name="heart" filled={fb === 'love'}/>
      </button>
    </div>
  );
}

export function AltCollage({ outfit }) {
  // Same idea as the big collage: only the pieces in the outfit, main piece
  // tall on the left when there are three.
  const order = ['dress', 'top', 'outer', 'bottom', 'shoes', 'accessory'];
  const list = order.map(r => outfit[r]).filter(Boolean).slice(0, 4);
  const cols = list.length === 1 ? '1fr' : '1fr 1fr';
  const rows = list.length >= 3 ? '1fr 1fr' : '1fr';
  return (
    <div className="alt-collage" style={{ gridTemplateColumns: cols, gridTemplateRows: rows }}>
      {list.map((item, i) => (
        <AltCollageCell key={item.id} item={item}
          style={list.length === 3 && i === 0 ? { gridRow: 'span 2' } : undefined}/>
      ))}
    </div>
  );
}
export function AltCollageCell({ item, style }) {
  const url = usePhotoUrl(item);
  return (
    <div className="alt-cell" style={style} data-empty={!url ? 'true' : 'false'}>
      {item && url ? <img src={url} alt={item.name || ''}/> : null}
    </div>
  );
}
