package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.ProductResponse;
import com.vishatech.erp.entity.Product;
import com.vishatech.erp.repository.ProductRepository;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/products")
@PreAuthorize("isAuthenticated()")
public class ProductController {

    private final ProductRepository productRepository;

    public ProductController(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ProductResponse>>> list(
            @RequestParam(required = false) String q) {
        List<Product> products = (q == null || q.isBlank())
                ? productRepository.findAll()
                : productRepository.search(q.trim().toLowerCase());
        List<ProductResponse> responses = products.stream().map(this::toResponse).toList();
        return ResponseEntity.ok(ApiResponse.ok(responses));
    }

    private ProductResponse toResponse(Product product) {
        return new ProductResponse(product.getId(), product.getName(), product.getSku(), product.getHsn(),
                product.getUnit(), product.getRate(), product.getGstRate(), product.getDescription());
    }
}
