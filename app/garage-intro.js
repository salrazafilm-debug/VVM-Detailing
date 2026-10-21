'use client';
// The "Entering your garage" screen. Inline styles so it paints before the Garage stylesheet loads.
export const introStyle = {position:'fixed',inset:0,zIndex:100,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:26,background:'#000',color:'#fff'};
export default function GarageIntro({ className = 'room-intro' }) {
  return <div className={className} style={introStyle} role="status" aria-live="polite">
    <img src="/assets/garage/vvm-logo-splash.png" alt="VVM Details" width="520" height="455" style={{width:'min(62vw,300px)',height:'auto'}}/>
    <p style={{margin:0,font:'italic 900 clamp(1.1rem,2.6vw,1.6rem)/1 var(--gdisplay)',letterSpacing:'.12em',textTransform:'uppercase',color:'#f0d63c'}}>Entering your garage</p>
  </div>;
}
