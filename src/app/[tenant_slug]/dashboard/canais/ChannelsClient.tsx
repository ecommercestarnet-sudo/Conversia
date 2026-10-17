'use client';

import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Sparkles,
  ExternalLink,
  Loader2,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

interface ChannelsClientProps {
  company: any;
  lastStatusLog?: { status: string; created_at: string } | null;
  tenantSlug: string;
}

const INSTAGRAM_APP_ID = '2457047531452520';

export default function ChannelsClient({ company, lastStatusLog, tenantSlug }: ChannelsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get('status');
  const urlError = searchParams.get('error');

  const [isDisconnectingIg, setIsDisconnectingIg] = useState(false);
  const isWhatsappConnected = company?.whatsapp_status === 'connected';
  const isInstagramConnected = company?.instagram_status === 'connected' || urlStatus === 'instagram_connected';

  // Gerar URL oficial do Instagram Business Login
  const handleConnectInstagram = () => {
    const redirectUri = typeof window !== 'undefined' 
      ? `${window.location.origin}/api/auth/instagram/callback`
      : 'https://conversia-two.vercel.app/api/auth/instagram/callback';

    const scopes = [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments'
    ].join(',');

    const authUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${tenantSlug}`;

    window.location.href = authUrl;
  };

  const handleDisconnectInstagram = async () => {
    if (!confirm('Deseja realmente desconectar a conta do Instagram?')) return;
    setIsDisconnectingIg(true);

    try {
      const res = await fetch(`/api/auth/instagram/disconnect?slug=${tenantSlug}`, { method: 'POST' });
      if (res.ok) {
        window.location.href = `/${tenantSlug}/dashboard/canais`;
      } else {
        alert('Erro ao desconectar Instagram.');
      }
    } catch (e) {
      alert('Erro de conexão ao desconectar.');
    } finally {
      setIsDisconnectingIg(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 px-6 py-4 shadow-sm">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
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
                <img src="/Logo-SupervisIA.png" alt="SupervisIA Logo" className="h-8 w-auto object-contain" />
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  Canais de Atendimento
                </h1>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Conecte seus canais comerciais para auditar conversas com inteligência artificial
              </p>
            </div>
          </div>

          <div className="text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 shadow-sm">
            Empresa: <strong className="text-emerald-600">{company?.name}</strong>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {urlError && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2.5 shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Detalhe ao conectar Instagram: {urlError}</span>
          </div>
        )}

        {urlStatus === 'instagram_connected' && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2.5 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Instagram conectado com sucesso! Suas mensagens diretas já estão vinculadas ao SupervisIA.</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Card 1: WhatsApp */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-emerald-300 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 text-[#00a884] flex items-center justify-center border border-emerald-200">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">WhatsApp</h2>
                    <p className="text-xs text-slate-500">Auditoria silenciosa no app do celular</p>
                  </div>
                </div>
                {isWhatsappConnected ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Conectado
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Desconectado
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                Conecte escaneando o QR Code pelo WhatsApp do celular do atendente. Todas as mensagens são capturadas e analisadas pela IA.
              </p>
            </div>

            <button
              onClick={() => router.push(`/${tenantSlug}/dashboard/whatsapp`)}
              className="w-full py-2.5 px-4 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              {isWhatsappConnected ? 'Gerenciar WhatsApp' : 'Conectar WhatsApp via QR Code'}
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </button>
          </div>

          {/* Card 2: Instagram Direct */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-pink-300 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600 text-white flex items-center justify-center shadow-xs">
                    {/* SVG Instagram */}
                    <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.13-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Instagram Direct</h2>
                    <p className="text-xs text-slate-500">API Oficial Meta (Graph API)</p>
                  </div>
                </div>
                {isInstagramConnected ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Conectado
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Desconectado
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Receba e audite mensagens diretas do Instagram da empresa. O atendente continua usando o app do Instagram no celular sem interrupções.
              </p>

              {isInstagramConnected && company?.instagram_username && (
                <div className="mb-4 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-center justify-between">
                  <span>Conta conectada: <strong>@{company.instagram_username}</strong></span>
                  <button
                    onClick={handleDisconnectInstagram}
                    disabled={isDisconnectingIg}
                    className="text-rose-600 hover:text-rose-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    Desconectar
                  </button>
                </div>
              )}
            </div>

            {isInstagramConnected ? (
              <button
                onClick={handleConnectInstagram}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reconectar ou Trocar Conta
              </button>
            ) : (
              <button
                onClick={handleConnectInstagram}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-pink-500/10"
              >
                Conectar com Facebook / Instagram
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
