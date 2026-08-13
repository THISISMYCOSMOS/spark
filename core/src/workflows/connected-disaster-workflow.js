import { parseMockDisasterPdf } from "../disasters/pdf-ingestion.js";
import { buildRuleBasedPatientContext } from "../ai/patient-context-interpreter.js";
import {
  mapBackendAOutage,
  mapBackendAPatient,
} from "../integrations/backend-a-mapper.js";

export class ConnectedDisasterWorkflow {
  constructor({
    backendAClient,
    backendBWorkflow,
    patientContextInterpreter = null,
  }) {
    if (!backendAClient) throw new TypeError("backendAClient is required");
    if (
      !backendBWorkflow ||
      typeof backendBWorkflow.prepare !== "function" ||
      typeof backendBWorkflow.executePrepared !== "function"
    ) {
      throw new TypeError(
        "backendBWorkflow must provide prepare() and executePrepared()",
      );
    }
    this.backendAClient = backendAClient;
    this.backendBWorkflow = backendBWorkflow;
    this.patientContextInterpreter = patientContextInterpreter;
  }

  async run({ pdfBytes, patientsFromBackendA, now = new Date() }) {
    const document = await parseMockDisasterPdf(pdfBytes);
    return this.runDocument({ document, patientsFromBackendA, now });
  }

  async runDocument({ document, patientsFromBackendA, now = new Date() }) {
    if (!document || typeof document !== "object")
      throw new TypeError("document is required");
    const persistedOutage = await this.backendAClient.createDisaster(document);
    const patientSnapshots = await this.#loadPatientSnapshots(
      document.regionCode,
      patientsFromBackendA,
    );
    const patientInterpretations = [];
    const patients = [];
    for (const snapshot of patientSnapshots) {
      const interpretation = this.patientContextInterpreter
        ? await this.patientContextInterpreter.interpret(snapshot)
        : {
            context: buildRuleBasedPatientContext(snapshot),
            source: "RULE",
            reviewRequired: false,
          };
      patientInterpretations.push({
        patientId: snapshot.id,
        ...interpretation,
      });
      patients.push(mapBackendAPatient(snapshot, interpretation.context));
    }
    const outage = mapBackendAOutage(persistedOutage, document);
    const prepared = this.backendBWorkflow.prepare({ outage, patients, now });
    const persistence = await this.#persistPreparedCases(
      outage.id,
      prepared.created,
    );
    const execution = await this.backendBWorkflow.executePrepared({
      outage,
      patients,
      impactCases: prepared.created,
      now,
    });
    const responsePlanPersistence = await this.#persistResponsePlans(
      execution.responsePlans ?? [],
    );
    const transitions = await this.#persistStartedStatusChecks(
      prepared.created,
      execution.statusChecks,
    );
    return {
      document,
      outage,
      patients,
      patientInterpretations,
      created: prepared.created,
      skipped: prepared.skipped,
      persistence,
      responsePlanPersistence,
      transitions,
      ...execution,
    };
  }

  async reportRecovery({
    outageId,
    recoveredAt = new Date(),
    source = "관리자 복구 버튼",
  }) {
    const currentOutage = await this.backendAClient.getOutage(outageId);
    if (currentOutage.status !== "ACTIVE")
      throw new TypeError("Only an ACTIVE outage can report recovery");
    const caseSnapshots = (
      await this.backendAClient.listImpactCases(outageId)
    ).filter((impactCase) => impactCase.status !== "CLOSED");
    const patientIds = new Set(
      caseSnapshots.map((impactCase) => impactCase.patientId),
    );
    const snapshotsById = new Map();
    for (const regionCode of currentOutage.regionCodes ?? []) {
      for (const snapshot of await this.backendAClient.listPatientsByRegion(
        regionCode,
      )) {
        if (patientIds.has(snapshot.id))
          snapshotsById.set(snapshot.id, snapshot);
      }
    }
    if (snapshotsById.size !== patientIds.size)
      throw new TypeError("Recovery patient snapshots are incomplete");

    const persistedOutage = await this.backendAClient.reportRegionalRecovery({
      outageId,
      version: currentOutage.version,
      recoveredAt,
      source,
    });
    const document = {
      disasterType: currentOutage.disasterType,
      severity: currentOutage.severity,
      regionCode: currentOutage.regionCodes?.[0],
      officialGuidanceCodes: currentOutage.officialGuidanceCodes ?? [],
    };
    const outage = mapBackendAOutage(persistedOutage, document);
    const patients = [...snapshotsById.values()].map((snapshot) =>
      mapBackendAPatient(snapshot, buildRuleBasedPatientContext(snapshot)),
    );
    const impactCases = caseSnapshots.map((impactCase) => ({
      ...impactCase,
      mode: currentOutage.mode,
      recoveryEscalationRound: 0,
    }));
    const recovery = await this.backendBWorkflow.reportRecovery({
      outage,
      impactCases,
      patients,
      now: new Date(recoveredAt),
    });
    const transitions = await this.#persistStartedStatusChecks(
      impactCases,
      recovery.statusChecks,
    );
    return { outage, impactCases, patients, transitions, ...recovery };
  }

  async #loadPatientSnapshots(regionCode, suppliedSnapshots) {
    const snapshots = Array.isArray(suppliedSnapshots)
      ? suppliedSnapshots
      : await this.backendAClient.listPatientsByRegion(regionCode);
    if (!Array.isArray(snapshots))
      throw new TypeError("Backend A patient list response must be an array");
    return snapshots;
  }

  async #persistPreparedCases(outageId, impactCases) {
    const persisted = [];
    for (const impactCase of impactCases) {
      // 공급자 접수 전에는 환자 응답 대기 상태가 아니므로 최초 상태는 PREPARE다.
      impactCase.status = "PREPARE";
      const saved = await this.backendAClient.createImpactCase(
        outageId,
        impactCase,
      );
      impactCase.id = saved.id;
      impactCase.version = saved.version;
      impactCase.updatedAt = saved.updatedAt;
      persisted.push(saved);
    }
    return persisted;
  }

  async #persistResponsePlans(responsePlans) {
    const persisted = [];
    for (const responsePlan of responsePlans) {
      persisted.push(await this.backendAClient.saveResponsePlan(responsePlan));
    }
    return persisted;
  }

  async #persistStartedStatusChecks(impactCases, statusChecks) {
    const byId = new Map(
      impactCases.map((impactCase) => [impactCase.id, impactCase]),
    );
    const transitions = [];
    for (const statusCheck of statusChecks) {
      const impactCase = byId.get(statusCheck.impactCaseId);
      if (!impactCase) continue;
      const nextStatus =
        statusCheck.purpose === "RECOVERY_CONFIRMATION" ||
        impactCase.status === "RECOVERY_CHECK"
          ? "RECOVERY_CHECK"
          : "WAITING_PATIENT";
      const transitioned = await this.backendAClient.transitionImpactCase({
        caseId: impactCase.id,
        nextStatus,
        version: impactCase.version,
        reason:
          nextStatus === "RECOVERY_CHECK"
            ? "복구 확인 문자 공급자 접수 및 상태 확인 등록 완료"
            : "문자 공급자 접수 및 상태 확인 등록 완료",
      });
      impactCase.version = transitioned.version;
      transitions.push(transitioned);
    }
    return transitions;
  }
}
