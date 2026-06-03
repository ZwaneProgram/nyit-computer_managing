import { useState, type FormEvent } from 'react';
import { Icons } from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';

/** Full-screen login / first-account-setup gate shown when logged out. */
export function LoginView() {
  const { needsSetup, login, register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (needsSetup) await register(username.trim(), password, fullName.trim() || undefined);
      else await login(username.trim(), password);
      // On success the AuthProvider sets the user and App swaps in the app shell.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-card card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="sb-logo">N</div>
          <div>
            <div className="sb-brand-name">Nyit Computer</div>
            <div className="sb-brand-sub">ระบบจัดการสต๊อก</div>
          </div>
        </div>

        <h1 className="auth-title">{needsSetup ? 'สร้างบัญชีแรก' : 'เข้าสู่ระบบ'}</h1>
        <p className="auth-sub muted">
          {needsSetup
            ? 'ยังไม่มีบัญชีในระบบ — สร้างบัญชีเจ้าของร้านเพื่อเริ่มใช้งาน'
            : 'กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าใช้งานระบบ'}
        </p>

        {needsSetup && (
          <div className="field">
            <label className="field-label">ชื่อ-สกุล (ไม่บังคับ)</label>
            <div className="input-prefix">
              <span className="pfx"><Icons.user /></span>
              <input
                className="input"
                placeholder="เช่น เจ้าของร้าน"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="field">
          <label className="field-label">ชื่อผู้ใช้</label>
          <div className="input-prefix">
            <span className="pfx"><Icons.user /></span>
            <input
              className="input"
              placeholder="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label">รหัสผ่าน</label>
          <div className="input-prefix">
            <span className="pfx"><Icons.lock /></span>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        {error && (
          <div className="auth-error" role="alert">
            <Icons.warning style={{ width: 15, height: 15, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          {busy
            ? 'กำลังดำเนินการ...'
            : needsSetup
              ? 'สร้างบัญชีและเข้าสู่ระบบ'
              : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}
