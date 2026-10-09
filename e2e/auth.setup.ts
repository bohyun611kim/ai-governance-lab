import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authDir = path.join(__dirname, "..", "playwright", ".auth");
fs.mkdirSync(authDir, { recursive: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    ".env.test 의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 필요합니다.",
  );
}

type UserSpec = {
  label: "test02" | "test03";
  email: string;
  password: string;
};

const users: UserSpec[] = [
  {
    label: "test02",
    email: process.env.E2E_TEST02_EMAIL ?? "",
    password: process.env.E2E_TEST02_PASSWORD ?? "",
  },
  {
    label: "test03",
    email: process.env.E2E_TEST03_EMAIL ?? "",
    password: process.env.E2E_TEST03_PASSWORD ?? "",
  },
];

for (const user of users) {
  setup(`authenticate as ${user.label}`, async ({ request }) => {
    expect(user.email, `${user.label} 이메일 누락`).toBeTruthy();
    expect(user.password, `${user.label} 비밀번호 누락`).toBeTruthy();

    const res = await request.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          "Content-Type": "application/json",
        },
        data: {
          email: user.email,
          password: user.password,
        },
      },
    );

    expect(
      res.ok(),
      `${user.label} 로그인 실패: ${res.status()} ${await res.text()}`,
    ).toBeTruthy();

    const session = await res.json();

    const storagePath = path.join(authDir, `${user.label}.json`);
    fs.writeFileSync(
      storagePath,
      JSON.stringify(
        {
          cookies: [],
          origins: [],
          supabaseSession: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            user: session.user,
          },
        },
        null,
        2,
      ),
    );
  });
}
