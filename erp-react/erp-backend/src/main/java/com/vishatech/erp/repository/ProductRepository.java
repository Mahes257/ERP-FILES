package com.vishatech.erp.repository;

import com.vishatech.erp.entity.Product;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, Long> {

    @Query("SELECT p FROM Product p WHERE LOWER(p.name) LIKE %:q% OR LOWER(p.sku) LIKE %:q% OR LOWER(p.hsn) LIKE %:q%")
    List<Product> search(@Param("q") String query);
}
