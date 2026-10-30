import type { ComponentType } from 'react';
import type { OnboardingStepProps } from './OnboardingStep';
import { DependenciesStep } from './steps/DependenciesStep';
import { DoneStep } from './steps/DoneStep';
import { MetadataStep } from './steps/MetadataStep';
import { SmartSearchStep } from './steps/SmartSearchStep';

/** Order of the onboarding flow. Add, remove or reorder steps here. */
export const ONBOARDING_STEPS: ComponentType<OnboardingStepProps>[] = [
  DependenciesStep,
  MetadataStep,
  SmartSearchStep,
  DoneStep,
];
