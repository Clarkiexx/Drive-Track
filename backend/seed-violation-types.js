// Seeds the initial violation types catalog shown on the Enforcer's
// "Issue Citation" screen. Run once with: node seed-violation-types.js
// Penalty amounts below are placeholders based on typical LTO fine
// ranges — confirm actual CTMO figures before using this for anything
// beyond development/testing.

require('dotenv').config();
const { sequelize, ViolationType } = require('./src/models');

const violationTypes = [
  {
    articleSection: 'Art. III, Sec. 11-17',
    description: 'Disobedience of Traffic Control Signs/Signals',
    category: 'moving',
    defaultPenalty: 1000,
  },
  {
    articleSection: 'Art IV, Sec. 19-32',
    description: 'Violation of General Driving Rules',
    category: 'moving',
    defaultPenalty: 1000,
  },
  {
    articleSection: 'Art V, Sec. 34-38',
    description: 'Violation of Giving Way Rules',
    category: 'moving',
    defaultPenalty: 1000,
  },
  {
    articleSection: 'Art VI, Sec. 40-43',
    description: 'Violation of Speed Restriction',
    category: 'moving',
    defaultPenalty: 1500,
  },
  {
    articleSection: 'Art VII, Sec. 49-57',
    description: 'Violation of One-Way Streets',
    category: 'moving',
    defaultPenalty: 1000,
  },
  {
    articleSection: 'Art VIII, Sec. 59-66',
    description: 'Improper Stopping and Parking Rules',
    category: 'non_moving',
    defaultPenalty: 500,
  },
];

async function seed() {
  await sequelize.authenticate();

  for (const vt of violationTypes) {
    // eslint-disable-next-line no-await-in-loop
    const [, created] = await ViolationType.findOrCreate({
      where: { articleSection: vt.articleSection },
      defaults: vt,
    });
    console.log(`${created ? 'Created' : 'Already existed'}: ${vt.articleSection} — ${vt.description}`);
  }

  await sequelize.close();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
