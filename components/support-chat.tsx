"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "./i18n-provider";

export type ChatMessage = { id: string; body: string; fromStaff: boolean; senderName: string | null; createdAt: string };
type Status = "open" | "closed";
type Conn = "connecting" | "open" | "reconnecting" | "signedOut";

type ServerEvent =
  | { type: "ready"; staff: boolean }
  | { type: "message"; threadId: string; message: ChatMessage }
  | { type: "status"; threadId: string; status: Status }
  | { type: "read"; threadId: string }
  | { type: "error"; code: string };

/**
 * One WebSocket to /ws/support, reopened with growing pauses (1s → 15s) when it drops, until
 * the server says the session has ended. The latest handler is always used, without reconnecting.
 */
type Send = (event: object) => boolean;

export function useSupportSocket(onEvent: (e: ServerEvent, send: Send) => void) {
  const [conn, setConn] = useState<Conn>("connecting");
  const ws = useRef<WebSocket | null>(null);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  const send = useCallback<Send>((event) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return false;
    ws.current.send(JSON.stringify(event));
    return true;
  }, []);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/support`);
      ws.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setConn("open");
      };
      socket.onmessage = (m) => {
        try {
          handler.current(JSON.parse(m.data), send);
        } catch {
          // Ignore anything that isn't one of our events.
        }
      };
      socket.onclose = (e) => {
        // An old socket closing late (React mounts twice in development) must not
        // forget the newer one that replaced it.
        if (ws.current === socket) ws.current = null;
        if (stopped) return;
        if (e.code === 4401) return setConn("signedOut");
        setConn("reconnecting");
        timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt++));
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws.current?.close();
    };
  }, [send]);

  return { conn, send };
}

/**
 * The conversation between one person and the platform team. The person sees their own
 * conversation; staff see the one they opened, plus Close / Reopen. History comes from the
 * page; new messages arrive over the socket.
 */
export function SupportChat({
  threadId: initialThreadId,
  initial,
  status: initialStatus,
  staff,
  otherName,
}: {
  threadId: string | null;
  initial: ChatMessage[];
  status: Status;
  staff: boolean;
  /** For staff: the person they're talking to. */
  otherName?: string;
}) {
  const s = useT().support;
  const router = useRouter();
  const [threadId, setThreadId] = useState(initialThreadId);
  const [messages, setMessages] = useState(initial);
  const [status, setStatus] = useState(initialStatus);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const { conn, send } = useSupportSocket((e, reply) => {
    if (e.type === "ready") {
      // Opening the chat means seeing it.
      reply({ type: "read", threadId: threadId ?? undefined });
    } else if (e.type === "message") {
      const mine = staff ? e.threadId === threadId : true;
      if (!mine) {
        // Another conversation moved: refresh the inbox around this one.
        router.refresh();
        return;
      }
      if (!threadId) setThreadId(e.threadId);
      setMessages((prev) => (prev.some((m) => m.id === e.message.id) ? prev : [...prev, e.message]));
      if (!staff && !e.message.fromStaff) setStatus("open");
      if (document.visibilityState === "visible") reply({ type: "read", threadId: e.threadId });
      if (staff) router.refresh();
    } else if (e.type === "status") {
      if (!staff || e.threadId === threadId) setStatus(e.status);
      if (staff) router.refresh();
    } else if (e.type === "error") {
      setError(e.code === "too_fast" ? s.errTooFast : e.code === "bad_body" ? s.errBody : s.errGeneric);
    }
  });

  // Keep the newest message in view.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length]);

  function submit() {
    const body = draft.trim();
    if (!body) return;
    if (body.length > 2000) return setError(s.errBody);
    if (send({ type: "send", body, threadId: threadId ?? undefined })) {
      setDraft("");
      setError(null);
    } else {
      setError(s.errOffline);
    }
  }

  const connLabel = conn === "open" ? s.connOpen : conn === "signedOut" ? s.connSignedOut : conn === "reconnecting" ? s.connRetry : s.connConnecting;

  return (
    <div className="flex h-[min(70dvh,40rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{staff ? otherName : s.team}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`size-2 rounded-full ${conn === "open" ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />
            {connLabel}
            {status === "closed" && <> · {s.closed}</>}
          </p>
        </div>
        {staff && threadId && (
          <button
            type="button"
            disabled={conn !== "open"}
            onClick={() => send({ type: "status", threadId, status: status === "open" ? "closed" : "open" })}
            className="rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-sunken disabled:opacity-50"
          >
            {status === "open" ? s.close : s.reopen}
          </button>
        )}
      </div>

      <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <p className="mx-auto mt-8 max-w-sm text-center text-sm text-ink-soft">{staff ? s.emptyStaff : s.empty}</p>
        ) : (
          messages.map((m) => {
            // Each side sees its own messages on the right.
            const own = m.fromStaff === staff;
            return (
              <div key={m.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${own ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-sunken text-ink"}`}>
                  {!own && m.senderName && <p className="mb-0.5 text-xs font-semibold opacity-75">{m.fromStaff ? s.team : m.senderName}</p>}
                  <p className="break-words whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-right text-[0.7rem] ${own ? "text-white/70" : "text-muted"}`} suppressHydrationWarning>
                    {new Date(m.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error && (
          <p className="mb-2 text-xs text-bad" role="alert">
            {error}
          </p>
        )}
        {!staff && status === "closed" && <p className="mb-2 text-xs text-muted">{s.closedNote}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter starts a new line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={s.placeholder}
            aria-label={s.placeholder}
            disabled={conn === "signedOut"}
            className="min-h-11 flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/80 focus:border-brand-bright focus:ring-4 focus:ring-brand-bright/15"
          />
          <button
            type="submit"
            disabled={conn !== "open" || !draft.trim()}
            className="h-11 shrink-0 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {s.send}
          </button>
        </div>
      </form>
    </div>
  );
}

/** For the staff inbox with no conversation open: refresh the list whenever anything changes. */
export function InboxLive() {
  const router = useRouter();
  useSupportSocket((e) => {
    if (e.type === "message" || e.type === "status" || e.type === "read") router.refresh();
  });
  return null;
}
