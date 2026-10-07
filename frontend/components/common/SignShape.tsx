import type { SignShape as SignShapeName } from "@/data/trafficSigns";

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
};

/* Everything is authored in a fixed 100×100 user space and scaled by the SVG
   itself, so one set of coordinates is correct at 48px in the catalogue and at
   64px on the quiz card. */
const VIEW = 100;
const CENTER = VIEW / 2;
/** Outermost radius the biggest shape may reach, leaving a 4px breathing gap. */
const OUTER = 46;

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

/**
 * A traffic sign drawn as inline SVG.
 *
 * The React Native version faked these with View borders and a rotated square
 * (components/SignShape.js) because the app had no react-native-svg. In a
 * browser the real geometry is both simpler and better: a crisp <circle>, a
 * computed octagon, and the same visual result at any size.
 *
 * No glyphs are drawn. The catalogue has no character/symbol field, and the RN
 * signs had none either — the name and meaning sit next to the shape in both
 * screens, so a sign with invented artwork would drift from the source rather
 * than improve on it.
 */
export default function SignShape({
  shape,
  color,
  size = 48,
  label,
  className = "",
}: SignShapeProps) {
  const shapeProps = label ? { role: "img" } : { "aria-hidden": true };

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

      {shape === "triangle" ? <polygon points={TRIANGLE_POINTS} fill={color} /> : null}

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
        <circle
          cx={CENTER}
          cy={CENTER}
          r={CIRCLE_RADIUS}
          fill="#FFFFFF"
          stroke={color}
          strokeWidth={CIRCLE_RING}
        />
      ) : null}
    </svg>
  );
}