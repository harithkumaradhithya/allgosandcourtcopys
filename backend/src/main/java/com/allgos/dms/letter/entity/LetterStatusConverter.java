package com.allgos.dms.letter.entity;

import com.allgos.dms.common.entity.LowercaseEnumConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class LetterStatusConverter extends LowercaseEnumConverter<LetterStatus> {

    public LetterStatusConverter() {
        super(LetterStatus.class);
    }
}
