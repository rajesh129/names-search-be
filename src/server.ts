/* eslint-disable no-console */
import createApp from './app';
import { Env } from './config/env';

// const app = createApp();

createApp.listen(Env.PORT, () => {
  console.log(`API listening on :${Env.PORT} (${Env.NODE_ENV})`);
});
