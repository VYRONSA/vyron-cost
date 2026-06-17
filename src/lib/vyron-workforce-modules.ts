/** VYRON CORE workforce intelligence module foundations (Phase 6). */

export type ClockingSnapshot = {
  onTimeRate: number;
  lateArrivals: number;
  missedClockOuts: number;
  avgHoursWorked: number;
  overtimeHours: number;
  absenteeismRate: number;
};

export type FieldOperationsSnapshot = {
  activeFieldStaff: number;
  visitsCompleted: number;
  visitsScheduled: number;
  completionRate: number;
  avgVisitDurationMins: number;
  openJobs: number;
};

export type TravelIntelligenceSnapshot = {
  totalKmMonth: number;
  claimValueMonth: number;
  avgKmPerVisit: number;
  policyBreaches: number;
  routeEfficiencyScore: number;
  idleTravelPct: number;
};

export type WorkforceCostIntelligenceSnapshot = {
  labourCostMonth: number;
  labourCostBudget: number;
  costPerUnit: number;
  overtimeCost: number;
  agencyCost: number;
  costVariancePct: number;
};

export type WorkforceRiskIntelligenceSnapshot = {
  overallRiskScore: number;
  complianceFlags: number;
  safetyIncidents: number;
  contractExpiryRisk: number;
  skillsGapRisk: number;
  predictedLeakage: number;
};

export type WorkforceModuleBundle = {
  clocking: ClockingSnapshot;
  fieldOperations: FieldOperationsSnapshot;
  travelIntelligence: TravelIntelligenceSnapshot;
  costIntelligence: WorkforceCostIntelligenceSnapshot;
  riskIntelligence: WorkforceRiskIntelligenceSnapshot;
};

export function buildWorkforceModuleBundle(overrides?: Partial<WorkforceModuleBundle>): WorkforceModuleBundle {
  const base: WorkforceModuleBundle = {
    clocking: {
      onTimeRate: 91.4,
      lateArrivals: 18,
      missedClockOuts: 6,
      avgHoursWorked: 42.6,
      overtimeHours: 124,
      absenteeismRate: 3.2,
    },
    fieldOperations: {
      activeFieldStaff: 14,
      visitsCompleted: 186,
      visitsScheduled: 204,
      completionRate: 91.2,
      avgVisitDurationMins: 47,
      openJobs: 22,
    },
    travelIntelligence: {
      totalKmMonth: 4820,
      claimValueMonth: 28640,
      avgKmPerVisit: 26,
      policyBreaches: 4,
      routeEfficiencyScore: 78,
      idleTravelPct: 11.5,
    },
    costIntelligence: {
      labourCostMonth: 428500,
      labourCostBudget: 445000,
      costPerUnit: 18.6,
      overtimeCost: 38400,
      agencyCost: 22100,
      costVariancePct: -3.7,
    },
    riskIntelligence: {
      overallRiskScore: 34,
      complianceFlags: 7,
      safetyIncidents: 1,
      contractExpiryRisk: 3,
      skillsGapRisk: 5,
      predictedLeakage: 67200,
    },
  };

  return {
    clocking: { ...base.clocking, ...overrides?.clocking },
    fieldOperations: { ...base.fieldOperations, ...overrides?.fieldOperations },
    travelIntelligence: { ...base.travelIntelligence, ...overrides?.travelIntelligence },
    costIntelligence: { ...base.costIntelligence, ...overrides?.costIntelligence },
    riskIntelligence: { ...base.riskIntelligence, ...overrides?.riskIntelligence },
  };
}
