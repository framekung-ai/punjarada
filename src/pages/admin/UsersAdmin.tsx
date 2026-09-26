import { useEffect, useState } from 'react'
import type { AppUser } from '../../lib/types'
import { createUserAccount, listUsers, saveUser } from '../../lib/db'
import { useAuth } from '../../lib/auth'
import { errorText, Field, Sheet, Spinner, useToast } from '../../components/ui'

export function UsersAdmin() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'sales' as AppUser['role'] })
  const [busy, setBusy] = useState(false)
  const load = () => listUsers().then((u) => setUsers(u.sort((a, b) => a.displayName.localeCompare(b.displayName, 'th')))).catch((e) => toast(errorText(e)))
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = async (u: AppUser) => {
    try { await saveUser(u); toast('บันทึกแล้ว'); void load() } catch (e) { toast(errorText(e)) }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>ผู้ใช้งาน <span className="small muted">({users?.length ?? 0}/20)</span></h1>
        <button className="btn primary" onClick={() => setAdding(true)}>+ เพิ่มผู้ใช้</button>
      </div>
      {!users ? <Spinner /> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>ชื่อ</th><th className="hide-mobile">อีเมล</th><th>บทบาท</th><th>ใช้งาน</th></tr></thead>
            <tbody>
              {users.map((u) => {
                const self = u.uid === me?.uid
                return (
                  <tr key={u.uid} style={u.active ? undefined : { opacity: .5 }}>
                    <td>
                      <input className="input" defaultValue={u.displayName} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== u.displayName) void update({ ...u, displayName: v }) }} />
                      <div className="small muted hide-desktop">{u.email}</div>
                    </td>
                    <td className="hide-mobile">{u.email}{self && <span className="badge" style={{ marginLeft: 6 }}>คุณ</span>}</td>
                    <td>
                      <select className="input" style={{ width: 'auto' }} value={u.role} disabled={self} onChange={(e) => void update({ ...u, role: e.target.value as AppUser['role'] })}>
                        <option value="sales">Sales</option><option value="admin">Admin</option>
                      </select>
                    </td>
                    <td><input type="checkbox" checked={u.active} disabled={self} onChange={() => void update({ ...u, active: !u.active })} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="small muted">ปิด “ใช้งาน” เพื่อระงับสิทธิ์ทันที (บัญชียังอยู่ เอกสารเดิมไม่หาย) · เปลี่ยนรหัสผ่าน/ลบบัญชี ทำที่ Firebase Console → Authentication</div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="เพิ่มผู้ใช้" footer={
        <button className="btn primary block" disabled={busy || !form.email || form.password.length < 8 || !form.displayName.trim()} onClick={async () => {
          setBusy(true)
          try {
            await createUserAccount(form.email.trim(), form.password, form.displayName.trim(), form.role)
            toast('สร้างบัญชีแล้ว — ส่งอีเมลและรหัสผ่านให้ผู้ใช้')
            setAdding(false)
            setForm({ email: '', password: '', displayName: '', role: 'sales' })
            void load()
          } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
        }}>{busy ? 'กำลังสร้าง…' : 'สร้างบัญชี'}</button>}>
        <Field label="ชื่อที่แสดง (ใช้เป็น “ผู้รับงาน” บนเอกสาร)" required><input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
        <Field label="อีเมล" required><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="รหัสผ่านเริ่มต้น" required hint="อย่างน้อย 8 ตัวอักษร"><input className="input" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="บทบาท">
          <div className="chips">
            <button type="button" className={`chip${form.role === 'sales' ? ' on' : ''}`} onClick={() => setForm({ ...form, role: 'sales' })}>Sales</button>
            <button type="button" className={`chip${form.role === 'admin' ? ' on' : ''}`} onClick={() => setForm({ ...form, role: 'admin' })}>Admin</button>
          </div>
        </Field>
      </Sheet>
    </div>
  )
}
