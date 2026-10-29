"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { addRequestMedia, createRequest, finishRequestMedia, updateRequest } from "@/app/actions/donations";
import { useT } from "@/components/i18n-provider";
import { Field, FileField, Notice, SubmitButton, TextAreaField } from "@/components/ui";
import type { FormState } from "@/lib/definitions";
import { fmt } from "@/lib/i18n/config";
import { IMAGE_TYPES, MAX_REQUEST_IMAGES, MAX_REQUEST_VIDEOS, MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/lib/upload-limits";

export type RequestInitial = {
  id: string;
  title: string;
  story: string;
  target: string;
  deadline: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrFileId: string | null;
  media: { id: string; fileId: string; kind: "image" | "video" }[];
};

type Picked = { key: string; file: File; kind: "image" | "video"; url: string };

const ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");
const EXT_KIND: Record<string, "image" | "video"> = { jpg: "image", jpeg: "image", png: "image", webp: "image", mp4: "video", webm: "video", mov: "video" };

/** Some phones leave the type empty; the extension is a fair first guess (the server checks the content). */
function kindOf(file: File): "image" | "video" | null {
  if (IMAGE_TYPES.includes(file.type)) return "image";
  if (VIDEO_TYPES.includes(file.type)) return "video";
  if (!file.type) return EXT_KIND[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
  return null;
}

/**
 * Used for both "Ask for help" and editing a request. The text and payment details are saved
 * first; then each photo or video uploads on its own, so one failed file never loses the request.
 */
export function RequestForm({ initial }: { initial?: RequestInitial }) {
  const tt = useT();
  const t = tt.donations;
  const router = useRouter();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [pickErrors, setPickErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ n: number; total: number; name: string } | null>(null);
  const [failed, setFailed] = useState<{ id: string; lines: string[] } | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Free the preview URLs when files are removed or the form goes away.
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const [state, action] = useActionState(async (prev: FormState, formData: FormData): Promise<FormState> => {
    setFailed(null);
    const saved = await (initial ? updateRequest : createRequest)(prev, formData);
    if (!saved?.success || !saved.kind) return saved;
    const id = saved.kind;

    const problems: string[] = [];
    for (const [i, item] of picked.entries()) {
      setProgress({ n: i + 1, total: picked.length, name: item.file.name });
      const one = new FormData();
      one.set("requestId", id);
      one.set("file", item.file);
      try {
        const r = await addRequestMedia(undefined, one);
        if (!r?.success) problems.push(`${item.file.name}: ${r?.message ?? t.errGeneric}`);
      } catch {
        problems.push(`${item.file.name}: ${t.errGeneric}`);
      }
    }
    setProgress(null);
    await finishRequestMedia();
    if (problems.length) {
      setFailed({ id, lines: problems });
      setPicked([]);
      return saved;
    }
    router.push(initial ? `/donations/${id}?saved=1` : `/donations/${id}`);
    return saved;
  }, undefined);

  const v = state?.values;
  const e = state?.errors;
  const today = new Date().toISOString().slice(0, 10);
  const val = (key: keyof Omit<RequestInitial, "media">) => v?.[key as string] ?? (initial ? String(initial[key] ?? "") : undefined);

  const kept = (initial?.media ?? []).filter((m) => !removed.includes(m.id));
  const images = kept.filter((m) => m.kind === "image").length + picked.filter((p) => p.kind === "image").length;
  const videos = kept.filter((m) => m.kind === "video").length + picked.filter((p) => p.kind === "video").length;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const errors: string[] = [];
    const next: Picked[] = [];
    let imgs = images;
    let vids = videos;
    for (const file of Array.from(list)) {
      const kind = kindOf(file);
      if (!kind) errors.push(`${file.name}: ${t.errMediaType}`);
      else if (kind === "image" && file.size > MAX_UPLOAD_BYTES) errors.push(`${file.name}: ${t.errImageSize}`);
      else if (kind === "video" && file.size > MAX_VIDEO_BYTES) errors.push(`${file.name}: ${t.errVideoSize}`);
      else if (kind === "image" && imgs >= MAX_REQUEST_IMAGES) errors.push(`${file.name}: ${fmt(t.errTooManyImages, { n: MAX_REQUEST_IMAGES })}`);
      else if (kind === "video" && vids >= MAX_REQUEST_VIDEOS) errors.push(`${file.name}: ${fmt(t.errTooManyVideos, { n: MAX_REQUEST_VIDEOS })}`);
      else {
        const url = URL.createObjectURL(file);
        urls.current.add(url);
        next.push({ key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, kind, url });
        if (kind === "image") imgs++;
        else vids++;
      }
    }
    setPicked((p) => [...p, ...next]);
    setPickErrors(errors);
    if (pickerRef.current) pickerRef.current.value = "";
  }

  function dropPicked(key: string) {
    setPicked((p) => {
      const gone = p.find((x) => x.key === key);
      if (gone) {
        URL.revokeObjectURL(gone.url);
        urls.current.delete(gone.url);
      }
      return p.filter((x) => x.key !== key);
    });
  }

  // Saved, but some files didn't make it: say which, and offer the request anyway.
  if (failed) {
    return (
      <div className="space-y-4" role="alert">
        <Notice tone="error">{t.uploadFailedTitle}</Notice>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {failed.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="text-sm text-ink-soft">{t.uploadFailedBody}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/donations/${failed.id}`} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-2">
            {t.openRequest}
          </Link>
          <Link href={`/donations/${failed.id}/edit`} className="rounded-lg px-4 py-2 text-sm font-medium text-ink-soft hover:bg-sunken">
            {t.addMoreLater}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {initial && <input type="hidden" name="requestId" value={initial.id} />}
      {removed.map((id) => (
        <input key={id} type="hidden" name="removeMedia" value={id} />
      ))}
      {state?.message && <Notice tone="error">{state.message}</Notice>}

      <Field label={t.fTitle} name="title" placeholder={t.fTitlePlaceholder} defaultValue={val("title")} errors={e?.title} maxLength={150} />
      <TextAreaField label={t.fStory} name="story" placeholder={t.fStoryPlaceholder} defaultValue={val("story")} errors={e?.story} maxLength={4000} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t.fTarget}
          name="target"
          inputMode="numeric"
          optional
          hint={t.fTargetHint}
          defaultValue={val("target")}
          errors={e?.target}
          className="[&_input]:tabular-nums"
        />
        <Field
          label={t.fDeadline}
          name="deadline"
          type="date"
          min={today}
          optional
          hint={t.fDeadlineHint}
          defaultValue={val("deadline")}
          errors={e?.deadline}
        />
      </div>

      {/* Photos and videos: chosen here, uploaded one by one after the request is saved. */}
      <fieldset className="space-y-3">
        <legend className="flex w-full flex-wrap items-baseline justify-between gap-2 text-sm font-medium text-ink">
          <span>
            {t.fMedia} <span className="text-xs font-normal text-muted">{tt.common.optional}</span>
          </span>
          <span className="tabular text-xs font-normal text-muted">
            {fmt(t.mediaCount, { images, maxImages: MAX_REQUEST_IMAGES, videos, maxVideos: MAX_REQUEST_VIDEOS })}
          </span>
        </legend>

        {(initial?.media.length || picked.length) > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {initial?.media.map((m, i) => {
              const gone = removed.includes(m.id);
              return (
                <li key={m.id} className={`relative overflow-hidden rounded-lg border border-line bg-sunken ${gone ? "opacity-40" : ""}`}>
                  <Thumb src={`/files/${m.fileId}`} kind={m.kind} label={t.video} />
                  {!gone && i === (initial.media.findIndex((x) => x.kind === "image" && !removed.includes(x.id))) && (
                    <span className="absolute top-1 left-1 rounded bg-surface/90 px-1.5 text-[0.65rem] font-semibold text-ink">{t.cover}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setRemoved((r) => (gone ? r.filter((x) => x !== m.id) : [...r, m.id]))}
                    className="absolute right-1 bottom-1 rounded bg-surface/95 px-1.5 py-0.5 text-[0.7rem] font-semibold text-ink shadow-sm hover:text-bad"
                  >
                    {gone ? t.undo : t.removeItem}
                  </button>
                </li>
              );
            })}
            {picked.map((p) => (
              <li key={p.key} className="relative overflow-hidden rounded-lg border border-brand-bright/40 bg-sunken">
                <Thumb src={p.url} kind={p.kind} label={t.video} />
                <span className="absolute top-1 left-1 rounded bg-brand px-1.5 text-[0.65rem] font-semibold text-white">{t.newItem}</span>
                <button
                  type="button"
                  onClick={() => dropPicked(p.key)}
                  className="absolute right-1 bottom-1 rounded bg-surface/95 px-1.5 py-0.5 text-[0.7rem] font-semibold text-ink shadow-sm hover:text-bad"
                >
                  {t.removeItem}
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3.5 py-3 text-sm font-medium text-brand transition-colors hover:border-brand-bright hover:bg-brand-wash/40">
          + {t.addMedia}
          <input ref={pickerRef} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(ev) => addFiles(ev.target.files)} />
        </label>
        <p className="text-sm text-muted">{fmt(t.fMediaHint, { maxImages: MAX_REQUEST_IMAGES, maxVideos: MAX_REQUEST_VIDEOS })}</p>
        {pickErrors.length > 0 && (
          <ul className="space-y-0.5 text-sm text-bad" role="alert">
            {pickErrors.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="rounded-lg border border-line bg-paper/60 p-4">
        <legend className="px-1 text-sm font-semibold text-brand">{t.payment}</legend>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.fBank} name="bankName" optional defaultValue={val("bankName")} placeholder="BCEL" />
            <Field label={t.fAccountName} name="accountName" optional defaultValue={val("accountName")} />
          </div>
          <Field
            label={t.fAccountNumber}
            name="accountNumber"
            optional
            inputMode="numeric"
            defaultValue={val("accountNumber")}
            errors={e?.accountNumber}
            className="[&_input]:tabular-nums"
          />
          <FileField
            label={t.fQr}
            name="qr"
            accept="image/jpeg,image/png,image/webp"
            hint={initial?.qrFileId ? t.keepFile : t.fQrHint}
            errors={e?.qr}
            chooseLabel={tt.common.chooseFile}
          />
          {initial?.qrFileId && <CurrentFile id={initial.qrFileId} label={t.currentQr} removeName="removeQr" removeLabel={t.removeQr} />}
        </div>
      </fieldset>

      {progress && (
        <p className="rounded-lg bg-brand-wash px-4 py-3 text-sm text-ink" role="status">
          {fmt(t.uploading, { n: progress.n, total: progress.total, name: progress.name })}
        </p>
      )}
      <SubmitButton pendingLabel={progress ? t.uploadingShort : initial ? t.saving : t.submitting} className="w-full">
        {initial ? t.save : t.submit}
      </SubmitButton>
    </form>
  );
}

function Thumb({ src, kind, label }: { src: string; kind: "image" | "video"; label: string }) {
  return kind === "image" ? (
    // eslint-disable-next-line @next/next/no-img-element -- a local preview or an auth-checked upload
    <img src={src} alt="" className="aspect-square w-full object-cover" />
  ) : (
    <span className="relative block">
      <video src={src} muted playsInline preload="metadata" className="aspect-square w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-black/55 px-2 py-0.5 text-[0.7rem] font-semibold text-white">▶ {label}</span>
      </span>
    </span>
  );
}

function CurrentFile({ id, label, removeName, removeLabel }: { id: string; label: string; removeName: string; removeLabel: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-surface p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked upload */}
      <img src={`/files/${id}`} alt={label} className="size-16 rounded-md border border-line object-cover" />
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <label className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" name={removeName} className="size-4 accent-brand" />
          {removeLabel}
        </label>
      </div>
    </div>
  );
}
