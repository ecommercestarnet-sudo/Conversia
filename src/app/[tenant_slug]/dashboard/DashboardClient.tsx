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
  ExternalLink
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { logout } from '@/app/auth-actions';

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
  created_at: string;
  analyses?: Analysis[] | Analysis | null;
  messages?: Message[];
}

interface Organization {
  id: string;
  name: string;
  whatsapp_status: string | null;
}

interface DashboardClientProps {
  initialConversations: Conversation[];
  organization: Organization;
}

export default function DashboardClient({ initialConversations, organization }: DashboardClientProps) {
  const router = useRouter();
  const params = useParams();
  const tenantSlug = params.tenant_slug as string;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string | number | null>(
    initialConversations.length > 0 ? initialConversations[0].id : null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);

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

  // Filter conversations based on search term
  const filteredConversations = useMemo(() => {
    return initialConversations.filter(conv => {
      const phone = conv.client_phone || '';
      return phone.includes(searchTerm.replace(/[^0-9]/g, '')) || phone.includes(searchTerm);
    });
  }, [initialConversations, searchTerm]);

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
    if (score >= 80) return 'text-emerald-450 bg-emerald-500/10 border-emerald-500/30';
    if (score >= 50) return 'text-amber-450 bg-amber-500/10 border-amber-500/30';
    return 'text-rose-450 bg-rose-500/10 border-rose-500/30';
  };

  const getScoreProgressColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
    if (score >= 50) return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]';
    return 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
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
                <Sparkles className="w-5 h-5 animate-pulse" />
              </span>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                ConversIA
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Dashboard de Auditoria e Inteligência Comercial para Academias
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
                className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
            
            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard/playbook`)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-lg text-sm font-medium text-white transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20 shrink-0"
            >
              <BookOpen className="w-4 h-4" />
              <span>Playbook de IA</span>
            </button>

            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard/whatsapp`)}
              className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-lg text-sm font-medium text-slate-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Phone className="w-4 h-4" />
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
              className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-lg text-slate-300 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center shrink-0 cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <button
              onClick={handleSignOut}
              className="p-2 bg-slate-900 border border-slate-800 hover:border-red-500/30 hover:bg-red-500/10 text-slate-350 hover:text-red-400 rounded-lg transition-all flex items-center justify-center shrink-0 cursor-pointer"
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
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 flex items-center justify-between transition-all duration-300 hover:border-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 text-emerald-450 rounded-lg border border-emerald-500/20">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Média Geral</div>
                <div className="text-base font-extrabold text-slate-200 mt-0.5">{metrics.averageScore}%</div>
              </div>
            </div>
            <span className="text-[10px] text-slate-500">meta: &gt;80%</span>
          </div>

          {/* Card 2: Conversas Analisadas */}
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 flex items-center justify-between transition-all duration-300 hover:border-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Cobertura do Robô</div>
                <div className="text-base font-extrabold text-slate-200 mt-0.5">
                  {metrics.analyzedCount} <span className="text-xs text-slate-500 font-normal">/ {metrics.totalCount} leads</span>
                </div>
              </div>
            </div>
            <span className="text-[10px] text-slate-500">
              {metrics.totalCount > 0 ? `${Math.round((metrics.analyzedCount / metrics.totalCount) * 100)}%` : '0%'}
            </span>
          </div>

          {/* Card 3: Objeções mais frequentes */}
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 flex items-center transition-all duration-300 hover:border-slate-800/50">
            <div className="flex items-center gap-3 min-w-0 w-full">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Objeções mais Comuns</div>
                <div className="text-xs font-bold text-amber-400 truncate mt-0.5">{metrics.topObjections}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Workspace Columns (2 Columns WhatsApp-Web Style Layout) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Left Column: Conversas List */}
          <div className="lg:col-span-4 bg-slate-950/40 border border-slate-900 rounded-2xl p-4 flex flex-col h-[calc(100vh-230px)]">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-1 shrink-0">
              Lista de Atendimentos ({filteredConversations.length})
            </h2>

            {filteredConversations.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-900/10 flex-1 flex flex-col justify-center items-center">
                <MessageSquare className="w-8 h-8 text-slate-650 mb-2 animate-pulse" />
                <p className="text-xs text-slate-500">Nenhum atendimento registrado.</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                {filteredConversations.map((conv) => {
                  const analysis = getAnalysis(conv);
                  const isSelected = selectedId === conv.id;
                  const latestMsg = conv.messages && conv.messages.length > 0 
                    ? conv.messages[conv.messages.length - 1].content 
                    : 'Sem histórico de mensagens';

                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedId(conv.id)}
                      className={`group cursor-pointer border rounded-xl p-3.5 transition-all duration-200 text-left ${
                        isSelected 
                          ? 'bg-indigo-650/15 border-indigo-500/40 shadow-lg' 
                          : 'bg-slate-900/20 border-slate-900/80 hover:bg-slate-900/40 hover:border-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                          <span className="truncate">{formatPhoneNumber(conv.client_phone)}</span>
                        </div>
                        {analysis ? (
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 ${getScoreColor(analysis.overall_score)}`}>
                            {analysis.overall_score} pts
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-slate-850 text-slate-500 border border-slate-850 shrink-0">
                            Pendente
                          </span>
                        )}
                      </div>
                      
                      <p className="text-xs text-slate-400 truncate line-clamp-1 mb-2 font-medium">
                        {latestMsg}
                      </p>

                      <div className="flex items-center justify-between text-[9px] text-slate-500 font-semibold">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          {formatDate(conv.created_at)}
                        </span>
                        {conv.messages && (
                          <span>{conv.messages.length} msgs</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: WhatsApp Web Styled Chat Area */}
          <div className="lg:col-span-8 flex flex-col h-[calc(100vh-230px)]">
            {selectedConversation ? (
              <div className="bg-slate-950/40 border border-slate-900 rounded-2xl flex flex-col h-full overflow-hidden">
                
                {/* Chat Area Header */}
                <div className="flex justify-between items-center bg-slate-900/40 border-b border-slate-900 px-6 py-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-650/15 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-200">
                        {formatPhoneNumber(selectedConversation.client_phone)}
                      </h2>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        Criado em {formatDate(selectedConversation.created_at)}
                      </p>
                    </div>
                  </div>
                  
                  {activeAnalysis && (
                    <button
                      onClick={() => setIsAuditOpen(true)}
                      className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ver Auditoria Comercial</span>
                    </button>
                  )}
                </div>

                {/* Messages Timeline (WhatsApp style layout) */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-[#0a0d14]/40 custom-scrollbar">
                  {sortedMessages.length === 0 ? (
                    <div className="flex-1 flex flex-col justify-center items-center text-slate-500">
                      <MessageSquare className="w-8 h-8 text-slate-650 mb-2 animate-bounce" />
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
                                ? 'bg-indigo-600/15 border border-indigo-500/20 text-slate-100 rounded-tr-none'
                                : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-none'
                            }`}
                          >
                            <p className="whitespace-pre-line leading-relaxed text-xs">{msg.content}</p>
                          </div>
                          
                          {/* Meta info below bubble */}
                          <span className="text-[9px] text-slate-500 mt-1 px-1 font-semibold">
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
              <div className="flex flex-col items-center justify-center border border-slate-900 bg-slate-950/20 rounded-2xl h-full text-center p-8">
                <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-full mb-4">
                  <MessageSquare className="w-10 h-10 text-indigo-400 animate-pulse" />
                </div>
                <h3 className="text-sm font-bold text-slate-200 mb-1">Nenhum atendimento selecionado</h3>
                <p className="text-xs text-slate-500 max-w-xs">
                  Selecione um cliente na lista à esquerda para carregar o histórico de mensagens e ter acesso à auditoria de IA.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modern, Dark-themed AI Audit Modal - Full Screen */}
      {isAuditOpen && activeAnalysis && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#07090e] animate-fade-in w-screen h-screen">
          
          {/* Modal Header */}
          <div className="flex justify-between items-center border-b border-slate-900 px-6 py-4 bg-slate-950/60 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-600/10 text-indigo-400 rounded-md border border-indigo-500/20">
                <Sparkles className="w-4 h-4 animate-pulse" />
              </span>
              <h2 className="text-sm font-bold text-slate-205">Auditoria Comercial da IA</h2>
            </div>
            <button 
              onClick={() => setIsAuditOpen(false)}
              className="text-slate-400 hover:text-white p-2 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer text-xl font-bold flex items-center justify-center shrink-0 w-8 h-8"
            >
              &times;
            </button>
          </div>
          
          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-gradient-to-b from-slate-950/20 to-transparent">
            <div className="max-w-5xl mx-auto space-y-6">
              
              {/* Score & Resumo Row */}
              <div className="flex flex-col md:flex-row gap-5 items-stretch">
                <div className={`p-6 rounded-xl border flex flex-col items-center justify-center w-full md:w-32 shrink-0 ${getScoreColor(activeAnalysis.overall_score)}`}>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Score Geral</span>
                  <span className="text-4xl font-black mt-1.5">{activeAnalysis.overall_score}%</span>
                </div>
                <div className="flex-1 flex flex-col">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Resumo do Atendimento</h3>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-4 border border-slate-900 rounded-xl flex-1">
                    {activeAnalysis.summary}
                  </p>
                </div>
              </div>

              {/* Criteria Scores Grid */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Critérios de Avaliação</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  
                  {/* Empathy */}
                  <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-3.5">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-indigo-455" />
                        Empatia
                      </span>
                      <span className="text-xs font-bold text-slate-200">{activeAnalysis.scores.empathy}/100</span>
                    </div>
                    <div className="w-full bg-slate-800/60 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full ${getScoreProgressColor(activeAnalysis.scores.empathy)}`} style={{ width: `${activeAnalysis.scores.empathy}%` }} />
                    </div>
                  </div>
                  
                  {/* Response Time */}
                  <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-3.5">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        Tempo de Resposta
                      </span>
                      <span className="text-xs font-bold text-slate-200">{activeAnalysis.scores.response_time}/100</span>
                    </div>
                    <div className="w-full bg-slate-800/60 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full ${getScoreProgressColor(activeAnalysis.scores.response_time)}`} style={{ width: `${activeAnalysis.scores.response_time}%` }} />
                    </div>
                  </div>

                  {/* Investigation */}
                  <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-3.5">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-amber-405" />
                        Investigação
                      </span>
                      <span className="text-xs font-bold text-slate-200">{activeAnalysis.scores.investigation}/100</span>
                    </div>
                    <div className="w-full bg-slate-800/60 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full ${getScoreProgressColor(activeAnalysis.scores.investigation)}`} style={{ width: `${activeAnalysis.scores.investigation}%` }} />
                    </div>
                  </div>

                  {/* Closing */}
                  <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-3.5">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-rose-455" />
                        Fechamento
                      </span>
                      <span className="text-xs font-bold text-slate-200">{activeAnalysis.scores.closing}/100</span>
                    </div>
                    <div className="w-full bg-slate-800/60 h-1.5 rounded-full overflow-hidden">
                      <div className={`h-full ${getScoreProgressColor(activeAnalysis.scores.closing)}`} style={{ width: `${activeAnalysis.scores.closing}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Strengths & Weaknesses Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                    <ThumbsUp className="w-3.5 h-3.5 text-emerald-450" />
                    Pontos Fortes
                  </h4>
                  {activeAnalysis.strengths.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {activeAnalysis.strengths.map((str, idx) => (
                        <li key={idx} className="flex gap-2 leading-relaxed">
                          <span className="text-emerald-450 font-bold select-none">✓</span>
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-slate-500">Nenhum ponto forte destacado.</p>
                  )}
                </div>

                {/* Weaknesses */}
                <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                    <ThumbsDown className="w-3.5 h-3.5 text-rose-455" />
                    Pontos Fracos
                  </h4>
                  {activeAnalysis.weaknesses.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {activeAnalysis.weaknesses.map((weak, idx) => (
                        <li key={idx} className="flex gap-2 leading-relaxed">
                          <span className="text-rose-455 font-bold select-none">✗</span>
                          <span>{weak}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-slate-500">Nenhum ponto fraco destacado.</p>
                  )}
                </div>
              </div>

              {/* Recommendations & Objections Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Recommendations */}
                <div className="bg-indigo-950/20 border border-indigo-900/35 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-indigo-300 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Recomendações Práticas
                  </h4>
                  {activeAnalysis.recommendations.length > 0 ? (
                    <ol className="space-y-2 text-xs text-indigo-200/90 list-decimal pl-4">
                      {activeAnalysis.recommendations.map((rec, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {rec}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-[10px] text-slate-555">Nenhuma recomendação prática.</p>
                  )}
                </div>

                {/* Objections */}
                <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Objeções Comerciais
                  </h4>
                  {activeAnalysis.objections.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {activeAnalysis.objections.map((obj, idx) => (
                        <span key={idx} className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          {obj}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-555">Nenhuma objeção comercial detectada.</p>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Modal Footer */}
          <div className="border-t border-slate-900 px-6 py-4 bg-slate-950/60 backdrop-blur-md flex justify-end shrink-0">
            <button 
              onClick={() => setIsAuditOpen(false)}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold cursor-pointer border border-slate-800 transition-colors shadow-lg"
            >
              Fechar Auditoria
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
