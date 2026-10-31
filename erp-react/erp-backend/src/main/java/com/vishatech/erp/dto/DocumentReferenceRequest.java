package com.vishatech.erp.dto;

/**
 * \"Inside ERP\" — file a document that already exists in the repository into a
 * repository context, referencing its stored file instead of uploading it again.
 *
 * @param module repository module (Sales context) the reference is filed under;
 *               blank falls back to the source document's own module
 */
public record DocumentReferenceRequest(String module) {}
