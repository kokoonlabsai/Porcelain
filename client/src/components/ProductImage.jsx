import { API_ORIGIN } from '../lib/api';

const TONES = {
  cleansers: ['#E8ECF4', '#1F3264'],
  serums: ['#F4EEE2', '#8A6E3E'],
  moisturisers: ['#EEF0F2', '#4B5260'],
  sunscreen: ['#F6EFE3', '#A88A55'],
  treatments: ['#E8ECF4', '#2B4482'],
  hair: ['#EDEFEA', '#55664F'],
  body: ['#F3ECE6', '#8C5A62'],
};

/** Pump bottle, dropper, jar or tube, depending on the category. */
function Vessel({ category, fg }) {
  const label = <rect x="74" y="118" width="52" height="34" rx="2" fill="#FFFDF9" opacity="0.94" />;
  const word = <text x="100" y="138.5" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="7.4" fontWeight="600" letterSpacing="1.3" fill={fg}>PORCELAIN</text>;
  switch (category) {
    case 'serums':
      return (
        <g>
          <rect x="88" y="44" width="24" height="30" rx="10" fill={fg} />
          <rect x="84" y="72" width="32" height="12" rx="2" fill={fg} opacity="0.8" />
          <rect x="68" y="84" width="64" height="96" rx="10" fill={fg} opacity="0.88" />
          {label}{word}
        </g>
      );
    case 'moisturisers':
      return (
        <g>
          <rect x="54" y="92" width="92" height="22" rx="4" fill={fg} />
          <rect x="58" y="112" width="84" height="64" rx="10" fill={fg} opacity="0.85" />
          <rect x="76" y="128" width="48" height="30" rx="2" fill="#FFFDF9" opacity="0.92" />
          <text x="100" y="146.5" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="7.4" fontWeight="600" letterSpacing="1.3" fill={fg}>PORCELAIN</text>
        </g>
      );
    case 'sunscreen':
    case 'treatments':
      return (
        <g>
          <path d="M70 56 h60 l-6 116 h-48 Z" fill={fg} opacity="0.88" />
          <rect x="82" y="170" width="36" height="16" rx="3" fill={fg} />
          <rect x="66" y="50" width="68" height="8" rx="2" fill={fg} />
          {label}{word}
        </g>
      );
    default:
      return (
        <g>
          <rect x="92" y="34" width="34" height="8" rx="3" fill={fg} />
          <rect x="96" y="40" width="8" height="20" fill={fg} />
          <rect x="86" y="58" width="28" height="16" rx="3" fill={fg} />
          <rect x="70" y="72" width="60" height="110" rx="14" fill={fg} opacity="0.88" />
          {label}{word}
        </g>
      );
  }
}

export default function ProductImage({ product, className = '' }) {
  const [bg, fg] = TONES[product.category] || TONES.cleansers;
  if (product.image_url) {
    return <div className={`product-img ${className}`} style={{ background: bg }}><img src={`${API_ORIGIN}${product.image_url}`} alt={product.name} loading="lazy" /></div>;
  }
  return (
    <div className={`product-img ${className}`} style={{ background: bg }}>
      <svg viewBox="0 0 200 220" role="img" aria-label={product.name}>
        <ellipse cx="100" cy="196" rx="54" ry="7" fill={fg} opacity="0.12" />
        <Vessel category={product.category} fg={fg} />
      </svg>
    </div>
  );
}
