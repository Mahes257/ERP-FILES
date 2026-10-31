package com.vishatech.erp.repository;

import com.vishatech.erp.entity.Note;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoteRepository extends JpaRepository<Note, Long> {

    List<Note> findByLeadIdOrderByCreatedAtAsc(Long leadId);
}
