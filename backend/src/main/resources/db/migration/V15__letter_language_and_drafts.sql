-- Letters in two languages, and letters that are not finished yet.
--
-- Two changes that belong together because both are about what a letter *is*
-- rather than what it says. A Tamil letter is not an English one with Tamil
-- typed into it: its headings, its Sub: and Ref: labels and its salutation are
-- Tamil too, so the language has to travel with the letter and be there when it
-- is reprinted years later. And a letter being written is worth keeping before
-- it is finished -- a browser closed, a network dropped or a server restarted
-- in the middle of drafting should cost nothing.

ALTER TABLE letter_templates
    ADD COLUMN language VARCHAR(8) NOT NULL DEFAULT 'en';

ALTER TABLE letters
    ADD COLUMN language VARCHAR(8) NOT NULL DEFAULT 'en',
    -- 'draft' until the author says it is done. A draft is exempt from the
    -- required blocks a finished letter must have -- half a letter is exactly
    -- what a draft is for -- so the distinction lives here rather than being
    -- inferred from which fields happen to be empty.
    ADD COLUMN status   VARCHAR(16) NOT NULL DEFAULT 'final';

ALTER TABLE letters
    ADD CONSTRAINT chk_letters_status CHECK (status IN ('draft', 'final'));

-- Everything written before this migration was a finished letter: drafts did
-- not exist, so nothing here can be one. The DEFAULT above has already said so
-- for the existing rows; the constraint is what keeps it true.

-- Both listings a person gets -- their drafts and their letters -- are the same
-- query with a different status, newest touched first for drafts because a
-- draft is something you come back to.
CREATE INDEX idx_letters_author_status ON letters (author_id, status, updated_at DESC);

-- The blocks a finished letter must have stay NOT NULL. A draft that has none
-- of them yet stores them empty rather than null: "not written yet" and "no
-- such column" are different things, and only the first one is true here.
