import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type PhoneKind = "휴대폰" | "집" | "직장";

export type PhoneEntry = {
  id: string;
  kind: PhoneKind;
  number: string;
};

export type MedicalDevice = {
  id: string;
  name: string;
  watt: number;
};

export type GuardianContact = {
  id: string;
  name: string;
  phone: string;
};

export const DISEASE_OPTIONS = [
  { id: "copd", label: "만성폐쇄성폐질환" },
  { id: "als", label: "루게릭병" },
  { id: "sci", label: "척수손상" },
  { id: "heart", label: "심부전" },
  { id: "brain", label: "뇌병변" },
];

export const DEVICE_OPTIONS: MedicalDevice[] = [
  { id: "oxygen", name: "산소발생기", watt: 90 },
  { id: "ventilator", name: "인공호흡기", watt: 60 },
  { id: "suction", name: "가래 흡인기", watt: 40 },
  { id: "bed", name: "전동침대", watt: 60 },
  { id: "wheelchair", name: "전동휠체어 충전", watt: 30 },
];

export type GuardianJoinData = {
  /** 1단계: 보호자 정보 */
  guardianName: string;
  guardianPhones: PhoneEntry[];
  /** 2단계: 환자 정보 */
  patientName: string;
  patientAge: string;
  patientPhone: string;
  addressLine1: string;
  addressLine2: string;
  /** 3단계: 건강·기계 정보 */
  selectedDiseases: string[];
  customDisease: string;
  selectedMachines: string[];
  /** 4단계: 연락처 */
  otherGuardians: GuardianContact[];
  institutions: GuardianContact[];
};

export type GuardianContextValue = GuardianJoinData & {
  /** 환자에게 알려줄 여섯 자리 코드 */
  patientCode: string;
  setPatientCode: (code: string) => void;
  regenerateCode: () => void;
  autonomySeconds: number;
  autonomyText: string;
  totalWatts: number;
  setField: <K extends keyof GuardianJoinData>(key: K, value: GuardianJoinData[K]) => void;
  addPhone: () => string;
  updatePhone: (id: string, patch: Partial<Omit<PhoneEntry, "id">>) => void;
  removePhone: (id: string) => void;
  toggleDisease: (id: string) => void;
  setCustomDisease: (value: string) => void;
  toggleMachine: (id: string) => void;
  addOtherGuardian: () => string;
  updateOtherGuardian: (id: string, patch: Partial<Omit<GuardianContact, "id">>) => void;
  removeOtherGuardian: (id: string) => void;
  addInstitution: () => string;
  updateInstitution: (id: string, patch: Partial<Omit<GuardianContact, "id">>) => void;
  removeInstitution: (id: string) => void;
  reset: () => void;
};

const INITIAL: GuardianJoinData = {
  guardianName: "김수현",
  guardianPhones: [{ id: "phone-1", kind: "휴대폰", number: "010-2345-6789" }],
  patientName: "김영자",
  patientAge: "78",
  patientPhone: "010-8765-4321",
  addressLine1: "구로구 구로동 현대아파트",
  addressLine2: "101동 902호",
  selectedDiseases: ["copd"],
  customDisease: "",
  selectedMachines: ["oxygen", "bed"],
  otherGuardians: [{ id: "guardian-1", name: "이정호", phone: "010-3456-7890" }],
  institutions: [{ id: "inst-1", name: "구로1동 주민센터", phone: "02-860-3000" }],
};

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const GuardianContext = createContext<GuardianContextValue | null>(null);

let phoneSeq = 1;
const nextPhoneId = () => `phone-${++phoneSeq}-${Date.now()}`;

function formatAutonomyText(totalWatts: number): string {
  if (totalWatts <= 0) return "기계를 골라주세요";
  const totalMinutes = Math.floor((500 / totalWatts) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

export function GuardianProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<GuardianJoinData>(INITIAL);
  const [patientCode, setPatientCode] = useState<string>(() => randomCode());

  const regenerateCode = useCallback(() => setPatientCode(randomCode()), []);

  const setField = useCallback<GuardianContextValue["setField"]>(
    (key, value) => setData((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const addPhone = useCallback(() => {
    const id = nextPhoneId();
    setData((prev) => ({
      ...prev,
      guardianPhones: [...prev.guardianPhones, { id, kind: "휴대폰", number: "" }],
    }));
    return id;
  }, []);

  const updatePhone = useCallback<GuardianContextValue["updatePhone"]>(
    (id, patch) =>
      setData((prev) => ({
        ...prev,
        guardianPhones: prev.guardianPhones.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),
    [],
  );

  const removePhone = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      guardianPhones: prev.guardianPhones.filter((p) => p.id !== id),
    }));
  }, []);

  const toggleDisease = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      selectedDiseases: prev.selectedDiseases.includes(id)
        ? prev.selectedDiseases.filter((d) => d !== id)
        : [...prev.selectedDiseases, id],
    }));
  }, []);

  const setCustomDisease = useCallback((value: string) => {
    setData((prev) => ({ ...prev, customDisease: value }));
  }, []);

  const toggleMachine = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      selectedMachines: prev.selectedMachines.includes(id)
        ? prev.selectedMachines.filter((m) => m !== id)
        : [...prev.selectedMachines, id],
    }));
  }, []);

  const reset = useCallback(() => setData(INITIAL), []);

  const addOtherGuardian = useCallback(() => {
    const id = `guardian-${++phoneSeq}-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      otherGuardians: [...prev.otherGuardians, { id, name: "", phone: "" }],
    }));
    return id;
  }, []);

  const updateOtherGuardian = useCallback<GuardianContextValue["updateOtherGuardian"]>(
    (id, patch) =>
      setData((prev) => ({
        ...prev,
        otherGuardians: prev.otherGuardians.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      })),
    [],
  );

  const removeOtherGuardian = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      otherGuardians: prev.otherGuardians.filter((g) => g.id !== id),
    }));
  }, []);

  const addInstitution = useCallback(() => {
    const id = `inst-${++phoneSeq}-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      institutions: [...prev.institutions, { id, name: "", phone: "" }],
    }));
    return id;
  }, []);

  const updateInstitution = useCallback<GuardianContextValue["updateInstitution"]>(
    (id, patch) =>
      setData((prev) => ({
        ...prev,
        institutions: prev.institutions.map((inst) =>
          inst.id === id ? { ...inst, ...patch } : inst,
        ),
      })),
    [],
  );

  const removeInstitution = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      institutions: prev.institutions.filter((inst) => inst.id !== id),
    }));
  }, []);

  const totalWatts = useMemo(
    () =>
      data.selectedMachines.reduce((sum, id) => {
        const device = DEVICE_OPTIONS.find((d) => d.id === id);
        return sum + (device?.watt ?? 0);
      }, 0),
    [data.selectedMachines],
  );

  const autonomySeconds = useMemo(() => {
    if (totalWatts <= 0) return 0;
    return Math.floor((500 / totalWatts) * 3600);
  }, [totalWatts]);

  const autonomyText = useMemo(() => formatAutonomyText(totalWatts), [totalWatts]);

  const value = useMemo<GuardianContextValue>(
    () => ({
      ...data,
      patientCode,
      setPatientCode,
      regenerateCode,
      autonomySeconds,
      autonomyText,
      totalWatts,
      setField,
      addPhone,
      updatePhone,
      removePhone,
      toggleDisease,
      setCustomDisease,
      toggleMachine,
      addOtherGuardian,
      updateOtherGuardian,
      removeOtherGuardian,
      addInstitution,
      updateInstitution,
      removeInstitution,
      reset,
    }),
    [
      data,
      patientCode,
      setPatientCode,
      regenerateCode,
      autonomySeconds,
      autonomyText,
      totalWatts,
      setField,
      addPhone,
      updatePhone,
      removePhone,
      toggleDisease,
      setCustomDisease,
      toggleMachine,
      addOtherGuardian,
      updateOtherGuardian,
      removeOtherGuardian,
      addInstitution,
      updateInstitution,
      removeInstitution,
      reset,
    ],
  );

  return <GuardianContext.Provider value={value}>{children}</GuardianContext.Provider>;
}

export function useGuardian() {
  const ctx = useContext(GuardianContext);
  if (!ctx) throw new Error("useGuardian must be used within GuardianProvider");
  return ctx;
}
