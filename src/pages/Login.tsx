import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { errorText, Field } from '../components/ui'

export function Login() {
  const { login, firebaseUser, user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await login(email, password)
      navigate('/', { replace: true }) // land on the home page of the signed-in role
    } catch (ex) {
      setErr(errorText(ex))
    } finally {
      setBusy(false)
    }
  }

  const noProfile = !loading && firebaseUser && !user

  return (
    <div className="login-wrap">
      <div className="login-card card stack">
        <div className="center stack" style={{ gap: 6 }}>
          <img src="/logo-256.jpg" alt="Punjadara Hotel" width={88} height={88} style={{ margin: '0 auto', borderRadius: '50%' }} />
          <h1>PunjadaraPOS</h1>
          <div className="muted small">ระบบสร้างเอกสารจัดงาน (BEO)</div>
        </div>
        {noProfile ? (
          <div className="stack">
            <div className="notice warn">บัญชี {firebaseUser.email} ยังไม่ได้รับสิทธิ์ใช้งาน หรือถูกปิดการใช้งาน กรุณาติดต่อ Admin</div>
            <div className="small muted">UID: <code>{firebaseUser.uid}</code></div>
            <button className="btn" onClick={() => void logout()}>ออกจากระบบ</button>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <Field label="อีเมล">
              <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="รหัสผ่าน" error={err}>
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <button className="btn primary big" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
