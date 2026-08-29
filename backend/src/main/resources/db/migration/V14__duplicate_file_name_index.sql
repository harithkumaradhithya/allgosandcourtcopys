-- Supports the second half of the duplicate check: the same file name filed twice.
--
-- Weaker evidence than a matching G.O. number, and deliberately kept as a separate index rather than
-- folded into that one, because it answers a different question: the G.O. number says two documents
-- are the same order, whereas the name only says two files were called the same thing. Both are
-- worth telling an administrator about; only the first is conclusive.
--
-- Normalised the way the query normalises -- lower case, runs of whitespace collapsed, trimmed --
-- so "GO 123  scan.pdf" and "go 123 scan.pdf" meet. An index on the raw column would go unused.
CREATE INDEX idx_files_name_normalised
    ON files (btrim(regexp_replace(lower(file_name), '\s+', ' ', 'g')))
    WHERE is_deleted = FALSE;
