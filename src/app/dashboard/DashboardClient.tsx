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
  Target
} from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  sender_type: 'agent' | 'client';
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

interface DashboardClientProps {
  initialConversations: Conversation[];
}

export default function DashboardClient({ initialConversations }: DashboardClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string | number | null>(
    initialConversations.length > 0 ? initialConversations[0].id : null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refresh page data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    router.refresh();
    // Simulate dynamic loading feedback
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

  // 1. Calculations & Metrics
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
    
    // Sort objections by frequency
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

  // 2. Filter conversations based on search term
  const filteredConversations = useMemo(() => {
    return initialConversations.filter(conv => {
      const phone = conv.client_phone || '';
      return phone.includes(searchTerm.replace(/[^0-9]/g, '')) || phone.includes(searchTerm);
    });
  }, [initialConversations, searchTerm]);

  // 3. Resolve active selection
  const selectedConversation = useMemo(() => {
    const found = initialConversations.find(c => c.id === selectedId);
    if (found) return found;
    return initialConversations.length > 0 ? initialConversations[0] : null;
  }, [initialConversations, selectedId]);

  const activeAnalysis = selectedConversation ? getAnalysis(selectedConversation) : null;
  
  const sortedMessages = useMemo(() => {
    if (!selectedConversation?.messages) return [];
    return [...selectedConversation.messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [selectedConversation]);

  // Helper formatting functions
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '';
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.length === 13) {
      // DDI (55) DDD (XX) NÚMERO (XXXXX-XXXX)
      return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    if (clean.length === 11) {
      // DDD (XX) NÚMERO (XXXXX-XXXX)
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    }
    return phone;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (score >= 50) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
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
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-lg text-slate-300 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Top Cards (Metrics Grid) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Card 1: Score Geral */}
          <div className="relative overflow-hidden bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 transition-all duration-300 hover:border-slate-700/50 hover:shadow-lg hover:shadow-indigo-500/5">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <TrendingUp className="w-16 h-16 text-indigo-500" />
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-slate-400">Média Geral do Atendimento</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                {metrics.averageScore}%
              </span>
              <span className="text-xs text-slate-400">meta: &gt;80%</span>
            </div>
            <div className="w-full bg-slate-800/80 h-1.5 rounded-full mt-3 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                style={{ width: `${metrics.averageScore}%` }}
              />
            </div>
          </div>

          {/* Card 2: Conversas Analisadas */}
          <div className="relative overflow-hidden bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 transition-all duration-300 hover:border-slate-700/50 hover:shadow-lg hover:shadow-indigo-500/5">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <MessageSquare className="w-16 h-16 text-indigo-500" />
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-slate-400">Total Analisadas / Cadastradas</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-slate-200">
                {metrics.analyzedCount}
              </span>
              <span className="text-sm text-slate-400">/ {metrics.totalCount} conversas</span>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              {metrics.totalCount > 0 
                ? `${Math.round((metrics.analyzedCount / metrics.totalCount) * 100)}% de cobertura do robô` 
                : 'Nenhum lead registrado'}
            </p>
          </div>

          {/* Card 3: Objeções mais frequentes */}
          <div className="relative overflow-hidden bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-2xl p-6 transition-all duration-300 hover:border-slate-700/50 hover:shadow-lg hover:shadow-indigo-500/5">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <AlertTriangle className="w-16 h-16 text-indigo-500" />
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium text-slate-400">Objeções mais Comuns</span>
            </div>
            <div className="text-sm font-bold tracking-tight text-amber-400 truncate mt-1">
              {metrics.topObjections}
            </div>
            <p className="text-xs text-slate-500 mt-5">
              Gatilhos de resistência detectados pela IA nas conversas
            </p>
          </div>
        </section>

        {/* Workspace Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Conversas List (4/12 col span) */}
          <div className="lg:col-span-4 bg-slate-950/40 border border-slate-900 rounded-2xl p-4 min-h-[500px]">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 px-1">
              Lista de Leads ({filteredConversations.length})
            </h2>

            {filteredConversations.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
                <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Nenhuma conversa encontrada.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {filteredConversations.map((conv) => {
                  const analysis = getAnalysis(conv);
                  const isSelected = selectedConversation?.id === conv.id;
                  const latestMsg = conv.messages && conv.messages.length > 0 
                    ? conv.messages[conv.messages.length - 1].content 
                    : 'Nenhuma mensagem recebida';

                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedId(conv.id)}
                      className={`group cursor-pointer border rounded-xl p-4 transition-all duration-200 text-left ${
                        isSelected 
                          ? 'bg-indigo-600/10 border-indigo-500/50 shadow-md shadow-indigo-500/5' 
                          : 'bg-slate-900/20 border-slate-900 hover:bg-slate-900/40 hover:border-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                          <Phone className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                          <span className="truncate">{formatPhoneNumber(conv.client_phone)}</span>
                        </div>
                        {analysis ? (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${getScoreColor(analysis.overall_score)}`}>
                            {analysis.overall_score} pts
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-800 shrink-0">
                            Sem análise
                          </span>
                        )}
                      </div>
                      
                      {/* Short text snippet preview */}
                      <p className="text-xs text-slate-400 truncate line-clamp-1 mb-2">
                        {latestMsg}
                      </p>

                      <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(conv.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Analysis details (8/12 col span) */}
          <div className="lg:col-span-8">
            {selectedConversation ? (
              <div className="space-y-6">
                
                {/* Main Card with Overall Score and Criteria */}
                <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6 backdrop-blur-md">
                  
                  {/* Lead Info */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-900 pb-4 mb-6 gap-4">
                    <div>
                      <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">Atendimento Selecionado</span>
                      <h2 className="text-xl font-bold text-slate-100 mt-0.5">
                        {formatPhoneNumber(selectedConversation.client_phone)}
                      </h2>
                      <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(selectedConversation.created_at)}
                        </span>
                      </div>
                    </div>
                    
                    {activeAnalysis && (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-slate-400">Score Comercial</div>
                          <div className="text-2xl font-black text-slate-100">{activeAnalysis.overall_score}%</div>
                        </div>
                        <div className={`p-4 rounded-xl border flex items-center justify-center shrink-0 ${getScoreColor(activeAnalysis.overall_score)}`}>
                          <Target className="w-8 h-8" />
                        </div>
                      </div>
                    )}
                  </div>

                  {activeAnalysis ? (
                    <div>
                      {/* Grid of Scores */}
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Pontuação por Critérios</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Empathy */}
                        <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                              Empatia e Acolhimento
                            </span>
                            <span className="text-xs font-bold text-slate-200">{activeAnalysis.scores.empathy}/100</span>
                          </div>
                          <div className="w-full bg-slate-800/60 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${getScoreProgressColor(activeAnalysis.scores.empathy)}`}
                              style={{ width: `${activeAnalysis.scores.empathy}%` }}
                            />
                          </div>
                        </div>

                        {/* Response Time */}
                        <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-cyan-400" />
                              Tempo de Resposta
                            </span>
                            <span className="text-xs font-bold text-slate-200">{activeAnalysis.scores.response_time}/100</span>
                          </div>
                          <div className="w-full bg-slate-800/60 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${getScoreProgressColor(activeAnalysis.scores.response_time)}`}
                              style={{ width: `${activeAnalysis.scores.response_time}%` }}
                            />
                          </div>
                        </div>

                        {/* Investigation */}
                        <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                              Investigação e Diagnóstico
                            </span>
                            <span className="text-xs font-bold text-slate-200">{activeAnalysis.scores.investigation}/100</span>
                          </div>
                          <div className="w-full bg-slate-800/60 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${getScoreProgressColor(activeAnalysis.scores.investigation)}`}
                              style={{ width: `${activeAnalysis.scores.investigation}%` }}
                            />
                          </div>
                        </div>

                        {/* Closing */}
                        <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5 text-rose-400" />
                              Tentativa de Fechamento
                            </span>
                            <span className="text-xs font-bold text-slate-200">{activeAnalysis.scores.closing}/100</span>
                          </div>
                          <div className="w-full bg-slate-800/60 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${getScoreProgressColor(activeAnalysis.scores.closing)}`}
                              style={{ width: `${activeAnalysis.scores.closing}%` }}
                            />
                          </div>
                        </div>

                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      Este atendimento ainda não possui relatório de auditoria comercial gerado.
                    </div>
                  )}
                </div>

                {activeAnalysis && (
                  <>
                    {/* Summary Section */}
                    <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Resumo da Conversa</h3>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {activeAnalysis.summary}
                      </p>
                    </div>

                    {/* Strengths & Weaknesses (Grid) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Strengths */}
                      <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <ThumbsUp className="w-4 h-4 text-emerald-400" />
                          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Pontos Fortes</h3>
                        </div>
                        {activeAnalysis.strengths.length > 0 ? (
                          <ul className="space-y-2">
                            {activeAnalysis.strengths.map((str, idx) => (
                              <li key={idx} className="flex gap-2 text-sm text-slate-300">
                                <span className="text-emerald-400 shrink-0 select-none">✓</span>
                                <span>{str}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-500">Nenhum ponto forte destacado.</p>
                        )}
                      </div>

                      {/* Weaknesses */}
                      <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <ThumbsDown className="w-4 h-4 text-rose-400" />
                          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Pontos Fracos</h3>
                        </div>
                        {activeAnalysis.weaknesses.length > 0 ? (
                          <ul className="space-y-2">
                            {activeAnalysis.weaknesses.map((weak, idx) => (
                              <li key={idx} className="flex gap-2 text-sm text-slate-300">
                                <span className="text-rose-400 shrink-0 select-none">✗</span>
                                <span>{weak}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-500">Nenhum ponto fraco destacado.</p>
                        )}
                      </div>

                    </div>

                    {/* Recommendations & Objections */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Recommendations */}
                      <div className="bg-indigo-900/5 border border-slate-900 rounded-2xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Sparkles className="w-4 h-4 text-indigo-400" />
                          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Recomendações Práticas</h3>
                        </div>
                        {activeAnalysis.recommendations.length > 0 ? (
                          <ul className="space-y-2.5">
                            {activeAnalysis.recommendations.map((rec, idx) => (
                              <li key={idx} className="flex gap-2 text-sm text-indigo-200">
                                <span className="text-indigo-400 font-semibold shrink-0 select-none">{idx + 1}.</span>
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-500">Nenhuma recomendação cadastrada.</p>
                        )}
                      </div>

                      {/* Objections */}
                      <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Objeções Identificadas</h3>
                        </div>
                        {activeAnalysis.objections.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {activeAnalysis.objections.map((obj, idx) => (
                              <span 
                                key={idx} 
                                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20"
                              >
                                {obj}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">Nenhuma objeção comercial explícita detectada.</p>
                        )}
                      </div>

                    </div>
                  </>
                )}

                {/* WhatsApp Chat Timeline (Premium Feature) */}
                <div className="bg-slate-950/60 border border-slate-900 rounded-2xl p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Histórico de Mensagens</h3>
                    <span className="text-[10px] text-slate-500">{sortedMessages.length} mensagens no total</span>
                  </div>

                  {sortedMessages.length === 0 ? (
                    <p className="text-xs text-center py-6 text-slate-600">Sem histórico disponível.</p>
                  ) : (
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 flex flex-col">
                      {sortedMessages.map((msg) => {
                        const isAgent = msg.sender_type === 'agent';
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col max-w-[85%] ${
                              isAgent ? 'self-end items-end' : 'self-start items-start'
                            }`}
                          >
                            {/* Message Bubble */}
                            <div
                              className={`rounded-2xl px-4 py-2.5 text-sm ${
                                isAgent
                                  ? 'bg-indigo-600/20 border border-indigo-500/20 text-slate-100 rounded-tr-none'
                                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                              }`}
                            >
                              <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>
                            </div>
                            
                            {/* Meta info below bubble */}
                            <span className="text-[9px] text-slate-500 mt-1 px-1">
                              {isAgent ? 'Atendente' : 'Cliente'} • {formatDate(msg.created_at)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              /* Selected leads empty state */
              <div className="flex flex-col items-center justify-center border border-slate-900 bg-slate-950/20 rounded-2xl min-h-[500px] text-center p-8">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-full mb-4">
                  <MessageSquare className="w-10 h-10 text-indigo-400 animate-pulse" />
                </div>
                <h3 className="text-base font-bold text-slate-200 mb-1">Nenhum atendimento selecionado</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Escolha um atendimento na lista à esquerda para carregar o histórico completo e as notas de auditoria geradas pela IA.
                </p>
              </div>
            )}
          </div>

        </div>

      </main>
    </div>
  );
}
