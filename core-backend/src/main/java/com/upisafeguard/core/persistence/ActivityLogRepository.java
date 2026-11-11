package com.upisafeguard.core.persistence;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, UUID> {

    /** Paginated listing for GET /admin/activity-logs (action filter is optional). */
    Page<ActivityLog> findByAction(String action, Pageable pageable);

    /** Level-filtered listing for GET /admin/system/logs (port of the action-in sets). */
    Page<ActivityLog> findByActionIn(List<String> actions, Pageable pageable);

    /** Unfiltered listing for GET /admin/system/logs?level=info (info = everything). */
    Page<ActivityLog> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
