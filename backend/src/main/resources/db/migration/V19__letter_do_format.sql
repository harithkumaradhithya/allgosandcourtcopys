-- A fourth shape a letter can take: the Demi-Official letter ("நேர்முகக் கடிதம்" / D.O.).
--
-- Personal-cum-official correspondence between officers, written in the first
-- person and signed "Yours sincerely" rather than issued. It reuses the
-- office/recipient/subject/reference/body/signing-officer blocks a letter
-- already has, but its header splits into two blocks side by side -- the
-- writer's name and designation on one side, the office's own name, place,
-- phone and e-mail on the other -- so one column is added for the second of
-- those. A table of figures dropped into any letter's body is free-form
-- (JSON rows) and not specific to the D.O. shape, so it is added here as a
-- second column rather than a second migration.

ALTER TABLE letters
    DROP CONSTRAINT chk_letters_format;

ALTER TABLE letters
    ADD CONSTRAINT chk_letters_format CHECK (format IN ('letter', 'memo', 'go', 'do'));

-- Meaningless outside a D.O., so left null there rather than given a default.
ALTER TABLE letters
    ADD COLUMN office_block TEXT;

-- A small table (rows of cells, JSON-encoded) a writer has dropped into the
-- body -- a schedule of figures, a list of pending items. Null when the
-- letter carries no table, on any format.
ALTER TABLE letters
    ADD COLUMN table_data TEXT;
