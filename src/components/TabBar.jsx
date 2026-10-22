import { WIcon } from './Icons';

/* ============================================================
   TAB BAR
============================================================ */
export function TabBar({ tab, setTab }) {
  const tabs = [
    { id: 'home', label: 'Today', icon: 'sun' },
    { id: 'closet', label: 'Closet', icon: 'closet' },
    { id: 'saved', label: 'Saved', icon: 'bookmark' },
    { id: 'profile', label: 'Profile', icon: 'user' },
  ];
  return (
    <nav className="tabbar">
      {tabs.map(t => (
        <button key={t.id} className="tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
          <WIcon name={t.icon}/>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
