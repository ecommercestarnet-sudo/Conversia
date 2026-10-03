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
  alert_rules?: {
    alert_on_price_unhandled: boolean;
    alert_on_dry_price: boolean;
    alert_on_drop_unhandled: boolean;
    min_confidence_score: number;
    wait_minutes_before_alert?: number;
    alert_phone_override?: string;
  } | null;
}

interface PlaybookClientProps {
  company: Company | null;
  initialPlaybook: Playbook | null;
  lastStatusLog?: { status: string; created_at: string } | null;
}

type TabType = 'context' | 'knowledge' | 'criteria' | 'prompt' | 'alerts';

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

  // Alert Rules State (Deal Rescue)
  const defaultAlertRules = {
    alert_on_price_unhandled: true,
    alert_on_dry_price: true,
    alert_on_drop_unhandled: true,
    min_confidence_score: 85,
    wait_minutes_before_alert: 5,
    alert_phone_override: ''
  };
  const [alertRules, setAlertRules] = useState({
    ...defaultAlertRules,
    ...(initialPlaybook?.alert_rules || {})
  });

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
      custom_prompt: customPrompt,
      alert_rules: alertRules
    });

    setIsSaving(false);
    if (result.success) {
      setNotification({ type: 'success', message: 'Configurações do Playbook e Regras de Alerta salvas com sucesso!' });
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
    { id: 'alerts' as TabType, label: 'Resgate de Vendas (Alertas)', icon: AlertTriangle },
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

            {/* Tab 5: Resgate de Vendas em Tempo Real (Alertas ao Dono) */}
            {activeTab === 'alerts' && (
              <div className="space-y-6">
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-800">Radar de Resgate de Vendas (WhatsApp do Gestor)</h2>
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 rounded-full">
                        Alta Conversão
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
                      Configure quando a IA deve enviar uma notificação urgente no WhatsApp do dono/gestor para você intervir e salvar uma venda que o vendedor cometeu uma falha crítica ou abandonou.
                    </p>
                  </div>
                </div>

                {/* Anti-spam notice */}
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block mb-0.5">Proteção Inteligente Anti-Falso Alarme:</strong>
                    <span className="block"><strong>Infrações de processo</strong> (envio de preço sem diagnóstico ou sem pergunta de fechamento) são validadas no instante em que a mensagem do vendedor chega — <strong>não exigem objeção do cliente</strong>.</span>
                    <span className="block mt-1"><strong>Alertas de objeção/desistência</strong> só disparam quando o cliente demonstra resistência explícita e o vendedor responde sem contornar — ou não responde dentro do tempo de tolerância.</span>
                    <span className="block mt-1">Todo alerta exige confiança mínima de {alertRules.min_confidence_score}% e cada tipo de alerta é enviado no máximo 1 vez por conversa.</span>
                  </div>
                </div>

                {/* Triggers selection */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Situações Críticas para Disparar o Alerta
                  </h3>

                  {/* Trigger 1 */}
                  <label className="flex items-start gap-3.5 p-4 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20 transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alertRules.alert_on_price_unhandled}
                      onChange={(e) => setAlertRules({ ...alertRules, alert_on_price_unhandled: e.target.checked })}
                      className="mt-1 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">Objeção de Preço Ignorada ou Abandonada</span>
                        <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-medium">Urgente</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        O cliente diz que achou caro, fora do orçamento ou vai cotar com o concorrente, e o atendente responde com frieza (&ldquo;ok, qualquer coisa fale comigo&rdquo;) ou não apresenta planos alternativos.
                      </p>
                    </div>
                  </label>

                  {/* Trigger 2 */}
                  <label className="flex items-start gap-3.5 p-4 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20 transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alertRules.alert_on_dry_price}
                      onChange={(e) => setAlertRules({ ...alertRules, alert_on_dry_price: e.target.checked })}
                      className="mt-1 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">Envio de Preço Seco sem Investigação (Panfletagem)</span>
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Crítico</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        O atendente informa valores ou tabela de preços antes de perguntar o objetivo/necessidade do aluno, ou envia o preço sem finalizar com pergunta de fechamento/agendamento.
                      </p>
                    </div>
                  </label>

                  {/* Trigger 3 */}
                  <label className="flex items-start gap-3.5 p-4 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20 transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alertRules.alert_on_drop_unhandled}
                      onChange={(e) => setAlertRules({ ...alertRules, alert_on_drop_unhandled: e.target.checked })}
                      className="mt-1 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">Desistência Declarada sem Tentativa de Retenção</span>
                        <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Última Chance</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        O cliente diz que &ldquo;não vai poder agora&rdquo; ou &ldquo;vai deixar para o mês que vem&rdquo; e o vendedor aceita a perda passivamente sem oferecer aula experimental ou condição de entrada facilitada.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Configuration: Threshold, Wait Time and Phone */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nível de Rigor da IA
                    </label>
                    <p className="text-[11px] text-slate-500 mb-3">
                      Certeza mínima para alertar (Recomendado: 85%).
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="70"
                        max="95"
                        step="5"
                        value={alertRules.min_confidence_score}
                        onChange={(e) => setAlertRules({ ...alertRules, min_confidence_score: Number(e.target.value) })}
                        className="w-full accent-emerald-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-emerald-700 shadow-sm shrink-0">
                        {alertRules.min_confidence_score}%
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tempo de Tolerância do Vendedor
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Tempo para o vendedor responder a objeção antes de alertar o dono.
                    </p>
                    <select
                      value={alertRules.wait_minutes_before_alert ?? 5}
                      onChange={(e) => setAlertRules({ ...alertRules, wait_minutes_before_alert: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    >
                      <option value={2}>2 minutos (Rápido)</option>
                      <option value={5}>5 minutos (Recomendado)</option>
                      <option value={10}>10 minutos</option>
                      <option value={15}>15 minutos</option>
                    </select>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      WhatsApp para Alertas
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Em branco usa o WhatsApp do Dono cadastrado.
                    </p>
                    <input
                      type="text"
                      placeholder="Ex: 5585999990000"
                      value={alertRules.alert_phone_override || ''}
                      onChange={(e) => setAlertRules({ ...alertRules, alert_phone_override: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
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
