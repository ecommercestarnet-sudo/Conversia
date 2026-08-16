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
    <div className="relative min-h-screen bg-[#07090e] text-slate-100 font-sans antialiased">
      {/* Background Glowing Orb Effect */}
      <div className="absolute top-0 left-1/4 right-1/4 h-[30rem] bg-gradient-to-b from-indigo-600/15 via-purple-600/5 to-transparent blur-[120px] pointer-events-none rounded-full" />

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-lg">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </span>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                ConversIA Superadmin
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
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
                className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-lg text-slate-300 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center shrink-0 cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
            <button
              onClick={handleSignOut}
              className="p-2 bg-slate-900 border border-slate-800 hover:border-red-500/30 hover:bg-red-500/10 text-slate-300 hover:text-red-400 rounded-lg transition-all flex items-center justify-center shrink-0 cursor-pointer"
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
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            <Sparkles className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{notification.message}</p>
          </div>
        )}

        {/* Metrics Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Metric 1: Total registered organizations */}
          <div className="relative overflow-hidden bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 transition-all duration-300 hover:border-slate-700/50 hover:shadow-lg">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Building className="w-16 h-16 text-indigo-500" />
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                <Building className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-slate-400">Total de Empresas Cadastradas</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-350 bg-clip-text text-transparent">
                {totalOrgs}
              </span>
              <span className="text-xs text-slate-550">organizações ativas</span>
            </div>
          </div>

          {/* Metric 2: Total connected WhatsApp accounts */}
          <div className="relative overflow-hidden bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 transition-all duration-300 hover:border-slate-700/50 hover:shadow-lg">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Phone className="w-16 h-16 text-indigo-500" />
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                <Phone className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-slate-400">Total de WhatsApps Conectados</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-350 bg-clip-text text-transparent">
                {connectedOrgs}
              </span>
              <span className="text-xs text-slate-550">dispositivos ativos</span>
            </div>
          </div>
        </section>

        {/* Organizations Table Container */}
        <section className="bg-slate-950/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-md">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Empresas Registradas ({filteredOrganizations.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  <th className="py-4 px-4">Nome da Empresa</th>
                  <th className="py-4 px-4">Slug da Rota</th>
                  <th className="py-4 px-4">Status WhatsApp</th>
                  <th className="py-4 px-4">Data de Cadastro</th>
                  <th className="py-4 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-sm">
                {filteredOrganizations.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-900/30 transition-colors group">
                    <td className="py-4 px-4 font-semibold text-slate-200">
                      {org.name}
                    </td>
                    <td className="py-4 px-4 font-mono text-xs text-indigo-400">
                      /{org.slug}/dashboard
                    </td>
                    <td className="py-4 px-4">
                      {org.whatsapp_status === 'connected' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle className="w-3 h-3" />
                          Conectado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle className="w-3 h-3" />
                          Desconectado
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-slate-400">
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
                          className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                          title="Acessar Painel do Cliente"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Acessar Painel</span>
                        </button>
                        <button
                          onClick={() => handleDelete(org.id, org.name)}
                          disabled={isDeleting === org.id}
                          className="p-1.5 bg-slate-900/60 border border-slate-850 hover:border-rose-500/40 hover:bg-rose-550/10 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
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
                    <td colSpan={5} className="py-8 text-center text-slate-500">
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
