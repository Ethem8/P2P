"use client";
import { useState } from "react";

const validateEmail = (email: string) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "reset" | "done">("email");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

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

  // ADIM 1: E-posta gönder — kayıtlıysa kod gider (var/yok bilgisi sızdırılmıyor)
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!validateEmail(email)) {
      setError("Lütfen geçerli bir e-posta adresi girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep("reset");
        setInfo("Eğer bu e-posta kayıtlıysa, gelen kutuna bir doğrulama kodu gönderdik.");
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

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        startResendCooldown();
        setInfo("Kod tekrar gönderildi.");
      } else {
        const data = await res.json();
        setError(data.error || "Kod tekrar gönderilemedi.");
      }
    } catch (err) {
      setError("Bağlantı hatası! Sunucuya ulaşılamıyor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ADIM 2: Kod + yeni şifreyi gönder
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (code.trim().length !== 6) {
      setError("Lütfen 6 haneli kodu eksiksiz gir.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Şifre en az 6 karakter olmalı.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: code.trim(), newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep("done");
      } else {
        setError(data.error || "Bilinmeyen bir hata oluştu.");
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
          {step === "email" && "Şifremi Unuttum"}
          {step === "reset" && "Yeni Şifre Belirle"}
          {step === "done" && "Şifre Güncellendi"}
        </h1>

        {error && (
          <div className="p-3 mb-4 text-xs font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-center">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="p-3 mb-4 text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-center">
            {info}
          </div>
        )}

        {step === "email" && (
          <form onSubmit={handleRequestCode} className="flex flex-col gap-4 w-full">
            <p className="text-xs text-slate-400 text-center -mt-2 mb-1">
              Hesabına kayıtlı e-posta adresini gir, sana bir doğrulama kodu gönderelim.
            </p>
            <input
              type="email"
              placeholder="Email (Örn: ad@domain.com)"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-500 py-3 rounded-lg font-bold hover:bg-emerald-400 active:scale-95 transition-all text-slate-950 disabled:opacity-50 disabled:active:scale-100"
            >
              {isSubmitting ? "Gönderiliyor..." : "Kod Gönder"}
            </button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4 w-full">
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
            <input
              type="password"
              placeholder="Yeni Şifre"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
            />
            <input
              type="password"
              placeholder="Yeni Şifre (Tekrar)"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-slate-900 border border-slate-700 p-3 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-all"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-500 py-3 rounded-lg font-bold hover:bg-emerald-400 active:scale-95 transition-all text-slate-950 disabled:opacity-50 disabled:active:scale-100"
            >
              {isSubmitting ? "Güncelleniyor..." : "Şifreyi Güncelle"}
            </button>

            <div className="flex items-center justify-between text-xs mt-1">
              <button
                type="button"
                onClick={() => { setStep("email"); setError(""); setInfo(""); setCode(""); }}
                className="text-slate-500 hover:text-slate-300"
              >
                ← E-postayı değiştir
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

        {step === "done" && (
          <div className="flex flex-col gap-4 items-center text-center">
            <p className="text-sm text-slate-300">
              Şifren başarıyla güncellendi. Artık yeni şifrenle giriş yapabilirsin.
            </p>
            <a
              href="/"
              className="w-full bg-emerald-500 py-3 rounded-lg font-bold hover:bg-emerald-400 active:scale-95 transition-all text-slate-950 text-center"
            >
              Giriş Yap
            </a>
          </div>
        )}

        {step !== "done" && (
          <div className="text-center mt-6">
            <a href="/" className="text-emerald-400 text-sm hover:underline">
              Giriş sayfasına dön
            </a>
          </div>
        )}
      </div>
    </main>
  );
}   