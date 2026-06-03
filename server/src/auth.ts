import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db';

const COOKIE = 'nyit_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

interface User {
  id: number;
  username: string;
  full_name: string | null;
}

const secret = () => process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const sign = (userId: number) => jwt.sign({ uid: userId }, secret(), { expiresIn: '30d' });

/** Resolve the logged-in user from the session cookie, or null. */
export async function currentUser(req: FastifyRequest): Promise<User | null> {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const { uid } = jwt.verify(token, secret()) as { uid: number };
    const { rows } = await query<User>('select id, username, full_name from users where id = $1', [uid]);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** preHandler guard: 401s unauthenticated requests, otherwise sets req.user. */
export function requireAuth() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const me = await currentUser(req);
    if (!me) return reply.code(401).send({ error: 'unauthorized' });
    req.user = me;
  };
}

export async function authRoutes(app: FastifyInstance) {
  // Register. The FIRST account (empty users table) is open so the shop can
  // bootstrap; after that, creating accounts requires being logged in.
  app.post('/api/auth/register', async (req, reply) => {
    const { username, password, full_name } = (req.body ?? {}) as Record<string, string>;
    if (!username || !password) {
      return reply.code(400).send({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }

    const { rows: countRows } = await query<{ n: number }>('select count(*)::int as n from users');
    const isFirstAccount = countRows[0].n === 0;
    if (!isFirstAccount && !(await currentUser(req))) {
      return reply.code(401).send({ error: 'ต้องเข้าสู่ระบบก่อนจึงจะสร้างบัญชีใหม่ได้' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await query<User>(
        'insert into users (username, password_hash, full_name) values ($1, $2, $3) returning id, username, full_name',
        [username, password_hash, full_name ?? null],
      );
      return reply.code(201).send({ user: rows[0] });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
      }
      throw err;
    }
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { username, password } = (req.body ?? {}) as Record<string, string>;
    const { rows } = await query<User & { password_hash: string }>(
      'select id, username, full_name, password_hash from users where username = $1',
      [username],
    );
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password ?? '', u.password_hash))) {
      return reply.code(401).send({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    reply.setCookie(COOKIE, sign(u.id), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE,
    });
    return reply.send({ user: { id: u.id, username: u.username, full_name: u.full_name } });
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', async (req, reply) => {
    const me = await currentUser(req);
    if (!me) return reply.code(401).send({ error: 'unauthorized' });
    return reply.send({ user: me });
  });

  // Lets the login screen know whether the very first account still needs to be
  // created (empty users table) so it can show the "create first account" form.
  app.get('/api/auth/needs-setup', async () => {
    const { rows } = await query<{ n: number }>('select count(*)::int as n from users');
    return { needsSetup: rows[0].n === 0 };
  });
}
