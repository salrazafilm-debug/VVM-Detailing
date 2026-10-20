export default function GarageIcon({ name, ...props }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v12h5v-7h4v7h5V9"/></>,
    services: <><path d="M12 2S5 10 5 15a7 7 0 0 0 14 0C19 10 12 2 12 2Z"/><path d="M8 15a4 4 0 0 0 4 4"/></>,
    garage: <><path d="m5 9 2-5h10l2 5M3 10h18v9H3zM5 19v2m14-2v2M3 14h18"/><path d="M6 12h1m10 0h1"/></>,
    bookings: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 10h18M7 14h1m3 0h1m3 0h1m-9 3h1m3 0h1"/></>,
    profile: <><circle cx="12" cy="7" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2Z"/></>,
    gift: <><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/></>,
    photo: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name] || paths.garage}</svg>;
}
