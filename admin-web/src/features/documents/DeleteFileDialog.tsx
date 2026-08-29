import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { deleteFile } from '@/features/documents/api';
import { toApiError } from '@/lib/errors';
import { invalidateFileLists } from '@/lib/queryKeys';
import type { FileItem } from '@/types/api';

/**
 * Deleting a document, with the reason the rules require.
 *
 * <p>The reason is not a formality and the dialog says so: it is sent to everyone else with an
 * account, over the deleter's name. The Delete button stays disabled until something is typed, but
 * the server refuses a blank reason regardless — this only saves the user a round trip.
 */
export function DeleteFileDialog({
  file,
  onClose,
}: {
  file: FileItem | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => deleteFile(file!.id, reason.trim()),
    onSuccess: () => {
      // Search and the home dashboard show documents too, so the list of what a
      // deletion invalidates lives in one place rather than being re-guessed here.
      void invalidateFileLists(queryClient);
      close();
    },
  });

  const close = () => {
    setReason('');
    remove.reset();
    onClose();
  };

  return (
    <Modal
      open={file !== null}
      title="Delete this document?"
      description={file ? `“${file.fileName}” will be removed from ${file.folderName}.` : undefined}
      onClose={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim()) remove.mutate();
        }}
        className="space-y-4"
      >
        <TextAreaField
          label="Reason for deleting"
          hint="Everyone else is notified with this reason, and with your name."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={1000}
          required
        />

        {remove.isError && <Alert tone="error">{toApiError(remove.error).message}</Alert>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            Keep it
          </Button>
          <Button type="submit" variant="danger" loading={remove.isPending} disabled={!reason.trim()}>
            Delete document
          </Button>
        </div>
      </form>
    </Modal>
  );
}
