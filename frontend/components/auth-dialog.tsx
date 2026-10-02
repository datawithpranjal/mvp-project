"use client";

import { useEffect, useRef } from "react";
import { AuthForm } from "./auth-form";
import { clearAuthIntent } from "../lib/auth-flow";

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthDialog({ isOpen, onClose }: AuthDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), a[href]'
    ) ?? []).filter((element) => element.offsetParent !== null);
    controls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); clearAuthIntent(); closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = controls();
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 px-4 py-6 backdrop-blur-sm sm:py-10"
      onClick={() => { clearAuthIntent(); onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Access The Data Foundry"
        className="relative mx-auto flex w-full max-w-2xl items-start sm:my-8"
        onClick={(event) => event.stopPropagation()}
      >
        <AuthForm
          title="Access The Data Foundry"
          description="Continue securely. Your draft stays with you, and you can pick up where you left off."
          onSuccess={onClose}
        />
        <button type="button" aria-label="Close sign-in" onClick={() => { clearAuthIntent(); onClose(); }} className="absolute right-2 top-2 rounded-full px-3 py-1 text-lg text-slate-300 hover:bg-slate-800">×</button>
      </div>
    </div>
  );
}
