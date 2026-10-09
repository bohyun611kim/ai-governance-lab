import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type StorageState = {
  supabaseSession: {
    access_token: string;
    user: { id: string; email: string };
  };
};

type DocumentRow = {
  id: string;
  title: string;
  owner_id: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

function loadSession(label: "test02" | "test03"): StorageState {
  const p = path.join(__dirname, "..", "playwright", ".auth", `${label}.json`);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

async function fetchDocuments(
  request: APIRequestContext,
  accessToken: string,
): Promise<DocumentRow[]> {
  const res = await request.get(
    `${SUPABASE_URL}/rest/v1/documents?select=id,title,owner_id`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  expect(
    res.ok(),
    `documents 조회 실패: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  return res.json();
}

test.describe("RLS A/B 격리 (Cloud)", () => {
  test("test02 는 자기 문서만 본다", async ({ request }) => {
    const session = loadSession("test02");
    const docs = await fetchDocuments(
      request,
      session.supabaseSession.access_token,
    );

    expect(docs.length).toBeGreaterThanOrEqual(1);

    for (const doc of docs) {
      expect(doc.owner_id).toBe(session.supabaseSession.user.id);
    }
  });

  test("test03 는 자기 문서만 본다", async ({ request }) => {
    const session = loadSession("test03");
    const docs = await fetchDocuments(
      request,
      session.supabaseSession.access_token,
    );

    expect(docs.length).toBeGreaterThanOrEqual(1);

    for (const doc of docs) {
      expect(doc.owner_id).toBe(session.supabaseSession.user.id);
    }
  });

  test("두 유저가 서로의 문서를 볼 수 없다", async ({ request }) => {
    const s02 = loadSession("test02");
    const s03 = loadSession("test03");

    const docs02 = await fetchDocuments(
      request,
      s02.supabaseSession.access_token,
    );
    const docs03 = await fetchDocuments(
      request,
      s03.supabaseSession.access_token,
    );

    const ids02 = new Set(docs02.map((d) => d.id));
    const ids03 = new Set(docs03.map((d) => d.id));

    for (const id of ids02) {
      expect(ids03.has(id)).toBe(false);
    }
  });
});
