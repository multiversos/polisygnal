import { formatDateTime } from "../../lib/copyTrading";
import type { CopyBotEvent } from "../../lib/copyTradingTypes";

export function CopyBotEvents({ events }: { events: CopyBotEvent[] }) {
  return (
    <section className="copy-panel">
      <div className="copy-panel-heading">
        <span>Auditoria</span>
        <strong>Eventos</strong>
      </div>
      {events.length === 0 ? (
        <div className="copy-empty-state">Sin eventos del bot todavia.</div>
      ) : (
        <div className="copy-events">
          {events.map((event) => (
            <article className={`copy-event ${event.level}`} key={event.id}>
              <span>{event.level}</span>
              <strong>{event.message}</strong>
              <small>{formatDateTime(event.created_at)}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
