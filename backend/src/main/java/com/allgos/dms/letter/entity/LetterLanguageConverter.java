package com.allgos.dms.letter.entity;

import com.allgos.dms.common.entity.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class LetterLanguageConverter extends LowercaseEnumConverter<LetterLanguage> {

    public LetterLanguageConverter() {
        super(LetterLanguage.class);
    }
}
