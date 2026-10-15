/** Survey benchmark mark: the datum every elevation is measured from. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="datum-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffc45c" />
          <stop offset="1" stopColor="#e8890c" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#datum-bg)" />
      <path d="M14 22h36" stroke="#14110a" strokeWidth="5" strokeLinecap="round" />
      <path d="M32 22L46 48H18L32 22z" fill="#14110a" />
      <path d="M32 30v12" stroke="url(#datum-bg)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
