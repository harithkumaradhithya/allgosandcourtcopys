package com.allgos.dms.ad.dto;

import com.allgos.dms.ad.entity.AdPlacement;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;

/** Request bodies for maintaining the adverts. */
public final class AdRequests {

    /**
     * Only {@code http} and {@code https}, and only when something is there at all.
     *
     * <p>This is the one field of an advert that becomes a live link in somebody else's browser, so
     * the scheme is checked rather than assumed. {@code javascript:} in an href runs in the reader's
     * session; the client also refuses to render anything else, but the rule belongs on the way in,
     * where it applies to whoever is calling.
     */
    private static final String URL_PATTERN = "^$|^https?://[^\\s]{3,2040}$";

    private static final String URL_MESSAGE = "Enter a full web address beginning http:// or https://";

    /**
     * One advert, without its media.
     *
     * <p>Sent as the JSON part of a multipart request; the file travels beside it. Creating requires
     * the file, editing does not — an advert whose wording is being corrected should not have to be
     * re-uploaded — so that pairing is checked in the service rather than here.
     */
    public record SaveAd(
            @NotBlank(message = "Give the advert a name so you can find it again")
            @Size(max = 160)
            String title,

            @NotNull(message = "Choose where this advert should appear")
            AdPlacement placement,

            @NotBlank(message = "Describe the media for anyone who cannot see it")
            @Size(max = 255)
            String altText,

            @Size(max = 160)
            String headline,

            @Size(max = 320)
            String caption,

            @NotBlank(message = "The popup needs a heading")
            @Size(max = 160)
            String detailTitle,

            @NotBlank(message = "The popup needs something to say")
            @Size(max = 8000)
            String detailBody,

            @Size(max = 60)
            String ctaLabel,

            @Pattern(regexp = URL_PATTERN, message = URL_MESSAGE)
            @Size(max = 2048)
            String ctaUrl,

            boolean autoplay,
            boolean loopMedia,
            boolean dismissible,
            boolean active,

            /** Both optional. Null start means "from now"; null end means "until switched off". */
            Instant startsAt,
            Instant endsAt,

            int displayOrder) {}

    private AdRequests() {}
}
