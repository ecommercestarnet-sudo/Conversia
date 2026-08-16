'use client';

import React, { useState, useMemo } from 'react';
import { 
  Building, 
  Phone, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  LogOut, 
  Sparkles, 
  ShieldAlert,
  Search,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { logout } from '@/app/auth-actions';
import { deleteOrganization } from './actions';

interface Organization {
  id: string;
  name: string;
  slug: string;
  whatsapp_status: string | null;
  created_at: string;
}

interface AdminClientProps {
  initialOrganizations: Organization[];
}

export default function AdminClient({ initialOrganizations }: AdminClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 1. Filter based on search term
  const filteredOrganizations = useMemo(() => {
    return initialOrganizations.filter(org => 
      org.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      org.slug.toLowerCase().includes(searchTerm.toLowerCase()) || 
      org.id.includes(searchTerm)
    );
  }, [initialOrganizations, searchTerm]);

  // 2. Metrics calculation
  const totalOrgs = initialOrganizations.length;
  const connectedOrgs = useMemo(() => {
    return initialOrganizations.filter(org => org.whatsapp_status === 'connected').length;
  }, [initialOrganizations]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  const handleSignOut = async () => {
    await logout();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja deletar a empresa "${name}"? Esta ação é irreversível e excluirá todos os usuários, playbooks e dados de mensagens associados.`)) {
      return;
    }

    setIsDeleting(id);
    setNotification(null);

    const res = await deleteOrganization(id);

    if (res.success) {
      setNotification({ type: 'success', message: `Empresa "${name}" deletada com sucesso.` });
      router.refresh();
    } else {
      setNotification({ type: 'error', message: res.error || 'Erro ao deletar empresa.' });
    }
    
    setIsDeleting(null);

    // Clear notification after 4s
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-50 text-emerald-600 border border-emerald-500/20 rounded-lg">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                SupervisIA Superadmin
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Painel do Administrador Global • Monitoramento e Gestão de Contas
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar empresa ou slug..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm"
              />
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-white border border-slate-200 hover:border-slate-350 rounded-lg text-slate-550 hover:text-slate-900 transition-all disabled:opacity-50 flex items-center justify-center shrink-0 cursor-pointer shadow-sm"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
            </button>
            <button
              onClick={handleSignOut}
              className="p-2 bg-white border border-slate-200 hover:border-red-500/30 hover:bg-red-50 text-slate-500 hover:text-red-605 rounded-lg transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-sm"
              title="Sair do Sistema"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Notification alerts */}
        {notification && (
          <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 animate-fade-in ${
            notification.type === 'success' 
              ? 'bg-emerald-50 border-emerald-250 text-emerald-700' 
              : 'bg-rose-50 border-rose-250 text-rose-700'
          }`}>
            <Sparkles className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{notification.message}</p>
          </div>
        )}

        {/* Metrics Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Metric 1: Total registered organizations */}
          <div className="relative overflow-hidden bg-white border border-slate-200 rounded-2xl p-6 transition-all duration-300 hover:border-slate-300 hover:shadow-md shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Building className="w-16 h-16 text-emerald-600" />
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-500/20">
                <Building className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-slate-550">Total de Empresas Cadastradas</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-slate-900">
                {totalOrgs}
              </span>
              <span className="text-xs text-slate-400">organizações ativas</span>
            </div>
          </div>

          {/* Metric 2: Total connected WhatsApp accounts */}
          <div className="relative overflow-hidden bg-white border border-slate-200 rounded-2xl p-6 transition-all duration-300 hover:border-slate-300 hover:shadow-md shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Phone className="w-16 h-16 text-emerald-600" />
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-500/20">
                <Phone className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-slate-550">Total de WhatsApps Conectados</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-slate-900">
                {connectedOrgs}
              </span>
              <span className="text-xs text-slate-400">dispositivos ativos</span>
            </div>
          </div>
        </section>

        {/* Organizations Table Container */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
              Empresas Registradas ({filteredOrganizations.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 tracking-wider">
                  <th className="py-4 px-4">Nome da Empresa</th>
                  <th className="py-4 px-4">Slug da Rota</th>
                  <th className="py-4 px-4">Status WhatsApp</th>
                  <th className="py-4 px-4">Data de Cadastro</th>
                  <th className="py-4 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredOrganizations.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-4 px-4 font-semibold text-slate-900">
                      {org.name}
                    </td>
                    <td className="py-4 px-4 font-mono text-xs text-emerald-600">
                      /{org.slug}/dashboard
                    </td>
                    <td className="py-4 px-4">
                      {org.whatsapp_status === 'connected' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-705 border border-emerald-200">
                          <CheckCircle className="w-3 h-3" />
                          Conectado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-705 border border-rose-200">
                          <XCircle className="w-3 h-3" />
                          Desconectado
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-slate-500">
                      {new Date(org.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => window.open(`/${org.slug}/dashboard`, '_blank')}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-350 text-slate-600 hover:text-slate-800 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                          title="Acessar Painel do Cliente"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Acessar Painel</span>
                        </button>
                        <button
                          onClick={() => handleDelete(org.id, org.name)}
                          disabled={isDeleting === org.id}
                          className="p-1.5 bg-white border border-slate-200 hover:border-rose-500/40 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                          title="Excluir Empresa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredOrganizations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Nenhuma empresa encontrada com os termos buscados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
