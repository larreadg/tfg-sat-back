import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { env } from './config/env';
import { crearApp } from './app';
import { iniciarJobEvaluacionIa } from './modules/evaluaciones/evaluaciones.job';
import { registrarComandosBot } from './modules/telegram/telegram.bootstrap';

const app = crearApp();

const server = env.useHttps
  ? https.createServer(
      {
        key: fs.readFileSync(path.resolve(process.cwd(), env.sslKeyPath)),
        cert: fs.readFileSync(path.resolve(process.cwd(), env.sslCertPath)),
      },
      app,
    )
  : http.createServer(app);

server.listen(env.port, env.host, () => {
  const protocol = env.useHttps ? 'https' : 'http';
  console.log(`Server running on ${protocol}://${env.host}:${env.port}`);
});

iniciarJobEvaluacionIa();
void registrarComandosBot();
