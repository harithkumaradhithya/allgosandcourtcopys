-- Supports the duplicate check that runs after a document's G.O. number has been read out of it.
--
-- The comparison cannot be a plain equality on `go_number`: the same order scanned twice comes back
-- as "G.O.Ms.No.123" one time and "G.O. Ms. No. 123" the next, and to the office those are one
-- document filed twice. So both sides are stripped to letters and digits before they are compared,
-- and the index is built on that same expression -- an index on the raw column would not be used by
-- a query that normalises, and every upload would scan the table.
--
-- Partial, because a row with no G.O. number can never match: most of what is filed is a scan the
-- extractor could read nothing out of, and there is no reason to carry those in the index.
CREATE INDEX idx_files_go_number_normalised
    ON files (regexp_replace(lower(go_number), '[^a-z0-9]', '', 'g'))
    WHERE go_number IS NOT NULL AND is_deleted = FALSE;
