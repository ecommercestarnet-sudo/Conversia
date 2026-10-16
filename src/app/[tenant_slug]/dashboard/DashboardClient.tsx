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
  Settings,
  Filter,
  Check,
  CheckCheck,
  MoreVertical,
  ChevronRight,
  User,
  ShieldCheck,
  LayoutDashboard
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
    status_comercial?: 'convertida' | 'em_risco' | 'perdida' | 'em_andamento';
    motivo_perda?: string | null;
    acao_resgate_sugerida?: string | null;
    _raciocinio_previo?: any;
    criterios?: any[];
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
  channel?: 'whatsapp' | 'instagram' | string;
  operator_id?: string | null;
  created_at: string;
  analyses?: Analysis[] | Analysis | null;
  messages?: Message[];
}

interface Operator {
  id: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  role: string | null;
  work_hours: string | null;
}

interface Organization {
  id: string;
  name: string;
  whatsapp_status: string | null;
  instagram_status?: string | null;
  instagram_username?: string | null;
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'em_risco' | 'perdida' | 'convertida'>('all');
  const [selectedId, setSelectedId] = useState<string | number | null>(
    initialConversations.length > 0 ? initialConversations[0].id : null
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isTeamRankingOpen, setIsTeamRankingOpen] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);

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

  // Extract commercial status helper
  const getCommercialStatus = (conv: Conversation): {
    status: 'convertida' | 'em_risco' | 'perdida' | 'em_andamento';
    motivo: string | null;
    acao: string | null;
  } => {
    const analysis = getAnalysis(conv);
    if (!analysis) {
      return { status: 'em_andamento', motivo: null, acao: null };
    }

    const scores = analysis.scores || {};
    const raciocinio = scores._raciocinio_previo || {};

    let status: 'convertida' | 'em_risco' | 'perdida' | 'em_andamento' = 
      scores.status_comercial || 
      raciocinio.status_comercial || 
      (raciocinio.conversa_convertida ? 'convertida' : 
       analysis.overall_score >= 80 ? 'convertida' : 
       analysis.overall_score <= 50 ? 'perdida' : 'em_risco');

    let motivo: string | null = 
      scores.motivo_perda || 
      raciocinio.motivo_perda || 
      (analysis.weaknesses && analysis.weaknesses.length > 0 ? analysis.weaknesses[0] : null);

    let acao: string | null = 
      scores.acao_resgate_sugerida || 
      raciocinio.acao_resgate_sugerida || 
      (analysis.recommendations && analysis.recommendations.length > 0 ? analysis.recommendations[0] : null);

    return { status, motivo, acao };
  };

  // Helper: Detect if conversation is waiting for operator response & elapsed minutes
  const getWaitInfo = (conv: Conversation): { isWaiting: boolean; elapsedMinutes: number; text: string | null } => {
    if (!conv.messages || conv.messages.length === 0) {
      return { isWaiting: false, elapsedMinutes: 0, text: null };
    }
    const sorted = [...conv.messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const lastMsg = sorted[sorted.length - 1];
    const isClient = lastMsg.sender_type === 'client' || lastMsg.sender_type === 'cliente';
    if (!isClient) {
      return { isWaiting: false, elapsedMinutes: 0, text: null };
    }
    const elapsedMinutes = Math.floor((Date.now() - new Date(lastMsg.created_at).getTime()) / (1000 * 60));
    let text = null;
    if (elapsedMinutes >= 15) {
      if (elapsedMinutes >= 60) {
        const hours = Math.floor(elapsedMinutes / 60);
        text = `Cliente esperando há ${hours}h`;
      } else {
        text = `Cliente esperando há ${elapsedMinutes}min`;
      }
    }
    return { isWaiting: true, elapsedMinutes, text };
  };

  // Team Ranking & Performance Metrics
  const teamRanking = useMemo(() => {
    const stats: Record<string, {
      operatorId: string;
      name: string;
      role: string;
      total: number;
      emRisco: number;
      perdidas: number;
      convertidas: number;
      totalScore: number;
      scoreCount: number;
    }> = {};

    // Initialize with registered operators
    operators.forEach(op => {
      stats[op.id] = {
        operatorId: op.id,
        name: op.name,
        role: op.role || 'Vendedor',
        total: 0,
        emRisco: 0,
        perdidas: 0,
        convertidas: 0,
        totalScore: 0,
        scoreCount: 0,
      };
    });

    // Also an unassigned slot
    stats['unassigned'] = {
      operatorId: 'unassigned',
      name: 'Sem Atendente',
      role: 'Fila Geral',
      total: 0,
      emRisco: 0,
      perdidas: 0,
      convertidas: 0,
      totalScore: 0,
      scoreCount: 0,
    };

    initialConversations.forEach(conv => {
      const opKey = conv.operator_id && stats[conv.operator_id] ? conv.operator_id : 'unassigned';
      stats[opKey].total += 1;

      const { status } = getCommercialStatus(conv);
      if (status === 'em_risco') stats[opKey].emRisco += 1;
      else if (status === 'perdida') stats[opKey].perdidas += 1;
      else if (status === 'convertida') stats[opKey].convertidas += 1;

      const analysis = getAnalysis(conv);
      if (analysis) {
        stats[opKey].totalScore += analysis.overall_score;
        stats[opKey].scoreCount += 1;
      }
    });

    return Object.values(stats)
      .filter(s => s.operatorId !== 'unassigned' || s.total > 0)
      .map(s => ({
        ...s,
        avgScore: s.scoreCount > 0 ? Math.round(s.totalScore / s.scoreCount) : 0,
        conversionRate: s.total > 0 ? Math.round((s.convertidas / s.total) * 100) : 0,
      }))
      .sort((a, b) => b.convertidas - a.convertidas || b.avgScore - a.avgScore);
  }, [initialConversations, operators]);

  // Calculations & Metrics
  const metrics = useMemo(() => {
    let totalScore = 0;
    let analyzedCount = 0;
    let emRiscoCount = 0;
    let perdidasCount = 0;
    let convertidasCount = 0;
    const lossReasonCounts: Record<string, number> = {};

    initialConversations.forEach(conv => {
      const analysis = getAnalysis(conv);
      if (analysis) {
        analyzedCount++;
        totalScore += analysis.overall_score;

        const { status, motivo } = getCommercialStatus(conv);
        if (status === 'em_risco') emRiscoCount++;
        else if (status === 'perdida') {
          perdidasCount++;
          if (motivo) {
            const cleanMotivo = motivo.replace(/^FALHA GRAVE:\s*/i, '').trim();
            lossReasonCounts[cleanMotivo] = (lossReasonCounts[cleanMotivo] || 0) + 1;
          }
        }
        else if (status === 'convertida') convertidasCount++;
      }
    });

    const averageScore = analyzedCount > 0 ? Math.round(totalScore / analyzedCount) : 0;
    
    const topReasons = Object.entries(lossReasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1)
      .map(([name]) => name);

    return {
      averageScore,
      analyzedCount,
      totalCount: initialConversations.length,
      emRiscoCount,
      perdidasCount,
      convertidasCount,
      topLossReason: topReasons.length > 0 
        ? topReasons[0] 
        : (perdidasCount > 0 ? 'Motivo sob análise' : 'Nenhuma perda registrada'),
    };
  }, [initialConversations]);

  // Filter conversations based on search term, operator filter, and commercial status
  const filteredConversations = useMemo(() => {
    return initialConversations.filter(conv => {
      const phone = conv.client_phone || '';
      const matchesSearch = phone.includes(searchTerm.replace(/[^0-9]/g, '')) || phone.includes(searchTerm);
      const matchesOperator = operatorFilter === 'all' || 
        (operatorFilter === 'unassigned' && !conv.operator_id) || 
        conv.operator_id === operatorFilter;
      
      const { status } = getCommercialStatus(conv);
      const matchesStatus = statusFilter === 'all' || status === statusFilter;

      return matchesSearch && matchesOperator && matchesStatus;
    });
  }, [initialConversations, searchTerm, operatorFilter, statusFilter]);

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

  const getCommercialBadge = (status: 'convertida' | 'em_risco' | 'perdida' | 'em_andamento') => {
    switch (status) {
      case 'convertida':
        return {
          label: 'Venda Fechada',
          bg: 'bg-emerald-50',
          text: 'text-emerald-700',
          border: 'border-emerald-200',
          dot: 'bg-emerald-500',
          icon: '✅'
        };
      case 'em_risco':
        return {
          label: 'Em Risco',
          bg: 'bg-amber-50',
          text: 'text-amber-800',
          border: 'border-amber-300',
          dot: 'bg-amber-500',
          icon: '🚨'
        };
      case 'perdida':
        return {
          label: 'Venda Perdida',
          bg: 'bg-rose-50',
          text: 'text-rose-700',
          border: 'border-rose-200',
          dot: 'bg-rose-500',
          icon: '❌'
        };
      default:
        return {
          label: 'Em Andamento',
          bg: 'bg-slate-50',
          text: 'text-slate-600',
          border: 'border-slate-200',
          dot: 'bg-slate-400',
          icon: '💬'
        };
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#eae6df] text-slate-800 font-sans antialiased select-none">
      {/* Offline Alert Top Bar */}
      {lastStatusLog?.status === 'close' && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between z-50 shadow-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-white animate-pulse" />
            <span>
              WhatsApp Offline desde {formatDate(lastStatusLog.created_at)}. Reconecte para auditar mensagens.
            </span>
          </div>
          <button
            onClick={() => router.push(`/${tenantSlug}/dashboard/whatsapp`)}
            className="px-2.5 py-1 bg-white text-red-600 rounded text-[11px] font-bold hover:bg-red-50 cursor-pointer"
          >
            Reconectar
          </button>
        </div>
      )}

      {/* 1. ULTRA-SLIM WHATSAPP ICON NAVIGATION RAIL (Lateral Esquerda com Tooltips) */}
      <aside className="w-[60px] bg-[#f0f2f5] border-r border-[#d1d7db] flex flex-col items-center justify-between py-4 shrink-0 z-20">
        {/* Top Icons */}
        <div className="flex flex-col items-center gap-2.5 w-full">
          {/* Conversas (Active Tab) */}
          <div className="relative group">
            <button
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[#00a884] bg-[#d9fdd3]/70 transition-all cursor-pointer shadow-xs"
              aria-label="Conversas"
            >
              <MessageSquare className="w-5 h-5 fill-current" />
            </button>
            <span className="pointer-events-none absolute left-[68px] top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-50">
              Conversas & Atendimentos
            </span>
          </div>

          {/* Indicadores & KPIs Comerciais (Toggle) */}
          <div className="relative group">
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                showMetrics ? 'text-[#00a884] bg-[#d9fdd3]' : 'text-[#54656f] hover:bg-[#e9edef]'
              }`}
              aria-label="Painel de Métricas Comerciais"
            >
              <BarChart3 className="w-5 h-5" />
            </button>
            <span className="pointer-events-none absolute left-[68px] top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-50">
              {showMetrics ? 'Ocultar Indicadores Comerciais' : 'Ver Indicadores Comerciais'}
            </span>
          </div>

          {/* Desempenho do Time */}
          <div className="relative group">
            <button
              onClick={() => setIsTeamRankingOpen(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[#54656f] hover:bg-[#e9edef] transition-all cursor-pointer"
              aria-label="Desempenho e Ranking do Time"
            >
              <Users className="w-5 h-5" />
            </button>
            <span className="pointer-events-none absolute left-[68px] top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-50">
              Desempenho e Ranking do Time
            </span>
          </div>

          {/* Playbook de IA */}
          <div className="relative group">
            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard/playbook`)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[#54656f] hover:bg-[#e9edef] transition-all cursor-pointer"
              aria-label="Playbook de IA"
            >
              <BookOpen className="w-5 h-5" />
            </button>
            <span className="pointer-events-none absolute left-[68px] top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-50">
              Playbook de IA
            </span>
          </div>

          {/* Canais de Atendimento (WhatsApp + Instagram) */}
          <div className="relative group">
            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard/canais`)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[#54656f] hover:bg-[#e9edef] transition-all cursor-pointer relative"
              aria-label="Canais de Atendimento (WhatsApp e Instagram)"
            >
              <Phone className="w-5 h-5" />
              {organization?.whatsapp_status === 'connected' || organization?.instagram_status === 'connected' ? (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
              ) : (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
              )}
            </button>
            <span className="pointer-events-none absolute left-[68px] top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-50">
              Canais de Atendimento (WhatsApp & Instagram)
            </span>
          </div>
        </div>

        {/* Bottom Icons */}
        <div className="flex flex-col items-center gap-2 w-full pb-1">
          {/* Atualizar Dados */}
          <div className="relative group">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[#54656f] hover:bg-[#e9edef] transition-all disabled:opacity-50 cursor-pointer"
              aria-label="Atualizar dados"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-[#00a884]' : ''}`} />
            </button>
            <span className="pointer-events-none absolute left-[68px] top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-50">
              Atualizar dados
            </span>
          </div>

          {/* Configurações */}
          <div className="relative group">
            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard/settings`)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[#54656f] hover:bg-[#e9edef] transition-all cursor-pointer"
              aria-label="Configurações Gerais"
            >
              <Settings className="w-5 h-5" />
            </button>
            <span className="pointer-events-none absolute left-[68px] top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-50">
              Configurações Gerais
            </span>
          </div>

          {/* Sair */}
          <div className="relative group">
            <button
              onClick={handleSignOut}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[#54656f] hover:bg-rose-100 hover:text-rose-600 transition-all cursor-pointer"
              aria-label="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
            <span className="pointer-events-none absolute left-[68px] top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-lg whitespace-nowrap z-50">
              Sair do Sistema
            </span>
          </div>
        </div>
      </aside>

      {/* 2. CHATS SIDEBAR (Lista de Conversas Lateral no Estilo WhatsApp) */}
      <section className="w-[420px] xl:w-[460px] bg-white border-r border-[#e9edef] flex flex-col h-full shrink-0 z-10">
        {/* Top Header of Chats: Substituído texto "Conversas" pela Logo do Sistema (Aumentada em ~25%) */}
        <div className="h-[60px] bg-[#f0f2f5] px-4 flex items-center justify-between shrink-0 border-b border-[#e9edef]">
          <div className="flex items-center">
            <img 
              src="/Logo.png" 
              alt="SupervisIA" 
              className="h-10 md:h-11 w-auto object-contain cursor-pointer hover:opacity-95 transition-opacity" 
              onClick={() => router.push(`/${tenantSlug}/dashboard`)}
            />
          </div>

          <div className="flex items-center gap-1 text-[#54656f]">
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className={`p-2 rounded-full hover:bg-[#e9edef] transition-colors cursor-pointer ${showMetrics ? 'text-[#00a884]' : ''}`}
              title="Resumo Comercial"
            >
              <BarChart3 className="w-5 h-5" />
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 rounded-full hover:bg-[#e9edef] transition-colors cursor-pointer"
              title="Atualizar"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-[#00a884]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search Bar & Filter Pills */}
        <div className="p-3 bg-white border-b border-[#f0f2f5] shrink-0 space-y-2.5">
          {/* WhatsApp Search Input (Permite buscar rápido por telefone ou mensagens) */}
          <div className="relative flex items-center bg-[#f0f2f5] rounded-lg px-3 py-1.5 focus-within:bg-white focus-within:ring-1 focus-within:ring-[#00a884] transition-all">
            <Search className="w-4 h-4 text-[#54656f] shrink-0 mr-2.5" />
            <input
              type="text"
              placeholder="Pesquisar por número ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent text-xs md:text-sm text-[#111b21] placeholder-[#54656f] focus:outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-[#54656f] hover:text-[#111b21] font-bold ml-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter Pills (Acomodados confortavelmente sem barra de rolagem) */}
          <div className="flex items-center justify-between gap-1 text-[11px] font-medium">
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex-1 py-1 px-1.5 rounded-lg text-center transition-colors cursor-pointer truncate ${
                statusFilter === 'all'
                  ? 'bg-[#d9fdd3] text-[#008069] font-bold'
                  : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
              }`}
            >
              Tudo ({initialConversations.length})
            </button>
            <button
              onClick={() => setStatusFilter(statusFilter === 'em_risco' ? 'all' : 'em_risco')}
              className={`flex-1 py-1 px-1.5 rounded-lg text-center transition-colors cursor-pointer truncate flex items-center justify-center gap-0.5 ${
                statusFilter === 'em_risco'
                  ? 'bg-amber-100 text-amber-800 font-bold border border-amber-300'
                  : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
              }`}
            >
              <span>🚨 Risco</span>
              <span className="text-[10px] opacity-80">({metrics.emRiscoCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter(statusFilter === 'perdida' ? 'all' : 'perdida')}
              className={`flex-1 py-1 px-1.5 rounded-lg text-center transition-colors cursor-pointer truncate flex items-center justify-center gap-0.5 ${
                statusFilter === 'perdida'
                  ? 'bg-rose-100 text-rose-800 font-bold border border-rose-300'
                  : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
              }`}
            >
              <span>❌ Perda</span>
              <span className="text-[10px] opacity-80">({metrics.perdidasCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter(statusFilter === 'convertida' ? 'all' : 'convertida')}
              className={`flex-1 py-1 px-1.5 rounded-lg text-center transition-colors cursor-pointer truncate flex items-center justify-center gap-0.5 ${
                statusFilter === 'convertida'
                  ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-300'
                  : 'bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]'
              }`}
            >
              <span>✅ Ganhos</span>
              <span className="text-[10px] opacity-80">({metrics.convertidasCount})</span>
            </button>
          </div>

          {/* Filtro por Atendente na Lista de Conversas */}
          <div className="flex items-center gap-2 pt-0.5">
            <span className="text-[10px] font-semibold text-[#667781] uppercase tracking-wider shrink-0">Filtrar Atendente:</span>
            <select
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
              className="flex-1 bg-[#f0f2f5] border-0 rounded-md px-2 py-1 text-xs text-[#111b21] focus:ring-1 focus:ring-[#00a884] focus:outline-none cursor-pointer"
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
        </div>

        {/* Contacts / Conversations List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#f0f2f5]">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center text-[#667781] h-64">
              <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm font-medium">Nenhuma conversa encontrada</p>
              <p className="text-xs text-[#8696a0] mt-1">Tente ajustar seus filtros ou busca.</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const analysis = getAnalysis(conv);
              const isSelected = selectedId === conv.id;
              const latestMsg = conv.messages && conv.messages.length > 0 
                ? conv.messages[conv.messages.length - 1].content 
                : 'Sem histórico de mensagens';
              const assignedOperator = operators.find(op => op.id === conv.operator_id);
              const { status, motivo } = getCommercialStatus(conv);
              const badge = getCommercialBadge(status);
              const waitInfo = getWaitInfo(conv);
              const timeFormatted = formatDate(conv.created_at).split(' ')[1];

              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={`flex items-start gap-3 px-3 py-3 cursor-pointer transition-colors relative ${
                    isSelected ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6] bg-white'
                  }`}
                >
                  {/* Avatar Pequeno e Compacto */}
                  <div className="relative shrink-0 mt-0.5">
                    <div className="w-11 h-11 rounded-full bg-[#dfe5e7] flex items-center justify-center text-[#54656f] font-semibold text-sm">
                      <User className="w-5 h-5 text-[#54656f]" />
                    </div>
                    {/* Status Dot */}
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${badge.dot}`}
                      title={badge.label}
                    />
                  </div>

                  {/* Main Conversation Card Info */}
                  <div className="flex-1 min-w-0">
                    {/* Row 1: Phone / Instagram ID + Time + Channel Tag */}
                    <div className="flex justify-between items-baseline mb-1">
                      <div className="flex items-center gap-1.5 truncate">
                        {conv.channel === 'instagram' ? (
                          <span className="text-[10px] bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.2 rounded font-bold shrink-0">
                            Instagram
                          </span>
                        ) : null}
                        <h3 className="text-sm font-semibold text-[#111b21] truncate">
                          {conv.channel === 'instagram' ? `@${conv.client_phone}` : formatPhoneNumber(conv.client_phone)}
                        </h3>
                      </div>
                      <span className="text-[11px] text-[#667781] shrink-0 font-medium ml-2">
                        {timeFormatted}
                      </span>
                    </div>

                    {/* Row 2: Last Message Preview */}
                    <div className="flex items-center gap-1 text-xs text-[#667781] truncate mb-1">
                      <p className="truncate text-xs text-[#3b4a54]">
                        {latestMsg}
                      </p>
                    </div>

                    {/* Row 3: Commercial Badge + Wait alert */}
                    <div className="flex items-center flex-wrap gap-1 mt-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badge.bg} ${badge.text} border ${badge.border}`}>
                        {badge.label}
                      </span>

                      {waitInfo.text && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5 animate-pulse" />
                          <span>{waitInfo.text}</span>
                        </span>
                      )}

                      {analysis && (
                        <span className="text-[9px] font-bold text-slate-500 ml-auto">
                          Score: {analysis.overall_score}%
                        </span>
                      )}
                    </div>

                    {/* Assigned operator mini tag */}
                    {assignedOperator && (
                      <div className="text-[10px] text-[#8696a0] mt-1 truncate">
                        Resp: {assignedOperator.name}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 3. MAIN STAGE: WHATSAPP CONVERSATION OR EMPTY STATE */}
      <main className="flex-1 flex flex-col h-full bg-[#efeae2] relative overflow-hidden">
        {/* Collapsible Commercial Metrics Panel (se ativado pelo ícone de gráficos) */}
        {showMetrics && (
          <section className="bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-3 shadow-md z-10 animate-fade-in shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                Painel Rápido de Inteligência Comercial
              </span>
              <button
                onClick={() => setShowMetrics(false)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕ Fechar
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div 
                onClick={() => setStatusFilter(statusFilter === 'em_risco' ? 'all' : 'em_risco')}
                className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 cursor-pointer hover:bg-amber-100/50 transition-colors"
              >
                <div className="text-[10px] font-bold text-amber-800 uppercase">🚨 Em Risco</div>
                <div className="text-lg font-black text-slate-900">{metrics.emRiscoCount} <span className="text-[10px] text-slate-500 font-normal">leads</span></div>
              </div>
              <div 
                onClick={() => setStatusFilter(statusFilter === 'perdida' ? 'all' : 'perdida')}
                className="bg-rose-50/70 border border-rose-200 rounded-xl p-2.5 cursor-pointer hover:bg-rose-100/50 transition-colors"
              >
                <div className="text-[10px] font-bold text-rose-800 uppercase">❌ Vendas Perdidas</div>
                <div className="text-lg font-black text-slate-900">{metrics.perdidasCount} <span className="text-[10px] text-slate-500 font-normal">leads</span></div>
              </div>
              <div 
                onClick={() => setStatusFilter(statusFilter === 'convertida' ? 'all' : 'convertida')}
                className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 cursor-pointer hover:bg-emerald-100/50 transition-colors"
              >
                <div className="text-[10px] font-bold text-emerald-800 uppercase">✅ Vendas Fechadas</div>
                <div className="text-lg font-black text-slate-900">{metrics.convertidasCount} <span className="text-[10px] text-slate-500 font-normal">ganhos</span></div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Maior Causa de Perda</div>
                <div className="text-xs font-bold text-slate-800 truncate mt-1" title={metrics.topLossReason}>
                  {metrics.topLossReason}
                </div>
              </div>
            </div>
          </section>
        )}

        {selectedConversation ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* WhatsApp Chat Header */}
            <header className="h-[60px] bg-[#f0f2f5] px-4 border-b border-[#d1d7db] flex items-center justify-between shrink-0 z-10 shadow-xs">
              {/* Client Info (Avatar + Phone/Instagram + Online/Date) */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#dfe5e7] flex items-center justify-center text-[#54656f] shrink-0 font-semibold">
                  <User className="w-5 h-5 text-[#54656f]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-[#111b21] leading-tight">
                      {selectedConversation.channel === 'instagram' 
                        ? `@${selectedConversation.client_phone}` 
                        : formatPhoneNumber(selectedConversation.client_phone)}
                    </h2>
                    {selectedConversation.channel === 'instagram' && (
                      <span className="text-[10px] bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-0.5 rounded-full font-bold">
                        Instagram
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#667781] leading-tight mt-0.5">
                    Criado em {formatDate(selectedConversation.created_at)}
                  </p>
                </div>
              </div>

              {/* Chat Header Actions */}
              <div className="flex items-center gap-3">
                {/* Atendente selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#54656f] font-medium hidden md:inline">
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
                    className="bg-white border border-[#d1d7db] rounded-lg px-2 py-1 text-xs text-[#111b21] focus:ring-1 focus:ring-[#00a884] focus:outline-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="">Não atribuído</option>
                    {operators.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Botão Ver Auditoria Comercial (IA) */}
                {activeAnalysis && (
                  <button
                    onClick={() => setIsAuditOpen(true)}
                    className="px-3.5 py-1.5 bg-[#00a884] hover:bg-[#008f6f] active:bg-[#007a5e] text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auditoria Comercial</span>
                  </button>
                )}
              </div>
            </header>

            {/* Waiting Alert Bar (se cliente estiver esperando resposta) */}
            {(() => {
              const waitInfo = getWaitInfo(selectedConversation);
              if (!waitInfo.text) return null;
              return (
                <div className="bg-[#fff3cd] border-b border-[#ffeeba] px-4 py-2 flex items-center justify-between text-xs text-[#856404] font-medium shrink-0">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600 animate-pulse shrink-0" />
                    <span>
                      <strong>Atenção ao tempo de resposta:</strong> {waitInfo.text}.
                    </span>
                  </div>
                  <span className="text-[11px] font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded">
                    Responder no celular
                  </span>
                </div>
              );
            })()}

            {/* Messages Timeline (com fundo clássico do WhatsApp e balões fiéis) */}
            <div 
              className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-3 custom-scrollbar"
              style={{
                backgroundImage: `radial-gradient(#d1d7db 0.75px, transparent 0.75px)`,
                backgroundSize: '16px 16px'
              }}
            >
              {/* WhatsApp Security Badge */}
              <div className="self-center bg-[#ffeecd] border border-[#ffdf9d] text-[#54656f] text-[11px] px-3 py-1 rounded-lg text-center max-w-md shadow-2xs my-2">
                🔒 As conversas são capturadas e auditadas em tempo real com inteligência artificial para controle comercial.
              </div>

              {sortedMessages.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center items-center text-[#8696a0]">
                  <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
                  <p className="text-xs">Nenhuma mensagem registrada nesta conversa.</p>
                </div>
              ) : (
                sortedMessages.map((msg) => {
                  const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'atendente';
                  const timeStr = formatDate(msg.created_at).split(' ')[1];

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[80%] md:max-w-[65%] ${
                        isAgent ? 'self-end items-end' : 'self-start items-start'
                      }`}
                    >
                      {/* Message Bubble WhatsApp */}
                      <div
                        className={`rounded-lg px-3 py-2 text-sm shadow-xs relative leading-relaxed ${
                          isAgent
                            ? 'bg-[#d9fdd3] text-[#111b21] rounded-tr-none'
                            : 'bg-white text-[#111b21] rounded-tl-none border border-slate-100'
                        }`}
                      >
                        <p className="whitespace-pre-line text-[13px] text-[#111b21] pr-12">
                          {msg.content}
                        </p>

                        {/* WhatsApp Time & Double Check in bubble */}
                        <div className="flex items-center justify-end gap-1 text-[10px] text-[#667781] float-right -mt-2 -mr-1 ml-3 font-normal">
                          <span>{timeStr}</span>
                          {isAgent && <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />}
                        </div>
                      </div>
                      
                      {/* Remetente label */}
                      <span className="text-[10px] text-[#8696a0] mt-0.5 px-1 font-medium">
                        {isAgent ? 'Atendente' : 'Cliente'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Footer Info */}
            <footer className="h-[52px] bg-[#f0f2f5] px-4 flex items-center justify-between border-t border-[#d1d7db] text-xs text-[#54656f] shrink-0">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#00a884]" />
                Modo Auditoria Ativo — Responda diretamente pelo aplicativo WhatsApp do atendente
              </span>
              {activeAnalysis && (
                <button
                  onClick={() => setIsAuditOpen(true)}
                  className="text-xs font-bold text-[#00a884] hover:underline cursor-pointer"
                >
                  Ver Diagnóstico Completo →
                </button>
              )}
            </footer>
          </div>
        ) : (
          /* Empty State estilo WhatsApp Web quando nenhum chat está selecionado */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-b-6 border-[#25d366]">
            <div className="w-24 h-24 rounded-full bg-white/80 border border-[#d1d7db] flex items-center justify-center text-[#25d366] shadow-sm mb-6">
              <Phone className="w-12 h-12 text-[#25d366]" />
            </div>
            <h2 className="text-2xl font-light text-[#41525d] mb-2 tracking-tight">
              SupervisIA para WhatsApp
            </h2>
            <p className="text-sm text-[#667781] max-w-md leading-relaxed mb-6">
              Audite e monitore os atendimentos da sua equipe comercial com inteligência artificial diretamente conectado ao seu WhatsApp.
            </p>
            <div className="text-xs text-[#8696a0] flex items-center gap-1.5">
              <span>🔒 Mensagens protegidas e sincronizadas em tempo real.</span>
            </div>
          </div>
        )}
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
              
              {/* Commercial Supervision - Loss Detection & Rescue Action Card */}
              {(() => {
                const comm = selectedConversation ? getCommercialStatus(selectedConversation) : { status: 'em_andamento' as const, motivo: null, acao: null };
                const badge = getCommercialBadge(comm.status);

                return (
                  <div className={`p-5 rounded-2xl border transition-all ${
                    comm.status === 'em_risco' 
                      ? 'bg-amber-50/50 border-amber-300 shadow-sm' 
                      : comm.status === 'perdida'
                        ? 'bg-rose-50/50 border-rose-300 shadow-sm'
                        : comm.status === 'convertida'
                          ? 'bg-emerald-50/50 border-emerald-300 shadow-sm'
                          : 'bg-white border-slate-200 shadow-sm'
                  }`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{badge.icon}</span>
                        <div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                            Diagnóstico Comercial do Atendimento
                          </div>
                          <div className="text-base font-extrabold text-slate-900 flex items-center gap-2 mt-0.5">
                            <span className={`px-2.5 py-0.5 rounded-lg border text-xs ${badge.bg} ${badge.text} ${badge.border}`}>
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      </div>

                      {comm.status === 'em_risco' && (
                        <div className="px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold animate-pulse">
                          🚨 Atenção: Intervenção Imediata Recomendada
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs">
                      {/* Causa da Perda / Trava */}
                      <div className="bg-white/80 border border-slate-200 rounded-xl p-3.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          <span>Motivo Principal do Risco ou Perda</span>
                        </div>
                        <p className="text-slate-800 font-semibold leading-relaxed mt-1">
                          {comm.motivo ? comm.motivo.replace(/^FALHA GRAVE:\s*/i, '') : 'Nenhum erro grave detectado. Atendimento dentro do fluxo padrão.'}
                        </p>
                      </div>

                      {/* Ação Sugerida de Resgate */}
                      <div className="bg-white/80 border border-slate-200 rounded-xl p-3.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Ação Tática de Resgate / Próximo Passo</span>
                        </div>
                        <p className="text-slate-800 font-medium leading-relaxed mt-1">
                          {comm.acao || (activeAnalysis.recommendations && activeAnalysis.recommendations.length > 0 ? activeAnalysis.recommendations[0] : 'Dar continuidade ao atendimento conduzindo o cliente para o próximo passo.')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

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

              {/* Checklist do Playbook (Avaliação Multiestados) */}
              {(Array.isArray((activeAnalysis.scores as any)?.criterios) || Array.isArray((activeAnalysis.scores as any)?.criteria_evaluation)) && (
                <div>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    Checklist de Critérios de Vendas (Playbook)
                  </h3>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3.5">
                    {(((activeAnalysis.scores as any).criterios || (activeAnalysis.scores as any).criteria_evaluation || []) as any[]).map((criterion, idx) => {
                      const status = criterion.status;
                      const pontos = criterion.pontos !== undefined ? criterion.pontos : (criterion.fulfilled ? 1.0 : 0.0);
                      const title = criterion.nome_criterio || criterion.item || criterion.criterion;
                      const description = criterion.justificativa || criterion.explanation || criterion.details;
                      
                      let badgeColor = "text-slate-400";
                      let badgeIcon = "N/A";
                      if (status === "CUMPRIDO") {
                        badgeColor = "text-emerald-600 font-bold";
                        badgeIcon = "✓";
                      } else if (status === "PARCIAL") {
                        badgeColor = "text-amber-500 font-bold";
                        badgeIcon = "⚠";
                      } else if (status === "NAO_CUMPRIDO") {
                        badgeColor = "text-rose-600 font-bold";
                        badgeIcon = "✗";
                      } else if (status === "N_A") {
                        badgeColor = "text-slate-400 font-bold";
                        badgeIcon = "—";
                      } else if (criterion.fulfilled === true) {
                        badgeColor = "text-emerald-600 font-bold";
                        badgeIcon = "✓";
                      } else if (criterion.fulfilled === false) {
                        badgeColor = "text-rose-600 font-bold";
                        badgeIcon = "✗";
                      }

                      return (
                        <div key={idx} className="flex items-start gap-3 text-xs border-b border-slate-100 last:border-b-0 pb-3 last:pb-0">
                          <span className={`text-sm select-none shrink-0 ${badgeColor}`}>{badgeIcon}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-slate-800">{title}</p>
                              {status && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                                  status === "CUMPRIDO" 
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                    : status === "PARCIAL"
                                      ? "bg-amber-50 text-amber-700 border border-amber-100"
                                      : status === "NAO_CUMPRIDO"
                                        ? "bg-rose-50 text-rose-700 border border-rose-100"
                                        : "bg-slate-100 text-slate-500 border border-slate-200"
                                }`}>
                                  {status} ({pontos} pts)
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 mt-0.5 leading-relaxed text-[11px]">{description}</p>
                          </div>
                        </div>
                      );
                    })}
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

      {/* Modal: Ranking e Desempenho do Time */}
      {isTeamRankingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-200 px-6 py-4 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-500/20">
                  <Users className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Desempenho e Ranking do Time</h2>
                  <p className="text-[11px] text-slate-500">Métricas comerciais consolidadas por atendente</p>
                </div>
              </div>
              <button 
                onClick={() => setIsTeamRankingOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer text-lg font-bold flex items-center justify-center w-7 h-7"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {teamRanking.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Nenhum atendente cadastrado ou atendimentos registrados ainda.
                </div>
              ) : (
                <div className="space-y-3">
                  {teamRanking.map((member, index) => (
                    <div 
                      key={member.operatorId}
                      className="border border-slate-200 rounded-xl p-4 bg-white hover:border-emerald-300 transition-all shadow-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                            index === 0 ? 'bg-amber-100 text-amber-700 border border-amber-300' :
                            index === 1 ? 'bg-slate-200 text-slate-700' :
                            index === 2 ? 'bg-amber-50 text-amber-800' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {index + 1}º
                          </span>
                          <div>
                            <h3 className="text-xs font-bold text-slate-800">{member.name}</h3>
                            <span className="text-[10px] text-slate-400 font-medium">{member.role}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setOperatorFilter(member.operatorId);
                              setIsTeamRankingOpen(false);
                            }}
                            className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 cursor-pointer transition-colors"
                          >
                            Filtrar conversas ({member.total})
                          </button>
                        </div>
                      </div>

                      {/* Stat Counters Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-center">
                        <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Atendimentos</div>
                          <div className="text-sm font-black text-slate-800 mt-0.5">{member.total}</div>
                        </div>
                        <div className="bg-emerald-50/50 rounded-lg p-2 border border-emerald-100">
                          <div className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">Ganhos / Fechados</div>
                          <div className="text-sm font-black text-emerald-700 mt-0.5">{member.convertidas}</div>
                        </div>
                        <div className="bg-amber-50/50 rounded-lg p-2 border border-amber-100">
                          <div className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">Em Risco</div>
                          <div className="text-sm font-black text-amber-700 mt-0.5">{member.emRisco}</div>
                        </div>
                        <div className="bg-rose-50/50 rounded-lg p-2 border border-rose-100">
                          <div className="text-[9px] font-bold text-rose-700 uppercase tracking-wider">Perdidas</div>
                          <div className="text-sm font-black text-rose-700 mt-0.5">{member.perdidas}</div>
                        </div>
                      </div>

                      {/* Quality & Conversion Footer */}
                      <div className="flex items-center justify-between mt-3 pt-2 text-[10px] text-slate-500 font-medium border-t border-slate-50">
                        <span>Qualidade Comercial Média: <strong className="text-slate-800">{member.avgScore}%</strong></span>
                        <span>Taxa de Conversão: <strong className="text-emerald-600">{member.conversionRate}%</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsTeamRankingOpen(false)}
                className="px-4 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 rounded-lg cursor-pointer transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
