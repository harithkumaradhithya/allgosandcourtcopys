-- A third shape a letter can take: the Government Order.
--
-- A G.O. is issued only by the Secretariat, so it carries one thing neither a
-- letter nor a memo needs: which classification it was issued under (Ms, Rt,
-- Pt or 1D), printed in brackets before its number. Everything else about it
-- -- the department, the recipients, the abstract, the read references, the
-- order body, the signing officer -- reuses the blocks a letter already has,
-- so only one column is added.

ALTER TABLE letters
    DROP CONSTRAINT chk_letters_format;

ALTER TABLE letters
    ADD CONSTRAINT chk_letters_format CHECK (format IN ('letter', 'memo', 'go'));

ALTER TABLE letters
    ADD COLUMN go_type VARCHAR(8);

-- Meaningless outside a G.O., so left null there rather than given a default:
-- a letter or a memo simply carries no classification.
ALTER TABLE letters
    ADD CONSTRAINT chk_letters_go_type CHECK (go_type IS NULL OR go_type IN ('ms', 'rt', 'pt', 'one_d'));
