'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, 
  QrCode, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Trash2, 
  Loader2,
  Phone,
  LogOut
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/auth-client';
import { getWhatsAppStatus, connectWhatsApp, disconnectWhatsApp } from './actions';

interface Company {
  id: string;
  name: string;
  evolution_instance_name: string | null;
  whatsapp_status: string | null;
}

interface WhatsAppClientProps {
  company: Company | null;
}

export default function WhatsAppClient({ company }: WhatsAppClientProps) {
  const router = useRouter();
  const params = useParams();
  const tenantSlug = params.tenant_slug as string;

  const handleSignOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
  };
  
  // Status states
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>(
    company?.whatsapp_status === 'connected' ? 'connected' : 'disconnected'
  );
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  
  // Loading and error states
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!company) {
    return (
      <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-center items-center p-6">
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 max-w-md text-center backdrop-blur-md">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4 animate-bounce" />
          <h2 className="text-xl font-bold mb-2">Nenhuma Empresa Encontrada</h2>
          <p className="text-slate-400 text-sm mb-6">
            Você precisa ter pelo menos uma empresa cadastrada no banco de dados para configurar a conexão do WhatsApp.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-200 transition-colors flex items-center gap-2 mx-auto cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Check current status from DB and Evolution API
  const checkStatus = useCallback(async (silent = false) => {
    if (!silent) setIsInitializing(true);
    setError(null);
    
    const res = await getWhatsAppStatus(company.id);
    
    if (res.success) {
      if (res.status === 'connected') {
        setStatus('connected');
        setQrcode(null);
        setConnectedPhone(res.connectedPhone || null);
      } else {
        setStatus('disconnected');
        setConnectedPhone(null);
      }
    } else {
      setError(res.error || 'Erro ao checar status do WhatsApp');
    }
    
    if (!silent) setIsInitializing(false);
  }, [company.id]);

  // Run check on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Polling to check connection state while connecting (QR Code shown)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (status === 'connecting') {
      interval = setInterval(async () => {
        const res = await getWhatsAppStatus(company.id);
        if (res.success && res.status === 'connected') {
          setStatus('connected');
          setQrcode(null);
          setConnectedPhone(res.connectedPhone || null);
          clearInterval(interval);
        }
      }, 5000); // Poll every 5 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, company.id]);

  // Connect WhatsApp and trigger QR code fetch
  const handleConnect = async () => {
    setIsLoadingQr(true);
    setError(null);
    setStatus('connecting');
    
    const res = await connectWhatsApp(company.id);
    
    if (res.success) {
      if (res.status === 'connected') {
        setStatus('connected');
        setQrcode(null);
        setConnectedPhone(res.connectedPhone || null);
      } else if (res.qrcode) {
        setQrcode(res.qrcode);
        setConnectedPhone(null);
      } else {
        setError('QR Code não retornado pela API. Tente novamente.');
        setStatus('disconnected');
        setConnectedPhone(null);
      }
    } else {
      setError(res.error || 'Erro ao conectar com a Evolution API');
      setStatus('disconnected');
      setConnectedPhone(null);
    }
    
    setIsLoadingQr(false);
  };

  // Disconnect / Delete instance
  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar o WhatsApp? Isso apagará a instância atual e parará de receber mensagens.')) {
      return;
    }
    
    setIsDisconnecting(true);
    setError(null);
    
    const res = await disconnectWhatsApp(company.id);
    
    if (res.success) {
      setStatus('disconnected');
      setQrcode(null);
      setConnectedPhone(null);
    } else {
      setError(res.error || 'Erro ao desconectar WhatsApp');
    }
    
    setIsDisconnecting(false);
  };

  return (
    <div className="relative min-h-screen bg-[#07090e] text-slate-100 font-sans antialiased">
      {/* Background Glowing Orb Effect */}
      <div className="absolute top-0 left-1/4 right-1/4 h-[30rem] bg-gradient-to-b from-indigo-600/15 via-purple-600/5 to-transparent blur-[120px] pointer-events-none rounded-full" />

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/60 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard`)}
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700/80 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer flex items-center justify-center shrink-0"
              title="Voltar ao Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 rounded-md">
                  <Phone className="w-4 h-4" />
                </span>
                <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  Conexão de WhatsApp
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Conecte seu celular para que a IA possa analisar e auditar seus chats comerciais em tempo real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400">
              Empresa ativa: <span className="text-indigo-400 font-medium">{company?.name}</span>
            </div>
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
      <main className="max-w-4xl mx-auto px-6 py-8">
        
        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-4 rounded-xl border bg-rose-500/10 border-rose-500/20 text-rose-400 flex items-center gap-3 animate-fade-in">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
            <button 
              onClick={() => checkStatus()}
              className="ml-auto text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 px-2 py-1 rounded-md transition-colors cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {isInitializing ? (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-900/30 border border-slate-800/80 rounded-2xl backdrop-blur-md">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
            <p className="text-sm text-slate-400">Carregando status da conexão do WhatsApp...</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Status Card */}
            <div className="bg-slate-900/30 backdrop-blur-md border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl border shrink-0 ${
                    status === 'connected' 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : status === 'connecting'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}>
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-200">Status do Dispositivo</h2>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {status === 'connected' 
                        ? `Seu número de WhatsApp está conectado com sucesso ao painel ConversIA${connectedPhone ? ` (${connectedPhone})` : ''}. O robô está ouvindo e auditando as conversas.` 
                        : status === 'connecting'
                          ? 'Aguardando escaneamento do QR Code. O status atualizará automaticamente assim que conectado.'
                          : 'Seu número está desconectado. Para iniciar a análise comercial automática das conversas, conecte um número de WhatsApp.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
                  {status === 'connected' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Conectado
                    </span>
                  ) : status === 'connecting' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Conectando...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-950 text-slate-400 border border-slate-800">
                      <XCircle className="w-3.5 h-3.5" />
                      Desconectado
                    </span>
                  )}
                  
                  <button
                    onClick={() => checkStatus()}
                    className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
                    title="Atualizar Status"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Connection Flow Section */}
            {status === 'disconnected' && (
              <div className="bg-slate-900/10 border border-slate-800/60 rounded-2xl p-8 flex flex-col items-center text-center">
                <Phone className="w-12 h-12 text-indigo-500/60 mb-4" />
                <h3 className="text-base font-bold text-slate-200 mb-2">Conecte seu WhatsApp Comercial</h3>
                <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
                  Geramos uma conexão exclusiva e criptografada (Evolution API) para o seu negócio. Clique no botão abaixo para gerar o QR Code.
                </p>
                <button
                  onClick={handleConnect}
                  disabled={isLoadingQr}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 rounded-xl text-sm font-medium text-white transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/20"
                >
                  {isLoadingQr ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando Instância...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4" />
                      Gerar QR Code
                    </>
                  )}
                </button>
              </div>
            )}

            {status === 'connecting' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* QR Code Container */}
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[350px]">
                  {isLoadingQr ? (
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                      <p className="text-xs text-slate-400">Recuperando novo QR Code...</p>
                    </div>
                  ) : qrcode ? (
                    <div className="space-y-4 text-center">
                      <div className="bg-white p-4 rounded-xl inline-block shadow-inner">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={qrcode} 
                          alt="WhatsApp Connection QR Code"
                          className="w-56 h-56 mx-auto block object-contain"
                        />
                      </div>
                      <div className="flex items-center justify-center gap-2 text-indigo-400 text-xs animate-pulse">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Aguardando leitura do QR Code...</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-4">
                      <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                      <p className="text-xs text-slate-400 mb-4">Nenhum QR Code gerado.</p>
                      <button
                        onClick={handleConnect}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Gerar QR Code
                      </button>
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div className="bg-slate-900/20 border border-slate-850 rounded-2xl p-6 flex flex-col justify-center space-y-4">
                  <h3 className="text-sm font-semibold text-slate-200">Como Conectar:</h3>
                  <ol className="list-decimal list-inside space-y-3 text-xs text-slate-450 leading-relaxed">
                    <li>Abra o <strong>WhatsApp</strong> no seu celular.</li>
                    <li>Acesse o menu de <strong>Configurações / Opções</strong> (ícone de engrenagem ou três pontinhos).</li>
                    <li>Selecione <strong>Aparelhos Conectados</strong>.</li>
                    <li>Toque em <strong>Conectar um aparelho</strong>.</li>
                    <li>Aponte a câmera do seu celular para o QR Code ao lado para realizar a leitura.</li>
                  </ol>
                  <div className="pt-2 flex flex-wrap gap-3">
                    <button
                      onClick={handleConnect}
                      disabled={isLoadingQr}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-755 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingQr ? 'animate-spin' : ''}`} />
                      Recarregar QR Code
                    </button>
                    <button
                      onClick={handleDisconnect}
                      disabled={isDisconnecting}
                      className="px-4 py-2 bg-slate-950 hover:bg-rose-955/20 border border-slate-900 hover:border-rose-950/40 text-slate-400 hover:text-rose-450 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isDisconnecting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Cancelando...
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          Cancelar e Resetar
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </div>
            )}

            {status === 'connected' && (
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-8 flex flex-col items-center text-center">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-emerald-450 mb-2">WhatsApp Conectado com Sucesso!</h3>
                <p className="text-xs text-slate-455 max-w-md mb-4 leading-relaxed">
                  Seu dispositivo comercial está ativo. O ConversIA está integrado de forma transparente e auditará as mensagens que chegam e saem do número conectado.
                </p>
                {connectedPhone && (
                  <div className="mb-8 p-3 bg-slate-950 border border-slate-900 rounded-xl inline-flex items-center gap-2 animate-fade-in">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="text-xs text-slate-400">
                      Número Conectado: <strong className="text-indigo-400 font-semibold">{connectedPhone}</strong>
                    </span>
                  </div>
                )}
                <button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="px-5 py-2.5 bg-slate-950 hover:bg-rose-950 border border-slate-900 hover:border-rose-900 text-slate-400 hover:text-rose-400 disabled:opacity-50 rounded-xl text-sm font-medium transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isDisconnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Desconectando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Desconectar WhatsApp
                    </>
                  )}
                </button>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
