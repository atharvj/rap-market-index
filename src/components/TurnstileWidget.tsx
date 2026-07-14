"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

type TurnstileOptions = {
  sitekey: string;
  theme: "auto";
  size: "normal";
  appearance: "always";
  action: string;
  "response-field": false;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileWidgetProps = {
  siteKey: string;
  onTokenChange: (token: string | null) => void;
  resetKey?: number;
  action?: string;
};

export function TurnstileWidget({
  siteKey,
  onTokenChange,
  resetKey = 0,
  action = "rmi_auth"
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const removeWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.remove(widgetIdRef.current);
    }

    widgetIdRef.current = null;
    containerRef.current?.replaceChildren();
  }, []);

  const renderWidget = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile) {
      return;
    }

    removeWidget();
    onTokenChange(null);
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: "auto",
      size: "normal",
      appearance: "always",
      action,
      "response-field": false,
      callback: (token) => onTokenChange(token),
      "expired-callback": () => onTokenChange(null),
      "error-callback": () => onTokenChange(null)
    });
  }, [action, onTokenChange, removeWidget, siteKey]);

  useEffect(() => {
    renderWidget();

    return () => removeWidget();
  }, [removeWidget, renderWidget, resetKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="flex min-h-[65px] items-center justify-center overflow-hidden" aria-label="Security verification">
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
      />
      <div ref={containerRef} />
    </div>
  );
}
