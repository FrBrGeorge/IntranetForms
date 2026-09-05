import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const BASE_PATH = (process.env.BASE_PATH || '/form').replace(/\/+$/, '');
const ADMIN_PASSPHRASE = process.env.ADMIN_PASSPHRASE || 'admin-secret-passphrase';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Interface definition for DB
interface DatabaseSchema {
  adminSessionToken: string | null;
  form: {
    id: string;
    title: string;
    description: string;
    fullNameLabel: string;
    tasks: Array<{
      id: string;
      title: string;
      description?: string;
      placeholder?: string;
      required?: boolean;
    }>;
    updatedAt: string;
  };
  responses: Record<string, {
    sessionKey: string;
    fullName: string;
    answers: Record<string, string>;
    createdAt: string;
    updatedAt: string;
    isValid: boolean;
  }>;
}

const DEFAULT_DB: DatabaseSchema = {
  adminSessionToken: null,
  form: {
    id: 'default',
    title: 'Intranet Task & Incident Report Form',
    description: 'Please provide your full name and complete the task instructions below. All fields auto-save in real-time when you move between inputs.',
    fullNameLabel: 'Full Name',
    tasks: [
      {
        id: 'task_1',
        title: 'Task 1: Summary of Work / Incident Description',
        description: 'Provide a concise summary of the primary task completed or incident observed today.',
        placeholder: 'Paste or type your summary here...',
        required: true,
      },
      {
        id: 'task_2',
        title: 'Task 2: Detailed Steps, Code Snippet or Root Cause',
        description: 'Detail the exact procedure, configuration changes, or technical logs associated with this task.',
        placeholder: 'Paste output logs, terminal commands, or diagnostic details...',
        required: false,
      },
      {
        id: 'task_3',
        title: 'Task 3: Verification & Next Steps',
        description: 'Describe how the solution was verified and what follow-up actions are recommended.',
        placeholder: 'Paste verification notes or next action items...',
        required: false,
      },
    ],
    updatedAt: new Date().toISOString(),
  },
  responses: {},
};

function readDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
      return DEFAULT_DB;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      adminSessionToken: parsed.adminSessionToken ?? null,
      form: { ...DEFAULT_DB.form, ...(parsed.form || {}) },
      responses: parsed.responses || {},
    };
  } catch (err) {
    console.error('Error reading DB:', err);
    return DEFAULT_DB;
  }
}

function writeDb(data: DatabaseSchema): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Error writing DB:', err);
  }
}

// Generate random session token
function generateToken(prefix: string = 'key'): string {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // API router
  const apiRouter = express.Router();

  // Helper middleware for admin auth
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
    const db = readDb();

    if (!db.adminSessionToken || !token || db.adminSessionToken !== token) {
      return res.status(401).json({ error: 'UNAUTHORIZED_ADMIN', message: 'Admin authentication required.' });
    }
    next();
  };

  // 1. Config endpoint
  apiRouter.get('/config', (req: Request, res: Response) => {
    res.json({
      basePath: BASE_PATH,
      configuredPassphraseProtected: Boolean(ADMIN_PASSPHRASE),
    });
  });

  // 2. Form definition
  apiRouter.get('/form', (req: Request, res: Response) => {
    const db = readDb();
    res.json(db.form);
  });

  apiRouter.put('/form', requireAdmin, (req: Request, res: Response) => {
    const db = readDb();
    const { title, description, fullNameLabel, tasks } = req.body;

    db.form = {
      id: db.form.id || 'default',
      title: typeof title === 'string' && title.trim() ? title.trim() : db.form.title,
      description: typeof description === 'string' ? description : db.form.description,
      fullNameLabel: typeof fullNameLabel === 'string' && fullNameLabel.trim() ? fullNameLabel.trim() : 'Full Name',
      tasks: Array.isArray(tasks) ? tasks : db.form.tasks,
      updatedAt: new Date().toISOString(),
    };

    writeDb(db);
    res.json({ success: true, form: db.form });
  });

  // 3. User response fetching & saving
  apiRouter.get('/response', (req: Request, res: Response) => {
    const sessionKey = req.query.sessionKey as string;
    if (!sessionKey) {
      return res.status(400).json({ error: 'MISSING_SESSION_KEY', message: 'sessionKey is required' });
    }

    const db = readDb();
    const response = db.responses[sessionKey];

    if (response) {
      if (response.isValid === false) {
        return res.status(403).json({
          error: 'SESSION_INVALIDATED',
          message: 'This session key has been invalidated by the administrator. A new session must be created.',
        });
      }
      return res.json(response);
    }

    // Return empty scaffold if not found
    return res.json({
      sessionKey,
      fullName: '',
      answers: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isValid: true,
      isNew: true,
    });
  });

  // Auto-save endpoint (focus leave / real-time)
  apiRouter.post('/response', (req: Request, res: Response) => {
    const { sessionKey, fullName, answers, field, value } = req.body;
    if (!sessionKey || typeof sessionKey !== 'string') {
      return res.status(400).json({ error: 'MISSING_SESSION_KEY', message: 'Valid sessionKey is required' });
    }

    const db = readDb();
    let current = db.responses[sessionKey];

    if (current && current.isValid === false) {
      return res.status(403).json({
        error: 'SESSION_INVALIDATED',
        message: 'This session key has been invalidated by the administrator. Please reset your session.',
      });
    }

    const now = new Date().toISOString();

    if (!current) {
      current = {
        sessionKey,
        fullName: typeof fullName === 'string' ? fullName : '',
        answers: answers && typeof answers === 'object' ? { ...answers } : {},
        createdAt: now,
        updatedAt: now,
        isValid: true,
      };
    } else {
      if (typeof fullName === 'string') {
        current.fullName = fullName;
      }
      if (answers && typeof answers === 'object') {
        current.answers = { ...current.answers, ...answers };
      }
      current.updatedAt = now;
    }

    // Support field-level partial update on blur
    if (field) {
      if (field === 'fullName' && typeof value === 'string') {
        current.fullName = value;
      } else if (field.startsWith('task_') || field.startsWith('task:')) {
        const taskId = field.replace(/^task:/, '');
        current.answers[taskId] = typeof value === 'string' ? value : '';
      }
      current.updatedAt = now;
    }

    db.responses[sessionKey] = current;
    writeDb(db);

    res.json({
      success: true,
      response: current,
      savedAt: now,
    });
  });

  // User client manual session reset endpoint
  apiRouter.delete('/response', (req: Request, res: Response) => {
    const sessionKey = req.query.sessionKey as string;
    if (sessionKey) {
      const db = readDb();
      if (db.responses[sessionKey]) {
        db.responses[sessionKey].isValid = false;
        writeDb(db);
      }
    }
    res.json({ success: true, message: 'Session deleted' });
  });

  // 4. Admin Management
  // Check admin status
  apiRouter.get('/admin/status', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token as string);
    const db = readDb();

    const hasAdmin = Boolean(db.adminSessionToken);
    const isFirstAdminAvailable = !hasAdmin;
    const isAdminAuthenticated = Boolean(db.adminSessionToken && token && db.adminSessionToken === token);

    res.json({
      hasAdmin,
      isFirstAdminAvailable,
      isAdminAuthenticated,
    });
  });

  // First admin access: anyone visiting for the first time claims admin rights
  apiRouter.post('/admin/claim-first', (req: Request, res: Response) => {
    const db = readDb();
    if (db.adminSessionToken) {
      return res.status(409).json({
        error: 'ADMIN_ALREADY_CLAIMED',
        message: 'Admin rights have already been claimed. Use passphrase to forcefully take admin rights.',
      });
    }

    const token = generateToken('adm');
    db.adminSessionToken = token;
    writeDb(db);

    res.json({
      success: true,
      token,
      message: 'Admin rights successfully granted on first access.',
    });
  });

  // Forceful takeover using passphrase
  apiRouter.post('/admin/claim-force', (req: Request, res: Response) => {
    const { passphrase } = req.body;
    if (!passphrase || passphrase !== ADMIN_PASSPHRASE) {
      return res.status(401).json({
        error: 'INVALID_PASSPHRASE',
        message: 'Incorrect admin passphrase. Unable to forcefully take admin rights.',
      });
    }

    const db = readDb();
    const newToken = generateToken('adm');
    db.adminSessionToken = newToken;
    writeDb(db);

    res.json({
      success: true,
      token: newToken,
      message: 'Admin rights forcefully acquired and session key regenerated.',
    });
  });

  // Regenerate admin token while already logged in
  apiRouter.post('/admin/regenerate-token', requireAdmin, (req: Request, res: Response) => {
    const db = readDb();
    const newToken = generateToken('adm');
    db.adminSessionToken = newToken;
    writeDb(db);

    res.json({
      success: true,
      token: newToken,
      message: 'Admin session key regenerated.',
    });
  });

  // List responses for admin
  apiRouter.get('/admin/responses', requireAdmin, (req: Request, res: Response) => {
    const db = readDb();
    const list = Object.values(db.responses).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    res.json({
      responses: list,
      total: list.length,
      form: db.form,
    });
  });

  // Invalidate common user's session key
  apiRouter.post('/admin/invalidate-user', requireAdmin, (req: Request, res: Response) => {
    const { sessionKey } = req.body;
    if (!sessionKey) {
      return res.status(400).json({ error: 'MISSING_SESSION_KEY', message: 'sessionKey is required' });
    }

    const db = readDb();
    if (db.responses[sessionKey]) {
      db.responses[sessionKey].isValid = false;
      db.responses[sessionKey].updatedAt = new Date().toISOString();
      writeDb(db);
      return res.json({ success: true, message: `Session key ${sessionKey} invalidated.` });
    } else {
      // If no response yet, still record the invalidation
      db.responses[sessionKey] = {
        sessionKey,
        fullName: '',
        answers: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isValid: false,
      };
      writeDb(db);
      return res.json({ success: true, message: `Session key ${sessionKey} invalidated.` });
    }
  });

  // Reactivate user's session key
  apiRouter.post('/admin/reactivate-user', requireAdmin, (req: Request, res: Response) => {
    const { sessionKey } = req.body;
    if (!sessionKey) {
      return res.status(400).json({ error: 'MISSING_SESSION_KEY', message: 'sessionKey is required' });
    }

    const db = readDb();
    if (db.responses[sessionKey]) {
      db.responses[sessionKey].isValid = true;
      db.responses[sessionKey].updatedAt = new Date().toISOString();
      writeDb(db);
      return res.json({ success: true, message: `Session key ${sessionKey} reactivated.` });
    }
    res.status(404).json({ error: 'NOT_FOUND', message: 'Session not found' });
  });

  // Invalidate all user sessions
  apiRouter.post('/admin/invalidate-all-users', requireAdmin, (req: Request, res: Response) => {
    const db = readDb();
    const now = new Date().toISOString();
    let count = 0;
    for (const key of Object.keys(db.responses)) {
      db.responses[key].isValid = false;
      db.responses[key].updatedAt = now;
      count++;
    }
    writeDb(db);
    res.json({ success: true, count, message: `All ${count} user session keys invalidated.` });
  });

  // Delete a user response
  apiRouter.delete('/admin/responses/:sessionKey', requireAdmin, (req: Request, res: Response) => {
    const sessionKey = req.params.sessionKey;
    const db = readDb();
    if (db.responses[sessionKey]) {
      delete db.responses[sessionKey];
      writeDb(db);
      return res.json({ success: true, message: 'Response record deleted.' });
    }
    res.status(404).json({ error: 'NOT_FOUND', message: 'Response record not found' });
  });

  // Export responses as CSV or JSON
  apiRouter.get('/admin/export', requireAdmin, (req: Request, res: Response) => {
    const format = (req.query.format as string) || 'json';
    const db = readDb();
    const list = Object.values(db.responses).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (format.toLowerCase() === 'csv') {
      const tasks = db.form.tasks || [];
      const headers = [
        'Session Key',
        'Full Name',
        'Status',
        'Created At',
        'Updated At',
        ...tasks.map(t => `"${t.title.replace(/"/g, '""')}"`),
      ];

      const rows = list.map(r => {
        const row = [
          `"${r.sessionKey}"`,
          `"${(r.fullName || '').replace(/"/g, '""')}"`,
          `"${r.isValid !== false ? 'Active' : 'Invalidated'}"`,
          `"${r.createdAt || ''}"`,
          `"${r.updatedAt || ''}"`,
          ...tasks.map(t => {
            const val = r.answers?.[t.id] ?? '';
            return `"${val.replace(/"/g, '""')}"`;
          }),
        ];
        return row.join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="form-responses-${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    // Default: JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="form-responses-${Date.now()}.json"`);
    return res.send(JSON.stringify({
      form: db.form,
      exportedAt: new Date().toISOString(),
      responses: list,
    }, null, 2));
  });

  // Mount API router to both ${BASE_PATH}/api and /api for multi-application reverse proxy flexibility
  if (BASE_PATH && BASE_PATH !== '') {
    app.use(`${BASE_PATH}/api`, apiRouter);
    console.log(`Mounted API routes at ${BASE_PATH}/api`);
  }
  app.use('/api', apiRouter);
  console.log(`Mounted API routes at /api`);

  // Health endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', basePath: BASE_PATH });
  });

  // Vite middleware in development vs static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} with BASE_PATH="${BASE_PATH}"`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
