'use client'

import React, { useTransition } from 'react'
import { signup } from '../auth-actions'

export default function SignupPage({
  searchParams,
}: {
  searchParams: any
}) {
  const [isPending, startTransition] = useTransition()

  // Safely unwrap searchParams whether it's a Promise (Next.js 15+) or a plain object
  const resolvedParams = searchParams && typeof searchParams.then === 'function'
    ? React.use(searchParams) as any
    : searchParams

  const message = resolvedParams?.message

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await signup(formData)
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-xl shadow-md">
        <div className="text-center flex flex-col items-center">
          <img src="/Logo.png" alt="SupervisIA Logo" className="h-14 w-auto object-contain mb-4" />
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Criar uma conta</h2>
          <p className="mt-2 text-sm text-gray-600">Sua organização será criada automaticamente.</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email" className="sr-only">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                disabled={isPending}
                className="relative block w-full rounded-t-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6 px-3 disabled:bg-gray-100"
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
                disabled={isPending}
                className="relative block w-full rounded-b-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-emerald-600 sm:text-sm sm:leading-6 px-3 disabled:bg-gray-100"
                placeholder="Senha (mínimo 6 caracteres)"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isPending}
              className="group relative flex w-full justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Cadastrando...</span>
                </div>
              ) : (
                'Cadastrar'
              )}
            </button>
          </div>
          {message && (
            <p className="mt-4 text-center text-sm text-red-600 bg-red-100 p-2 rounded">
              {message}
            </p>
          )}
          <div className="text-center text-sm">
             Já tem conta? <a href="/login" className="text-emerald-600 font-semibold">Faça Login</a>
          </div>
        </form>
      </div>
    </div>
  )
}
