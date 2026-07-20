import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <form
        action={login}
        className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-8"
      >
        <h1 className="text-lg font-semibold text-neutral-100">Admin — login</h1>

        {error && (
          <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-neutral-400">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-neutral-400">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded bg-amber-600 px-3 py-2 font-medium text-neutral-950 hover:bg-amber-500"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
