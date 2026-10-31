package com.vishatech.erp.dto.production;

import lombok.*;

import java.util.List;

/**
 * Paginated response wrapper for list endpoints.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PagedResponse<T> {
    private List<T> content;
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;
    private boolean first;
    private boolean last;
}
