'use client';

import React, { useState } from 'react';
import { 
  ArrowLeft, 
  UserPlus, 
  Trash2, 
  Clock, 
  User, 
  Briefcase, 
  AlertTriangle,
  LogOut,
  Users,
  ShieldCheck,
  CheckCircle,
  Building,
  Save,
  Phone
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { logout } from '@/app/auth-actions';
import { saveOperator, deleteOperator, saveCompanySettings } from './actions';

interface Company {
  id: string;
  name: string;
  owner_whatsapp: string | null;
  owner_name: string | null;
}

interface Operator {
  id: string;
  company_id: string;
  name: string;
  role: string | null;
  work_hours: string | null;
  created_at: string;
}

interface SettingsClientProps {
  company: Company | null;
  initialOperators: Operator[];
  lastStatusLog?: { status: string; created_at: string } | null;
  userRole: string;
}

type TabType = 'company' | 'team';

export default function SettingsClient({ company, initialOperators, lastStatusLog, userRole }: SettingsClientProps) {
  const router = useRouter();
  const params = useParams();
  const tenantSlug = params.tenant_slug as string;

  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  const [activeTab, setActiveTab] = useState<TabType>('company');
  const [operators, setOperators] = useState<Operator[]>(initialOperators);
  
  // Loading & State
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [isSavingOperator, setIsSavingOperator] = useState(false);
  const [isDeletingOperator, setIsDeletingOperator] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states - Company Settings
  const [companyName, setCompanyName] = useState(company?.name || '');
  const [ownerName, setOwnerName] = useState(company?.owner_name || '');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(company?.owner_whatsapp || '');

  // Form states - Operator
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [workHours, setWorkHours] = useState('');

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });
  };

  const handleSignOut = async () => {
    await logout();
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;

    setIsSavingCompany(true);
    setNotification(null);

    // Clean phone input to have only digits
    const cleanedPhone = ownerWhatsapp.replace(/[^0-9]/g, '');

    const result = await saveCompanySettings({
      company_id: company.id,
      name: companyName.trim(),
      owner_name: ownerName.trim(),
      owner_whatsapp: cleanedPhone
    });

    setIsSavingCompany(false);

    if (result.success) {
      setNotification({ type: 'success', message: 'Configurações da empresa salvas com sucesso!' });
      router.refresh();
      window.location.reload();
      setTimeout(() => setNotification(null), 4000);
    } else {
      setNotification({ type: 'error', message: `Erro ao salvar: ${result.error}` });
    }
  };

  const handleAddOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSavingOperator(true);
    setNotification(null);

    const result = await saveOperator({
      company_id: company?.id || '',
      name: name.trim(),
      role: role.trim() || undefined,
      work_hours: workHours.trim() || undefined
    });

    setIsSavingOperator(false);

    if (result.success) {
      setNotification({ type: 'success', message: 'Operador cadastrado com sucesso!' });
      setName('');
      setRole('');
      setWorkHours('');
      router.refresh();
      // Reload page to force Server Props update
      window.location.reload();
      setTimeout(() => setNotification(null), 4000);
    } else {
      setNotification({ type: 'error', message: `Erro ao cadastrar: ${result.error}` });
    }
  };

  const handleDeleteOperator = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este operador?')) return;

    setIsDeletingOperator(id);
    setNotification(null);

    const result = await deleteOperator(id);
    setIsDeletingOperator(null);

    if (result.success) {
      setNotification({ type: 'success', message: 'Operador removido com sucesso!' });
      setOperators(operators.filter(op => op.id !== id));
      router.refresh();
      setTimeout(() => setNotification(null), 4000);
    } else {
      setNotification({ type: 'error', message: `Erro ao remover: ${result.error}` });
    }
  };

  if (!company) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-center items-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md text-center shadow-sm">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4 animate-bounce" />
          <h2 className="text-xl font-bold mb-2">Nenhuma Empresa Encontrada</h2>
          <p className="text-slate-500 text-sm mb-6">
            Você precisa ter pelo menos uma empresa cadastrada para acessar as configurações.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm text-slate-700 transition-colors flex items-center gap-2 mx-auto cursor-pointer shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {lastStatusLog?.status === 'close' && (
        <div className="bg-red-600 text-white px-6 py-3 relative z-20 shadow-md">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-white shrink-0 animate-pulse" />
              <span className="text-sm font-medium">
                <strong>Atenção:</strong> A integração com o WhatsApp está offline desde{' '}
                <span className="font-bold underline">{formatDate(lastStatusLog.created_at)}</span>. 
                As mensagens enviadas ou recebidas durante este período não estão sendo monitoradas.
              </span>
            </div>
            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard/whatsapp`)}
              className="px-3 py-1.5 bg-white text-red-650 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm shrink-0"
            >
              Reconectar WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 px-6 py-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard`)}
              className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-sm"
              title="Voltar ao Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-emerald-600" />
                <h1 className="text-base font-bold text-slate-900">Configurações Gerais</h1>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                {company.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSignOut}
              className="p-2 bg-white border border-slate-200 hover:border-red-500/30 hover:bg-red-50 text-slate-500 hover:text-red-650 rounded-lg transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-sm"
              title="Sair do Sistema"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        
        {notification && (
          <div className={`mb-6 p-4 rounded-xl border text-xs font-semibold flex items-center gap-2.5 shadow-sm ${
            notification.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-250 text-rose-800'
          }`}>
            {notification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 mb-6 shrink-0">
          <button
            onClick={() => setActiveTab('company')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'company'
                ? 'border-emerald-500 text-emerald-650'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Building className="w-4 h-4" />
            Dados da Empresa
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'team'
                ? 'border-emerald-500 text-emerald-650'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Users className="w-4 h-4" />
            Gestão de Equipe
          </button>
        </div>

        {/* Tab content: Company Settings */}
        {activeTab === 'company' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-xl">
            <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Building className="w-4 h-4 text-emerald-600" />
              Configurações da Empresa
            </h2>

            {!isAdmin ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
                <ShieldCheck className="w-5 h-5 text-amber-600 mb-2" />
                <strong>Acesso restrito:</strong> Apenas administradores do sistema podem alterar as configurações da empresa.
              </div>
            ) : (
              <form onSubmit={handleSaveCompany} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Nome da Empresa
                  </label>
                  <div className="relative">
                    <Building className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: Minha Empresa"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Nome do Gestor
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Ex: Carlos Silva"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    WhatsApp do Gestor (Alertas)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Ex: 5585999999999"
                      value={ownerWhatsapp}
                      onChange={(e) => setOwnerWhatsapp(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm"
                    />
                  </div>
                  <p className="text-[10px] text-slate-450 mt-1.5 leading-relaxed">
                    Insira o número completo com DDI (55 para Brasil) e DDD, apenas números. Alertas automáticos serão enviados para este contato quando a IA avaliar um atendimento comercial com nota inferior ou igual a 50.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSavingCompany}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 rounded-xl text-xs font-medium text-white transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-500/10"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSavingCompany ? 'Salvando...' : 'Salvar Configurações'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Tab content: Team Management */}
        {activeTab === 'team' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start animate-fade-in">
            {/* Form Column */}
            <div className="md:col-span-5 space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                  Cadastrar Operador
                </h2>

                {!isAdmin ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
                    <ShieldCheck className="w-5 h-5 text-amber-600 mb-2" />
                    <strong>Acesso restrito:</strong> Apenas administradores do sistema podem cadastrar ou remover operadores da equipe.
                  </div>
                ) : (
                  <form onSubmit={handleAddOperator} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Nome do Atendente *
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          placeholder="Ex: João Silva"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Cargo / Função <span className="text-[10px] text-slate-400 font-normal">(Opcional)</span>
                      </label>
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Ex: Vendedor, Suporte"
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Horário de Atendimento <span className="text-[10px] text-slate-400 font-normal">(Opcional)</span>
                      </label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Ex: Seg a Sex, 09h às 18h"
                          value={workHours}
                          onChange={(e) => setWorkHours(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingOperator}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 rounded-xl text-xs font-medium text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-500/10"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      {isSavingOperator ? 'Cadastrando...' : 'Cadastrar Operador'}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* List Column */}
            <div className="md:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                Operadores Cadastrados ({operators.length})
              </h2>

              {operators.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50 flex flex-col justify-center items-center">
                  <Users className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-xs text-slate-500">Nenhum operador cadastrado ainda.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                  {operators.map((op) => (
                    <div key={op.id} className="py-3.5 flex justify-between items-center gap-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold text-slate-800 truncate">{op.name}</h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-slate-500">
                          {op.role && (
                            <span className="flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-slate-400" />
                              {op.role}
                            </span>
                          )}
                          {op.work_hours && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {op.work_hours}
                            </span>
                          )}
                        </div>
                      </div>

                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteOperator(op.id)}
                          disabled={isDeletingOperator === op.id}
                          className="p-1.5 border border-slate-100 hover:border-red-250 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Remover Operador"
                        >
                          <Trash2 className={`w-3.5 h-3.5 ${isDeletingOperator === op.id ? 'animate-pulse' : ''}`} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
