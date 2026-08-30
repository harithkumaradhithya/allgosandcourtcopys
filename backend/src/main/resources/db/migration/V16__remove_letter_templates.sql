-- Letter templates, removed.
--
-- The idea was that an office writes the same few letters over and over, so the
-- standing wording should be maintained once by an administrator and started
-- from by everybody. In practice the letters here differ enough that a template
-- saved nobody any typing, and it was one more screen for an administrator to
-- keep -- so the feature goes rather than being left half-used.
--
-- Nothing is lost from a letter. Every block was always stored as written: a
-- template only decided what a new letter *opened* with, and the letters written
-- from one keep every word of it. The only thing that goes is the record of
-- which template a letter happened to start from, which nothing read.

ALTER TABLE letters DROP COLUMN template_id;

DROP TABLE letter_templates;
