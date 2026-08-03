"use client";

import { useMemo, useState, useEffect } from "react";
import { X, Bug, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { buildReport } from "@/lib/reportBug";

const STATUS = { idle: 0, sending: 1, success: 2, error: 3 };

export default function ReportModal({ open, onClose, context }) {
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(STATUS.idle);
  const [errorMsg, setErrorMsg] = useState("");

  const report = useMemo(() => buildReport(context), [context]);

  useEffect(() => {
    if (open) {
      setStatus(STATUS.idle);
      setErrorMsg("");
      setDescription(report.description);
    }
  }, [open, report]);

  if (!open) return null;

  const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_KEY ?? "";
  const canSubmit =
    status === STATUS.idle && description.trim().length > 0 && accessKey.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setStatus(STATUS.sending);
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: accessKey,
          subject: context?.event
            ? `[SkinRoute] Bug report \u2014 ${context.event.name}`
            : "[SkinRoute] Bug report",
          message: `${description}\n\n--- TECHNICAL DETAILS ---\n${report.technical}`,
          from_name: "SkinRoute User",
          botcheck: "",
          ...report.fields,
        }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("application/json")) {
        throw new Error("The form service returned an error page. Please try again.");
      }
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("The form service returned an unreadable response. Please try again.");
      }
      if (data?.success) {
        setStatus(STATUS.success);
      } else {
        setStatus(STATUS.error);
        setErrorMsg(data?.message ?? "The form service rejected the submission.");
      }
    } catch (err) {
      setStatus(STATUS.error);
      setErrorMsg(err?.message ?? "Network error \u2014 could not reach the form service.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] max-h-[90vh] overflow-y-auto rounded-2xl border border-border-subtle bg-navy-light p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Bug size={20} className="text-accent-coral" />
            <h3 className="font-heading text-lg font-bold text-text-primary">Report a Bug</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} className="text-text-muted hover:text-text-primary transition-colors" />
          </button>
        </div>

        {status === STATUS.success ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 size={40} className="text-accent-green" />
            <p className="font-heading font-bold text-text-primary">Report sent</p>
            <p className="text-xs text-text-muted max-w-[300px]">
              Thanks! Your report was received and will be looked into.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-5 py-2 rounded-lg bg-accent-blue text-white font-heading font-bold hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-text-muted leading-relaxed mb-4">
              Something look wrong with a plan? Describe what you expected vs what you got. Your
              event inputs and plan details are attached automatically.
            </p>

            <label className="block text-[11px] text-text-muted uppercase tracking-wide mb-1.5">
              What went wrong?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. The recharge plan total is 100 BDT higher than the sum of the packs shown..."
              className="w-full rounded-lg bg-navy border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent-gold/50 resize-y"
            />

            <label className="block text-[11px] text-text-muted uppercase tracking-wide mt-4 mb-1.5">
              Technical details (auto)
            </label>
            <pre className="w-full max-h-56 overflow-y-auto rounded-lg bg-navy border border-border-subtle px-3 py-2.5 text-[11px] leading-relaxed text-text-muted whitespace-pre-wrap break-words">
              {report.technical}
            </pre>

            {accessKey.length === 0 && (
              <p className="flex items-start gap-2 mt-3 px-3 py-2 rounded-lg bg-accent-amber/10 border border-accent-amber/40 text-xs text-text-primary">
                <AlertTriangle size={14} className="text-accent-amber shrink-0 mt-0.5" />
                Report form is not configured yet (missing NEXT_PUBLIC_WEB3FORMS_KEY). Once the key
                is added, this form sends reports to the inbox.
              </p>
            )}

            {status === STATUS.error && (
              <p className="flex items-start gap-2 mt-3 px-3 py-2 rounded-lg bg-accent-coral/10 border border-accent-coral/40 text-xs text-text-primary">
                <AlertTriangle size={14} className="text-accent-coral shrink-0 mt-0.5" />
                {errorMsg}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-accent-gold text-navy font-heading font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Send size={15} />
              {status === STATUS.sending ? "Sending..." : "Send report"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
