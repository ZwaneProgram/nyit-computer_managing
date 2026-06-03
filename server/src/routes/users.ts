import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { query } from '../db';
import { requireAuth, requireOwner } from '../auth';

// Account management. Single shop, two roles: 'owner' manages accounts +
// settings; 'staff' just uses the shop. Everything here is owner-only EXCEPT
// changing your own password (any logged-in user may do that).
export async function userRoutes(app: FastifyInstance) {
  // List all accounts (owner only).
  app.get('/api/users', { preHandler: requireOwner() }, async () => {
    const { rows } = await query(
      'select id, username, full_name, role, created_at from users order by id',
    );
    return { users: rows };
  });

  // Create a new account (owner only).
  app.post('/api/users', { preHandler: requireOwner() }, async (req, reply) => {
    const { username, password, full_name, role } = (req.body ?? {}) as Record<string, string>;
    if (!username?.trim() || !password) {
      return reply.code(400).send({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }
    if (password.length < 4) {
      return reply.code(400).send({ error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
    }
    const newRole = role === 'owner' ? 'owner' : 'staff';
    const password_hash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await query(
        'insert into users (username, password_hash, full_name, role) values ($1, $2, $3, $4) returning id, username, full_name, role, created_at',
        [username.trim(), password_hash, full_name?.trim() || null, newRole],
      );
      return reply.code(201).send({ user: rows[0] });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
      }
      throw err;
    }
  });

  // Delete an account (owner only). Can't delete yourself or the last owner.
  app.delete('/api/users/:id', { preHandler: requireOwner() }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (id === req.user!.id) {
      return reply.code(400).send({ error: 'ลบบัญชีที่กำลังใช้งานอยู่ไม่ได้' });
    }
    const { rows } = await query<{ role: string }>('select role from users where id = $1', [id]);
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบบัญชี' });
    if (rows[0].role === 'owner') {
      const { rows: owners } = await query<{ n: number }>(
        "select count(*)::int as n from users where role = 'owner'",
      );
      if (owners[0].n <= 1) {
        return reply.code(400).send({ error: 'ต้องมีเจ้าของร้านอย่างน้อยหนึ่งบัญชี' });
      }
    }
    await query('delete from users where id = $1', [id]);
    return reply.code(204).send();
  });

  // Change a password. Owners may reset anyone's password (no current password
  // needed). Anyone else may change only their own, and must prove the current.
  app.put('/api/users/:id/password', { preHandler: requireAuth() }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { current_password, new_password } = (req.body ?? {}) as Record<string, string>;
    const me = req.user!;
    const isSelf = id === me.id;
    const isOwner = me.role === 'owner';

    if (!isSelf && !isOwner) {
      return reply.code(403).send({ error: 'เปลี่ยนรหัสผ่านของบัญชีอื่นได้เฉพาะเจ้าของร้าน' });
    }
    if (!new_password || new_password.length < 4) {
      return reply.code(400).send({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' });
    }

    const { rows } = await query<{ password_hash: string }>(
      'select password_hash from users where id = $1',
      [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบบัญชี' });

    // Verify the current password when changing your OWN password.
    if (isSelf) {
      if (!current_password || !(await bcrypt.compare(current_password, rows[0].password_hash))) {
        return reply.code(400).send({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
      }
    }

    const hash = await bcrypt.hash(new_password, 10);
    await query('update users set password_hash = $1 where id = $2', [hash, id]);
    return reply.send({ ok: true });
  });
}
