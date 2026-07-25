import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectPlatform } from "@/lib/detectPlatform";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url) {
    return NextResponse.json({ error: "URL obrigatória" }, { status: 400 });
  }

  const result = await detectPlatform(url);
  return NextResponse.json(result);
}
