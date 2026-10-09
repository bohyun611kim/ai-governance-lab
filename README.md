# AI Governance Lab

Next.js + Supabase + Cloudflare 기반 **풀스택 거버넌스 템플릿**.
RLS(Row Level Security) 격리, 보안 스캔, E2E 검증, Cloudflare 배포 게이트가 사전 구성되어 있습니다.

## 이 템플릿으로 시작하는 법

1. GitHub에서 **"Use this template"** 클릭 → 새 저장소 생성
2. 로컬 클론 후 의존성 설치

   ```bash
   pnpm install
   ```

3. 환경 변수 설정 (`.env.local`)

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   SUPABASE_SECRET_KEY=...   # 서버 전용, 클라이언트 노출 금지
   ```

4. 로컬 Supabase 기동

   ```bash
   supabase start
   ```

5. 개발 서버 실행

   ```bash
   pnpm dev
   ```

6. 브라우저에서 http://localhost:3000 접속
   - `/login` — 로그인/회원가입
   - `/example` — RLS 격리 검증 UI 예시

## 기술 스택

| 영역       | 스택                                                |
| ---------- | --------------------------------------------------- |
| 프레임워크 | Next.js 16.3.8 (App Router, Turbopack)              |
| 런타임     | React 19.2.8                                        |
| 인증/DB    | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) |
| 배포       | Cloudflare (`@opennextjs/cloudflare`, wrangler)     |
| 스타일     | Tailwind CSS 4                                      |
| 테스트     | Vitest (단위/통합), Playwright (E2E)                |
| 린트/보안  | ESLint 9, eslint-plugin-security                    |

## 스크립트

| 명령              | 설명                      |
| ----------------- | ------------------------- |
| `pnpm dev`        | 개발 서버                 |
| `pnpm build`      | 프로덕션 빌드             |
| `pnpm start`      | 프로덕션 서버             |
| `pnpm lint`       | ESLint                    |
| `pnpm typecheck`  | TypeScript 타입 검사      |
| `pnpm test`       | Vitest (1회)              |
| `pnpm test:watch` | Vitest (watch)            |
| `pnpm preview`    | Cloudflare 프리뷰 빌드    |
| `pnpm deploy`     | Cloudflare 배포           |
| `pnpm cf-typegen` | Cloudflare 환경 타입 생성 |

## 검증 루틴

PR 전 아래를 순서대로 실행:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

> RLS 테스트(`lib/supabase/rls-*.test.ts`)는 **로컬 Docker Supabase** 에 의존합니다.
> `supabase start` 후 실행하세요.

## E2E (Playwright)

```bash
# 탭 1: 테스트용 dev 서버
NODE_ENV=test pnpm dev

# 탭 2: E2E 실행
pnpm exec playwright test --reporter=list
```

- `e2e/auth.setup.ts` — 로그인 세션 준비
- `e2e/rls-isolation.spec.ts` — RLS A/B 격리 자동 검증

## 디렉토리 구조

```
app/
  example/         # RLS 격리 검증 UI 예시 (/example)
  auth/callback/   # Supabase Auth 콜백
  login/           # 로그인 페이지
  page.tsx         # 홈 (로그인/예시 링크)
e2e/               # Playwright E2E
lib/
  supabase/        # Supabase 클라이언트 + RLS 테스트
  add.ts           # 단위 테스트 예시
supabase/
  migrations/      # DB 마이그레이션 (RLS 정책 포함)
```

## 사전 구성된 보안

- **RLS 정책** — `documents` 테이블 A/B 격리 (`supabase/migrations/`)
- **보안 스캔 3종** — gitleaks, eslint-plugin-security, pnpm audit
- **RLS 실패 실습** — `lib/supabase/rls-failure-lab.test.ts` (5개 시나리오)
- **E2E 격리 검증** — `e2e/rls-isolation.spec.ts`

## 배포 (Cloudflare)

```bash
pnpm preview   # 로컬 프리뷰
pnpm deploy    # 프로덕션 배포
```

OpenNext 어댑터를 통해 Next.js를 Cloudflare Workers에 배포합니다.

## 요구 사항

- Node.js 20+
- pnpm 12.6.0+
- Docker (로컬 Supabase용)

## 라이선스

MIT
