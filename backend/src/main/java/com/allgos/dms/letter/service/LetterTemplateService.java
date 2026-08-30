package com.allgos.dms.letter.service;

import com.allgos.dms.audit.entity.AuditAction;
import com.allgos.dms.audit.service.AuditService;
import com.allgos.dms.common.exception.ApiException;
import com.allgos.dms.letter.dto.LetterRequests;
import com.allgos.dms.letter.dto.LetterResponses.TemplateView;
import com.allgos.dms.letter.entity.LetterLanguage;
import com.allgos.dms.letter.entity.LetterTemplate;
import com.allgos.dms.letter.repository.LetterRepository;
import com.allgos.dms.letter.repository.LetterTemplateRepository;
import com.allgos.dms.user.entity.User;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The templates a letter can start from.
 *
 * <p>Maintained by administrators, read by everybody. The same rule as departments and folders: a
 * template is the office's standing wording, and a shared thing anybody can edit is a shared thing
 * that drifts.
 */
@Service
public class LetterTemplateService {

    private final LetterTemplateRepository templateRepository;
    private final LetterRepository letterRepository;
    private final AuditService auditService;

    public LetterTemplateService(
            LetterTemplateRepository templateRepository,
            LetterRepository letterRepository,
            AuditService auditService) {
        this.templateRepository = templateRepository;
        this.letterRepository = letterRepository;
        this.auditService = auditService;
    }

    /** What a writer chooses from. Retired templates are not offered. */
    @Transactional(readOnly = true)
    public List<TemplateView> listActive() {
        return templateRepository.findByActiveTrueOrderByNameAsc().stream()
                .map(TemplateView::from)
                .toList();
    }

    /** The admin list, including retired ones so they can be brought back. */
    @Transactional(readOnly = true)
    public List<TemplateView> listAll() {
        return templateRepository.findAllByOrderByNameAsc().stream().map(TemplateView::from).toList();
    }

    @Transactional
    public TemplateView create(LetterRequests.SaveTemplate request, User admin) {
        String name = request.name().trim();
        templateRepository.findByNameIgnoreCase(name).ifPresent(existing -> {
            throw ApiException.conflict("TEMPLATE_NAME_TAKEN", "A template called \"%s\" already exists".formatted(name));
        });

        LetterTemplate template = new LetterTemplate();
        template.setCreatedBy(admin);
        apply(template, request, name);
        templateRepository.save(template);

        auditService.record(admin, AuditAction.LETTER_TEMPLATE_CREATED, "letter_template", template.getId(),
                Map.of("name", name));

        return TemplateView.from(template);
    }

    @Transactional
    public TemplateView update(UUID templateId, LetterRequests.SaveTemplate request, User admin) {
        LetterTemplate template = templateRepository
                .findById(templateId)
                .orElseThrow(() -> ApiException.notFound("Template"));

        String name = request.name().trim();
        templateRepository.findByNameIgnoreCase(name).ifPresent(existing -> {
            if (!existing.getId().equals(templateId)) {
                throw ApiException.conflict(
                        "TEMPLATE_NAME_TAKEN", "A template called \"%s\" already exists".formatted(name));
            }
        });

        apply(template, request, name);

        auditService.record(admin, AuditAction.LETTER_TEMPLATE_UPDATED, "letter_template", template.getId(),
                Map.of("name", name, "active", template.isActive()));

        return TemplateView.from(template);
    }

    /**
     * Removes a template that nothing has been written from; retires one that has.
     *
     * <p>Deleting a template somebody has used would either take their letters with it or leave them
     * pointing at nothing, and a letter is a record of something that was actually sent. Retiring
     * takes it out of the chooser, which is what "delete" is asking for in every case that matters.
     *
     * @return whether it was removed outright, so the screen can say which happened
     */
    @Transactional
    public boolean deleteOrRetire(UUID templateId, User admin) {
        LetterTemplate template = templateRepository
                .findById(templateId)
                .orElseThrow(() -> ApiException.notFound("Template"));

        boolean used = letterRepository.countByTemplateId(templateId) > 0;
        if (used) {
            template.setActive(false);
        } else {
            templateRepository.delete(template);
        }

        auditService.record(admin, AuditAction.LETTER_TEMPLATE_DELETED, "letter_template", templateId,
                Map.of("name", template.getName(), "outcome", used ? "retired" : "removed"));

        return !used;
    }

    private static void apply(LetterTemplate template, LetterRequests.SaveTemplate request, String name) {
        template.setName(name);
        template.setDescription(trimToNull(request.description()));
        template.setDefaultSubject(trimToNull(request.defaultSubject()));
        template.setBody(trimToNull(request.body()));
        template.setSalutation(trimToNull(request.salutation()));
        template.setLanguage(request.language() == null ? LetterLanguage.EN : request.language());
        template.setActive(request.active());
    }

    /** Empty and absent mean the same thing here, and storing "" would print as a blank line. */
    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
