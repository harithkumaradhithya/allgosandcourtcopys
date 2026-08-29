package com.allgos.dms.file.service;

import com.allgos.dms.department.entity.Department;
import com.allgos.dms.department.repository.DepartmentRepository;
import com.allgos.dms.file.dto.FileResponses.SuggestedDestination;
import com.allgos.dms.folder.entity.Folder;
import com.allgos.dms.folder.repository.FolderRepository;
import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Guesses where an unfiled document belongs, before anything is uploaded.
 *
 * <p>Read-only and best-effort: nothing here is validated the way {@link UploadValidator} validates
 * a real upload, and nothing here is stored. A caller who gets no suggestion, or one they disagree
 * with, still has the ordinary department and folder pickers to fall back on — this only ever saves
 * a few clicks, never gates the upload itself.
 *
 * <p>Every department carries a "General" folder (seeded by {@code V10__general_folder_per_department}),
 * so whenever a department is identified, a folder to go with it always exists too.
 */
@Service
public class DestinationSuggestionService {

    private static final Logger log = LoggerFactory.getLogger(DestinationSuggestionService.class);

    static final String GENERAL_FOLDER_NAME = "General";

    private final DepartmentRepository departmentRepository;
    private final FolderRepository folderRepository;
    private final DocumentAbstractExtractor extractor;
    private final DepartmentMatcher matcher;

    public DestinationSuggestionService(
            DepartmentRepository departmentRepository,
            FolderRepository folderRepository,
            DocumentAbstractExtractor extractor,
            DepartmentMatcher matcher) {
        this.departmentRepository = departmentRepository;
        this.folderRepository = folderRepository;
        this.extractor = extractor;
        this.matcher = matcher;
    }

    @Transactional(readOnly = true)
    public SuggestedDestination suggest(MultipartFile part) {
        if (part == null || part.isEmpty() || !looksLikePdf(part)) {
            return SuggestedDestination.NONE;
        }

        DocumentAbstractExtractor.Extraction extraction;
        try {
            extraction = extractor.extract(part.getBytes());
        } catch (IOException ex) {
            log.warn("Could not read {} to suggest a destination", part.getOriginalFilename(), ex);
            return SuggestedDestination.NONE;
        }
        String goNumber = extraction.goNumber();

        List<Department> departments = departmentRepository.findByActiveTrueOrderByNameAsc();
        Optional<Department> department = matcher.match(extraction.departmentHint(), departments);
        if (department.isEmpty()) {
            // No department guess, but the G.O. number can still stand on its own — see the class
            // Javadoc on SuggestedDestination.
            return new SuggestedDestination(null, null, null, null, goNumber);
        }

        Optional<Folder> general = folderRepository.findByDepartmentIdAndParentIsNullAndNameIgnoreCase(
                department.get().getId(), GENERAL_FOLDER_NAME);
        if (general.isEmpty()) {
            // Should not happen once V10 has run, but a missing General folder is a reason to fall
            // back to no department suggestion rather than to name one with nowhere to file into.
            log.warn("Department {} has no General folder", department.get().getName());
            return new SuggestedDestination(null, null, null, null, goNumber);
        }

        return new SuggestedDestination(
                department.get().getId(),
                department.get().getName(),
                general.get().getId(),
                general.get().getName(),
                goNumber);
    }

    /**
     * The declared content type is not trusted alone: a browser sends whatever the OS's MIME
     * database told it, and a Windows machine with no association registered for {@code .pdf} sends
     * an empty string or {@code application/octet-stream} for a document that is a perfectly good
     * PDF. This is a best-effort suggestion rather than the real upload, so the filename is an
     * acceptable fallback here — {@link UploadValidator} still applies its full, byte-sniffed check
     * when the file is actually uploaded.
     */
    private static boolean looksLikePdf(MultipartFile part) {
        if ("application/pdf".equals(part.getContentType())) {
            return true;
        }
        String name = part.getOriginalFilename();
        return name != null && name.toLowerCase(Locale.ROOT).endsWith(".pdf");
    }
}
