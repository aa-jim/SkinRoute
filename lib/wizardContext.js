"use client";

import { createContext, useContext, useState } from "react";

const WizardContext = createContext(null);

const initialResources = {
  diamonds: "",
  coa: "",
  weeklyPasses: 0,
  passDaysRemaining: "",
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
  const [target, setTarget] = useState(null);
  const [ownedItems, setOwnedItems] = useState({ skins: [], groups: {} });
  const [startFromToday, setStartFromToday] = useState(true);

  const goNext = () =>
    setCurrentStep((s) => {
      if (event.type === "bingo" && s === 2) return 4;
      return Math.min(s + 1, 4);
    });
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
    startFromToday,
    setStartFromToday,
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

export function useWizardOptional() {
  return useContext(WizardContext);
}
