/* eslint-disable no-console */
import { createApp } from './app';
import { Env } from './config/env';

const app = createApp();
app.listen(Env.PORT, '0.0.0.0', () => {
  console.log(`API listening on :${Env.PORT} (USE_MV=${Env.USE_MV})`);
});
