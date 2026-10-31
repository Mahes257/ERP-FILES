package com.vishatech.erp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import com.vishatech.erp.crm.entity.Contact;
import com.vishatech.erp.crm.entity.Lead;

/**
 * CRM Contacts API verification — the module has to reflect real persisted data:
 *
 *   * a lead's primary and secondary person are mirrored as two distinct contact
 *     rows (never merged, never fabricated);
 *   * re-saving a lead updates those rows instead of duplicating them;
 *   * converting a lead to a client links the SAME rows to the client, so one
 *     person ends up with both references and conversion never duplicates;
 *   * the list is paged/filtered server-side and requires authentication;
 *   * invalid required fields, missing associations and unauthorized destructive
 *     operations are rejected.
 *
 * Assertions are scoped to the lead/contact ids this test creates (the shared H2
 * schema is reused by the rest of the security suite, so global counts are not
 * meaningful here).
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class ContactsApiTest extends AbstractSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String register(String prefix) throws Exception {
        String email = prefix + "-" + UUID.randomUUID() + "@example.com";
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", "Contacts User",
                                "email", email,
                                "password", "password123"))))
                .andReturn();
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("token").asText();
    }

    private String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    /** Creates a lead through the real Lead API and returns its id. */
    private long createLead(String token, Map<String, Object> payload) throws Exception {
        MvcResult created = mockMvc.perform(post("/leads")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
    }

    private JsonNode contactsOfLead(String token, long leadId) throws Exception {
        MvcResult result = mockMvc.perform(get("/contacts/lead/" + leadId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
    }

    @Test
    void contactEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/contacts")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/contacts/1")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/contacts/stats")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/contacts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Nobody\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void creatingALeadPersistsItsPrimaryAndSecondaryContacts() throws Exception {
        String token = register("contacts-capture");
        String business = unique("Capture Industries");
        String primary = unique("Asha");
        String secondary = unique("Ravi");

        Map<String, Object> payload = new HashMap<>();
        payload.put("leadName", primary);
        payload.put("designation", "Purchase Head");
        payload.put("phone", "+91 98100 11111");
        payload.put("email", "asha@example.com");
        payload.put("companyName", business);
        payload.put("secondaryName", secondary);
        payload.put("secondaryPhone", "+91 98100 22222");
        payload.put("secondaryEmail", "ravi@example.com");
        long leadId = createLead(token, payload);

        JsonNode rows = contactsOfLead(token, leadId);
        assertThat(rows.isArray()).isTrue();
        assertThat(rows.size()).isEqualTo(2);

        JsonNode primaryRow = rows.get(0);
        assertThat(primaryRow.path("contactType").asText()).isEqualTo("Primary");
        assertThat(primaryRow.path("name").asText()).isEqualTo(primary);
        assertThat(primaryRow.path("designation").asText()).isEqualTo("Purchase Head");
        assertThat(primaryRow.path("phone").asText()).isEqualTo("+91 98100 11111");
        assertThat(primaryRow.path("email").asText()).isEqualTo("asha@example.com");
        assertThat(primaryRow.path("businessName").asText()).isEqualTo(business);
        assertThat(primaryRow.path("leadId").asLong()).isEqualTo(leadId);
        // A lead is not a client: the contact starts lead-only.
        assertThat(primaryRow.path("clientId").isNull()).isTrue();
        assertThat(primaryRow.path("status").asText()).isEqualTo("Active");
        assertThat(primaryRow.path("source").asText()).isEqualTo("Lead");

        JsonNode secondaryRow = rows.get(1);
        assertThat(secondaryRow.path("contactType").asText()).isEqualTo("Secondary");
        assertThat(secondaryRow.path("name").asText()).isEqualTo(secondary);
        assertThat(secondaryRow.path("phone").asText()).isEqualTo("+91 98100 22222");
        assertThat(secondaryRow.path("email").asText()).isEqualTo("ravi@example.com");
        assertThat(secondaryRow.path("leadId").asLong()).isEqualTo(leadId);
        assertThat(secondaryRow.path("clientId").isNull()).isTrue();

        // A lead that carries no secondary person produces no third, fabricated row.
        long leadOnlyId = createLead(token, Map.of(
                "leadName", unique("Solo Contact"),
                "companyName", unique("Solo Co")));
        assertThat(contactsOfLead(token, leadOnlyId).size()).isEqualTo(1);

        // The captured contacts are reachable through the real paged list too.
        mockMvc.perform(get("/contacts")
                        .param("leadId", String.valueOf(leadId))
                        .param("size", "10")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].leadId").value((int) leadId));
    }

    @Test
    void savingALeadTwiceUpdatesItsContactsWithoutDuplicatingThem() throws Exception {
        String token = register("contacts-edit");
        String business = unique("Edit Traders");
        String primary = unique("Meena");

        Map<String, Object> createPayload = new HashMap<>();
        createPayload.put("leadName", primary);
        createPayload.put("phone", "+91 90000 00001");
        createPayload.put("companyName", business);
        createPayload.put("secondaryName", unique("Secondary Person"));
        createPayload.put("secondaryPhone", "+91 90000 00002");
        long leadId = createLead(token, createPayload);

        JsonNode before = contactsOfLead(token, leadId);
        assertThat(before.size()).isEqualTo(2);
        long primaryContactId = before.get(0).path("id").asLong();
        long secondaryContactId = before.get(1).path("id").asLong();

        Map<String, Object> updatePayload = new HashMap<>();
        updatePayload.put("leadName", primary);
        updatePayload.put("phone", "+91 90000 09999");
        updatePayload.put("designation", "Managing Director");
        updatePayload.put("companyName", business);
        // The secondary person is edited as well.
        updatePayload.put("secondaryName", "Second Person Renamed");
        updatePayload.put("secondaryPhone", "+91 90000 08888");
        mockMvc.perform(put("/leads/" + leadId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updatePayload)))
                .andExpect(status().isOk());

        JsonNode after = contactsOfLead(token, leadId);
        assertThat(after.size()).isEqualTo(2);
        // Same rows, updated in place — no duplicate was appended.
        assertThat(after.get(0).path("id").asLong()).isEqualTo(primaryContactId);
        assertThat(after.get(1).path("id").asLong()).isEqualTo(secondaryContactId);
        assertThat(after.get(0).path("phone").asText()).isEqualTo("+91 90000 09999");
        assertThat(after.get(0).path("designation").asText()).isEqualTo("Managing Director");
        assertThat(after.get(1).path("name").asText()).isEqualTo("Second Person Renamed");
        assertThat(after.get(1).path("phone").asText()).isEqualTo("+91 90000 08888");

        // Idempotent backfill: re-running it changes no row and adds none.
        mockMvc.perform(post("/contacts/backfill")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        assertThat(contactsOfLead(token, leadId).size()).isEqualTo(2);
    }

    @Test
    void convertingALeadLinksTheSameContactsToTheClient() throws Exception {
        String token = register("contacts-convert");
        String business = unique("Convert Metals");
        String primary = unique("Kiran");

        Map<String, Object> payload = new HashMap<>();
        payload.put("leadName", primary);
        payload.put("phone", "+91 91000 12345");
        payload.put("email", "kiran@example.com");
        payload.put("companyName", business);
        payload.put("secondaryName", unique("Second Buyer"));
        payload.put("secondaryPhone", "+91 92000 54321");
        long leadId = createLead(token, payload);

        JsonNode beforeConversion = contactsOfLead(token, leadId);
        assertThat(beforeConversion.size()).isEqualTo(2);
        long primaryContactId = beforeConversion.get(0).path("id").asLong();
        long secondaryContactId = beforeConversion.get(1).path("id").asLong();

        // The existing "convert to client" flow: the client carries the lead id.
        MvcResult created = mockMvc.perform(post("/customers")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "businessName", business,
                                "leadId", leadId))))
                .andExpect(status().isCreated())
                .andReturn();
        long clientId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();
        String clientCode = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("clientCode").asText();
        assertThat(clientCode).isNotBlank();

        JsonNode afterConversion = contactsOfLead(token, leadId);
        // Conversion preserves the contact rows: same ids, same count.
        assertThat(afterConversion.size()).isEqualTo(2);
        assertThat(afterConversion.get(0).path("id").asLong()).isEqualTo(primaryContactId);
        assertThat(afterConversion.get(1).path("id").asLong()).isEqualTo(secondaryContactId);
        for (JsonNode row : afterConversion) {
            assertThat(row.path("clientId").asLong()).isEqualTo(clientId);
            assertThat(row.path("clientCode").asText()).isEqualTo(clientCode);
            // Both references are kept: the person came from a lead and is now
            // also a contact of the client it converted into.
            assertThat(row.path("leadId").asLong()).isEqualTo(leadId);
        }
        assertThat(afterConversion.get(0).path("clientName").asText()).isEqualTo(business);

        // The client filter finds exactly those two contacts.
        mockMvc.perform(get("/contacts")
                        .param("clientId", String.valueOf(clientId))
                        .param("size", "10")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void contactListSupportsSearchFiltersSortingAndPaging() throws Exception {
        String token = register("contacts-list");
        String business = unique("Searchable Systems");
        String person = unique("Nithya");
        String phone = "+91 93333 12121";

        long contactId = objectMapper.readTree(mockMvc.perform(post("/contacts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", person,
                                "businessName", business,
                                "phone", phone,
                                "email", "nithya@example.com",
                                "contactType", "Secondary",
                                "designation", "Finance Head"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse().getContentAsString()).path("data").path("id").asLong();

        // Search by name.
        mockMvc.perform(get("/contacts").param("search", person)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].name").value(person));
        // Search by phone.
        mockMvc.perform(get("/contacts").param("search", "93333")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(1));
        // Search by email.
        mockMvc.perform(get("/contacts").param("search", "nithya@example.com")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(1));
        // Search by business name.
        mockMvc.perform(get("/contacts").param("search", business)
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(1));

        // Filters: type, association and status all run on the server.
        mockMvc.perform(get("/contacts")
                        .param("search", person)
                        .param("contactType", "Secondary")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(1));
        mockMvc.perform(get("/contacts")
                        .param("search", person)
                        .param("contactType", "Primary")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/contacts")
                        .param("search", person)
                        .param("association", "standalone")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(1));
        mockMvc.perform(get("/contacts")
                        .param("search", person)
                        .param("association", "client")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/contacts")
                        .param("leadId", "999999999")
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(0));

        // Sorting + paging with the real count.
        MvcResult paged = mockMvc.perform(get("/contacts")
                        .param("search", person)
                        .param("sort", "name,asc")
                        .param("page", "0")
                        .param("size", "1")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.number").value(0))
                .andExpect(jsonPath("$.size").value(1))
                .andReturn();
        JsonNode page = objectMapper.readTree(paged.getResponse().getContentAsString());
        assertThat(page.path("totalElements").asLong()).isEqualTo(1);
        assertThat(page.path("totalPages").asLong()).isEqualTo(1);

        // A single contact reads back with its real fields.
        mockMvc.perform(get("/contacts/" + contactId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.designation").value("Finance Head"))
                .andExpect(jsonPath("$.data.email").value("nithya@example.com"));
    }

    @Test
    void contactWritesValidateAssociationsAndProtectRelatedRecords() throws Exception {
        String token = register("contacts-crud");
        String business = unique("Protected Sales");
        String person = unique("Vikram");

        long leadId = createLead(token, Map.of(
                "leadName", unique("Lead Owner Person"),
                "companyName", business));

        // Required field missing.
        mockMvc.perform(post("/contacts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"+91 90000 00000\"}"))
                .andExpect(status().isBadRequest());
        // Invalid email format.
        mockMvc.perform(post("/contacts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Bad Email\",\"email\":\"not-an-email\"}"))
                .andExpect(status().isBadRequest());
        // Unknown associations are rejected instead of creating a dangling link.
        mockMvc.perform(post("/contacts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", person, "leadId", 999999999))))
                .andExpect(status().isNotFound());
        mockMvc.perform(post("/contacts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", person, "clientId", 999999998))))
                .andExpect(status().isNotFound());
        // Invalid enums are rejected.
        mockMvc.perform(post("/contacts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", person, "contactType", "Tertiary"))))
                .andExpect(status().isBadRequest());
        // A lead owns one person per role: creating a second primary collides.
        mockMvc.perform(post("/contacts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", person, "contactType", "Primary", "leadId", leadId))))
                .andExpect(status().isConflict());

        // A standalone contact can be created (business permits a contact with no
        // lead/client), updated, archived, restored and trashed.
        MvcResult created = mockMvc.perform(post("/contacts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", person,
                                "designation", "Director",
                                "phone", "+91 95555 55555",
                                "email", "vikram@example.com",
                                "businessName", business))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.source").value("Manual"))
                .andReturn();
        long contactId = objectMapper.readTree(created.getResponse().getContentAsString())
                .path("data").path("id").asLong();

        mockMvc.perform(put("/contacts/" + contactId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", person,
                                "designation", "Managing Director",
                                "phone", "+91 95555 44444"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.designation").value("Managing Director"))
                .andExpect(jsonPath("$.data.phone").value("+91 95555 44444"));

        for (String action : new String[]{"archive", "restore"}) {
            mockMvc.perform(patch("/contacts/" + action + "/" + contactId)
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(patch("/contacts/" + contactId + "/status")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"Inactive\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Inactive"));
        mockMvc.perform(patch("/contacts/" + contactId + "/status")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"Deleted\"}"))
                .andExpect(status().isOk());
        // Trashed contacts leave the default list but are still readable.
        mockMvc.perform(get("/contacts").param("search", person)
                        .header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.totalElements").value(0));
        mockMvc.perform(get("/contacts/" + contactId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("Deleted"));
        // Nonexistent records are reported, not silently accepted.
        mockMvc.perform(get("/contacts/999999999")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
        mockMvc.perform(put("/contacts/999999999")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ghost\"}"))
                .andExpect(status().isNotFound());

        // Destructive operations need CRM_DELETE, which a plain USER role does not hold.
        mockMvc.perform(delete("/contacts/" + contactId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/contacts/bulk-delete")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[" + contactId + "]}"))
                .andExpect(status().isForbidden());

        // Deleting the contact never touched the lead it referenced.
        mockMvc.perform(get("/leads/" + leadId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }
}
