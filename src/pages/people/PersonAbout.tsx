import { Button } from '@/components/ui/button';
import { PersonSex } from '@/db/models/TagDTO';
import {
  IconCake,
  IconGenderBigender,
  IconGenderFemale,
  IconGenderMale,
  IconGrave2,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import { derivePersonAge, formatPersonDate, PersonBio, SEX_LABEL } from './personBio';

/** A small round sex glyph, matching the stored value. */
function SexIcon({ sex, size = 15 }: { sex: PersonSex; size?: number }) {
  if (sex === PersonSex.Male) return <IconGenderMale size={size} className="person-about__sex--male" />;
  if (sex === PersonSex.Female) return <IconGenderFemale size={size} className="person-about__sex--female" />;
  return <IconGenderBigender size={size} className="person-about__sex--other" />;
}

/**
 * Compact metadata shown directly below a person's hero. Unknown fields render
 * nothing and age is derived rather than stored. Long descriptions use a real
 * overflow measurement so “More” only appears when the text is actually clamped.
 */
export function PersonAbout({ personId, bio }: { personId: string; bio: PersonBio }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  const facts: JSX.Element[] = [];

  if (bio.sex) {
    facts.push(
      <span className="person-about__fact" key="sex">
        <SexIcon sex={bio.sex} />
        {SEX_LABEL[bio.sex]}
      </span>,
    );
  }

  const birth = formatPersonDate(bio.dateBirth);
  if (birth) {
    facts.push(
      <span className="person-about__fact" key="born">
        <IconCake size={15} />
        {birth}
      </span>,
    );
  }

  const death = formatPersonDate(bio.dateDead);
  if (death) {
    facts.push(
      <span className="person-about__fact" key="died">
        <IconGrave2 size={15} />
        {death}
      </span>,
    );
  }

  const derived = derivePersonAge(bio.dateBirth, bio.dateDead);
  if (derived) {
    facts.push(
      <span className="person-about__fact text-muted-foreground" key="age">
        {derived.isDead ? `Died aged ${derived.age}` : `Aged ${derived.age}`}
      </span>,
    );
  }

  const description = bio.description?.trim();

  useEffect(() => {
    setExpanded(false);
    setCanExpand(false);
  }, [personId, description]);

  useLayoutEffect(() => {
    const element = descriptionRef.current;
    if (!element || !description || expanded) return;

    const update = () => setCanExpand(element.scrollHeight > element.clientHeight + 1);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description, expanded]);

  // Nothing known → render nothing at all (no empty strip).
  if (facts.length === 0 && !description) return null;

  return (
    <section className={clsx('person-about', expanded && 'person-about--expanded')}>
      {facts.length > 0 && (
        <div className="person-about__ident">
          {facts.map((fact, index) => (
            <Fragment key={fact.key}>
              {index > 0 && <span className="text-muted-foreground">·</span>}
              {fact}
            </Fragment>
          ))}
        </div>
      )}

      {description && (
        <div className="person-about__description">
          <p
            ref={descriptionRef}
            className={clsx('person-about__bio', expanded && 'person-about__bio--expanded')}
          >
            {description}
            {expanded && (
              <>
                {' '}
                <Button
                  type="button"
                  variant="link"
                  className="inline h-auto p-0 align-baseline text-sm font-normal"
                  aria-expanded={expanded}
                  onClick={() => setExpanded(false)}
                >
                  Less
                </Button>
              </>
            )}
          </p>
          {!expanded && (canExpand || expanded) && (
            <Button
              type="button"
              variant="link"
              className="h-auto shrink-0 p-0 text-sm font-normal"
              aria-expanded={expanded}
              onClick={() => setExpanded(true)}
            >
              More
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
