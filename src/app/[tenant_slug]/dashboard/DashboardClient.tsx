'use client';

import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  MessageSquare, 
  TrendingUp, 
  AlertTriangle, 
  Search, 
  RefreshCw, 
  Phone, 
  Calendar, 
  ThumbsUp, 
  ThumbsDown, 
  Sparkles, 
  HelpCircle,
  Clock,
  UserCheck,
  Zap,
  Target,
  BookOpen,
  LogOut,
  ExternalLink,
  Users,
  Settings
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { logout } from '@/app/auth-actions';
import { assignOperatorToConversation } from './settings/actions';

interface Analysis {
  id: string | number;
  overall_score: number;
  scores: {
    empathy: number;
    response_time: number;
    investigation: number;
    closing: number;
  };
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  objections: string[];
  created_at: string;
}

interface Message {
  id: string | number;
  sender_type: 'agent' | 'client' | 'atendente' | 'cliente';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string | number;
  client_phone: string;
  operator_id?: string | null;
  created_at: string;
  analyses?: Analysis[] | Analysis | null;
  messages?: Message[];
}

interface Operator {
  id: string;
  name: string;
  role: string | null;
  work_hours: string | null;
}

interface Organization {
  id: string;
  name: string;
  whatsapp_status: string | null;
}

interface DashboardClientProps {
  initialConversations: Conversation[];
  organization: Organization;
  lastStatusLog?: { status: string; created_at: string } | null;
  operators: Operator[];
}

export default function DashboardClient({ initialConversations, organization, lastStatusLog, operators }: DashboardClientProps) {
  const router = useRouter();
  const params = useParams();
  const tenantSlug = params.tenant_slug as string;

  const [searchTerm, setSearchTerm] = useState('');
  const [operatorFilter, setOperatorFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | number | null>(
    initialConversations.length > 0 ? initialConversations[0].id : null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const handleSignOut = async () => {
    await logout();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  // Safe helper to extract active analysis
  const getAnalysis = (conv: Conversation): Analysis | null => {
    if (!conv.analyses) return null;
    if (Array.isArray(conv.analyses)) {
      return conv.analyses.length > 0 ? conv.analyses[0] : null;
    }
    return conv.analyses;
  };

  // Calculations & Metrics
  const metrics = useMemo(() => {
    let totalScore = 0;
    let analyzedCount = 0;
    const objectionCounts: Record<string, number> = {};

    initialConversations.forEach(conv => {
      const analysis = getAnalysis(conv);
      if (analysis) {
        analyzedCount++;
        totalScore += analysis.overall_score;

        if (Array.isArray(analysis.objections)) {
          analysis.objections.forEach(obj => {
            if (obj && typeof obj === 'string') {
              const normalized = obj.trim();
              objectionCounts[normalized] = (objectionCounts[normalized] || 0) + 1;
            }
          });
        }
      }
    });

    const averageScore = analyzedCount > 0 ? Math.round(totalScore / analyzedCount) : 0;
    
    const topObjections = Object.entries(objectionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} (${count})`);

    return {
      averageScore,
      analyzedCount,
      totalCount: initialConversations.length,
      topObjections: topObjections.length > 0 ? topObjections.join(', ') : 'Nenhuma identificada',
    };
  }, [initialConversations]);

  // Filter conversations based on search term and operator filter
  const filteredConversations = useMemo(() => {
    return initialConversations.filter(conv => {
      const phone = conv.client_phone || '';
      const matchesSearch = phone.includes(searchTerm.replace(/[^0-9]/g, '')) || phone.includes(searchTerm);
      const matchesOperator = operatorFilter === 'all' || 
        (operatorFilter === 'unassigned' && !conv.operator_id) || 
        conv.operator_id === operatorFilter;
      return matchesSearch && matchesOperator;
    });
  }, [initialConversations, searchTerm, operatorFilter]);

  // Resolve active selection
  const selectedConversation = useMemo(() => {
    const found = initialConversations.find(c => c.id === selectedId);
    if (found) return found;
    return initialConversations.length > 0 ? initialConversations[0] : null;
  }, [initialConversations, selectedId]);

  const activeAnalysis = selectedConversation ? getAnalysis(selectedConversation) : null;
  
  const sortedMessages = useMemo(() => {
    if (!selectedConversation?.messages) return [];
    return [...selectedConversation.messages].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [selectedConversation]);

  const formatPhoneNumber = (phone: string) => {
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.length === 13) {
      return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    }
    return phone;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (score >= 50) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-rose-700 bg-rose-50 border-rose-200';
  };

  const getScoreProgressColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-600';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {lastStatusLog?.status === 'close' && (
        <div className="bg-red-650 bg-red-600 text-white px-6 py-3 relative z-20 shadow-md">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
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
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center">
              <img src="/Logo.png" alt="SupervisIA Logo" className="h-10 md:h-12 w-auto object-contain" />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Monitoramento e Inteligência Comercial para Times de Vendas
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar cliente (telefone)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm"
              />
            </div>
            
            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard/playbook`)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg text-sm font-medium text-white transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-500/10 shrink-0"
            >
              <BookOpen className="w-4 h-4" />
              <span>Playbook de IA</span>
            </button>

            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard/settings`)}
              className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 transition-all flex items-center gap-2 cursor-pointer shrink-0 shadow-sm"
              title="Configurações Gerais"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>Configurações</span>
            </button>

            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard/whatsapp`)}
              className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 transition-all flex items-center gap-2 cursor-pointer shrink-0 shadow-sm"
            >
              <Phone className="w-4 h-4 text-slate-500" />
              <span>Conexão WhatsApp</span>
              {organization?.whatsapp_status === 'connected' ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" title="Conectado" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" title="Desconectado" />
              )}
            </button>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-slate-600 hover:text-slate-900 transition-all disabled:opacity-50 flex items-center justify-center shrink-0 cursor-pointer shadow-sm"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
            </button>

            <button
              onClick={handleSignOut}
              className="p-2 bg-white border border-slate-200 hover:border-red-500/30 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-sm"
              title="Sair do Sistema"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Top Cards (Metrics Grid) - Compact and Aligned */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          
          {/* Card 1: Score Geral */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between transition-all duration-300 hover:border-slate-300 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-500/10">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Média Geral</div>
                <div className="text-base font-extrabold text-slate-900 mt-0.5">{metrics.averageScore}%</div>
              </div>
            </div>
            <span className="text-[10px] text-slate-400">meta: &gt;80%</span>
          </div>

          {/* Card 2: Conversas Analisadas */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between transition-all duration-300 hover:border-slate-300 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 text-emerald-650 rounded-lg border border-emerald-500/10">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Cobertura do Robô</div>
                <div className="text-base font-extrabold text-slate-900 mt-0.5">
                  {metrics.analyzedCount} <span className="text-xs text-slate-400 font-normal">/ {metrics.totalCount} leads</span>
                </div>
              </div>
            </div>
            <span className="text-[10px] text-slate-400">
              {metrics.totalCount > 0 ? `${Math.round((metrics.analyzedCount / metrics.totalCount) * 100)}%` : '0%'}
            </span>
          </div>

          {/* Card 3: Objeções mais frequentes */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center transition-all duration-300 hover:border-slate-300 shadow-sm">
            <div className="flex items-center gap-3 min-w-0 w-full">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg border border-amber-500/10 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Objeções mais Comuns</div>
                <div className="text-xs font-bold text-amber-700 truncate mt-0.5">{metrics.topObjections}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Workspace Columns (2 Columns WhatsApp-Web Style Layout) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Left Column: Conversas List */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col h-[calc(100vh-230px)] shadow-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1 shrink-0">
              Lista de Atendimentos ({filteredConversations.length})
            </h2>

            {/* Operator Filter Dropdown */}
            <div className="mb-4 shrink-0 px-1">
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Filtrar por Atendente
              </label>
              <select
                value={operatorFilter}
                onChange={(e) => setOperatorFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm"
              >
                <option value="all">Todos os atendentes</option>
                <option value="unassigned">Sem atendente atribuído</option>
                {operators.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name} {op.role ? `(${op.role})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {filteredConversations.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50 flex-1 flex flex-col justify-center items-center">
                <MessageSquare className="w-8 h-8 text-slate-300 mb-2 animate-pulse" />
                <p className="text-xs text-slate-450">Nenhum atendimento registrado.</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                {filteredConversations.map((conv) => {
                  const analysis = getAnalysis(conv);
                  const isSelected = selectedId === conv.id;
                  const latestMsg = conv.messages && conv.messages.length > 0 
                    ? conv.messages[conv.messages.length - 1].content 
                    : 'Sem histórico de mensagens';
                  const assignedOperator = operators.find(op => op.id === conv.operator_id);

                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedId(conv.id)}
                      className={`group cursor-pointer border rounded-xl p-3.5 transition-all duration-205 text-left ${
                        isSelected 
                          ? 'bg-emerald-50 border-emerald-500/30 shadow-sm' 
                          : 'bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="truncate">{formatPhoneNumber(conv.client_phone)}</span>
                        </div>
                        {analysis ? (
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 ${getScoreColor(analysis.overall_score)}`}>
                            {analysis.overall_score} pts
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                            Pendente
                          </span>
                        )}
                      </div>
                      
                      <p className="text-xs text-slate-600 truncate line-clamp-1 mb-2 font-medium">
                        {latestMsg}
                      </p>

                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          {formatDate(conv.created_at)}
                        </span>
                        {conv.messages && (
                          <span>{conv.messages.length} msgs</span>
                        )}
                      </div>

                      {assignedOperator && (
                        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center gap-1 text-[9px] text-slate-500 font-semibold">
                          <Users className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                          <span className="truncate">Atendente: {assignedOperator.name}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: WhatsApp Web Styled Chat Area */}
          <div className="lg:col-span-8 flex flex-col h-[calc(100vh-230px)]">
            {selectedConversation ? (
              <div className="bg-white border border-slate-200 rounded-2xl flex flex-col h-full overflow-hidden shadow-sm">
                
                {/* Chat Area Header */}
                <div className="flex justify-between items-center bg-slate-50 border-b border-slate-200 px-6 py-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">
                        {formatPhoneNumber(selectedConversation.client_phone)}
                      </h2>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                        Criado em {formatDate(selectedConversation.created_at)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
                        Atendente:
                      </span>
                      <select
                        disabled={isAssigning}
                        value={selectedConversation.operator_id || ''}
                        onChange={async (e) => {
                          const opId = e.target.value === '' ? null : e.target.value;
                          setIsAssigning(true);
                          const res = await assignOperatorToConversation(selectedConversation.id, opId);
                          setIsAssigning(false);
                          if (res.success) {
                            selectedConversation.operator_id = opId || undefined;
                            router.refresh();
                          } else {
                            alert('Erro ao atribuir atendente: ' + res.error);
                          }
                        }}
                        className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                        <option value="">Não atribuído</option>
                        {operators.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {activeAnalysis && (
                      <button
                        onClick={() => setIsAuditOpen(true)}
                        className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-600 border border-emerald-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Ver Auditoria Comercial</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages Timeline (WhatsApp style layout) */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-[#efeae2] custom-scrollbar">
                  {sortedMessages.length === 0 ? (
                    <div className="flex-1 flex flex-col justify-center items-center text-slate-400">
                      <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-xs">Nenhuma mensagem registrada nesta conversa.</p>
                    </div>
                  ) : (
                    sortedMessages.map((msg) => {
                      const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'atendente';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col max-w-[75%] ${
                            isAgent ? 'self-end items-end' : 'self-start items-start'
                          }`}
                        >
                          {/* Message Bubble */}
                          <div
                            className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                              isAgent
                                ? 'bg-[#d9fdd3] border border-[#d9fdd3] text-slate-800 rounded-tr-none'
                                : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'
                            }`}
                          >
                            <p className="whitespace-pre-line leading-relaxed text-xs">{msg.content}</p>
                          </div>
                          
                          {/* Meta info below bubble */}
                          <span className="text-[9px] text-slate-400 mt-1 px-1 font-semibold">
                            {isAgent ? 'Atendente' : 'Cliente'} • {formatDate(msg.created_at).split(' ')[1]}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            ) : (
              /* Selected leads empty state */
              <div className="flex flex-col items-center justify-center border border-slate-200 bg-white rounded-2xl h-full text-center p-8 shadow-sm">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-full mb-4">
                  <MessageSquare className="w-10 h-10 text-emerald-600 animate-pulse" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">Nenhum atendimento selecionado</h3>
                <p className="text-xs text-slate-555 max-w-xs">
                  Selecione um cliente na lista à esquerda para carregar o histórico de mensagens e ter acesso à auditoria de IA.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modern, Light-themed AI Audit Modal - Full Screen */}
      {isAuditOpen && activeAnalysis && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 animate-fade-in w-screen h-screen">
          
          {/* Modal Header */}
          <div className="flex justify-between items-center border-b border-slate-200 px-6 py-4 bg-white shadow-sm shrink-0">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-500/20">
                <Sparkles className="w-4 h-4 animate-pulse" />
              </span>
              <h2 className="text-sm font-bold text-slate-900">Auditoria Comercial da IA</h2>
            </div>
            <button 
              onClick={() => setIsAuditOpen(false)}
              className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-xl font-bold flex items-center justify-center shrink-0 w-8 h-8"
            >
              &times;
            </button>
          </div>
          
          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-slate-50">
            <div className="max-w-5xl mx-auto space-y-6">
              
              {/* Score & Resumo Row */}
              <div className="flex flex-col md:flex-row gap-5 items-stretch">
                <div className={`p-6 rounded-xl border flex flex-col items-center justify-center w-full md:w-32 shrink-0 ${getScoreColor(activeAnalysis.overall_score)}`}>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Score Geral</span>
                  <span className="text-4xl font-black mt-1.5">{activeAnalysis.overall_score}%</span>
                </div>
                <div className="flex-1 flex flex-col">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Resumo do Atendimento</h3>
                  <p className="text-xs text-slate-700 leading-relaxed bg-white p-4 border border-slate-200 rounded-xl flex-1 shadow-sm">
                    {activeAnalysis.summary}
                  </p>
                </div>
              </div>

              {/* Criteria Scores Grid */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Critérios de Avaliação</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Empathy */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Empatia
                      </span>
                      <span className="text-xs font-bold text-slate-800">{activeAnalysis.scores.empathy}/100</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full ${getScoreProgressColor(activeAnalysis.scores.empathy)}`} style={{ width: `${activeAnalysis.scores.empathy}%` }} />
                    </div>
                  </div>
                  
                  {/* Response Time */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-cyan-500" />
                        Tempo de Resposta
                      </span>
                      <span className="text-xs font-bold text-slate-800">{activeAnalysis.scores.response_time}/100</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full ${getScoreProgressColor(activeAnalysis.scores.response_time)}`} style={{ width: `${activeAnalysis.scores.response_time}%` }} />
                    </div>
                  </div>

                  {/* Investigation */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                        Investigação
                      </span>
                      <span className="text-xs font-bold text-slate-800">{activeAnalysis.scores.investigation}/100</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full ${getScoreProgressColor(activeAnalysis.scores.investigation)}`} style={{ width: `${activeAnalysis.scores.investigation}%` }} />
                    </div>
                  </div>

                  {/* Closing */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-rose-500" />
                        Fechamento
                      </span>
                      <span className="text-xs font-bold text-slate-800">{activeAnalysis.scores.closing}/100</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full ${getScoreProgressColor(activeAnalysis.scores.closing)}`} style={{ width: `${activeAnalysis.scores.closing}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Checklist do Playbook (Avaliação Binária) */}
              {Array.isArray((activeAnalysis.scores as any)?.criteria_evaluation) && (
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    Checklist de Critérios Cumpridos (Playbook)
                  </h3>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3.5">
                    {((activeAnalysis.scores as any).criteria_evaluation as any[]).map((criterion, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-xs border-b border-slate-100 last:border-b-0 pb-3 last:pb-0">
                        {criterion.fulfilled ? (
                          <span className="text-emerald-600 font-bold select-none text-sm">✓</span>
                        ) : (
                          <span className="text-rose-505 text-rose-600 font-bold select-none text-sm">✗</span>
                        )}
                        <div>
                          <p className="font-bold text-slate-800">{criterion.item || criterion.criterion}</p>
                          <p className="text-slate-500 mt-0.5 leading-relaxed text-[11px]">{criterion.explanation || criterion.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths & Weaknesses Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                    <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
                    Pontos Fortes
                  </h4>
                  {activeAnalysis.strengths.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-slate-650">
                      {activeAnalysis.strengths.map((str, idx) => (
                        <li key={idx} className="flex gap-2 leading-relaxed">
                          <span className="text-emerald-600 font-bold select-none">✓</span>
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-slate-400">Nenhum ponto forte destacado.</p>
                  )}
                </div>

                {/* Weaknesses */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                    <ThumbsDown className="w-3.5 h-3.5 text-rose-500" />
                    Pontos Fracos
                  </h4>
                  {activeAnalysis.weaknesses.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-slate-650">
                      {activeAnalysis.weaknesses.map((weak, idx) => (
                        <li key={idx} className="flex gap-2 leading-relaxed">
                          <span className="text-rose-500 font-bold select-none">✗</span>
                          <span>{weak}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-slate-400">Nenhum ponto fraco destacado.</p>
                  )}
                </div>
              </div>

              {/* Recommendations & Objections Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Recommendations */}
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 shadow-sm">
                  <h4 className="text-xs font-bold text-emerald-800 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Recomendações Práticas
                  </h4>
                  {activeAnalysis.recommendations.length > 0 ? (
                    <ol className="space-y-2 text-xs text-slate-700 list-decimal pl-4">
                      {activeAnalysis.recommendations.map((rec, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {rec}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-[10px] text-slate-400">Nenhuma recomendação prática.</p>
                  )}
                </div>

                {/* Objections */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Objeções Comerciais
                  </h4>
                  {activeAnalysis.objections.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {activeAnalysis.objections.map((obj, idx) => (
                        <span key={idx} className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                          {obj}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400">Nenhuma objeção comercial detectada.</p>
                  )}
                </div>
              </div>

            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}
