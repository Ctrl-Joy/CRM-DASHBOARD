import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { requireAuth } from './lib/auth';
import { errorHandler, HttpError } from './lib/http';
import { authRouter } from './routes/auth';
import { teamsRouter, usersRouter } from './routes/users';
import { notificationsRouter, settingsRouter, templatesRouter, viewsRouter } from './routes/settings';
import { companiesRouter } from './routes/companies';
import { contactsRouter } from './routes/contacts';
import { leadsRouter, publicLeadsRouter } from './routes/leads';
import { dealsRouter, pipelinesRouter } from './routes/deals';
import { activitiesRouter, calendarRouter, emailRouter, tasksRouter } from './routes/work';
import { productsRouter, quotesRouter } from './routes/commerce';
import { ticketsRouter } from './routes/tickets';
import { campaignsRouter } from './routes/campaigns';
import { workflowsRouter } from './routes/workflows';
import { filesRouter } from './routes/files';
import { aiRouter, searchRouter } from './routes/search';
import { dashboardRouter, reportsRouter } from './routes/insights';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind a hosting proxy (Railway, Render…) the visitor's IP is in X-Forwarded-For;
  // trust exactly that many hops so rate limits apply per visitor, not per proxy.
  const proxy = process.env.TRUST_PROXY ?? (process.env.RAILWAY_ENVIRONMENT || process.env.RENDER ? '1' : 'loopback');
  app.set('trust proxy', /^\d+$/.test(proxy) ? Number(proxy) : proxy);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        mediaSrc: ["'self'", 'https://d8j0ntlcm91z4.cloudfront.net'], // landing hero video
        connectSrc: ["'self'"],
      },
    },
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));

  const api = Router();
  api.get('/health', (_req, res) => { res.json({ ok: true }); });
  api.use('/auth', authRouter);
  api.use('/public', publicLeadsRouter);

  const secured = Router();
  secured.use(requireAuth);
  secured.use('/users', usersRouter);
  secured.use('/teams', teamsRouter);
  secured.use('/settings', settingsRouter);
  secured.use('/templates', templatesRouter);
  secured.use('/views', viewsRouter);
  secured.use('/notifications', notificationsRouter);
  secured.use('/companies', companiesRouter);
  secured.use('/contacts', contactsRouter);
  secured.use('/leads', leadsRouter);
  secured.use('/pipelines', pipelinesRouter);
  secured.use('/deals', dealsRouter);
  secured.use('/activities', activitiesRouter);
  secured.use('/tasks', tasksRouter);
  secured.use('/calendar', calendarRouter);
  secured.use('/email', emailRouter);
  secured.use('/products', productsRouter);
  secured.use('/quotes', quotesRouter);
  secured.use('/tickets', ticketsRouter);
  secured.use('/campaigns', campaignsRouter);
  secured.use('/workflows', workflowsRouter);
  secured.use('/files', filesRouter);
  secured.use('/search', searchRouter);
  secured.use('/ai', aiRouter);
  secured.use('/dashboard', dashboardRouter);
  secured.use('/reports', reportsRouter);
  api.use(secured);
  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));

  app.use('/api', api);

  // In production the API also serves the built React app.
  const dist = path.resolve(process.cwd(), '../web/dist');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
