import { createClient } from '../../utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const supabase = await createClient()

  // Middleware should have already protected this route, but doing a double check here for safety
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'superadmin') {
    redirect('/')
  }

  // Fetch all organizations
  const { data: organizations, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard - Organizações</h1>
      
      {error ? (
        <p className="text-red-500">Erro ao carregar organizações: {error.message}</p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WhatsApp</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data de Criação</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {organizations?.map((org) => (
                <tr key={org.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{org.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{org.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                    <a href={`/${org.slug}/dashboard`} target="_blank" rel="noreferrer">
                      /{org.slug}/dashboard
                    </a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${org.whatsapp_status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {org.whatsapp_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(org.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(!organizations || organizations.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">Nenhuma organização encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
