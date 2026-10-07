// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      env[key] = value;
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
const describeOrSkip = hasEnv ? describe : describe.skip;

// ---------- 테스트 사용자 ----------
const USER_A = { email: "test-a@example.com", password: "test-password-a" };
const USER_B = { email: "test-b@example.com", password: "test-password-b" };

describeOrSkip("RLS A/B 격리 검증", () => {
  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  let idA = "";
  let idB = "";

  // 정리 헬퍼: 이메일로 사용자 찾아 삭제
  async function deleteUserByEmail(email: string) {
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) throw error;
    const target = data.users.find((u) => u.email === email);
    if (target) {
      const { error: delErr } = await admin.auth.admin.deleteUser(target.id);
      if (delErr) throw delErr;
    }
  }

  // 사용자 생성 + 로그인된 클라이언트 반환
  async function createAndLogin(
    email: string,
    password: string,
  ): Promise<{ client: SupabaseClient; userId: string }> {
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

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 재실행 대비: 기존 A/B 삭제
    await deleteUserByEmail(USER_A.email);
    await deleteUserByEmail(USER_B.email);

    // A, B 생성 + 로그인
    const a = await createAndLogin(USER_A.email, USER_A.password);
    clientA = a.client;
    idA = a.userId;

    const b = await createAndLogin(USER_B.email, USER_B.password);
    clientB = b.client;
    idB = b.userId;

    // A가 문서 1개 INSERT
    const { error: insertErr } = await clientA
      .from("documents")
      .insert({
        owner_id: idA,
        title: "A의 비밀 문서",
        content: "A만 봐야 함",
      });
    if (insertErr) throw insertErr;
  });

  afterAll(async () => {
    if (!admin) return;
    await deleteUserByEmail(USER_A.email);
    await deleteUserByEmail(USER_B.email);
  });

  it("A는 자기 문서를 볼 수 있다", async () => {
    const { data, error } = await clientA.from("documents").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].title).toBe("A의 비밀 문서");
  });

  it("B는 A의 문서를 볼 수 없다 (격리 성공)", async () => {
    const { data, error } = await clientB.from("documents").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("B가 자기 문서를 INSERT하면 B에게만 보인다", async () => {
    const { error: insertErr } = await clientB
      .from("documents")
      .insert({ owner_id: idB, title: "B의 문서", content: "B만 봐야 함" });
    expect(insertErr).toBeNull();

    const { data: bDocs, error: bErr } = await clientB
      .from("documents")
      .select("*");
    expect(bErr).toBeNull();
    expect(bDocs).toHaveLength(1);
    expect(bDocs?.[0].title).toBe("B의 문서");

    // A는 여전히 자기 문서 1개만 보임
    const { data: aDocs, error: aErr } = await clientA
      .from("documents")
      .select("*");
    expect(aErr).toBeNull();
    expect(aDocs).toHaveLength(1);
    expect(aDocs?.[0].title).toBe("A의 비밀 문서");
  });

  it("B는 A의 문서를 위조 INSERT 할 수 없다 (with check)", async () => {
    const { error } = await clientB
      .from("documents")
      .insert({ owner_id: idA, title: "위조 시도", content: "B가 A 명의로" });
    // RLS with check 위반 → error 발생해야 함
    expect(error).not.toBeNull();
  });
});
