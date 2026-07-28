import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFoundHandler';
import { iniciarJobEvaluacionIa } from './jobs/evaluacionIa.job';

const app = express();
const uploadsPath = path.join(process.cwd(), env.uploadsDir);
fs.mkdirSync(uploadsPath, { recursive: true });

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());
app.use(env.uploadsBaseUrl, express.static(uploadsPath));

app.use('/api/v1', apiLimiter, routes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
});

iniciarJobEvaluacionIa();
