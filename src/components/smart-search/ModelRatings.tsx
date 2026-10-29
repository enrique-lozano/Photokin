import { IconBolt, IconTarget } from '@tabler/icons-react';
import { ClipModel } from '@/media/smartSearch/models';
import './smartSearchModels.css';

export function ModelRatings({ model, showLabels = false }: { model: ClipModel; showLabels?: boolean }) {
  return (
    <div className="model-ratings">
      {[
        { label: 'Indexing speed', value: model.speed, Icon: IconBolt },
        { label: 'Search accuracy', value: model.accuracy, Icon: IconTarget },
      ].map(({ label, value, Icon }) => (
        <span
          key={label}
          className="model-ratings__row"
          role="img"
          aria-label={`${label}: ${value} out of 4 (relative estimate)`}
          title={`${label}: ${value}/4. Relative estimate, not a benchmark.`}
        >
          <Icon size={13} aria-hidden="true" />
          {showLabels && (
            <span className="text-xs" aria-hidden="true">
              {label}
            </span>
          )}
          <span className="model-ratings__bars" aria-hidden="true">
            {[1, 2, 3, 4].map((step) => (
              <span key={step} data-filled={step <= value} />
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}
