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
    if (!Array.isArray(patientsFromBackendA)) throw new TypeError("patientsFromBackendA must be supplied by Backend A");
    const document = await parseMockDisasterPdf(pdfBytes);
    const persistedOutage = await this.backendAClient.createDisaster(document);
    const patientInterpretations = [];
    const patients = [];
    for (const snapshot of patientsFromBackendA) {
      const interpretation = this.patientContextInterpreter
        ? await this.patientContextInterpreter.interpret(snapshot)
        : { context: buildRuleBasedPatientContext(snapshot), source: "RULE", reviewRequired: false };
      patientInterpretations.push({ patientId: snapshot.id, ...interpretation });
      patients.push(mapBackendAPatient(snapshot, interpretation.context));
    }
    const outage = mapBackendAOutage(persistedOutage, document);
    const prepared = this.backendBWorkflow.prepare({ outage, patients, now });
    const persistence = [];
    for (const impactCase of prepared.created) {
      impactCase.status = "PREPARE";
      const saved = await this.backendAClient.createImpactCase(outage.id, impactCase);
      impactCase.id = saved.id;
      impactCase.version = saved.version;
      impactCase.updatedAt = saved.updatedAt;
      persistence.push(saved);
    }
    const execution = await this.backendBWorkflow.executePrepared({ outage, patients, impactCases: prepared.created, now });
    const transitions = [];
    for (const statusCheck of execution.statusChecks) {
      const impactCase = prepared.created.find((item) => item.id === statusCheck.impactCaseId);
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
    return {
      document,
      outage,
      patients,
      patientInterpretations,
      created: prepared.created,
      skipped: prepared.skipped,
      persistence,
      transitions,
      ...execution,
    };
  }
}
