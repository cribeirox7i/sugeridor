import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Dispara o workflow de coleta no GitHub Actions (workflow_dispatch). Protegida:
// só um admin logado pode chamar. O PAT do GitHub fica só no servidor.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  const pat = process.env.GITHUB_PAT;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!pat || !owner || !repo) {
    return NextResponse.json(
      { error: "Coleta não configurada (faltam GITHUB_PAT/OWNER/REPO no servidor)." },
      { status: 503 },
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/scrape.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );

  if (res.status === 204) {
    return NextResponse.json({ ok: true });
  }

  const detail = await res.text();
  return NextResponse.json(
    { error: `GitHub respondeu ${res.status}`, detail: detail.slice(0, 300) },
    { status: 502 },
  );
}
