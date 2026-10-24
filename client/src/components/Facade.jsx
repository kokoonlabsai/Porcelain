/**
 * The clinic's façade as a line drawing: mansard roof and clock, wrought-iron balconies,
 * the name plaque, navy awnings and door, and the railing with brass finials.
 */
const NAVY = '#1F3264';
const NAVY_DEEP = '#161F3D';
const STONE = '#F1E9DA';
const STONE_SHADE = '#E4D9C6';
const SLATE = '#4B5260';
const BRASS = '#B8975A';
const GLASS = '#D9DFEA';
const LINE = { stroke: NAVY, strokeWidth: 1.1, fill: 'none' };

function Window({ x, y, w = 64, h = 84 }) {
  return (
    <g>
      <rect x={x - 6} y={y - 10} width={w + 12} height={6} fill={STONE_SHADE} {...LINE} />
      <rect x={x} y={y} width={w} height={h} fill={STONE} {...LINE} />
      <rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} fill={GLASS} stroke={NAVY} strokeWidth={0.8} />
      {/* curtains */}
      <path d={`M${x + 7} ${y + 22} q8 ${h / 3} 2 ${h - 30} M${x + w - 7} ${y + 22} q-8 ${h / 3} -2 ${h - 30}`} stroke="#FFFDF9" strokeWidth={6} fill="none" opacity={0.9} />
      <line x1={x + w / 2} y1={y + 5} x2={x + w / 2} y2={y + h - 5} stroke={NAVY} strokeWidth={0.8} />
      <line x1={x + 5} y1={y + 20} x2={x + w - 5} y2={y + 20} stroke={NAVY} strokeWidth={0.8} />
    </g>
  );
}

function Balcony({ x, y, w }) {
  const curls = [];
  for (let cx = x + 9; cx < x + w - 4; cx += 14) curls.push(cx);
  return (
    <g>
      <rect x={x} y={y} width={w} height={22} fill="none" stroke={NAVY_DEEP} strokeWidth={1.4} />
      <line x1={x - 3} y1={y + 22} x2={x + w + 3} y2={y + 22} stroke={NAVY_DEEP} strokeWidth={2} />
      {curls.map((cx) => (
        <g key={cx} stroke={NAVY_DEEP} strokeWidth={0.9} fill="none">
          <circle cx={cx} cy={y + 7} r={4} />
          <circle cx={cx} cy={y + 16} r={4} />
        </g>
      ))}
    </g>
  );
}

function Awning({ x, w }) {
  const n = Math.round(w / 12);
  const step = (w + 16) / n;
  let d = `M${x - 8} 412`;
  for (let i = 0; i < n; i++) d += ` q${step / 2} 8 ${step} 0`;
  return (
    <g>
      <path d={`M${x} 386 L${x + w} 386 L${x + w + 8} 412 L${x - 8} 412 Z`} fill={NAVY} stroke={NAVY_DEEP} strokeWidth={1} />
      <path d={`${d} L${x + w + 8} 412`} fill={NAVY} stroke={NAVY_DEEP} strokeWidth={1} />
      <line x1={x - 8} y1={412} x2={x + w + 8} y2={412} stroke="#FFFDF9" strokeWidth={0.8} opacity={0.5} />
    </g>
  );
}

function Topiary({ cx }) {
  return (
    <g>
      <circle cx={cx} cy={500} r={15} fill="#55664F" />
      <circle cx={cx - 7} cy={494} r={6} fill="#66785F" />
      <path d={`M${cx - 10} 512 h20 l-3 16 h-14 Z`} fill={SLATE} />
    </g>
  );
}

export default function Facade({ name = 'PORCELAIN' }) {
  const bars = [];
  for (let x = 40; x <= 560; x += 9) if (x < 276 || x > 324) bars.push(x);
  const dentils = [];
  for (let x = 86; x < 516; x += 12) dentils.push(x);
  const shingles = [140, 158, 176, 194];

  return (
    <svg viewBox="0 0 600 560" role="img" aria-label={`The ${name} building`} xmlns="http://www.w3.org/2000/svg">
      {/* roof */}
      <rect x={96} y={104} width={408} height={14} fill={STONE} {...LINE} />
      <path d="M108 118 L492 118 L522 210 L78 210 Z" fill={SLATE} stroke={NAVY_DEEP} strokeWidth={1} />
      {shingles.map((y) => (
        <line key={y} x1={108 - ((y - 118) * 30) / 92} y1={y} x2={492 + ((y - 118) * 30) / 92} y2={y} stroke="#5E6574" strokeWidth={1} />
      ))}

      {/* dormers */}
      {[175, 425].map((cx) => (
        <g key={cx}>
          <path d={`M${cx - 38} 132 L${cx} 106 L${cx + 38} 132 Z`} fill={STONE} {...LINE} />
          <rect x={cx - 30} y={132} width={60} height={70} fill={STONE} {...LINE} />
          <rect x={cx - 19} y={142} width={38} height={52} fill={GLASS} stroke={NAVY} strokeWidth={0.8} />
          <line x1={cx} y1={142} x2={cx} y2={194} stroke={NAVY} strokeWidth={0.8} />
          <line x1={cx - 19} y1={160} x2={cx + 19} y2={160} stroke={NAVY} strokeWidth={0.8} />
        </g>
      ))}

      {/* clock pediment */}
      <path d="M236 122 L300 88 L364 122 Z" fill={STONE} {...LINE} />
      <rect x={244} y={122} width={112} height={88} fill={STONE} {...LINE} />
      <path d="M252 196 q-10 -22 6 -44 M348 196 q10 -22 -6 -44" stroke={NAVY} strokeWidth={0.9} fill="none" />
      <circle cx={300} cy={160} r={26} fill="#FFFDF9" stroke={NAVY} strokeWidth={1.4} />
      <circle cx={300} cy={160} r={21} fill="none" stroke={NAVY} strokeWidth={0.5} />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={300 + Math.sin(a) * 17} y1={160 - Math.cos(a) * 17} x2={300 + Math.sin(a) * 20} y2={160 - Math.cos(a) * 20} stroke={NAVY} strokeWidth={1} />;
      })}
      <line x1={300} y1={160} x2={309} y2={170} stroke={NAVY_DEEP} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={300} y1={160} x2={293} y2={146} stroke={NAVY_DEEP} strokeWidth={1.1} strokeLinecap="round" />

      {/* cornice */}
      <rect x={66} y={210} width={468} height={14} fill={STONE} {...LINE} />
      <rect x={80} y={224} width={440} height={300} fill={STONE} {...LINE} />
      {dentils.map((x) => <rect key={x} x={x} y={228} width={6} height={6} fill={STONE_SHADE} stroke={NAVY} strokeWidth={0.5} />)}

      {/* pilasters */}
      {[80, 248, 336, 504].map((x) => <rect key={x} x={x} y={238} width={16} height={134} fill={STONE_SHADE} {...LINE} />)}
      {[110, 140].map((y) => <line key={y} x1={80} y1={y + 150} x2={96} y2={y + 150} stroke={NAVY} strokeWidth={0.5} />)}

      {/* first floor */}
      <Window x={118} y={252} />
      <Window x={268} y={252} />
      <Window x={418} y={252} />
      <Balcony x={110} y={318} w={80} />
      <Balcony x={260} y={318} w={80} />
      <Balcony x={410} y={318} w={80} />
      {/* name plaque with flowers */}
      <rect x={244} y={330} width={112} height={26} rx={3} fill={NAVY_DEEP} stroke="#FFFDF9" strokeWidth={1.2} />
      <text x={300} y={348} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize={13} fontWeight={600} letterSpacing={3.4} fill="#F7F3EC">{name}</text>
      {[236, 364].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={334} r={6} fill="#FFFDF9" stroke="#C8CFC2" strokeWidth={0.6} />
          <circle cx={cx + (cx < 300 ? 4 : -4)} cy={343} r={5} fill="#F7F3EC" stroke="#C8CFC2" strokeWidth={0.6} />
          <circle cx={cx} cy={350} r={3} fill="#7C8C6E" />
        </g>
      ))}

      {/* string course */}
      <rect x={72} y={372} width={456} height={8} fill={STONE_SHADE} {...LINE} />

      {/* ground floor: awnings over windows, navy door */}
      <rect x={104} y={412} width={132} height={100} fill="#2A3142" stroke={NAVY_DEEP} strokeWidth={1} />
      <rect x={364} y={412} width={132} height={100} fill="#2A3142" stroke={NAVY_DEEP} strokeWidth={1} />
      <circle cx={170} cy={440} r={10} fill="#E9C98A" opacity={0.35} />
      <circle cx={430} cy={440} r={10} fill="#E9C98A" opacity={0.35} />
      <Awning x={98} w={144} />
      <Awning x={358} w={144} />
      <rect x={252} y={384} width={96} height={140} fill={NAVY} stroke={NAVY_DEEP} strokeWidth={1.2} />
      <rect x={260} y={392} width={80} height={20} fill="none" stroke="#2B4482" strokeWidth={1} />
      <rect x={262} y={418} width={36} height={102} fill={NAVY} stroke="#2B4482" strokeWidth={1} />
      <rect x={268} y={426} width={24} height={36} fill="none" stroke="#2B4482" strokeWidth={0.9} />
      <rect x={268} y={470} width={24} height={40} fill="none" stroke="#2B4482" strokeWidth={0.9} />
      {/* open leaf: warm interior and a chandelier */}
      <rect x={300} y={418} width={38} height={102} fill="#1A2132" />
      <circle cx={319} cy={432} r={7} fill="#E9C98A" opacity={0.8} />
      <circle cx={319} cy={432} r={15} fill="#E9C98A" opacity={0.15} />
      {/* steps */}
      <rect x={244} y={524} width={112} height={6} fill={STONE_SHADE} {...LINE} />
      <rect x={236} y={530} width={128} height={6} fill={STONE_SHADE} {...LINE} />

      {/* topiaries */}
      {[128, 214, 386, 472].map((cx) => <Topiary key={cx} cx={cx} />)}

      {/* railing with brass finials */}
      <line x1={36} y1={532} x2={276} y2={532} stroke={NAVY_DEEP} strokeWidth={1.4} />
      <line x1={324} y1={532} x2={564} y2={532} stroke={NAVY_DEEP} strokeWidth={1.4} />
      <line x1={36} y1={552} x2={276} y2={552} stroke={NAVY_DEEP} strokeWidth={1.4} />
      <line x1={324} y1={552} x2={564} y2={552} stroke={NAVY_DEEP} strokeWidth={1.4} />
      {bars.map((x) => (
        <g key={x}>
          <line x1={x} y1={524} x2={x} y2={560} stroke={NAVY_DEEP} strokeWidth={1.2} />
          <path d={`M${x - 2.2} 525 L${x} 518 L${x + 2.2} 525 Z`} fill={BRASS} />
        </g>
      ))}
      <line x1={0} y1={559.5} x2={600} y2={559.5} stroke={NAVY_DEEP} strokeWidth={1} />
    </svg>
  );
}
