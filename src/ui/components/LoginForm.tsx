import { useId, useState, type FormEvent } from "react";

import { useSession } from "../hooks/sessionContext";

const FORM_STATUS = {
  EDITING: "editing",
  SENDING: "sending",
  SENT: "sent",
} as const;

type FormStatus = (typeof FORM_STATUS)[keyof typeof FORM_STATUS];

/**
 * Validación mínima, solo para atrapar erratas evidentes antes de gastar un
 * envío: quien decide si el correo existe es el servidor.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INPUT =
  "w-full rounded-md border border-white/15 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 disabled:opacity-60";
const SUBMIT =
  "rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60";

export function LoginForm() {
  const { requestMagicLink } = useSession();
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>(FORM_STATUS.EDITING);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError("Escribe un correo válido, como nombre@ejemplo.com.");
      return;
    }

    setError(null);
    setStatus(FORM_STATUS.SENDING);
    try {
      await requestMagicLink(address);
      setSentTo(address);
      setStatus(FORM_STATUS.SENT);
    } catch (reason) {
      // El gateway ya rechaza con un mensaje en español y sin datos técnicos.
      setError(reason instanceof Error ? reason.message : "No se pudo enviar el enlace de acceso.");
      setStatus(FORM_STATUS.EDITING);
    }
  };

  if (status === FORM_STATUS.SENT) {
    return (
      <p role="status" className="text-sm text-neutral-300">
        Te hemos enviado un enlace a {sentTo}. Revisa tu correo y ábrelo para entrar.
      </p>
    );
  }

  const sending = status === FORM_STATUS.SENDING;

  return (
    // noValidate: la validación es la nuestra, con el mensaje en español.
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-xs text-neutral-400">
        Te enviamos un enlace para entrar, sin contraseña.
      </label>
      <input
        id={inputId}
        type="email"
        autoComplete="email"
        placeholder="nombre@ejemplo.com"
        value={email}
        disabled={sending}
        onChange={(event) => setEmail(event.target.value)}
        className={INPUT}
      />
      {error !== null && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
      <button type="submit" disabled={sending} className={SUBMIT}>
        {sending ? "Enviando…" : "Enviar enlace"}
      </button>
    </form>
  );
}
