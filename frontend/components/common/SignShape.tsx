import type { SignGlyph, SignShape as SignShapeName } from "@/data/trafficSigns";

type SignShapeProps = {
  shape: SignShapeName;
  /**
   * Raw hex from the sign catalogue, e.g. "#DC2626". Signs carry their own
   * colour because the catalogue is meant to look like the real thing.
   */
  color: string;
  /** Rendered pixel size. Defaults to 48, the RN component's default. */
  size?: number;
  /**
   * Supply to expose the sign to assistive tech (role="img" + <title>). Left
   * off, the SVG is aria-hidden — both screens already name the sign in text
   * right beside it, so an unlabelled copy would only be read twice.
   */
  label?: string;
  className?: string;
  /**
   * Pictogram drawn inside the plate. Original SVG artwork of the standard
   * Philippine sign designs (see data/trafficSigns.ts) — not copied images.
   */
  glyph?: SignGlyph;
  /** Red diagonal slash over the symbol (prohibition signs). */
  prohibited?: boolean;
  /** Solid filled disc (mandatory blue-circle signs). */
  solid?: boolean;
};

/* Everything is authored in a fixed 100×100 user space and scaled by the SVG
   itself, so one set of coordinates is correct at 48px in the catalogue and at
   64px on the quiz card. */
const VIEW = 100;
const CENTER = VIEW / 2;
/** Outermost radius the biggest shape may reach, leaving a 4px breathing gap. */
const OUTER = 46;

const INK_DARK = "#1A1A1A";
const INK_LIGHT = "#FFFFFF";
const SIGN_RED = "#DC2626";

/** 2dp — enough precision for the octagon, short enough to keep the DOM tidy. */
function round(value: number): string {
  return value.toFixed(2);
}

/**
 * Points of a regular octagon, one vertex every 45°, starting at 22.5°.
 *
 * The half-step offset is what puts the flat edges at the top and bottom (the
 * sin term is negated because SVG's y axis runs down), which is the
 * orientation a real stop sign is drawn in.
 */
function octagonPoints(radius: number): string {
  const points: string[] = [];

  for (let i = 0; i < 8; i += 1) {
    const angle = ((22.5 + i * 45) * Math.PI) / 180;
    points.push(
      `${round(CENTER + radius * Math.cos(angle))},${round(CENTER - radius * Math.sin(angle))}`
    );
  }

  return points.join(" ");
}

/* An upright triangle as wide as the box allows and 0.85 as tall — the exact
   proportion the RN component drew with its border triangles. */
const TRIANGLE_WIDTH = 92;
const TRIANGLE_HEIGHT = TRIANGLE_WIDTH * 0.85;
const TRIANGLE_TOP = CENTER - TRIANGLE_HEIGHT / 2;
const TRIANGLE_POINTS = [
  `${CENTER},${round(TRIANGLE_TOP)}`,
  `${round(CENTER - TRIANGLE_WIDTH / 2)},${round(CENTER + TRIANGLE_HEIGHT / 2)}`,
  `${round(CENTER + TRIANGLE_WIDTH / 2)},${round(CENTER + TRIANGLE_HEIGHT / 2)}`,
].join(" ");

/* Inverted triangle for Yield: red border, white field, red legend. */
const YIELD_POINTS = [`8,16`, `92,16`, `${CENTER},92`].join(" ");

/* Rectangle: the RN component's size × size × 0.65 box. */
const RECT_WIDTH = 92;
const RECT_HEIGHT = RECT_WIDTH * 0.65;

/* Circle: a prohibition sign — red ring, white field.
   An SVG stroke is centred on its path, so `r` is the middle of the ring and
   strokeWidth is its thickness. The RN component drew a size × 0.8 box with a
   size × 0.12 border, i.e. an inner/outer radius ratio of 0.7 — reproduced
   here by r = OUTER × 0.85 and a stroke twice the gap between them. */
const CIRCLE_OUTER = OUTER;
const CIRCLE_RADIUS = CIRCLE_OUTER * 0.85;
const CIRCLE_RING = (CIRCLE_OUTER - CIRCLE_RADIUS) * 2;

/* Octagon: solid red plate with a white ring inset, the way a stop sign is
   actually painted. */
const OCTAGON_POINTS = octagonPoints(OUTER);
const OCTAGON_RING_POINTS = octagonPoints(OUTER * 0.78);

const GLYPH_FONT = "Arial, Helvetica, sans-serif";

/** Walking figure, drawn around the 100-space centre. Place with a transform. */
function PersonMark({ ink }: { ink: string }) {
  return (
    <g stroke={ink} strokeWidth={5.5} strokeLinecap="round" fill="none">
      <circle cx={CENTER} cy={30} r={6} fill={ink} stroke="none" />
      <path d="M50 39 V59 M50 46 L39 54 M50 46 L61 51 M50 59 L43 75 M50 59 L57 75" />
    </g>
  );
}

/** Simple side-view car, drawn around the 100-space centre. */
function CarMark({ ink }: { ink: string }) {
  return (
    <g fill={ink}>
      <path d="M28 58 L30 48 Q30 45 33 45 L41 45 L47 36 Q48 34 50 34 L60 34 Q62 34 63 36 L68 45 L72 45 Q74 45 74 48 L74 58 Z" />
      <circle cx={38} cy={60} r={5.5} />
      <circle cx={64} cy={60} r={5.5} />
    </g>
  );
}

/** Bicycle, drawn around the 100-space centre. Place with a transform. */
function BikeMark({ ink }: { ink: string }) {
  return (
    <g stroke={ink} strokeWidth={4.5} fill="none" strokeLinecap="round">
      <circle cx={35} cy={63} r={9} />
      <circle cx={65} cy={63} r={9} />
      <path d="M35 63 L47 45 H59 M47 45 L43 63 M59 45 L65 63 M47 45 L52 38 M59 45 L63 38" strokeWidth={4} />
    </g>
  );
}

/** Straight arrow pointing right from the origin. Rotate for other headings. */
function BaseArrow({ ink }: { ink: string }) {
  return (
    <g fill={ink}>
      <rect x={-24} y={-4.5} width={38} height={9} rx={2} />
      <polygon points="14,-13 32,0 14,13" />
    </g>
  );
}

function RotatedArrow({ ink, degrees }: { ink: string; degrees: number }) {
  return (
    <g transform={`translate(${CENTER} ${CENTER}) rotate(${degrees})`}>
      <BaseArrow ink={ink} />
    </g>
  );
}

function GlyphText({
  x = CENTER,
  y = CENTER,
  size,
  fill,
  letterSpacing = 0,
  children,
}: {
  x?: number;
  y?: number;
  size: number;
  fill: string;
  letterSpacing?: number;
  children: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={GLYPH_FONT}
      fontWeight="bold"
      fontSize={size}
      letterSpacing={letterSpacing}
      fill={fill}
    >
      {children}
    </text>
  );
}

/**
 * The pictogram for one catalogue glyph. `ink` is the symbol colour the plate
 * calls for (white on blue plates, near-black everywhere else); a few legends
 * carry their own fixed colour.
 */
function Glyph({ glyph, ink }: { glyph: SignGlyph; ink: string }) {
  switch (glyph) {
    case "stop-text":
      return <GlyphText y={52} size={19} fill={INK_LIGHT} letterSpacing={2}>STOP</GlyphText>;
    case "yield-text":
      return <GlyphText y={56} size={15.5} fill={SIGN_RED} letterSpacing={1}>YIELD</GlyphText>;
    case "bar":
      return <rect x={26} y={44} width={48} height={12} rx={2} fill={INK_LIGHT} />;
    case "letter-p":
      return <GlyphText y={52} size={46} fill={ink}>P</GlyphText>;
    case "letter-h":
      return <GlyphText y={52} size={46} fill={ink}>H</GlyphText>;
    case "speed-100":
      return <GlyphText y={52} size={27} fill={ink}>100</GlyphText>;
    case "dim-width":
      return <GlyphText y={52} size={21} fill={ink}>2.4m</GlyphText>;
    case "dim-height":
      return <GlyphText y={52} size={21} fill={ink}>3.5m</GlyphText>;
    case "dim-load":
      return <GlyphText y={52} size={27} fill={ink}>5T</GlyphText>;
    case "arrow-up":
      return <RotatedArrow ink={ink} degrees={-90} />;
    case "arrow-left":
      return <RotatedArrow ink={ink} degrees={180} />;
    case "arrow-right":
      return <RotatedArrow ink={ink} degrees={0} />;
    case "w-arrow-left":
      return <RotatedArrow ink={ink} degrees={180} />;
    case "w-arrow-right":
      return <RotatedArrow ink={ink} degrees={0} />;
    case "w-keep-left":
      return <RotatedArrow ink={ink} degrees={135} />;
    case "w-keep-right":
      return <RotatedArrow ink={ink} degrees={45} />;
    case "w-pass-either":
      return (
        <g stroke={ink} strokeWidth={8} strokeLinecap="round" fill="none">
          <path d="M40 30 L30 62" />
          <path d="M60 30 L70 62" />
          <polygon points="22,54 38,54 30,70" fill={ink} stroke="none" />
          <polygon points="62,54 78,54 70,70" fill={ink} stroke="none" />
        </g>
      );
    case "u-turn":
      return (
        <g>
          <path d="M20 40 V52 A16 16 0 0 0 52 52" stroke={ink} strokeWidth={9} fill="none" strokeLinecap="round" />
          <polygon points="10,26 30,26 20,42" fill={ink} />
        </g>
      );
    case "curve":
      return (
        <g>
          <path d="M38 76 C38 58 42 52 56 46 C68 41 70 34 70 22" stroke={ink} strokeWidth={9} fill="none" strokeLinecap="round" />
          <polygon points="61,34 79,34 70,18" fill={ink} />
        </g>
      );
    case "bend-left":
      return (
        <g>
          <path d="M62 76 V50 H40" stroke={ink} strokeWidth={8} fill="none" strokeLinecap="round" />
          <polygon points="50,41 50,59 32,50" fill={ink} />
        </g>
      );
    case "bend-right":
      return (
        <g>
          <path d="M38 76 V50 H60" stroke={ink} strokeWidth={8} fill="none" strokeLinecap="round" />
          <polygon points="50,41 50,59 68,50" fill={ink} />
        </g>
      );
    case "merge":
      return (
        <g stroke={ink} strokeLinecap="round" fill="none">
          <path d="M40 76 V34" strokeWidth={8} />
          <path d="M64 76 C64 62 58 54 50 48" strokeWidth={7} />
          <polygon points="32,44 48,44 40,28" fill={ink} stroke="none" />
        </g>
      );
    case "two-cars":
      return (
        <g>
          <rect x={24} y={48} width={25} height={12} rx={3} fill={ink} />
          <rect x={29} y={41} width={15} height={8} rx={1.5} fill={ink} />
          <circle cx={31} cy={62} r={4} fill={ink} />
          <circle cx={43} cy={62} r={4} fill={ink} />
          <rect x={53} y={42} width={25} height={12} rx={3} fill={SIGN_RED} />
          <rect x={58} y={35} width={15} height={8} rx={1.5} fill={SIGN_RED} />
          <circle cx={60} cy={56} r={4} fill={SIGN_RED} />
          <circle cx={72} cy={56} r={4} fill={SIGN_RED} />
        </g>
      );
    case "car":
      return <CarMark ink={ink} />;
    case "bike":
      return <BikeMark ink={ink} />;
    case "cycle-lane":
      return (
        <g>
          <g transform={`translate(38 52) scale(0.66) translate(-50 -50)`}>
            <BikeMark ink={ink} />
          </g>
          <line x1={78} y1={28} x2={78} y2={72} stroke={ink} strokeWidth={5} strokeLinecap="round" />
        </g>
      );
    case "pedestrian":
      return <PersonMark ink={ink} />;
    case "school":
      return (
        <g>
          <g transform="translate(38 50) scale(0.62) translate(-50 -50)">
            <PersonMark ink={ink} />
          </g>
          <g transform="translate(66 56) scale(0.44) translate(-50 -50)">
            <PersonMark ink={ink} />
          </g>
        </g>
      );
    case "horn":
      return (
        <g>
          <polygon points="34,44 56,34 56,62 34,52" fill={ink} />
          <rect x={27} y={42} width={7} height={12} rx={2} fill={ink} />
          <path d="M62 38 q6 12 0 24" stroke={ink} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M68 34 q9 16 0 32" stroke={ink} strokeWidth={4} fill="none" strokeLinecap="round" />
        </g>
      );
    case "phone":
      return (
        <g stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round">
          <rect x={41} y={28} width={18} height={44} rx={5} />
          <line x1={46} y1={35} x2={54} y2={35} strokeWidth={4} />
          <circle cx={50} cy={64} r={2.5} fill={ink} stroke="none" />
        </g>
      );
    case "cigarette":
      return (
        <g>
          <rect x={28} y={45} width={30} height={10} rx={1.5} fill="none" stroke={ink} strokeWidth={4} />
          <rect x={58} y={45} width={12} height={10} rx={1.5} fill={ink} />
          <path d="M36 37 q3 -4 0 -8 M46 37 q-3 -4 0 -8" stroke={ink} strokeWidth={3} fill="none" strokeLinecap="round" />
        </g>
      );
    case "pump":
      return (
        <g stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round">
          <rect x={38} y={36} width={24} height={34} rx={3} />
          <rect x={44} y={42} width={12} height={10} strokeWidth={4} />
          <line x1={32} y1={74} x2={68} y2={74} />
          <path d="M62 50 q10 4 8 16" strokeWidth={4} />
        </g>
      );
    case "handset":
      return (
        <g stroke={ink} strokeWidth={10} fill="none" strokeLinecap="round">
          <path d="M30 62 C30 42 40 30 50 30 C60 30 70 42 70 62" />
          <circle cx={30} cy={62} r={6} fill={ink} stroke="none" />
          <circle cx={70} cy={62} r={6} fill={ink} stroke="none" />
        </g>
      );
    case "lights":
      return (
        <g>
          <rect x={39} y={22} width={22} height={50} rx={9} fill={INK_DARK} />
          <circle cx={50} cy={33} r={5.5} fill="#EF4444" />
          <circle cx={50} cy={47} r={5.5} fill="#FACC15" />
          <circle cx={50} cy={61} r={5.5} fill="#22C55E" />
        </g>
      );
    case "roundabout":
      return (
        <g>
          <circle cx={50} cy={52} r={19} stroke={ink} strokeWidth={8} fill="none" />
          <polygon points="41,35 59,35 50,21" fill={ink} />
        </g>
      );
    case "narrow":
      return (
        <g stroke={ink} strokeWidth={7} strokeLinecap="round">
          <path d="M40 26 L45 74" />
          <path d="M60 26 L55 74" />
        </g>
      );
    case "hump":
      return (
        <g stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round">
          <path d="M26 66 H74" />
          <path d="M34 66 Q50 42 66 66" />
        </g>
      );
    case "cross":
      return (
        <g fill={ink}>
          <rect x={45} y={26} width={10} height={48} rx={2} />
          <rect x={26} y={45} width={48} height={10} rx={2} />
        </g>
      );
    case "t-junction":
      return (
        <g stroke={ink} strokeWidth={8} strokeLinecap="round">
          <path d="M50 76 V46" />
          <path d="M32 46 H68" />
        </g>
      );
    case "side-right":
      return (
        <g stroke={ink} strokeWidth={7} strokeLinecap="round">
          <path d="M42 26 V74" />
          <path d="M42 50 H62" />
        </g>
      );
    case "side-left":
      return (
        <g stroke={ink} strokeWidth={7} strokeLinecap="round">
          <path d="M58 26 V74" />
          <path d="M58 50 H38" />
        </g>
      );
    case "slope-down":
      return <polygon points="28,36 72,52 72,62 28,62" fill={ink} />;
    case "slope-up":
      return <polygon points="28,52 72,36 72,62 28,62" fill={ink} />;
    case "rails":
      return (
        <g stroke={ink} strokeLinecap="round">
          <path d="M42 28 V72 M58 28 V72" strokeWidth={6} />
          <path d="M35 40 H65 M35 52 H65 M35 64 H65" strokeWidth={5} />
        </g>
      );
    case "bridge":
      return (
        <g stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round">
          <path d="M26 62 H74" />
          <path d="M32 62 Q50 36 68 62" />
          <path d="M42 62 V52 M58 62 V52" strokeWidth={4} />
        </g>
      );
    case "rocks":
      return (
        <g fill={ink}>
          <polygon points="30,72 62,72 50,44" />
          <circle cx={64} cy={32} r={4} />
          <circle cx={72} cy={43} r={4} />
          <circle cx={56} cy={40} r={3} />
        </g>
      );
    case "barricade":
      return (
        <g>
          <path d="M40 58 V76 M60 58 V76" stroke={ink} strokeWidth={5} strokeLinecap="round" />
          <rect x={28} y={40} width={44} height={16} rx={2} fill={ink} />
          <path d="M38 56 L46 40 M48 56 L56 40 M58 56 L66 40" stroke={INK_LIGHT} strokeWidth={4} />
        </g>
      );
    case "skid":
      return (
        <g stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round">
          <path d="M40 26 q-8 12 0 24 q8 12 0 24" />
          <path d="M60 26 q-8 12 0 24 q8 12 0 24" />
        </g>
      );
    case "rest":
      return (
        <g>
          <GlyphText y={42} size={12.5} fill={ink} letterSpacing={1}>REST AREA</GlyphText>
          <g transform={`translate(${CENTER} 68) rotate(0)`}>
            <g transform="scale(0.55)">
              <BaseArrow ink={ink} />
            </g>
          </g>
        </g>
      );
    case "police":
      return <GlyphText y={52} size={15.5} fill={ink} letterSpacing={1}>POLICE</GlyphText>;
    case "train":
      return (
        <g stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round">
          <rect x={35} y={38} width={30} height={28} rx={5} />
          <line x1={35} y1={48} x2={65} y2={48} strokeWidth={4} />
          <path d="M45 38 V30 M55 38 V30 M38 30 H62" strokeWidth={4} />
          <circle cx={43} cy={70} r={4} fill={ink} stroke="none" />
          <circle cx={57} cy={70} r={4} fill={ink} stroke="none" />
        </g>
      );
    case "utensils":
      return (
        <g stroke={ink} strokeLinecap="round" fill="none">
          <path d="M36 34 V44 M42 32 V44 M48 34 V44" strokeWidth={4} />
          <path d="M36 44 Q42 50 48 44" strokeWidth={4} />
          <path d="M42 50 V72" strokeWidth={5} />
          <polygon points="58,32 64,32 62,54 58,54" fill={ink} stroke="none" />
          <path d="M60 54 V72" strokeWidth={5} />
        </g>
      );
    case "plane":
      return (
        <polygon
          points="50,24 54,38 76,46 76,50 54,44 53,52 61,58 61,62 50,57 39,62 39,58 47,52 46,44 24,50 24,46 46,38"
          fill={ink}
        />
      );
    case "anchor":
      return (
        <g stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round">
          <circle cx={50} cy={30} r={5.5} />
          <path d="M50 36 V68" />
          <path d="M40 44 H60" />
          <path d="M30 56 Q30 70 50 70 Q70 70 70 56" />
        </g>
      );
    case "med-star":
      return (
        <g fill={ink}>
          <rect x={44} y={26} width={12} height={48} />
          <rect x={44} y={26} width={12} height={48} transform={`rotate(60 ${CENTER} ${CENTER})`} />
          <rect x={44} y={26} width={12} height={48} transform={`rotate(120 ${CENTER} ${CENTER})`} />
        </g>
      );
    case "bus":
      return (
        <g stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round">
          <rect x={33} y={36} width={34} height={30} rx={5} />
          <line x1={33} y1={47} x2={67} y2={47} strokeWidth={4} />
          <circle cx={41} cy={59} r={2.5} fill={ink} stroke="none" />
          <circle cx={59} cy={59} r={2.5} fill={ink} stroke="none" />
        </g>
      );
    case "park-ride":
      return (
        <g>
          <GlyphText y={42} size={15} fill={ink} letterSpacing={1}>PARK</GlyphText>
          <GlyphText y={60} size={11} fill={ink} letterSpacing={1}>&amp; RIDE</GlyphText>
        </g>
      );
    case "area-closed":
      return (
        <g>
          <rect x={26} y={30} width={48} height={40} rx={2} fill="none" stroke={INK_DARK} strokeWidth={4} />
          <GlyphText y={47} size={12.5} fill={INK_DARK} letterSpacing={1}>AREA</GlyphText>
          <GlyphText y={61} size={11} fill={INK_DARK} letterSpacing={1}>CLOSED</GlyphText>
        </g>
      );
  }
}

/**
 * A traffic sign drawn as inline SVG.
 *
 * The React Native version faked these with View borders and a rotated square
 * (components/SignShape.js) because the app had no react-native-svg. In a
 * browser the real geometry is both simpler and better: a crisp <circle>, a
 * computed octagon, and the same visual result at any size.
 *
 * Plates follow real-world construction: warning triangles carry a red border
 * with an amber field and a dark symbol; prohibition circles a red ring with a
 * white field and a dark symbol plus the diagonal slash; mandatory circles a
 * solid blue disc with a white symbol; informative rectangles a solid plate
 * with a light symbol. `glyph` selects the pictogram; symbols are original
 * vector artwork of the standard designs, not copied images.
 */
export default function SignShape({
  shape,
  color,
  size = 48,
  label,
  className = "",
  glyph,
  prohibited = false,
  solid = false,
}: SignShapeProps) {
  const shapeProps = label ? { role: "img" } : { "aria-hidden": true };
  // White symbols on filled plates, near-black everywhere else.
  const ink = solid || shape === "rectangle" || shape === "octagon" ? INK_LIGHT : INK_DARK;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      focusable="false"
      {...shapeProps}
    >
      {label ? <title>{label}</title> : null}

      {shape === "triangle" ? (
        <>
          <polygon points={TRIANGLE_POINTS} fill={SIGN_RED} />
          <g transform={`translate(${CENTER} ${CENTER}) scale(0.7) translate(${-CENTER} ${-CENTER})`}>
            <polygon points={TRIANGLE_POINTS} fill={color} />
          </g>
        </>
      ) : null}

      {shape === "inverted-triangle" ? (
        <>
          <polygon points={YIELD_POINTS} fill={SIGN_RED} />
          <g transform={`translate(${CENTER} 54) scale(0.68) translate(${-CENTER} -54)`}>
            <polygon points={YIELD_POINTS} fill={INK_LIGHT} />
          </g>
        </>
      ) : null}

      {shape === "octagon" ? (
        <>
          <polygon points={OCTAGON_POINTS} fill={color} />
          {/* strokeWidth is split across the edge so the ring sits fully inside
              the plate instead of eating into it. */}
          <polygon
            points={OCTAGON_RING_POINTS}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={OUTER * 0.14}
            strokeLinejoin="round"
          />
        </>
      ) : null}

      {shape === "rectangle" ? (
        <rect
          x={CENTER - RECT_WIDTH / 2}
          y={CENTER - RECT_HEIGHT / 2}
          width={RECT_WIDTH}
          height={RECT_HEIGHT}
          rx="8"
          fill={color}
        />
      ) : null}

      {shape === "circle" ? (
        solid ? (
          <circle cx={CENTER} cy={CENTER} r={CIRCLE_OUTER} fill={color} />
        ) : (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={CIRCLE_RADIUS}
            fill="#FFFFFF"
            stroke={color}
            strokeWidth={CIRCLE_RING}
          />
        )
      ) : null}

      {glyph ? <Glyph glyph={glyph} ink={ink} /> : null}

      {prohibited && shape === "circle" && !solid ? (
        <line
          x1={28}
          y1={28}
          x2={72}
          y2={72}
          stroke={SIGN_RED}
          strokeWidth={7.5}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
