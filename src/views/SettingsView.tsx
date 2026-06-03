import { useCallback, useEffect, useState } from 'react';
import { Icons } from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import {
  changePassword,
  createUser,
  deleteUser,
  fetchSettings,
  fetchUsers,
  updateSettings,
  type Account,
  type ShopSettings,
} from '../data/settings';

interface ViewProps {
  showToast: (msg: string) => void;
}

export function SettingsView({ showToast }: ViewProps) {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback);

  return (
    <div className="grid" style={{ gap: 'var(--gap)' }}>
      <div className="page-head">
        <div>
          <div className="page-title">ตั้งค่าระบบ</div>
          <div className="muted page-subtitle">
            {isOwner ? 'ข้อมูลร้าน ค่าเริ่มต้น และการจัดการบัญชี' : 'จัดการบัญชีของคุณ'}
          </div>
        </div>
      </div>

      {isOwner && <ShopInfoCard showToast={showToast} fail={fail} />}
      <MyPasswordCard showToast={showToast} fail={fail} />
      {isOwner && <AccountsCard showToast={showToast} fail={fail} />}
    </div>
  );
}

type FailFn = (err: unknown, fallback: string) => void;

// ---------- Shop info + default low-stock threshold (owner only) ----------
function ShopInfoCard({ showToast, fail }: { showToast: (m: string) => void; fail: FailFn }) {
  const [form, setForm] = useState<ShopSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then(setForm)
      .catch((err) => fail(err, 'โหลดข้อมูลร้านไม่สำเร็จ'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    if (!form.shop_name.trim()) return showToast('กรุณากรอกชื่อร้าน');
    setSaving(true);
    try {
      setForm(await updateSettings(form));
      showToast('บันทึกข้อมูลร้านแล้ว');
    } catch (err) {
      fail(err, 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <div className="section-h"><div><h3>ข้อมูลร้าน</h3><div className="muted section-sub">แสดงบนใบเสร็จและทั่วระบบ</div></div></div>
      {loading || !form ? (
        <div className="muted" style={{ padding: 12 }}>กำลังโหลด...</div>
      ) : (
        <div className="grid" style={{ gap: 12 }}>
          <Field label="ชื่อร้าน">
            <input className="input" value={form.shop_name} onChange={(e) => set('shop_name', e.target.value)} />
          </Field>
          <Field label="ที่อยู่">
            <textarea className="input" rows={2} value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Field label="เบอร์โทร" style={{ flex: 1, minWidth: 160 }}>
              <input className="input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="เลขประจำตัวผู้เสียภาษี" style={{ flex: 1, minWidth: 160 }}>
              <input className="input" value={form.tax_id ?? ''} onChange={(e) => set('tax_id', e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Field label="แจ้งเตือนสต๊อกต่ำเริ่มต้น" hint="ใช้เป็นค่าตั้งต้นเมื่อเพิ่มสินค้าใหม่" style={{ flex: 1, minWidth: 160 }}>
              <input
                className="input"
                type="number"
                min={0}
                value={form.default_low}
                onChange={(e) => set('default_low', Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            <Field label="สกุลเงิน" style={{ flex: 1, minWidth: 160 }}>
              <input className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)} />
            </Field>
          </div>
          <div>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              <Icons.check /> บันทึก
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Change my own password (everyone) ----------
function MyPasswordCard({ showToast, fail }: { showToast: (m: string) => void; fail: FailFn }) {
  const { user } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) return;
    if (next.length < 4) return showToast('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
    if (next !== confirm) return showToast('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    setBusy(true);
    try {
      await changePassword(user.id, next, cur);
      setCur(''); setNext(''); setConfirm('');
      showToast('เปลี่ยนรหัสผ่านแล้ว');
    } catch (err) {
      fail(err, 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <div className="section-h"><div><h3>เปลี่ยนรหัสผ่านของฉัน</h3><div className="muted section-sub">บัญชี @{user?.username}</div></div></div>
      <div className="grid" style={{ gap: 12 }}>
        <Field label="รหัสผ่านปัจจุบัน">
          <input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="รหัสผ่านใหม่" style={{ flex: 1, minWidth: 160 }}>
            <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="ยืนยันรหัสผ่านใหม่" style={{ flex: 1, minWidth: 160 }}>
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        <div>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !cur || !next}>
            <Icons.lock /> เปลี่ยนรหัสผ่าน
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Account management (owner only) ----------
function AccountsCard({ showToast, fail }: { showToast: (m: string) => void; fail: FailFn }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-account form
  const [nu, setNu] = useState('');
  const [nf, setNf] = useState('');
  const [np, setNp] = useState('');
  const [nr, setNr] = useState<'owner' | 'staff'>('staff');
  const [adding, setAdding] = useState(false);

  // Inline password reset
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPw, setResetPw] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await fetchUsers());
    } catch (err) {
      fail(err, 'โหลดบัญชีไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!nu.trim() || !np) return showToast('กรอกชื่อผู้ใช้และรหัสผ่าน');
    if (np.length < 4) return showToast('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
    setAdding(true);
    try {
      await createUser({ username: nu.trim(), password: np, full_name: nf.trim() || undefined, role: nr });
      setNu(''); setNf(''); setNp(''); setNr('staff');
      showToast('เพิ่มบัญชีแล้ว');
      load();
    } catch (err) {
      fail(err, 'เพิ่มบัญชีไม่สำเร็จ');
    } finally {
      setAdding(false);
    }
  };

  const saveReset = async (a: Account) => {
    if (resetPw.length < 4) return showToast('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
    try {
      await changePassword(a.id, resetPw);
      setResetId(null); setResetPw('');
      showToast(`ตั้งรหัสผ่านใหม่ให้ @${a.username} แล้ว`);
    } catch (err) {
      fail(err, 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
    }
  };

  const remove = async (a: Account) => {
    if (!window.confirm(`ลบบัญชี @${a.username}?`)) return;
    try {
      await deleteUser(a.id);
      showToast('ลบบัญชีแล้ว');
      load();
    } catch (err) {
      fail(err, 'ลบบัญชีไม่สำเร็จ');
    }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 760 }}>
      <div className="section-h"><div><h3>จัดการบัญชีผู้ใช้</h3><div className="muted section-sub">เจ้าของร้านเข้าถึงทุกอย่าง · พนักงานใช้งานร้านได้แต่จัดการบัญชีไม่ได้</div></div></div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>สิทธิ์</th><th style={{ width: 150 }} /></tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <span style={{ fontWeight: 500 }}>@{a.username}</span>
                  {a.id === user?.id && <span className="muted" style={{ fontSize: 11.5 }}> (คุณ)</span>}
                  {resetId === a.id && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input
                        className="input"
                        type="text"
                        placeholder="รหัสผ่านใหม่"
                        value={resetPw}
                        autoFocus
                        onChange={(e) => setResetPw(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveReset(a); if (e.key === 'Escape') { setResetId(null); setResetPw(''); } }}
                      />
                      <button className="btn btn-sm btn-icon btn-ghost" title="บันทึก" onClick={() => saveReset(a)}><Icons.check /></button>
                      <button className="btn btn-sm btn-icon btn-ghost" title="ยกเลิก" onClick={() => { setResetId(null); setResetPw(''); }}><Icons.x /></button>
                    </div>
                  )}
                </td>
                <td className="muted">{a.full_name || '—'}</td>
                <td>
                  <span className="chip" style={{ fontSize: 11.5 }}>{a.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 4 }}>
                    {a.id !== user?.id && (
                      <button className="btn btn-sm btn-icon btn-ghost" title="รีเซ็ตรหัสผ่าน" onClick={() => { setResetId(a.id); setResetPw(''); }}><Icons.lock /></button>
                    )}
                    {a.id !== user?.id && (
                      <button className="btn btn-sm btn-icon btn-ghost" title="ลบบัญชี" onClick={() => remove(a)}><Icons.trash /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {loading && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 30 }} className="muted">กำลังโหลด...</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
        <h4 style={{ margin: '0 0 10px' }}>เพิ่มบัญชีใหม่</h4>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="ชื่อผู้ใช้" style={{ flex: 1, minWidth: 130 }}>
            <input className="input" value={nu} onChange={(e) => setNu(e.target.value)} />
          </Field>
          <Field label="ชื่อ (ไม่บังคับ)" style={{ flex: 1, minWidth: 130 }}>
            <input className="input" value={nf} onChange={(e) => setNf(e.target.value)} />
          </Field>
          <Field label="รหัสผ่าน" style={{ flex: 1, minWidth: 130 }}>
            <input className="input" type="text" value={np} onChange={(e) => setNp(e.target.value)} />
          </Field>
          <Field label="สิทธิ์" style={{ width: 130 }}>
            <select className="input" value={nr} onChange={(e) => setNr(e.target.value as 'owner' | 'staff')}>
              <option value="staff">พนักงาน</option>
              <option value="owner">เจ้าของร้าน</option>
            </select>
          </Field>
          <button className="btn btn-primary" onClick={add} disabled={adding}><Icons.plus /> เพิ่ม</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Small labelled field wrapper ----------
function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: 'block', ...style }}>
      <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}
