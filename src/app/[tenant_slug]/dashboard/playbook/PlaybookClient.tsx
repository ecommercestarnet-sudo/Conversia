'use client';

import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Sparkles, 
  Save, 
  BookOpen, 
  HelpCircle,
  Building,
  Target,
  Sliders,
  CheckCircle,
  AlertTriangle,
  LogOut
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { logout } from '@/app/auth-actions';
import { savePlaybook } from './actions';

interface Company {
  id: string;
  name: string;
}

interface Playbook {
  id?: string;
  organization_id: string;
  company_context: string | null;
  knowledge_base: string | null;
  evaluation_criteria: string | null;
  custom_prompt: string | null;
}

interface PlaybookClientProps {
  company: Company | null;
  initialPlaybook: Playbook | null;
  lastStatusLog?: { status: string; created_at: string } | null;
}

type TabType = 'context' | 'knowledge' | 'criteria' | 'prompt';

export default function PlaybookClient({ company, initialPlaybook, lastStatusLog }: PlaybookClientProps) {
  const router = useRouter();
  const params = useParams();
  const tenantSlug = params.tenant_slug as string;

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
  const [activeTab, setActiveTab] = useState<TabType>('context');
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states initialized with database values or empty strings
  const [companyContext, setCompanyContext] = useState(initialPlaybook?.company_context || '');
  const [knowledgeBase, setKnowledgeBase] = useState(initialPlaybook?.knowledge_base || '');
  const [evaluationCriteria, setEvaluationCriteria] = useState(initialPlaybook?.evaluation_criteria || '');
  const [customPrompt, setCustomPrompt] = useState(initialPlaybook?.custom_prompt || '');

  if (!company) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-center items-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md text-center shadow-sm">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4 animate-bounce" />
          <h2 className="text-xl font-bold mb-2">Nenhuma Empresa Encontrada</h2>
          <p className="text-slate-500 text-sm mb-6">
            Você precisa ter pelo menos uma empresa cadastrada no banco de dados para configurar o Playbook de IA.
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setNotification(null);

    const result = await savePlaybook({
      organization_id: company.id,
      company_context: companyContext,
      knowledge_base: knowledgeBase,
      evaluation_criteria: evaluationCriteria,
      custom_prompt: customPrompt
    });

    setIsSaving(false);
    if (result.success) {
      setNotification({ type: 'success', message: 'Configurações do Playbook salvas com sucesso!' });
      // Clear notification after 4 seconds
      setTimeout(() => setNotification(null), 4000);
    } else {
      setNotification({ type: 'error', message: `Erro ao salvar: ${result.error}` });
    }
  };

  const tabs = [
    { id: 'context' as TabType, label: 'Contexto da Empresa', icon: Building },
    { id: 'knowledge' as TabType, label: 'Base de Conhecimento', icon: BookOpen },
    { id: 'criteria' as TabType, label: 'Critérios de Avaliação', icon: Target },
    { id: 'prompt' as TabType, label: 'Instruções Extras', icon: Sliders },
  ];

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {lastStatusLog?.status === 'close' && (
        <div className="bg-red-655 bg-red-600 text-white px-6 py-3 relative z-20 shadow-md">
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
              className="px-3 py-1.5 bg-white text-red-655 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm shrink-0"
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
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <img src="/Logo.png" alt="SupervisIA Logo" className="h-8 w-auto object-contain" />
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  Playbook de IA
                </h1>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Defina o cérebro, regras e base de conhecimento do seu auditor de vendas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-550 shadow-sm">
              Empresa ativa: <span className="text-emerald-600 font-semibold">{company?.name}</span>
            </div>
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
      <main className="max-w-4xl mx-auto px-6 py-8">
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-slate-200 pb-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 border cursor-pointer shadow-sm ${
                  isActive 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-500/20 font-semibold'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Notifications */}
        {notification && (
          <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 animate-fade-in ${
            notification.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            <CheckCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{notification.message}</p>
          </div>
        )}

        {/* Configuration Form */}
        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden shadow-sm">
            
            {/* Tab 1: Contexto da Empresa */}
            {activeTab === 'context' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-base font-semibold text-slate-800">Contexto Geral e Nicho</h2>
                  <span title="Explique sobre sua empresa para que a IA se contextualize antes de auditar.">
                    <HelpCircle className="w-4 h-4 text-slate-400 hover:text-slate-650 cursor-pointer" />
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Defina o nicho de mercado, a proposta de valor da empresa e o tom de voz corporativo. Isso fará com que o avaliador avalie o vendedor conforme a postura que você espera dele (ex: empático, agressivo, formal, jovem).
                </p>
                <textarea
                  value={companyContext}
                  onChange={(e) => setCompanyContext(e.target.value)}
                  placeholder="Ex: Somos uma rede de escolas de idiomas focada em inglês para negócios. O tom do atendimento comercial deve ser profissional, prestativo e persuasivo, sempre focando nos benefícios de carreira e fluidez no mercado corporativo..."
                  className="w-full min-h-[300px] bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all font-sans leading-relaxed shadow-sm"
                />
              </div>
            )}

            {/* Tab 2: Base de Conhecimento */}
            {activeTab === 'knowledge' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-base font-semibold text-slate-800">Produtos, Serviços e FAQ</h2>
                  <span title="Forneça os dados de preços e produtos para a IA auditar se as informações passadas foram corretas.">
                    <HelpCircle className="w-4 h-4 text-slate-400 hover:text-slate-650 cursor-pointer" />
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Insira detalhes sobre os planos, produtos, serviços, preços, promoções ativas e respostas às dúvidas comuns. A IA usará esta base para validar se o vendedor passou o preço correto ou cometeu algum erro técnico sobre o produto.
                </p>
                <textarea
                  value={knowledgeBase}
                  onChange={(e) => setKnowledgeBase(e.target.value)}
                  placeholder="Ex: Planos de Inglês:
- Executivo (R$ 350/mês, fidelidade de 12 meses, inclui mentoria individual)
- Flex (R$ 220/mês, sem fidelidade, aulas em grupo)
FAQ: O material didático custa R$ 150 por semestre. Não cobramos taxa de matrícula na primeira visita..."
                  className="w-full min-h-[300px] bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all font-sans leading-relaxed shadow-sm"
                />
              </div>
            )}

            {/* Tab 3: Critérios de Avaliação */}
            {activeTab === 'criteria' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-base font-semibold text-slate-800">Critérios de Avaliação e Checklist</h2>
                  <span title="Escreva o script obrigatório e os itens que pontuam ou reduzem a nota.">
                    <HelpCircle className="w-4 h-4 text-slate-400 hover:text-slate-650 cursor-pointer" />
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Escreva o checklist de vendas (etapas do funil) que o vendedor é obrigado a seguir em toda conversa. Defina o que causa perda de pontos ou notas baixas (ex: não tentar o fechamento, enviar o preço rápido demais sem qualificar o lead).
                </p>
                <textarea
                  value={evaluationCriteria}
                  onChange={(e) => setEvaluationCriteria(e.target.value)}
                  placeholder="Ex: checklist obrigatório do vendedor:
1. Saudação inicial e perguntar o nome se não souber.
2. Investigação (perguntar qual a maior dificuldade profissional atual).
3. Apresentação da solução ancorando os benefícios de carreira.
4. Fechamento (oferecer aula experimental ou agendar teste de nivelamento).
Fatores que geram perda de pontos:
- Enviar preços nas primeiras 2 mensagens.
- Não convidar para agendamento."
                  className="w-full min-h-[300px] bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all font-sans leading-relaxed shadow-sm"
                />
              </div>
            )}

            {/* Tab 4: Instruções Extras */}
            {activeTab === 'prompt' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-base font-semibold text-slate-800">Instruções Personalizadas do Prompt</h2>
                  <span title="Adicione regras específicas adicionais diretamente ao prompt de sistema.">
                    <HelpCircle className="w-4 h-4 text-slate-400 hover:text-slate-650 cursor-pointer" />
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Insira orientações especiais ou regras de negócio peculiares à sua operação. A IA incorporará esse texto diretamente na instrução de avaliação.
                </p>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Ex: Ignore áudios muito curtos de bom dia/boa tarde no cálculo do tempo de resposta. Considere como objeção de preço apenas quando o cliente explicitamente disser que não tem orçamento ou que está caro..."
                  className="w-full min-h-[300px] bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all font-sans leading-relaxed shadow-sm"
                />
              </div>
            )}

          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push(`/${tenantSlug}/dashboard`)}
              className="px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-850 transition-all cursor-pointer flex items-center justify-center shadow-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 rounded-xl text-sm font-medium text-white transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-500/10"
            >
              <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
              {isSaving ? 'Salvando...' : 'Salvar Playbook'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
