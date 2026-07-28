"use client";
import { useState } from "react";

// Gelişmiş E-posta Kontrolü (Regex)
// Sadece @ işaretini değil, geçerli bir domain ve uzantıyı da (örn: .com, .net) zorunlu kılar.
const validateEmail = (email: string) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

export default function RegisterPage() {
  const [step, setStep] = useState<"form" | "verify">("form");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // ADIM 1: Formu gönder — hesap henüz oluşturulmuyor, sadece e-postaya kod yolluyoruz
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validateEmail(email)) {
      setError("Lütfen geçerli bir e-posta adresi girin (Örn: isim@gmail.com, isim@hotmail.com)");
      return;
    }
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep("verify");
        startResendCooldown();
      } else {
        setError(data.error || "Bilinmeyen bir hata oluştu.");
      }
    } catch (err) {
      setError("Bağlantı hatası! Sunucuya ulaşılamıyor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ADIM 2: Kodu doğrula — bu adım başarılı olunca gerçek hesap oluşuyor
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (code.trim().length !== 6) {
      setError("Lütfen 6 haneli kodu eksiksiz gir.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: code.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Kayıt Başarılı!");
        window.location.href = "/";
      } else {
        setError(data.error || "Bilinmeyen bir hata oluştu.");
      }
    } catch (err) {
      setError("Bağlantı hatası! Sunucuya ulaşılamıyor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startResendCooldown = () => {
    setResendCooldown(30);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        startResendCooldown();
      } else {
        setError(data.error || "Kod tekrar gönderilemedi.");
      }
    } catch (err) {
      setError("Bağlantı hatası! Sunucuya ulaşılamıyor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4">
      <div className="w-full max-w-xs">
        <h1 className="text-2xl font-bold mb-8 text-center">
          {step === "form" ? "Hesap Oluştur" : "E-postanı Doğrula"}
        </h1>

        {/* ŞIK HATA BİLDİRİM KARTU */}
        {error && (
          <div className="p-3 mb-4 text-xs font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-center">
            {error}
          </div>
        )}

        {step === "form" ? (
          <form onSubmit={handleRequestCode} className="flex flex-col gap-4 w-full">
            <input
              type="text"
              placeholder="Kullanıcı Adı"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
            />
            <input
              type="email"
              placeholder="Email (Örn: ad@domain.com)"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
            />
            <input
              type="password"
              placeholder="Şifre"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-500 py-3 rounded-lg font-bold hover:bg-emerald-400 active:scale-95 transition-all text-slate-950 disabled:opacity-50 disabled:active:scale-100"
            >
              {isSubmitting ? "Kod Gönderiliyor..." : "Devam Et"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4 w-full">
            <p className="text-xs text-slate-400 text-center -mt-2 mb-1">
              <span className="text-slate-200 font-semibold">{email}</span> adresine 6 haneli bir kod gönderdik.
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="6 haneli kod"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-center text-lg tracking-[0.5em] text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-500 py-3 rounded-lg font-bold hover:bg-emerald-400 active:scale-95 transition-all text-slate-950 disabled:opacity-50 disabled:active:scale-100"
            >
              {isSubmitting ? "Doğrulanıyor..." : "Kodu Doğrula ve Kayıt Ol"}
            </button>

            <div className="flex items-center justify-between text-xs mt-1">
              <button
                type="button"
                onClick={() => { setStep("form"); setError(""); setCode(""); }}
                className="text-slate-500 hover:text-slate-300"
              >
                ← Bilgileri düzenle
              </button>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || isSubmitting}
                className="text-emerald-400 hover:text-emerald-300 disabled:text-slate-600"
              >
                {resendCooldown > 0 ? `Tekrar gönder (${resendCooldown}sn)` : "Kodu tekrar gönder"}
              </button>
            </div>
          </form>
        )}

        <div className="text-center mt-6">
          <a href="/" className="text-emerald-400 text-sm hover:underline">
            Zaten hesabın var mı? Giriş Yap
          </a>
        </div>
      </div>
    </main>
  );
}