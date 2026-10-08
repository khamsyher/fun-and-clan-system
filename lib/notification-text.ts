import { fmt, type Dictionary, type Locale } from "./i18n/config";
import { formatDate } from "./format";
import type { NotificationRow } from "./notify";

/** Turns a stored notification into the reader's language, with a date. */
export function renderNotification(n: NotificationRow, t: Dictionary, locale: Locale) {
  const template = t.notifications.types[n.type];
  return {
    id: String(n.id),
    text: template ? fmt(template, n.params) : n.type,
    link: n.link,
    when: formatDate(n.created_at, locale),
    unread: n.read_at === null,
  };
}
