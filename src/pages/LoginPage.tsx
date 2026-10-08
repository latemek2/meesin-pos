import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ErrorBox } from '../components/ui';

export default function LoginPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(errorText(error));
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div className="logo">
          <img src="/favicon.svg" alt="" />
          <div>
            <h1>มีศิลป์ POS</h1>
            <div className="muted small">ระบบขายหน้าร้านและหลังบ้าน</div>
          </div>
        </div>
        <label className="field">
          <span>อีเมล</span>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>รหัสผ่าน</span>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <ErrorBox error={error} />
        <button className="btn primary lg" disabled={busy}>
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
        <p className="muted small" style={{ margin: 0 }}>
          เครื่องหน้าร้านเข้าด้วยบัญชีเครื่อง POS ครั้งเดียว ระบบจะจำไว้ ครั้งต่อไปใช้แค่ PIN
        </p>
      </form>
    </div>
  );
}
