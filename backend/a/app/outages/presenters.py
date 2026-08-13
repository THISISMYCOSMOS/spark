from ..models import ImpactCase, OutageEvent


def outage_view(outage: OutageEvent) -> dict:
    return {
        "id": outage.id,
        "title": outage.title,
        "outageType": outage.outage_type.value,
        "mode": outage.mode.value,
        "status": outage.status.value,
        "regionCodes": outage.region_codes,
        "scheduledStartAt": outage.scheduled_start_at.isoformat() if outage.scheduled_start_at else None,
        "expectedEndAt": outage.expected_end_at.isoformat() if outage.expected_end_at else None,
        "startedAt": outage.started_at.isoformat() if outage.started_at else None,
        "cancelledAt": outage.cancelled_at.isoformat() if outage.cancelled_at else None,
        "recoveryReportedAt": outage.recovery_reported_at.isoformat() if outage.recovery_reported_at else None,
        "recoverySource": outage.recovery_source,
        "source": outage.source,
        "description": outage.description,
        "version": outage.version,
        "createdAt": outage.created_at.isoformat(),
        "updatedAt": outage.updated_at.isoformat(),
    }


def impact_case_view(case: ImpactCase) -> dict:
    return {
        "id": case.id,
        "outageId": case.outage_id,
        "patientId": case.patient_id,
        "status": case.status.value,
        "riskLevel": case.risk_level.value,
        "riskPolicyId": case.risk_policy_id,
        "riskPolicyVersion": case.risk_policy_version,
        "effectiveRuntimeMinutes": case.effective_runtime_minutes,
        "runtimeUnknownReason": case.runtime_unknown_reason,
        "responseDueAt": case.response_due_at.isoformat() if case.response_due_at else None,
        "riskCalculatedAt": case.risk_calculated_at.isoformat(),
        "riskReason": case.risk_reason,
        "version": case.version,
        "createdAt": case.created_at.isoformat(),
        "updatedAt": case.updated_at.isoformat(),
    }
