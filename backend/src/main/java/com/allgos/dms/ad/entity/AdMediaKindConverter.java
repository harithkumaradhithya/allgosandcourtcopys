package com.allgos.dms.ad.entity;

import com.allgos.dms.common.entity.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class AdMediaKindConverter extends LowercaseEnumConverter<AdMediaKind> {

    public AdMediaKindConverter() {
        super(AdMediaKind.class);
    }
}
