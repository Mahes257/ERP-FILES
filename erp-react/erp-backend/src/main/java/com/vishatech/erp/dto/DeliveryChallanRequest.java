package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record DeliveryChallanRequest(
        String dcNo,
        String soRef,
        String dcDate,
        String scRef,
        String status,
        Long clientId,
        String clientName,
        String contactPerson,
        String email,
        String phone,
        String billingAddress,
        String shippingAddress,
        String city,
        String state,
        String transportCompany,
        String vehicleNumber,
        String driverName,
        String driverPhone,
        String lrNumber,
        String ewayBill,
        String dispatchDate,
        String deliveryDate,
        String notes,
        String terms,
        String taxType,
        String hsnView,
        BigDecimal discount,
        BigDecimal charges,
        List<DeliveryChallanItemRequest> items
) {
}
