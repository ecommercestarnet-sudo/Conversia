import { login } from '../auth-actions'
// Fallback if ui components are missing
export default function LoginPage({
  searchParams,
}: {
  searchParams: { message: string }
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-xl shadow-md">
        <div className="text-center flex flex-col items-center">
          <img src="/Logo.png" alt="SupervisIA Logo" className="h-14 w-auto object-contain mb-4" />
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Entrar na sua conta</h2>
        </div>
        <form className="mt-8 space-y-6" action={login}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email" className="sr-only">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="relative block w-full rounded-t-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6 px-3"
                placeholder="E-mail"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="relative block w-full rounded-b-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6 px-3"
                placeholder="Senha"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative flex w-full justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              Entrar
            </button>
          </div>
          {searchParams?.message && (
            <p className="mt-4 text-center text-sm text-red-600 bg-red-100 p-2 rounded">
              {searchParams.message}
            </p>
          )}
          <div className="text-center text-sm">
             Ainda não tem conta? <a href="/signup" className="text-emerald-600 font-semibold">Cadastre-se</a>
          </div>
        </form>
      </div>
    </div>
  )
}
