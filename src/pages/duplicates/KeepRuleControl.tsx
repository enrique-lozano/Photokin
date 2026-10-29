import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import { KEEP_RULE_OPTIONS } from './keepRule';
import { KeepRule } from './duplicateTypes';
import { useDuplicatesStore } from './useDuplicatesStore';

export function KeepRuleControl() {
  const keepRule = useDuplicatesStore((state) => state.keepRule);
  const manualEdited = useDuplicatesStore((state) => state.manualEdited);
  const manualOverrideCount = useDuplicatesStore((state) => state.manualOverrideCount);
  const setKeepRule = useDuplicatesStore((state) => state.setKeepRule);

  const [open, setOpen] = useState(false);
  const [pendingRule, setPendingRule] = useState<KeepRule | null>(null);

  const label = manualEdited
    ? 'Manual (edited)'
    : (KEEP_RULE_OPTIONS.find((option) => option.value === keepRule)?.label ?? 'Manual');

  function handleSelect(rule: KeepRule) {
    setOpen(false);
    // Re-applying a rule discards manual edits — confirm when several exist.
    if (rule !== 'manual' && manualEdited && manualOverrideCount > 1) {
      setPendingRule(rule);
      return;
    }
    setKeepRule(rule);
  }

  return (
    <>
      <div className="dup-keeprule">
        <span className="dup-keeprule__caption">Keep rule</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="dup-keeprule__trigger">
              {manualEdited && <span className="dup-keeprule__dot" aria-hidden="true" />}
              <span className="dup-keeprule__label">{label}</span>
              <IconChevronDown size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1">
            {KEEP_RULE_OPTIONS.map((option) => {
              const selected = !manualEdited && option.value === keepRule;
              return (
                <button
                  key={option.value}
                  type="button"
                  className="dup-keeprule__option"
                  data-selected={selected}
                  onClick={() => handleSelect(option.value)}
                >
                  <span>{option.label}</span>
                  {selected && <IconCheck size={14} className="text-primary" />}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>

      <AlertDialog open={pendingRule !== null} onOpenChange={(value) => !value && setPendingRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-apply keep rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Re-applying resets {manualOverrideCount} manual change
              {manualOverrideCount === 1 ? '' : 's'} and re-selects the kept photo in every set.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingRule(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRule) setKeepRule(pendingRule);
                setPendingRule(null);
              }}
            >
              Re-apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
