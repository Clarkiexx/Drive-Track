// Static reference data for the Learning Center + Quiz. Kept simple and
// local (no backend) per the spec — this is an educational feature
// independent of citation management.

export const trafficSigns = [
  // --- Regulatory signs: red/white, tell drivers what they MUST or MUST NOT do ---
  {
    id: 'stop',
    category: 'Regulatory',
    shape: 'octagon',
    color: '#DC2626',
    name: 'Stop',
    meaning: 'Come to a complete stop and yield to all traffic before proceeding.',
  },
  {
    id: 'no-entry',
    category: 'Regulatory',
    shape: 'circle',
    color: '#DC2626',
    name: 'No Entry',
    meaning: 'Entry is prohibited for all vehicles in this direction.',
  },
  {
    id: 'no-parking',
    category: 'Regulatory',
    shape: 'circle',
    color: '#DC2626',
    name: 'No Parking',
    meaning: 'Parking is not allowed in this area at any time unless otherwise indicated.',
  },
  {
    id: 'speed-limit',
    category: 'Regulatory',
    shape: 'circle',
    color: '#DC2626',
    name: 'Speed Limit',
    meaning: 'Indicates the maximum legal speed, in km/h, permitted on this road.',
  },
  {
    id: 'one-way',
    category: 'Regulatory',
    shape: 'rectangle',
    color: '#2563EB',
    name: 'One Way',
    meaning: 'Traffic on this road moves in one direction only, shown by the arrow.',
  },

  // --- Warning signs: yellow/black, alert drivers to hazards ahead ---
  {
    id: 'curve-ahead',
    category: 'Warning',
    shape: 'triangle',
    color: '#F59E0B',
    name: 'Curve Ahead',
    meaning: 'The road ahead curves in the direction shown — reduce speed accordingly.',
  },
  {
    id: 'pedestrian-crossing',
    category: 'Warning',
    shape: 'triangle',
    color: '#F59E0B',
    name: 'Pedestrian Crossing',
    meaning: 'A pedestrian crossing is ahead. Slow down and watch for people crossing.',
  },
  {
    id: 'school-zone',
    category: 'Warning',
    shape: 'triangle',
    color: '#F59E0B',
    name: 'School Zone',
    meaning: 'You are approaching a school zone — reduce speed and watch for children.',
  },
  {
    id: 'slippery-road',
    category: 'Warning',
    shape: 'triangle',
    color: '#F59E0B',
    name: 'Slippery Road',
    meaning: 'The road surface may be slippery, especially when wet. Reduce speed.',
  },

  // --- Informational signs: blue/green, guide rather than command ---
  {
    id: 'hospital',
    category: 'Informational',
    shape: 'rectangle',
    color: '#2563EB',
    name: 'Hospital',
    meaning: 'Indicates the direction of the nearest hospital.',
  },
  {
    id: 'parking-area',
    category: 'Informational',
    shape: 'rectangle',
    color: '#2563EB',
    name: 'Parking Area',
    meaning: 'Indicates a designated area where parking is permitted.',
  },
  {
    id: 'gas-station',
    category: 'Informational',
    shape: 'rectangle',
    color: '#2563EB',
    name: 'Gas Station',
    meaning: 'Indicates the direction of the nearest fuel station.',
  },
];

export const quizQuestions = [
  {
    id: 'q1',
    signId: 'stop',
    question: 'What should you do when you see this sign?',
    options: ['Slow down only', 'Come to a complete stop', 'Honk and proceed', 'Yield only if traffic is present'],
    correctIndex: 1,
  },
  {
    id: 'q2',
    signId: 'no-entry',
    question: 'A red circular sign with a white bar means:',
    options: ['Speed limit ends', 'No parking', 'No entry for vehicles', 'One way street'],
    correctIndex: 2,
  },
  {
    id: 'q3',
    signId: 'pedestrian-crossing',
    question: 'A yellow triangular sign showing a person walking indicates:',
    options: ['Hospital nearby', 'Pedestrian crossing ahead', 'School zone', 'No pedestrians allowed'],
    correctIndex: 1,
  },
  {
    id: 'q4',
    signId: 'school-zone',
    question: 'When you see a School Zone warning sign, you should:',
    options: ['Maintain current speed', 'Speed up to pass quickly', 'Reduce speed and watch for children', 'Ignore it outside school hours'],
    correctIndex: 2,
  },
  {
    id: 'q5',
    signId: 'one-way',
    question: 'A blue rectangular sign with a single arrow indicates:',
    options: ['Two-way traffic', 'One-way street', 'Dead end', 'No through road'],
    correctIndex: 1,
  },
  {
    id: 'q6',
    signId: 'slippery-road',
    question: 'A warning sign for a slippery road means you should:',
    options: ['Brake hard immediately', 'Reduce speed and drive with caution', 'Speed up to pass the area quickly', 'Turn on hazard lights and stop'],
    correctIndex: 1,
  },
];
