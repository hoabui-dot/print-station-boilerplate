import React, { createContext, useContext, useState, useEffect } from 'react'
import { authApi } from '@/api/client'

export interface User {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  async function checkAuth() {
    try {
      if (!localStorage.getItem('token')) { setUser(null); setLoading(false); return }
      const res = await authApi.me()
      setUser(res.data)
    } catch (err) {
      console.error('Failed to verify token', err)
      localStorage.removeItem('token')
      localStorage.removeItem('userId'); localStorage.removeItem('username')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void checkAuth()
    return undefined
  }, [])

  async function login(username: string, password: string) {
    setLoading(true)
    try {
      const res = await authApi.login(username, password)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('userId', res.data.userId)
      localStorage.setItem('username', res.data.username)
      const me = await authApi.me()
      setUser(me.data)
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('userId')
    localStorage.removeItem('username')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
