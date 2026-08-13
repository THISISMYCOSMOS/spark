import { parseMockDisasterPdf } from "../disasters/pdf-ingestion.js";
import { buildRuleBasedPatientContext } from "../ai/patient-context-interpreter.js";
import { mapBackendAOutage, mapBackendAPatient } from "../integrations/backend-a-mapper.js";

export class ConnectedDisasterWorkflow {
  constructor({ backendAClient, backendBWorkflow, patientContextInterpreter = null }) {
    if (!backendAClient) throw new TypeError("backendAClient is required");
    if (!backendBWorkflow || typeof backendBWorkflow.prepare !== "function" || typeof backendBWorkflow.executePrepared !== "function") {
      throw new TypeError("backendBWorkflow must provide prepare() and executePrepared()");
    }
    this.backendAClient = backendAClient;
    this.backendBWorkflow = backendBWorkflow;
    this.patientContextInterpreter = patientContextInterpreter;
  }

  async run({ pdfBytes, patientsFromBackendA, now = new Date() }) {
    const document = await parseMockDisasterPdf(pdfBytes);
    const persistedOutage = await this.backendAClient.createDisaster(document);
    const patientSnapshots = await this.#loadPatientSnapshots(document.regionCode, patientsFromBackendA);
    const patientInterpretations = [];
    const patients = [];
    for (const snapshot of patientSnapshots) {
      const interpretation = this.patientContextInterpreter
        ? await this.patientContextInterpreter.interpret(snapshot)
        : { context: buildRuleBasedPatientContext(snapshot), source: "RULE", reviewRequired: false };
      patientInterpretations.push({ patientId: snapshot.id, ...interpretation });
      patients.push(mapBackendAPatient(snapshot, interpretation.context));
    }
    const outage = mapBackendAOutage(persistedOutage, document);
    const prepared = this.backendBWorkflow.prepare({ outage, patients, now });
    const persistence = await this.#persistPreparedCases(outage.id, prepared.created);
    const execution = await this.backendBWorkflow.executePrepared({ outage, patients, impactCases: prepared.created, now });
    const responsePlanPersistence = await this.#persistResponsePlans(execution.responsePlans ?? []);
    const transitions = await this.#persistStartedStatusChecks(prepared.created, execution.statusChecks);
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

  async #loadPatientSnapshots(regionCode, suppliedSnapshots) {
    const snapshots = Array.isArray(suppliedSnapshots)
      ? suppliedSnapshots
      : await this.backendAClient.listPatientsByRegion(regionCode);
    if (!Array.isArray(snapshots)) throw new TypeError("Backend A patient list response must be an array");
    return snapshots;
  }

  async #persistPreparedCases(outageId, impactCases) {
    const persisted = [];
    for (const impactCase of impactCases) {
      // 공급자 접수 전에는 환자 응답 대기 상태가 아니므로 최초 상태는 PREPARE다.
      impactCase.status = "PREPARE";
      const saved = await this.backendAClient.createImpactCase(outageId, impactCase);
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
    const byId = new Map(impactCases.map((impactCase) => [impactCase.id, impactCase]));
    const transitions = [];
    for (const statusCheck of statusChecks) {
      const impactCase = byId.get(statusCheck.impactCaseId);
      if (!impactCase) continue;
      const transitioned = await this.backendAClient.transitionImpactCase({
        caseId: impactCase.id,
        nextStatus: "WAITING_PATIENT",
        version: impactCase.version,
        reason: "문자 공급자 접수 및 상태 확인 등록 완료",
      });
      impactCase.version = transitioned.version;
      transitions.push(transitioned);
    }
    return transitions;
  }
}
