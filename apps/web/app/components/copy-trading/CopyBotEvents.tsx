import { formatDateTime } from "../../lib/copyTrading";
import type { CopyBotEvent } from "../../lib/copyTradingTypes";

export function CopyBotEvents({ events }: { events: CopyBotEvent[] }) {
  const groupedEvents = groupCopyBotEvents(events);

  return (
    <section className="copy-panel">
      <div className="copy-panel-heading">
        <span>Auditoria</span>
        <strong>Eventos</strong>
      </div>
      {groupedEvents.length === 0 ? (
        <div className="copy-empty-state">Sin eventos recientes.</div>
      ) : (
        <div className="copy-events">
          {groupedEvents.map((event) => (
            <article className={`copy-event ${event.level}`} key={event.id}>
              <span>{event.level}</span>
              <strong>
                {event.message}
                {event.count > 1 ? ` x ${event.count}` : ""}
              </strong>
              <small>{formatDateTime(event.created_at)}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type GroupedCopyBotEvent = CopyBotEvent & {
  count: number;
};

function groupCopyBotEvents(events: CopyBotEvent[]): GroupedCopyBotEvent[] {
  const grouped: GroupedCopyBotEvent[] = [];

  for (const event of events) {
    const normalized = normalizeCopyBotEvent(event);
    const previous = grouped.at(-1);
    if (previous && eventGroupKey(previous) === eventGroupKey(normalized)) {
      previous.count += 1;
      continue;
    }
    grouped.push({ ...normalized, count: 1 });
  }

  return grouped;
}

function normalizeCopyBotEvent(event: CopyBotEvent): CopyBotEvent {
  if (event.event_type === "demo_order_skipped" && event.metadata?.reason === "trade_too_old") {
    if (event.metadata?.freshness_status === "recent_outside_window") {
      return {
        ...event,
        message: "Trades recientes llegaron fuera de la ventana de copia.",
      };
    }
    return {
      ...event,
      message: "Trades historicos detectados fuera de la ventana de copia.",
    };
  }
  return event;
}

function eventGroupKey(event: Pick<CopyBotEvent, "event_type" | "level" | "message" | "metadata">): string {
  const reason = typeof event.metadata?.reason === "string" ? event.metadata.reason : "";
  const freshnessStatus =
    typeof event.metadata?.freshness_status === "string" ? event.metadata.freshness_status : "";
  return `${event.level}|${event.event_type}|${event.message}|${reason}|${freshnessStatus}`;
}
