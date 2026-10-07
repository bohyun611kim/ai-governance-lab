// @vitest-environment node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ---------- .env.local 파싱 ----------
function loadEnvLocal(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
    const env: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const fileEnv = loadEnvLocal();
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? fileEnv.SUPABASE_SECRET_KEY;

const hasEnv = Boolean(SUPABASE_URL && PUBLISHABLE_KEY && SECRET_KEY);

type DescribeFn = (name: string, fn: () => void) => void;

const describeOrSkip: DescribeFn = hasEnv
  ? (name, fn) => describe(name, { concurrent: false }, fn)
  : describe.skip;

// ---------- DB 컨테이너 ----------
const DB_CONTAINER = "supabase_db_ai-governance-lab";

function runSql(sql: string): string {
  const escaped = sql.replace(/"/g, '\\"');
  return execSync(
    `docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -c "${escaped}"`,
    { encoding: "utf-8" },
  );
}

// ---------- 원본 정책 정의 (복구용) ----------
const ORIGINAL_POLICIES = {
  select: `create policy "select own documents" on public.documents for select to authenticated using (auth.uid() = owner_id);`,
  insert: `create policy "insert own documents" on public.documents for insert to authenticated with check (auth.uid() = owner_id);`,
  update: `create policy "update own documents" on public.documents for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);`,
  delete: `create policy "delete own documents" on public.documents for delete to authenticated using (auth.uid() = owner_id);`,
};

function restoreAllPolicies() {
  runSql(`alter table public.documents enable row level security;`);
  runSql(`drop policy if exists "select own documents" on public.documents;`);
  runSql(`drop policy if exists "insert own documents" on public.documents;`);
  runSql(`drop policy if exists "update own documents" on public.documents;`);
  runSql(`drop policy if exists "delete own documents" on public.documents;`);
  runSql(ORIGINAL_POLICIES.select);
  runSql(ORIGINAL_POLICIES.insert);
  runSql(ORIGINAL_POLICIES.update);
  runSql(ORIGINAL_POLICIES.delete);
}

// ---------- 테스트 사용자 ----------
const USER_A = {
  email: "test-fail-a@example.com",
  password: "test-password-a",
};
const USER_B = {
  email: "test-fail-b@example.com",
  password: "test-password-b",
};

describeOrSkip("RLS 실패 실습 (보안 실패 시연)", () => {
  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let anonClient: SupabaseClient;
  let idA = "";
  let idB = "";

  async function deleteUserByEmail(email: string) {
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) throw error;
    const target = data.users.find((u) => u.email === email);
    if (target) {
      await admin.auth.admin.deleteUser(target.id);
    }
  }

  async function createAndLogin(email: string, password: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) throw signInErr;
    return { client, userId: data.user.id };
  }

  // 정상 상태로 리셋 (A/B 재생성 + A 문서 1개)
  async function resetUsersAndData() {
    await deleteUserByEmail(USER_A.email);
    await deleteUserByEmail(USER_B.email);

    const a = await createAndLogin(USER_A.email, USER_A.password);
    clientA = a.client;
    idA = a.userId;

    const b = await createAndLogin(USER_B.email, USER_B.password);
    clientB = b.client;
    idB = b.userId;

    const { error } = await clientA.from("documents").insert({
      owner_id: idA,
      title: "A의 비밀 문서",
      content: "A만 봐야 함",
    });
    if (error) throw error;
  }

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    anonClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await resetUsersAndData();
  });

  afterAll(async () => {
    // 모든 정책/RLS 원상복구
    restoreAllPolicies();
    if (!admin) return;
    await deleteUserByEmail(USER_A.email);
    await deleteUserByEmail(USER_B.email);
  });

  // 매 시나리오 시작 시 정상 상태로 복귀
  async function ensureHealthyBaseline() {
    restoreAllPolicies();
    const { data } = await clientB.from("documents").select("*");
    // B는 A 문서를 볼 수 없어야 함
    expect(data).toHaveLength(0);
  }

  // ---------- 시나리오 1: RLS 자체를 끔 ----------
  it("시나리오 1: RLS를 끄면 B가 A 문서를 본다 (격리 붕괴)", async () => {
    await ensureHealthyBaseline();

    runSql(`alter table public.documents disable row level security;`);

    const { data, error } = await clientB.from("documents").select("*");
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0); // 실패 재현 성공 (격리 깨짐)

    // 복구
    restoreAllPolicies();
    const { data: after } = await clientB.from("documents").select("*");
    expect(after).toHaveLength(0);
  });

  // ---------- 시나리오 2: SELECT 정책 없음 → 기본 거부 원칙 ----------
  it("시나리오 2: SELECT 정책이 없으면 모든 사용자가 차단된다 (기본 거부 원칙)", async () => {
    await ensureHealthyBaseline();

    runSql(`drop policy "select own documents" on public.documents;`);

    // 정책 없음 → B뿐 아니라 A도 자기 문서를 못 봄
    const { data: bData, error: bErr } = await clientB
      .from("documents")
      .select("*");
    expect(bErr).toBeNull();
    expect(bData).toHaveLength(0);

    const { data: aData, error: aErr } = await clientA
      .from("documents")
      .select("*");
    expect(aErr).toBeNull();
    expect(aData).toHaveLength(0);

    // 복구 후 A는 다시 자기 문서를 봄
    restoreAllPolicies();
    const { data: after } = await clientA.from("documents").select("*");
    expect(after).toHaveLength(1);
  });

  // ---------- 시나리오 3: SELECT 정책을 using(true) 로 ----------
  it("시나리오 3: SELECT 정책이 using(true)면 B가 A 문서를 본다", async () => {
    await ensureHealthyBaseline();

    runSql(`drop policy "select own documents" on public.documents;`);
    runSql(
      `create policy "select own documents" on public.documents for select to authenticated using (true);`,
    );

    const { data, error } = await clientB.from("documents").select("*");
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);

    restoreAllPolicies();
    const { data: after } = await clientB.from("documents").select("*");
    expect(after).toHaveLength(0);
  });

  // ---------- 시나리오 4: UPDATE with check 누락 ----------
  it("시나리오 4: UPDATE with check가 없으면 B가 A 문서 소유권을 탈취할 수 있다", async () => {
    await ensureHealthyBaseline();

    // 변조: with check 제거 (B가 owner_id를 자기 id로 바꿔도 통과)
    runSql(`drop policy "update own documents" on public.documents;`);
    runSql(
      `create policy "update own documents" on public.documents for update to authenticated using (auth.uid() = owner_id);`,
    );

    // B가 A 문서의 owner_id를 자기 id로 바꾸기 시도
    const { error } = await clientB
      .from("documents")
      .update({ owner_id: idB })
      .eq("owner_id", idA);
    // with check 없음 → 성공해버림 (실패 재현 성공)
    expect(error).toBeNull();

    // 복구
    restoreAllPolicies();
    // 소유권 탈취 흔적 정리: B가 가져간 문서 삭제
    await clientB.from("documents").delete().eq("owner_id", idB);
    // A 문서 재삽입
    await clientA
      .from("documents")
      .insert({ owner_id: idA, title: "A의 비밀 문서", content: "복구" });
  });

  // ---------- 시나리오 5: anon 허용 ----------
  it("시나리오 5: SELECT 정책이 anon을 허용하면 비로그인도 A 문서를 본다", async () => {
    await ensureHealthyBaseline();

    runSql(`drop policy "select own documents" on public.documents;`);
    runSql(
      `create policy "select own documents" on public.documents for select to anon, authenticated using (true);`,
    );

    // anon(비로그인) 클라이언트로 조회
    const { data, error } = await anonClient.from("documents").select("*");
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);

    restoreAllPolicies();
    const { data: after } = await anonClient.from("documents").select("*");
    expect(after).toHaveLength(0);
  });
});
