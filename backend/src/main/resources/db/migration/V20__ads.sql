-- Advertisements: a strip of promotional media the office chooses to carry.
--
-- Everything about one is configurable — the media itself, what the card says, what the
-- popup says when it is clicked, when it runs and where it appears — because the whole
-- point is that nobody needs a developer to change an advert.
--
-- The columns fall into four groups: the media, the card, the popup, and the schedule.
-- They are one table rather than three because an advert is never useful in pieces: a
-- popup with no media to click, or media with nothing behind it, is a half-row somebody
-- finds months later wondering why it never appeared.

CREATE TABLE ads (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The admin's own name for it, shown in the management table and nowhere else. An
    -- advert is identified by who it is for ("Tahsildar training — March"), not by its
    -- headline, which changes.
    title              VARCHAR(160) NOT NULL,

    -- Where it runs. Deliberately a short, closed list: every value here is a slot that
    -- exists in the interface, and an advert with nowhere to go is an advert nobody sees.
    -- Nothing in this list is a screen where somebody is working — the letter editor and
    -- the document preview are absent on purpose.
    placement          VARCHAR(24)  NOT NULL
                           CHECK (placement IN ('home', 'departments', 'sidebar')),

    -- ---------------------------------------------------------------- the media

    -- Derived from the bytes at upload rather than chosen, so it cannot disagree with what
    -- the browser is then asked to render. A GIF is an image to the markup but its own kind
    -- here, because it moves and the motion rules treat it accordingly.
    media_kind         VARCHAR(16)  NOT NULL
                           CHECK (media_kind IN ('image', 'gif', 'video')),
    media_key          VARCHAR(512) NOT NULL,
    media_content_type VARCHAR(128) NOT NULL,
    media_file_name    VARCHAR(255) NOT NULL,
    media_size_bytes   BIGINT       NOT NULL,

    -- Required, not optional. An advert is the one thing on the page with no surrounding
    -- text to explain it, so a screen reader that cannot describe it announces nothing at
    -- all — and the slot becomes a blank space that swallows a click.
    alt_text           VARCHAR(255) NOT NULL,

    -- ----------------------------------------------------------------- the card

    -- Both optional: some adverts are the picture and nothing else.
    headline           VARCHAR(160),
    caption            VARCHAR(320),

    -- ---------------------------------------------------------------- the popup
    --
    -- What opens when the advert is clicked. The title is required because a dialog with
    -- no heading cannot be labelled for a screen reader; the body is the long copy, kept
    -- as written with its line breaks.

    detail_title       VARCHAR(160) NOT NULL,
    detail_body        TEXT         NOT NULL,

    -- An optional button at the foot of the popup. Both or neither — a labelled button
    -- that goes nowhere and a bare URL are each worse than no button.
    cta_label          VARCHAR(60),
    cta_url            VARCHAR(2048),

    -- ------------------------------------------------------------- how it behaves

    -- Video only, and muted regardless: sound that starts on its own is the single most
    -- disliked thing an advert can do, so there is no column that could turn it on.
    autoplay           BOOLEAN      NOT NULL DEFAULT TRUE,
    loop_media         BOOLEAN      NOT NULL DEFAULT TRUE,

    -- Whether the reader may put it away. On by default; an advert nobody can dismiss is
    -- the one they stop looking at the region for entirely.
    dismissible        BOOLEAN      NOT NULL DEFAULT TRUE,

    -- ------------------------------------------------------------- the schedule

    active             BOOLEAN      NOT NULL DEFAULT TRUE,
    starts_at          TIMESTAMPTZ,
    ends_at            TIMESTAMPTZ,

    -- Lowest first, within a placement.
    display_order      INTEGER      NOT NULL DEFAULT 0,

    -- Counted rather than logged. An events table would be the honest answer to "which
    -- afternoon did it do well", but nobody has asked that question and a row per view
    -- across a hundred users every day is a table that only ever grows.
    view_count         BIGINT       NOT NULL DEFAULT 0,
    click_count        BIGINT       NOT NULL DEFAULT 0,

    created_by         UUID         REFERENCES users (id),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ads_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
    CONSTRAINT ads_cta_pair CHECK (
        (cta_label IS NULL AND cta_url IS NULL) OR (cta_label IS NOT NULL AND cta_url IS NOT NULL)
    )
);

-- The one query the reading side makes, in the order it renders.
CREATE INDEX idx_ads_slot ON ads (placement, active, display_order, created_at);
