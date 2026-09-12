package com.allgos.dms.letter.entity;

import com.allgos.dms.common.entity.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class LetterGoTypeConverter extends LowercaseEnumConverter<LetterGoType> {

    public LetterGoTypeConverter() {
        super(LetterGoType.class);
    }
}
