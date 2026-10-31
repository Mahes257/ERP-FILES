package com.vishatech.erp.util.production;

import com.vishatech.erp.entity.production.ProductionType;

import java.util.*;

/**
 * Defines the production stage workflows for each production type.
 * These match the frontend exactly.
 */
public class ProductionWorkflow {

    private static final Map<ProductionType, List<String>> WORKFLOWS = Map.of(
        ProductionType.CASTING, List.of(
            "Shell Preparation", "Melting", "Pouring", "Blasting", "Fettling"
        ),
        ProductionType.FABRICATION, List.of(
            "Raw Material", "Cutting", "Bending", "Welding", "Hard Facing",
            "Assembly", "QC", "Packing", "Dispatch"
        ),
        ProductionType.ASSEMBLY, List.of(
            "Assembly", "Quality", "Packing", "Dispatch"
        )
    );

    /**
     * Get the ordered stage list for a production type.
     */
    public static List<String> getStages(ProductionType type) {
        return WORKFLOWS.getOrDefault(type, List.of());
    }

    /**
     * Get the next stage after the current one.
     * Returns "Completed" if the current stage is the last.
     */
    public static String getNextStage(ProductionType type, String currentStage) {
        List<String> stages = getStages(type);
        int index = stages.indexOf(currentStage);
        if (index == -1) {
            return stages.isEmpty() ? "Completed" : stages.get(0);
        }
        if (index < stages.size() - 1) {
            return stages.get(index + 1);
        }
        return "Completed";
    }

    /**
     * Check if all stages are completed.
     */
    public static boolean areAllStagesCompleted(ProductionType type, Set<String> completedStages) {
        List<String> stages = getStages(type);
        return !stages.isEmpty() && completedStages.containsAll(stages);
    }

    /**
     * Calculate progress for a production type given completed stages.
     * Progress = (completed stages / total stages) * 100
     * This is the base progress — Acknowledgement and TV are counted separately.
     */
    public static int calculateStageProgress(ProductionType type, Set<String> completedStages) {
        List<String> stages = getStages(type);
        if (stages.isEmpty()) return 0;
        long completed = stages.stream().filter(completedStages::contains).count();
        return (int) Math.min(100, (completed * 100) / stages.size());
    }
}
