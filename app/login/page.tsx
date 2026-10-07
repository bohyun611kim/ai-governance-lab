'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMessage(error ? `로그인 실패: ${error.message}` : '로그인 성공')
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error ? `회원가입 실패: ${error.message}` : '회원가입 성공 (즉시 로그인 가능)')
  }

  async function handleSignOut() {
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    setMessage(error ? `로그아웃 실패: ${error.message}` : '로그아웃 성공')
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-6 text-2xl font-bold">로그인</h1>
      <form className="space-y-4">
        <div>
          <label className="block text-sm font-medium">이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            required
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSignIn}
            className="flex-1 rounded bg-black px-4 py-2 text-white"
          >
            로그인
          </button>
          <button
            type="button"
            onClick={handleSignUp}
            className="flex-1 rounded border px-4 py-2"
          >
            회원가입
          </button>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full rounded border px-4 py-2 text-sm"
        >
          로그아웃
        </button>
      </form>
      {message && <p className="mt-4 text-sm">{message}</p>}
    </main>
  )
}
