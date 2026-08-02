import { useEffect } from 'react';

import { Button } from '#src/ui/components/ui/button.tsx';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export const ConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}: ConfirmDialogProps) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };
    if (open) {
      globalThis.document.addEventListener('keydown', onKeyDown);
    }
    return () => {
      if (open) {
        globalThis.document.removeEventListener('keydown', onKeyDown);
      }
    };
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-labelledby="confirm-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="alertdialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}>
      <div className="w-full max-w-md rounded-lg border bg-card text-card-foreground shadow-lg">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="flex size-8 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
              <path
                d="M12 9v4m0 4h.01M10.3 3.8 2.5 18a2 2 0 0 0 1.75 3h15.5a2 2 0 0 0 1.75-3l-7.8-14.2a2 2 0 0 0-3.4 0Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </div>
          <h2 className="text-base font-semibold" id="confirm-dialog-title">
            {title}
          </h2>
        </div>
        <p className="px-5 py-4 text-sm leading-6 text-muted-foreground">{message}</p>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}>
            {cancelText}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};
