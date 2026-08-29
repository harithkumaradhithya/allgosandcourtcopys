package com.allgos.dms.common.config;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * The one background pool the application has, for work that must not be done while a user waits.
 *
 * <p>Reading a scanned government order — rendering page one and running Tesseract over it — takes
 * seconds on a machine this office is likely to run. It used to happen inside the upload request,
 * which meant the progress bar hit 100% and then sat there while the server read the document. The
 * bytes are already safely stored by then and the description is an enrichment, not part of what was
 * asked for, so it belongs here instead. See {@link
 * com.allgos.dms.file.service.DocumentEnrichmentService}.
 *
 * <h2>Why these numbers</h2>
 *
 * OCR is CPU-bound, so more threads than cores makes every extraction slower without finishing any
 * of them sooner; the pool is deliberately small. The queue is bounded rather than unlimited so a
 * bulk import cannot grow it until the process runs out of memory, and the rejection policy runs the
 * overflow on the calling thread — that thread is the upload request, so a flood degrades to today's
 * behaviour (a slower upload) instead of silently losing the description.
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean("documentEnrichment")
    public Executor documentEnrichmentExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(Math.max(2, Runtime.getRuntime().availableProcessors() / 2));
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("doc-enrich-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        // Give a shutdown a moment to finish what is in flight rather than leaving rows unenriched.
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
