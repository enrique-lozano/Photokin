import { WindowControls } from '@/components/app-shell/WindowControls';
import '@/components/toolbar/toolbar.css';
import { AppToaster } from '@/components/ui/toaster';
import { AppDataKey, AppDataService } from '@/db/api/services/appData.service';
import { AppRoutes } from '@/router';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './onboarding.css';
import { OnboardingStepper } from './OnboardingStepper';
import { ONBOARDING_STEPS } from './onboardingSteps';

export function Onboarding() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const Step = ONBOARDING_STEPS[stepIndex];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  const finish = async () => {
    await AppDataService.set(AppDataKey.OnboardingCompleted, 'true');
    navigate(AppRoutes.home, { replace: true });
  };

  const goNext = () => {
    if (isLastStep) void finish();
    else setStepIndex(stepIndex + 1);
  };

  return (
    <div className="onboarding">
      <AppToaster />
      <div className="onboarding__dragbar" data-tauri-drag-region>
        <OnboardingStepper count={ONBOARDING_STEPS.length} current={stepIndex} />
        <WindowControls className="onboarding__window-controls" />
      </div>
      <Step goNext={goNext} goBack={stepIndex > 0 ? () => setStepIndex(stepIndex - 1) : undefined} />
    </div>
  );
}
