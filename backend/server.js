require('dotenv').config();
const app = require('./src/app');
const { sequelize } = require('./src/models');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    // IMPORTANT: alter:true is opt-in via DB_SYNC_ALTER, NOT automatic.
    // nodemon restarts the server on every file save during development —
    // if alter ran every single time, repeated ALTER TABLE calls on unique
    // columns can accumulate duplicate indexes until MySQL's 64-index-per-
    // table limit is hit (this is exactly what happened before this fix).
    // Set DB_SYNC_ALTER=true in .env only when you've just added/changed a
    // model's fields and need the table structure updated — then set it
    // back to false (or remove it) once the change is applied.
    const shouldAlter = process.env.DB_SYNC_ALTER === 'true';
    await sequelize.sync({ alter: shouldAlter });
    console.log(`Models synced${shouldAlter ? ' (schema altered)' : ' (no schema changes applied)'}.`);

    app.listen(PORT, () => {
      console.log(`DriveTrack backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Unable to start server:', err);
    process.exit(1);
  }
}

start();
