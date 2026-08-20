import { Button, EmptyState } from '@rozenite/ui';
import { Cause } from 'effect';

export const LoadingState = ({ label }: { readonly label: string }) => (
  <div
    className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground"
    role="status">
    <span className="mr-2 inline-block size-3 animate-pulse rounded-full bg-primary" />
    {label}
  </div>
);

export const ErrorState = ({
  title,
  cause,
  onRetry,
}: {
  readonly title: string;
  readonly cause: Cause.Cause<unknown>;
  readonly onRetry?: () => void;
}) => (
  <EmptyState
    title={title}
    description={
      <pre className="max-h-32 max-w-lg overflow-auto whitespace-pre-wrap text-left font-mono text-xs">
        {Cause.pretty(cause)}
      </pre>
    }
    action={
      onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null
    }
  />
);
