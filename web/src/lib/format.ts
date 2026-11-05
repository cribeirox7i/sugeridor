export function formatPrice(value: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

// Fuso FIXO em São Paulo (UTC-3, com horário de verão tratado pela própria
// IANA se voltar a existir). Sem `timeZone` explícito, `toLocaleString` usa o
// fuso de QUEM RENDERIZA: nas telas do admin que são Server Component isso é
// o servidor da Vercel, que roda em UTC — os horários de coleta apareciam 3h
// adiantados. Fixar aqui deixa o valor igual no servidor e no cliente, e é o
// certo pra um admin operado do Brasil.
const ADMIN_TIME_ZONE = "America/Sao_Paulo";

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: ADMIN_TIME_ZONE,
  });
}

// Só a hora, com segundos — usado no "atualizado às" do refresh de status, em
// que minuto cheio não distingue dois cliques seguidos.
export function formatTimeWithSeconds(value: string | Date): string {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: ADMIN_TIME_ZONE,
  });
}
