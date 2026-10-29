import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import { KeepRule } from './duplicateTypes';
import { KEEP_RULE_OPTIONS } from './keepRule';
import { useDuplicatesStore } from './useDuplicatesStore';

type Props = {
  setId: string;
};

/**
 * Per-set "Keep" picker mirroring the sidebar keep-rule selector. Choosing a
 * rule re-selects which frame to keep for this set only; "Keep all frames"
 * marks every frame to keep.
 */
export function SetKeepSelector({ setId }: Props) {
  const applyRuleToSet = useDuplicatesStore((state) => state.applyRuleToSet);
  const keepAllFrames = useDuplicatesStore((state) => state.keepAllFrames);
  const [open, setOpen] = useState(false);

  function handleRule(rule: KeepRule) {
    setOpen(false);
    applyRuleToSet(setId, rule);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="dup-keeprule__trigger dup-keeprule__trigger--solo">
          <span className="dup-keeprule__label">Keep</span>
          <IconChevronDown size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        {KEEP_RULE_OPTIONS.filter((option) => option.value !== 'manual').map((option) => (
          <button
            key={option.value}
            type="button"
            className="dup-keeprule__option"
            onClick={() => handleRule(option.value)}
          >
            <span>{option.label}</span>
          </button>
        ))}
        <div className="dup-keeprule__sep" />
        <button
          type="button"
          className="dup-keeprule__option"
          onClick={() => {
            setOpen(false);
            keepAllFrames(setId);
          }}
        >
          <span>Keep all frames</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
