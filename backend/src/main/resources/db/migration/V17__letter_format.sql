-- A second shape a letter can take: the memo.
--
-- Every letter so far has been the office's own correspondence shape -- a
-- salutation, addressed to a recipient. A memo ("குறிப்பாணை") is shorter and
-- written in the third person, issued by a senior officer to a subordinate
-- office or about somebody's petition. It reuses the same blocks a letter
-- already has (the office, the recipient, the subject, the reference, the
-- body, the signing officer) -- only how they print differs -- so no new
-- columns are needed beyond which shape a letter is in.

ALTER TABLE letters
    ADD COLUMN format VARCHAR(16) NOT NULL DEFAULT 'letter';

ALTER TABLE letters
    ADD CONSTRAINT chk_letters_format CHECK (format IN ('letter', 'memo'));
