// NetPulse brand logo — use variant="icon" for sidebar, variant="full" for login/topbar
export default function NetPulseLogo({ size = 36, variant = 'icon' }) {
  const uid = `np-${size}`
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      aria-label="NetPulse"
      style={{ display:'block', flexShrink:0 }}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#4f7ef5"/>
          <stop offset="100%" stopColor="#7c5cfc"/>
        </linearGradient>
        <linearGradient id={`${uid}-pl`} x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#22d3ee"/>
          <stop offset="100%" stopColor="#22d3a0"/>
        </linearGradient>
      </defs>

      {/* Background tile */}
      <rect width="40" height="40" rx="10" fill={`url(#${uid}-bg)`}/>

      {/* Pulse / ECG waveform */}
      <polyline
        points="4,20 10,20 13,11 17,28 21,13 24,24 27,20 36,20"
        stroke={`url(#${uid}-pl)`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Peak node dots */}
      <circle cx="13" cy="11" r="1.8" fill="#22d3ee"/>
      <circle cx="21" cy="13" r="1.8" fill="#22d3a0"/>
    </svg>
  )
}

// Full logo: icon + wordmark side-by-side
export function NetPulseLogoFull({ iconSize = 32 }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <NetPulseLogo size={iconSize} />
      <div style={{ display:'flex', flexDirection:'column', lineHeight:1 }}>
        <span style={{
          fontFamily:'var(--sans)', fontWeight:800, fontSize: iconSize * 0.56,
          background:'linear-gradient(90deg,#4f7ef5,#7c5cfc)',
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
          backgroundClip:'text', letterSpacing:-0.5,
        }}>NetPulse</span>
        <span style={{
          fontFamily:'var(--mono)', fontSize: iconSize * 0.28,
          color:'#555a72', letterSpacing:2, textTransform:'uppercase',
        }}>NOC / SOC</span>
      </div>
    </div>
  )
}
