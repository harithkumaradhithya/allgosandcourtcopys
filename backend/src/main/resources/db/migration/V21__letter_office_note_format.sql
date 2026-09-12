-- A fifth shape a letter can take: the Office Note ("அலுவலகக் குறிப்பு").
--
-- Internal file noting rather than correspondence -- there is no sender or
-- recipient, so it needs no new column: the file number, subject, reference,
-- body, from and to blocks it stores are the same ones every other format
-- already has (the from/to blocks are simply never shown or printed for this
-- shape, and are filled with a placeholder so the columns' NOT NULL stays
-- satisfied). Only the set of formats a letter may be saved as changes.

ALTER TABLE letters
    DROP CONSTRAINT chk_letters_format;

ALTER TABLE letters
    ADD CONSTRAINT chk_letters_format CHECK (format IN ('letter', 'memo', 'go', 'do', 'office_note'));
