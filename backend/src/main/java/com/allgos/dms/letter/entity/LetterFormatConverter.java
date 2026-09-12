package com.allgos.dms.letter.entity;

import com.allgos.dms.common.entity.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class LetterFormatConverter extends LowercaseEnumConverter<LetterFormat> {

    public LetterFormatConverter() {
        super(LetterFormat.class);
    }
}
