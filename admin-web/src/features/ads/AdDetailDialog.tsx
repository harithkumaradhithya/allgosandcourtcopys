import { Modal } from '@/components/ui/Modal';
import { AdMedia } from '@/features/ads/AdMedia';
import type { Ad } from '@/types/api';

/**
 * What an advert says when somebody asks.
 *
 * <p>This is the whole shape of the feature: the thing on the page is small, quiet and says almost
 * nothing, and everything the advertiser wants to say lives one deliberate click away. Nothing here
 * opens on its own, on a timer, on scroll, or on the way out — there is no code path that opens this
 * dialog except a press on the advert.
 *
 * <p>It reuses the application's own {@link Modal}, so it escapes, traps focus, returns focus on
 * close and locks the page behind exactly like the dialog that deletes a document. An advert that
 * invented its own overlay would be the one modal in the application a keyboard user could not get
 * out of.
 *
 * <p>The copy is rendered as text, not as markup. An administrator types a paragraph into a form;
 * letting that paragraph carry HTML would make every advert an injection into every reader's
 * session, and the blank lines they actually use are handled by splitting on them instead.
 */
export function AdDetailDialog({
  ad,
  open,
  onClose,
}: {
  ad: Ad;
  open: boolean;
  onClose: () => void;
}) {
  const paragraphs = ad.detailBody.split(/\n{2,}/).filter((block) => block.trim().length > 0);

  return (
    <Modal open={open} title={ad.detailTitle} size="lg" onClose={onClose}>
      {/* Fixed ratio, so the dialog is the size it will be before the media has loaded — a popup
          that grows under the cursor is one people close by accident. */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface-sunken">
        <div className="aspect-video">
          <AdMedia ad={ad} variant="detail" />
        </div>
      </div>

      <div className="space-y-3">
        {paragraphs.map((block, index) => (
          <p
            // A paragraph has no identity beyond its position and nothing here reorders, so the
            // index is the honest key.
            key={index}
            // `whitespace-pre-line` keeps the single line breaks inside a block — an address or a
            // list of dates is typed one per line and reads as nonsense run together.
            className="text-sm leading-relaxed whitespace-pre-line text-slate-600"
          >
            {block}
          </p>
        ))}
      </div>

      {ad.ctaLabel && ad.ctaUrl && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <a
            href={ad.ctaUrl}
            // A new tab, because the reader is in the middle of something in this one. `noopener`
            // is what stops the opened page reaching back through `window.opener`, and `noreferrer`
            // keeps this office's internal URL out of a third party's logs.
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-2 rounded-lg fill-brand px-4 py-2.5 text-sm
              font-semibold text-on-brand outline-none transition-all duration-[--duration-quick]
              ease-[--ease-settle] hover:-translate-y-px focus-visible:ring-2
              focus-visible:ring-navy-300 active:scale-[0.97]"
          >
            {ad.ctaLabel}
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M14 5h5v5M19 5l-8 8M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
            </svg>
          </a>
          {/* Said plainly rather than left to be discovered. The reader is one click from leaving a
              government records system for somebody else's website, and should know that first. */}
          <p className="text-xs text-slate-500">Opens an external website in a new tab.</p>
        </div>
      )}
    </Modal>
  );
}
