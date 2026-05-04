import type { ReactNode } from "react";

type DataStateProps = {
  children?: ReactNode;
  compact?: boolean;
  copy?: string;
  title?: string;
};

type ApiErrorStateProps = DataStateProps & {
  message?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
};

function emptyClassName(compact?: boolean): string {
  return compact ? "empty-state compact" : "empty-state";
}

function alertClassName(compact?: boolean): string {
  return compact ? "alert-panel compact" : "alert-panel";
}

export function LoadingState({
  compact,
  copy = "Cargando datos...",
}: DataStateProps) {
  return <div className={emptyClassName(compact)}>{copy}</div>;
}

export function EmptyState({ children, compact, copy, title }: DataStateProps) {
  return (
    <div className={emptyClassName(compact)}>
      {title ? <strong>{title}</strong> : null}
      {copy ? <p>{copy}</p> : null}
      {children}
    </div>
  );
}

export function ComingSoonModule({
  children,
  compact,
  copy = "Esta vista se conectara en un sprint posterior.",
  title = "Modulo en preparacion.",
}: DataStateProps) {
  return (
    <EmptyState compact={compact} copy={copy} title={title}>
      {children}
    </EmptyState>
  );
}

export function ApiErrorState({
  compact,
  message,
  onRetry,
  retryLabel = "Reintentar",
  title = "Datos no disponibles",
}: ApiErrorStateProps) {
  return (
    <section className={alertClassName(compact)} role="status">
      <strong>{title}</strong>
      {message ? <span>{message}</span> : null}
      {onRetry ? (
        <button className="refresh-button" onClick={onRetry} type="button">
          {retryLabel}
        </button>
      ) : null}
    </section>
  );
}
