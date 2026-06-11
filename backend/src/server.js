import { app } from './app.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(`InventaPro API en http://localhost:${config.port}`);
});

