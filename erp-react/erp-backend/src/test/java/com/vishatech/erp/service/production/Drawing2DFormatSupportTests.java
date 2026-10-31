package com.vishatech.erp.service.production;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.vishatech.erp.dto.production.DrawingDTO;
import com.vishatech.erp.repository.production.DrawingHistoryRepository;
import com.vishatech.erp.repository.production.DrawingRepository;
import jakarta.persistence.EntityManager;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Regression tests for the Production → Drawings 2D file-format contract
 * ({@code DrawingService#createDrawing} ← {@code POST /drawings}).
 *
 * <p>The Drawings module is the dedicated 2D section, so it must accept the
 * complete 2D engineering/document/vector/raster set — and only that set. These
 * tests pin both halves of that boundary:
 *
 * <ul>
 *   <li>every requested 2D extension is accepted and the bytes are actually
 *       written to the storage directory with the persisted {@code fileType};</li>
 *   <li>3D model formats ({@code .step}, {@code .sldprt}, {@code .stl}, …) and
 *       arbitrary/extension-less files are still rejected, so a drawing can
 *       never be silently routed through the 3D pipeline.</li>
 * </ul>
 *
 * <p>Accepting a format is deliberately <em>not</em> the same as previewing it:
 * capability (in-app preview vs. store + download only) is a frontend concern
 * expressed in {@code src/production/utils/drawingFormats.js}.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class Drawing2DFormatSupportTests {

    /** The exact 2D set required of the Drawings module. */
    private static final List<String> REQUIRED_2D_EXTENSIONS = List.of(
        // engineering CAD
        ".dwg", ".dxf", ".dgn",
        // document / vector
        ".pdf", ".svg",
        // plotter
        ".plt", ".hpgl", ".hpg",
        // vector / technical graphics
        ".cgm", ".eps", ".ai",
        // raster drawing / image
        ".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif");

    /** Formats owned by the 3D Models pipeline — must never reach Drawings. */
    private static final List<String> THREE_D_EXTENSIONS = List.of(
        ".sldprt", ".sldasm", ".step", ".stp", ".iges", ".igs", ".brep",
        ".stl", ".obj", ".glb", ".gltf", ".3mf", ".ply", ".fbx", ".dae", ".3ds");

    @Mock
    private DrawingRepository drawingRepository;

    @Mock
    private DrawingHistoryRepository historyRepository;

    @Mock
    private EntityManager entityManager;

    /** Publishing is a fire-and-forget side effect; a mock keeps these tests
     *  focused on the file-format contract. */
    @Mock
    private ProductionNotificationPublisher notificationPublisher;

    private DrawingService drawingService;

    @TempDir
    Path storageDir;

    @BeforeEach
    void setUp() {
        drawingService = new DrawingService(
            drawingRepository, historyRepository, entityManager, notificationPublisher);
        ReflectionTestUtils.setField(drawingService, "storagePath", storageDir.toString());
        when(drawingRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private static Stream<String> required2dExtensions() {
        return REQUIRED_2D_EXTENSIONS.stream();
    }

    private static Stream<String> threeDExtensions() {
        return THREE_D_EXTENSIONS.stream();
    }

    private DrawingDTO request() {
        return DrawingDTO.builder()
            .drawingNumber("PH-TEST")
            .workOrderId("WO-0001")
            .workOrderItemId("ITEM-1")
            .itemName("Test Item")
            .uploadedBy("tester")
            .createdBy("tester")
            .build();
    }

    private MockMultipartFile file(String filename, byte[] content) {
        return new MockMultipartFile("file", filename, "application/octet-stream", content);
    }

    private long storedFileCount() throws Exception {
        try (Stream<Path> files = Files.list(storageDir)) {
            return files.count();
        }
    }

    @ParameterizedTest(name = "accepts and stores {0}")
    @MethodSource("required2dExtensions")
    void acceptsEveryRequired2DFormat(String ext) throws Exception {
        byte[] bytes = ("2D drawing payload for " + ext).getBytes(StandardCharsets.UTF_8);
        MockMultipartFile upload = file("DRAWING" + ext.toUpperCase(), bytes);
        long before = storedFileCount();

        DrawingDTO saved = drawingService.createDrawing(request(), upload);

        assertThat(saved.getFileType()).isEqualTo(ext);
        assertThat(saved.getFileName()).isEqualTo("DRAWING" + ext.toUpperCase());
        assertThat(saved.getFileSize()).isEqualTo(bytes.length);
        assertThat(saved.getFilePath()).isNotBlank();
        assertThat(storedFileCount()).isEqualTo(before + 1);

        // The bytes on disk must be the bytes that were uploaded — the format is
        // stored honestly, never rewritten or renamed.
        byte[] onDisk = Files.readAllBytes(Path.of(saved.getFilePath()));
        assertThat(onDisk).isEqualTo(bytes);
    }

    @ParameterizedTest(name = "rejects 3D model format {0}")
    @MethodSource("threeDExtensions")
    void rejectsThreeDModelFormats(String ext) {
        MockMultipartFile upload = file("MODEL" + ext.toUpperCase(), "3d".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> drawingService.createDrawing(request(), upload))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Unsupported file type");
    }

    @ParameterizedTest(name = "rejects unknown extension {0}")
    @ValueSource(strings = {".exe", ".zip", ".docx", ".txt", ".js"})
    void rejectsUnknownFormats(String ext) {
        MockMultipartFile upload = file("thing" + ext, "x".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> drawingService.createDrawing(request(), upload))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Unsupported file type");
    }

    @Test
    void rejectsFileWithoutExtension() {
        MockMultipartFile upload = file("README", "x".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> drawingService.createDrawing(request(), upload))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Unsupported file type");
    }

    @Test
    void emptyUploadIsTreatedAsNoFile() throws Exception {
        // A drawing may be registered as metadata before its file arrives (the
        // controller also exposes a JSON create variant), so an empty upload is
        // ignored rather than stored as a zero-byte file.
        MockMultipartFile upload = file("drawing.pdf", new byte[0]);

        DrawingDTO saved = drawingService.createDrawing(request(), upload);

        assertThat(saved.getFilePath()).isNull();
        assertThat(saved.getFileName()).isNull();
        assertThat(storedFileCount()).isZero();
    }

    @Test
    void extensionMatchIsCaseInsensitive() throws Exception {
        MockMultipartFile upload = file("PLANT-LAYOUT.PDF", "pdf".getBytes(StandardCharsets.UTF_8));

        DrawingDTO saved = drawingService.createDrawing(request(), upload);

        // Persisted as the lower-cased canonical extension so the frontend router
        // (and the browser's MIME decision) is stable regardless of file naming.
        assertThat(saved.getFileType()).isEqualTo(".pdf");
    }

    @Test
    void requiresWorkOrderAndItem() {
        DrawingDTO missingWorkOrder = DrawingDTO.builder().workOrderItemId("ITEM-1").build();
        assertThatThrownBy(() -> drawingService.createDrawing(
                missingWorkOrder, file("a.pdf", "p".getBytes(StandardCharsets.UTF_8))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Work Order is required");

        DrawingDTO missingItem = DrawingDTO.builder().workOrderId("WO-0001").build();
        assertThatThrownBy(() -> drawingService.createDrawing(
                missingItem, file("a.pdf", "p".getBytes(StandardCharsets.UTF_8))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Item / Product is required");
    }

    @Test
    void newUploadsStartPendingAndUnverified() throws Exception {
        DrawingDTO saved = drawingService.createDrawing(
            request(), file("DRG.pdf", "p".getBytes(StandardCharsets.UTF_8)));

        assertThat(saved.getVerificationStatus()).isEqualTo("Pending");
        assertThat(saved.getVerifiedBy()).isNull();
    }
}
