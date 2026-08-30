import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import {
  createTemplate,
  deleteTemplate,
  fetchAllTemplates,
  updateTemplate,
  type TemplateDraft,
} from '@/features/letters/api';
import { LETTER_LANGUAGES, LETTER_TEXT } from '@/features/letters/language';
import { toApiError } from '@/lib/errors';
import type { LetterLanguage, LetterTemplate } from '@/types/api';

const EMPTY: TemplateDraft = {
  name: '',
  description: '',
  defaultSubject: '',
  body: '',
  salutation: 'Sir/Madam,',
  language: 'EN',
  active: true,
};

/**
 * The letter templates, as administrators maintain them.
 *
 * <p>Everything here is a starting point rather than a rule — whoever writes a letter can change
 * any of it — so a template is safe to edit: it changes what the next letter starts from, and
 * nothing about the letters already written.
 */
export function LetterTemplatesPage() {
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<LetterTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<LetterTemplate | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const templates = useQuery({ queryKey: ['admin', 'letter-templates'], queryFn: fetchAllTemplates });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['letter'] });

  const remove = useMutation({
    mutationFn: (template: LetterTemplate) => deleteTemplate(template.id),
    onSuccess: (removed, template) => {
      setConfirming(null);
      setOutcome(
        removed
          ? `“${template.name}” has been removed.`
          : `“${template.name}” has letters written from it, so it has been retired instead — those letters still open.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'letter-templates'] });
      void refresh();
    },
  });

  const items = templates.data ?? [];
  const error = templates.error ?? remove.error;

  return (
    <AppShell
      title="Letter templates"
      subtitle="The standing wording a letter starts from. Everyone writes with these; only you change them."
      actions={<Button onClick={() => setCreating(true)}>New template</Button>}
    >
      {error && <Alert tone="error">{toApiError(error).message}</Alert>}
      {outcome && <Alert tone="info">{outcome}</Alert>}

      {templates.isPending ? (
        <SkeletonRows count={3} label="Loading templates" />
      ) : items.length === 0 ? (
        <section className="rounded-xl border border-line bg-surface p-8 text-center shadow-card">
          <h2 className="font-semibold text-slate-900">No templates yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Add the letters this office sends often. Anyone can still write from a blank letter in
            the meantime.
          </p>
          <Button className="mt-5" onClick={() => setCreating(true)}>
            Add the first template
          </Button>
        </section>
      ) : (
        <ul className="stagger space-y-3">
          {items.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-start gap-4 rounded-xl border border-line bg-surface
                p-5 shadow-card"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {template.name}
                  <span
                    lang={template.language === 'TA' ? 'ta' : 'en'}
                    className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-xs font-semibold
                      text-navy-700 ring-1 ring-inset ring-navy-500/15"
                  >
                    {LETTER_LANGUAGES.find((option) => option.code === template.language)?.label}
                  </span>
                  {!template.active && (
                    <span
                      className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold
                        text-slate-600 ring-1 ring-inset ring-slate-500/15"
                    >
                      Retired
                    </span>
                  )}
                </p>
                {template.description && (
                  <p className="mt-0.5 text-sm text-slate-500">{template.description}</p>
                )}
                {template.defaultSubject && (
                  <p className="mt-2 truncate text-xs text-slate-500">
                    Sub: {template.defaultSubject}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(template)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600! hover:bg-red-50!"
                  onClick={() => setConfirming(template)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <TemplateDialog
        open={creating || editing !== null}
        editing={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          setOutcome(null);
          void queryClient.invalidateQueries({ queryKey: ['admin', 'letter-templates'] });
          void refresh();
        }}
      />

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Delete this template?"
      >
        <p className="text-sm text-slate-600">
          Letters already written from “{confirming?.name}” are never affected. If there are any, the
          template is retired rather than removed — it disappears from the chooser and those letters
          still open.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setConfirming(null)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => confirming && remove.mutate(confirming)}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </AppShell>
  );
}

function TemplateDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: LetterTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit template' : 'New template'}
      description="Everything here is a starting point — whoever writes the letter can change any of it."
    >
      {/* Keyed so switching between templates, or from editing to adding, starts the form again
          rather than leaving the last one's wording in the boxes. */}
      <TemplateForm key={editing?.id ?? 'new'} editing={editing} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function TemplateForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: LetterTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<TemplateDraft>(
    editing
      ? {
          name: editing.name,
          description: editing.description ?? '',
          defaultSubject: editing.defaultSubject ?? '',
          body: editing.body ?? '',
          salutation: editing.salutation ?? '',
          language: editing.language,
          active: editing.active,
        }
      : EMPTY,
  );

  const save = useMutation({
    mutationFn: () => (editing ? updateTemplate(editing.id, draft) : createTemplate(draft)),
    onSuccess: onSaved,
  });

  const set = (field: keyof TemplateDraft) => (value: string | boolean) =>
    setDraft((current) => ({ ...current, [field]: value }));

  /**
   * Changing a template's language changes the letters written from it, so the salutation follows
   * along while it is still the stock one. A wording an admin typed themselves is left alone.
   */
  const setLanguage = (language: LetterLanguage) =>
    setDraft((current) => {
      const stock = Object.values(LETTER_TEXT).some(
        (candidate) => candidate.defaultSalutation === current.salutation.trim(),
      );
      return {
        ...current,
        language,
        salutation:
          current.salutation.trim() === '' || stock
            ? LETTER_TEXT[language].defaultSalutation
            : current.salutation,
      };
    });

  const fieldErrors = save.isError ? (toApiError(save.error).fieldErrors ?? {}) : {};

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-sm font-medium text-slate-700">Language</span>
        <div className="mt-2 flex gap-2" role="group" aria-label="Template language">
          {LETTER_LANGUAGES.map((option) => (
            <button
              key={option.code}
              type="button"
              aria-pressed={draft.language === option.code}
              onClick={() => setLanguage(option.code)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold outline-none
                transition-[background-color,color] duration-[--duration-quick]
                focus-visible:ring-2 focus-visible:ring-navy-300 ${
                  draft.language === option.code
                    ? 'bg-navy-600 text-white'
                    : 'bg-surface-sunken text-slate-600 hover:bg-navy-50'
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-sm text-slate-500">
          Which chooser it appears in. A letter written from it prints that language's headings.
        </p>
      </div>

      <TextField
        label="Name"
        value={draft.name}
        onChange={(event) => set('name')(event.target.value)}
        error={fieldErrors.name}
        placeholder="Meeting invitation"
        hint="What it is called in the chooser"
      />
      <TextField
        label="Description"
        value={draft.description}
        onChange={(event) => set('description')(event.target.value)}
        error={fieldErrors.description}
        placeholder="For convening a committee"
      />
      <TextField
        label="Default subject"
        value={draft.defaultSubject}
        onChange={(event) => set('defaultSubject')(event.target.value)}
        error={fieldErrors.defaultSubject}
        placeholder="Convening of Purchase Committee Meeting — Reg."
      />
      <TextField
        label="Salutation"
        value={draft.salutation}
        onChange={(event) => set('salutation')(event.target.value)}
        error={fieldErrors.salutation}
        placeholder="Sir/Madam,"
      />
      <TextAreaField
        label="Standing wording"
        rows={8}
        value={draft.body}
        onChange={(event) => set('body')(event.target.value)}
        error={fieldErrors.body}
        hint="The part that is the same every time. Blank lines separate paragraphs."
      />

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(event) => set('active')(event.target.checked)}
          className="h-4 w-4 rounded border-line-strong text-navy-600 focus:ring-navy-300"
        />
        Offer this template when writing a letter
      </label>

      {save.isError && <Alert tone="error">{toApiError(save.error).message}</Alert>}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={save.isPending}
          disabled={draft.name.trim().length === 0}
          onClick={() => save.mutate()}
        >
          {editing ? 'Save changes' : 'Add template'}
        </Button>
      </div>
    </div>
  );
}
