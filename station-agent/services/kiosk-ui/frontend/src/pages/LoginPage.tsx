import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Lock, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch {
      setError('Tên đăng nhập hoặc mật khẩu không chính xác')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="min-h-screen flex items-center justify-center bg-background p-6">
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-fg">Print Station</p>
        <h1 className="text-2xl font-bold">Đăng nhập trạm in</h1>
      </header>
      <label className="block space-y-2 text-sm font-medium">Tên đăng nhập
        <div className="relative"><User className="absolute left-3 top-3 h-4 w-4 text-muted-fg" /><Input className="pl-10" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required /></div>
      </label>
      <label className="block space-y-2 text-sm font-medium">Mật khẩu
        <div className="relative"><Lock className="absolute left-3 top-3 h-4 w-4 text-muted-fg" /><Input className="pl-10" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></div>
      </label>
      {error && <p className="flex gap-2 rounded-lg border border-error/25 bg-error/10 p-3 text-sm text-error"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      <Button type="submit" disabled={submitting} className="w-full">{submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</Button>
    </form>
  </main>
}
