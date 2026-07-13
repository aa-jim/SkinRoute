"use client";

import { createContext, useContext, useState } from "react";

const WizardContext = createContext(null);

const initialResources = {
  diamonds: "",
  coa: "",
  weeklyPasses: 0,
  firstPassDate: "",
  fpClaimed: {
    fp_50: false,
    fp_150: false,
    fp_250: false,
    fp_500: false,
  },
};

export function WizardProvider({ event, children }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [resources, setResources] = useState(initialResources);
  // Populated in Part 3 (target skin) and Part 4 (prize pool checklist)
  const [target, setTarget] = useState(null);
  const [ownedItems, setOwnedItems] = useState({});

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, 4));
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const updateResources = (patch) =>
    setResources((prev) => ({ ...prev, ...patch }));

  const toggleFpClaimed = (id) =>
    setResources((prev) => ({
      ...prev,
      fpClaimed: { ...prev.fpClaimed, [id]: !prev.fpClaimed[id] },
    }));

  const value = {
    event,
    currentStep,
    setCurrentStep,
    goNext,
    goBack,
    resources,
    updateResources,
    toggleFpClaimed,
    target,
    setTarget,
    ownedItems,
    setOwnedItems,
  };

  return (
    <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
  );
}

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside WizardProvider");
  return ctx;
}
