package com.allgos.dms.ad.entity;

import com.allgos.dms.common.entity.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class AdPlacementConverter extends LowercaseEnumConverter<AdPlacement> {

    public AdPlacementConverter() {
        super(AdPlacement.class);
    }
}
