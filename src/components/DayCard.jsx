import { WIcon } from './Icons';
import { weatherAtEventTime } from '../lib/weather';
import { classifyEventKind, SLOT_LABEL } from '../engine/context';
import { describeForecast, formatTime } from '../lib/copy';

/* ============================================================
   DAY CARD — the two inputs every pick depends on: the weather
   where you are and what's on your calendar, with the forecast
   for the hour of each plan.
============================================================ */
export function DayCard({ weather, location, context, todayKey, todayEvents, onSetLocation, onEditEvents }) {
  const forecast = describeForecast(context);

  return (
    <section className="day-card" aria-label="Your day">
      <div className="day-weather">
        {weather ? (
          <>
            <WIcon name={weather.icon}/>
            <span className="day-temp">{weather.temp}°</span>
            <div className="day-weather-text">
              <div className="day-cond">{weather.condition}{location ? ` in ${location.city}` : ''}</div>
              <div className="day-range">High {weather.todayHi}° · Low {weather.todayLo}°{weather.rainChance >= 30 ? ` · ${weather.rainChance}% rain` : ''}</div>
            </div>
          </>
        ) : location ? (
          <div className="day-weather-text"><div className="day-cond">Getting the weather for {location.city}…</div></div>
        ) : (
          <button className="day-link" onClick={onSetLocation}><WIcon name="pin"/> Set your location to get the weather</button>
        )}
      </div>

      <div className="day-events">
        {todayEvents.length === 0 ? (
          <div className="day-empty">Nothing on your calendar today.</div>
        ) : todayEvents.map(ev => {
          const at = weatherAtEventTime(weather, todayKey, ev.time);
          const kind = classifyEventKind(ev.title);
          return (
            <div key={ev.id} className="day-event">
              <div className="day-event-time">{ev.time ? formatTime(ev.time) : 'All day'}</div>
              <div className="day-event-main">
                <div className="day-event-title">{ev.title}</div>
                {kind !== 'unknown' && <div className="day-event-kind">{SLOT_LABEL[kind]}</div>}
              </div>
              {at?._atTime && <div className="day-event-weather"><WIcon name={at.icon}/> {at.temp}°</div>}
            </div>
          );
        })}
        <button className="day-link" onClick={onEditEvents}>
          <WIcon name="cal"/> {todayEvents.length ? 'Edit or sync events' : 'Add or sync events'}
        </button>
      </div>

      {forecast && <p className="day-forecast">{forecast}</p>}
    </section>
  );
}
