import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import scanRouter from './routes/scan.js';
import loansRouter from './routes/loans.js';
import campusesRouter from './routes/campuses.js';
import counselorsRouter from './routes/counselors.js';
import kitsRouter from './routes/kits.js';
import emailsRouter from './routes/emails.js';
import dashboardRouter from './routes/dashboard.js';
import settingsRouter from './routes/settings.js';
import auditRouter from './routes/audit.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const corsOrigin = process.env.CORS_ORIGIN || '*';

app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
  }),
);
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const api = express.Router();
api.use('/scan', scanRouter);
api.use('/loans', loansRouter);
api.use('/campuses', campusesRouter);
api.use('/counselors', counselorsRouter);
api.use('/kits', kitsRouter);
api.use('/emails', emailsRouter);
api.use('/dashboard', dashboardRouter);
api.use('/settings', settingsRouter);
api.use('/audit', auditRouter);

app.use('/api/v1', api);

app.listen(PORT, () => {
  console.log(`ESCA API listening on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
