package com.vishatech.erp.cad;

/**
 * Result of a CAD -> GLB conversion attempt.
 */
public class CadConversionResult {

    /**
     * Absolute path to the generated GLB/glTF file, or null on failure.
     */
    private final String convertedFilePath;

    /**
     * Human-readable conversion error, or null on success.
     */
    private final String error;

    private CadConversionResult(String convertedFilePath, String error) {
        this.convertedFilePath = convertedFilePath;
        this.error = error;
    }

    public static CadConversionResult success(String convertedFilePath) {
        return new CadConversionResult(convertedFilePath, null);
    }

    public static CadConversionResult failed(String error) {
        return new CadConversionResult(null, error);
    }

    public boolean isSuccess() {
        return convertedFilePath != null;
    }

    public String getConvertedFilePath() {
        return convertedFilePath;
    }

    public String getError() {
        return error;
    }
}
