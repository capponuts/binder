import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureSchema, query } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    await ensureSchema();
    const p = path.join(process.cwd(), "public", "liste.txt");
    const raw = await fs.readFile(p, "utf-8");
    const lines = raw.split(/\r?\n/);
    const cards: { name: string; number: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const parts = line.split(/\t/);
      if (parts.length < 2) continue;
      const number = parts[0]?.trim() ?? "";
      const name = parts[1]?.trim();
      if (!name) continue;
      cards.push({ name, number });
    }

    // bulk upsert par chunks de 100
    const CHUNK = 100;
    for (let i = 0; i < cards.length; i += CHUNK) {
      const chunk = cards.slice(i, i + CHUNK);
      const vals = chunk.map((_, j) => `($${j * 2 + 1},$${j * 2 + 2})`).join(",");
      const params = chunk.flatMap((c) => [c.name, c.number]);
      await query(
        `insert into collection(name, number) values ${vals}
         on conflict(name, number) do update set number=excluded.number, updated_at=now()`,
        params
      );
    }

    const { rows: c } = await query<{ count: string }>("select count(*)::text as count from collection");
    return NextResponse.json({ ok: true, parsed: cards.length, upserts: cards.length, rowCount: Number(c[0]?.count ?? 0) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}


