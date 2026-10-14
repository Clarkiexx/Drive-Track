// Reference data for the Learning Center + Quiz. Kept simple and
// local (no backend) per the spec — this is an educational feature
// independent of citation management.
//
// Originally ported from driver-app/src/data/trafficSigns.js (13 signs with
// bare shape plates). Extended with the standard Philippine sign set — names
// follow the official PH traffic-sign chart so drivers can match what they
// see on the road. Pictograms are original SVG artwork drawn in
// components/common/SignShape.tsx (see the `glyph` field), not copied images.
//
// Meanings are concise standard driving-knowledge definitions. They are NOT
// CTMO policy — have them cross-checked against the LTO driver's manual
// before treating them as authoritative.
//
// Nothing here talks to the API: the catalogue ships with the bundle, so the
// Learning Center and the Quiz work with no network at all. The `color` field
// is deliberately kept as a raw hex — a traffic-sign catalogue is only useful
// if the signs look like the real thing, so this is data, not styling, and
// must not be folded into a palette token.

/** Shape geometry the catalogue can draw. Must match every `shape` below. */
export const SIGN_SHAPES = ["octagon", "circle", "triangle", "rectangle", "inverted-triangle"] as const;
export type SignShape = (typeof SIGN_SHAPES)[number];

/** Pictogram drawn inside the plate. Implemented in SignShape.tsx. */
export type SignGlyph =
  | "stop-text"
  | "yield-text"
  | "bar"
  | "letter-p"
  | "letter-h"
  | "speed-100"
  | "arrow-up"
  | "arrow-left"
  | "arrow-right"
  | "u-turn"
  | "two-cars"
  | "horn"
  | "pedestrian"
  | "school"
  | "car"
  | "bike"
  | "phone"
  | "cigarette"
  | "pump"
  | "dim-width"
  | "dim-height"
  | "dim-load"
  | "w-arrow-left"
  | "w-arrow-right"
  | "w-keep-left"
  | "w-keep-right"
  | "w-pass-either"
  | "lights"
  | "roundabout"
  | "narrow"
  | "hump"
  | "cross"
  | "t-junction"
  | "side-right"
  | "side-left"
  | "bend-left"
  | "bend-right"
  | "slope-down"
  | "slope-up"
  | "merge"
  | "rails"
  | "bridge"
  | "rocks"
  | "barricade"
  | "handset"
  | "rest"
  | "police"
  | "train"
  | "utensils"
  | "plane"
  | "anchor"
  | "med-star"
  | "bus"
  | "park-ride"
  | "area-closed"
  | "skid"
  | "curve"
  | "cycle-lane";

/** Groups the Learning Center filter chips are built from. */
export const SIGN_CATEGORIES = ["Regulatory", "Warning", "Informational"] as const;
export type SignCategory = (typeof SIGN_CATEGORIES)[number];

export interface TrafficSign {
  id: string;
  category: SignCategory;
  shape: SignShape;
  /** Raw hex, straight from the RN catalogue — see the note at the top. */
  color: string;
  name: string;
  meaning: string;
  /** Pictogram drawn inside the plate (see SignShape.tsx). */
  glyph: SignGlyph;
  /** Red diagonal slash over the symbol (prohibition signs). */
  prohibited?: boolean;
  /** Solid filled disc (mandatory blue-circle signs). */
  solid?: boolean;
}

export interface QuizQuestion {
  id: string;
  /** Points at a TrafficSign.id — the sign shown above the question. */
  signId: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export const trafficSigns: TrafficSign[] = [
  // --- Regulatory signs: red/white, tell drivers what they MUST or MUST NOT do ---
  {
    id: "stop",
    category: "Regulatory",
    shape: "octagon",
    color: "#DC2626",
    name: "Stop",
    meaning: "Come to a complete stop and yield to all traffic before proceeding.",
    glyph: "stop-text",
  },
  {
    id: "yield",
    category: "Regulatory",
    shape: "inverted-triangle",
    color: "#DC2626",
    name: "Yield",
    meaning: "Slow down and give way to traffic on the intersecting road; proceed only when safe.",
    glyph: "yield-text",
  },
  {
    id: "no-entry",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "No Entry",
    meaning: "Entry is prohibited for all vehicles in this direction.",
    glyph: "bar",
  },
  {
    id: "no-entry-all-types",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "No Entry for All Types of Vehicle",
    meaning: "No vehicle of any type may enter; the road is closed to all traffic in this direction.",
    glyph: "arrow-up",
    prohibited: true,
  },
  {
    id: "no-parking",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "No Parking",
    meaning: "Parking is not allowed in this area at any time unless otherwise indicated.",
    glyph: "letter-p",
    prohibited: true,
  },
  {
    id: "no-left-turn",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "No Left Turn",
    meaning: "Left turns are prohibited at this intersection.",
    glyph: "arrow-left",
    prohibited: true,
  },
  {
    id: "no-right-turn",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "No Right Turn",
    meaning: "Right turns are prohibited at this intersection.",
    glyph: "arrow-right",
    prohibited: true,
  },
  {
    id: "no-u-turn",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "No U Turn",
    meaning: "U-turns are prohibited here.",
    glyph: "u-turn",
    prohibited: true,
  },
  {
    id: "no-overtaking",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "No Overtaking",
    meaning: "Overtaking other vehicles is prohibited on this stretch of road.",
    glyph: "two-cars",
    prohibited: true,
  },
  {
    id: "no-horn",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "No Blowing of Horn",
    meaning: "Do not sound your horn in this zone, usually near hospitals, schools, or churches.",
    glyph: "horn",
    prohibited: true,
  },
  {
    id: "pedestrian-prohibited",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "Pedestrian Prohibited",
    meaning: "Pedestrians are not allowed beyond this point; use the designated walkway instead.",
    glyph: "pedestrian",
    prohibited: true,
  },
  {
    id: "no-smoking",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "No Smoking",
    meaning: "Smoking is prohibited in this area.",
    glyph: "cigarette",
    prohibited: true,
  },
  {
    id: "cellphone-prohibited",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "Cellphone Prohibited",
    meaning: "Using a mobile phone while driving is prohibited here.",
    glyph: "phone",
    prohibited: true,
  },
  {
    id: "cycle-prohibited",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "Cycle Prohibited",
    meaning: "Bicycles are not allowed on this road.",
    glyph: "bike",
    prohibited: true,
  },
  {
    id: "no-car",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "No Car",
    meaning: "Cars and similar motor vehicles are not allowed beyond this point.",
    glyph: "car",
    prohibited: true,
  },
  {
    id: "speed-limit",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "Speed Limit",
    meaning: "Indicates the maximum legal speed, in km/h, permitted on this road.",
    glyph: "speed-100",
  },
  {
    id: "width-limit",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "Width Limit",
    meaning: "Vehicles wider than 2.4 meters may not pass.",
    glyph: "dim-width",
  },
  {
    id: "height-limit",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "Height Limit",
    meaning: "Vehicles taller than 3.5 meters may not pass under the structure ahead.",
    glyph: "dim-height",
  },
  {
    id: "load-limit",
    category: "Regulatory",
    shape: "circle",
    color: "#DC2626",
    name: "Load Limit",
    meaning: "Vehicles with a gross load above 5 tons may not use this road or bridge.",
    glyph: "dim-load",
  },
  {
    id: "turn-left",
    category: "Regulatory",
    shape: "circle",
    color: "#2563EB",
    name: "Turn Left",
    meaning: "You must turn left here; going straight or turning right is not allowed.",
    glyph: "w-arrow-left",
    solid: true,
  },
  {
    id: "turn-right",
    category: "Regulatory",
    shape: "circle",
    color: "#2563EB",
    name: "Turn Right",
    meaning: "You must turn right here; going straight or turning left is not allowed.",
    glyph: "w-arrow-right",
    solid: true,
  },
  {
    id: "pass-either",
    category: "Regulatory",
    shape: "circle",
    color: "#2563EB",
    name: "Pass Either",
    meaning: "You may pass the obstruction on either the left or the right side.",
    glyph: "w-pass-either",
    solid: true,
  },
  {
    id: "keep-left",
    category: "Regulatory",
    shape: "circle",
    color: "#2563EB",
    name: "Keep Left",
    meaning: "Keep to the left of the obstruction or traffic island.",
    glyph: "w-keep-left",
    solid: true,
  },
  {
    id: "keep-right",
    category: "Regulatory",
    shape: "circle",
    color: "#2563EB",
    name: "Keep Right",
    meaning: "Keep to the right of the obstruction or traffic island.",
    glyph: "w-keep-right",
    solid: true,
  },
  {
    id: "one-way",
    category: "Regulatory",
    shape: "rectangle",
    color: "#2563EB",
    name: "One Way",
    meaning: "Traffic on this road moves in one direction only, shown by the arrow.",
    glyph: "arrow-right",
  },

  // --- Warning signs: yellow/black, alert drivers to hazards ahead ---
  {
    id: "traffic-lights",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Traffic Lights",
    meaning: "Traffic signals are installed ahead; be prepared to stop.",
    glyph: "lights",
  },
  {
    id: "curve-ahead",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Curve Ahead",
    meaning: "The road ahead curves in the direction shown — reduce speed accordingly.",
    glyph: "curve",
  },
  {
    id: "left-bend",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Left Bend",
    meaning: "The road bends sharply to the left ahead; slow down before the bend.",
    glyph: "bend-left",
  },
  {
    id: "right-bend",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Right Bend",
    meaning: "The road bends sharply to the right ahead; slow down before the bend.",
    glyph: "bend-right",
  },
  {
    id: "roundabout",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Round About",
    meaning: "A roundabout is ahead; slow down and give way to traffic already inside the circle.",
    glyph: "roundabout",
  },
  {
    id: "narrow-road",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Narrow Road",
    meaning: "The road narrows ahead; slow down and watch for oncoming traffic.",
    glyph: "narrow",
  },
  {
    id: "road-right",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Road Right",
    meaning: "A side road joins from the right ahead; watch for entering traffic.",
    glyph: "side-right",
  },
  {
    id: "road-left",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Road Left",
    meaning: "A side road joins from the left ahead; watch for entering traffic.",
    glyph: "side-left",
  },
  {
    id: "cross-road",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Cross Road",
    meaning: "Another road crosses yours ahead; slow down and check both sides.",
    glyph: "cross",
  },
  {
    id: "t-junction",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "T Junction",
    meaning: "The road ends at a T-junction ahead; prepare to turn left or right.",
    glyph: "t-junction",
  },
  {
    id: "steep-descent",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Steep Descent",
    meaning: "A steep downhill stretch is ahead; shift to a lower gear and control your speed.",
    glyph: "slope-down",
  },
  {
    id: "steep-ascent",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Steep Ascent",
    meaning: "A steep uphill stretch is ahead; keep momentum and use a lower gear.",
    glyph: "slope-up",
  },
  {
    id: "line-merge-ahead",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Line Merge Ahead",
    meaning: "Two lanes merge into one ahead; adjust your speed and merge safely.",
    glyph: "merge",
  },
  {
    id: "hump-ahead",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Hump Ahead",
    meaning: "A road hump is ahead; slow down to cross it safely.",
    glyph: "hump",
  },
  {
    id: "rail-road",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Rail Road",
    meaning: "A railway crossing is ahead; slow down, look, and listen for trains.",
    glyph: "rails",
  },
  {
    id: "bridge-road",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Bridge Road Sign",
    meaning: "A narrow bridge is ahead; slow down and be ready to give way.",
    glyph: "bridge",
  },
  {
    id: "falling-rocks",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Falling Rocks",
    meaning: "Falling rocks are possible in this area; keep moving and stay alert.",
    glyph: "rocks",
  },
  {
    id: "road-work",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Road Work",
    meaning: "Road works are in progress ahead; slow down and follow the crew's directions.",
    glyph: "barricade",
  },
  {
    id: "pedestrian-crossing",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Pedestrian Crossing",
    meaning: "A pedestrian crossing is ahead. Slow down and watch for people crossing.",
    glyph: "pedestrian",
  },
  {
    id: "school-zone",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "School Zone",
    meaning: "You are approaching a school zone — reduce speed and watch for children.",
    glyph: "school",
  },
  {
    id: "cycle-crossing",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Cycle Crossing",
    meaning: "Cyclists cross here; slow down and watch for bicycles.",
    glyph: "bike",
  },
  {
    id: "slippery-road",
    category: "Warning",
    shape: "triangle",
    color: "#F59E0B",
    name: "Slippery Road",
    meaning: "The road surface may be slippery, especially when wet. Reduce speed.",
    glyph: "skid",
  },

  // --- Informational signs: blue/green, guide rather than command ---
  {
    id: "hospital",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Hospital",
    meaning: "Indicates the direction of the nearest hospital.",
    glyph: "letter-h",
  },
  {
    id: "parking-area",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Parking Area",
    meaning: "Indicates a designated area where parking is permitted.",
    glyph: "letter-p",
  },
  {
    id: "gas-station",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Gas Station",
    meaning: "Indicates the direction of the nearest fuel station.",
    glyph: "pump",
  },
  {
    id: "telephone",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Telephone",
    meaning: "A public telephone is available nearby.",
    glyph: "handset",
  },
  {
    id: "rest-area",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Rest Area",
    meaning: "A rest area is ahead in the direction shown.",
    glyph: "rest",
  },
  {
    id: "police",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Police",
    meaning: "A police station or police assistance post is nearby.",
    glyph: "police",
  },
  {
    id: "train-station",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Train Station",
    meaning: "A train station is in the direction shown.",
    glyph: "train",
  },
  {
    id: "restaurant",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Restaurant",
    meaning: "Food and refreshments are available nearby.",
    glyph: "utensils",
  },
  {
    id: "airport",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Airport",
    meaning: "An airport is in the direction shown.",
    glyph: "plane",
  },
  {
    id: "cycle-lane",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Cycle Lane",
    meaning: "This lane is reserved for bicycles.",
    glyph: "cycle-lane",
  },
  {
    id: "area-closed",
    category: "Informational",
    shape: "rectangle",
    color: "#FFFFFF",
    name: "Area Closed",
    meaning: "The area beyond this sign is closed to traffic.",
    glyph: "area-closed",
  },
  {
    id: "bus-station",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Bus Station",
    meaning: "A bus station or terminal is nearby.",
    glyph: "bus",
  },
  {
    id: "park-ride",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Park & Ride",
    meaning: "Park your vehicle here and continue your trip by public transport.",
    glyph: "park-ride",
  },
  {
    id: "marina",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Marina",
    meaning: "A marina or port area is nearby.",
    glyph: "anchor",
  },
  {
    id: "medical",
    category: "Informational",
    shape: "rectangle",
    color: "#2563EB",
    name: "Medical",
    meaning: "Medical assistance is available nearby.",
    glyph: "med-star",
  },
];

export const quizQuestions: QuizQuestion[] = [
  {
    id: "q1",
    signId: "stop",
    question: "What should you do when you see this sign?",
    options: ["Slow down only", "Come to a complete stop", "Honk and proceed", "Yield only if traffic is present"],
    correctIndex: 1,
  },
  {
    id: "q2",
    signId: "no-entry",
    question: "A red circular sign with a white bar means:",
    options: ["Speed limit ends", "No parking", "No entry for vehicles", "One way street"],
    correctIndex: 2,
  },
  {
    id: "q3",
    signId: "pedestrian-crossing",
    question: "A yellow triangular sign showing a person walking indicates:",
    options: ["Hospital nearby", "Pedestrian crossing ahead", "School zone", "No pedestrians allowed"],
    correctIndex: 1,
  },
  {
    id: "q4",
    signId: "school-zone",
    question: "When you see a School Zone warning sign, you should:",
    options: ["Maintain current speed", "Speed up to pass quickly", "Reduce speed and watch for children", "Ignore it outside school hours"],
    correctIndex: 2,
  },
  {
    id: "q5",
    signId: "one-way",
    question: "A blue rectangular sign with a single arrow indicates:",
    options: ["Two-way traffic", "One way street", "Dead end", "No through road"],
    correctIndex: 1,
  },
  {
    id: "q6",
    signId: "slippery-road",
    question: "A warning sign for a slippery road means you should:",
    options: ["Brake hard immediately", "Reduce speed and drive with caution", "Speed up to pass the area quickly", "Turn on hazard lights and stop"],
    correctIndex: 1,
  },
  {
    id: "q7",
    signId: "yield",
    question: "What must you do at a Yield sign?",
    options: ["Slow down and give way when needed", "Stop always, even when the road is clear", "Speed up to merge first", "Ignore it late at night"],
    correctIndex: 0,
  },
  {
    id: "q8",
    signId: "no-u-turn",
    question: "When you see the No U-Turn sign, you must:",
    options: ["Make the U-turn quickly", "U-turn only when no enforcer is around", "Never make a U-turn here", "U-turn only at night"],
    correctIndex: 2,
  },
  {
    id: "q9",
    signId: "roundabout",
    question: "Approaching a roundabout, you should:",
    options: ["Give way to traffic inside the circle", "Enter without slowing down", "Stop in the middle of it", "Honk before entering"],
    correctIndex: 0,
  },
  {
    id: "q10",
    signId: "telephone",
    question: "A blue sign with a telephone handset means:",
    options: ["No phone calls allowed", "A public telephone is nearby", "Call the police now", "Free Wi-Fi ahead"],
    correctIndex: 1,
  },
  {
    id: "q11",
    signId: "turn-left",
    question: "A blue circular sign with a white left arrow means:",
    options: ["Left turn suggested", "No left turn", "You must turn left", "One-way street"],
    correctIndex: 2,
  },
  {
    id: "q12",
    signId: "height-limit",
    question: "A circular sign marked 3.5m limits:",
    options: ["Vehicle height", "Vehicle speed", "Vehicle weight", "Road width"],
    correctIndex: 0,
  },
];

/** Sign lookup for the quiz, which addresses signs by id. */
export function findSignById(id: string): TrafficSign | undefined {
  return trafficSigns.find((sign) => sign.id === id);
}
