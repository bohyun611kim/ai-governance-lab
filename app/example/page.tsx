'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type Doc = {
  id: string
  title: string
  content: string | null
  created_at: string
}

export default function DocumentsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDocs = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      return
    }
    setDocs(data ?? [])
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
      await loadDocs()
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createDoc = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !user) return
    const { error } = await supabase
      .from('documents')
      .insert({ title: title.trim(), owner_id: user.id })
    if (error) {
      setError(error.message)
      return
    }
    setTitle('')
    await loadDocs()
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return <div style={{ padding: 24 }}>로딩 중...</div>

  return (
    <div style={{ padding: 24, fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>내 문서 (RLS 격리 테스트)</h1>
        <button onClick={logout}>로그아웃</button>
      </div>

      <p style={{ background: '#f0f0f0', padding: 8 }}>
        로그인: <b>{user?.email}</b><br />
        UUID: <code>{user?.id}</code>
      </p>

      <form onSubmit={createDoc} style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="문서 제목"
          style={{ padding: 8, width: 300 }}
        />
        <button type="submit" style={{ padding: 8, marginLeft: 8 }}>생성</button>
      </form>

      {error && <p style={{ color: 'red' }}>에러: {error}</p>}

      <h2>문서 목록 ({docs.length}건)</h2>
      {docs.length === 0 ? (
        <p>문서 없음 (RLS가 다른 유저 문서를 숨기고 있거나, 아직 생성 안 함)</p>
      ) : (
        <ul>
          {docs.map((d) => (
            <li key={d.id}>
              <b>{d.title}</b> — <small>{new Date(d.created_at).toLocaleString()}</small>
              <br />
              <small>id: {d.id}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
