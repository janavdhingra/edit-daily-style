import { useState, useMemo } from 'react';
import { VIBES } from '../data/options';
import { WIcon } from '../components/Icons';
import { AltCollage, Collage } from '../components/Collage';
import { EventEditor } from '../components/EventEditor';
import { CalendarConnectSheet } from '../components/CalendarConnectSheet';
import { LocationModal } from '../components/LocationModal';
import { ScheduleSheet } from '../components/ScheduleSheet';
import { DayCard } from '../components/DayCard';
import { describeOutfit, explainReason, explainReasons } from '../lib/copy';

/* ============================================================
   HOME
============================================================ */
export function Home(props) {
  const {
    profile, items, todayKey, todayEvents, location, weather, context,
    outfits, slotPicks, vibe, setVibe, limits, readOnly, learningInsight, feedback,
    onAddItem, onAddEvent, onRemoveEvent, onSetLocation, onRefreshWeather,
    onSave, onPlan, onWorn, onSkip, onShare, onRatePiece,
    icalUrl, icalLast, onConnectIcalUrl, onImportIcalFile, onDisconnectIcal,
  } = props;

  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [calendarConnectOpen, setCalendarConnectOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [scheduleSheet, setScheduleSheet] = useState(null);

  const dateLine = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, []);

  // empty states
  const noItems = items.length === 0;
  const noLocation = !location;

  const primary = outfits[0];
  const alternates = outfits.slice(1, 4);

  return (
    <div className="home">
      <div className="home-header">
        <div>
          <div className="greeting">{(() => {
            const h = new Date().getHours();
            return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
          })()}{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</div>
          <div className="date-line">{dateLine}</div>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={onRefreshWeather} title="Refresh weather"><WIcon name="refresh"/></button>
        </div>
      </div>

      <DayCard weather={weather} location={location} context={context} todayKey={todayKey} todayEvents={todayEvents}
        onSetLocation={() => setLocationModalOpen(true)} onEditEvents={() => setEventEditorOpen(true)}/>

      {/* PRIMARY OUTFIT or empty state */}
      {noItems ? (
        <div className="empty-card">
          <h3>Your closet is empty</h3>
          <p>Add photos of clothes you own, at least a top, a bottom and a pair of shoes. EDIT only ever styles you from your own closet.</p>
          {!readOnly && <button className="btn btn-primary" onClick={onAddItem}>Add your first piece</button>}
        </div>
      ) : noLocation ? (
        <div className="empty-card">
          <h3>Where are you today?</h3>
          <p>EDIT dresses you for the weather where you are, so it needs a city or your location.</p>
          <button className="btn btn-primary" onClick={() => setLocationModalOpen(true)}>Set location</button>
        </div>
      ) : !primary ? (() => {
        // Diagnose which slot is missing so the empty-state names it.
        const has = (role) => items.some(i => i.role === role);
        const missing = [];
        if (!has('top') && !has('dress')) missing.push('top');
        if (!has('bottom') && !has('dress')) missing.push('bottom');
        if (!has('shoes')) missing.push('shoes');
        const list = missing.length === 0
          ? 'pieces that work together. Adding a few more will give EDIT more to combine.'
          : missing.length === 1
            ? `${missing[0]}. Add one and EDIT can start putting outfits together.`
            : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length-1]}. Add one of each and EDIT can start putting outfits together.`;
        return (
          <div className="empty-card">
            <h3>Not quite enough to make an outfit</h3>
            <p>Your closet needs {list}</p>
            {!readOnly && <button className="btn btn-primary" onClick={onAddItem}>Add a piece</button>}
          </div>
        );
      })() : (
        <>
          <div className="hero-card">
            <Collage outfit={primary.outfit} feedback={feedback} onRatePiece={onRatePiece}/>
            <div className="hero-meta">
              <div className="hero-eyebrow">Today’s outfit</div>
              <div className="hero-title">{describeOutfit(primary.outfit)}</div>
              {primary.reasons.length > 0 && (
                <ul className="hero-reasons">
                  {explainReasons(primary.reasons, context).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
              <div className="hero-actions">
                <button className="pri" onClick={() => onWorn(primary.outfit)}>Wear this</button>
                <button className="sec" onClick={() => onSave(primary.outfit, primary.reasons)}>Save</button>
                <button className="sec" onClick={() => setScheduleSheet(primary.outfit)}>Plan</button>
                <button className="sec" title="Save image to share"
                  onClick={() => onShare?.(primary.outfit, primary.reasons)}>Share</button>
                <button className="sec" title="Skip this combination for two weeks"
                  onClick={() => onSkip?.(primary.outfit)}>Skip</button>
              </div>
            </div>
          </div>

          {alternates.length > 0 && (
            <>
              <div className="alts">Other options</div>
              <div className="alt-row">
                {alternates.map((alt, i) => (
                  <div key={i} className="alt-card">
                    <AltCollage outfit={alt.outfit}/>
                    <div className="alt-meta">
                      <div className="alt-title">{describeOutfit(alt.outfit)}</div>
                      <div className="alt-sub">{alt.reasons[0] ? explainReason(alt.reasons[0], context) : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* When the day has multiple distinct event kinds (e.g. campus +
              dinner), show a per-slot breakdown so you don't have to make one
              outfit cover both. Same-kind events are merged so 3 lectures = 1 fit. */}
          {slotPicks && slotPicks.length >= 2 && (
            <div className="slots-section">
              <div className="alts">For each part of your day</div>
              <div className="slot-list">
                {slotPicks.map((slot, idx) => (
                  <div key={idx} className="slot-card">
                    <div className="slot-head">
                      <div className="slot-label">{slot.label}</div>
                      <div className="slot-events">
                        {slot.events.map(e => `${e.time ? e.time + ' ' : ''}${e.title}`).join(' · ')}
                      </div>
                    </div>
                    {slot.primary ? (
                      <>
                        <AltCollage outfit={slot.primary.outfit}/>
                        <div className="slot-actions">
                          <button className="pri-sm" onClick={() => onWorn(slot.primary.outfit)}>Wear this</button>
                          <button className="sec-sm" onClick={() => onSave(slot.primary.outfit, slot.primary.reasons)}>Save</button>
                          <button className="sec-sm" onClick={() => setScheduleSheet(slot.primary.outfit)}>Plan</button>
                        </div>
                        <div className="slot-reason">{slot.primary.reasons[0] ? explainReason(slot.primary.reasons[0], slot.context) : ''}</div>
                      </>
                    ) : (
                      <div className="slot-empty">Your closet doesn’t have a good match for this one.</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!noItems && limits.length > 0 && (
        <div className="limits">
          {limits.map(l => <p key={l.kind}>{l.text}</p>)}
        </div>
      )}

      {!noItems && (
        <div className="vibes-section">
          <div className="section-eyebrow">How dressed up?</div>
          <div className="vibe-row">
            {VIBES.map(v => (
              <button key={v.id} className="vibe-pill"
                data-on={vibe?.id === v.id}
                title={v.hint}
                onClick={() => setVibe(vibe?.id === v.id ? null : v)}>{v.label}</button>
            ))}
          </div>
        </div>
      )}

      {learningInsight && (
        <div className="learning-card">
          <div className="learning-icon">◐</div>
          <div className="learning-text">
            <strong>What EDIT has noticed</strong><br/>{learningInsight}
          </div>
        </div>
      )}

      {eventEditorOpen && (
        <EventEditor
          dateKey={todayKey}
          events={todayEvents}
          onClose={() => setEventEditorOpen(false)}
          onAdd={onAddEvent}
          onRemove={onRemoveEvent}
          icalUrl={icalUrl}
          icalLast={icalLast}
          onOpenCalendarConnect={() => { setEventEditorOpen(false); setCalendarConnectOpen(true); }}
          onDisconnectIcal={onDisconnectIcal}
        />
      )}

      {calendarConnectOpen && (
        <CalendarConnectSheet
          icalUrl={icalUrl}
          icalLast={icalLast}
          onClose={() => setCalendarConnectOpen(false)}
          onConnectUrl={onConnectIcalUrl}
          onUploadFile={onImportIcalFile}
          onDisconnect={onDisconnectIcal}
        />
      )}

      {locationModalOpen && (
        <LocationModal
          onClose={() => setLocationModalOpen(false)}
          onSet={(loc) => { onSetLocation(loc); setLocationModalOpen(false); }}
        />
      )}

      {scheduleSheet && (
        <ScheduleSheet
          outfit={scheduleSheet}
          onClose={() => setScheduleSheet(null)}
          onPlan={(dateKey) => { onPlan(scheduleSheet, dateKey); setScheduleSheet(null); }}
        />
      )}
    </div>
  );
}
